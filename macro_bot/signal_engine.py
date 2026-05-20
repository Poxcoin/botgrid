"""
Signal generation logic.

Each macro event has:
  - direction_rule: how the deviation maps to USD direction
  - historical_std: typical surprise size (for normalizing deviation)
  - instruments: list of what to trade on this event

Direction rules:
  "usd_up_on_hot"  → actual > forecast → USD strengthens → SHORT USD-quote pairs (EUR/USD, GBP/USD, XAU/USD)
  "usd_down_on_hot"→ actual > forecast → USD weakens    → LONG USD-quote pairs

Note: USD-base pairs (USD/JPY, USD/CHF) are NOT included to avoid direction ambiguity.
Gold (XAU/USD) behaves like a USD-quote pair: hot US data = USD up = gold down = SHORT.
"""
import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("macro.signal")


@dataclass
class Signal:
    event:       str
    instrument:  str
    direction:   str        # "LONG" or "SHORT" (for the instrument)
    deviation:   float      # in sigma
    strength:    float      # 0.0 – 1.0
    actual:      float
    forecast:    float
    description: str
    sl_pips:     float = 0.0   # 0 = use global config default
    tp_pips:     float = 0.0


# Per-event configuration
# historical_std: typical surprise size (used to normalize deviation into sigma)
# instruments: traded pairs — all are USD-quote (hot USD = SHORT)
# instrument_params: optional per-instrument SL/TP override (pips)
#   XAUUSD uses wider TP: Gold momentum carries 40-80 pips on strong data
#   (forex: SL=20/TP=35 default; gold: SL=25/TP=55)
_GOLD_PARAMS = {"sl_pips": 25, "tp_pips": 55}

