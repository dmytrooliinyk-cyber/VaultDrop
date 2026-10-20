import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .config import Settings
from .database import Base, create_database
from .models import Share
from .routes import router
from .security import RateLimiter
from .storage import EncryptedStorage


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("vaultdrop")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    engine, SessionLocal = create_database(settings.database_url)
    storage = EncryptedStorage(settings.storage_dir)

    def cleanup_expired() -> int:
        removed = 0
        with SessionLocal() as session:
            now = datetime.now(UTC).replace(tzinfo=None)
            expired = session.scalars(select(Share).where(Share.expires_at <= now)).all()
            for share in expired:
                storage.delete(share.storage_name)
                session.delete(share)
                removed += 1
            session.commit()
        if removed:
            logger.info("expired shares cleaned count=%d", removed)
        return removed

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(engine)
        cleanup_expired()

        async def cleanup_loop():
            while True:
                await asyncio.sleep(settings.cleanup_interval_seconds)
                await asyncio.to_thread(cleanup_expired)

        task = asyncio.create_task(cleanup_loop())
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        engine.dispose()

    app = FastAPI(title="VaultDrop API", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.SessionLocal = SessionLocal
    app.state.storage = storage
    app.state.rate_limiter = RateLimiter()
    app.state.cleanup_expired = cleanup_expired

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "X-Management-Token"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        if request.url.path.startswith("/api/shares"):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(router)
    return app


app = create_app()
