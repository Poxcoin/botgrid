"""
repair_positions.py — відновлює open_positions.json з поточних live позицій Bybit.

Запуск на VPS:
    cd /opt/botgrid && python3 repair_positions.py [--close-wld]

--close-wld : додатково закрити WLD якщо збиток > $20
"""
import sys
import json
from datetime import datetime, timezone

sys.path.insert(0, "/opt/botgrid")

from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET, IS_DEMO_TRADING
import ccxt

TRACK_FILE = "/opt/botgrid/open_positions.json"
CLOSE_LOSERS = "--close-wld" in sys.argv or "--close-losers" in sys.argv
MAX_LOSS = 20.0  # USD


def build_exchange():
    ex = ccxt.bybit({
        "apiKey": BYBIT_API_KEY,
        "secret": BYBIT_SECRET,
        "enableRateLimit": True,
        "options": {
            "defaultType": "linear",
            "adjustForTimeDifference": True,
        },
    })
    ex.has["fetchCurrencies"] = False
    if IS_DEMO_TRADING:
        ex.urls["api"] = ex.urls["demotrading"]
    if USE_TESTNET:
        ex.set_sandbox_mode(True)
    ex.load_markets()
    return ex


def main():
    print("🔧 repair_positions.py — синхронізація open_positions.json")
    ex = build_exchange()

    positions = ex.fetch_positions(params={"category": "linear"})
    active = [p for p in positions if abs(float(p.get("contracts") or 0)) > 0]

    if not active:
        print("   ℹ️ Немає активних позицій на Bybit.")
        with open(TRACK_FILE, "w") as f:
            json.dump({}, f, indent=2)
        print(f"   ✅ {TRACK_FILE} очищено (порожній об'єкт).")
        return

    print(f"   📊 Знайдено {len(active)} активних позицій:")

    tracked = {}
    now_utc = datetime.now(timezone.utc)

    for pos in active:
        sym    = pos["symbol"]
        side   = pos["side"]
        entry  = float(pos.get("entryPrice") or pos.get("info", {}).get("avgPrice") or 0)
        upnl   = float(pos.get("unrealizedPnl") or pos.get("info", {}).get("unrealisedPnl") or 0)
        action = "LONG" if side == "long" else "SHORT"

        print(f"   {'📈' if upnl >= 0 else '📉'} {sym} {action} entry={entry} uPnL={upnl:+.2f}$")

        if CLOSE_LOSERS and upnl < -MAX_LOSS:
            contracts = abs(float(pos["contracts"]))
            close_side = "sell" if side == "long" else "buy"
            print(f"      ⚠️ Збиток ${upnl:.2f} > ${MAX_LOSS} — закриваємо...")
            try:
                ex.create_order(
                    sym, "market", close_side, contracts,
                    params={"category": "linear", "reduceOnly": True},
                )
                print(f"      ✅ {sym} закрито ринковим ордером")
                continue  # не додаємо до tracked — вже закрито
            except Exception as e:
                print(f"      ❌ Помилка закриття {sym}: {e}")

        tracked[sym] = {
            "opened_at": now_utc.isoformat(),
            "action": action,
            "entry": entry,
        }

    with open(TRACK_FILE, "w") as f:
        json.dump(tracked, f, indent=2)

    print(f"\n✅ Збережено {len(tracked)} позицій → {TRACK_FILE}")
    print("   Position monitor тепер бачить ці позиції і буде застосовувати $20 hard cap.")

    if not CLOSE_LOSERS:
        print("\n   💡 Щоб закрити збиткові позиції (> $20): додай --close-wld")


if __name__ == "__main__":
    main()
