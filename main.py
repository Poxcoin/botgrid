import time
import json
import os
from datetime import datetime, timezone
from modules.decision_maker import generate_signal, generate_whale_signal, generate_smart_wallet_signal
from modules.trader import execute_trade, get_free_usdt, get_wallet_usdt, close_all_positions, _init_exchange
from modules.tg_notifier import send_telegram_message, send_telegram_photo_or_text, get_telegram_updates
from modules import daily_guard, position_monitor, pnl_tracker, unified_pnl
from modules.tg_commander import start_commander
from modules.news_archive import archive_news
from modules.news_parser import get_aggregated_news
from modules.telegram_monitor import start_telegram_monitor, tg_news_queue, tg_news_event
from modules.liquidation_monitor import start_liquidation_monitor, liquidation_signal_queue
from modules.onchain_monitor import start_onchain_monitor
from modules.exchange_announcements import start_announcements_monitor, ann_queue
from modules.dex_scanner import start_dex_scanner, dex_queue
from modules.smart_wallet_tracker import start_smart_wallet_tracker, smart_wallet_queue
from modules.coingecko_monitor import start_coingecko_monitor, cg_queue
from modules.analytics_db import save_signal, init_db, DB_PATH
from modules.liquidation_monitor import get_liquidation_signal
from modules.onchain_monitor import get_onchain_signal
from modules.market_data import get_btc_2h_change
from modules.post_trade_analyzer import (
    start_analyzer, get_score_threshold_boost, is_coin_paused
)
from modules.session_monitor import start_session_monitor, get_session_bias
from modules.saas_dispatcher import dispatch as saas_dispatch, resume_fr_closes
from modules.oi_utils import fetch_oi_delta
from modules.oi_monitor import start_oi_monitor, get_oi_context
from modules.token_unlocks import start_unlock_monitor, get_unlock_risk
from modules.deribit_options import start_deribit_monitor, options_queue, get_options_sentiment
from modules.macro_calendar import is_trade_blocked
from config.settings import (
    BYBIT_API_KEY, IS_DEMO_TRADING, TG_CHAT_ID,
    ALT_LEVERAGE, ALT_TP, ALT_SL, ALT_SIZE, MIN_ALTCOIN_VOLUME_USD,
    LEVERAGE, TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, TRADE_PERCENT_SIZE,
    SIGNAL_BOT_TRADING, TELEGRAM_CHANNEL_ID,
)
import ccxt

# Путь к файлу истории
LEDGER_FILE = "signals_log.json"


# Cooldown для публікації в канал — не спамимо одну монету частіше ніж раз на 4 год
_channel_cooldown: dict[str, float] = {}
_CHANNEL_COOLDOWN_SEC = 4 * 3600


def _strip_html(text: str) -> str:
    import re
    return re.sub(r"<[^>]+>", "", text).strip()


def _post_to_channel(signal: dict, source: str) -> None:
    """Publish signal to public Telegram channel in news-channel style. Never raises."""
    if not TELEGRAM_CHANNEL_ID:
        return
    try:
        coin      = signal.get("coin", "?")
        action    = signal.get("action", "?")
        score     = signal.get("total_score", 0)
        conf      = signal.get("confidence", 0)
        title     = signal.get("news_title", "") or signal.get("title", "")
        desc      = _strip_html(signal.get("news_description", "") or signal.get("description", ""))
        link      = signal.get("news_link", "") or signal.get("link", "")
        image_url = signal.get("news_image_url") or signal.get("image_url")
        src_name  = signal.get("source", "")

        now_ts = time.time()
        if now_ts - _channel_cooldown.get(coin, 0) < _CHANNEL_COOLDOWN_SEC:
            return
        _channel_cooldown[coin] = now_ts

        d_emoji  = "🟢" if action in ("BUY", "LONG") else ""
        d_label  = "LONG" if action in ("BUY", "LONG") else "SHORT"

        from modules.tg_notifier import tg_footer, tg_escape
        if source in ("news", "dex"):
            headline = tg_escape((title[:180] + "…" if len(title) > 180 else title).upper())
            snippet  = tg_escape((desc[:280] + "…" if len(desc) > 280 else desc) if desc else "")
            conf_str = f" · {conf}%" if conf else ""
            is_real_link = link and not link.startswith(("cg://", "liq://", "dex://", "sw://"))

            text  = f" <b>{headline}</b>\n\n"
            if snippet:
                text += f"{snippet}\n\n"
            text += "━━━━━━━━━━━━━━━\n"
            text += f"{d_emoji} <b>{tg_escape(coin)}</b> · {d_label}{conf_str}\n"
            if src_name:
                text += f" {tg_escape(src_name)}\n"
            if is_real_link:
                text += f"\n <a href=\"{tg_escape(link)}\">Full article ↗</a>\n"
            text += tg_footer('channel')

            send_telegram_photo_or_text(TELEGRAM_CHANNEL_ID, text, image_url)

        elif source == "liq_cascade":
            cascade_m = signal.get("cascade_usd", 0) / 1_000_000
            side_text = "shorts liquidated" if action in ("BUY", "LONG") else "longs liquidated"
            momentum  = "bullish continuation" if action in ("BUY", "LONG") else "bearish continuation"
            text = (
                f" <b>LIQUIDATION CASCADE</b>\n\n"
                f"<b>${cascade_m:.0f}M</b> in <b>{tg_escape(coin)}</b> {side_text} — {momentum}\n\n"
                f"━━━━━━━━━━━━━━━\n"
                f"{d_emoji} <b>{tg_escape(coin)}</b> · {d_label} · <b>${cascade_m:.0f}M</b> cascade"
                f"{tg_footer('channel')}"
            )
            send_telegram_message(text, TELEGRAM_CHANNEL_ID)

        else:
            headline = tg_escape((title[:120] if title else f"{coin} market signal").upper())
            text = (
                f" <b>{headline}</b>\n\n"
                f"{d_emoji} <b>{tg_escape(coin)}</b> · {d_label}\n"
                f" {tg_escape(src_name or source.upper())}"
                f"{tg_footer('channel')}"
            )
            send_telegram_message(text, TELEGRAM_CHANNEL_ID)

    except Exception:
        pass


