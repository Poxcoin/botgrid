"""
analyze.py — Анализ паттернов торгового бота.

Запуск:
    python analyze.py              # полный отчёт
    python analyze.py --migrate    # сначала импорт из signals_log.json
"""
import sys
import sqlite3

DB_PATH = "analytics.db"


def _conn():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _pct(a, b):
    return f"{a/b*100:.1f}%" if b else "—"


def print_section(title: str):
    print(f"\n{'='*55}")
    print(f"  {title}")
    print('='*55)


def report():
    con = _conn()

    # ── Общая статистика ──────────────────────────────────
    print_section("ОБЩАЯ СТАТИСТИКА")
    row = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN action='LONG' THEN 1 ELSE 0 END) longs,
               SUM(CASE WHEN action='SHORT' THEN 1 ELSE 0 END) shorts,
               SUM(executed) executed
        FROM signals WHERE action IN ('LONG','SHORT')
    """).fetchone()
    print(f"  Всего торговых сигналов : {row['total']}")
    print(f"  LONG / SHORT            : {row['longs']} / {row['shorts']}")
    print(f"  Исполнено сделок        : {row['executed']}")

    trades = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(CASE WHEN result='LOSS' THEN 1 ELSE 0 END) losses,
               SUM(pnl_usdt) total_pnl,
               AVG(pnl_usdt) avg_pnl
        FROM trades WHERE result IN ('WIN','LOSS')
    """).fetchone()
    if trades['total']:
        print(f"  Win Rate                : {_pct(trades['wins'], trades['total'])} ({trades['wins']}W / {trades['losses']}L)")
        print(f"  Суммарный PnL           : ${trades['total_pnl']:.2f}")
        print(f"  Средний PnL на сделку   : ${trades['avg_pnl']:.2f}")

    # ── По монетам ────────────────────────────────────────
    print_section("ПО МОНЕТАМ (топ-10)")
    rows = con.execute("""
        SELECT s.coin,
               COUNT(t.id) trades,
               SUM(CASE WHEN t.result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(t.pnl_usdt) pnl
        FROM signals s JOIN trades t ON t.signal_id=s.id
        WHERE t.result IN ('WIN','LOSS')
        GROUP BY s.coin ORDER BY pnl DESC LIMIT 10
    """).fetchall()
    print(f"  {'Монета':<8} {'Сделок':>7} {'WR':>8} {'PnL':>10}")
    print(f"  {'-'*37}")
    for r in rows:
        wr = _pct(r['wins'], r['trades'])
        print(f"  {r['coin']:<8} {r['trades']:>7} {wr:>8} ${r['pnl']:>8.2f}")

    # ── По источнику новости ──────────────────────────────
    print_section("ПО ИСТОЧНИКУ НОВОСТИ")
    rows = con.execute("""
        SELECT s.news_source,
               COUNT(t.id) trades,
               SUM(CASE WHEN t.result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(t.pnl_usdt) pnl
        FROM signals s JOIN trades t ON t.signal_id=s.id
        WHERE t.result IN ('WIN','LOSS') AND s.news_source != ''
        GROUP BY s.news_source ORDER BY trades DESC LIMIT 10
    """).fetchall()
    print(f"  {'Источник':<30} {'Сделок':>7} {'WR':>8} {'PnL':>10}")
    print(f"  {'-'*57}")
    for r in rows:
        src = (r['news_source'] or '')[:28]
        wr = _pct(r['wins'], r['trades'])
        print(f"  {src:<30} {r['trades']:>7} {wr:>8} ${r['pnl']:>8.2f}")

    # ── По часу суток (UTC) ───────────────────────────────
    print_section("ПО ЧАСУ СУТОК UTC")
    rows = con.execute("""
        SELECT s.hour_utc hour,
               COUNT(t.id) trades,
               SUM(CASE WHEN t.result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(t.pnl_usdt) pnl
        FROM signals s JOIN trades t ON t.signal_id=s.id
        WHERE t.result IN ('WIN','LOSS')
        GROUP BY s.hour_utc ORDER BY pnl DESC
    """).fetchall()
    print(f"  {'Час':>5} {'Сделок':>7} {'WR':>8} {'PnL':>10}")
    print(f"  {'-'*32}")
    for r in rows:
        wr = _pct(r['wins'], r['trades'])
        print(f"  {r['hour']:>4}h {r['trades']:>7} {wr:>8} ${r['pnl']:>8.2f}")

    # ── Groq impact vs результат ──────────────────────────
    print_section("GROQ IMPACT → РЕЗУЛЬТАТ")
    rows = con.execute("""
        SELECT s.groq_impact impact,
               COUNT(t.id) trades,
               SUM(CASE WHEN t.result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(t.pnl_usdt) pnl
        FROM signals s JOIN trades t ON t.signal_id=s.id
        WHERE t.result IN ('WIN','LOSS') AND s.groq_impact IS NOT NULL
        GROUP BY s.groq_impact ORDER BY pnl DESC
    """).fetchall()
    if rows:
        print(f"  {'Impact':<10} {'Сделок':>7} {'WR':>8} {'PnL':>10}")
        print(f"  {'-'*37}")
        for r in rows:
            wr = _pct(r['wins'], r['trades'])
            print(f"  {(r['impact'] or 'N/A'):<10} {r['trades']:>7} {wr:>8} ${r['pnl']:>8.2f}")
    else:
        print("  Данных пока нет (Groq подключён недавно)")

    # ── Возраст новости → результат ───────────────────────
    print_section("ВОЗРАСТ НОВОСТИ → РЕЗУЛЬТАТ")
    rows = con.execute("""
        SELECT
            CASE
                WHEN s.news_age_minutes < 15 THEN '0-15 мин'
                WHEN s.news_age_minutes < 30 THEN '15-30 мин'
                WHEN s.news_age_minutes < 60 THEN '30-60 мин'
                ELSE '60+ мин'
            END age_bucket,
            COUNT(t.id) trades,
            SUM(CASE WHEN t.result='WIN' THEN 1 ELSE 0 END) wins,
            SUM(t.pnl_usdt) pnl
        FROM signals s JOIN trades t ON t.signal_id=s.id
        WHERE t.result IN ('WIN','LOSS') AND s.news_age_minutes IS NOT NULL
        GROUP BY age_bucket ORDER BY pnl DESC
    """).fetchall()
    if rows:
        print(f"  {'Возраст':<12} {'Сделок':>7} {'WR':>8} {'PnL':>10}")
        print(f"  {'-'*39}")
        for r in rows:
            wr = _pct(r['wins'], r['trades'])
            print(f"  {r['age_bucket']:<12} {r['trades']:>7} {wr:>8} ${r['pnl']:>8.2f}")
    else:
        print("  Данных пока нет")

    con.close()
    print(f"\n{'='*55}\n")


if __name__ == "__main__":
    if "--migrate" in sys.argv:
        from modules.analytics_db import migrate_signals_log
        n = migrate_signals_log()
        print(f"Импортировано {n} сигналов из signals_log.json → analytics.db")

    try:
        report()
    except Exception as e:
        print(f"Ошибка: {e}")
        print("Запусти с --migrate чтобы импортировать существующие данные")