EVENT_CONFIG = {
    # ── Inflation ──────────────────────────────────────────────────────────
    "CPI m/m": {
        "instruments":    ["EURUSD", "GBPUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  0.15,
        "min_deviation":   0.3,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    "Core CPI m/m": {
        "instruments":    ["EURUSD", "GBPUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  0.12,
        "min_deviation":   0.3,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    "CPI y/y": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  0.2,
        "min_deviation":   0.4,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    "PCE Price Index m/m": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  0.1,
        "min_deviation":   0.3,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    "Core PCE Price Index m/m": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  0.1,
        "min_deviation":   0.3,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    "PPI m/m": {
        "instruments":    ["EURUSD", "XAUUSD"],   # was EURUSD only
        "rule":           "usd_up_on_hot",
        "historical_std":  0.2,
        "min_deviation":   0.5,
        "instrument_params": {"XAUUSD": {"sl_pips": 25, "tp_pips": 45}},
    },
    # ── Employment ────────────────────────────────────────────────────────
    "NFP": {
        "instruments":    ["EURUSD", "GBPUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  80_000,
        "min_deviation":   0.4,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    "Non-Farm Employment Change": {
        "instruments":    ["EURUSD", "GBPUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  80_000,
        "min_deviation":   0.4,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    # ADP: precursor to NFP; Gold reacts ~60% as strongly
    "ADP Non-Farm Employment Change": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  50_000,
        "min_deviation":   0.5,
        "instrument_params": {"XAUUSD": {"sl_pips": 22, "tp_pips": 45}},
    },
    # Jobless Claims: high claims = bad economy = USD weak = Gold LONG
    # hot data (high claims) → USD DOWN → rule is inverted
    "Initial Jobless Claims": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_down_on_hot",   # more claims = USD weaker
        "historical_std":  20_000,
        "min_deviation":   0.6,                # needs bigger surprise (weekly noise)
        "instrument_params": {"XAUUSD": {"sl_pips": 20, "tp_pips": 40}},
    },
    # ── Activity / Growth ─────────────────────────────────────────────────
    "Prelim GDP q/q": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  0.5,
        "min_deviation":   0.6,
        "instrument_params": {"XAUUSD": _GOLD_PARAMS},
    },
    "ISM Manufacturing PMI": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  2.0,
        "min_deviation":   0.5,
        "instrument_params": {"XAUUSD": {"sl_pips": 20, "tp_pips": 40}},
    },
    "ISM Services PMI": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  2.0,
        "min_deviation":   0.5,
        "instrument_params": {"XAUUSD": {"sl_pips": 20, "tp_pips": 40}},
    },
    "Retail Sales m/m": {
        "instruments":    ["EURUSD", "XAUUSD"],
        "rule":           "usd_up_on_hot",
        "historical_std":  0.4,
        "min_deviation":   0.5,
        "instrument_params": {"XAUUSD": {"sl_pips": 20, "tp_pips": 40}},
    },
    # FOMC Rate Decision — DISABLED: backtest 16.7% WR, -10 pips (2026-05-20)
    # "Federal Funds Rate" and "FOMC Rate Decision" removed from EVENT_CONFIG.
    # High statement uncertainty + initial fake-outs make algo entry unreliable.
}


def parse_forecast(raw: str) -> Optional[float]:
    """Converts '0.3%', '200K', '-0.1' → float"""
    if not raw or raw in ("", "—", "-"):
        return None
    raw = raw.strip().replace("%", "").replace(",", "")
    multiplier = 1.0
    if raw.upper().endswith("K"):
        multiplier = 1_000
        raw = raw[:-1]
    elif raw.upper().endswith("M"):
        multiplier = 1_000_000
        raw = raw[:-1]
    try:
        return float(raw) * multiplier
    except ValueError:
        return None


def generate_signals(
    event_name: str,
    actual: float,
    forecast: float,
) -> list[Signal]:
    """Returns one Signal per configured instrument for this event."""
    config = EVENT_CONFIG.get(event_name)
    if not config:
        log.warning("No config for event: %s", event_name)
        return []

    std     = config["historical_std"]
    min_dev = config["min_deviation"]
    rule    = config["rule"]
    instruments = config.get("instruments", [config.get("instrument", "EURUSD")])

    deviation = (actual - forecast) / std

    log.info(
        "Event=%s actual=%.4f forecast=%.4f deviation=%.2fσ",
        event_name, actual, forecast, deviation
    )

    if abs(deviation) < min_dev:
        log.info("Deviation %.2fσ below threshold %.2f — no trade", deviation, min_dev)
        return []

    instrument_params = config.get("instrument_params", {})
    signals = []
    for instrument in instruments:
        if rule == "usd_up_on_hot":
            if deviation > 0:
                direction = "SHORT"
                desc = (f"Hot {event_name} ({actual} vs {forecast}) "
                        f"→ USD up → SHORT {instrument}")
            else:
                direction = "LONG"
                desc = (f"Cold {event_name} ({actual} vs {forecast}) "
                        f"→ USD down → LONG {instrument}")
        elif rule == "usd_down_on_hot":
            if deviation > 0:
                direction = "LONG"
                desc = f"Hot {event_name} → LONG {instrument}"
            else:
                direction = "SHORT"
                desc = f"Cold {event_name} → SHORT {instrument}"
        else:
            continue

        strength = min(abs(deviation) / 2.0, 1.0)
        iparams = instrument_params.get(instrument, {})
        signals.append(Signal(
            event=event_name,
            instrument=instrument,
            direction=direction,
            deviation=deviation,
            strength=strength,
            actual=actual,
            forecast=forecast,
            description=desc,
            sl_pips=iparams.get("sl_pips", 0.0),
            tp_pips=iparams.get("tp_pips", 0.0),
        ))

    return signals


def generate_signal(
    event_name: str,
    actual: float,
    forecast: float,
) -> Optional[Signal]:
    """Backward-compatible wrapper — returns first signal only."""
    signals = generate_signals(event_name, actual, forecast)
    return signals[0] if signals else None
