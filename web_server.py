import asyncio
import json
import math
import os
from datetime import datetime
from typing import Optional

import ccxt
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET

app = FastAPI(title="AI Crypto Trading Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Путь к логу сигналов
LEDGER_FILE = "signals_log.json"

# Подключаем статические файлы
if not os.path.exists("static"):
    os.makedirs("static")

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    return FileResponse("static/index.html")

# SPA catch-all: serve index.html for any non-API route (React Router)
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("static/") or full_path.startswith("ws"):
        raise HTTPException(status_code=404)
    index = "static/index.html"
    if os.path.exists(index):
        return FileResponse(index)
    raise HTTPException(status_code=404)

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
            if USE_TESTNET:
                exchange.set_sandbox_mode(True)
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

    # Статистика по исполненным сделкам (LONG + SHORT)
    trades = [s for s in signals if s.get('action') in ('LONG', 'SHORT')]
    total_trades = len(trades)

    # Реальный Win Rate — только по сделкам с известным результатом
    closed_trades  = [s for s in trades if 'result' in s]
    winning_trades = sum(1 for s in closed_trades if s['result'] == 'WIN')
    losing_trades  = sum(1 for s in closed_trades if s['result'] == 'LOSS')
    winrate_pct    = round(winning_trades / len(closed_trades) * 100, 1) if closed_trades else 0

    # Суммарный PnL
    total_pnl = round(sum(s.get('pnl_usdt', 0) for s in closed_trades), 2)

    return {
        "status": "online",
        "balance": balance_info,
        "latest_signals": signals[-20:][::-1],
        "stats": {
            "total_signals":   len(signals),
            "longs":           len([s for s in signals if s.get('action') == 'LONG']),
            "shorts":          len([s for s in signals if s.get('action') == 'SHORT']),
            "total_trades":    total_trades,
            "closed_trades":   len(closed_trades),
            "winning_trades":  winning_trades,
            "losing_trades":   losing_trades,
            "winrate_pct":     winrate_pct,
            "total_pnl":       total_pnl,
        }
    }

def _load_signals() -> list:
    """Загружает все сигналы из файла. Возвращает пустой список при ошибке."""
    if not os.path.exists(LEDGER_FILE):
        return []
    try:
        with open(LEDGER_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Ошибка чтения лога: {e}")
        return []


@app.get("/api/signals")
async def get_signals(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    coin: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
):
    """
    Постраничная выдача сигналов.
    По умолчанию — только LONG и SHORT, сортировка по убыванию timestamp.
    """
    all_signals = _load_signals()

    # Фильтрация по типу действия
    if action:
        filtered = [s for s in all_signals if s.get("action") == action.upper()]
    else:
        filtered = [s for s in all_signals if s.get("action") in ("LONG", "SHORT")]

    # Фильтрация по монете
    if coin:
        filtered = [s for s in filtered if s.get("coin", "").upper() == coin.upper()]

    # Сортировка: новые сверху
    filtered.sort(key=lambda s: s.get("timestamp", ""), reverse=True)

    total = len(filtered)
    pages = max(1, math.ceil(total / limit))
    start = (page - 1) * limit
    end = start + limit

    return {
        "signals": filtered[start:end],
        "total": total,
        "page": page,
        "pages": pages,
    }


@app.get("/api/stats")
async def get_stats():
    """
    Статистика только по LONG и SHORT сигналам.
    Поля profit/wins заполнены нулями — данные появятся когда в лог добавят pnl/result.
    """
    all_signals = _load_signals()
    trades = [s for s in all_signals if s.get("action") in ("LONG", "SHORT")]

    total_trades  = len(trades)
    long_count    = sum(1 for s in trades if s.get("action") == "LONG")
    short_count   = sum(1 for s in trades if s.get("action") == "SHORT")

    closed_trades  = [s for s in trades if "result" in s]
    winning_trades = sum(1 for s in closed_trades if s.get("result") == "WIN")
    losing_trades  = sum(1 for s in closed_trades if s.get("result") == "LOSS")
    total_pnl      = round(sum(float(s.get("pnl_usdt", 0)) for s in closed_trades), 2)
    win_rate       = round(winning_trades / len(closed_trades) * 100, 1) if closed_trades else 0.0

    return {
        "total_trades":    total_trades,
        "closed_trades":   len(closed_trades),
        "win_rate":        win_rate,
        "total_pnl":       total_pnl,
        "winning_trades":  winning_trades,
        "losing_trades":   losing_trades,
        "long_count":      long_count,
        "short_count":     short_count,
    }


# ---------------------------------------------------------------------------
# WebSocket /ws — ping каждые 5 секунд, update при изменении файла
# ---------------------------------------------------------------------------

def _get_file_mtime() -> float:
    """Возвращает время изменения signals_log.json (0 если файла нет)."""
    try:
        return os.path.getmtime(LEDGER_FILE)
    except OSError:
        return 0.0


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    last_mtime = _get_file_mtime()

    try:
        while True:
            await asyncio.sleep(5)

            current_mtime = _get_file_mtime()

            if current_mtime != last_mtime:
                # Файл обновился — шлём последний сигнал
                last_mtime = current_mtime
                signals = _load_signals()
                latest = signals[-1] if signals else None
                await websocket.send_json({
                    "type": "update",
                    "latest": latest,
                })
            else:
                # Обычный ping
                signals = _load_signals()
                trades_count = sum(
                    1 for s in signals if s.get("action") in ("LONG", "SHORT")
                )
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": datetime.utcnow().isoformat(),
                    "signals_count": trades_count,
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket ошибка: {e}")


@app.get("/api/logs")
async def get_logs(lines: int = Query(default=100, ge=1, le=500)):
    """Последние N строк bot_engine.log для страницы System Logs."""
    log_path = "bot_engine.log"
    if not os.path.exists(log_path):
        return {"lines": ["Log file not found."]}
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        return {"lines": [l.rstrip() for l in all_lines[-lines:]]}
    except Exception as e:
        return {"lines": [f"Error reading log: {e}"]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
