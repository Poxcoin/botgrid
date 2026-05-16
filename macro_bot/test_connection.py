"""
Test MT5 connection via file IPC.
MT5 terminal must be running with MacroBridgeEA attached to EURUSD chart.

  python3 macro_bot/test_connection.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mt5_client import MT5Client


def main():
    client = MT5Client()

    print("Pinging MT5 EA...")
    ping = client.ping()
    if not ping or ping.get("status") != "pong":
        print("❌ MT5 EA not responding. Make sure MacroBridgeEA is running in MetaTrader 5.")
        return

    print(f"✅ Connected! Balance: ${ping['balance']:,.2f}  Equity: ${ping['equity']:,.2f}")

    price = client.get_price("EURUSD")
    if price:
        print(f"EUR/USD: bid={price['bid']} ask={price['ask']} spread={price['spread_pips']} pips")

    print("\nTest order (0.01 lot LONG EUR/USD, SL=15 TP=35)")
    answer = input("Place test order? (y/n): ")
    if answer.lower() != "y":
        return

    result = client.place_market_order(
        symbol="EURUSD",
        direction="LONG",
        volume=0.01,
        sl_pips=15,
        tp_pips=35,
        comment="test",
    )
    if not result:
        print("❌ Order failed (check Algo Trading is enabled in MT5)")
        return

    print(f"✅ Order opened: ticket={result['ticket']} @ {result['price']}")
    input("Press Enter to close...")
    closed = client.close_position(int(result["ticket"]))
    print("✅ Closed" if closed else "❌ Close failed")


if __name__ == "__main__":
    main()
