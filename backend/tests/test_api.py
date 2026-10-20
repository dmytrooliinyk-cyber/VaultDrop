from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select

from app.config import Settings
from app.database import Base
from app.main import create_app
from app.models import Share


pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    return "asyncio"


def make_app(tmp_path: Path, *, max_upload_mb: int = 1, access_rate_limit: int = 100):
    return create_app(Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        storage_dir=str(tmp_path / "storage"),
        frontend_origin="http://localhost:5173",
        max_upload_mb=max_upload_mb,
        cleanup_interval_seconds=3600,
        access_rate_limit=access_rate_limit,
        management_rate_limit=100,
        rate_window_seconds=60,
    ))


@asynccontextmanager
async def client_for(app):
    Base.metadata.create_all(app.state.engine)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.state.engine.dispose()


async def create_share(client: httpx.AsyncClient, **overrides):
    data = {"expires_in_seconds": "3600", "one_time": "false", "password_protected": "false"}
    data.update(overrides.pop("data", {}))
    content = overrides.pop("content", b"authenticated-encrypted-bytes")
    return await client.post(
        "/api/shares", data=data,
        files={"encrypted_file": ("cipher.bin", content, "application/octet-stream")},
        **overrides,
    )


async def test_create_share_hides_filename_and_key(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        response = await create_share(client)
        assert response.status_code == 201
        body = response.json()
        assert len(body["share_id"]) >= 40
        assert body["management_token"]
        with app.state.SessionLocal() as session:
            share = session.scalar(select(Share))
            assert "cipher" not in share.storage_name
            assert not hasattr(share, "encryption_key")


async def test_download_limit_is_enforced(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        created = (await create_share(client, data={"max_downloads": "2"})).json()
        url = f"/api/shares/{created['share_id']}/download"
        assert (await client.get(url)).status_code == 200
        assert (await client.get(url)).status_code == 200
        denied = await client.get(url)
        assert denied.status_code == 410
        assert denied.json()["detail"] == "Download limit reached"


async def test_one_time_download_deletes_ciphertext(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        created = (await create_share(client, data={"one_time": "true"})).json()
        url = f"/api/shares/{created['share_id']}/download"
        assert (await client.get(url)).content == b"authenticated-encrypted-bytes"
        assert (await client.get(url)).status_code == 410
        assert list((tmp_path / "storage").glob("*.bin")) == []


async def test_revoke_requires_valid_management_token(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        created = (await create_share(client)).json()
        url = f"/api/shares/{created['share_id']}/revoke"
        assert (await client.post(url, headers={"X-Management-Token": "wrong"})).status_code == 403
        response = await client.post(url, headers={"X-Management-Token": created["management_token"]})
        assert response.status_code == 200
        assert (await client.get(f"/api/shares/{created['share_id']}")).status_code == 410


async def test_delete_removes_record_and_file(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        created = (await create_share(client)).json()
        response = await client.delete(f"/api/shares/{created['share_id']}", headers={"X-Management-Token": created["management_token"]})
        assert response.json() == {"status": "deleted"}
        assert (await client.get(f"/api/shares/{created['share_id']}")).status_code == 404
        assert list((tmp_path / "storage").glob("*.bin")) == []


async def test_expired_share_returns_gone(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        created = (await create_share(client)).json()
        with app.state.SessionLocal() as session:
            share = session.scalar(select(Share).where(Share.share_id == created["share_id"]))
            share.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
            session.commit()
        response = await client.get(f"/api/shares/{created['share_id']}")
        assert response.status_code == 410
        assert response.json()["detail"] == "This share has expired"


async def test_missing_share(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        unknown_id = "A" * 43
        assert (await client.get(f"/api/shares/{unknown_id}")).status_code == 404


async def test_malformed_share_id_is_rejected_before_rate_limiting(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        response = await client.get("/api/shares/not-a-valid-id")
        assert response.status_code == 422
        assert app.state.rate_limiter._events == {}


async def test_empty_upload_rejected(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        assert (await create_share(client, content=b"")).status_code == 400


async def test_upload_size_limit_is_stream_enforced(tmp_path):
    app = make_app(tmp_path, max_upload_mb=1)
    async with client_for(app) as client:
        response = await create_share(client, content=b"x" * (1024 * 1024 + 1))
        assert response.status_code == 413
        assert list((tmp_path / "storage").iterdir()) == []


async def test_rate_limit(tmp_path):
    app = make_app(tmp_path, access_rate_limit=2)
    async with client_for(app) as client:
        created = (await create_share(client)).json()
        url = f"/api/shares/{created['share_id']}"
        assert (await client.get(url)).status_code == 200
        assert (await client.get(url)).status_code == 200
        assert (await client.get(url)).status_code == 429


async def test_storage_name_cannot_be_path_traversal(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app):
        with pytest.raises(ValueError):
            app.state.storage.path("../secret.txt")
        with pytest.raises(ValueError):
            app.state.storage.path(f"{'z' * 64}.bin")


async def test_security_headers_and_cors_are_restricted(tmp_path):
    app = make_app(tmp_path)
    async with client_for(app) as client:
        response = await client.get("/api/health", headers={"Origin": "http://localhost:5173"})
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
        denied = await client.get("/api/health", headers={"Origin": "https://evil.example"})
        assert "access-control-allow-origin" not in denied.headers

