import time
import json
import os
from datetime import datetime, timezone
from modules.news_parser import get_aggregated_news
from modules.decision_maker import generate_signal
from modules.trader import execute_trade, get_free_usdt, close_all_positions, _init_exchange
from modules.tg_notifier import send_telegram_message, get_telegram_updates
from modules import daily_guard, position_monitor, pnl_tracker
from modules.news_archive import archive_news
from config.settings import BYBIT_API_KEY, IS_DEMO_TRADING, TG_CHAT_ID
import ccxt

# Путь к файлу истории
LEDGER_FILE = "signals_log.json"
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
        text = message.get("text", "").lower()
        
        # Проверяем, что пишет именно владелец
        if str(chat_id) != str(TG_CHAT_ID):
            continue
            
        if text == "/status":
            status_msg = f"🟢 <b>Бот работает</b>\n\nAPI Ключ: {BYBIT_API_KEY[:4]}...{BYBIT_API_KEY[-4:]}\nВремя сервера: {datetime.now().strftime('%H:%M:%S')}"
            send_telegram_message(status_msg, chat_id)
            
        elif text == "/balance":
            # Инициализация для проверки баланса
            ex = ccxt.bybit({"apiKey": BYBIT_API_KEY})
            from config.settings import BYBIT_SECRET, USE_TESTNET
            ex.secret = BYBIT_SECRET
            
            # Redirect to Demo Trading host if enabled
            if IS_DEMO_TRADING:
                ex.urls['api'] = {
                    'public': 'https://api-demo.bybit.com',
                    'private': 'https://api-demo.bybit.com',
                }
                
            if USE_TESTNET: ex.set_sandbox_mode(True)
            ex.options['adjustForTimeDifference'] = True
            
            balance = get_free_usdt(ex)
            send_telegram_message(f"💰 <b>Ваш баланс:</b> {balance} USDT", chat_id)
            
        elif text == "/start":
            send_telegram_message("👋 Привет! Я твой торговый бот.\nДоступные команды:\n/status - состояние бота\n/balance - текущий баланс USDT", chat_id)

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

    send_telegram_message("🚀 <b>BotGrid запущен</b>\nСканирование RSS каждые 30 сек. Жду сигналов...", TG_CHAT_ID)

    # Загружаем старую историю
    signal_ledger = load_ledger()

    # Cooldown: coin -> (last_action, timestamp) — не торгуем одну монету чаще раз в 4 часа
    _coin_cooldown: dict = {}   # coin -> last_trade_ts (float)
    COIN_COOLDOWN_SEC = 4 * 3600  # 4 часа

    # Загружаем обработанные URL из файла — защита от дублей при перезапуске
    processed_urls = load_processed_urls()
    processed_tg_updates = set()
    last_error_tg_time = 0      # антиспам: не чаще 1 раза в 5 минут
    
    while True:
        try:
            # 0. Проверка команд из Telegram
            handle_telegram_commands(processed_tg_updates)
            
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 📡 Сканирование RSS...")
            
            # 1. Тянем свежие новости
            latest_news = get_aggregated_news(limit_per_source=5)
            
            urls_changed = False
            for news_item in latest_news:
                if news_item['link'] in processed_urls:
                    continue

                processed_urls.add(news_item['link'])
                urls_changed = True

                # 2. Архивируем новость для Replay бэктестера
                archive_news(news_item)

                # 3. Анализ
                print(f"   Анализ: {news_item['title'][:60]}...")
                signal = generate_signal(news_item)
                
                # 3. Сохраняем ВСЕ сигналы (даже HOLD), чтобы сайт был "живым"
                if signal:
                    signal['timestamp'] = datetime.now(timezone.utc).isoformat()
                    signal_ledger.append(signal)
                    save_ledger(signal_ledger)
                    
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
                            last_ts = _coin_cooldown.get(coin, 0)
                            if now_ts - last_ts < COIN_COOLDOWN_SEC:
                                remaining = int((COIN_COOLDOWN_SEC - (now_ts - last_ts)) / 60)
                                print(f"⏳ Cooldown {coin}: ещё {remaining} мин до следующей сделки")
                            else:
                                _coin_cooldown[coin] = now_ts
                                execute_trade(signal)
            
            # Сохраняем URLs один раз после всего цикла, а не на каждую новость
            if urls_changed:
                save_processed_urls(processed_urls)

            time.sleep(30)
            
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