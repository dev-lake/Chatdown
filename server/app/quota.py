from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from flask import current_app

from .auth import isoformat, utc_now
from .db import get_db, query_one


class QuotaExceeded(RuntimeError):
    def __init__(self, quota: dict[str, Any]) -> None:
        super().__init__("QUOTA_EXCEEDED")
        self.quota = quota


def usage_date(now: datetime | None = None) -> str:
    return (now or utc_now()).astimezone(timezone.utc).date().isoformat()


def next_reset_at(now: datetime | None = None) -> str:
    current = (now or utc_now()).astimezone(timezone.utc)
    tomorrow = current.date() + timedelta(days=1)
    return datetime(tomorrow.year, tomorrow.month, tomorrow.day, tzinfo=timezone.utc).isoformat()


def get_quota_state(user_id: int) -> dict[str, Any]:
    limit = int(current_app.config["CHATDOWN_CONFIG"].daily_quota_limit)
    date = usage_date()
    row = query_one(
        "SELECT used FROM daily_usage WHERE user_id = ? AND usage_date = ?",
        (user_id, date),
    )
    used = int(row["used"]) if row else 0
    return {
        "limit": limit,
        "used": used,
        "remaining": max(0, limit - used),
        "resetAt": next_reset_at(),
    }


def consume_quota(user_id: int) -> dict[str, Any]:
    quota = get_quota_state(user_id)
    if quota["remaining"] <= 0:
        raise QuotaExceeded(quota)

    now = utc_now()
    date = usage_date(now)
    get_db().execute(
        """
        INSERT INTO daily_usage (user_id, usage_date, used, updated_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(user_id, usage_date) DO UPDATE SET
          used = used + 1,
          updated_at = excluded.updated_at
        """,
        (user_id, date, isoformat(now)),
    )
    get_db().commit()
    return get_quota_state(user_id)
