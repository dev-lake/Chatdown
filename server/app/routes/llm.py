from __future__ import annotations

from typing import Any

import requests
from flask import Blueprint, Response, jsonify, request, stream_with_context

from ..auth import require_auth
from ..llm_client import request_completion
from ..quota import QuotaExceeded, consume_quota

llm_bp = Blueprint("llm", __name__)


def _is_streaming(payload: dict[str, Any]) -> bool:
    return bool(payload.get("stream"))


@llm_bp.post("/v1/chat/completions")
@require_auth
def chat_completions(user):
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload.get("messages"), list):
        return jsonify({"error": "INVALID_PAYLOAD"}), 400

    user_id = int(user["id"])

    try:
        quota = consume_quota(user_id)
    except QuotaExceeded as error:
        return jsonify({"error": "QUOTA_EXCEEDED", "quota": error.quota}), 429

    try:
        upstream = request_completion(payload)
    except requests.RequestException as error:
        return jsonify({"error": "UPSTREAM_REQUEST_FAILED", "detail": str(error)}), 502
    except RuntimeError as error:
        return jsonify({"error": "UPSTREAM_REQUEST_FAILED", "detail": str(error)}), 502

    headers = {"X-Chatdown-Quota-Remaining": str(quota["remaining"])}

    if not _is_streaming(payload):
        response = Response(
            upstream.content,
            status=upstream.status_code,
            content_type=upstream.headers.get("Content-Type", "application/json"),
            headers=headers,
        )
        upstream.close()
        return response

    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=None):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return Response(
        stream_with_context(generate()),
        status=upstream.status_code,
        content_type=upstream.headers.get("Content-Type", "text/event-stream"),
        headers={**headers, "Cache-Control": "no-cache"},
    )
