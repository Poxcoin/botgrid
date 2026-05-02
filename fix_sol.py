from modules.trader import _init_exchange

ex = _init_exchange()
ex.load_markets()

for sym in ["SOL/USDT:USDT", "ETH/USDT:USDT", "BTC/USDT:USDT"]:
    try:
        pos = ex.fetch_positions([sym], params={"category": "linear"})
        for p in pos:
            qty = abs(float(p.get("contracts") or 0))
            if qty > 0:
                side = "sell" if p["side"] == "long" else "buy"
                ex.create_order(sym, "market", side, qty,
                    params={"category": "linear", "reduceOnly": True})
                print(f"Closed {sym} {p['side']} qty={qty}")
    except Exception as e:
        print(f"{sym} error: {e}")

print("Done")
