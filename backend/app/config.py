import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./cybercheck.db"
    jwt_secret: str = os.getenv("JWT_SECRET", secrets.token_urlsafe(48))
    jwt_expire_minutes: int = 60 * 12
    cookie_secure: bool = True
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    premium_enabled: bool = True
    environment: str = "development"
    login_limit: int = 8
    login_window_seconds: int = 900

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and not os.getenv("JWT_SECRET"):
        raise RuntimeError("JWT_SECRET must be configured in production.")
    if settings.environment == "production" and len(settings.jwt_secret) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 characters in production.")
    return settings
