"""
modules/admin_auth.py — Compliance-grade admin authentication.

Features:
  - Per-admin user accounts (bcrypt password hashing)
  - Role-based permissions (admin / ops / viewer)
  - 2FA TOTP enrollment + verification (pyotp)
  - httpOnly secure session cookies (Phase 3)
  - IP allowlist enforcement per-account (Phase 4)
  - Account lockout after 5 failed attempts (15 min)
  - Hash-chained audit log on every action

Replaces single DASHBOARD_PASSWORD shared secret.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import pyotp

from database import SessionLocal, AdminUser, AdminAuditLog
from utils.crypto import encrypt_field, decrypt_field

# ─── Constants ────────────────────────────────────────────────────────────────

ROLES = ('admin', 'ops', 'viewer')
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MIN = 15
SESSION_TTL_SEC = 8 * 3600     # 8 hours
SESSION_COOKIE = 'kado_admin_sess'

# Permission matrix: what each role can do
_PERMS = {
    'admin':  {'read', 'write', 'billing', 'restart_services', 'manage_users'},
    'ops':    {'read', 'write', 'restart_services'},
    'viewer': {'read'},
}


# ─── Password handling ───────────────────────────────────────────────────────

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except (ValueError, AttributeError):
        return False


# ─── TOTP 2FA ────────────────────────────────────────────────────────────────

def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name='KADO Admin')


def verify_totp(secret: str, code: str) -> bool:
    if not secret or not code:
        return False
    return pyotp.totp.TOTP(secret).verify(code.strip(), valid_window=1)


# ─── Account management ──────────────────────────────────────────────────────

def create_admin(email: str, username: str, password: str, role: str = 'viewer',
                 created_by_id: Optional[int] = None) -> AdminUser:
    if role not in ROLES:
        raise ValueError(f'Invalid role: {role}')
    db = SessionLocal()
    try:
        if db.query(AdminUser).filter(
            (AdminUser.email == email) | (AdminUser.username == username)
        ).first():
            raise ValueError('Email or username already exists')
        user = AdminUser(
            email=email.lower().strip(),
            username=username.strip(),
            password_hash=hash_password(password),
            role=role,
            created_by_id=created_by_id,
        )
        db.add(user); db.commit(); db.refresh(user)
        return user
    finally:
        db.close()


# ─── Login flow ──────────────────────────────────────────────────────────────

def authenticate(username_or_email: str, password: str,
                 totp_code: Optional[str] = None,
                 ip: Optional[str] = None) -> tuple[Optional[AdminUser], str]:
    """
    Returns (user, status):
      status: 'ok' | 'invalid' | 'locked' | 'totp_required' | 'totp_invalid' | 'inactive' | 'ip_blocked'
    """
    db = SessionLocal()
    try:
        u = db.query(AdminUser).filter(
            (AdminUser.email == username_or_email.lower()) |
            (AdminUser.username == username_or_email)
        ).first()
        if not u:
            return None, 'invalid'
        if not u.is_active:
            return None, 'inactive'
        if u.locked_until and u.locked_until > datetime.now(timezone.utc).replace(tzinfo=None):
            return None, 'locked'

        # IP allowlist (if set)
        if u.allowed_ips and ip:
            allowed = [c.strip() for c in u.allowed_ips.split(',') if c.strip()]
            if allowed and not _ip_in_allowlist(ip, allowed):
                return None, 'ip_blocked'

        if not verify_password(password, u.password_hash):
            u.failed_attempts = (u.failed_attempts or 0) + 1
            if u.failed_attempts >= LOCKOUT_THRESHOLD:
                u.locked_until = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=LOCKOUT_DURATION_MIN)
                u.failed_attempts = 0
            db.commit()
            return None, 'invalid'

        # Password OK; check TOTP if enrolled
        if u.totp_verified and u.totp_secret_enc:
            if not totp_code:
                return u, 'totp_required'
            secret = decrypt_field(u.totp_secret_enc)
            if not verify_totp(secret, totp_code):
                u.failed_attempts = (u.failed_attempts or 0) + 1
                db.commit()
                return None, 'totp_invalid'

        # Success
        u.failed_attempts = 0
        u.locked_until = None
        u.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
        u.last_login_ip = ip
        db.commit()
        db.refresh(u)
        return u, 'ok'
    finally:
        db.close()


def _ip_in_allowlist(ip: str, allowed: list[str]) -> bool:
    import ipaddress
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for entry in allowed:
        try:
            if '/' in entry:
                if addr in ipaddress.ip_network(entry, strict=False):
                    return True
            elif addr == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


# ─── Sessions (signed tokens, httpOnly cookies in Phase 3) ───────────────────

_SESSION_SECRET = os.getenv('SESSION_SECRET') or secrets.token_hex(32)


def issue_session(user: AdminUser) -> str:
    """Returns opaque session token. Stored server-side in _active_admin_sessions."""
    return secrets.token_hex(32)


# ─── Audit log (hash-chained) ────────────────────────────────────────────────

def _last_hash() -> str:
    db = SessionLocal()
    try:
        last = db.query(AdminAuditLog).order_by(AdminAuditLog.id.desc()).first()
        return last.row_hash if last else 'genesis'
    finally:
        db.close()


def audit_log(admin_user_id: Optional[int], action: str,
              resource: str = '', resource_id: str = '',
              detail: Optional[dict] = None,
              ip: Optional[str] = None, ua: Optional[str] = None) -> None:
    """Append-only audit log with tamper-evident hash chain."""
    prev = _last_hash()
    payload = {
        'admin_user_id': admin_user_id, 'action': action,
        'resource': resource, 'resource_id': resource_id,
        'detail': detail, 'ip': ip, 'ua': ua,
        'ts': datetime.now(timezone.utc).isoformat(),
        'prev': prev,
    }
    row_hash = hashlib.sha256(
        (prev + json.dumps(payload, sort_keys=True, default=str)).encode()
    ).hexdigest()
    db = SessionLocal()
    try:
        row = AdminAuditLog(
            admin_user_id=admin_user_id, action=action,
            resource=resource or None, resource_id=resource_id or None,
            detail_enc=encrypt_field(json.dumps(detail, default=str)) if detail else None,
            ip_address=ip, user_agent=(ua or '')[:300] or None,
            prev_hash=prev, row_hash=row_hash,
        )
        db.add(row); db.commit()
    finally:
        db.close()


# ─── Permission check helper ─────────────────────────────────────────────────

def has_perm(user: AdminUser, perm: str) -> bool:
    return perm in _PERMS.get(user.role, set())
