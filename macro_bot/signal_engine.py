"""
Signal generation logic.

Each macro event has:
  - direction_rule: how the deviation maps to USD direction
  - historical_std: typical surprise size (for normalizing deviation)
  - instrument: what to trade on this event

Direction rules:
  "usd_up_on_hot"  → actual > forecast → USD strengthens → SHORT EUR/USD
  "usd_down_on_hot"→ actual > forecast → USD weakens    → LONG EUR/USD
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


# Per-event configuration
# historical_std: typical month-over-month surprise size
EVENT_CONFIG = {
    "CPI m/m": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.15,   # typical CPI surprise = 0.1-0.2%
        "min_deviation":  0.3,
    },
    "Core CPI m/m": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.12,
        "min_deviation":  0.3,
    },
    "CPI y/y": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.2,
        "min_deviation":  0.4,
    },
    "NFP": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 80_000,  # typical NFP surprise = 50-100K jobs
        "min_deviation":  0.4,
    },
    "Non-Farm Employment Change": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 80_000,
        "min_deviation":  0.4,
    },
    "PCE Price Index m/m": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.1,
        "min_deviation":  0.3,
    },
    "Core PCE Price Index m/m": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.1,
        "min_deviation":  0.3,
    },
    "PPI m/m": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.2,
        "min_deviation":  0.5,   # PPI → less direct, need stronger signal
    },
    "Prelim GDP q/q": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",   # strong growth = risk-on but USD holds
        "historical_std": 0.5,
        "min_deviation":  0.6,
    },

    # FOMC Rate Decision — Federal Funds Rate
    # actual > forecast = surprise hike → USD strengthens → SHORT EUR/USD
    # actual < forecast = surprise cut  → USD weakens    → LONG  EUR/USD
    # historical_std = 0.25 (one standard 25bp move)
    # min_deviation = 0.6 → need at least 15bp surprise (i.e. unexpected direction)
    "Federal Funds Rate": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.25,
        "min_deviation":  0.6,
    },
    # MT5 calendar may use this alternate name
    "FOMC Rate Decision": {
        "instrument":    "EURUSD",
        "rule":          "usd_up_on_hot",
        "historical_std": 0.25,
        "min_deviation":  0.6,
    },
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


def generate_signal(
    event_name: str,
    actual: float,
    forecast: float,
) -> Optional[Signal]:

    config = EVENT_CONFIG.get(event_name)
    if not config:
        log.warning("No config for event: %s", event_name)
        return None

    std = config["historical_std"]
    min_dev = config["min_deviation"]
    instrument = config["instrument"]
    rule = config["rule"]

    deviation = (actual - forecast) / std

    log.info(
        "Event=%s actual=%.4f forecast=%.4f deviation=%.2fσ",
        event_name, actual, forecast, deviation
    )

    if abs(deviation) < min_dev:
        log.info("Deviation %.2fσ below threshold %.2f — no trade", deviation, min_dev)
        return None

    # Map deviation to trade direction
    if rule == "usd_up_on_hot":
        # hotter than expected → USD up → EUR/USD down → SHORT
        if deviation > 0:
            direction = "SHORT"
            desc = f"Hot {event_name} ({actual} vs {forecast} expected) → USD up → SHORT EUR/USD"
        else:
            direction = "LONG"
            desc = f"Cold {event_name} ({actual} vs {forecast} expected) → USD down → LONG EUR/USD"
    elif rule == "usd_down_on_hot":
        if deviation > 0:
            direction = "LONG"
            desc = f"Hot {event_name} → LONG EUR/USD"
        else:
            direction = "SHORT"
            desc = f"Cold {event_name} → SHORT EUR/USD"
    else:
        return None

    # Strength 0-1: scales position size (caps at 1.0 for 2σ+ moves)
    strength = min(abs(deviation) / 2.0, 1.0)

    return Signal(
        event=event_name,
        instrument=instrument,
        direction=direction,
        deviation=deviation,
        strength=strength,
        actual=actual,
        forecast=forecast,
        description=desc,
    )
