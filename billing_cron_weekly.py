#!/usr/bin/env python3
"""
Weekly performance fee billing.
Run every Monday via systemd timer (calculates previous Mon–Sun week).
Also callable via POST /api/billing/invoice-weekly with X-Cron-Secret header.

Min fee threshold: $5 (gross profit >= $25). Avoids spam invoices for tiny weeks.
"""
import os, sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import func
from database import SessionLocal, Subscription, WeeklyPnl, UserTrade, User, ReferralEarning
from config.settings import USDT_WALLET_TRC20
from utils.email import _send

MIN_FEE_USD = 5.0   # don't invoice below this


def _week_range(year: int, week: int):
    """Return (monday_utc, sunday_utc) for ISO week."""
    monday = datetime.fromisocalendar(year, week, 1).replace(tzinfo=timezone.utc)
    sunday = monday + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return monday, sunday


def _calc_weekly_pnl(db, user_id: int, year: int, week: int) -> float:
    start, end = _week_range(year, week)
    result = db.query(func.sum(UserTrade.pnl_usdt)).filter(
        UserTrade.user_id  == user_id,
        UserTrade.status   == "closed",
        UserTrade.pnl_usdt != None,
        UserTrade.closed_at >= start,
        UserTrade.closed_at <= end,
    ).scalar()
    return float(result or 0.0)


def _week_label(year: int, week: int) -> str:
    monday, sunday = _week_range(year, week)
    return f"Week {week} ({monday.strftime('%b %-d')}–{sunday.strftime('%-d, %Y')})"


def _send_invoice_email(to: str, year: int, week: int, gross_pnl: float, fee: float) -> bool:
    wallet = USDT_WALLET_TRC20 or "—"
    label = _week_label(year, week)
    net = round(gross_pnl - fee, 2)
    html = f"""<!DOCTYPE html>
<html>
<body style="background:#060606;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif;padding:40px 20px;margin:0">
  <div style="max-width:520px;margin:0 auto">
    <div style="font-size:22px;font-weight:700;letter-spacing:-0.03em;margin-bottom:4px">Weekly performance fee</div>
    <div style="color:#666;font-size:13px;margin-bottom:32px">{label}</div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:32px">
      <tr>
        <td style="color:#888;padding:10px 0;border-bottom:1px solid #111">Week profit</td>
        <td style="color:#fff;padding:10px 0;border-bottom:1px solid #111;text-align:right">+${gross_pnl:.2f}</td>
      </tr>
      <tr>
        <td style="color:#888;padding:10px 0;border-bottom:1px solid #111">Performance fee (20%)</td>
        <td style="color:#e55;padding:10px 0;border-bottom:1px solid #111;text-align:right">−${fee:.2f}</td>
      </tr>
      <tr>
        <td style="color:#888;padding:10px 0;font-weight:600">Your net profit</td>
        <td style="color:#4ade80;padding:10px 0;text-align:right;font-weight:700">+${net:.2f}</td>
      </tr>
    </table>

    <div style="background:#0f0f0f;border:1px solid #1f1f1f;padding:20px;margin-bottom:24px">
      <div style="color:#888;font-size:12px;margin-bottom:8px">Pay to (USDT TRC-20)</div>
      <div style="font-family:monospace;font-size:13px;color:#fff;word-break:break-all">{wallet}</div>
    </div>

    <p style="color:#666;font-size:12px;line-height:1.6;margin:0">
      After sending, go to <strong>Settings → Billing</strong> in your Kado account and click "I've Paid".<br>
      Your bot keeps trading while payment is pending.<br><br>
      Questions? Reply to this email.
    </p>
  </div>
</body>
</html>"""
    return _send(to, f"Kado weekly fee — {label}", html)


