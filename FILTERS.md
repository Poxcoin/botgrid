# Bot Filters Registry

Single source of truth for all behaviour-modifying filters across the Kado trading bots. Config lives in `bot_filters.json`; this doc explains each entry's rationale and removal criteria.

**Council rule (2026-05-22):** maximum **3 active enforced filters per bot**. New filter beyond cap requires explicit Council approval.

## Filter modes

- `enforced: true` — filter is active, signals are blocked/modified
- `enforced: false, shadow: true` — filter logs would-have-blocked decisions but does NOT enforce; used for collecting validation data
- Filter removed entirely from JSON = no longer active

## Filter lifecycle

```
proposed → shadow (14d data collection) → enforced ⇄ removed
```

Each filter MUST have:
1. **hypothesis** — what we believe will happen
2. **evidence** — what data backs this hypothesis (or "defensive — no data needed")
3. **removal_when** — concrete condition that triggers reconsideration
4. **added** — date applied

---

## Active enforced filters by bot

### Global (apply across all bots)

| Filter | Threshold | Why |
|--------|-----------|-----|
| `consecutive_loss_cooldown` | 3 SL in 4h → 6h pause per source | Defensive circuit-breaker against regime mismatch cascades |
| `live_signal_only` | Live keys can only route to news/dex sources | $220 live account protected until 14d shadow validation of other bots |

### Signal (news bot)

| Filter | Setting | Why |
|--------|---------|-----|
| `score_squared_sizing` | `scale = max(0.25, min((score/10)², 1.75))` | Stronger signals get bigger size |
| `tp_sl_from_actual_fill` | TP=LastPrice, SL=MarkPrice | THE inflection-point fix (2026-05-19 21:06 UTC). Never remove. |

### Sweep

| Filter | Setting | Why |
|--------|---------|-----|
| `single_symbol_eth` | Only ETH | SOL/BTC/XRP/LINK had bad backtest; ETH-only minimizes risk |
| `atr_floor_sl` | sl_pct = max(static, 1.5 × ATR(14, 1h)) | Sweep extensions can exceed static SL buffer |

### Orderblock

| Filter | Setting | Why |
|--------|---------|-----|
| `atr_floor_sl` | sl_pct = max(static, 1.5 × ATR(14, 4h)) | Static 0.2% buffer < BTC 4h ATR = stop hunt magnet |

### Orderflow

| Filter | Setting | Why |
|--------|---------|-----|
| `trading_disabled` | `ORDERFLOW_TRADING=False` | Net -$222 / 33% WR on n=18. Off until thesis rewrite OR inverted-direction paper test |

---

## Shadow filters (logging only, NOT enforced)

These collect 14-day data to decide whether to enforce or remove:

| Bot | Filter | Decision criteria |
|-----|--------|-------------------|
| news | `score_threshold` raise 6.0→7.0 | enable if filtered-subset WR ≥ unfiltered + 5pp AND PF > 1.5 |
| sweep | `tod_filter_asia` (block 03-07 UTC) | enable if 03-07 UTC trades show negative expectancy on n≥10 |
| orderblock | `tod_filter_asia` (block 03-07 UTC) | same as sweep |
| orderflow | `tod_filter_asia` (block 03-07 UTC) | same as sweep (applies when re-enabled) |

---

## How to add a new filter

1. **Open a Council discussion** if it's the bot's 4th+ filter
2. Add JSON entry with all 4 required fields (hypothesis/evidence/removal_when/added)
3. Default to `enforced: false, shadow: true` for any filter without solid backtest evidence
4. Add row to this doc under appropriate section
5. Commit reference + date in code comment where filter is applied

## How to remove a filter

1. Verify removal criteria met (check `removal_when`)
2. Set `enforced: false` (don't delete entry — keep history)
3. Add `removed: YYYY-MM-DD` field with reason
4. Update this doc, strike through the row
5. If removed because it didn't work, add lesson to `memory/feedback_*.md`

## Audit log (changes to this file)

| Date | Change | Author |
|------|--------|--------|
| 2026-05-22 | Initial creation per Council verdict on WR improvement plan | Claude (autonomous) |

## Related memory entries

- `project_wr_improvement_plan.md` — Council verdict that mandated this registry
- `project_tpsl_fix_inflection.md` — the validated fix referenced by `tp_sl_from_actual_fill`
- `project_council_round_may21.md` — original Council on bot configs
- `feedback_signal_edge_per_user.md` — why "WR" must always be per-user, not portfolio-aggregated
