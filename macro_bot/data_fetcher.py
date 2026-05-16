"""
Fetches economic data from:
  - BLS API (CPI, PPI, NFP) — bls.gov
  - FRED API (PCE, GDP) — fred.stlouisfed.org
  - ForexFactory (calendar + forecasts) — web scrape
"""
import aiohttp
import asyncio
import logging
from datetime import datetime, timezone, date
from typing import Optional
from bs4 import BeautifulSoup

log = logging.getLogger("macro.data")

# BLS series IDs
BLS_SERIES = {
    "CPI":      "CUSR0000SA0",    # CPI All Urban Consumers, Not Seasonally Adjusted
    "CORE_CPI": "CUSR0000SA0L1E", # CPI ex Food & Energy
    "PPI":      "WPSFD4",         # PPI Final Demand
    "NFP":      "CES0000000001",  # Total Nonfarm Payrolls (thousands)
}

# FRED series IDs
FRED_SERIES = {
    "PCE":      "PCEPI",          # PCE Price Index
    "CORE_PCE": "PCEPILFE",       # Core PCE
    "GDP":      "GDPC1",          # Real GDP
    "UNEMPLOYMENT": "UNRATE",     # Unemployment Rate
}


class BLSFetcher:
    URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    async def get_latest(self, series_id: str) -> Optional[dict]:
        payload: dict = {"seriesid": [series_id], "latest": True}
        if self.api_key:
            payload["registrationkey"] = self.api_key

        async with aiohttp.ClientSession() as s:
            async with s.post(self.URL, json=payload) as r:
                if r.status != 200:
                    log.error("BLS API error %s", r.status)
                    return None
                data = await r.json(content_type=None)

        if data.get("status") != "REQUEST_SUCCEEDED":
            log.error("BLS error: %s", data.get("message"))
            return None

        series_data = data["Results"]["series"][0]["data"]
        if not series_data:
            return None

        latest = series_data[0]
        prev   = series_data[1] if len(series_data) > 1 else None

        value      = float(latest["value"])
        prev_value = float(prev["value"]) if prev else None
        mom_change = round((value - prev_value) / prev_value * 100, 3) if prev_value else None

        return {
            "series_id": series_id,
            "year":      latest["year"],
            "period":    latest["period"],
            "value":     value,
            "mom_pct":   mom_change,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    async def get_cpi(self) -> Optional[dict]:
        return await self.get_latest(BLS_SERIES["CPI"])

    async def get_nfp(self) -> Optional[dict]:
        raw = await self.get_latest(BLS_SERIES["NFP"])
        if raw:
            # NFP series is in thousands, convert to actual number
            raw["value_actual"] = int(raw["value"] * 1000)
        return raw

    async def get_ppi(self) -> Optional[dict]:
        return await self.get_latest(BLS_SERIES["PPI"])


class FREDFetcher:
    BASE = "https://api.stlouisfed.org/fred/series/observations"

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def get_latest(self, series_id: str) -> Optional[dict]:
        params = {
            "series_id":    series_id,
            "api_key":      self.api_key,
            "file_type":    "json",
            "limit":        2,
            "sort_order":   "desc",
        }
        async with aiohttp.ClientSession() as s:
            async with s.get(self.BASE, params=params) as r:
                if r.status != 200:
                    log.error("FRED error %s", r.status)
                    return None
                data = await r.json()

        obs = data.get("observations", [])
        if not obs:
            return None

        latest = obs[0]
        prev   = obs[1] if len(obs) > 1 else None

        value      = float(latest["value"]) if latest["value"] != "." else None
        prev_value = float(prev["value"]) if prev and prev["value"] != "." else None
        mom_change = round((value - prev_value) / prev_value * 100, 3) if (value and prev_value) else None

        return {
            "series_id": series_id,
            "date":      latest["date"],
            "value":     value,
            "mom_pct":   mom_change,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }


class ForexFactoryCalendar:
    """
    Scrapes ForexFactory for today's high-impact USD events with forecast values.
    Returns list of upcoming events sorted by time.
    """
    URL = "https://www.forexfactory.com/calendar"
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Referer": "https://www.forexfactory.com/",
    }

    # Only these events trigger trades
    TARGET_EVENTS = {
        "CPI m/m",
        "Core CPI m/m",
        "CPI y/y",
        "NFP",
        "Non-Farm Employment Change",
        "PCE Price Index m/m",
        "Core PCE Price Index m/m",
        "PPI m/m",
        "Prelim GDP q/q",
        "FOMC Statement",
        "Federal Funds Rate",
    }

    async def fetch_today(self) -> list[dict]:
        async with aiohttp.ClientSession(headers=self.HEADERS) as s:
            async with s.get(self.URL, params={"day": "today"}) as r:
                if r.status != 200:
                    log.warning("ForexFactory returned %s", r.status)
                    return []
                html = await r.text()

        return self._parse(html)

    def _parse(self, html: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        events = []
        current_date = date.today()

        for row in soup.select("tr.calendar__row"):
            # Impact
            impact_el = row.select_one("td.calendar__impact span")
            if not impact_el:
                continue
            impact_class = " ".join(impact_el.get("class", []))
            if "red" not in impact_class:  # only high-impact (red)
                continue

            # Currency — only USD events
            currency_el = row.select_one("td.calendar__currency")
            if not currency_el or currency_el.get_text(strip=True) != "USD":
                continue

            # Event name
            event_el = row.select_one("td.calendar__event span.calendar__event-title")
            if not event_el:
                continue
            event_name = event_el.get_text(strip=True)

            if event_name not in self.TARGET_EVENTS:
                continue

            # Time
            time_el = row.select_one("td.calendar__time")
            time_str = time_el.get_text(strip=True) if time_el else ""

            # Forecast / Previous
            forecast_el = row.select_one("td.calendar__forecast")
            previous_el = row.select_one("td.calendar__previous")
            forecast = forecast_el.get_text(strip=True) if forecast_el else ""
            previous = previous_el.get_text(strip=True) if previous_el else ""

            events.append({
                "name":     event_name,
                "date":     current_date.isoformat(),
                "time_et":  time_str,
                "forecast": forecast,
                "previous": previous,
                "actual":   None,
            })

        return events

    async def fetch_week(self) -> list[dict]:
        """Fetches the full week calendar for pre-loading upcoming events."""
        events = []
        async with aiohttp.ClientSession(headers=self.HEADERS) as s:
            async with s.get(self.URL) as r:
                if r.status != 200:
                    return []
                html = await r.text()
        return self._parse(html)
