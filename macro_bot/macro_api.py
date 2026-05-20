"""
Macro bot API routes — підключається до web_server.py
Додай в web_server.py:
    from macro_bot.macro_api import router as macro_router
    app.include_router(macro_router, prefix="/api/macro")
"""
import sqlite3
from pathlib import Path
from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

import sys
sys.path.insert(0, str(Path(__file__).parent))
from trade_logger import get_stats

router = APIRouter()
_security = HTTPBearer(auto_error=False)


def _require_auth(credentials: HTTPAuthorizationCredentials = Depends(_security)):
    """Validate JWT — delegates to web_server's decode_token via import."""
    from utils.auth import decode_token
    if not credentials:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload


@router.get("/stats")
def macro_stats(days: int = 30, _auth=Depends(_require_auth)):
    """Статистика угод за останні N днів."""
    return get_stats(days)


@router.get("/trades")
def macro_trades(limit: int = 50, _auth=Depends(_require_auth)):
    """Список останніх угод."""
    db = Path(__file__).parent / "macro_trades.db"
    if not db.exists():
        return []
    with sqlite3.connect(db) as c:
        c.row_factory = sqlite3.Row
        rows = c.execute(
            "SELECT * FROM trades ORDER BY open_time DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]