def _saas_dispatch(signal: dict, source: str, leverage: int,
                   tp_pct: float, sl_pct: float, size_pct: float) -> None:
    """Fan signal out to all active SaaS subscribers — never raises."""
    try:
        _coin   = signal.get("coin", "")
        _action = signal.get("action", "")
        _score  = signal.get("total_score", 0)
        _sym    = f"{_coin}/USDT:USDT"

        try:
            from modules.market_state import set_state, MarketCondition
            _is_long = _action in ("LONG", "BUY")
            if source == "liq_cascade":
                _ms   = MarketCondition.BULL if _is_long else MarketCondition.BEAR
                _conf = min(abs(_score) / 10, 0.9) if _score else 0.65
            else:
                # news / dex / whale — score-based
                if _is_long:
                    _ms = MarketCondition.PUMP if _score >= 13 else MarketCondition.BULL
                else:
                    _ms = MarketCondition.CRASH if _score <= -13 else MarketCondition.BEAR
                _conf = min(abs(_score) / 15, 0.90)
            if _coin and _sym:
                set_state(_sym, _ms, source, confidence=_conf,
                          reason=f"{source} {_action} score={_score:.0f}")
        except Exception:
            pass

        saas_dispatch({
            "source":          source,
            "symbol":          _sym,
            "side":            _action,
            "leverage":        leverage,
            "size_pct":        size_pct,
            "tp_pct":          tp_pct,
            "sl_pct":          sl_pct,
            "close_after_min": signal.get("close_after_min"),
            "score":           abs(_score) if _score else None,
        })
    except Exception as e:
        print(f"[SAAS] dispatch error: {e}")
PROCESSED_URLS_FILE = "processed_urls.json"
COOLDOWN_FILE = "coin_cooldown.json"


def load_cooldown() -> dict:
    """Завантажує cooldown з диску — захист від flood при рестарті бота."""
    if os.path.exists(COOLDOWN_FILE):
        try:
            with open(COOLDOWN_FILE, "r") as f:
                data = json.load(f)
            now = datetime.now(timezone.utc).timestamp()
            # Очищаємо застарілі записи (старші за 2h — вони вже не блокують)
            return {k: v for k, v in data.items() if now - v < COIN_COOLDOWN_SEC}
        except Exception:
            pass
    return {}


def save_cooldown(cooldown: dict) -> None:
    try:
        with open(COOLDOWN_FILE, "w") as f:
            json.dump(cooldown, f)
    except Exception as e:
        print(f"[cooldown] save error: {e}")


def load_ledger():
    """Загружает историю сигналов из файла при старте."""
    if os.path.exists(LEDGER_FILE):
        try:
            with open(LEDGER_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Ошибка при загрузке лога: {e}")
    return []

def save_ledger(ledger):
    """Сохраняет текущий реестр сигналов в файл для веб-интерфейса."""
    try:
        # Ограничиваем историю последними 500 записями, чтобы файл не раздувался
        with open(LEDGER_FILE, "w") as f:
            json.dump(ledger[-500:], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Ошибка при сохранении лога: {e}")

def load_processed_urls():
    """Загружает список уже обработанных URL из файла — защита от дублей при перезапуске."""
    if os.path.exists(PROCESSED_URLS_FILE):
        try:
            with open(PROCESSED_URLS_FILE, "r") as f:
                data = json.load(f)
                return set(data)
        except Exception:
            pass
    return set()

def save_processed_urls(urls: set):
    """Сохраняет последние 2000 URL чтобы файл не разрастался."""
    try:
        with open(PROCESSED_URLS_FILE, "w") as f:
            json.dump(list(urls)[-2000:], f)
    except Exception as e:
        print(f"Ошибка при сохранении processed_urls: {e}")


def _tg_pnl_summary() -> str:
    """Returns detailed PnL summary with per-coin breakdown."""
    import sqlite3
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row

        all_closed = con.execute(
            "SELECT pnl_usdt, coin FROM trades WHERE result != 'OPEN'"
        ).fetchall()
        today_closed = con.execute(
            "SELECT pnl_usdt, coin FROM trades WHERE result != 'OPEN' "
            "AND timestamp_open >= datetime('now', 'start of day')"
        ).fetchall()
        week_closed = con.execute(
            "SELECT pnl_usdt FROM trades WHERE result != 'OPEN' "
            "AND timestamp_open >= datetime('now', '-7 days')"
        ).fetchall()
        open_count = con.execute(
            "SELECT COUNT(*) FROM trades WHERE result = 'OPEN'"
        ).fetchone()[0]
        coin_stats = con.execute(
            "SELECT coin, COUNT(*) total, "
            "SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END) wins, "
            "ROUND(SUM(pnl_usdt), 2) pnl "
            "FROM trades WHERE result != 'OPEN' "
            "GROUP BY coin ORDER BY pnl DESC LIMIT 6"
        ).fetchall()
        con.close()

        total_pnl = sum((r["pnl_usdt"] or 0) for r in all_closed)
        today_pnl = sum((r["pnl_usdt"] or 0) for r in today_closed)
        week_pnl  = sum((r["pnl_usdt"] or 0) for r in week_closed)
        wins = sum(1 for r in all_closed if (r["pnl_usdt"] or 0) > 0)
        total = len(all_closed)
        wr = wins / max(total, 1) * 100
        today_wins = sum(1 for r in today_closed if (r["pnl_usdt"] or 0) > 0)
        today_wr = today_wins / max(len(today_closed), 1) * 100

        icon = "" if total_pnl >= 0 else ""
        today_icon = "" if today_pnl >= 0 else ""

        lines = [
            f"{icon} <b>PnL Статистика</b>\n",
            f"{today_icon} Сьогодні: <b>{today_pnl:+.2f}$</b> | WR {today_wr:.0f}% ({len(today_closed)} угод)",
            f" 7 днів: <b>{week_pnl:+.2f}$</b>",
            f" Всього: <b>{total_pnl:+.2f}$</b> | WR {wr:.0f}% ({total} угод)",
            f" Відкрито: {open_count}",
        ]

        if coin_stats:
            lines.append("\n<b>По монетах (топ):</b>")
            for r in coin_stats:
                wr_c = (r["wins"] / max(r["total"], 1)) * 100
                pnl_c = r["pnl"] or 0
                ci = "" if pnl_c >= 0 else ""
                lines.append(f"{ci} {r['coin']}: {pnl_c:+.1f}$ | {wr_c:.0f}% ({r['total']})")

        return "\n".join(lines)
    except Exception as e:
        return f" Помилка БД: {e}"


def _tg_trades(n: int = 7) -> str:
    """Returns last N closed trades."""
    import sqlite3
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT coin, action, pnl_usdt, result, timestamp_open "
            "FROM trades WHERE result != 'OPEN' ORDER BY rowid DESC LIMIT ?", (n,)
        ).fetchall()
        con.close()
        if not rows:
            return "Немає закритих угод."
        lines = [" <b>Останні угоди</b>\n"]
        for r in rows:
            pnl = r["pnl_usdt"] or 0
            icon = "" if pnl > 0 else ""
            date = (r["timestamp_open"] or "")[:10]
            lines.append(f"{icon} {r['coin']} {r['action']} | <b>{pnl:+.2f}$</b> | {date}")
        return "\n".join(lines)
    except Exception as e:
        return f" Помилка: {e}"


def _tg_signals() -> str:
    """Returns last 5 executed signals."""
    import sqlite3
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT coin, action, total_score, confidence, timestamp "
            "FROM signals WHERE executed=1 ORDER BY rowid DESC LIMIT 5"
        ).fetchall()
        total = con.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
        executed = con.execute("SELECT COUNT(*) FROM signals WHERE executed=1").fetchone()[0]
        con.close()
        lines = [f" <b>Сигнали</b> (всього {total}, виконано {executed})\n"]
        for s in rows:
            score = s["total_score"] or 0
            icon = "" if score > 0 else ""
            date = (s["timestamp"] or "")[:16]
            lines.append(f"{icon} {s['coin']} {s['action']} score={score:+.1f} conf={s['confidence']}% | {date}")
        return "\n".join(lines)
    except Exception as e:
        return f" Помилка: {e}"


