"""
tools/encrypted_backup.py — AES-256 encrypted SQLite backup.

Encrypts /opt/botgrid/saas_database.sqlite with Fernet (uses BACKUP_KEY env).
Output goes to /opt/botgrid/backups/encrypted/{date}.sqlite.enc

Retention:
  - keep hourly for last 24h
  - keep daily for last 7d
  - keep weekly for last 4w
  - keep monthly for last 12m

Restore: tools/encrypted_backup.py restore <file>
"""
from __future__ import annotations

import os
import sys
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from cryptography.fernet import Fernet

SRC_DB = Path('/opt/botgrid/saas_database.sqlite')
BACKUP_DIR = Path('/opt/botgrid/backups/encrypted')
BACKUP_DIR.mkdir(parents=True, exist_ok=True)

BACKUP_KEY = os.getenv('BACKUP_KEY')
if not BACKUP_KEY:
    print('ERROR: BACKUP_KEY env not set. Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"')
    sys.exit(1)


def encrypt_backup() -> Path:
    """Create new encrypted backup."""
    ts = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
    out = BACKUP_DIR / f'{ts}.sqlite.enc'
    # Use SQLite's .backup for consistency (handles WAL properly)
    tmp = BACKUP_DIR / f'.{ts}.tmp.sqlite'
    subprocess.run(
        ['sqlite3', str(SRC_DB), f'.backup {tmp}'],
        check=True, timeout=120,
    )
    # Encrypt + delete tmp
    data = tmp.read_bytes()
    cipher = Fernet(BACKUP_KEY.encode())
    encrypted = cipher.encrypt(data)
    out.write_bytes(encrypted)
    tmp.unlink()
    return out


def cleanup_old():
    """Apply retention policy."""
    now = datetime.now(timezone.utc)
    files = sorted(BACKUP_DIR.glob('*.sqlite.enc'))
    keepers = set()
    # Hourly for last 24h
    hourly_seen = set()
    for f in reversed(files):
        try:
            ts = datetime.strptime(f.stem.replace('.sqlite', ''), '%Y%m%d_%H%M%S').replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        age = now - ts
        # last 24h: keep 1 per hour
        if age <= timedelta(hours=24):
            key = ts.strftime('%Y%m%d_%H')
            if key not in hourly_seen:
                hourly_seen.add(key); keepers.add(f)
            continue
        # 7d: keep 1 per day
        if age <= timedelta(days=7):
            key = ts.strftime('%Y%m%d')
            if key not in hourly_seen:
                hourly_seen.add(key); keepers.add(f)
            continue
        # 4w: keep 1 per week
        if age <= timedelta(weeks=4):
            key = ts.strftime('%Y%W')
            if key not in hourly_seen:
                hourly_seen.add(key); keepers.add(f)
            continue
        # 12m: keep 1 per month
        if age <= timedelta(days=365):
            key = ts.strftime('%Y%m')
            if key not in hourly_seen:
                hourly_seen.add(key); keepers.add(f)
            continue
    # Delete the rest
    deleted = 0
    for f in files:
        if f not in keepers:
            f.unlink(); deleted += 1
    return deleted


def restore(enc_file: str) -> Path:
    """Decrypt + restore to a sibling file (NEVER overwrites SRC_DB)."""
    src = Path(enc_file)
    if not src.exists():
        raise FileNotFoundError(enc_file)
    cipher = Fernet(BACKUP_KEY.encode())
    data = cipher.decrypt(src.read_bytes())
    out = src.parent / f'restored_{src.stem.replace(".sqlite","")}.sqlite'
    out.write_bytes(data)
    return out


def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'restore':
        if len(sys.argv) < 3:
            print('Usage: encrypted_backup.py restore <file.enc>')
            sys.exit(1)
        out = restore(sys.argv[2])
        print(f'Restored to: {out}')
        return
    out = encrypt_backup()
    size_kb = out.stat().st_size / 1024
    deleted = cleanup_old()
    print(f'[BACKUP] {out.name} ({size_kb:.1f} KB) · cleaned {deleted} old')


if __name__ == '__main__':
    main()
