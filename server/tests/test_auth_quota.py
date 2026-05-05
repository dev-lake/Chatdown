from __future__ import annotations

from pathlib import Path

import pytest

from app import create_app
from app.config import ChatdownConfig
from app.db import query_one


@pytest.fixture()
def app(tmp_path: Path):
    config = ChatdownConfig(
        database_path=str(tmp_path / "chatdown-test.sqlite3"),
        secret_key="test-secret",
        email_delivery="log",
        upstream_api_key="test-upstream-key",
        daily_quota_limit=10,
    )
    return create_app(config)


@pytest.fixture()
def client(app):
    return app.test_client()


def login(client, app, email: str = "user@example.com") -> str:
    response = client.post("/api/auth/request-code", json={"email": email})
    assert response.status_code == 200

    with app.app_context():
        row = query_one(
            "SELECT code_hash FROM login_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1",
            (email,),
        )
        assert row is not None

        # Tests use the public request path plus a direct DB lookup for the latest code hash.
        # The real raw code is not stored, so create a fresh known code for verification.
        from app.auth import create_login_code

        create_login_code(email, "123456")

    verify = client.post("/api/auth/verify-code", json={"email": email, "code": "123456"})
    assert verify.status_code == 200
    return verify.get_json()["token"]


def test_email_code_login_and_me(client, app):
    token = login(client, app)

    response = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["user"]["email"] == "user@example.com"
    assert payload["quota"]["limit"] == 10
    assert payload["quota"]["remaining"] == 10


def test_request_code_rejects_invalid_email(client):
    response = client.post("/api/auth/request-code", json={"email": "not-an-email"})

    assert response.status_code == 400
    assert response.get_json()["error"] == "INVALID_EMAIL"


def test_request_code_cooldown_applies_across_email_changes(client):
    first = client.post("/api/auth/request-code", json={"email": "first@example.com"})
    assert first.status_code == 200

    second = client.post("/api/auth/request-code", json={"email": "second@example.com"})

    assert second.status_code == 429
    payload = second.get_json()
    assert payload["error"] == "CODE_COOLDOWN"
    assert int(second.headers["Retry-After"]) > 0


def test_verify_code_locks_after_too_many_attempts(client, app):
    with app.app_context():
        from app.auth import create_login_code

        create_login_code("locked@example.com", "123456")

    for _ in range(4):
        response = client.post("/api/auth/verify-code", json={"email": "locked@example.com", "code": "000000"})
        assert response.status_code == 400
        assert response.get_json()["error"] == "INVALID_CODE"

    locked = client.post("/api/auth/verify-code", json={"email": "locked@example.com", "code": "000000"})
    assert locked.status_code == 429
    assert locked.get_json()["error"] == "TOO_MANY_ATTEMPTS"

    correct = client.post("/api/auth/verify-code", json={"email": "locked@example.com", "code": "123456"})
    assert correct.status_code == 429
    assert correct.get_json()["error"] == "TOO_MANY_ATTEMPTS"


def test_me_requires_token(client):
    response = client.get("/api/me")

    assert response.status_code == 401
    assert response.get_json()["error"] == "UNAUTHORIZED"


def test_quota_blocks_eleventh_model_request(client, app, monkeypatch):
    token = login(client, app)

    class FakeResponse:
        status_code = 200
        content = b'{"choices":[{"message":{"content":"ok"}}]}'
        headers = {"Content-Type": "application/json"}

        def close(self):
            pass

    calls = []

    def fake_request_completion(payload):
        calls.append(payload)
        return FakeResponse()

    monkeypatch.setattr("app.routes.llm.request_completion", fake_request_completion)

    for index in range(10):
        response = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {token}"},
            json={"model": "x", "messages": [{"role": "user", "content": str(index)}]},
        )
        assert response.status_code == 200
        assert response.headers["X-Chatdown-Quota-Remaining"] == str(9 - index)

    blocked = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {token}"},
        json={"model": "x", "messages": [{"role": "user", "content": "blocked"}]},
    )

    assert blocked.status_code == 429
    payload = blocked.get_json()
    assert payload["error"] == "QUOTA_EXCEEDED"
    assert payload["quota"]["remaining"] == 0
    assert len(calls) == 10


def test_streaming_proxy(client, app, monkeypatch):
    token = login(client, app)

    class FakeStreamResponse:
        status_code = 200
        headers = {"Content-Type": "text/event-stream"}

        def iter_content(self, chunk_size=None):
            yield b"data: "
            yield b'{"choices":[{"delta":{"content":"hi"}}]}\n\n'

        def close(self):
            pass

    monkeypatch.setattr("app.routes.llm.request_completion", lambda payload: FakeStreamResponse())

    response = client.post(
        "/v1/chat/completions",
        headers={"Authorization": f"Bearer {token}"},
        json={"stream": True, "messages": [{"role": "user", "content": "hello"}]},
    )

    assert response.status_code == 200
    assert b"data: " in response.data
    assert response.headers["X-Chatdown-Quota-Remaining"] == "9"
