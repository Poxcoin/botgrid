"""
MT5 client через файловий IPC.

Python пише JSON в macro_orders.json → MacroBridgeEA.mq5 читає і виконує
→ результат в macro_result.json → Python читає.

Files директорія MT5: ~/.wine/.../MetaQuotes/Terminal/Common/Files/
"""
import json
import time
import logging
import os
from pathlib import Path
from typing import Optional

log = logging.getLogger("macro.mt5")

# MT5 Common Files directory (shared між всіма терміналами)
MT5_FILES = Path.home() / ".wine/drive_c/users" / os.getenv("USER", "minus") / \
            "AppData/Roaming/MetaQuotes/Terminal/Common/Files"

ORDER_FILE  = MT5_FILES / "macro_orders.json"
RESULT_FILE = MT5_FILES / "macro_result.json"

TIMEOUT_SEC = 10.0   # max wait for EA response


class MT5Client:
    def __init__(self, files_path: Optional[Path] = None):
        self.files = files_path or MT5_FILES
        self.files.mkdir(parents=True, exist_ok=True)
        self._order_file  = self.files / "macro_orders.json"
        self._result_file = self.files / "macro_result.json"

    def _send(self, payload: dict) -> Optional[dict]:
        """Write order file and wait for EA result."""
        # Clear old result
        self._result_file.unlink(missing_ok=True)

        # Write order
        self._order_file.write_text(json.dumps(payload, separators=(',', ':')), encoding="utf-8")
        log.debug("Sent: %s", payload)

        # Poll for result
        deadline = time.time() + TIMEOUT_SEC
        while time.time() < deadline:
            if self._result_file.exists():
                try:
                    result = json.loads(self._result_file.read_text(encoding="utf-8"))
                    self._result_file.unlink(missing_ok=True)
                    log.debug("Result: %s", result)
                    return result
                except Exception:
                    pass
            time.sleep(0.05)  # 50ms poll

        log.error("Timeout waiting for EA response (%.1fs)", TIMEOUT_SEC)
        return None

    # ── Connection check ─────────────────────────────────────────────────────

    def ping(self) -> Optional[dict]:
        """Returns balance, equity, EUR/USD price if EA is running."""
        return self._send({"action": "ping"})

    def is_connected(self) -> bool:
        result = self.ping()
        return result is not None and result.get("status") == "pong"

    def get_balance(self) -> float:
        result = self.ping()
        return float(result.get("balance", 0)) if result else 0.0

    def get_price(self, symbol: str = "EURUSD") -> Optional[dict]:
        result = self.ping()
        if not result:
            return None
        bid = result.get("eurusd_bid")
        ask = result.get("eurusd_ask")
        if bid and ask:
            pip = 0.01 if "JPY" in symbol else 0.0001
            return {
                "bid": bid,
                "ask": ask,
                "mid": (bid + ask) / 2,
                "spread_pips": round((ask - bid) / pip, 1),
            }
        return None

    # ── Trading ───────────────────────────────────────────────────────────────

    def place_market_order(
        self,
        symbol: str,
        direction: str,    # "LONG" or "SHORT"
        volume: float,     # lots
        sl_pips: float,
        tp_pips: float,
        comment: str = "macro_bot",
    ) -> Optional[dict]:

        result = self._send({
            "action":    "open",
            "symbol":    symbol,
            "direction": direction,
            "volume":    volume,
            "sl_pips":   sl_pips,
            "tp_pips":   tp_pips,
            "comment":   comment,
        })

        if not result:
            return None
        if result.get("status") != "ok":
            log.error("Order failed: %s", result)
            return None

        log.info("Order filled: %s %s %.2f lots @ %s ticket=%s",
                 direction, symbol, volume,
                 result.get("price"), result.get("ticket"))
        return result

    def close_position(self, ticket: int) -> bool:
        result = self._send({"action": "close", "ticket": ticket})
        if not result:
            return False
        ok = result.get("status") == "ok"
        if ok:
            log.info("Closed ticket=%d price=%s profit=%s",
                     ticket, result.get("price"), result.get("profit"))
        else:
            log.error("Close failed: %s", result)
        return ok

    def get_calendar(self) -> list:
        """Returns today's high-impact USD events from MT5 built-in calendar."""
        result = self._send({"action": "calendar"})
        if not result or result.get("status") != "ok":
            return []
        return result.get("events", [])

    # USD value per lot per 1 macro-pip (instrument-dependent)
    # Forex majors: $10/pip/lot (1 lot = 100K units, 0.0001 pip × 100K = $10)
    # XAUUSD: $100/pip/lot (1 lot = 100 oz, $1 pip × 100 oz = $100)
    # XAGUSD: $50/pip/lot  (1 lot = 5000 oz, $0.01 pip × 5000 = $50)
    _PIP_VALUE_PER_LOT: dict[str, float] = {
        "XAUUSD": 100.0,
        "XAGUSD": 50.0,
    }
    _DEFAULT_PIP_VALUE = 10.0  # forex majors

    def calculate_volume(
        self,
        balance: float,
        risk_pct: float,
        strength: float,
        sl_pips: float,
        instrument: str = "EURUSD",
    ) -> float:
        """risk_usd / (sl_pips * pip_value_per_lot) → rounded to 0.01"""
        risk_usd    = balance * risk_pct * strength
        pip_value   = self._PIP_VALUE_PER_LOT.get(instrument, self._DEFAULT_PIP_VALUE)
        lots        = risk_usd / (sl_pips * pip_value)
        return max(0.01, min(round(lots, 2), 5.0))
