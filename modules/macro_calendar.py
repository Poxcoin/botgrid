"""
macro_calendar.py — Детектор высоковолатильных макро-событий США + Funding Settlement.

Отслеживает события которые гарантированно двигают крипто-рынок:

  ЕЖЕНЕДЕЛЬНО:
    • Initial Jobless Claims  — каждый четверг 13:30 UTC (08:30 ET)
      Данные о безработице: рост заявок → страх рецессии → крипто падает

  ЕЖЕМЕСЯЧНО:
    • NFP (Nonfarm Payrolls)  — первая пятница месяца, 13:30 UTC
      Данные занятости: слабый NFP → ФРС снижает ставки → крипто растёт
    • CPI                     — обычно 2-я неделя, вторник/среда, 13:30 UTC
      Инфляция: высокий CPI → ставки высокие дольше → крипто падает
    • PCE Price Index         — последняя пятница месяца, 13:30 UTC
      Любимый индикатор ФРС по инфляции (как CPI, но точнее)
    • Retail Sales            — середина месяца, 13:30 UTC

  8 РАЗ В ГОД:
    • FOMC Rate Decision      — 19:00 UTC
      Решение по ставке: самое движущее событие года для крипто

  КАЖДЫЕ 8 ЧАСОВ (важнее всего ночью):
    • Bybit Funding Settlement — 00:00, 08:00, 16:00 UTC
      За 20 мин до — трейдеры закрывают позиции (funding flush)
      Сразу после  — часто разворот (short squeeze или long liquidation)

Интеграция:
    from modules.macro_calendar import get_size_modifier, get_active_macro_event
    macro_mod, macro_reason = get_size_modifier()
    size_multiplier = round(size_multiplier * macro_mod, 2)
"""
from datetime import datetime, timezone
from typing import Optional

# ─── 2026 Плановые даты ───────────────────────────────────────────────────────

# FOMC заседания 2026 (federalreserve.gov)
FOMC_DATES_2026 = [
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17",
    "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-16",
]

# CPI (Bureau of Labor Statistics — обычно 2-я неделя месяца)
CPI_DATES_2026 = [
    "2026-01-14", "2026-02-11", "2026-03-11", "2026-04-10",
    "2026-05-13", "2026-06-11", "2026-07-14", "2026-08-12",
    "2026-09-10", "2026-10-13", "2026-11-12", "2026-12-10",
]

# NFP — первая пятница каждого месяца, 13:30 UTC
NFP_DATES_2026 = [
    "2026-01-09", "2026-02-06", "2026-03-06", "2026-04-03",
    "2026-05-01", "2026-06-05", "2026-07-10", "2026-08-07",
    "2026-09-04", "2026-10-02", "2026-11-06", "2026-12-04",
]

# PCE Price Index — последняя пятница месяца, 13:30 UTC
PCE_DATES_2026 = [
    "2026-01-30", "2026-02-27", "2026-03-27", "2026-04-30",
    "2026-05-29", "2026-06-26", "2026-07-31", "2026-08-28",
    "2026-09-25", "2026-10-30", "2026-11-25", "2026-12-23",
]

# ─── Строим список событий ────────────────────────────────────────────────────

_SCHEDULED_EVENTS = []

for d in FOMC_DATES_2026:
    _SCHEDULED_EVENTS.append({
        "name": "FOMC Rate Decision",
        "short": "FOMC",
        "date": d,
        "utc_hour": 19, "utc_min": 0,
        "impact": 3,   # максимальный: меняет ставку → крипто ±10%
    })

for d in CPI_DATES_2026:
    _SCHEDULED_EVENTS.append({
        "name": "US CPI",
        "short": "CPI",
        "date": d,
        "utc_hour": 13, "utc_min": 30,
        "impact": 3,   # высокий: инфляция напрямую влияет на ДКП
    })

for d in NFP_DATES_2026:
    _SCHEDULED_EVENTS.append({
        "name": "US NFP",
        "short": "NFP",
        "date": d,
        "utc_hour": 13, "utc_min": 30,
        "impact": 3,
    })

for d in PCE_DATES_2026:
    _SCHEDULED_EVENTS.append({
        "name": "US PCE Price Index",
        "short": "PCE",
        "date": d,
        "utc_hour": 13, "utc_min": 30,
        "impact": 2,
    })

# ─── Константы окон риска ─────────────────────────────────────────────────────

MACRO_WINDOW_BEFORE_MIN = 60   # за 60 мин до события — рынок замирает
MACRO_WINDOW_AFTER_MIN  = 45   # 45 мин после — первичная реакция

# Дати щомісячної та квартальної опціонної експірації на Deribit (остання п'ятниця, 08:00 UTC)
OPTIONS_EXPIRY_DATES_2026 = [
    "2026-05-29", "2026-06-26", "2026-07-31", "2026-08-28",
    "2026-09-25", "2026-10-30", "2026-11-27", "2026-12-25",
]
for _d in OPTIONS_EXPIRY_DATES_2026:
    _SCHEDULED_EVENTS.append({
        "name": "Deribit/CME Options Expiry",
        "short": "OPT-EXP",
        "date": _d,
        "utc_hour": 8, "utc_min": 0,
        "impact": 2,
    })

