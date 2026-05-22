"""
modules/bybit_client.py — single source of truth for Bybit API access.

Consolidates the 8+ duplicated implementations across web_server, userbot,
bybit_sync, dispatcher, loss_monitor, daily_pnl_report, etc.

All callers should use these functions instead of rolling their own.

Usage:
    from modules.bybit_client import (
        build_exchange, build_from_key_row,
        get_balance, get_positions, get_closed_pnl,
    )

    ex = build_from_key_row(user.api_keys[0])
    bal = get_balance(ex)          # {wallet, equity, unrealized_pnl, usdt_free}
    pos = get_positions(ex)         # list of normalized open positions
    pnl = get_closed_pnl(ex, ...)   # raw bybit list
"""
from __future__ import annotations
import ccxt

from utils.crypto import decrypt_field


# ── Exchange construction ──────────────────────────────────────────────────────

def build_exchange(api_key: str, secret: str, is_demo: bool) -> ccxt.bybit | None:
    """Build a ccxt.bybit client from raw credentials.

    Returns None on construction failure. Does NOT call load_markets() — caller
    can decide whether market data is needed.
    """
    if not api_key or not secret:
        return None
    try:
        ex = ccxt.bybit({
            "apiKey": api_key,
            "secret": secret,
            "enableRateLimit": True,
            "options": {"defaultType": "linear", "recvWindow": 10000},
        })
        ex.has["fetchCurrencies"] = False
        if is_demo:
            ex.urls["api"] = ex.urls["demotrading"]
        return ex
    except Exception:
        return None


def build_from_key_row(key_row) -> ccxt.bybit | None:
    """Build a ccxt.bybit client from a UserApiKey ORM row."""
    if key_row is None:
        return None
    try:
        api = decrypt_field(key_row.api_key_enc)
        sec = decrypt_field(key_row.secret_enc)
    except Exception:
        return None
    return build_exchange(api, sec, bool(getattr(key_row, "is_demo", False)))


# ── Balance ────────────────────────────────────────────────────────────────────

# Used by callers to detect "API failure" vs "0 USDT". A None means we never
# got a successful response; otherwise the dict is canonical.

EMPTY_BALANCE = {
    "wallet":         0.0,
    "equity":         0.0,
    "unrealized_pnl": 0.0,
    "usdt_free":      0.0,
    "total_equity":   0.0,
}


def get_balance(ex) -> dict:
    """USDT balance, trying UNIFIED first then CONTRACT (legacy demo).

    Always returns a dict — never raises. Empty dict (all zeros) on full failure.
    Caller should check `wallet > 0` to know if account is funded.
    """
    if ex is None:
        return dict(EMPTY_BALANCE)

    for acct in ("UNIFIED", "CONTRACT"):
        try:
            raw = ex.private_get_v5_account_wallet_balance({"accountType": acct})
            acc_list = raw.get("result", {}).get("list", [])
            if not acc_list:
                continue
            acc0 = acc_list[0]
            coins = acc0.get("coin", [])
            usdt = next((c for c in coins if c.get("coin") == "USDT"), {})
            wallet = float(usdt.get("walletBalance") or 0)
            total_equity = float(acc0.get("totalEquity") or 0) or wallet
            if wallet > 0 or total_equity > 0:
                return {
                    "wallet":         wallet,
                    "equity":         float(usdt.get("equity") or wallet),
                    "unrealized_pnl": float(usdt.get("unrealisedPnl") or 0),
                    "usdt_free":      float(usdt.get("availableToWithdraw") or wallet),
                    "total_equity":   total_equity,
                }
        except Exception:
            continue
    return dict(EMPTY_BALANCE)


# ── Positions ──────────────────────────────────────────────────────────────────

