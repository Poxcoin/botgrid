//+------------------------------------------------------------------+
//| MacroBridgeEA.mq5 — File-based IPC bridge for macro bot         |
//| Reads orders.json → executes → writes result.json               |
//+------------------------------------------------------------------+
#property copyright "Kado Macro Bot"
#property version   "1.0"
#property strict

#include <Trade\Trade.mqh>

CTrade trade;

const string ORDER_FILE  = "macro_orders.json";
const string RESULT_FILE = "macro_result.json";
const int    MAGIC       = 20260516;
const int    CHECK_MS    = 200; // poll every 200ms

//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(MAGIC);
   trade.SetDeviationInPoints(20);
   trade.SetTypeFilling(ORDER_FILLING_IOC);

   EventSetMillisecondTimer(CHECK_MS);
   Print("MacroBridgeEA started. Watching: ", ORDER_FILE);
   WriteResult("{\"status\":\"ready\",\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2) + "}");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   if(!FileIsExist(ORDER_FILE, FILE_COMMON)) return;

   int fh = FileOpen(ORDER_FILE, FILE_READ|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(fh == INVALID_HANDLE) return;

   string content = "";
   while(!FileIsEnding(fh))
      content += FileReadString(fh);
   FileClose(fh);

   // Delete order file immediately to prevent re-processing
   FileDelete(ORDER_FILE, FILE_COMMON);

   ProcessOrder(content);
}

void ProcessOrder(string json)
{
   // Parse JSON manually (simple key extraction)
   string action    = ExtractStr(json, "action");
   string symbol    = ExtractStr(json, "symbol");
   string direction = ExtractStr(json, "direction");
   double volume    = ExtractDbl(json, "volume");
   double sl_pips   = ExtractDbl(json, "sl_pips");
   double tp_pips   = ExtractDbl(json, "tp_pips");
   long   ticket    = (long)ExtractDbl(json, "ticket");

   if(action == "open")
   {
      OpenTrade(symbol, direction, volume, sl_pips, tp_pips);
   }
   else if(action == "close")
   {
      CloseTrade(ticket);
   }
   else if(action == "ping")
   {
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
      MqlTick tick;
      SymbolInfoTick("EURUSD", tick);
      WriteResult("{\"status\":\"pong\",\"balance\":" + DoubleToString(balance,2) +
                  ",\"equity\":" + DoubleToString(equity,2) +
                  ",\"eurusd_bid\":" + DoubleToString(tick.bid,5) +
                  ",\"eurusd_ask\":" + DoubleToString(tick.ask,5) + "}");
   }
   else if(action == "calendar")
   {
      GetCalendarEvents();
   }
}

void GetCalendarEvents()
{
   // Fetch upcoming USD high-impact events from MT5 built-in calendar
   MqlCalendarValue values[];
   MqlCalendarEvent events[];
   MqlCalendarCountry countries[];

   datetime from = TimeCurrent();
   datetime to   = from + 86400; // next 24 hours

   int count = CalendarValueHistory(values, from, to, "USD");

   string result = "[";
   bool first = true;

   for(int i = 0; i < count; i++)
   {
      MqlCalendarEvent ev;
      if(!CalendarEventById(values[i].event_id, ev)) continue;
      if(ev.importance != CALENDAR_IMPORTANCE_HIGH) continue;

      // Format time as ISO string
      string dt = TimeToString(values[i].time, TIME_DATE|TIME_MINUTES);
      StringReplace(dt, ".", "-");

      // Forecast and actual (may be EMPTY_VALUE)
      string forecast = (values[i].forecast_value == EMPTY_VALUE) ? "" :
                        DoubleToString(values[i].forecast_value, 3);
      string actual   = (values[i].actual_value   == EMPTY_VALUE) ? "" :
                        DoubleToString(values[i].actual_value,   3);

      if(!first) result += ",";
      first = false;

      result += "{\"name\":\"" + ev.name + "\"" +
                ",\"time_utc\":\"" + dt + "\"" +
                ",\"forecast\":\"" + forecast + "\"" +
                ",\"actual\":\"" + actual + "\"}";
   }

   result += "]";
   WriteResult("{\"status\":\"ok\",\"events\":" + result + "}");
}

