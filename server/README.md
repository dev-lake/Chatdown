# Chatdown Flask API

Backend service for Chatdown's built-in API mode. It provides email-code login, daily quota tracking, and an OpenAI-compatible `/v1/chat/completions` proxy.

For production deployment, HTTPS reverse proxy setup, and extension packaging, see [`../docs/deployment.md`](../docs/deployment.md).

## Setup

```bash
python -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

Create `server/.env` or export environment variables:

```bash
DATABASE_PATH=chatdown.sqlite3
SECRET_KEY=change-me
EMAIL_DELIVERY=log
RESEND_API_KEY=
RESEND_FROM_EMAIL="Chatdown <noreply@example.com>"
OPENAI_COMPAT_BASE_URL=https://api.openai.com
OPENAI_COMPAT_API_KEY=sk-...
OPENAI_COMPAT_MODEL=gpt-4o-mini
DAILY_QUOTA_LIMIT=10
```

Use `EMAIL_DELIVERY=resend` with `RESEND_API_KEY` in production. `EMAIL_DELIVERY=log` prints verification codes to the Flask log for local development.

## Run

```bash
FLASK_APP=wsgi:app flask run --host 0.0.0.0 --port 5001 --cert cert.pem --key key.pem
```

For local development, use a trusted local certificate or run the Flask app behind a local HTTPS proxy. The extension default built-in server URL is `https://localhost:5001`.

## Test

```bash
pytest
```
