"""
tools/force_reconcile.py — Phase 1 of event-sourced sync rewrite.

Bypasses bybit_sync.py's fuzzy price-match dedup which eats real trades.
INSERT all Bybit closed-pnl rows whose orderId is not in user_trades.

Tagged as source='bybit_manual' (manual user trades) vs 'bybit' (legacy bot).

Run daily 06:00 UTC + on-demand. Idempotent — orderId is unique key.
"""
from __future__ import annotations
import sys, time as _t
from datetime import datetime, timezone
sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from database import SessionLocal, User, UserApiKey, UserTrade
from modules.bybit_client import build_from_key_row
from sqlalchemy.orm import joinedload
from sqlalchemy import and_


def _normalize_coin(symbol: str) -> str:
    import re
    if not symbol:
        return "?"
    coin = re.split(r"[/:]", symbol)[0]
    if coin.upper().endswith("USDT"):
        coin = coin[:-4]
    return coin or "?"


def reconcile_user(user_id: int) -> dict:
    """Pull Bybit closed-pnl 7d, INSERT missing rows by orderId. Returns stats."""
    db = SessionLocal()
    try:
        u = db.query(User).options(joinedload(User.api_keys)).filter(User.id == user_id).first()
        if not u:
            return {"inserted": 0, "err": "no user"}
        key = next((k for k in u.api_keys if k.exchange == 'bybit'), None)
        if not key:
            return {"inserted": 0, "err": "no key"}

        ex = build_from_key_row(key)
        if not ex:
            return {"inserted": 0, "err": "no exchange"}

        # Paginate 7d window
        end_ms = int(_t.time() * 1000)
        start_ms = end_ms - 7 * 86400 * 1000
        all_rows = []
        cursor = None
        for _ in range(50):
            params = {'category':'linear','startTime':start_ms,'endTime':end_ms,'limit':100}
            if cursor: params['cursor'] = cursor
            try:
                r = ex.privateGetV5PositionClosedPnl(params)
            except Exception as e:
                return {"inserted": 0, "err": f"api: {e}"}
            all_rows.extend(r.get('result',{}).get('list',[]))
            cursor = r.get('result',{}).get('nextPageCursor')
            if not cursor: break

        existing_oids = {
            t.order_id
            for t in db.query(UserTrade.order_id).filter(UserTrade.user_id == user_id).all()
            if t.order_id
        }

        inserted = 0
        sum_pnl = 0.0
        key_since_ms = int(key.created_at.timestamp() * 1000) if key.created_at else 0

        for it in all_rows:
            oid = it.get('orderId') or ''
            if not oid or oid in existing_oids:
                continue
            updated_ms = int(it.get('updatedTime') or 0)
            if updated_ms < key_since_ms:
                continue  # pre-key-add manual trading, intentionally skip

            symbol = it.get('symbol', '')
            coin = _normalize_coin(symbol)
            side_str = (it.get('side') or '').upper()
            # closed-pnl reports CLOSING side. For LONG closed: closing side=Sell.
            # We store the position direction (the opening side).
            position_side = 'SHORT' if side_str == 'BUY' else 'LONG'

            qty = float(it.get('qty') or 0)
            entry = float(it.get('avgEntryPrice') or 0)
            exit_p = float(it.get('avgExitPrice') or 0)
            pnl = float(it.get('closedPnl') or 0)
            lev = int(float(it.get('leverage') or 3))
            closed_dt = datetime.fromtimestamp(updated_ms / 1000, timezone.utc).replace(tzinfo=None)
            opened_dt = datetime.fromtimestamp(int(it.get('createdTime') or updated_ms) / 1000, timezone.utc).replace(tzinfo=None)

            new_row = UserTrade(
                user_id=user_id,
                source='bybit_manual',
                symbol=symbol,
                side=position_side,
                qty=qty,
                entry_price=entry,
                exit_price=exit_p,
                pnl_usdt=pnl,
                leverage=lev,
                status='closed',
                order_id=oid,
                opened_at=opened_dt,
                closed_at=closed_dt,
            )
            db.add(new_row)
            inserted += 1
            sum_pnl += pnl

        db.commit()
        return {"inserted": inserted, "sum_pnl": round(sum_pnl, 2), "total_rows": len(all_rows)}
    except Exception as e:
        db.rollback()
        return {"inserted": 0, "err": str(e)}
    finally:
        db.close()


def main():
    db = SessionLocal()
    user_ids = [u.id for u in db.query(User).filter(User.is_active == True).all()]
    db.close()

    print(f"Force-reconcile run @ {datetime.now(timezone.utc).isoformat()}")
    total_new = 0
    total_pnl = 0.0
    for uid in user_ids:
        result = reconcile_user(uid)
        n = result.get('inserted', 0)
        pnl = result.get('sum_pnl', 0)
        err = result.get('err')
        total_new += n
        total_pnl += pnl
        print(f"  user {uid}: inserted={n}  sum_pnl=${pnl:+.2f}  err={err}")

    if total_new > 0:
        try:
            from modules.tg_notifier import send_telegram_message
            from config.settings import TG_CHAT_ID
            if TG_CHAT_ID:
                send_telegram_message(
                    f"🔄 <b>Force-reconcile</b>\n"
                    f"Inserted {total_new} missing trades, sum PnL ${total_pnl:+.2f}",
                    TG_CHAT_ID
                )
        except Exception as e:
            print(f"tg err: {e}")


if __name__ == "__main__":
    main()
