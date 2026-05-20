import os
from dotenv import load_dotenv

load_dotenv()

# Economic data APIs
BLS_API_KEY       = os.getenv("BLS_API_KEY", "")
FRED_API_KEY      = os.getenv("FRED_API_KEY", "")

# MT5 Common/Files path override (optional — auto-detected from Wine by default)
MT5_FILES_PATH    = os.getenv("MT5_FILES_PATH", "")

# Risk
RISK_PCT          = float(os.getenv("MACRO_RISK_PCT", "0.015"))   # 1.5% per trade
MAX_TRADES        = int(os.getenv("MACRO_MAX_TRADES", "3"))        # 3: EURUSD+GBPUSD+XAUUSD simultaneously
STOP_LOSS_PIPS    = int(os.getenv("MACRO_SL_PIPS", "20"))          # forex default (Gold overridden per-signal)
TAKE_PROFIT_PIPS  = int(os.getenv("MACRO_TP_PIPS", "35"))          # forex default
EXIT_MINUTES      = int(os.getenv("MACRO_EXIT_MINUTES", "25"))

DEVIATION_MIN     = float(os.getenv("MACRO_DEV_MIN", "0.3"))

# Telegram notifications
TG_BOT_TOKEN      = os.getenv("TG_BOT_TOKEN", "")
TG_CHAT_ID        = os.getenv("TG_CHAT_ID", "")
