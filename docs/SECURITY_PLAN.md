# KADO — Security Plan
*Last updated: 2026-05-25 · Version 1.0*

This document describes the security architecture of KADO trading platform. Designed for: investor due diligence, security review, SOC2 readiness baseline.

---

## 1. Threat model

**Asset hierarchy (most to least sensitive):**

| Asset | Sensitivity | Where stored |
|---|---|---|
| User Bybit API keys | **CRITICAL** | DB encrypted (Fernet AES-256) |
| User passwords | **CRITICAL** | DB hashed (bcrypt cost=12) |
| Admin account credentials | **CRITICAL** | DB hashed (bcrypt cost=12) + 2FA TOTP |
| Trade ledger (trade_events) | **HIGH** | DB plaintext + encrypted backups |
| User PII (email, IP) | **HIGH** | DB plaintext + GDPR considerations |
| Admin audit log | **HIGH** | Hash-chained, tamper-evident |
| Application form data | **MEDIUM** | DB plaintext |
| Public PnL stats | **PUBLIC** | /track-record (no PII) |

**Threat actors considered:**

- External attacker — credential stuffing, XSS, CSRF, supply chain
- Insider (cofounder w/ partial access) — role-based perms limit blast radius
- Compromised VPS root — Fernet keys + admin sessions still need passwords
- Lost laptop / stolen device — 2FA TOTP requirement + 8h session expiry
- Cloud provider breach — encrypted backups separate from primary

---

## 2. Defense in depth

### 2.1 Transport
- **HTTPS only** via Cloudflare SSL (TLS 1.3, HSTS)
- HTTP redirected to HTTPS at edge
- Cloudflare WAF for basic OWASP rules
- Cloudflare DDoS protection (free tier)

### 2.2 Authentication

#### 2.2.1 SaaS users
- bcrypt password hashing (cost=12)
- JWT HS256 access tokens (24h expiry, `jti` revocation supported)
- Optional 2FA TOTP (pyotp) on user accounts
- Email OTP for sensitive ops
- Rate limit: 10 login attempts/60s per IP

#### 2.2.2 Admin users
- Separate `admin_users` table from SaaS `users`
- bcrypt cost=12 password
- **2FA TOTP mandatory** for live admin login
- 8-hour session expiry (vs 24h for users)
- Account lockout: 5 failed attempts → 15 min lock
- Optional per-account IP allowlist (CIDR)
- Optional global `ADMIN_IP_ALLOWLIST` env (defense in depth)

#### 2.2.3 Session storage
- **httpOnly Secure SameSite=Strict cookies** for admin sessions
- localStorage NOT used for admin tokens (XSS-immune)
- Session tokens are 256-bit random hex (`secrets.token_hex(32)`)
- Stored server-side in memory dict, expires on TTL
- Logout invalidates session immediately

### 2.3 Authorization

Role-based access control on `admin_users.role`:

| Permission | admin | ops | viewer |
|---|---|---|---|
| read (dashboards) | ✓ | ✓ | ✓ |
| write (CRM, apps) | ✓ | ✓ | ✗ |
| restart_services | ✓ | ✓ | ✗ |
| billing | ✓ | ✗ | ✗ |
| manage_users (admin_users CRUD) | ✓ | ✗ | ✗ |

Each endpoint declares required permission. `require_perm('billing')` blocks unauthorized requests at FastAPI dependency level.

### 2.4 Encryption at rest

| Data | Method | Key location |
|---|---|---|
| User API keys (Bybit) | Fernet (AES-128-CBC + HMAC-SHA256) | `.env` `FERNET_KEY` |
| Admin TOTP secrets | Fernet | `.env` `FERNET_KEY` |
| Audit log details | Fernet | `.env` `FERNET_KEY` |
| Encrypted backups | Fernet | `.env` `BACKUP_KEY` (separate from primary) |
| User passwords | bcrypt cost=12 | — (one-way hash) |
| Admin passwords | bcrypt cost=12 | — (one-way hash) |

### 2.5 Encryption in transit

- All endpoints HTTPS (Cloudflare TLS 1.3)
- WebSocket connections WSS only
- Bybit API calls HTTPS (ccxt enforces)
- Telegram Bot API HTTPS

### 2.6 Backups

- `tools/encrypted_backup.py` runs hourly via systemd timer
- AES-256 encryption with separate `BACKUP_KEY`
- Storage path: `/opt/botgrid/backups/encrypted/{ts}.sqlite.enc`
- Retention policy:
  - Hourly: last 24 hours
  - Daily: last 7 days
  - Weekly: last 4 weeks
  - Monthly: last 12 months
- Restore tested via `encrypted_backup.py restore <file>` (writes to sibling, never overwrites)
- Off-site backup (Cloudflare R2 sync) — **planned post-Series A**

### 2.7 Audit logging

Tamper-evident hash chain in `admin_audit_log` table:

```
prev_hash → SHA256(prev_hash + json(payload)) → row_hash
```

Logged events:
- admin_login_ok, admin_login_failed, admin_2fa_failed
- admin_user_created, admin_role_changed, admin_user_disabled
- admin_2fa_enabled
- billing_run (with safety snapshot)
- application_status_changed
- outreach_status_changed

Each row encrypts `detail` payload via Fernet. Tampering requires re-computing every subsequent `row_hash` — detectable on audit playback.

### 2.8 Drift safety (financial integrity)

