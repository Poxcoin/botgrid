"""
Macro bot API routes — підключається до web_server.py
Додай в web_server.py:
    from macro_bot.macro_api import router as macro_router
    app.include_router(macro_router, prefix="/api/macro")
"""
import json
from pathlib import Path
from fastapi import APIRouter

# Якщо macro_bot в іншому місці — підправ шлях
import sys, os
sys.path.insert(0, str(Path(__file__).parent))
from trade_logger import get_stats

router = APIRouter()


@router.get("/stats")
def macro_stats(days: int = 30):
    """Статистика угод за останні N днів."""
    return get_stats(days)


@router.get("/trades")
def macro_trades(limit: int = 50):
    """Список останніх угод."""
    import sqlite3
    db = Path(__file__).parent / "macro_trades.db"
    if not db.exists():
        return []
    with sqlite3.connect(db) as c:
        c.row_factory = sqlite3.Row
        rows = c.execute("""
            SELECT * FROM trades ORDER BY open_time DESC LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]
