"""
Запускає MT5 bridge сервер всередині Wine.
Потрібно запустити ОДИН РАЗ перед ботом:
  python3 macro_bot/start_bridge.py
"""
import subprocess
import sys
import os

WINE_PYTHON = os.getenv("WINE_PYTHON", "~/.wine/drive_c/Python312/python.exe")
HOST = "127.0.0.1"
PORT = 18812

def main():
    print(f"Starting MT5 bridge on {HOST}:{PORT}...")
    print("Ctrl+C to stop\n")

    try:
        from mt5linux import MetaTrader5
        # mt5linux has a built-in server launcher
        MetaTrader5.start_server(host=HOST, port=PORT)
    except Exception as e:
        print(f"Bridge error: {e}")
        print("\nAlternative: install Python inside Wine:")
        print("  winetricks python312")
        print(f"  wine {WINE_PYTHON} -m mt5linux {HOST} {PORT}")

if __name__ == "__main__":
    main()
