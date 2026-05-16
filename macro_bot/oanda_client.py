import aiohttp
import asyncio
import json
import logging
from typing import Optional

log = logging.getLogger("macro.oanda")


class OandaClient:
    def __init__(self, api_key: str, account_id: str, practice: bool = True):
        self.account_id = account_id
        host = "api-fxpractice.oanda.com" if practice else "api-fxtrade.oanda.com"
        self.base_url = f"https://{host}/v3"
        self.stream_url = f"https://{'stream-fxpractice' if practice else 'stream-fxtrade'}.oanda.com/v3"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept-Datetime-Format": "UNIX",
        }
        self._session: Optional[aiohttp.ClientSession] = None

    async def _session_get(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers=self.headers)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    # ── Account ──────────────────────────────────────────────────────────────

    async def get_balance(self) -> float:
        s = await self._session_get()
        async with s.get(f"{self.base_url}/accounts/{self.account_id}/summary") as r:
            data = await r.json()
            return float(data["account"]["balance"])

    # ── Pricing ───────────────────────────────────────────────────────────────

    async def get_price(self, instrument: str) -> dict:
        """Returns {'bid': float, 'ask': float, 'mid': float, 'spread_pips': float}"""
        s = await self._session_get()
        async with s.get(
            f"{self.base_url}/accounts/{self.account_id}/pricing",
            params={"instruments": instrument}
        ) as r:
            data = await r.json()
            price = data["prices"][0]
            bid = float(price["bids"][0]["price"])
            ask = float(price["asks"][0]["price"])
            pip = 0.01 if "JPY" in instrument else 0.0001
            return {
                "bid": bid,
                "ask": ask,
                "mid": (bid + ask) / 2,
                "spread_pips": round((ask - bid) / pip, 1),
            }

    # ── Orders ────────────────────────────────────────────────────────────────

    async def place_market_order(
        self,
        instrument: str,
        units: int,              # positive = LONG, negative = SHORT
        sl_pips: float,
        tp_pips: float,
        client_extensions: Optional[dict] = None,
    ) -> dict:
        price_data = await self.get_price(instrument)
        mid = price_data["mid"]
        pip = 0.01 if "JPY" in instrument else 0.0001
        decimals = 3 if "JPY" in instrument else 5

        if units > 0:
            sl_price = round(mid - sl_pips * pip, decimals)
            tp_price = round(mid + tp_pips * pip, decimals)
        else:
            sl_price = round(mid + sl_pips * pip, decimals)
            tp_price = round(mid - tp_pips * pip, decimals)

        order_body: dict = {
            "order": {
                "type": "MARKET",
                "instrument": instrument,
                "units": str(units),
                "timeInForce": "FOK",
                "stopLossOnFill": {
                    "price": str(sl_price),
                    "timeInForce": "GTC",
                },
                "takeProfitOnFill": {
                    "price": str(tp_price),
                    "timeInForce": "GTC",
                },
            }
        }
        if client_extensions:
            order_body["order"]["clientExtensions"] = client_extensions

        s = await self._session_get()
        async with s.post(
            f"{self.base_url}/accounts/{self.account_id}/orders",
            data=json.dumps(order_body),
        ) as r:
            resp = await r.json()
            if r.status not in (200, 201):
                log.error("Order failed %s: %s", r.status, resp)
            else:
                fill = resp.get("orderFillTransaction", {})
                log.info("Order filled: %s units @ %s (SL=%s TP=%s)",
                         units, fill.get("price", mid), sl_price, tp_price)
            return resp

    async def close_trade(self, trade_id: str) -> dict:
        s = await self._session_get()
        async with s.put(
            f"{self.base_url}/accounts/{self.account_id}/trades/{trade_id}/close"
        ) as r:
            return await r.json()

    async def get_open_trades(self) -> list:
        s = await self._session_get()
        async with s.get(
            f"{self.base_url}/accounts/{self.account_id}/openTrades"
        ) as r:
            data = await r.json()
            return data.get("trades", [])

    async def modify_trade_sl(self, trade_id: str, new_sl_price: float) -> dict:
        body = {"stopLoss": {"price": str(round(new_sl_price, 5)), "timeInForce": "GTC"}}
        s = await self._session_get()
        async with s.put(
            f"{self.base_url}/accounts/{self.account_id}/trades/{trade_id}/orders",
            data=json.dumps(body),
        ) as r:
            return await r.json()
