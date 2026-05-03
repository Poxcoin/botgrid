"""
Stripe billing — checkout, portal, webhook handler.

Env vars required:
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_BASIC
  STRIPE_PRICE_PRO
"""
import os
import stripe
from datetime import datetime, timezone

from database import SessionLocal, User, Subscription

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

_PRICE_TO_PLAN = {
    os.environ.get("STRIPE_PRICE_BASIC", "__unset_basic__"): "basic",
    os.environ.get("STRIPE_PRICE_PRO",   "__unset_pro__"):   "pro",
}

BASE_URL = "https://kadoclub.net"


def _get_or_create_customer(user: User, db) -> str:
    sub = user.subscription
    if sub and sub.stripe_customer_id:
        return sub.stripe_customer_id
    customer = stripe.Customer.create(
        email=user.email,
        metadata={"user_id": str(user.id)},
    )
    if not sub:
        sub = Subscription(user_id=user.id)
        db.add(sub)
    sub.stripe_customer_id = customer.id
    db.commit()
    return customer.id


def create_checkout_session(user_id: int, plan: str) -> str:
    """Returns Stripe Checkout URL. Raises on unknown plan or Stripe error."""
    if plan not in ("basic", "pro", "performance"):
        raise ValueError(f"Unknown plan: {plan}")

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("User not found")
        customer_id = _get_or_create_customer(user, db)
        success_url = f"{BASE_URL}/account?billing=success"
        cancel_url  = f"{BASE_URL}/pricing"

        if plan in ("basic", "pro"):
            price_id = os.environ.get(f"STRIPE_PRICE_{plan.upper()}", "")
            if not price_id:
                raise ValueError(f"STRIPE_PRICE_{plan.upper()} env var not set")
            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=["card"],
                mode="subscription",
                line_items=[{"price": price_id, "quantity": 1}],
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={"user_id": str(user_id), "plan": plan},
            )
        else:  # performance — setup intent, $0 upfront
            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=["card"],
                mode="setup",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={"user_id": str(user_id), "plan": "performance"},
            )
        return session.url
    finally:
        db.close()


def create_portal_session(user_id: int) -> str:
    """Returns Stripe Customer Portal URL."""
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        sub = user.subscription if user else None
        if not sub or not sub.stripe_customer_id:
            raise ValueError("No Stripe customer found for this user")
        session = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=f"{BASE_URL}/account",
        )
        return session.url
    finally:
        db.close()


def handle_webhook(payload: bytes, sig_header: str) -> None:
    """Verify Stripe signature and dispatch to handler. Raises on bad sig."""
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    event = stripe.Webhook.construct_event(payload, sig_header, secret)

    evt_type = event["type"]
    obj = event["data"]["object"]

    if evt_type in ("customer.subscription.created", "customer.subscription.updated"):
        _on_sub_upsert(obj)
    elif evt_type == "customer.subscription.deleted":
        _on_sub_deleted(obj)
    elif evt_type == "checkout.session.completed":
        _on_checkout_completed(obj)
    elif evt_type == "invoice.payment_failed":
        _on_invoice_failed(obj)


def _on_sub_upsert(stripe_sub: dict) -> None:
    customer_id = stripe_sub["customer"]
    price_id    = stripe_sub["items"]["data"][0]["price"]["id"]
    status      = stripe_sub["status"]
    period_end  = stripe_sub.get("current_period_end")
    plan        = _PRICE_TO_PLAN.get(price_id, "pro")
    db_status   = {"active": "active", "past_due": "past_due"}.get(status, "cancelled")

    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(
            Subscription.stripe_customer_id == customer_id
        ).first()
        if not sub:
            return
        sub.stripe_sub_id   = stripe_sub["id"]
        sub.stripe_price_id = price_id
        sub.plan            = plan
        sub.status          = db_status
        if period_end:
            sub.expires_at = datetime.utcfromtimestamp(period_end)
        if sub.user:
            sub.user.plan = plan
        db.commit()
    finally:
        db.close()


def _on_sub_deleted(stripe_sub: dict) -> None:
    customer_id = stripe_sub["customer"]
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(
            Subscription.stripe_customer_id == customer_id
        ).first()
        if not sub:
            return
        sub.status = "cancelled"
        if sub.user:
            sub.user.plan = "free"
        db.commit()
    finally:
        db.close()


def _on_checkout_completed(session: dict) -> None:
    metadata    = session.get("metadata") or {}
    user_id     = metadata.get("user_id")
    plan        = metadata.get("plan")
    customer_id = session.get("customer")

    if not user_id or not customer_id:
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == int(user_id)).first()
        if not user:
            return
        sub = user.subscription
        if not sub:
            sub = Subscription(user_id=user.id)
            db.add(sub)
        sub.stripe_customer_id = customer_id

        if plan == "performance":
            sub.plan       = "performance"
            sub.status     = "active"
            sub.expires_at = None
            user.plan      = "performance"

        db.commit()
    finally:
        db.close()


def _on_invoice_failed(invoice: dict) -> None:
    customer_id = invoice.get("customer")
    db = SessionLocal()
    try:
        sub = db.query(Subscription).filter(
            Subscription.stripe_customer_id == customer_id
        ).first()
        if not sub:
            return
        sub.status = "past_due"
        db.commit()
    finally:
        db.close()
