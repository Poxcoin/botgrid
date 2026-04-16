// Mock data used only in Bot Analyzer tab (scoring breakdown demo)

export const LIVE_FACTORS = [
  { key: 'ai_score',        label: 'AI Score',          value: 8.4,    weight: 0.35, unit: '/10' },
  { key: 'volume_mult',     label: 'Volume Multiplier', value: 1.82,   weight: 0.20, unit: 'x' },
  { key: 'trend_24h',       label: 'Trend 24h',         value: 3.21,   weight: 0.15, unit: '%' },
  { key: 'funding_rate',    label: 'Funding Rate',      value: 0.0142, weight: 0.10, unit: '%' },
  { key: 'btc_dominance',   label: 'BTC Dominance',     value: 54.2,   weight: 0.10, unit: '%' },
  { key: 'fear_greed',      label: 'Fear & Greed',      value: 62,     weight: 0.10, unit: '' },
];

export const WIN_RATE_SERIES = Array.from({ length: 30 }).map((_, i) => ({
  day: i + 1,
  winRate:  +(50 + Math.sin(i / 3) * 8 + (i / 30) * 10).toFixed(1),
  avgScore: +(6.5 + Math.cos(i / 4) * 0.8 + (i / 30) * 0.7).toFixed(2),
}));

export const SYSTEM_LOGS = [
  { t: 'INFO', msg: 'Bot initialized — scan interval 30s' },
  { t: 'INFO', msg: 'Connected to Bybit WebSocket stream' },
  { t: 'INFO', msg: 'Scanning news feeds (16 sources)' },
  { t: 'OK',   msg: 'Headline scored: BlackRock ETH ETF amended S-1 → +8.2' },
  { t: 'OK',   msg: 'Signal generated: ETHUSDT LONG score=8.7' },
  { t: 'INFO', msg: 'Volume check passed — 1.82x 24h avg' },
  { t: 'INFO', msg: 'Funding rate 0.0142% — neutral' },
  { t: 'OK',   msg: 'Order placed: ETHUSDT LONG @ 3,421.55 TP 3,556 SL 3,350' },
  { t: 'INFO', msg: 'Next scan in 28s' },
  { t: 'WARN', msg: 'Low liquidity on DOGEUSDT — skipping' },
  { t: 'INFO', msg: 'Scanning news feeds (16 sources)' },
  { t: 'OK',   msg: 'Signal generated: SOLUSDT SHORT score=8.1' },
];
