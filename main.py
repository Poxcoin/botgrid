import time
import json
import os
from datetime import datetime, timezone
from modules.decision_maker import generate_signal, generate_whale_signal
from modules.trader import execute_trade, get_free_usdt, close_all_positions, _init_exchange
from modules.tg_notifier import send_telegram_message, get_telegram_updates
from modules import daily_guard, position_monitor, pnl_tracker
from modules.tg_commander import start_commander
from modules.news_archive import archive_news
from modules.telegram_monitor import start_telegram_monitor, tg_news_queue, tg_news_event
from modules.liquidation_monitor import start_liquidation_monitor
from modules.onchain_monitor import start_onchain_monitor
from modules.exchange_announcements import start_announcements_monitor, ann_queue
from modules.dex_scanner import start_dex_scanner, dex_queue
from modules.funding_strategy import start_funding_strategy, funding_queue
from modules.smart_wallet_tracker import start_smart_wallet_tracker, smart_wallet_queue
from modules.analytics_db import save_signal, init_db, DB_PATH
from modules.liquidation_monitor import get_liquidation_signal
from modules.onchain_monitor import get_onchain_signal
from modules.market_data import get_btc_2h_change
from modules.post_trade_analyzer import (
    start_analyzer, get_score_threshold_boost, is_coin_paused
)
from modules.saas_dispatcher import dispatch as saas_dispatch
from config.settings import (
    BYBIT_API_KEY, IS_DEMO_TRADING, TG_CHAT_ID,
    ALT_LEVERAGE, ALT_TP, ALT_SL, ALT_SIZE, MIN_ALTCOIN_VOLUME_USD,
    LISTING_LEVERAGE, LISTING_TP, LISTING_SL, LISTING_SIZE,
    LEVERAGE, TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, TRADE_PERCENT_SIZE,
    SIGNAL_BOT_TRADING,
)
import ccxt

# Путь к файлу истории
LEDGER_FILE = "signals_log.json"


def _saas_dispatch(signal: dict, source: str, leverage: int,
                   tp_pct: float, sl_pct: float, size_pct: float) -> None:
    """Fan signal out to all active SaaS subscribers — never raises."""
    try:
        saas_dispatch({
            "source":   source,
            "symbol":   f"{signal['coin']}/USDT:USDT",
            "side":     signal["action"],
            "leverage": leverage,
            "size_pct": size_pct,
            "tp_pct":   tp_pct,
            "sl_pct":   sl_pct,
        })
    except Exception as e:
        print(f"[SAAS] dispatch error: {e}")
