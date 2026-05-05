from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..auth import (
    can_create_login_code,
    client_ip,
    create_login_code,
    create_token,
    generate_code,
    normalize_email,
    validate_email,
    verify_login_code,
)
from ..email_client import EmailDeliveryError, send_login_code
from ..quota import get_quota_state

auth_bp = Blueprint("auth", __name__)


@auth_bp.post("/request-code")
def request_code():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(str(payload.get("email", "")))

    if not validate_email(email):
        return jsonify({"error": "INVALID_EMAIL"}), 400

    request_ip = client_ip()
    allowed, error, retry_after = can_create_login_code(email, request_ip)
    if not allowed:
        response = jsonify({"error": error, "retryAfter": retry_after})
        if retry_after:
            response.headers["Retry-After"] = str(retry_after)
        return response, 429

    code = generate_code()
    create_login_code(email, code, request_ip)

    try:
        send_login_code(email, code)
    except EmailDeliveryError as error:
        return jsonify({"error": "EMAIL_DELIVERY_FAILED", "detail": str(error)}), 502

    return jsonify({"success": True})


@auth_bp.post("/verify-code")
def verify_code():
    payload = request.get_json(silent=True) or {}
    email = normalize_email(str(payload.get("email", "")))
    code = str(payload.get("code", "")).strip()

    if not validate_email(email) or len(code) != 6 or not code.isdigit():
        return jsonify({"error": "INVALID_CODE"}), 400

    user, error = verify_login_code(email, code)
    if not user:
        status = 429 if error == "too_many_attempts" else 400
        return jsonify({"error": "TOO_MANY_ATTEMPTS" if error == "too_many_attempts" else "INVALID_CODE"}), status

    token = create_token(int(user["id"]))
    return jsonify({
        "token": token,
        "user": user,
        "quota": get_quota_state(int(user["id"])),
    })