def get_positions(ex) -> list[dict]:
    """Open linear positions, normalized.

    Returns [] on failure or no positions. Each item:
      symbol, coin, side (LONG/SHORT), raw_side (Buy/Sell),
      entry_price, qty, unrealized_pnl, pnl_pct (vs margin),
      margin, stop_loss, take_profit, liq_price, mark_price,
      leverage, created_time (ms).
    """
    if ex is None:
        return []

    try:
        raw = ex.private_get_v5_position_list({
            "category": "linear",
            "settleCoin": "USDT",
        })
    except Exception:
        return []

    items = raw.get("result", {}).get("list", []) or []
    out: list[dict] = []
    for p in items:
        size = float(p.get("size") or 0)
        if size <= 0:
            continue
        upnl   = float(p.get("unrealisedPnl") or 0)
        margin = float(p.get("positionIM") or 0) or 1.0
        sl_v   = float(p.get("stopLoss")   or 0) or None
        tp_v   = float(p.get("takeProfit") or 0) or None
        liq_v  = float(p.get("liqPrice")   or 0) or None
        mk_v   = float(p.get("markPrice")  or 0) or None
        symbol = p.get("symbol", "")
        out.append({
            "symbol":         symbol,
            "coin":           symbol.replace("USDT", ""),
            "side":           "LONG" if p.get("side") == "Buy" else "SHORT",
            "raw_side":       p.get("side"),
            "entry_price":    float(p.get("avgPrice") or 0),
            "qty":            size,
            "unrealized_pnl": upnl,
            "pnl_pct":        round(upnl / margin * 100, 2) if margin else 0.0,
            "margin":         margin,
            "stop_loss":      sl_v,
            "take_profit":    tp_v,
            "liq_price":      liq_v,
            "mark_price":     mk_v,
            "leverage":       int(float(p.get("leverage") or 0)),
            "created_time":   int(p.get("createdTime") or 0),
        })
    # Sort by PnL descending — most positive on top
    out.sort(key=lambda x: x["unrealized_pnl"], reverse=True)
    return out


# ── Closed PnL (trade history) ─────────────────────────────────────────────────

def get_closed_pnl(ex, start_ms: int | None = None, end_ms: int | None = None,
                   max_pages: int = 20) -> list[dict]:
    """Paginated closed PnL fetch.

    Bybit caps any single query at 7 days. For wider ranges, call multiple
    times with sliding windows (the loop here handles pagination cursors only,
    not date chunking).

    Returns [] on failure. Each item is raw Bybit format (closedPnl, symbol,
    side, avgEntryPrice, avgExitPrice, qty, leverage, updatedTime, orderId, etc).
    """
    if ex is None:
        return []

    items: list[dict] = []
    cursor = ""
    for _ in range(max_pages):
        params: dict = {"category": "linear", "limit": 200}
        if start_ms:
            params["startTime"] = int(start_ms)
        if end_ms:
            params["endTime"] = int(end_ms)
        if cursor:
            params["cursor"] = cursor
        try:
            r = ex.private_get_v5_position_closed_pnl(params)
        except Exception:
            break
        batch = r.get("result", {}).get("list", []) or []
        if not batch:
            break
        items.extend(batch)
        cursor = r.get("result", {}).get("nextPageCursor", "") or ""
        if not cursor:
            break
    return items


def get_closed_pnl_range(ex, start_ms: int, end_ms: int) -> list[dict]:
    """Closed PnL for ranges > 7 days — auto-chunks to satisfy Bybit's limit.

    De-dupes by orderId+updatedTime.
    """
    if ex is None or start_ms >= end_ms:
        return []

    SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000 - 60_000  # safety margin
    out: list[dict] = []
    seen: set = set()
    chunk_end = end_ms
    while chunk_end > start_ms:
        chunk_start = max(start_ms, chunk_end - SEVEN_DAYS_MS)
        batch = get_closed_pnl(ex, chunk_start, chunk_end)
        for r in batch:
            key = (r.get("orderId") or "", r.get("updatedTime"))
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
        chunk_end = chunk_start
    return out


# ── Key-row utility ────────────────────────────────────────────────────────────

def pick_key_row(key_rows: list, prefer_live: bool = False):
    """Pick a single key row from a list.

    Default: prefer DEMO (safer — most operations want demo).
    prefer_live=True: prefer LIVE.

    Returns None if list empty.
    """
    if not key_rows:
        return None
    if prefer_live:
        live = next((k for k in key_rows if not getattr(k, "is_demo", False)), None)
        return live or key_rows[0]
    demo = next((k for k in key_rows if getattr(k, "is_demo", False)), None)
    return demo or key_rows[0]