PROCESSED_URLS_FILE = "processed_urls.json"

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
    """Returns PnL summary from analytics.db."""
    import sqlite3
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        all_closed = con.execute(
            "SELECT pnl_usdt, result, coin, timestamp_open FROM trades WHERE result != 'OPEN'"
        ).fetchall()
        today_closed = con.execute(
            "SELECT pnl_usdt FROM trades WHERE result != 'OPEN' "
            "AND timestamp_open >= datetime('now', '-24 hours')"
        ).fetchall()
        open_count = con.execute(
            "SELECT COUNT(*) FROM trades WHERE result = 'OPEN'"
        ).fetchone()[0]
        con.close()

        total_pnl = sum((r["pnl_usdt"] or 0) for r in all_closed)
        today_pnl = sum((r["pnl_usdt"] or 0) for r in today_closed)
        wins = sum(1 for r in all_closed if (r["pnl_usdt"] or 0) > 0)
        total = len(all_closed)
        wr = wins / max(total, 1) * 100

        icon = "📈" if total_pnl >= 0 else "📉"
        return (
            f"{icon} <b>PnL Статистика</b>\n\n"
            f"Сьогодні: <b>{today_pnl:+.2f}$</b>\n"
            f"Всього: <b>{total_pnl:+.2f}$</b>\n"
            f"Угод: {total} | Win Rate: {wr:.0f}%\n"
            f"Відкрито зараз: {open_count}"
        )
    except Exception as e:
        return f"❌ Помилка БД: {e}"


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
        lines = ["📋 <b>Останні угоди</b>\n"]
        for r in rows:
            pnl = r["pnl_usdt"] or 0
            icon = "✅" if pnl > 0 else "❌"
            date = (r["timestamp_open"] or "")[:10]
            lines.append(f"{icon} {r['coin']} {r['action']} | <b>{pnl:+.2f}$</b> | {date}")
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Помилка: {e}"


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
        lines = [f"🧠 <b>Сигнали</b> (всього {total}, виконано {executed})\n"]
        for s in rows:
            score = s["total_score"] or 0
            icon = "📈" if score > 0 else "📉"
            date = (s["timestamp"] or "")[:16]
            lines.append(f"{icon} {s['coin']} {s['action']} score={score:+.1f} conf={s['confidence']}% | {date}")
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Помилка: {e}"


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
            return "✅ Немає відкритих позицій."
        now = datetime.now(timezone.utc)
        lines = [f"🔄 <b>Відкриті позиції ({len(rows)})</b>\n"]
        for r in rows:
            age = ""
            try:
                ts = datetime.fromisoformat((r["timestamp_open"] or "").replace("Z", "+00:00"))
                mins = int((now - ts).total_seconds() / 60)
                age = f"{mins}хв"
            except Exception:
                pass
            lines.append(f"🔄 {r['coin']} {r['action']} | вхід {r['entry_price']} | {age}")
        return "\n".join(lines)
    except Exception as e:
        return f"❌ Помилка: {e}"


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

        if str(chat_id) != str(TG_CHAT_ID):
            continue

        if text == "/status":
            svcs = ["crypto-web", "crypto-sniper", "crypto-grid", "crypto-bot"]
            import subprocess
            lines = ["🖥 <b>Статус сервісів</b>\n"]
            for s in svcs:
                r = subprocess.run(["systemctl", "is-active", s], capture_output=True, text=True)
                st = r.stdout.strip()
                lines.append(f"{'✅' if st == 'active' else '❌'} {s}: {st}")
            lines.append(f"\n🕐 {datetime.now().strftime('%H:%M:%S UTC')}")
            send_telegram_message("\n".join(lines), chat_id)

        elif text == "/balance":
            from config.settings import BYBIT_SECRET, USE_TESTNET
            ex = ccxt.bybit({"apiKey": BYBIT_API_KEY, "secret": BYBIT_SECRET, "enableRateLimit": True})
            if IS_DEMO_TRADING:
                ex.urls["api"] = ex.urls["demotrading"]
            if USE_TESTNET:
                ex.set_sandbox_mode(True)
            ex.options["adjustForTimeDifference"] = True
            balance = get_free_usdt(ex)
            send_telegram_message(f"💰 <b>Баланс Bybit:</b> {balance} USDT", chat_id)

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

        elif text in ("/start", "/help"):
            send_telegram_message(
                "👋 <b>Trading Bot</b>\n\n"
                "/status — сервіси\n"
                "/balance — баланс Bybit\n"
                "/pnl — прибуток/збиток\n"
                "/trades [N] — останні N угод\n"
                "/signals — останні сигнали\n"
                "/open — відкриті позиції",
                chat_id
            )

LIVE_INTEL_FILE = "live_intel.json"


def _dynamic_leverage(signal: dict, is_btc_eth: bool) -> int:
    """Возвращает плечо на основе скора сигнала.

    Размер позиции уже масштабирует decision_maker через size_multiplier.
    Здесь только плечо — чтобы не было двойного скалирования.
    """
    score = abs(signal.get("total_score", 0))
    base_lev = 2 if is_btc_eth else ALT_LEVERAGE

    if score >= 14:
        return min(base_lev + 2, 5)
    elif score >= 12:
        return min(base_lev + 1, 4)
    else:
        return base_lev

