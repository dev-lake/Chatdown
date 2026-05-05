from __future__ import annotations

from flask import Blueprint, jsonify

from ..auth import require_auth
from ..quota import get_quota_state

me_bp = Blueprint("me", __name__)


@me_bp.get("/me")
@require_auth
def me(user):
    return jsonify({
        "user": user,
        "quota": get_quota_state(int(user["id"])),
    })