# Initial Jobless Claims — каждый четверг 13:30 UTC
JOBLESS_CLAIMS_UTC_HOUR = 13
JOBLESS_CLAIMS_UTC_MIN  = 30

# Bybit Funding Settlement: 00:00, 08:00, 16:00 UTC
FUNDING_HOURS_UTC   = [0, 8, 16]
FUNDING_WINDOW_MIN  = 20   # ±20 мин от settlement


# ─── Публичные функции ────────────────────────────────────────────────────────

def get_active_macro_event() -> Optional[dict]:
    """
    Возвращает активное плановое макро-событие если мы в окне риска.
    Учитывает: FOMC, CPI, NFP, PCE, Initial Jobless Claims (еженедельно).
    Возвращает None если событий нет.
    """
    now = datetime.now(timezone.utc)
    today_str = now.date().isoformat()

    # 1. Плановые события (FOMC, CPI, NFP, PCE)
    for event in _SCHEDULED_EVENTS:
        if event["date"] != today_str:
            continue
        event_dt = datetime(
            now.year, now.month, now.day,
            event["utc_hour"], event["utc_min"],
            tzinfo=timezone.utc,
        )
        delta_min = (event_dt - now).total_seconds() / 60
        if -MACRO_WINDOW_AFTER_MIN <= delta_min <= MACRO_WINDOW_BEFORE_MIN:
            return {**event, "minutes_to_event": round(delta_min)}

    # 2. Initial Jobless Claims — каждый четверг
    if now.weekday() == 3:  # 3 = Thursday
        claims_dt = datetime(
            now.year, now.month, now.day,
            JOBLESS_CLAIMS_UTC_HOUR, JOBLESS_CLAIMS_UTC_MIN,
            tzinfo=timezone.utc,
        )
        delta_min = (claims_dt - now).total_seconds() / 60
        if -MACRO_WINDOW_AFTER_MIN <= delta_min <= MACRO_WINDOW_BEFORE_MIN:
            return {
                "name": "US Initial Jobless Claims",
                "short": "Jobless Claims",
                "date": today_str,
                "utc_hour": JOBLESS_CLAIMS_UTC_HOUR,
                "utc_min": JOBLESS_CLAIMS_UTC_MIN,
                "impact": 2,
                "minutes_to_event": round(delta_min),
            }

    return None


def get_funding_settlement() -> Optional[dict]:
    """
    Возвращает статус Funding Rate Settlement если мы в окне ±FUNDING_WINDOW_MIN.
    Bybit: каждые 8 часов — 00:00, 08:00, 16:00 UTC.
    """
    now = datetime.now(timezone.utc)
    for h in FUNDING_HOURS_UTC:
        settlement_dt = datetime(
            now.year, now.month, now.day, h, 0, tzinfo=timezone.utc
        )
        delta_min = (settlement_dt - now).total_seconds() / 60
        if -FUNDING_WINDOW_MIN <= delta_min <= FUNDING_WINDOW_MIN:
            return {
                "name": f"Funding Settlement {h:02d}:00 UTC",
                "minutes_to_settlement": round(delta_min),
                "is_before": delta_min > 0,
            }
    return None


def is_trade_blocked() -> tuple[bool, str]:
    """
    Hard block for highest-impact events (FOMC, CPI, NFP, PCE).
    Returns (True, reason) if trading should be completely stopped.
    Used in main.py before any trade execution.
    """
    macro = get_active_macro_event()
    if macro and macro["impact"] >= 3:
        t = macro["minutes_to_event"]
        t_str = f"через {abs(t)} хв" if t > 0 else f"{abs(t)} хв тому"
        return True, f" {macro['name']} ({t_str}) — торгівля заблокована"
    return False, ""


def get_size_modifier() -> tuple[float, str]:
    """
    Главная функция для decision_maker.
    Возвращает (size_multiplier_коэффициент, причина).

    Таблица коэффициентов:
      FOMC / CPI / NFP в окне риска  → 0.40  (экстремальная волатильность)
      PCE / Jobless Claims            → 0.55  (высокая волатильность)
      Funding Settlement ±20 мин      → 0.75  (funding flush + spike)
      Нет событий                     → 1.00

    Пример использования:
        macro_mod, macro_reason = get_size_modifier()
        size_multiplier = round(size_multiplier * macro_mod, 2)
    """
    macro = get_active_macro_event()
    if macro:
        t = macro["minutes_to_event"]
        t_str = f"через {abs(t)} мин" if t > 0 else f"{abs(t)} мин назад"
        reason = f" {macro['name']} ({t_str})"
        if macro["impact"] == 3:
            return 0.40, reason
        else:
            return 0.55, reason

    funding = get_funding_settlement()
    if funding:
        t = funding["minutes_to_settlement"]
        t_str = f"через {abs(t)} мин" if funding["is_before"] else f"{abs(t)} мин назад"
        return 0.75, f"⏱ {funding['name']} ({t_str})"

    return 1.00, ""
