"""
Macro Trading Bot — Main Loop

Flow:
  1. On startup: load today's events from ForexFactory
  2. Sleep until 2 minutes before next event
  3. At event time: poll for actual data (BLS / ForexFactory) every 2s for up to 90s
  4. When actual arrives: generate signal → calculate lots → place order via MT5 EA
  5. Track open trade: force-close after EXIT_MINUTES
  6. Repeat
"""
import asyncio
import logging
import sys
from datetime import datetime, timezone
from typing import Optional
import pytz

from config import (
    BLS_API_KEY, FRED_API_KEY,
    RISK_PCT, STOP_LOSS_PIPS, TAKE_PROFIT_PIPS, EXIT_MINUTES,
    MAX_TRADES,
    TG_BOT_TOKEN, TG_CHAT_ID,
)
from mt5_client import MT5Client
from data_fetcher import BLSFetcher, FREDFetcher
from signal_engine import generate_signals, parse_forecast, EVENT_CONFIG
from notifier import send_telegram, fmt_signal, fmt_close
from trade_logger import log_open, log_close, init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("macro_bot.log"),
    ],
)
log = logging.getLogger("macro.bot")

ET = pytz.timezone("America/New_York")


def parse_event_time(date_str: str, time_str: str) -> Optional[datetime]:
    """Parse 'YYYY-MM-DD' + '8:30am' into UTC datetime."""
    if not time_str or time_str.lower() in ("all day", "tentative", ""):
        return None
    try:
        dt_str = f"{date_str} {time_str.upper()}"
        naive = datetime.strptime(dt_str, "%Y-%m-%d %I:%M%p")
        local = ET.localize(naive)
        return local.astimezone(timezone.utc)
    except ValueError:
        return None


