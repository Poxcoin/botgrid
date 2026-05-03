#!/usr/bin/env python3
"""
Monthly performance fee billing.
Run on 1st of each month (systemd timer).
Also callable via POST /api/billing/invoice-performance with X-Cron-Secret header.
"""
import os, sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import stripe
from database import SessionLocal, Subscription, MonthlyPnl

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")


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
            if not user or not sub.stripe_customer_id:
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
                try:
                    stripe.InvoiceItem.create(
                        customer=sub.stripe_customer_id,
                        amount=int(fee_usd * 100),
                        currency="usd",
                        description=(
                            f"Performance fee {last_year}-{last_month:02d} "
                            f"(${adjusted_profit:.2f} net profit × 20%)"
                        ),
                    )
                    invoice = stripe.Invoice.create(
                        customer=sub.stripe_customer_id,
                        auto_advance=True,
                    )
                    stripe.Invoice.finalize_invoice(invoice.id)

                    if monthly:
                        monthly.performance_fee = fee_usd
                        monthly.fee_paid        = True
                        monthly.settled_at      = datetime.utcnow()

                    print(f"[CRON] ✅ user={user.id} fee=${fee_usd:.2f} (profit=${adjusted_profit:.2f})")
                except stripe.error.StripeError as e:
                    print(f"[CRON] ❌ user={user.id} Stripe error: {e}")
            else:
                print(f"[CRON] user={user.id} no profit (pnl={monthly_pnl:.2f} hwm={hwm:.2f})")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
