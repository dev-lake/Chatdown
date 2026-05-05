from __future__ import annotations

import logging

import requests
from flask import current_app


class EmailDeliveryError(RuntimeError):
    pass


def _code_ttl_minutes() -> int:
    config = current_app.config["CHATDOWN_CONFIG"]
    return max(1, round(config.login_code_ttl_seconds / 60))


def _render_login_code_text(code: str) -> str:
    ttl_minutes = _code_ttl_minutes()
    return (
        "Sign in to Chatdown\n\n"
        f"Your verification code is: {code}\n\n"
        f"This code expires in {ttl_minutes} minutes. "
        "If you did not request this code, you can safely ignore this email.\n\n"
        "Chatdown"
    )


def _render_login_code_html(code: str) -> str:
    ttl_minutes = _code_ttl_minutes()
    return f"""<!doctype html>
<html>
  <body style="margin:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 18px;border-bottom:1px solid #eef0f3;">
                <div style="font-size:20px;font-weight:700;letter-spacing:0;color:#111827;">Chatdown</div>
                <div style="margin-top:6px;font-size:14px;color:#6b7280;">Verification code</div>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px;">
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:700;color:#111827;">Sign in to Chatdown</h1>
                <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4b5563;">Enter this code in the Chatdown login page to finish signing in.</p>
                <div style="margin:0 0 22px;padding:18px 20px;background:#f3f6ff;border:1px solid #dbe5ff;border-radius:10px;text-align:center;">
                  <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:8px;color:#1d4ed8;">{code}</div>
                </div>
                <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">This code expires in <strong style="color:#374151;">{ttl_minutes} minutes</strong>. If you did not request it, you can safely ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#fafafa;border-top:1px solid #eef0f3;font-size:12px;line-height:1.5;color:#9ca3af;">
                This email was sent for Chatdown account login.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""


def send_login_code(email: str, code: str) -> None:
    config = current_app.config["CHATDOWN_CONFIG"]

    if config.email_delivery == "log":
        current_app.logger.warning("Chatdown login code for %s: %s", email, code)
        return

    if config.email_delivery != "resend":
        raise EmailDeliveryError(f"Unsupported email delivery provider: {config.email_delivery}")

    if not config.resend_api_key:
        raise EmailDeliveryError("RESEND_API_KEY is not configured")

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {config.resend_api_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": config.resend_from_email,
            "to": [email],
            "subject": f"{code} is your Chatdown verification code",
            "text": _render_login_code_text(code),
            "html": _render_login_code_html(code),
        },
        timeout=20,
    )

    if response.status_code >= 400:
        logging.getLogger(__name__).warning("Resend failed: %s %s", response.status_code, response.text)
        raise EmailDeliveryError("Failed to send login code")
