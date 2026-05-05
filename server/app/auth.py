from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import wraps
import hashlib
import hmac
import re
import secrets
from typing import Any, Callable, Literal, TypeVar, cast

from flask import current_app, jsonify, request

from .db import get_db, query_one

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
F = TypeVar("F", bound=Callable[..., Any])
VerifyCodeStatus = Literal["invalid", "too_many_attempts"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email))


def client_ip() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.remote_addr or ""


def hash_secret(value: str) -> str:
    secret = current_app.config["CHATDOWN_CONFIG"].secret_key.encode("utf-8")
    return hmac.new(secret, value.encode("utf-8"), hashlib.sha256).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def can_create_login_code(email: str, request_ip: str) -> tuple[bool, str, int | None]:
    config = current_app.config["CHATDOWN_CONFIG"]
    now = utc_now()
    cooldown_since = isoformat(now - timedelta(seconds=config.login_code_resend_cooldown_seconds))
    hourly_since = isoformat(now - timedelta(hours=1))

    recent = query_one(
        """
        SELECT created_at
        FROM login_codes
        WHERE created_at >= ? AND (email = ? OR request_ip = ?)
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (cooldown_since, email, request_ip),
    )
    if recent:
        retry_after = config.login_code_resend_cooldown_seconds - int((now - parse_time(recent["created_at"])).total_seconds())
        return False, "CODE_COOLDOWN", max(1, retry_after)

    hourly = query_one(
        """
        SELECT COUNT(*) AS total
        FROM login_codes
        WHERE created_at >= ? AND (email = ? OR request_ip = ?)
        """,
        (hourly_since, email, request_ip),
    )
    if hourly and int(hourly["total"]) >= config.login_code_hourly_limit:
        return False, "CODE_RATE_LIMITED", None

    return True, "", None


def create_login_code(email: str, code: str, request_ip: str = "") -> None:
    config = current_app.config["CHATDOWN_CONFIG"]
    now = utc_now()
    expires_at = now + timedelta(seconds=config.login_code_ttl_seconds)
    get_db().execute(
        """
        INSERT INTO login_codes (email, request_ip, code_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (email, request_ip, hash_secret(code), isoformat(expires_at), isoformat(now)),
    )
    get_db().commit()


def verify_login_code(email: str, code: str) -> tuple[dict[str, Any] | None, VerifyCodeStatus | None]:
    config = current_app.config["CHATDOWN_CONFIG"]
    now = utc_now()
    row = query_one(
        """
        SELECT id, code_hash, expires_at, failed_attempts, locked_at
        FROM login_codes
        WHERE email = ? AND consumed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email,),
    )

    if not row or parse_time(row["expires_at"]) < now:
        return None, "invalid"

    if row["locked_at"]:
        return None, "too_many_attempts"

    if not hmac.compare_digest(row["code_hash"], hash_secret(code)):
        failed_attempts = int(row["failed_attempts"]) + 1
        locked_at = isoformat(now) if failed_attempts >= config.login_code_max_attempts else None
        get_db().execute(
            "UPDATE login_codes SET failed_attempts = ?, locked_at = ? WHERE id = ?",
            (failed_attempts, locked_at, int(row["id"])),
        )
        get_db().commit()
        if locked_at:
            return None, "too_many_attempts"
        return None, "invalid"

    get_db().execute(
        "UPDATE login_codes SET consumed_at = ? WHERE id = ?",
        (isoformat(now), int(row["id"])),
    )

    user = query_one("SELECT id, email FROM users WHERE email = ?", (email,))
    if not user:
        cursor = get_db().execute(
            "INSERT INTO users (email, created_at) VALUES (?, ?)",
            (email, isoformat(now)),
        )
        user_id = int(cursor.lastrowid)
        user = {"id": user_id, "email": email}
    else:
        user = {"id": int(user["id"]), "email": str(user["email"])}

    get_db().commit()
    return user, None


def create_token(user_id: int) -> str:
    config = current_app.config["CHATDOWN_CONFIG"]
    token = secrets.token_urlsafe(32)
    now = utc_now()
    expires_at = now + timedelta(days=config.session_ttl_days)
    get_db().execute(
        """
        INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (user_id, hash_secret(token), isoformat(expires_at), isoformat(now)),
    )
    get_db().commit()
    return token


def user_from_token(token: str) -> dict[str, Any] | None:
    row = query_one(
        """
        SELECT users.id, users.email, sessions.expires_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
        """,
        (hash_secret(token),),
    )

    if not row or parse_time(row["expires_at"]) < utc_now():
        return None

    return {"id": int(row["id"]), "email": str(row["email"])}


def bearer_token() -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return ""
    return header.removeprefix("Bearer ").strip()


def require_auth(func: F) -> F:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any):
        token = bearer_token()
        user = user_from_token(token) if token else None
        if not user:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        return func(user, *args, **kwargs)

    return cast(F, wrapper)
