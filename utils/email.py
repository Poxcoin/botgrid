"""
Email utility — sends transactional emails via SMTP.
If SMTP_HOST is not configured, all calls are silent no-ops (registration still works).
"""
import smtplib
import traceback
from html import escape
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config.settings import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SITE_URL

_EMAIL_HEADER = """
  <div style="margin-bottom:32px">
    <a href="{site}" style="text-decoration:none">
      <span style="display:inline-block;background:#fff;color:#000;font-size:15px;font-weight:900;letter-spacing:0.08em;padding:7px 14px;border:2px solid #000">KADO</span>
    </a>
  </div>
"""


def _smtp_enabled() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def _send(to: str, subject: str, html: str) -> bool:
    if not _smtp_enabled():
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = SMTP_FROM or SMTP_USER
        msg["To"]      = to
        msg.attach(MIMEText(html, "html"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM or SMTP_USER, to, msg.as_string())
        return True
    except Exception:
        traceback.print_exc()
        return False


def send_verification_email(to: str, token: str) -> bool:
    link = f"{SITE_URL}/auth?action=verify&token={token}"
    html = f"""
<!DOCTYPE html>
<html>
<body style="background:#060606;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto">
    {_EMAIL_HEADER.format(site=SITE_URL)}
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px">Verify your email</div>
    <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 32px">
      Click the button below to verify your Kado account. This link expires in 24 hours.
    </p>
    <a href="{link}"
       style="display:inline-block;background:#fff;color:#000;padding:13px 28px;border-radius:100px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.01em">
      Verify Email →
    </a>
    <p style="color:#444;font-size:11px;margin-top:32px;line-height:1.5">
      If you didn't create a Kado account, ignore this email.<br>
      <a href="{link}" style="color:#666;word-break:break-all">{link}</a>
    </p>
  </div>
</body>
</html>
"""
    return _send(to, "Verify your Kado email", html)


def send_login_notification_email(to: str, ip: str) -> bool:
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    html = f"""
<!DOCTYPE html>
<html>
<body style="background:#060606;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto">
    {_EMAIL_HEADER.format(site=SITE_URL)}
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px">New login to your account</div>
    <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 24px">
      A new login was detected on your Kado account.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr><td style="color:#666;padding:6px 0;border-bottom:1px solid #1a1a1a">Time</td><td style="color:#fff;padding:6px 0;border-bottom:1px solid #1a1a1a;text-align:right">{ts}</td></tr>
      <tr><td style="color:#666;padding:6px 0">IP address</td><td style="color:#fff;padding:6px 0;text-align:right">{escape(ip)}</td></tr>
    </table>
    <p style="color:#444;font-size:11px;margin-top:32px;line-height:1.5">
      If this wasn't you, change your password immediately.<br>
      <a href="{SITE_URL}/auth?action=reset" style="color:#666">{SITE_URL}</a>
    </p>
  </div>
</body>
</html>
"""
    return _send(to, "New login to Kado", html)


def send_login_otp_email(to: str, code: str) -> bool:
    html = f"""
<!DOCTYPE html>
<html>
<body style="background:#060606;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto">
    {_EMAIL_HEADER.format(site=SITE_URL)}
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px">Your Kado login code</div>
    <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 24px">
      Use this code to complete your login. It expires in 5 minutes.
    </p>
    <div style="background:#111;border:1px solid #222;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
      <span style="font-size:40px;font-weight:700;letter-spacing:0.15em;color:#fff">{escape(code)}</span>
    </div>
    <p style="color:#444;font-size:11px;margin-top:32px;line-height:1.5">
      If you didn't try to log in to Kado, ignore this email — your account is safe.<br>
      <a href="{SITE_URL}" style="color:#666">{SITE_URL}</a>
    </p>
  </div>
</body>
</html>
"""
    return _send(to, "Your Kado login code", html)


def send_welcome_email(to: str, username: str) -> bool:
    dashboard = f"{SITE_URL}/dashboard"
    html = f"""
<!DOCTYPE html>
<html>
<body style="background:#060606;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto">
    {_EMAIL_HEADER.format(site=SITE_URL)}
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px">Welcome to KADO, {username}!</div>
    <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 24px">
      Your account is ready. Here's how to activate your trading bot in 3 steps:
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:28px">
      <tr><td style="padding:10px 0;border-bottom:1px solid #1a1a1a;vertical-align:top;width:24px;color:#fff;font-weight:600">1</td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid #1a1a1a;color:#ccc">Connect your Bybit API key (read + trade permissions, no withdrawal)</td></tr>
      <tr><td style="padding:10px 0;border-bottom:1px solid #1a1a1a;vertical-align:top;color:#fff;font-weight:600">2</td>
          <td style="padding:10px 0 10px 12px;border-bottom:1px solid #1a1a1a;color:#ccc">Choose your strategy — Grid Bot, Signal Bot, or Funding Rate</td></tr>
      <tr><td style="padding:10px 0;vertical-align:top;color:#fff;font-weight:600">3</td>
          <td style="padding:10px 0 10px 12px;color:#ccc">Watch your bot trade 24/7</td></tr>
    </table>
    <a href="{dashboard}"
       style="display:inline-block;background:#fff;color:#000;padding:13px 28px;border-radius:100px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.01em">
      Open Dashboard →
    </a>
    <p style="color:#444;font-size:11px;margin-top:40px;line-height:1.5">
      Questions? <a href="mailto:support@kadoclub.net" style="color:#666">support@kadoclub.net</a><br>
      — KADO Team
    </p>
  </div>
</body>
</html>
"""
    return _send(to, "Welcome to KADO — your bot is ready", html)


def send_password_reset_email(to: str, token: str) -> bool:
    link = f"{SITE_URL}/auth?action=reset&token={token}"
    html = f"""
<!DOCTYPE html>
<html>
<body style="background:#060606;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto">
    {_EMAIL_HEADER.format(site=SITE_URL)}
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px">Reset your password</div>
    <p style="color:#888;font-size:14px;line-height:1.6;margin:0 0 32px">
      Click below to set a new password. This link expires in 1 hour.
    </p>
    <a href="{link}"
       style="display:inline-block;background:#fff;color:#000;padding:13px 28px;border-radius:100px;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.01em">
      Reset Password →
    </a>
    <p style="color:#444;font-size:11px;margin-top:32px;line-height:1.5">
      If you didn't request a reset, ignore this email.<br>
      <a href="{link}" style="color:#666;word-break:break-all">{link}</a>
    </p>
  </div>
</body>
</html>
"""
    return _send(to, "Reset your Kado password", html)
