#!/usr/bin/env python3
"""
Monthly performance fee billing.
Run on 1st of each month (systemd timer).
Also callable via POST /api/billing/invoice-performance with X-Cron-Secret header.

Creates ManualInvoice records (fee_paid=False). Admin marks paid via
POST /api/admin/invoices/{id}/mark-paid after USDT payment confirmed.
"""
import os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Subscription, MonthlyPnl


def run():
    now = datetime.now(timezone.utc)
    if now.month == 1:
        last_month, last_year = 12, now.year - 1
    else:
        last_month, last_year = now.month - 1, now.year

    db = SessionLocal()
    try:
        subs = db.query(Subscription).filter(
            Subscription.plan   == "performance",
            Subscription.status == "active",
        ).all()
        print(f"[CRON] Performance billing for {last_year}-{last_month:02d} — {len(subs)} users")

        for sub in subs:
            user = sub.user
            if not user:
                continue

            monthly = db.query(MonthlyPnl).filter_by(
                user_id=user.id, year=last_year, month=last_month,
            ).first()
            monthly_pnl = monthly.gross_pnl if monthly else 0.0

            hwm = sub.hwm_usd or 0.0
            adjusted_profit = max(0.0, monthly_pnl - max(0.0, -hwm))
            sub.hwm_usd = hwm + monthly_pnl

            if adjusted_profit > 0:
                fee_usd = round(adjusted_profit * 0.20, 2)

                if not monthly:
                    monthly = MonthlyPnl(
                        user_id=user.id, year=last_year, month=last_month,
                        gross_pnl=monthly_pnl,
                    )
                    db.add(monthly)

                monthly.performance_fee = fee_usd
                monthly.net_pnl         = round(monthly_pnl - fee_usd, 2)
                monthly.fee_paid        = False  # awaiting USDT payment confirmation

                print(
                    f"[CRON] 🧾 user={user.id} ({user.email}) "
                    f"fee=${fee_usd:.2f} (profit=${adjusted_profit:.2f}) — awaiting USDT"
                )
            else:
                print(f"[CRON] user={user.id} no profit (pnl={monthly_pnl:.2f} hwm={hwm:.2f})")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
