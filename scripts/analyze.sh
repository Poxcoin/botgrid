#!/bin/bash
# KADO Bot Analyzer — quick system stats from the VPS
# Usage: bash /opt/botgrid/scripts/analyze.sh

DB="/opt/botgrid/saas_database.sqlite"
SIGNALS_DB="/opt/botgrid/analytics.db"

echo "=== KADO Bot Analyzer — $(date -u '+%Y-%m-%d %H:%M UTC') ==="

echo ""
echo "--- Active users ---"
sqlite3 "$DB" "SELECT COUNT(*) || ' verified users' FROM users WHERE email_verified=1;"

echo ""
echo "--- Grid bots running ---"
sqlite3 "$DB" "SELECT COUNT(*) || ' active grid sessions' FROM user_grid_sessions WHERE is_active=1;" 2>/dev/null || echo "  (no grid session table)"

echo ""
echo "--- Trades last 24h (user trades) ---"
sqlite3 "$DB" "SELECT source, COUNT(*) as trades, ROUND(SUM(pnl_usdt),2) as pnl_usdt
  FROM user_trades
  WHERE closed_at >= datetime('now','-1 day') AND status='closed'
  GROUP BY source ORDER BY trades DESC;" 2>/dev/null || echo "  (no data)"

echo ""
echo "--- Win rate last 7 days (user trades) ---"
sqlite3 "$DB" "SELECT
    COUNT(*) as total,
    SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END) as wins,
    ROUND(100.0 * SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) || '%' as win_rate,
    ROUND(SUM(pnl_usdt), 2) as total_pnl
  FROM user_trades
  WHERE closed_at >= datetime('now','-7 days') AND status='closed';" 2>/dev/null || echo "  (no data)"

echo ""
echo "--- System signals last 24h ---"
sqlite3 "$SIGNALS_DB" "SELECT source, COUNT(*) FROM signals
  WHERE created_at >= datetime('now','-1 day') GROUP BY source;" 2>/dev/null || echo "  (no analytics db)"

echo ""
echo "--- Top coins by trades (all time) ---"
sqlite3 "$DB" "SELECT
    REPLACE(REPLACE(symbol,'USDT',''),'PERP','') as coin,
    COUNT(*) as trades,
    ROUND(SUM(pnl_usdt),2) as total_pnl,
    ROUND(100.0 * SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) || '%' as win_rate
  FROM user_trades WHERE status='closed'
  GROUP BY coin ORDER BY trades DESC LIMIT 10;" 2>/dev/null || echo "  (no data)"

echo ""
echo "=== Done ==="
