from __future__ import annotations

from typing import Any

import requests
from flask import current_app


def upstream_payload(payload: dict[str, Any]) -> dict[str, Any]:
    config = current_app.config["CHATDOWN_CONFIG"]
    next_payload = dict(payload)
    if not next_payload.get("model"):
        next_payload["model"] = config.upstream_model
    return next_payload


def request_completion(payload: dict[str, Any]) -> requests.Response:
    config = current_app.config["CHATDOWN_CONFIG"]
    if not config.upstream_api_key:
        raise RuntimeError("OPENAI_COMPAT_API_KEY is not configured")

    return requests.post(
        f"{config.upstream_base_url.rstrip('/')}/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {config.upstream_api_key}",
            "Content-Type": "application/json",
        },
        json=upstream_payload(payload),
        stream=bool(payload.get("stream")),
        timeout=config.request_timeout_seconds,
    )
