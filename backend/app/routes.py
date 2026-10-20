from datetime import UTC, datetime, timedelta
import logging

from typing import Annotated

from fastapi import APIRouter, File, Form, Header, HTTPException, Path, Request, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlalchemy import select, text

from .models import Share
from .schemas import ActionResponse, CreateShareResponse, ShareInfo
from .security import random_token, token_hash, valid_token


logger = logging.getLogger("vaultdrop")
router = APIRouter(prefix="/api")
ShareId = Annotated[
    str,
    Path(min_length=43, max_length=43, pattern=r"^[A-Za-z0-9_-]{43}$"),
]


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _remaining(share: Share) -> int | None:
    if share.max_downloads is None:
        return None
    return max(share.max_downloads - share.download_count, 0)


def _info(share: Share) -> ShareInfo:
    return ShareInfo(
        share_id=share.share_id,
        encrypted_size=share.encrypted_size,
        created_at=share.created_at.replace(tzinfo=UTC),
        expires_at=share.expires_at.replace(tzinfo=UTC),
        max_downloads=share.max_downloads,
        download_count=share.download_count,
        downloads_remaining=_remaining(share),
        one_time=share.one_time,
        consumed=share.consumed,
        revoked=share.revoked,
        password_protected=share.password_protected,
    )


def _client_key(request: Request, scope: str, share_id: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{scope}:{host}:{share_id}"


def _rate_limit(request: Request, scope: str, share_id: str, management: bool = False) -> None:
    settings = request.app.state.settings
    limit = settings.management_rate_limit if management else settings.access_rate_limit
    if not request.app.state.rate_limiter.allow(
        _client_key(request, scope, share_id), limit, settings.rate_window_seconds
    ):
        logger.warning("rate limit triggered scope=%s share=%s", scope, share_id)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests")


def _get_share(session, share_id: str) -> Share:
    share = session.scalar(select(Share).where(Share.share_id == share_id))
    if not share:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Share not found")
    return share


def _availability(share: Share, storage) -> None:
    if share.revoked:
        raise HTTPException(status.HTTP_410_GONE, "This share has been revoked")
    if share.expires_at <= _now():
        raise HTTPException(status.HTTP_410_GONE, "This share has expired")
    if share.consumed or (share.max_downloads is not None and share.download_count >= share.max_downloads):
        raise HTTPException(status.HTTP_410_GONE, "Download limit reached")
    if not storage.path(share.storage_name).is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File unavailable")


def _management_share(request: Request, share_id: str, token: str | None) -> Share:
    _rate_limit(request, "manage", share_id, management=True)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Management token required")
    with request.app.state.SessionLocal() as session:
        share = _get_share(session, share_id)
        if not valid_token(token, share.management_token_hash):
            logger.warning("management token denied share=%s", share_id)
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid management token")
        session.expunge(share)
        return share


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/shares", response_model=CreateShareResponse, status_code=status.HTTP_201_CREATED)
async def create_share(
    request: Request,
    encrypted_file: UploadFile = File(...),
    expires_in_seconds: int = Form(..., ge=60, le=2_592_000),
    max_downloads: int | None = Form(None, ge=1, le=10_000),
    one_time: bool = Form(False),
    password_protected: bool = Form(False),
):
    settings = request.app.state.settings
    storage = request.app.state.storage
    share_id = random_token()
    management_token = random_token()
    storage_name = storage.new_name()
    final_path = storage.path(storage_name)
    temporary_path = final_path.with_suffix(".upload")
    size = 0

    try:
        with temporary_path.open("xb") as target:
            while chunk := await encrypted_file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Encrypted file exceeds size limit")
                target.write(chunk)
        if size == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty uploads are not allowed")
        temporary_path.replace(final_path)

        now = _now()
        share = Share(
            share_id=share_id,
            storage_name=storage_name,
            encrypted_size=size,
            created_at=now,
            expires_at=now + timedelta(seconds=expires_in_seconds),
            max_downloads=1 if one_time else max_downloads,
            one_time=one_time,
            password_protected=password_protected,
            management_token_hash=token_hash(management_token),
        )
        with request.app.state.SessionLocal() as session:
            session.add(share)
            session.commit()
            session.refresh(share)
        logger.info("share created share=%s encrypted_size=%d", share_id, size)
        return CreateShareResponse(**_info(share).model_dump(), management_token=management_token)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        if final_path.exists():
            storage.delete(storage_name)
        raise
    finally:
        await encrypted_file.close()


@router.get("/shares/{share_id}", response_model=ShareInfo)
def get_share(request: Request, share_id: ShareId):
    _rate_limit(request, "share", share_id)
    with request.app.state.SessionLocal() as session:
        share = _get_share(session, share_id)
        _availability(share, request.app.state.storage)
        return _info(share)


@router.get("/shares/{share_id}/download")
def download_share(request: Request, share_id: ShareId):
    _rate_limit(request, "download", share_id)
    storage = request.app.state.storage
    with request.app.state.SessionLocal() as session:
        session.execute(text("BEGIN IMMEDIATE"))
        share = _get_share(session, share_id)
        _availability(share, storage)
        share.download_count += 1
        if share.one_time:
            share.consumed = True
        storage_name = share.storage_name
        one_time = share.one_time
        session.commit()

    file_path = storage.path(storage_name)
    logger.info("download allowed share=%s", share_id)
    headers = {
        "Content-Disposition": 'attachment; filename="vaultdrop-encrypted.bin"',
        "Cache-Control": "no-store",
    }
    if one_time:
        try:
            payload = file_path.read_bytes()
        except FileNotFoundError:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "File unavailable")
        file_path.unlink(missing_ok=True)
        return Response(payload, media_type="application/octet-stream", headers=headers)
    return FileResponse(file_path, media_type="application/octet-stream", headers=headers)


@router.get("/shares/{share_id}/manage", response_model=ShareInfo)
def manage_status(
    request: Request, share_id: ShareId, x_management_token: str | None = Header(None)
):
    return _info(_management_share(request, share_id, x_management_token))


@router.post("/shares/{share_id}/revoke", response_model=ActionResponse)
def revoke_share(
    request: Request, share_id: ShareId, x_management_token: str | None = Header(None)
):
    verified = _management_share(request, share_id, x_management_token)
    with request.app.state.SessionLocal() as session:
        share = _get_share(session, verified.share_id)
        share.revoked = True
        session.commit()
    logger.info("share revoked share=%s", share_id)
    return ActionResponse(status="revoked")


@router.delete("/shares/{share_id}", response_model=ActionResponse)
def delete_share(
    request: Request, share_id: ShareId, x_management_token: str | None = Header(None)
):
    verified = _management_share(request, share_id, x_management_token)
    with request.app.state.SessionLocal() as session:
        share = _get_share(session, verified.share_id)
        storage_name = share.storage_name
        session.delete(share)
        session.commit()
    request.app.state.storage.delete(storage_name)
    logger.info("share deleted share=%s", share_id)
    return ActionResponse(status="deleted")
