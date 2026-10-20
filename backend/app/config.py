from dataclasses import dataclass, field
import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


@dataclass(slots=True)
class Settings:
    # default_factory keeps environment reads tied to app creation. This matters
    # for tests and for process managers that populate variables before startup.
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./vaultdrop.db"))
    storage_dir: str = field(default_factory=lambda: os.getenv("STORAGE_DIR", "../storage"))
    frontend_origin: str = field(default_factory=lambda: os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"))
    max_upload_mb: int = field(default_factory=lambda: _int("MAX_UPLOAD_MB", 100))
    cleanup_interval_seconds: int = field(default_factory=lambda: _int("CLEANUP_INTERVAL_SECONDS", 300))
    access_rate_limit: int = field(default_factory=lambda: _int("ACCESS_RATE_LIMIT", 120))
    management_rate_limit: int = field(default_factory=lambda: _int("MANAGEMENT_RATE_LIMIT", 12))
    rate_window_seconds: int = field(default_factory=lambda: _int("RATE_WINDOW_SECONDS", 60))

    def __post_init__(self) -> None:
        positive_values = {
            "MAX_UPLOAD_MB": self.max_upload_mb,
            "CLEANUP_INTERVAL_SECONDS": self.cleanup_interval_seconds,
            "ACCESS_RATE_LIMIT": self.access_rate_limit,
            "MANAGEMENT_RATE_LIMIT": self.management_rate_limit,
            "RATE_WINDOW_SECONDS": self.rate_window_seconds,
        }
        invalid = [name for name, value in positive_values.items() if value < 1]
        if invalid:
            raise ValueError(f"These settings must be positive integers: {', '.join(invalid)}")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

