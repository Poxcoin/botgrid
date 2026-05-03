# Stripe Billing — Design Spec
**Date:** 2026-05-03  
**Status:** Approved

## Overview

Implement subscription billing for kadoclub.net using Stripe Hosted Checkout.  
Users start with a 7-day free trial, then choose a plan. Performance-only plan users pay 20% of monthly realized profit, billed via Stripe Invoice on the 1st of each month with high-water mark protection.

---

## Plans

| Plan | Monthly Fee | Performance Fee | Bots Available |
|------|------------|-----------------|----------------|
| Trial | $0 (7 days) | — | Grid only |
| Free (expired trial) | $0 | — | None |
| Basic Flat | $29/mo | — | Grid + News |
| Pro Flat | $79/mo | — | All 6 bots |
| Performance | $0/mo | 20% of net monthly profit | All 6 bots |

Trial expires → user drops to `free` (no bots). Must subscribe to continue.

---

## User Flow

```
Register → 7-day trial (grid bot) → trial expires → choose plan →
  Flat: Stripe Checkout → payment → webhook → plan activated
  Performance: Stripe Checkout (setup intent, $0) → webhook → plan activated
```

Subscription management: Stripe Customer Portal (cancel, update card, view invoices).

---

## Backend: New Endpoints (web_server.py)

### POST /api/billing/checkout
- Auth: require_any_auth
- Body: `{ "plan": "basic" | "pro" | "performance" }`
- Creates Stripe Checkout Session (subscription for flat, setup for performance)
- Returns `{ "url": "https://checkout.stripe.com/..." }`

### POST /api/billing/portal
- Auth: require_any_auth
- Creates Stripe Customer Portal session for existing customer
- Returns `{ "url": "https://billing.stripe.com/..." }`

### POST /api/webhooks/stripe
- No auth (verified via Stripe-Signature header + webhook secret)
- Handles events:
  - `customer.subscription.created/updated` → activate plan in DB
  - `customer.subscription.deleted` → downgrade to free
  - `invoice.payment_failed` → set status=past_due, notify user via TG
  - `checkout.session.completed` → store stripe_customer_id

### POST /api/billing/invoice-performance  (internal, called by cron)
- Secret header auth
- For each active performance-plan user:
  - Query `analytics.db` for realized PnL this month
  - Apply high-water mark (`subscriptions.hwm_usd`)
  - If net profit > 0: create Stripe Invoice item (20%), finalize, send
  - Update `hwm_usd`

---

## Database Changes

### users table
```sql
ALTER TABLE users ADD COLUMN trial_ends_at DATETIME;
-- Set on register: NOW() + 7 days
```

### subscriptions table
```sql
ALTER TABLE subscriptions ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE subscriptions ADD COLUMN stripe_price_id TEXT;
ALTER TABLE subscriptions ADD COLUMN hwm_usd REAL DEFAULT 0.0;
-- stripe_sub_id already exists
```

### Migration script: migrate_billing.py

---

## Frontend Changes

### SettingsTab.jsx
- If trial active: show countdown ("Trial: X days left") + "Choose Plan" button
- If subscribed flat: show plan name + next billing date + "Manage Subscription" button → portal
- If subscribed performance: show "Performance plan" + this month PnL + estimated fee
- If free (expired): show "Subscribe to continue" banner

### PricingPage.jsx  
- Each plan card: "Start" button → POST /api/billing/checkout → redirect to Stripe URL
- Performance plan card: explain the 20% model + high-water mark

---

## Cron Job

File: `billing_cron.py`  
Schedule: systemd timer, runs 1st of each month at 00:05 UTC

```
For each user with plan=performance AND status=active:
  1. Sum realized PnL from analytics.db for past month
  2. Compute adjusted_profit = max(0, monthly_pnl - max(0, -hwm_usd))
  3. If adjusted_profit > 0:
     a. Create Stripe InvoiceItem: adjusted_profit * 0.20
     b. Finalize and auto-charge invoice
     c. Update hwm_usd += monthly_pnl
  4. Else:
     a. Update hwm_usd += monthly_pnl (can go negative)
```

---

## Environment Variables (new)

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASIC=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PERFORMANCE_CRON_SECRET=<random string>
```

---

## Plan Enforcement

`saas_dispatcher.py` already checks `user.plan`. Add `trial` to PLAN_BOTS:
```python
PLAN_BOTS = {
    "trial":       {"grid"},
    "free":        set(),
    "basic":       {"grid", "news"},
    "pro":         {"grid", "news", "fr", "listing", "whale", "dex"},
    "performance": {"grid", "news", "fr", "listing", "whale", "dex"},
}
```

`user.is_pro` → update to check: plan in {pro, performance} AND subscription active.  
`user.plan` for trial users = "trial" while `trial_ends_at > now`.

---

## Error Handling

- Stripe API down → log error, return 503, do NOT update DB
- Webhook signature mismatch → return 400, log
- Invoice creation fails → retry next day, notify admin via TG
- Trial expiry: checked on each `/api/users/me` call (lazy expiry, no cron needed)

---

## Security

- Webhook verified via `stripe.Webhook.construct_event()` — no signature = 400
- Cron endpoint protected by secret header `X-Cron-Secret`
- No card data ever touches our server (Stripe Hosted only)
- `stripe_customer_id` stored in DB, never logged

---

## Out of Scope (v1)

- Coupon codes / discounts
- Annual billing
- Multiple seats / team plans
- Invoice PDF download
- Refund automation
