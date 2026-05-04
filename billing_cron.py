#!/usr/bin/env python3
"""
Monthly performance fee billing.
Run on 1st of each month (systemd timer).
Also callable via POST /api/billing/invoice-performance with X-Cron-Secret header.

Creates MonthlyPnl records with fee_paid=False. Admin marks paid via
POST /api/admin/invoices/{id}/mark-paid after USDT payment confirmed.
"""
import os, sys, calendar
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import func
from database import SessionLocal, Subscription, MonthlyPnl, UserTrade
from config.settings import USDT_WALLET_TRC20
from utils.email import _send


def _calc_monthly_pnl(db, user_id: int, year: int, month: int) -> float:
    """Sum realized PnL from closed user_trades for a given month."""
    _, last_day = calendar.monthrange(year, month)
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end   = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
    result = db.query(func.sum(UserTrade.pnl_usdt)).filter(
        UserTrade.user_id  == user_id,
        UserTrade.status   == "closed",
        UserTrade.pnl_usdt != None,
        UserTrade.closed_at >= start,
        UserTrade.closed_at <= end,
    ).scalar()
    return float(result or 0.0)


def _send_invoice_email(to: str, year: int, month: int, gross_pnl: float, fee: float) -> bool:
    wallet = USDT_WALLET_TRC20 or "—"
    month_name = datetime(year, month, 1).strftime("%B %Y")
    net = round(gross_pnl - fee, 2)
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#060606;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;padding:40px 20px;margin:0">
  <div style="max-width:520px;margin:0 auto">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:4px">Performance fee invoice</div>
    <div style="color:#666;font-size:13px;margin-bottom:32px">{month_name}</div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:32px">
      <tr>
        <td style="color:#888;padding:10px 0;border-bottom:1px solid #111">Monthly profit</td>
        <td style="color:#fff;padding:10px 0;border-bottom:1px solid #111;text-align:right">${gross_pnl:.2f}</td>
      </tr>
      <tr>
        <td style="color:#888;padding:10px 0;border-bottom:1px solid #111">Performance fee (20%)</td>
        <td style="color:#e55;padding:10px 0;border-bottom:1px solid #111;text-align:right">−${fee:.2f}</td>
      </tr>
      <tr>
        <td style="color:#888;padding:10px 0;font-weight:600">Your net profit</td>
        <td style="color:#4ade80;padding:10px 0;text-align:right;font-weight:700">${net:.2f}</td>
      </tr>
    </table>

    <div style="background:#0f0f0f;border:1px solid #1f1f1f;border-radius:12px;padding:20px;margin-bottom:24px">
      <div style="color:#888;font-size:12px;margin-bottom:8px">Pay to (USDT TRC-20)</div>
      <div style="font-family:monospace;font-size:13px;color:#fff;word-break:break-all">{wallet}</div>
    </div>

    <p style="color:#666;font-size:12px;line-height:1.6;margin:0">
      After sending, go to <strong>Settings → Billing</strong> and click "I've Paid" to submit your transaction hash.
      Your account remains active while payment is pending.<br><br>
      Questions? Reply to this email.
    </p>
  </div>
</body>
</html>"""
    return _send(to, f"Kado performance fee — {month_name}", html)


def run(year: int = None, month: int = None) -> list[dict]:
    """
    Calculate and record performance fees for all active Performance plan users.
    Defaults to last calendar month. Returns list of processed results.
    """
    now = datetime.now(timezone.utc)
    if year is None or month is None:
        if now.month == 1:
            last_month, last_year = 12, now.year - 1
        else:
            last_month, last_year = now.month - 1, now.year
    else:
        last_month, last_year = month, year

    db = SessionLocal()
    results = []
    try:
        subs = db.query(Subscription).filter(
            Subscription.plan   == "performance",
            Subscription.status == "active",
        ).all()
        print(f"[BILLING] {last_year}-{last_month:02d} — {len(subs)} performance users")

        for sub in subs:
            user = sub.user
            if not user:
                continue

            gross_pnl = _calc_monthly_pnl(db, user.id, last_year, last_month)

            hwm = sub.hwm_usd or 0.0
            adjusted_profit = max(0.0, gross_pnl - max(0.0, -hwm))
            sub.hwm_usd = hwm + gross_pnl

            monthly = db.query(MonthlyPnl).filter_by(
                user_id=user.id, year=last_year, month=last_month,
            ).first()

            if adjusted_profit > 0:
                fee_usd = round(adjusted_profit * 0.20, 2)

                if not monthly:
                    monthly = MonthlyPnl(user_id=user.id, year=last_year, month=last_month)
                    db.add(monthly)

                monthly.gross_pnl       = round(gross_pnl, 2)
                monthly.performance_fee = fee_usd
                monthly.net_pnl         = round(gross_pnl - fee_usd, 2)
                monthly.fee_paid        = False

                sent = _send_invoice_email(user.email, last_year, last_month, gross_pnl, fee_usd)
                print(
                    f"[BILLING] user={user.id} ({user.email}) "
                    f"gross=${gross_pnl:.2f} fee=${fee_usd:.2f} email={'sent' if sent else 'failed'}"
                )
                results.append({
                    "user_id": user.id, "email": user.email,
                    "gross_pnl": gross_pnl, "fee": fee_usd, "invoice_sent": sent,
                })
            else:
                if monthly:
                    monthly.gross_pnl = round(gross_pnl, 2)
                    monthly.net_pnl   = round(gross_pnl, 2)
                print(f"[BILLING] user={user.id} no chargeable profit (gross={gross_pnl:.2f} hwm_before={hwm:.2f})")
                results.append({
                    "user_id": user.id, "email": user.email,
                    "gross_pnl": gross_pnl, "fee": 0.0, "invoice_sent": False,
                })

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[BILLING] Error: {e}")
        raise
    finally:
        db.close()

    return results


if __name__ == "__main__":
    results = run()
    print(f"\n[BILLING] Done — {len(results)} users processed")