void OpenTrade(string symbol, string direction, double volume, double sl_pips, double tp_pips)
{
   double pip    = (StringFind(symbol, "JPY") >= 0) ? 0.01 : 0.0001;
   double price, sl, tp;

   if(direction == "LONG")
   {
      price = SymbolInfoDouble(symbol, SYMBOL_ASK);
      sl    = NormalizeDouble(price - sl_pips * pip, 5);
      tp    = NormalizeDouble(price + tp_pips * pip, 5);
      bool ok = trade.Buy(volume, symbol, price, sl, tp, "macro_bot");
      if(ok)
         WriteResult("{\"status\":\"ok\",\"action\":\"open\",\"direction\":\"LONG\",\"ticket\":" +
                     IntegerToString(trade.ResultOrder()) + ",\"price\":" +
                     DoubleToString(trade.ResultPrice(), 5) + "}");
      else
         WriteResult("{\"status\":\"error\",\"code\":" + IntegerToString(trade.ResultRetcode()) +
                     ",\"msg\":\"" + trade.ResultRetcodeDescription() + "\"}");
   }
   else
   {
      price = SymbolInfoDouble(symbol, SYMBOL_BID);
      sl    = NormalizeDouble(price + sl_pips * pip, 5);
      tp    = NormalizeDouble(price - tp_pips * pip, 5);
      bool ok = trade.Sell(volume, symbol, price, sl, tp, "macro_bot");
      if(ok)
         WriteResult("{\"status\":\"ok\",\"action\":\"open\",\"direction\":\"SHORT\",\"ticket\":" +
                     IntegerToString(trade.ResultOrder()) + ",\"price\":" +
                     DoubleToString(trade.ResultPrice(), 5) + "}");
      else
         WriteResult("{\"status\":\"error\",\"code\":" + IntegerToString(trade.ResultRetcode()) +
                     ",\"msg\":\"" + trade.ResultRetcodeDescription() + "\"}");
   }
}

void CloseTrade(long ticket)
{
   bool ok = trade.PositionClose(ticket);
   if(ok)
      WriteResult("{\"status\":\"ok\",\"action\":\"close\",\"ticket\":" + IntegerToString(ticket) +
                  ",\"price\":" + DoubleToString(trade.ResultPrice(), 5) +
                  ",\"profit\":" + DoubleToString(PositionGetDouble(POSITION_PROFIT), 2) + "}");
   else
      WriteResult("{\"status\":\"error\",\"code\":" + IntegerToString(trade.ResultRetcode()) +
                  ",\"msg\":\"" + trade.ResultRetcodeDescription() + "\"}");
}

void WriteResult(string content)
{
   int fh = FileOpen(RESULT_FILE, FILE_WRITE|FILE_TXT|FILE_COMMON|FILE_ANSI);
   if(fh == INVALID_HANDLE) return;
   FileWriteString(fh, content);
   FileClose(fh);
}

// ── Simple JSON string parser ───────────────────────────────────────

string ExtractStr(string json, string key)
{
   string search = "\"" + key + "\":\"";
   int pos = StringFind(json, search);
   if(pos < 0) return "";
   pos += StringLen(search);
   int end = StringFind(json, "\"", pos);
   if(end < 0) return "";
   return StringSubstr(json, pos, end - pos);
}

double ExtractDbl(string json, string key)
{
   string search = "\"" + key + "\":";
   int pos = StringFind(json, search);
   if(pos < 0) return 0;
   pos += StringLen(search);
   string val = "";
   for(int i = pos; i < StringLen(json); i++)
   {
      ushort c = StringGetCharacter(json, i);
      if(c == ',' || c == '}') break;
      val += ShortToString(c);
   }
   return StringToDouble(val);
}
//+------------------------------------------------------------------+
