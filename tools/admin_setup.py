"""
tools/admin_setup.py — Bootstrap first admin user + manage existing.

Usage:
  python tools/admin_setup.py create <email> <username> <role>
  python tools/admin_setup.py list
  python tools/admin_setup.py role <username> <role>
  python tools/admin_setup.py enable_2fa <username>
  python tools/admin_setup.py disable <username>
"""
import getpass
import os
import sys
sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from database import SessionLocal, AdminUser, Base, engine
from modules.admin_auth import (
    create_admin, ROLES, generate_totp_secret, totp_provisioning_uri,
    encrypt_field, audit_log,
)

# Ensure tables exist
Base.metadata.create_all(engine, tables=[AdminUser.__table__])
from database import AdminAuditLog
Base.metadata.create_all(engine, tables=[AdminAuditLog.__table__])


def cmd_create(email: str, username: str, role: str):
    if role not in ROLES:
        print(f'Invalid role. Must be one of {ROLES}'); return
    pw = getpass.getpass(f'Password for {username}: ')
    pw2 = getpass.getpass('Confirm: ')
    if pw != pw2:
        print('Mismatch.'); return
    if len(pw) < 12:
        print('Password must be >= 12 chars.'); return
    user = create_admin(email, username, pw, role)
    print(f'Created admin user #{user.id}: {user.email} role={user.role}')
    audit_log(None, 'admin_user_created', resource='admin_users', resource_id=str(user.id),
              detail={'email': email, 'role': role})


def cmd_list():
    db = SessionLocal()
    try:
        users = db.query(AdminUser).order_by(AdminUser.id).all()
        if not users:
            print('No admin users yet.'); return
        for u in users:
            twofa = 'YES' if u.totp_verified else 'NO'
            print(f'#{u.id} {u.username:20s} {u.email:30s} role={u.role:7s} 2FA={twofa} active={u.is_active}')
    finally:
        db.close()


def cmd_role(username: str, role: str):
    if role not in ROLES:
        print(f'Invalid role. Must be one of {ROLES}'); return
    db = SessionLocal()
    try:
        u = db.query(AdminUser).filter_by(username=username).first()
        if not u:
            print(f'User {username} not found'); return
        old = u.role
        u.role = role
        db.commit()
        print(f'Role changed: {old} -> {role}')
        audit_log(None, 'admin_role_changed', resource='admin_users',
                  resource_id=str(u.id), detail={'from': old, 'to': role})
    finally:
        db.close()


def cmd_enable_2fa(username: str):
    db = SessionLocal()
    try:
        u = db.query(AdminUser).filter_by(username=username).first()
        if not u:
            print(f'User {username} not found'); return
        secret = generate_totp_secret()
        u.totp_secret_enc = encrypt_field(secret)
        u.totp_verified = True  # Mark as enrolled (skips first-verify in this CLI flow)
        db.commit()
        print(f'2FA enabled for {username}')
        print(f'\nTOTP secret: {secret}')
        print(f'\nProvisioning URI for Google Authenticator / Authy / 1Password:')
        print(f'  {totp_provisioning_uri(secret, u.email)}')
        print(f'\nUse this URI to generate QR code at https://www.qrcode-monkey.com/ OR import URI directly into app.')
        audit_log(None, 'admin_2fa_enabled', resource='admin_users', resource_id=str(u.id))
    finally:
        db.close()


def cmd_disable(username: str):
    db = SessionLocal()
    try:
        u = db.query(AdminUser).filter_by(username=username).first()
        if not u:
            print(f'User {username} not found'); return
        u.is_active = False
        db.commit()
        print(f'{username} deactivated')
        audit_log(None, 'admin_user_disabled', resource='admin_users', resource_id=str(u.id))
    finally:
        db.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__); return
    cmd = sys.argv[1]
    args = sys.argv[2:]
    try:
        if cmd == 'create' and len(args) == 3:
            cmd_create(args[0], args[1], args[2])
        elif cmd == 'list':
            cmd_list()
        elif cmd == 'role' and len(args) == 2:
            cmd_role(args[0], args[1])
        elif cmd == 'enable_2fa' and len(args) == 1:
            cmd_enable_2fa(args[0])
        elif cmd == 'disable' and len(args) == 1:
            cmd_disable(args[0])
        else:
            print(__doc__)
    except Exception as e:
        print(f'Error: {e}')


if __name__ == '__main__':
    main()
