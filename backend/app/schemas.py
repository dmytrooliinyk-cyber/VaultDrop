from datetime import datetime

from pydantic import BaseModel


class ShareInfo(BaseModel):
    share_id: str
    encrypted_size: int
    created_at: datetime
    expires_at: datetime
    max_downloads: int | None
    download_count: int
    downloads_remaining: int | None
    one_time: bool
    consumed: bool
    revoked: bool
    password_protected: bool


class CreateShareResponse(ShareInfo):
    management_token: str


class ActionResponse(BaseModel):
    status: str

