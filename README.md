# Bot Grid — AI-Powered Crypto Trading Bot

> Automated futures trading system with real-time news analysis, multi-source signals, and a web dashboard. Running 24/7 on Bybit Demo with $10,000 virtual balance.

---

## What It Does

Bot Grid monitors **6 real-time data sources**, scores each signal with a **9-factor formula**, and executes futures trades on Bybit — fully automated, no manual input required.

```
Exchange Announcements (< 1ms)  ──┐
Telegram Channels (real-time)   ──┤
Macro RSS News                  ──┼──▶  Signal Scoring  ──▶  Trade Executor
Binance Liquidations (WS)       ──┤     (9 factors)          (Bybit Futures)
Ethereum On-chain (Alchemy WS)  ──┤
Whale Detector (Binance trades) ──┘
```

---

## Key Features

### Signal Pipeline
- **Exchange listing fast-path** — Binance/Bybit new listing announcements trigger LONG in under 1ms, bypassing AI analysis
- **3-layer AI filter** — Groq LLaMA-3.1 (free, 14,400 req/day) pre-screens news → Claude Haiku scores survivors
- **Telegram userbot** — monitors 6 channels (WatcherGuru, lookonchain, whale_alert_io, etc.) in real-time via Telethon
- **On-chain monitoring** — Ethereum whale movements via Alchemy WebSocket

### 9-Factor Scoring Formula
| Factor | Source | Update |
|--------|--------|--------|
| AI Sentiment | Claude Haiku | Per news item |
| Whale Activity | Binance trades | Real-time |
| Price Trend | ccxt OHLCV | 15m candles |
| RSI | ccxt (50×1h) | Per signal |
| Funding Rate | Bybit API | Real-time |
| Open Interest | Bybit API | Real-time |
| Fear & Greed | alternative.me | 1h cache |
| BTC Dominance | CoinGecko | 15m cache |
| On-chain Flow | Alchemy | Real-time |

Entry threshold: **≥11 points** (BTC/ETH) / **≥8 points** (altcoins)

### Risk Management
- 4-hour cooldown per coin (prevents overtrading)
- 30-minute signal deduplication
- Max 5 open positions (main + alt bot combined)
- Daily loss guard: stops trading if −5% of balance lost in one UTC day
- Position auto-close after 4 hours via background monitor
- Macro calendar: reduces position size 60% during FOMC/CPI/NFP

### Altcoin Bot
Separate parallel engine (`altcoin_bot.py`) targeting 12 DeFi/L1/L2 coins with:
- TP: 25% / SL: 5% / Leverage: 2x
- Same announcement fast-path and signal pipeline

### Web Dashboard (Kado)
React/Vite SPA served via FastAPI — available at [kadoclub.net](https://kadoclub.net)

- **Overview** — live balance, open positions, daily P&L
- **History** — all signals with scores, actions, and outcomes
- **Analyzer** — backtest replay from news.db
- **Logs** — live bot output stream

---

## Architecture

```
main.py                          # Signal Engine — orchestrates everything
altcoin_bot.py                   # Altcoin Engine — parallel instance
web_server.py                    # FastAPI — REST API + SPA serving
│
├── modules/
│   ├── news_parser.py           # RSS feed fetcher + keyword gate
│   ├── telegram_monitor.py      # Telethon userbot — TG channel listener
│   ├── exchange_announcements.py # Binance/Bybit listing poller
│   ├── gemini_filter.py         # Groq LLaMA pre-filter
│   ├── ai_analyzer.py           # Claude Haiku sentiment scoring
│   ├── decision_maker.py        # 9-factor score aggregator
│   ├── trader.py                # ccxt order executor (Bybit)
│   ├── market_data.py           # OHLCV, RSI, funding rate, OI
│   ├── onchain_monitor.py       # Alchemy ETH WebSocket
│   ├── liquidation_monitor.py   # Binance liquidation WebSocket
│   ├── position_monitor.py      # Auto-close daemon (4h TTL)
│   ├── daily_guard.py           # Daily loss limit (−5%)
│   ├── macro_calendar.py        # FOMC/CPI/NFP position sizing
│   ├── pnl_tracker.py           # P&L logger (writes to signals_log.json)
│   └── tg_notifier.py           # Telegram trade notifications
│
└── frontend/                    # React/Vite — Kado dashboard
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Python 3.13 |
| Exchange | ccxt (Bybit Demo) |
| AI | Claude Haiku (Anthropic) + Groq LLaMA-3.1 |
| Web | FastAPI + Uvicorn |
| Frontend | React 18 + Vite (Kado) |
| Telegram | Telethon (userbot) + Bot API |
| On-chain | Alchemy WebSocket |
| Database | SQLite (signals, analytics, SaaS) |
| Infrastructure | Hetzner VPS + Cloudflare + Let's Encrypt |
| Process | systemd (3 services: bot, alt, web) |

---

## Backtesting Results (v2)

60-day replay using real news from `news.db`:

| Metric | Value |
|--------|-------|
| Total profit | +$3,118 |
| Win rate | 34.6% |
| EV per trade | +4.26% |
| Breakeven WR | 23% |
| Trades/day | 1.9 |

Filters applied: TREND_PANIC_CAP + RSI gate + 2h cooldown

---

## Setup

```bash
git clone https://github.com/Poxcoin/botgrid.git
cd botgrid
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your API keys
python main.py
```

### Required API Keys

| Key | Where to get |
|-----|-------------|
| `BYBIT_API_KEY` / `BYBIT_SECRET` | Bybit Demo Trading account |
| `CLAUDE_API_KEY` | console.anthropic.com |
| `GROQ_API_KEY` | console.groq.com (free) |
| `ALCHEMY_API_KEY` | alchemy.com (free tier) |
| `TELEGRAM_API_ID/HASH` | my.telegram.org |
| `TG_BOT_TOKEN` | @BotFather |
| `NEWSAPI_KEY` | newsapi.org (free tier) |

---

## Roadmap

- [x] Real-time Telegram monitoring (6 channels)
- [x] Exchange listing fast-path (< 1ms)
- [x] 9-factor signal scoring
- [x] Altcoin parallel engine
- [x] Web dashboard (kadoclub.net)
- [x] HTTPS + Cloudflare
- [ ] Twitter/X monitoring (twikit)
- [ ] Public SaaS — user registration + subscription tiers ($9/$29/$79)
- [ ] Mobile app (React Native)
- [ ] Co-location (Tokyo/Singapore) for HFT

---

## Author

Built by [@Poxcoin](https://github.com/Poxcoin) — open to freelance work in Python automation, crypto bots, and Telegram integrations.