def _write_live_intel(tg_enabled: bool) -> None:
    """Пишет текущий статус источников и live данные для дашборда."""
    try:
        coins = ["BTC", "ETH", "SOL", "BNB", "XRP"]
        liq = {c: get_liquidation_signal(c) for c in coins}
        onchain = get_onchain_signal("ETH")
        intel = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "sources": {
                "rss":         False,
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
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🚀 SIGNAL ENGINE ЗАПУЩЕН! Поиск альткоинов...\n")

    # ─── Инициализация guard-модулей ──────────────────────────────────────────
    try:
        ex_init = _init_exchange()
        start_bal = get_free_usdt(ex_init)
    except Exception:
        start_bal = 0.0
    daily_guard.init(current_balance=start_bal)
    position_monitor.start_monitor(
        exchange_factory=_init_exchange,
        send_tg=send_telegram_message,
        chat_id=TG_CHAT_ID,
    )
    pnl_tracker.start_pnl_tracker(exchange_factory=_init_exchange)
    tg_enabled = start_telegram_monitor()
    start_liquidation_monitor()
    start_onchain_monitor()
    start_announcements_monitor()
    start_commander()
    start_dex_scanner()
    start_funding_strategy()
    start_smart_wallet_tracker()
    start_analyzer(exchange_factory=_init_exchange, send_tg=send_telegram_message, chat_id=TG_CHAT_ID)

    sources = "Binance/Bybit Announcements + Telegram"
    sig_mode = "📊 збір статистики (торгівля вимкнена)" if not SIGNAL_BOT_TRADING else "⚡ активна торгівля"
    send_telegram_message(
        f"🚀 <b>BotGrid запущен</b>\n"
        f"Джерела: {sources}\n"
        f"Signal бот: {sig_mode}\n"
        f"Grid бот: SOL / ETH / BTC активний",
        TG_CHAT_ID
    )

    init_db()
    signal_ledger = load_ledger()

    # Cooldown: coin -> last_trade_ts — не торгуем одну монету чаще раз в 2 часа
    _coin_cooldown: dict = {}
    COIN_COOLDOWN_SEC = 2 * 3600

    # Лимит суммарной экспозиции: не более MAX_EXPOSURE_PCT% баланса в открытых позициях
    MAX_EXPOSURE_PCT = 15.0

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

            # 1b2. Smart wallet moves — Alchemy WebSocket реалтайм
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
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 📡 Сканування" +
                  (f" | 🔔 {ann_count} анонсів" if ann_count else "") +
                  (f" | TG: {tg_count}" if tg_count else "") +
                  (f" | DEX: {dex_count}" if dex_count else "") +
                  (f" | 🐳 Smart: {smart_count}" if smart_count else "") + "...")

            # Пріоритет: Анонси > TG > Smart Wallets > DEX spikes
            latest_news = ann_news + tg_news + smart_news + dex_news
            
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
                    print(f"   🐋 Whale Alert: {news_item['title'][:60]}...")
                    signal = generate_whale_signal(news_item)
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
                        _signal_duplicates[dedup_key] = dup_count
                        if dup_count >= 2:
                            signal["total_score"] = signal["total_score"] * (1 + dup_count * 0.3)
                            print(f"   🔥 Дубль x{dup_count}: {dedup_key[0]} {dedup_key[1]} — score підсилено до {signal['total_score']:.1f}")
                        else:
                            print(f"   ⏭ Дубль сигнала {dedup_key[1]} {dedup_key[0]} — пропускаємо")
                            continue
                    else:
                        # Новий сигнал — скидаємо лічильник дублікатів якщо вийшли за вікно
                        if now_ts - _signal_dedup.get(dedup_key, 0) >= DUPLICATE_WINDOW_SEC:
                            _signal_duplicates.pop(dedup_key, None)
                    _signal_dedup[dedup_key] = now_ts

                    signal['timestamp'] = datetime.now(timezone.utc).isoformat()
                    signal_ledger.append(signal)
                    save_ledger(signal_ledger)
                    
                    # Сохраняем в аналитическую БД (executed=False до реального ордера)
                    signal_id = save_signal(signal, executed=False)

                    if signal['action'] in ["LONG", "SHORT", "SELL_ALL"]:
                        print("\n==================================")
                        print(f"🚨 АХТУНГ! НАЙДЕН РЕАЛЬНЫЙ ТРЕЙД!")
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
                                    print(f"[SIGNAL] 🔄 Протилежний сигнал для {coin}: закриваємо {existing_action}, готуємо {signal['action']}")
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
                                            print(f"[SIGNAL] ✅ {coin} закрито, входимо в {signal['action']}")
                                            _coin_cooldown[coin] = 0  # скидаємо cooldown щоб одразу відкрити нову
                                    except Exception as e:
                                        print(f"[SIGNAL] ❌ Помилка закриття {coin}: {e}")

                            last_ts = _coin_cooldown.get(coin, 0)
                            if now_ts - last_ts < COIN_COOLDOWN_SEC:
                                remaining = int((COIN_COOLDOWN_SEC - (now_ts - last_ts)) / 60)
                                print(f"⏳ Cooldown {coin}: ещё {remaining} мин до следующей сделки")
                            else:
                                _coin_cooldown[coin] = now_ts
                                _btc_eth = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}

                                # Проверка лимита суммарной экспозиции
                                open_count = position_monitor.get_tracked_count()
                                if open_count > 0:
                                    try:
                                        # Грубая оценка: N открытых позиций * средний размер 5%
                                        _estimated_exposure_pct = open_count * 5.0
                                        if _estimated_exposure_pct >= MAX_EXPOSURE_PCT:
                                            print(f"⚠️ ЭКСПОЗИЦИЯ: ~{_estimated_exposure_pct:.0f}% баланса в {open_count} позициях — лимит {MAX_EXPOSURE_PCT}%, пропускаем")
                                            continue
                                    except Exception:
                                        pass

                                # BTC Correlation Filter: блокируем LONG/SHORT на альтах
                                # если BTC сильно двигается в обратную сторону за 2h
                                _btc_2h = get_btc_2h_change()
                                _is_alt = coin.upper() not in _btc_eth
                                if _is_alt and signal["action"] == "LONG" and _btc_2h < -2.5:
                                    print(f"🚫 BTC correlation filter: BTC {_btc_2h:.1f}% за 2h — LONG {coin} заблокирован")
                                    continue
                                if _is_alt and signal["action"] == "SHORT" and _btc_2h > 2.5:
                                    print(f"🚫 BTC correlation filter: BTC +{_btc_2h:.1f}% за 2h — SHORT {coin} заблокирован")
                                    continue

                                # Adaptive post-trade filter
                                if is_coin_paused(coin):
                                    print(f"⏸ {coin} приостановлен (серия потерь) — пропускаем")
                                    continue
                                _score_boost = get_score_threshold_boost(coin)
                                if _score_boost > 0:
                                    _btc_eth_local = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
                                    _base_min = 9.0 if coin.upper() in _btc_eth_local else 8.0
                                    if abs(signal["total_score"]) < _base_min + _score_boost:
                                        print(f"⚙️ {coin}: адаптивный порог {_base_min + _score_boost:.1f} — скор {signal['total_score']:.1f} не прошёл")
                                        continue

                                # Safety: explicit min-score guard (belt+suspenders over decision_maker)
                                _btc_eth_guard = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
                                _is_sm_guard = str(signal.get("source", "")).startswith("Smart Wallet")
                                _min_safe = 8.0 if _is_sm_guard else (11.0 if coin.upper() in _btc_eth_guard else 10.0)
                                if abs(signal['total_score']) < _min_safe:
                                    print(f"⛔ {coin}: score {signal['total_score']:.1f} < min {_min_safe} — safety filter пропускаємо")
                                    continue

                                if not SIGNAL_BOT_TRADING:
                                    print(f"📊 [SIGNAL] {coin} {signal['action']} score={signal['total_score']:.1f} — збір статистики (торгівля вимкнена)")
                                elif signal.get("is_listing"):
                                    execute_trade(signal,
                                        leverage_override=LISTING_LEVERAGE,
                                        tp_pct=LISTING_TP, sl_pct=LISTING_SL,
                                        size_pct=LISTING_SIZE, signal_id=signal_id)
                                    _saas_dispatch(signal, "listing",
                                        LISTING_LEVERAGE, LISTING_TP, LISTING_SL, LISTING_SIZE)
                                elif coin.upper() not in _btc_eth:
                                    mkt = signal.get("_market", {})
                                    vol = mkt.get("quote_volume_24h", 0) if mkt else 0
                                    if vol > 0 and vol < MIN_ALTCOIN_VOLUME_USD:
                                        print(f"⚠️ {coin} об'єм ${vol/1e6:.1f}M < $5M — пропускаємо")
                                    else:
                                        dyn_lev = _dynamic_leverage(signal, is_btc_eth=False)
                                        print(f"📐 Dynamic lev={dyn_lev}x size×{signal.get('size_multiplier',1):.2f} (score={signal['total_score']:.1f})")
                                        execute_trade(signal,
                                            leverage_override=dyn_lev,
                                            tp_pct=ALT_TP, sl_pct=ALT_SL,
                                            size_pct=ALT_SIZE, signal_id=signal_id)
                                        _saas_dispatch(signal, "news",
                                            dyn_lev, ALT_TP, ALT_SL, ALT_SIZE)
                                else:
                                    dyn_lev = _dynamic_leverage(signal, is_btc_eth=True)
                                    print(f"📐 Dynamic lev={dyn_lev}x size×{signal.get('size_multiplier',1):.2f} (score={signal['total_score']:.1f})")
                                    execute_trade(signal,
                                        leverage_override=dyn_lev,
                                        signal_id=signal_id)
                                    _saas_dispatch(signal, "news",
                                        dyn_lev, TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, TRADE_PERCENT_SIZE)
            
            if urls_changed:
                save_processed_urls(processed_urls)

            # Funding Rate сигнали — окремий pipeline (без Claude)
            while not funding_queue.empty():
                try:
                    fsig = funding_queue.get_nowait()
                except Exception:
                    break
                coin    = fsig.get("coin", "")
                now_ts  = datetime.now(timezone.utc).timestamp()
                last_ts = _coin_cooldown.get(coin, 0)
                if now_ts - last_ts < COIN_COOLDOWN_SEC:
                    remaining = int((COIN_COOLDOWN_SEC - (now_ts - last_ts)) / 60)
                    print(f"[FR] ⏳ Cooldown {coin}: ще {remaining} хв")
                    continue
                _coin_cooldown[coin] = now_ts
                if not SIGNAL_BOT_TRADING:
                    print(f"📊 [FR] {coin} {fsig.get('action')} — збір статистики (торгівля вимкнена)")
                    continue
                _btc_eth = {"BTC", "ETH"}
                if coin.upper() in _btc_eth:
                    execute_trade(fsig)
                    _saas_dispatch(fsig, "fr",
                        LEVERAGE, TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, TRADE_PERCENT_SIZE)
                else:
                    execute_trade(fsig,
                        leverage_override=ALT_LEVERAGE,
                        tp_pct=ALT_TP, sl_pct=ALT_SL,
                        size_pct=ALT_SIZE)
                    _saas_dispatch(fsig, "fr",
                        ALT_LEVERAGE, ALT_TP, ALT_SL, ALT_SIZE)

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
            print(f"❌ Ошибка: {e}")
            # Отправляем в TG не чаще 1 раза в 5 минут (антиспам)
            now = time.time()
            if now - last_error_tg_time > 300:
                last_error_tg_time = now
                send_telegram_message(
                    f"❌ <b>BotGrid — критическая ошибка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID
                )
            time.sleep(10)

if __name__ == "__main__":
    run_signal_engine()