- `modules/billing_guard.py` enforces: no invoice issued if `trade_events` PnL diverges from Bybit reality by > $5
- Pre-flight gate inside `billing_cron_weekly.py` — every billing path (cron, manual, API) checks drift before charging
- Daily reconciliation cron (`reconcile_daily.py`) sends TG alert on any drift change
- Event-sourced architecture: all billable PnL derives from immutable `trade_events` (raw Bybit payload preserved)

---

## 3. Operational controls

### 3.1 Access control
- VPS SSH key-only (no password auth)
- UFW firewall (only 22, 80, 443 open)
- fail2ban for SSH brute-force protection
- Cloudflare WAF rules:
  - Block known malicious IPs
  - Block scrapers without UA
  - Rate limit /api/* at edge

### 3.2 Deployment
- Code reviewed before push to main (solo dev currently → self-review)
- All deploys via git (audit trail in commit log)
- No direct database edits in production except via documented scripts
- Environment variables in `.env` (file mode 600, never committed)

### 3.3 Monitoring
- `tools/bot_health.py` cron */10 min — alerts if services down
- `tools/sync_health.py` cron 23:50 UTC — alerts on drift OR ingestor silent
- `tools/loss_monitor.py` cron */5 min — alerts on unrealized loss thresholds
- All alerts to owner TG via `kado-userbot`

### 3.4 Incident response
**On detected breach:**
1. Run `python tools/admin_setup.py disable <username>` for compromised accounts
2. Rotate `FERNET_KEY` (requires DB re-encrypt — runbook in repo)
3. Force-logout all sessions: restart `crypto-web` service
4. Review `admin_audit_log` for last 30d
5. Notify affected users within 72h (GDPR Art. 33 if applicable)

---

## 4. Compliance posture

### 4.1 Current state
- **Non-custodial** — KADO never holds user funds, only orchestrates via user-provided API keys
- **API keys scoped** — recommend `Read` + `Contract Trade` only (no Withdraw permission required)
- **GDPR-aware** — user email + IP stored; deletion request endpoint planned
- **No EU residency obligations** yet (no EU users targeted specifically)

### 4.2 SOC2 readiness checklist (Type I baseline)

| Control | Status |
|---|---|
| CC6.1 — Logical access controls | ✓ AdminUser table + roles + 2FA |
| CC6.2 — User registration / removal | ✓ admin_setup.py CLI |
| CC6.3 — Role-based permissions | ✓ _PERMS matrix |
| CC6.6 — Failed access tracking | ✓ failed_attempts + lockout |
| CC6.7 — Session management | ✓ httpOnly cookies + TTL |
| CC6.8 — Data transmission encryption | ✓ HTTPS via Cloudflare |
| CC7.2 — System monitoring | ✓ bot_health + sync_health |
| CC7.3 — Incident response | ⚠️ Documented (this section) |
| CC8.1 — Change management | ⚠️ Git-based (no formal CR process) |
| A1.2 — Confidentiality of data | ✓ Fernet encryption + bcrypt |
| A1.3 — Backup procedures | ✓ Encrypted backups w/ retention |

### 4.3 Pending pre-Series A
- Penetration test (recommended after $50K MRR)
- SOC2 Type I audit (recommended after $250K ARR)
- Off-site backup replication (Cloudflare R2)
- Formal change-request process when team > 5 people
- Regulatory opinion letter (US SEC, EU MiCA implications)

---

## 5. Key rotation & secret management

| Secret | Rotation cadence | Procedure |
|---|---|---|
| `FERNET_KEY` | Yearly | Re-encrypt DB in maintenance window |
| `BACKUP_KEY` | Yearly | New key → new encrypts only; keep old for restore |
| `JWT_SECRET_KEY` | Yearly | Invalidates all user sessions |
| `BYBIT_API_KEY` (per-user) | User-controlled | Renewed by user via dashboard |
| `TEAM_BOT_TOKEN` | On suspected leak | @BotFather regenerate |
| Admin user passwords | Quarterly | Forced reset via admin_setup.py |
| TOTP secrets | On device loss | Disable + re-enroll |

All secrets stored in `/opt/botgrid/.env` with file mode `600`. Never committed to git (`.gitignore` enforces). 

---

## 6. Architecture diagram

```
                         ┌─────────────────────────┐
                         │  Cloudflare (TLS+WAF)   │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │ FastAPI (uvicorn) :8000 │
                         │ /admin/* require        │
                         │   - cookie session      │
                         │   - role permission     │
                         │   - IP allowlist (opt)  │
                         └────────────┬────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
┌───────▼──────┐           ┌──────────▼──────────┐         ┌───────▼──────┐
│ SQLite WAL   │           │ trade_events ledger │         │ Bot services │
│ - encrypted  │           │ (immutable)         │         │ (5 active)   │
│   API keys   │           │ + Bayesian quality  │         │              │
│ - bcrypt pw  │           │ + reconcile cron    │         │              │
└──────┬───────┘           └──────────┬──────────┘         └──────────────┘
       │                              │
       ▼                              ▼
┌──────────────┐           ┌─────────────────────┐
│ Encrypted    │           │ Bybit V5 API        │
│ backups      │◄──────────│ (audit-traceable)   │
│ (Fernet)     │           │                     │
└──────────────┘           └─────────────────────┘
```

---

## 7. Contacts

- Security disclosure: glorimanunited@gmail.com
- Owner Telegram: @Poxcoin
- Repository: https://github.com/Poxcoin/botgrid
- Status page: https://kadoclub.net/track-record (public verified data)

---

*This document is versioned in `docs/SECURITY_PLAN.md`. Last reviewed 2026-05-25. Next scheduled review: 2026-08-25 (quarterly).*
