# Orderflow Bot — POSTMORTEM (archived 2026-05-22)

## Killed because

Live performance over n=18 trades = **-$222 net, 33% WR**. Council 2026-05-22
verdict: STRIP-TO-LIBRARY (Alternative 2). Bot dies, infrastructure lives.

## Strategy thesis (mean-revert via market microstructure)

```
LONG  IF price below VWAP + RSI oversold + OI growing + CVD bullish bias
SHORT IF price above VWAP + RSI overbought + OI growing + CVD bearish bias
EXIT  TP / SL or time-stop
```

Sub-signals: AVWAP Bounce, CVD Divergence, OF Classic.

## Why it failed live

1. **Mean-reversion in trending market = SL magnet**. Yesterday alt coins
   (INJ -$114, SOL -$107, LINK -$107, ARB -$78) all dumped — bot kept catching
   falling knives in "oversold" zones that kept getting more oversold.
2. **Symbol selection too wide.** 7 symbols including thin-liquidity alts
   (INJ/ARB/XRP) where stop-hunt noise dominated edge.
3. **Hurst 0.85 regime filter** insufficient to detect strong trends.
4. **R:R 2.0 with WR 33% = essentially zero EV** after fee drag at 5x leverage.

## What was tried

- Hurst 0.90 → 0.85 (Council 2026-05-21 — tighter regime gate)
- LEV 10 → 5x (Council 2026-05-21)
- TP 1.5/2.0% → 2.5% (today)
- SL 0.6/1.0% → 1.5% (today)
- Symbols 7 → BTC+ETH only (today)
- CVD div restricted to ETH only (today)
- Hurst 0.85 still doesn't catch all trends
- Backtester showed +1.21%/mo at 90d but marginal +0.15 raw at 30d on tuned config

## What lives on (Strip-to-Library)

The expensive infrastructure stays:

| Module | Purpose | Reusable by |
|--------|---------|-------------|
| `modules/orderflow_engine.py` | VWAP / OI / CVD / AVWAP / Hurst calc | Sweep (CVD filter), Cascade-Fade (P1), FR arb |
| `modules/cvd_realtime.py` (if exists) | Bybit publicTrade WS for real CVD | Future microstructure bots |
| `backtester_orderflow.py` | Mean-revert backtester | Reference + thesis re-test in different regimes |
| `backtester_orderflow_inverted.py` | Inverted-direction test (REJECTED Alt 3) | Reference |

## Archived files

- `bots/_archive/orderflow_bot.py` — main bot loop (was here)
- `crypto-orderflow.service` disabled (not removed — can re-enable later)

## Conditions for revival

1. Market regime shifts to clearly ranging (Hurst < 0.5 sustained on majors)
2. Backtester shows >65% WR on n>50 in new regime
3. Live mean-revert opportunity confirmed by other indicator (e.g., extreme funding flip)
4. New entry filter that explicitly blocks during macro-event windows

Until any of those, orderflow stays dead.

## Memory links

- `project-tpsl-fix-inflection.md` — TP/SL fix that didn't save orderflow
- `project-backtest-session-2026-05-22.md` — original backtest sweep
- `project-autonomous-sweep-2026-05-22.md` — param tuning before killing
- `feedback-fix-dont-remove.md` — this is an EXCEPTION to the "fix don't remove" rule;
  we DID try to fix (multiple Council rounds), strategy itself is regime-dependent
  and current regime is hostile. Removing the BOT, keeping the INFRA.

— Council verdict 2026-05-22 (Critic 8/10 + Risk Analyst converged on KILL)