def _tg_open_positions() -> str:
    """Returns currently open positions."""
    import sqlite3
    from datetime import datetime, timezone
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT coin, action, entry_price, timestamp_open FROM trades WHERE result='OPEN'"
        ).fetchall()
        con.close()
        if not rows:
            return " Немає відкритих позицій."
        now = datetime.now(timezone.utc)
        lines = [f" <b>Відкриті позиції ({len(rows)})</b>\n"]
        for r in rows:
            age = ""
            try:
                ts = datetime.fromisoformat((r["timestamp_open"] or "").replace("Z", "+00:00"))
                mins = int((now - ts).total_seconds() / 60)
                age = f"{mins}хв"
            except Exception:
                pass
            lines.append(f" {r['coin']} {r['action']} | вхід {r['entry_price']} | {age}")
        return "\n".join(lines)
    except Exception as e:
        return f" Помилка: {e}"


def handle_telegram_commands(processed_updates):
    """
    Обрабатывает новые сообщения из Telegram.
    Передаём offset = max(seen_id) + 1 чтобы Telegram не возвращал старые сообщения.
    """
    offset = (max(processed_updates) + 1) if processed_updates else None
    updates = get_telegram_updates(offset=offset)
    for update in updates:
        update_id = update.get("update_id")
        if update_id in processed_updates:
            continue

        processed_updates.add(update_id)
        message = update.get("message", {})
        chat_id = message.get("chat", {}).get("id")
        text = (message.get("text", "") or "").strip().lower()

        # Allow /start for account linking from ANY user
        if str(chat_id) != str(TG_CHAT_ID):
            # Only process /start for non-owners (account linking)
            if text.startswith("/start "):
                token = text.split(" ", 1)[1].strip()
                if len(token) == 32:  # UUID hex token
                    try:
                        import requests as _req
                        resp = _req.post(
                            "http://localhost:8000/api/telegram/verify",
                            json={"token": token, "chat_id": str(chat_id)},
                            timeout=5,
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            send_telegram_message(
                                f" <b>Аккаунт привязан!</b>\n\n"
                                f" {data.get('username', '')}\n"
                                f" {data.get('email', '')}\n\n"
                                f"Теперь ты будешь получать уведомления от своего бота здесь.",
                                chat_id
                            )
                        else:
                            send_telegram_message(
                                " Ссылка недействительна или истекла.\n\nПолучи новую ссылку в личном кабинете на kadoclub.net",
                                chat_id
                            )
                    except Exception as e:
                        send_telegram_message(" Ошибка сервера. Попробуй позже.", chat_id)
            continue

        if text == "/status":
            svcs = ["crypto-web", "crypto-sniper", "crypto-grid", "crypto-bot"]
            import subprocess
            lines = [" <b>Статус сервісів</b>\n"]
            for s in svcs:
                r = subprocess.run(["systemctl", "is-active", s], capture_output=True, text=True)
                st = r.stdout.strip()
                lines.append(f"{'' if st == 'active' else ''} {s}: {st}")
            lines.append(f"\n {datetime.now().strftime('%H:%M:%S UTC')}")
            send_telegram_message("\n".join(lines), chat_id)

        elif text == "/balance":
            from config.settings import BYBIT_SECRET
            ex = ccxt.bybit({"apiKey": BYBIT_API_KEY, "secret": BYBIT_SECRET, "enableRateLimit": True})
            if IS_DEMO_TRADING:
                ex.urls["api"] = ex.urls["demotrading"]
            ex.options["adjustForTimeDifference"] = True
            balance = get_free_usdt(ex)
            send_telegram_message(f" <b>Баланс Bybit:</b> {balance} USDT", chat_id)

        elif text == "/pnl":
            send_telegram_message(_tg_pnl_summary(), chat_id)

        elif text.startswith("/trades"):
            parts = text.split()
            n = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 7
            send_telegram_message(_tg_trades(n), chat_id)

        elif text == "/signals":
            send_telegram_message(_tg_signals(), chat_id)

        elif text == "/open":
            send_telegram_message(_tg_open_positions(), chat_id)

        elif text in ("/start", "/help") or (text.startswith("/start") and len(text.split()) == 1):
            send_telegram_message(
                " <b>KADO Trading Bot</b>\n\n"
                "/status — сервісы\n"
                "/balance — баланс Bybit\n"
                "/pnl — прибыль/убыток\n"
                "/trades [N] — последние N сделок\n"
                "/signals — последние сигналы\n"
                "/open — открытые позиции",
                chat_id
            )

LIVE_INTEL_FILE = "live_intel.json"


def _dynamic_leverage(signal: dict, is_btc_eth: bool) -> int:
    """Возвращает плечо на основе скора сигнала.

    Коли leverage підвищується — size_multiplier в сигналі знижується щоб
    уникнути подвійного масштабування ризику.
    """
    score = abs(signal.get("total_score", 0))
    base_lev = 2 if is_btc_eth else ALT_LEVERAGE

    if score >= 14:
        lev = min(base_lev + 2, 5)
    elif score >= 12:
        lev = min(base_lev + 1, 4)
    else:
        lev = base_lev

    # Компенсуємо зростання плеча зниженням розміру позиції
    # щоб реальний ризик на угоду лишався постійним
    if lev > base_lev:
        reduction = base_lev / lev  # lev=4 vs base=2 → 0.5; lev=5 vs base=3 → 0.6
        current_mult = signal.get("size_multiplier", 1.0)
        signal["size_multiplier"] = round(current_mult * reduction, 2)

    return lev

def start_rss_archiver():
    """Background thread: poll RSS every 5 min and archive articles for the news feed."""
    import threading

    def _loop():
        while True:
            try:
                articles = get_aggregated_news(limit_per_source=15)
                for item in articles:
                    news_item = {
                        "title":        item["title"],
                        "link":         item["link"],
                        "source":       item["source"],
                        "source_weight": item["source_weight"],
                        "description":  item.get("description", ""),
                        "published":    item.get("published_dt") or item.get("published", ""),
                        "image_url":    item.get("image_url"),
                        "category":     item.get("cat", "OTHER"),
                    }
                    archive_news(news_item)
            except Exception as e:
                print(f"[rss_archiver] error: {e}")
            time.sleep(300)  # 5 min

    t = threading.Thread(target=_loop, name="rss-archiver", daemon=True)
    t.start()
    return True


def _write_live_intel(tg_enabled: bool) -> None:
    """Пишет текущий статус источников и live данные для дашборда."""
    try:
        coins = ["BTC", "ETH", "SOL", "BNB", "XRP"]
        liq = {c: get_liquidation_signal(c) for c in coins}
        onchain = get_onchain_signal("ETH")
        intel = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "sources": {
                "rss":         True,
                "telegram":    tg_enabled,
                "liquidations": True,
                "onchain":     True,
            },
            "liquidations": liq,
            "onchain":       onchain,
        }
        with open(LIVE_INTEL_FILE, "w") as f:
            json.dump(intel, f)
    except Exception:
        pass


