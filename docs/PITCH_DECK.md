# KADO — Pitch Deck Content
*Copy-paste into Pitch.com, Google Slides, Notion, або Figma.*

---

## Slide 1 — Title

```
KADO
AI Trading Platform with Event-Sourced Billing

Pre-seed · Bootstrapped to date · Building YC W27

kadoclub.net
@Poxcoin · glorimanunited@gmail.com
2026
```

---

## Slide 2 — Problem

```
Retail crypto trading bots are broken.

• 95% of bot platforms fake their performance with backtest screenshots
• No defensible accounting — users can't verify claimed PnL
• Billing happens on opaque numbers nobody trusts
• Performance fees uncollected because trust is broken

$30B retail crypto users want algo trading.
$0 retail bot platforms have audit-ready infrastructure.
```

---

## Slide 3 — Solution

```
KADO is the first retail trading platform with banking-grade billing.

Event-sourced architecture (banking pattern):
• Every Bybit event captured as immutable raw payload
• User PnL derived from append-only ledger
• Drift vs exchange truth = $0.00 verified daily

→ Billing defensible in court
→ User trust = traction (currently impossible at scale)
→ Pricing = 25% of net new profits only (no fee on losses)
```

---

## Slide 4 — Unique Asset #1: Regret Engine

```
We measure counterfactual PnL of signals our filters BLOCKED.

When the engine sees we're rejecting winners → auto-tunes filter thresholds.
When we're catching losers → tightens filters.

Academic methodology (regret minimization) applied to live capital.

No retail bot platform does this. Industry checked.

This is our technical moat.
```

---

## Slide 5 — Unique Asset #2: Bayesian Source Quality

```
Every signal source (news AI, smart wallets, liquidations, sweeps) has
Beta-Binomial posterior tracking win rate over time.

Sources with posterior_mean < break-even → auto-demoted to paper mode.
Sources with edge >+5pp → graduated to live capital.

This isn't a "we'll add ML someday" promise.
It's running daily on production. Status report goes to founder's Telegram.

Verified: news source 60% WR, +30pp edge above break-even.
```

---

## Slide 6 — Live Track Record

```
kadoclub.net/track-record (public, updates every minute)

Day [X] of 90 track record window
Total trades: [N] (event-sourced, Bybit-verified)
Win rate: [X]%
Total PnL: $[X]

Per-source breakdown:
  news       — [X]% WR, +$[X]  (only validated edge)
  smartmoney — paper-only (under observation)
  cascade    — paper-only
  trend      — paper-only (new)

Methodology: derived from trade_events immutable ledger.
Drift vs Bybit truth: $0.00 (verified daily).
```

---

## Slide 7 — Why Now

```
Three convergent tailwinds:

1. AI + Crypto convergence
   $50B+ in AI trading startups 2024-2025
   Y Combinator W26 batch: 18% AI+fintech

2. Regulatory clarity emerging
   MiCA (EU) live
   SEC guidance on crypto SaaS clearer
   Non-custodial SaaS = lower regulatory burden

3. Retail discontent with existing bots
   3Commas, Bitsgap, etc. = old infrastructure
   No trust-defensible accounting
   No proprietary AI methodology
```

---

## Slide 8 — Business Model

```
Performance fee only — 0% management fee.

User keeps custody. Bot connects via API to user's Bybit/OKX account.
We never touch funds.

Pricing tiers:
• Trial:        free, 7 days
• Free:         dashboard + signals view, no execution
• Performance:  25% of net new profits, no upfront

Customer Acquisition:
• Telegram-native onboarding (@KADO_c_BOT)
• CAC near $0 (organic referral + crypto Twitter)
• 6-language i18n (UA/RU/EN/ES/DE/ZH)
```

---

## Slide 9 — Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Bybit / OKX (source of truth)                          │
│        ↓                                                │
│  Event ingestor (REST poll + WebSocket)                 │
│        ↓                                                │
│  trade_events (immutable ledger, audit trail)           │
│        ↓                                                │
│  Materialized views: user_trades, monthly_pnl, billable │
│        ↓                                                │
│  Drift guard → blocks billing if exchange diverges      │
│        ↓                                                │
│  Stripe/USDT settlement → user invoiced                 │
└─────────────────────────────────────────────────────────┘

Stack: FastAPI · React · SQLite WAL · ccxt · Telethon · Claude Haiku
Deployment: Hetzner VPS · Cloudflare WAF · single binary deploy
```

---

## Slide 10 — Traction & Metrics

```
Today (Day [X] / 90):
• 2 demo users ($30K combined AUM)
• 5 active strategies in production
• Event-sourced billing: 100% accurate vs Bybit
• 1 pre-validated source (news bot, 60% WR)
• 4,797 archived news (proprietary AI dataset)

Path to Series A (12 months):
• 500 paying subscribers
• $250K ARR
• ML cofounder hired
• 90+d sustained Sharpe > 1.5
```

---

## Slide 11 — Team

```
[Founder name] — Solo CEO/Engineer
• Built KADO from scratch (FastAPI/React/event-sourcing)
• [Background — fill in: trading experience, prior projects]
• Telegram: @Poxcoin

Hiring (in process):
• ML / AI Co-Founder (5-15% equity)
• Senior Backend Engineer
• Quant Researcher
• Growth Lead

Public careers page: kadoclub.net/careers
```

---

## Slide 12 — The Ask

```
Raising: $200K - $500K SAFE
Use of funds:
   60% — ML cofounder + 2 engineers (12 month runway)
   15% — Llama fine-tune compute + Claude API
   10% — SOC2 audit + regulatory opinion
   10% — Growth experiments (paid Telegram, crypto Twitter)
    5% — Legal + admin

Terms: discussed 1:1
Looking for: 3-5 angels at $50-100K OR 1 lead at $250K+

Bonus if you bring:
   • Crypto/fintech operating experience
   • ML/AI venture connections
   • Y Combinator partner introductions

Contact:
   @Poxcoin (Telegram)
   glorimanunited@gmail.com
   Apply: kadoclub.net/apply/investor
```

---

## Notes for using this deck

**Tools to render:**
- **Pitch.com** — paste each slide content, pick template
- **Google Slides** — manual but free
- **Notion** — collaborative, one-page format works
- **Tldraw.com** — sketchy whiteboard feel (good for early angels)
- **Figma** — full design control

**Customization checklist before showing to investor:**
- [ ] Fill in actual numbers in Slide 6 + 10 (use /track-record live data)
- [ ] Fill in founder bio Slide 11 (LinkedIn-style summary)
- [ ] Add 1-2 screenshots: /track-record + admin dashboard
- [ ] Add 1 chart from /track-record (cumulative PnL line)
- [ ] Set company logo if you make one (text "KADO" is fine for pre-seed)

**Tone notes:**
- Confident but honest (we have $30K AUM, not $30M — acknowledge it)
- Lead with infrastructure differentiator (Regret Engine + event sourcing)
- Numbers > narratives
- "Build with us" framing for early angels (they buy the team + thesis)

**Common investor questions to prepare:**
1. "Show me the actual PnL" → point to /track-record live
2. "Why no ML cofounder yet?" → "actively recruiting, terms posted publicly"
3. "Why crypto and not stocks?" → "non-custodial SaaS, lower regulatory burden, captive customer pool"
4. "What's your AUM target Year 1?" → "$2M AUM = $40K/y revenue, sufficient to validate"
5. "How is this defensible vs 3Commas?" → "event-sourced billing + Regret Engine — they can't catch up without rewrite"
6. "Token plans?" → "performance fee model first; token only if community demands it post-Series A"
