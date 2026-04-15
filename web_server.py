import json
import os
import ccxt
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET

app = FastAPI(title="AI Crypto Trading Dashboard")

# Путь к логу сигналов
LEDGER_FILE = "signals_log.json"

# Подключаем статические файлы
if not os.path.exists("static"):
    os.makedirs("static")

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse("static/index.html")

@app.get("/api/data")
async def get_dashboard_data():
    """Возвращает все данные для фронтенда."""
    
    # 1. Загружаем сигналы
    signals = []
    if os.path.exists(LEDGER_FILE):
        try:
            with open(LEDGER_FILE, "r") as f:
                signals = json.load(f)
        except Exception as e:
            print(f"Ошибка чтения лога: {e}")
            
    # 2. Получаем баланс (если есть ключи)
    balance_info = {"total": 0, "free": 0}
    try:
        if BYBIT_API_KEY and BYBIT_SECRET:
            exchange = ccxt.bybit({
                "apiKey": BYBIT_API_KEY,
                "secret": BYBIT_SECRET,
                "options": {"defaultType": "swap"},
            })
            # Универсальный поиск баланса для V5
            try:
                # 1. Unified
                balance = exchange.fetch_balance({'accountType': 'unified'})
                if "USDT" not in balance or balance["USDT"].get("total", 0) == 0:
                    # 2. Contract
                    balance = exchange.fetch_balance({'accountType': 'contract'})
                if "USDT" not in balance or balance["USDT"].get("total", 0) == 0:
                    # 3. Standard
                    balance = exchange.fetch_balance()
            except:
                balance = exchange.fetch_balance()
                
            if "USDT" in balance:
                balance_info["total"] = balance["USDT"].get("total", 0)
                balance_info["free"] = balance["USDT"].get("free", 0)
    except Exception as e:
        print(f"Ошибка получения баланса: {e}")

    # Считаем статистику по исполненным сделкам (LONG + SHORT)
    trades = [s for s in signals if s.get('action') in ('LONG', 'SHORT')]
    total_trades = len(trades)

    # Winrate: считаем сделки где total_score говорит о правильном направлении
    # Используем знак score: LONG с позитивным score = потенциальный выигрыш
    winning_trades = sum(
        1 for s in trades
        if (s['action'] == 'LONG' and s.get('total_score', 0) >= 8)
        or (s['action'] == 'SHORT' and s.get('total_score', 0) <= -8)
    )
    winrate_pct = round((winning_trades / total_trades * 100), 1) if total_trades > 0 else 0

    # Средний score по сделкам
    avg_score = round(
        sum(abs(s.get('total_score', 0)) for s in trades) / total_trades, 1
    ) if total_trades > 0 else 0

    return {
        "status": "online",
        "balance": balance_info,
        "latest_signals": signals[-20:][::-1],  # Последние 20 сигналов, новые сверху
        "stats": {
            "total_signals": len(signals),
            "longs": len([s for s in signals if s.get('action') == 'LONG']),
            "shorts": len([s for s in signals if s.get('action') == 'SHORT']),
            "total_trades": total_trades,
            "winrate_pct": winrate_pct,
            "avg_score": avg_score,
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