def run_signal_engine():
    """
    Бесконечный цикл Движка (Сердца).
    Работает 24/7: ищет новости -> считает математику -> сохраняет сигналы.
    """
    print(f"[{datetime.now().strftime('%H:%M:%S')}]  SIGNAL ENGINE ЗАПУЩЕН! Поиск альткоинов...\n")

    # ─── Инициализация guard-модулей ──────────────────────────────────────────
    try:
        ex_init = _init_exchange()
        start_bal = get_wallet_usdt(ex_init)
    except Exception:
        start_bal = 0.0
    daily_guard.init(current_balance=start_bal)
    daily_guard.set_cancel_callback(lambda: close_all_positions(None))

    # ── Bybit API key safety check ────────────────────────────────────────────
    try:
        _api_info = ex_init.private_get_v5_user_query_api({})
        _perms = _api_info.get("result", {}).get("permissions", {})
        _withdraw_perm = _perms.get("Wallet", [])
        if "AccountTransfer" in _withdraw_perm or "SubMemberTransferOut" in _withdraw_perm:
            send_telegram_message(
                " <b>Bybit API Security Warning!</b>\n"
                "Поточний API ключ має права на вивід/переказ коштів.\n"
                "Рекомендується: створити окремий ключ БЕЗ Wallet permissions.",
                TG_CHAT_ID
            )
            print("[SECURITY]   API key has Wallet/transfer permissions — рекомендується обмежити!")
    except Exception:
        pass  # API info недоступна — не блокуємо запуск

    position_monitor.start_monitor(
        exchange_factory=_init_exchange,
        send_tg=send_telegram_message,
        chat_id=TG_CHAT_ID,
    )
    pnl_tracker.start_pnl_tracker(exchange_factory=_init_exchange)
    unified_pnl.start_sync(exchange_factory=_init_exchange)
    tg_enabled = start_telegram_monitor()
    start_liquidation_monitor()
    start_onchain_monitor()
    resume_fr_closes()
    start_announcements_monitor()
    start_commander()
    start_dex_scanner()
    start_smart_wallet_tracker()
    start_coingecko_monitor()
    start_oi_monitor()
    start_unlock_monitor()
    start_deribit_monitor()
    # FR signal strategy retired 2026-05-21 — see project-strategy-roadmap memory.
    start_analyzer(exchange_factory=_init_exchange, send_tg=send_telegram_message, chat_id=TG_CHAT_ID)
    start_session_monitor(send_tg=send_telegram_message, chat_id=TG_CHAT_ID)
    start_rss_archiver()

    sources = "Binance/Bybit Announcements + Telegram"
    sig_mode = " збір статистики (торгівля вимкнена)" if not SIGNAL_BOT_TRADING else " активна торгівля"
    send_telegram_message(
        f" <b>BotGrid запущен</b>\n"
        f"Джерела: {sources}\n"
        f"Signal бот: {sig_mode}\n"
        f"Grid бот: SOL / ETH / BTC активний",
        TG_CHAT_ID
    )

    init_db()
    signal_ledger = load_ledger()

    # Cooldown: coin -> last_trade_ts — не торгуем одну монету чаще раз в 2 часа
    # Завантажуємо з диску щоб рестарт бота не скидав cooldown (захист від flood)
    _coin_cooldown: dict = load_cooldown()
    COIN_COOLDOWN_SEC = 2 * 3600
    print(f"[cooldown] завантажено {len(_coin_cooldown)} активних cooldown з диску")

    # Денний ліміт угод на монету: BTC/ETH max 2, альти max 2
    # {coin: {"count": int, "date": str "YYYY-MM-DD"}}
    _daily_trade_count: dict = {}
    MAX_DAILY_TRADES_BTC_ETH = 2
    MAX_DAILY_TRADES_ALT = 2

    # Лимит суммарной экспозиции: не более MAX_EXPOSURE_PCT% баланса в открытых позициях
    MAX_EXPOSURE_PCT = 20.0

    # Дедупликация сигналов: (coin, action) -> last_signal_ts
    # Один и тот же сигнал по одной монете не логируем чаще раз в 30 мин
    _signal_dedup: dict = {}
    SIGNAL_DEDUP_SEC = 30 * 60

    # Підрахунок дублікатів: (coin, action) -> кількість за останні 10 хвилин
    # Повторний сигнал = підтвердження → підсилення score
    _signal_duplicates: dict = {}  # coin -> count за останні 10 хвилин
    DUPLICATE_WINDOW_SEC = 600     # 10 хвилин

    # Загружаем обработанные URL из файла — защита от дублей при перезапуске
    processed_urls = load_processed_urls()
    processed_tg_updates = set()
    last_error_tg_time = 0      # антиспам: не чаще 1 раза в 5 минут
    last_scan_log_time = 0.0
    
    while True:
        try:
            # 1a. Анонси бірж — НАЙВИЩИЙ ПРІОРИТЕТ (listing pumps)
            ann_news = []
            while not ann_queue.empty():
                try:
                    ann_news.append(ann_queue.get_nowait())
                except Exception:
                    break

            # 1b. DEX scanner — volume spikes (кожні 5 хв)
            dex_news = []
            while not dex_queue.empty():
                try:
                    dex_news.append(dex_queue.get_nowait())
                except Exception:
                    break

            # 1b2. CoinGecko trending + new listings
            cg_news = []
            while not cg_queue.empty():
                try:
                    cg_news.append(cg_queue.get_nowait())
                except Exception:
                    break

            # 1b3. Deribit options flow — великі угоди call/put
            opt_news = []
            while not options_queue.empty():
                try:
                    opt_news.append(options_queue.get_nowait())
                except Exception:
                    break

            # 1b4. Smart wallet moves — Alchemy WebSocket реалтайм
            smart_news = []
            while not smart_wallet_queue.empty():
                try:
                    smart_news.append(smart_wallet_queue.get_nowait())
                except Exception:
                    break

            # 1c. Telegram-черга — реалтайм новини
            tg_news = []
            while not tg_news_queue.empty():
                try:
                    tg_news.append(tg_news_queue.get_nowait())
                except Exception:
                    break

            ann_count   = len(ann_news)
            tg_count    = len(tg_news)
            dex_count   = len(dex_news)
            smart_count = len(smart_news)
            cg_count    = len(cg_news)
            opt_count   = len(opt_news)
            _has_input  = ann_count or tg_count or dex_count or smart_count or cg_count or opt_count
            _now_scan   = time.time()
            if _has_input:
                print(f"[{datetime.now().strftime('%H:%M:%S')}]  Сканування" +
                      (f" |  {ann_count} анонсів" if ann_count else "") +
                      (f" | TG: {tg_count}" if tg_count else "") +
                      (f" | DEX: {dex_count}" if dex_count else "") +
                      (f" |  Smart: {smart_count}" if smart_count else "") +
                      (f" |  CG: {cg_count}" if cg_count else "") + "...")
                last_scan_log_time = _now_scan
            elif _now_scan - last_scan_log_time >= 60:
                print(f"[{datetime.now().strftime('%H:%M:%S')}]  Сканування...")
                last_scan_log_time = _now_scan

            # Пріоритет: Анонси > Options Flow > Smart Wallets > TG > DEX > CoinGecko
            latest_news = ann_news + opt_news + smart_news + tg_news + dex_news + cg_news
            
            urls_changed = False
            for news_item in latest_news:
                if news_item['link'] in processed_urls:
                    continue

                processed_urls.add(news_item['link'])
                urls_changed = True

                # 2. Архивируем новость для Replay бэктестера
                archive_news(news_item)

                # 3. Аналіз — fast-path або повний pipeline

                if news_item.get("is_listing"):
                    continue  # лістинги обробляє crypto-alt (уникаємо double-trade)
                elif news_item.get("is_whale_alert"):
                    print(f"    Whale Alert: {news_item['title'][:60]}...")
                    signal = generate_whale_signal(news_item)
                elif news_item.get("is_smart_wallet"):
                    # 2026-05-25: smartmoney fully disabled — n=2 demo losses (-$21),
                    # backtest showed 2% WR over 220 signals (Council 2026-05-23).
                    # No live execution AND no demo signal emission until 14d Bayesian review.
                    continue
                else:
                    print(f"   Анализ: {news_item['title'][:60]}...")
                    signal = generate_signal(news_item)
                
                # 3. Сохраняем сигналы (дедупликация: один сигнал на монету за 30 мин)
                if signal:
                    now_ts = datetime.now(timezone.utc).timestamp()
                    dedup_key = (signal.get("coin", ""), signal.get("action", ""))
                    last_sig_ts = _signal_dedup.get(dedup_key, 0)
                    if signal["action"] in ("LONG", "SHORT") and \
                            now_ts - last_sig_ts < SIGNAL_DEDUP_SEC:
                        # Підсилюємо score замість пропуску
                        dup_count = _signal_duplicates.get(dedup_key, 0) + 1
                        _signal_duplicates[dedup_key] = min(dup_count, 5)  # cap at 5× max boost
                        if dup_count >= 2:
                            signal["total_score"] = signal["total_score"] * (1 + min(dup_count, 5) * 0.3)
                            print(f"    Дубль x{dup_count}: {dedup_key[0]} {dedup_key[1]} — score підсилено до {signal['total_score']:.1f}")
                        else:
                            print(f"   ⏭ Дубль сигнала {dedup_key[1]} {dedup_key[0]} — пропускаємо")
                            continue
                    else:
                        # Новий сигнал — скидаємо лічильник і оновлюємо timestamp
                        if now_ts - last_sig_ts >= DUPLICATE_WINDOW_SEC:
                            _signal_duplicates.pop(dedup_key, None)
                        _signal_dedup[dedup_key] = now_ts  # оновлюємо тільки для нових сигналів

                    signal['timestamp'] = datetime.now(timezone.utc).isoformat()
                    signal_ledger.append(signal)
                    save_ledger(signal_ledger)
                    
                    # Сохраняем в аналитическую БД (executed=False до реального ордера)
                    signal_id = save_signal(signal, executed=False)

                    if signal['action'] in ["LONG", "SHORT", "SELL_ALL"]:
                        print("\n==================================")
                        print(f" АХТУНГ! НАЙДЕН РЕАЛЬНЫЙ ТРЕЙД!")
                        print(json.dumps(signal, indent=2, ensure_ascii=False))
                        print("==================================\n")
                        
                        if signal['action'] == "SELL_ALL":
                            _coin_cooldown.clear()
                            close_all_positions(signal)
                        elif signal['action'] in ["LONG", "SHORT"]:
                            coin = signal.get("coin", "")
                            now_ts = datetime.now(timezone.utc).timestamp()

                            # Перевіряємо чи є протилежна відкрита позиція
                            from modules.position_monitor import _load_tracked, untrack
                            tracked = _load_tracked()
                            symbol_key = f"{coin.upper()}/USDT:USDT"
                            if symbol_key in tracked:
                                existing_action = tracked[symbol_key].get("action", "")
                                if existing_action and existing_action != signal["action"]:
                                    # Протилежний сигнал — закриваємо існуючу позицію
                                    print(f"[SIGNAL]  Протилежний сигнал для {coin}: закриваємо {existing_action}, готуємо {signal['action']}")
                                    try:
                                        ex = _init_exchange()
                                        sym = f"{coin.upper()}/USDT:USDT"
                                        live = ex.fetch_positions([sym], params={"category": "linear"})
                                        active = [p for p in live if abs(float(p.get("contracts") or 0)) > 0]
                                        if active:
                                            pos = active[0]
                                            contracts = abs(float(pos["contracts"]))
                                            close_side = "sell" if pos["side"] == "long" else "buy"
                                            ex.create_order(sym, "market", close_side, contracts,
                                                params={"category": "linear", "reduceOnly": True})
                                            untrack(sym)
                                            print(f"[SIGNAL]  {coin} закрито, входимо в {signal['action']}")
                                            _coin_cooldown[coin] = 0  # скидаємо cooldown щоб одразу відкрити нову
                                    except Exception as e:
                                        print(f"[SIGNAL]  Помилка закриття {coin}: {e}")

                            last_ts = _coin_cooldown.get(coin, 0)
                            if now_ts - last_ts < COIN_COOLDOWN_SEC:
                                remaining = int((COIN_COOLDOWN_SEC - (now_ts - last_ts)) / 60)
                                print(f"⏳ Cooldown {coin}: ещё {remaining} мин до следующей сделки")
                            else:
                                _btc_eth = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}

                                # Проверка лимита суммарной экспозиции
                                open_count = position_monitor.get_tracked_count()
                                if open_count > 0:
                                    try:
                                        # Грубая оценка: N открытых позиций * средний размер 5%
                                        _estimated_exposure_pct = open_count * 5.0
                                        if _estimated_exposure_pct >= MAX_EXPOSURE_PCT:
                                            print(f" ЭКСПОЗИЦИЯ: ~{_estimated_exposure_pct:.0f}% баланса в {open_count} позициях — лимит {MAX_EXPOSURE_PCT}%, пропускаем")
                                            continue
                                    except Exception:
                                        pass

                                # Macro calendar hard block (FOMC/CPI/NFP)
                                _macro_blocked, _macro_reason = is_trade_blocked()
                                if _macro_blocked:
                                    print(f"{_macro_reason} — пропускаємо {coin}")
                                    continue

                                # Token unlock filter
                                _unlock_risk, _unlock_reason = get_unlock_risk(coin)
                                if _unlock_risk == "avoid_long" and signal["action"] == "LONG":
                                    print(f"{_unlock_reason} — LONG {coin} заблоковано")
                                    continue
                                if _unlock_risk == "short_bias":
                                    signal["total_score"] -= 2.0
                                    print(f"{_unlock_reason} → score {signal['total_score']:.1f}")

                                # BTC Correlation Filter: блокируем LONG/SHORT на альтах
                                # если BTC сильно двигается в обратную сторону за 2h
                                _btc_2h = get_btc_2h_change()
                                _is_alt = coin.upper() not in _btc_eth
                                if _is_alt and signal["action"] == "LONG" and _btc_2h < -2.5:
                                    print(f" BTC correlation filter: BTC {_btc_2h:.1f}% за 2h — LONG {coin} заблокирован")
                                    continue
                                if _is_alt and signal["action"] == "SHORT" and _btc_2h > 2.5:
                                    print(f" BTC correlation filter: BTC +{_btc_2h:.1f}% за 2h — SHORT {coin} заблокирован")
                                    continue

                                # Adaptive post-trade filter
                                if is_coin_paused(coin):
                                    print(f"⏸ {coin} приостановлен (серия потерь) — пропускаем")
                                    continue
                                _btc_eth_local = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
                                _score_boost = get_score_threshold_boost(coin)
                                if _score_boost > 0:
                                    _base_min = 13.0 if coin.upper() in _btc_eth_local else 11.0
                                    if abs(signal["total_score"]) < _base_min + _score_boost:
                                        print(f" {coin}: адаптивний поріг {_base_min + _score_boost:.1f} — скор {signal['total_score']:.1f} не пройшов")
                                        continue

                                # Session bias modifier
                                _bias = get_session_bias()
                                if _bias["value"] != "neutral" and time.time() - _bias["updated_at"] < 14400:
                                    if _bias["value"] == "bearish" and signal.get("action") == "LONG":
                                        signal["total_score"] -= 1.0
                                        print(f" {coin}: session bearish ({_bias['session']}) → score {signal['total_score']:.1f}")
                                    elif _bias["value"] == "bullish" and signal.get("action") == "LONG":
                                        signal["total_score"] = min(signal["total_score"] + 0.5, 15.0)
                                        print(f" {coin}: session bullish ({_bias['session']}) → score {signal['total_score']:.1f}")

                                # Safety: explicit min-score guard
                                _is_sm_guard = str(signal.get("source", "")).startswith("Smart Wallet")
                                _min_safe = 6.0 if _is_sm_guard else (9.0 if coin.upper() in _btc_eth_local else 7.5)
                                if abs(signal['total_score']) < _min_safe:
                                    print(f" {coin}: score {signal['total_score']:.1f} < min {_min_safe} — safety filter пропускаємо")
                                    continue

                                # OI context (Binance 1h) + delta filter
                                try:
                                    _oi_ctx = get_oi_context(coin)
                                    if _oi_ctx:
                                        if _oi_ctx.get("signal") == "coil" and signal["action"] == "LONG":
                                            signal["total_score"] = min(signal["total_score"] + 1.0, 15.0)
                                            print(f" {coin}: OI coil (+{_oi_ctx['oi_1h_pct']:.1f}%/1h, ціна flat) → score {signal['total_score']:.1f}")
                                        elif _oi_ctx.get("signal") == "unwind":
                                            signal["total_score"] -= 2.0
                                            print(f" {coin}: OI unwind ({_oi_ctx['oi_1h_pct']:.1f}%/1h) → score {signal['total_score']:.1f}")
                                        _basis = _oi_ctx.get("basis_pct", 0)
                                        if _basis > 0.3 and signal["action"] == "LONG":
                                            signal["total_score"] -= 0.5
                                            print(f" {coin}: basis {_basis:+.2f}% (перегрів лонгів) → score {signal['total_score']:.1f}")
                                    _oi_sym = f"{coin.upper()}/USDT:USDT"
                                    _oi_delta = fetch_oi_delta(_oi_sym)
                                    if _oi_delta < -0.3:
                                        signal["total_score"] -= 1.5
                                        print(f" {coin}: OI delta {_oi_delta:+.3f}% (позиції закриваються) → score {signal['total_score']:.1f}")
                                        if abs(signal["total_score"]) < _min_safe:
                                            print(f" {coin}: після OI filter score {signal['total_score']:.1f} < min {_min_safe} — пропускаємо")
                                            continue
                                    elif _oi_delta > 0.3:
                                        signal["total_score"] = min(signal["total_score"] + 0.5, 15.0)
                                        print(f" {coin}: OI delta {_oi_delta:+.3f}% (нові позиції) → score {signal['total_score']:.1f}")
                                except Exception:
                                    pass  # OI недоступний — продовжуємо без фільтру

                                # Blacklist guard (синхронізовано з decision_maker._COIN_BLACKLIST)
                                # BTC/ETH/SOL/BNB — grid/FR боти покривають, news bot не вспіває
                                # (BTC 12%WR -$50, SOL 20%WR -$33, ETH 18.8%WR -$3)
                                _TRADE_BLACKLIST = {
                                    "STX", "ZETA", "OP", "ATOM", "LTC", "TRX", "AAVE",
                                    "BTC", "ETH", "SOL", "BNB",
                                    "BITCOIN", "ETHEREUM", "SOLANA", "BINANCE COIN",
                                }
                                if coin.upper() in _TRADE_BLACKLIST:
                                    print(f" {coin}: заблоковано (grid/FR покривають, news не вспіває)")
                                    continue

                                # Денний ліміт угод на монету
                                _today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                                _dc = _daily_trade_count.get(coin.upper(), {"count": 0, "date": ""})
                                if _dc["date"] != _today:
                                    _dc = {"count": 0, "date": _today}
                                _is_btc_eth_daily = coin.upper() in {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
                                _max_daily = MAX_DAILY_TRADES_BTC_ETH if _is_btc_eth_daily else MAX_DAILY_TRADES_ALT
                                if _dc["count"] >= _max_daily:
                                    print(f" {coin}: денний ліміт {_max_daily} угод вичерпано — пропускаємо")
                                    continue

                                # Всі фільтри пройдено — тільки тепер ставимо cooldown і рахуємо
                                _coin_cooldown[coin] = now_ts
                                _dc["count"] += 1
                                _daily_trade_count[coin.upper()] = _dc
                                save_cooldown(_coin_cooldown)

                                # ── Circuit breaker: денний ліміт збитків ────────────────
                                try:
                                    _bal_now = get_wallet_usdt(_init_exchange())
                                except Exception:
                                    _bal_now = 0.0
                                if not daily_guard.check(current_balance=_bal_now):
                                    send_telegram_message(
                                        " <b>Circuit breaker!</b> Денний ліміт збитків досягнуто. "
                                        "Торгівля зупинена до UTC 00:00.",
                                        TG_CHAT_ID
                                    )
                                    continue

                                # execute_trade removed 2026-05-21 — owner double-position bug.
                                # Listings strategy retired 2026-05-21 — see project-strategy-roadmap memory.
                                if not SIGNAL_BOT_TRADING:
                                    print(f" [SIGNAL] {coin} {signal['action']} score={signal['total_score']:.1f} — збір статистики (торгівля вимкнена)")
                                elif signal.get("is_listing"):
                                    print(f"⏭ Listing signal for {coin} — skipped (strategy retired, see roadmap)")
                                elif coin.upper() not in _btc_eth:
                                    mkt = signal.get("_market", {})
                                    vol = mkt.get("quote_volume_24h", 0) if mkt else 0
                                    if vol > 0 and vol < MIN_ALTCOIN_VOLUME_USD:
                                        print(f" {coin} об'єм ${vol/1e6:.1f}M < $5M — пропускаємо")
                                    else:
                                        dyn_lev = _dynamic_leverage(signal, is_btc_eth=False)
                                        if news_item.get("is_smart_wallet"):
                                            _src = "smartmoney"
                                        elif news_item.get("is_dex_spike"):
                                            _src = "dex"
                                        else:
                                            _src = "news"
                                        print(f" Dynamic lev={dyn_lev}x size×{signal.get('size_multiplier',1):.2f} (score={signal['total_score']:.1f}) src={_src}")
                                        _saas_dispatch(signal, _src,
                                            dyn_lev, ALT_TP, ALT_SL, ALT_SIZE)
                                        _post_to_channel(signal, _src)
                                else:
                                    dyn_lev = _dynamic_leverage(signal, is_btc_eth=True)
                                    if news_item.get("is_smart_wallet"):
                                        _src = "smartmoney"
                                    elif news_item.get("is_dex_spike"):
                                        _src = "dex"
                                    else:
                                        _src = "news"
                                    print(f" Dynamic lev={dyn_lev}x size×{signal.get('size_multiplier',1):.2f} (score={signal['total_score']:.1f}) src={_src}")
                                    _saas_dispatch(signal, _src,
                                        dyn_lev, TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, TRADE_PERCENT_SIZE)
                                    _post_to_channel(signal, _src)

            if urls_changed:
                save_processed_urls(processed_urls)

            # ─── Liquidation cascade signals — standalone trades без новин ───────
            while not liquidation_signal_queue.empty():
                try:
                    liq_sig = liquidation_signal_queue.get_nowait()
                except Exception:
                    break

                coin    = liq_sig.get("coin", "")
                now_ts  = datetime.now(timezone.utc).timestamp()

                # Cooldown
                if now_ts - _coin_cooldown.get(coin, 0) < COIN_COOLDOWN_SEC:
                    remaining = int((COIN_COOLDOWN_SEC - (now_ts - _coin_cooldown.get(coin, 0))) / 60)
                    print(f"[LIQ] ⏳ Cooldown {coin}: ще {remaining} хв")
                    continue

                # Адаптивний фільтр серій збитків
                if is_coin_paused(coin):
                    print(f"[LIQ] ⏸ {coin} призупинено (серія збитків) — пропускаємо")
                    continue

                # BTC кореляційний фільтр (жорсткіший: ±3%)
                _btc_2h_liq = get_btc_2h_change()
                if liq_sig["action"] == "LONG" and _btc_2h_liq < -3.0:
                    print(f"[LIQ]  BTC {_btc_2h_liq:.1f}% за 2h — LONG {coin} заблокований")
                    continue
                if liq_sig["action"] == "SHORT" and _btc_2h_liq > 3.0:
                    print(f"[LIQ]  BTC +{_btc_2h_liq:.1f}% за 2h — SHORT {coin} заблокований")
                    continue

                # Ліміт відкритих позицій
                if position_monitor.get_tracked_count() * 5.0 >= MAX_EXPOSURE_PCT:
                    print(f"[LIQ]  Ліміт експозиції — пропускаємо {coin}")
                    continue

                # Денний ліміт
                _today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                _dc_liq = _daily_trade_count.get(coin.upper(), {"count": 0, "date": ""})
                if _dc_liq["date"] != _today:
                    _dc_liq = {"count": 0, "date": _today}
                if _dc_liq["count"] >= MAX_DAILY_TRADES_ALT:
                    print(f"[LIQ]  {coin}: денний ліміт вичерпано")
                    continue

                _coin_cooldown[coin] = now_ts
                _dc_liq["count"] += 1
                _daily_trade_count[coin.upper()] = _dc_liq
                save_cooldown(_coin_cooldown)

                signal_id = save_signal(liq_sig, executed=False)
                print(f"\n[LIQ]  CASCADE TRADE: {coin} {liq_sig['action']} "
                      f"cascade=${liq_sig['cascade_usd']/1e6:.2f}M score={liq_sig['total_score']:.1f}")

                if not SIGNAL_BOT_TRADING:
                    print(f" [LIQ] {coin} {liq_sig['action']} — статистика (торгівля вимкнена)")
                    continue

                # execute_trade removed 2026-05-21 — owner double-position bug
                _saas_dispatch(liq_sig, "liq_cascade",
                    ALT_LEVERAGE, 6.0, 2.5, round(ALT_SIZE * 0.8, 1))
                _post_to_channel(liq_sig, "liq_cascade")
            # ──────────────────────────────────────────────────────────────────

            # Funding Rate signals retired 2026-05-21 — see project-strategy-roadmap memory.

            # Пишем live intel для дашборда
            _write_live_intel(tg_enabled)

            # Чекаємо TG-повідомлення АБО таймаут 30s для ann_queue / live_intel
            tg_news_event.wait(timeout=30)
            tg_news_event.clear()
            
        except KeyboardInterrupt:
            print("\nОстановка...")
            save_ledger(signal_ledger)
            break
        except Exception as e:
            print(f" Ошибка: {e}")
            # Отправляем в TG не чаще 1 раза в 5 минут (антиспам)
            now = time.time()
            if now - last_error_tg_time > 300:
                last_error_tg_time = now
                send_telegram_message(
                    f" <b>BotGrid — критическая ошибка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID
                )
            time.sleep(10)

if __name__ == "__main__":
    run_signal_engine()