def run(year: int = None, week: int = None) -> list[dict]:
    """
    Calculate and record weekly performance fees.
    Defaults to last ISO week. Returns list of processed results.
    """
    now = datetime.now(timezone.utc)
    if year is None or week is None:
        last_monday = now - timedelta(days=now.weekday() + 7)
        iso = last_monday.isocalendar()
        year, week = iso.year, iso.week

    db = SessionLocal()
    results = []
    try:
        subs = db.query(Subscription).filter(
            Subscription.plan   == "performance",
            Subscription.status == "active",
        ).all()
        label = _week_label(year, week)
        print(f"[BILLING-WEEKLY] {label} — {len(subs)} performance users")

        for sub in subs:
            user = sub.user
            if not user:
                continue

            gross_pnl = _calc_weekly_pnl(db, user.id, year, week)

            # High-water mark: only charge on net new profit above previous peak
            hwm = sub.hwm_usd or 0.0
            adjusted_profit = max(0.0, gross_pnl - max(0.0, -hwm))
            sub.hwm_usd = hwm + gross_pnl

            weekly = db.query(WeeklyPnl).filter_by(
                user_id=user.id, year=year, week=week,
            ).first()

            if adjusted_profit > 0:
                fee_usd = round(adjusted_profit * 0.20, 2)

                if not weekly:
                    weekly = WeeklyPnl(user_id=user.id, year=year, week=week)
                    db.add(weekly)

                weekly.gross_pnl       = round(gross_pnl, 2)
                weekly.performance_fee = fee_usd
                weekly.net_pnl         = round(gross_pnl - fee_usd, 2)
                weekly.fee_paid        = False

                if fee_usd >= MIN_FEE_USD:
                    sent = _send_invoice_email(user.email, year, week, gross_pnl, fee_usd)
                else:
                    sent = False  # too small — recorded but no email
                    print(f"[BILLING-WEEKLY] user={user.id} fee=${fee_usd:.2f} below ${MIN_FEE_USD} threshold, skipping email")

                print(
                    f"[BILLING-WEEKLY] user={user.id} ({user.email}) "
                    f"gross=${gross_pnl:.2f} fee=${fee_usd:.2f} email={'sent' if sent else 'skipped'}"
                )
                results.append({
                    "user_id": user.id, "email": user.email,
                    "gross_pnl": gross_pnl, "fee": fee_usd, "invoice_sent": sent,
                })
            else:
                if weekly:
                    weekly.gross_pnl = round(gross_pnl, 2)
                    weekly.net_pnl   = round(gross_pnl, 2)
                print(f"[BILLING-WEEKLY] user={user.id} no chargeable profit (gross={gross_pnl:.2f} hwm_before={hwm:.2f})")
                results.append({
                    "user_id": user.id, "email": user.email,
                    "gross_pnl": gross_pnl, "fee": 0.0, "invoice_sent": False,
                })

        db.commit()
        _calculate_referral_earnings(db, year, week)
    except Exception as e:
        db.rollback()
        print(f"[BILLING-WEEKLY] Error: {e}")
        raise
    finally:
        db.close()

    return results


def _calculate_referral_earnings(db, year: int, week: int):
    """For each user who paid a performance fee this week, credit their referrer 25%."""
    monday, _ = _week_range(year, week)

    rows = db.query(WeeklyPnl).filter(
        WeeklyPnl.year == year,
        WeeklyPnl.week == week,
        WeeklyPnl.performance_fee > 0,
    ).all()

    created = 0
    for row in rows:
        referred_user = db.query(User).filter(User.id == row.user_id).first()
        if not referred_user or not referred_user.referred_by_id:
            continue

        exists = db.query(ReferralEarning).filter(
            ReferralEarning.referral_id == referred_user.referred_by_id,
            ReferralEarning.referred_id == referred_user.id,
            ReferralEarning.week_start  == monday.replace(tzinfo=None),
        ).first()
        if exists:
            continue

        earned = round(row.performance_fee * 0.25, 4)
        earning = ReferralEarning(
            referral_id = referred_user.referred_by_id,
            referred_id = referred_user.id,
            week_start  = monday.replace(tzinfo=None),
            fee_paid    = row.performance_fee,
            earned      = earned,
            paid_out    = False,
        )
        db.add(earning)
        created += 1

    db.commit()
    print(f"Referral earnings: {created} rows created for week {year}-W{week:02d}")


if __name__ == "__main__":
    results = run()
    print(f"\n[BILLING-WEEKLY] Done — {len(results)} users processed")