class MacroBot:
    def __init__(self):
        self.mt5  = MT5Client()
        self.bls  = BLSFetcher(BLS_API_KEY)
        self.fred = FREDFetcher(FRED_API_KEY) if FRED_API_KEY else None
        self.open_trades: dict[int, dict] = {}

    async def notify(self, text: str):
        log.info(text.replace("\n", " | "))
        if TG_BOT_TOKEN and TG_CHAT_ID:
            await send_telegram(TG_BOT_TOKEN, TG_CHAT_ID, text)

    def _mt5_call(self, fn, *args, **kwargs):
        """Run a synchronous MT5Client call in a thread pool."""
        return asyncio.get_event_loop().run_in_executor(None, lambda: fn(*args, **kwargs))

    # ── Data fetching ────────────────────────────────────────────────────────

    async def fetch_actual(self, event_name: str) -> Optional[float]:
        # FOMC Rate Decision — FRED DFEDTARU (updates same day as decision)
        if event_name in ("Federal Funds Rate", "FOMC Rate Decision") and self.fred:
            rate = await self.fred.get_fomc_rate()
            if rate is not None:
                return rate

        # BLS API for CPI/NFP/PPI
        bls_map = {
            "CPI m/m":                    "cpi",
            "Core CPI m/m":               "cpi",
            "NFP":                        "nfp",
            "Non-Farm Employment Change": "nfp",
            "PPI m/m":                    "ppi",
        }
        if event_name in bls_map:
            method = getattr(self.bls, f"get_{bls_map[event_name]}")
            data = await method()
            if data:
                return data.get("mom_pct") or data.get("value")

        # Fallback: MT5 built-in calendar (actual value when released)
        events = await self._mt5_call(self.mt5.get_calendar)
        for ev in events:
            if ev.get("name") == event_name and ev.get("actual"):
                return parse_forecast(ev["actual"])

        return None

    async def fetch_calendar(self) -> list:
        """Get today's events from MT5 built-in calendar."""
        events = await self._mt5_call(self.mt5.get_calendar)
        result = []
        for ev in events:
            name = ev.get("name", "")
            if name not in EVENT_CONFIG:
                continue
            result.append({
                "name":     name,
                "time_et":  self._utc_to_et_str(ev.get("time_utc", "")),
                "forecast": ev.get("forecast", ""),
                "actual":   ev.get("actual", "") or None,
            })
        return result

    def _utc_to_et_str(self, utc_str: str) -> str:
        """Convert '2026-05-16 08:30' UTC to ET time string like '8:30am'."""
        if not utc_str:
            return ""
        try:
            naive = datetime.strptime(utc_str, "%Y-%m-%d %H:%M")
            utc_dt = naive.replace(tzinfo=timezone.utc)
            et_dt  = utc_dt.astimezone(ET)
            hour   = et_dt.hour % 12 or 12
            minute = et_dt.strftime("%M")
            ampm   = "am" if et_dt.hour < 12 else "pm"
            return f"{hour}:{minute}{ampm}"
        except Exception:
            return ""

    # ── Trade management ──────────────────────────────────────────────────────

    async def manage_open_trades(self):
        if not self.open_trades:
            return

        for ticket, meta in list(self.open_trades.items()):
            opened_at: datetime = meta["opened_at"]
            elapsed_min = (datetime.now(timezone.utc) - opened_at).total_seconds() / 60

            if elapsed_min >= EXIT_MINUTES:
                ok = await self._mt5_call(self.mt5.close_position, ticket)
                reason = f"Time limit {EXIT_MINUTES}min"
                price = 0.0
                ping = await self._mt5_call(self.mt5.ping)
                if ping:
                    price = ping.get("eurusd_bid" if meta["direction"] == "LONG" else "eurusd_ask", 0)
                log_close(ticket, price, 0.0, reason)
                await self.notify(fmt_close(meta["event"], 0.0, reason))
                self.open_trades.pop(ticket, None)
                log.info("Force-closed ticket=%d after %s", ticket, reason)

    # ── Event processing ──────────────────────────────────────────────────────

    async def process_event(self, event: dict):
        name         = event["name"]
        forecast_raw = event.get("forecast", "")
        forecast     = parse_forecast(forecast_raw)

        if forecast is None:
            log.warning("No forecast for %s — skipping", name)
            return

        log.info("Waiting for actual data: %s (forecast=%s)", name, forecast_raw)

        actual = None
        for _ in range(45):
            actual = await self.fetch_actual(name)
            if actual is not None:
                log.info("Got actual: %s = %s", name, actual)
                break
            await asyncio.sleep(2)

        if actual is None:
            log.warning("No actual data for %s after 90s", name)
            return

        signals = generate_signals(name, actual, forecast)
        if not signals:
            log.info("No signal for %s (deviation below threshold)", name)
            return

        balance = await self._mt5_call(self.mt5.get_balance)

        for signal in signals:
            if len(self.open_trades) >= MAX_TRADES:
                log.warning("MAX_TRADES=%d reached — skipping %s %s",
                            MAX_TRADES, name, signal.instrument)
                break

            volume = self.mt5.calculate_volume(
                balance, RISK_PCT, signal.strength,
                STOP_LOSS_PIPS, instrument=signal.instrument,
            )

            result = await self._mt5_call(
                self.mt5.place_market_order,
                signal.instrument,
                signal.direction,
                volume,
                STOP_LOSS_PIPS,
                TAKE_PROFIT_PIPS,
                f"macro:{name[:12]}",
            )

            if not result:
                log.error("Order failed for %s %s", name, signal.instrument)
                continue

            ticket = int(result["ticket"])
            open_price = float(result.get("price", 0))
            self.open_trades[ticket] = {
                "event":     name,
                "opened_at": datetime.now(timezone.utc),
                "direction": signal.direction,
                "volume":    volume,
                "symbol":    signal.instrument,
            }

            log_open(
                ticket=ticket, event=name, symbol=signal.instrument,
                direction=signal.direction, volume=volume,
                open_price=open_price,
                sl_pips=STOP_LOSS_PIPS, tp_pips=TAKE_PROFIT_PIPS,
                deviation=signal.deviation, strength=signal.strength,
            )

            await self.notify(fmt_signal(
                name, actual, forecast,
                signal.direction, volume, signal.deviation,
                instrument=signal.instrument,
            ))

    # ── Main loop ────────────────────────────────────────────────────────────

    async def run(self):
        log.info("MacroBot starting (MT5 file IPC)")

        init_db()
        ping = await self._mt5_call(self.mt5.ping)
        if not ping or ping.get("status") != "pong":
            log.error("MT5 EA not responding. Start MacroBridgeEA in MetaTrader 5.")
            return

        log.info("MT5 connected. Balance: $%.2f  EUR/USD: %s/%s",
                 ping["balance"], ping["eurusd_bid"], ping["eurusd_ask"])

        processed_today: set[str] = set()

        while True:
            try:
                now_utc   = datetime.now(timezone.utc)
                today_str = now_utc.astimezone(ET).date().isoformat()

                if not processed_today or not any(
                    e.startswith(today_str) for e in processed_today
                ):
                    processed_today.clear()
                    log.info("Fetching today's economic calendar...")

                raw_events = await self.fetch_calendar()
                upcoming = []
                for ev in raw_events:
                    event_key = f"{today_str}:{ev['name']}"
                    if event_key in processed_today:
                        continue
                    et_time = parse_event_time(today_str, ev.get("time_et", ""))
                    if et_time is None or et_time < now_utc:
                        continue
                    upcoming.append((et_time, ev))

                upcoming.sort(key=lambda x: x[0])

                await self.manage_open_trades()

                if not upcoming:
                    log.info("No upcoming events today. Sleeping 15min.")
                    await asyncio.sleep(900)
                    continue

                next_time, next_event = upcoming[0]
                wait_secs = (next_time - now_utc).total_seconds()

                log.info(
                    "Next event: '%s' at %s ET (in %.0f min)",
                    next_event["name"],
                    next_time.astimezone(ET).strftime("%H:%M"),
                    wait_secs / 60,
                )

                if wait_secs > 120:
                    await asyncio.sleep(min(wait_secs - 60, 30))
                    continue

                if wait_secs > 0:
                    await asyncio.sleep(wait_secs)

                event_key = f"{today_str}:{next_event['name']}"
                processed_today.add(event_key)
                await self.process_event(next_event)

            except asyncio.CancelledError:
                break
            except Exception as e:
                log.exception("Main loop error: %s", e)
                await asyncio.sleep(30)

        log.info("MacroBot stopped.")


if __name__ == "__main__":
    asyncio.run(MacroBot().run())
