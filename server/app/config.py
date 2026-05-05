from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class ChatdownConfig:
    database_path: str = "chatdown.sqlite3"
    secret_key: str = "dev-secret-change-me"
    environment: str = "development"
    daily_quota_limit: int = 10
    login_code_ttl_seconds: int = 600
    login_code_resend_cooldown_seconds: int = 45
    login_code_hourly_limit: int = 5
    login_code_max_attempts: int = 5
    session_ttl_days: int = 90
    resend_api_key: str = ""
    resend_from_email: str = "Chatdown <noreply@example.com>"
    email_delivery: str = "log"
    upstream_base_url: str = "https://api.openai.com"
    upstream_api_key: str = ""
    upstream_model: str = "gpt-4o-mini"
    request_timeout_seconds: int = 120

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @classmethod
    def from_env(cls) -> "ChatdownConfig":
        env = os.getenv("FLASK_ENV") or os.getenv("CHATDOWN_ENV") or "development"
        email_delivery = os.getenv("EMAIL_DELIVERY", "resend" if os.getenv("RESEND_API_KEY") else "log")
        config = cls(
            database_path=os.getenv("DATABASE_PATH", "chatdown.sqlite3"),
            secret_key=os.getenv("SECRET_KEY", "dev-secret-change-me"),
            environment=env,
            daily_quota_limit=int(os.getenv("DAILY_QUOTA_LIMIT", "10")),
            login_code_ttl_seconds=int(os.getenv("LOGIN_CODE_TTL_SECONDS", "600")),
            login_code_resend_cooldown_seconds=int(os.getenv("LOGIN_CODE_RESEND_COOLDOWN_SECONDS", "45")),
            login_code_hourly_limit=int(os.getenv("LOGIN_CODE_HOURLY_LIMIT", "5")),
            login_code_max_attempts=int(os.getenv("LOGIN_CODE_MAX_ATTEMPTS", "5")),
            session_ttl_days=int(os.getenv("SESSION_TTL_DAYS", "90")),
            resend_api_key=os.getenv("RESEND_API_KEY", ""),
            resend_from_email=os.getenv("RESEND_FROM_EMAIL", "Chatdown <noreply@example.com>"),
            email_delivery=email_delivery,
            upstream_base_url=os.getenv("OPENAI_COMPAT_BASE_URL", "https://api.openai.com"),
            upstream_api_key=os.getenv("OPENAI_COMPAT_API_KEY", ""),
            upstream_model=os.getenv("OPENAI_COMPAT_MODEL", "gpt-4o-mini"),
            request_timeout_seconds=int(os.getenv("REQUEST_TIMEOUT_SECONDS", "120")),
        )

        if config.is_production and config.email_delivery == "resend" and not config.resend_api_key:
            raise RuntimeError("RESEND_API_KEY is required in production when EMAIL_DELIVERY=resend")

        return config
