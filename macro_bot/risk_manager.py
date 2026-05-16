"""
Position sizing and risk management.

Formula: units = (balance * risk_pct * strength) / (sl_pips * pip_value_per_unit)

For EUR/USD:
  1 unit = 1 EUR
  pip_value = $0.0001/unit
  1 standard lot = 100,000 units = $10/pip
"""
import logging
from dataclasses import dataclass

log = logging.getLogger("macro.risk")


@dataclass
class TradeParams:
    units:   int    # positive = LONG, negative = SHORT
    sl_pips: float
    tp_pips: float
    risk_usd: float


PIP_VALUE_PER_UNIT = {
    "EUR_USD": 0.0001,
    "GBP_USD": 0.0001,
    "USD_JPY": 0.01 / 1.0,   # approx, needs current USD/JPY
    "USD_CHF": 0.0001,
    "AUD_USD": 0.0001,
    "NZD_USD": 0.0001,
}


def calculate_trade(
    balance: float,
    risk_pct: float,
    signal_strength: float,
    direction: str,          # "LONG" or "SHORT"
    instrument: str,
    sl_pips: float,
    tp_pips: float,
    min_units: int = 1_000,
    max_units: int = 500_000,
) -> TradeParams:

    pip_val = PIP_VALUE_PER_UNIT.get(instrument, 0.0001)
    risk_usd = balance * risk_pct * signal_strength

    raw_units = int(risk_usd / (sl_pips * pip_val))
    units = max(min_units, min(raw_units, max_units))

    if direction == "SHORT":
        units = -units

    log.info(
        "Position: balance=%.2f risk=%.1f%% strength=%.2f → %d units (risk $%.2f)",
        balance, risk_pct * 100, signal_strength, units, risk_usd
    )

    return TradeParams(
        units=units,
        sl_pips=sl_pips,
        tp_pips=tp_pips,
        risk_usd=round(risk_usd, 2),
    )


def breakeven_threshold_pips(tp_pips: float) -> float:
    """Move SL to breakeven when price reaches this profit (in pips)."""
    return tp_pips * 0.5
