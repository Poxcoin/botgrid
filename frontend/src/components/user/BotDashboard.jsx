import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { authFetch } from '@/lib/api';

// Resolve CSS variable from the document (needed for canvas-based chart)
const cv = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const MONO = "'JetBrains Mono',ui-monospace,'SF Mono',monospace";
const SANS = "'Inter',-apple-system,BlinkMacSystemFont,sans-serif";

const BOTS = [
  { id: 'signal',  label: 'Signal'  },
  { id: 'grid',    label: 'Grid'    },
  { id: 'altcoin', label: 'Altcoin' },
];

const TFS = [
  { v: '1', l: '1m' }, { v: '5', l: '5m' }, { v: '15', l: '15m' },
  { v: '60', l: '1h' }, { v: '240', l: '4h' }, { v: 'D', l: '1D' },
];

// ── Helpers ───────────────────────────────────────────────────────
const normSym  = s => (s || '').replace('/USDT:USDT', '').replace('/USDT', '').replace('USDT', '').trim();
const getPnl   = t => parseFloat(t?.pnl_usdt ?? t?.pnl ?? 0);
const toSec    = s => s ? Math.floor(new Date(s).getTime() / 1000) : null;
const fmtN     = (v, d = 2) => v == null || isNaN(+v) ? '—' : (+v).toFixed(d);
const fmtSign  = (v, d = 2) => { const n = parseFloat(v); if (isNaN(n)) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(d); };
const fmtMoney = v => v == null || isNaN(+v) ? '—' : '$' + (+v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTs    = ms => { try { return new Date(+ms).toLocaleTimeString('en-US', { hour12: false }); } catch { return ''; } };
const pclr     = v => +v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
const pclrRaw  = v => +v >= 0 ? cv('--accent-green') || '#00b894' : cv('--accent-red') || '#d63043';


// ── Stats bar ─────────────────────────────────────────────────────

function StatsBar({ balance, trades, positions }) {
  const closed   = useMemo(() => (trades || []).filter(t => t.closed_at), [trades]);
  const totalPnl = useMemo(() => closed.reduce((s, t) => s + getPnl(t), 0), [closed]);
  const wins     = useMemo(() => closed.filter(t => getPnl(t) > 0).length, [closed]);
  const wr       = closed.length ? (wins / closed.length * 100).toFixed(1) : null;
  const unreal   = balance?.unrealized_pnl ?? 0;

  const Item = ({ label, value, color, dot }) => (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      padding: '0 20px', borderRight: '1px solid var(--border-subtle)',
    }}>
      <span style={{
        fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: 'var(--text-muted)',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: MONO, fontSize: 13, fontWeight: 600, color: color || 'var(--text-primary)',
        fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {dot && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--accent-green)', flexShrink: 0,
            boxShadow: '0 0 6px var(--accent-green)',
          }}/>
        )}
        {value}
      </span>
    </div>
  );

  return (
    <div style={{
      height: 54, flexShrink: 0, display: 'flex', alignItems: 'center',
      background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
      paddingLeft: 4,
    }}>
      <Item label="Balance"    value={balance ? fmtMoney(balance.wallet) : '—'} dot/>
      <Item label="Equity"     value={balance ? fmtMoney(balance.equity) : '—'}/>
      <Item label="Total PnL"  value={`${fmtSign(totalPnl)} USDT`} color={pclr(totalPnl)}/>
      <Item label="Unrealized" value={`${fmtSign(unreal)} USDT`}   color={pclr(unreal)}/>
      <Item label="Win Rate"   value={wr ? `${wr}%` : '—'} color={wr && +wr >= 50 ? 'var(--accent-green)' : 'var(--text-muted)'}/>
      <Item label="Positions"  value={positions?.length ?? 0}/>
    </div>
  );
}


// ── Selector ──────────────────────────────────────────────────────

function Selector({ activeBot, setBot, coin, setCoin, trades }) {
  const coins = useMemo(() => {
    const map = new Map();
    (trades || []).filter(t => (t.source || '') === activeBot).forEach(t => {
      const c = normSym(t.symbol);
      if (!c) return;
      map.set(c, (map.get(c) || 0) + getPnl(t));
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [trades, activeBot]);

  return (
    <div style={{
      height: 40, flexShrink: 0, display: 'flex', alignItems: 'stretch',
      background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Bot tabs */}
      <div style={{ display: 'flex', borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {BOTS.map(b => {
          const active = activeBot === b.id;
          const botPnl = (trades || []).filter(t => (t.source || '') === b.id).reduce((s, t) => s + getPnl(t), 0);
          const hasTr  = (trades || []).some(t => (t.source || '') === b.id);
          return (
            <button key={b.id}
              onClick={() => { setBot(b.id); setCoin(null); }}
              style={{
                height: '100%', padding: '0 18px', cursor: 'pointer',
                fontFamily: SANS, fontSize: 12, fontWeight: active ? 600 : 400,
                background: 'none', border: 'none',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'color 0.15s',
              }}>
              {b.label}
              {hasTr && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: pclr(botPnl) }}>
                  {fmtSign(botPnl, 0)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Coin chips */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 4,
        padding: '0 12px', overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {coins.length === 0 && (
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>no trades</span>
        )}
        {coins.map(([c, pnl]) => {
          const active = coin === c;
          return (
            <button key={c}
              onClick={() => setCoin(active ? null : c)}
              style={{
                height: 24, padding: '0 10px', borderRadius: 4, flexShrink: 0, cursor: 'pointer',
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.04em',
                border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
                background: active ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', gap: 7,
                transition: 'all 0.12s',
              }}>
              {c}
              <span style={{ color: pclr(pnl), fontSize: 9 }}>{fmtSign(pnl, 0)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ── Chart ─────────────────────────────────────────────────────────

function ChartPane({ coin, tf, setTf, trades, positions, activeBot, fullscreen, setFullscreen }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const candleRef = useRef(null);
  const plRef     = useRef([]);
  const [ticker, setTicker] = useState(null);

  const markers = useMemo(() => {
    if (!coin || !activeBot) return [];
    const out = [];
    (trades || [])
      .filter(t => (t.source || '') === activeBot && normSym(t.symbol) === coin && t.opened_at)
      .forEach(t => {
        const isLong = t.side === 'LONG' || t.side === 'Buy';
        const et = toSec(t.opened_at);
        if (et) out.push({
          time: et,
          position: isLong ? 'belowBar' : 'aboveBar',
          color:    pclrRaw(isLong ? 1 : -1),
          shape:    isLong ? 'arrowUp' : 'arrowDown',
          text:     `${isLong ? 'L' : 'S'}${t.leverage ? ' ' + t.leverage + 'x' : ''}`,
          size: 1,
        });
        if (t.closed_at) {
          const ct  = toSec(t.closed_at);
          const pnl = getPnl(t);
          if (ct) out.push({
            time: ct,
            position: isLong ? 'aboveBar' : 'belowBar',
            color:    pclrRaw(pnl),
            shape:    'circle',
            text:     fmtSign(pnl, 1),
            size: 0.8,
          });
        }
      });
    return out.sort((a, b) => a.time - b.time);
  }, [trades, activeBot, coin]);

  // Create / destroy chart when coin or tf changes
  useEffect(() => {
    if (!canvasRef.current || !coin) return;
    const el = canvasRef.current;

    // Read resolved CSS values for the canvas
    const bgColor  = cv('--bg-base')       || '#ffffff';
    const txtColor = cv('--text-secondary') || '#555555';
    const gridClr  = cv('--border-subtle') ? `rgba(0,0,0,0.05)` : 'rgba(0,0,0,0.05)';
    const green    = cv('--accent-green')  || '#00b894';
    const red      = cv('--accent-red')    || '#d63043';

    const chart = createChart(el, {
      width:  el.clientWidth,
      height: el.clientHeight,
      layout:    { background: { color: bgColor }, textColor: txtColor },
      grid:      { vertLines: { color: gridClr }, horzLines: { color: gridClr } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(0,0,0,0.08)' },
      timeScale: { borderColor: 'rgba(0,0,0,0.08)', timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const candle = chart.addCandlestickSeries({
      upColor: green, downColor: red,
      borderUpColor: green, borderDownColor: red,
      wickUpColor: green, wickDownColor: red,
    });
    candleRef.current = candle;

    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    let alive = true;
    const loadKlines = async () => {
      try {
        const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${tf}&limit=300`);
        const d = await r.json();
        if (!alive || !d.result?.list) return;
        const raw = d.result.list.slice().reverse();
        candle.setData(raw.map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] })));
        vol.setData(raw.map(k => ({ time: Math.floor(+k[0] / 1000), value: +k[5], color: +k[4] >= +k[1] ? green + '44' : red + '44' })));
        chart.timeScale().fitContent();
      } catch {}
    };
    loadKlines();
    const klTimer = setInterval(loadKlines, 15000);

    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      alive = false;
      clearInterval(klTimer);
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      plRef.current = [];
    };
  }, [coin, tf]);

  // Update markers + price lines
  useEffect(() => {
    const candle = candleRef.current;
    if (!candle) return;
    try { candle.setMarkers(markers); } catch {}

    plRef.current.forEach(pl => { try { candle.removePriceLine(pl); } catch {} });
    plRef.current = [];

    const green = cv('--accent-green') || '#00b894';
    const red   = cv('--accent-red')   || '#d63043';
    const amber = cv('--accent-amber') || '#f59e0b';

    (positions || [])
      .filter(p => normSym(p.symbol) === coin)
      .forEach(p => {
        const add = (price, color, title, style = LineStyle.Dashed) => {
          if (!price || isNaN(+price)) return;
          try { plRef.current.push(candle.createPriceLine({ price: +price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })); }
          catch {}
        };
        add(p.entry_price, 'rgba(0,0,0,0.35)', 'Entry', LineStyle.Solid);
        add(p.sl,          red,   'SL');
        add(p.tp,          green, 'TP');
        add(p.liq_price,   amber, 'Liq', LineStyle.Dotted);
      });
  }, [markers, positions, activeBot, coin]);

  // Ticker poll
  useEffect(() => {
    if (!coin) return;
    const load = () =>
      fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${coin}USDT`)
        .then(r => r.json()).then(d => { const x = d?.result?.list?.[0]; if (x) setTicker(x); }).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [coin]);

  const chg = ticker ? parseFloat(ticker.price24hPcnt) * 100 : null;

  return (
    <div style={{
      position:      fullscreen ? 'fixed' : 'relative',
      inset:         fullscreen ? 0 : undefined,
      zIndex:        fullscreen ? 9999 : undefined,
      flex:          fullscreen ? undefined : 1,
      display:       'flex', flexDirection: 'column',
      background:    'var(--bg-base)',
      minHeight:     0,
    }}>
      {/* Ticker + controls */}
      <div style={{
        height: 38, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 10,
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginRight: 4 }}>
          {coin}/USDT
        </span>

        {ticker && (
          <>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: pclr(chg) }}>
              {ticker.lastPrice}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, color: pclr(chg) }}>
              {chg >= 0 ? '+' : ''}{chg?.toFixed(2)}%
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>H {ticker.highPrice24h}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>L {ticker.lowPrice24h}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>
              Vol {(+ticker.volume24h || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </span>
          </>
        )}

        <div style={{ flex: 1 }}/>

        {/* TF buttons */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TFS.map(t => (
            <button key={t.v} onClick={() => setTf(t.v)}
              style={{
                fontFamily: MONO, fontSize: 10, height: 22, padding: '0 7px', borderRadius: 3,
                cursor: 'pointer',
                background: tf === t.v ? 'var(--bg-elevated)' : 'transparent',
                border:    `1px solid ${tf === t.v ? 'var(--border-strong)' : 'transparent'}`,
                color:      tf === t.v ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: tf === t.v ? 600 : 400,
              }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Fullscreen toggle */}
        <button onClick={() => setFullscreen(f => !f)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          {fullscreen
            ? <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 5V1h4M8 1h4v4M12 8v4H8M5 12H1V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 1H1v4M8 1h4v4M8 12h4V8M1 8v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </button>
      </div>

      {/* Canvas */}
      <div ref={canvasRef} style={{ flex: 1, minHeight: 0 }}/>
    </div>
  );
}


// ── Market trades ─────────────────────────────────────────────────

function MarketTrades({ coin }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!coin) return;
    const load = () =>
      fetch(`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${coin}USDT&limit=50`)
        .then(r => r.json()).then(d => setRows(d?.result?.list || [])).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [coin]);

  return (
    <div style={{
      width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 38, flexShrink: 0, display: 'flex', alignItems: 'center',
        padding: '0 12px', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Market Trades
        </span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'flex', padding: '4px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        {['Price', 'Qty', 'Time'].map((h, i) => (
          <span key={h} style={{
            fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)',
            flex: i < 2 ? 1 : 0, minWidth: i === 2 ? 48 : undefined, textAlign: i === 2 ? 'right' : 'left',
          }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {rows.map((r, i) => (
          <div key={r.execId || i} style={{
            display: 'flex', padding: '2px 12px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10, flex: 1, color: pclr(r.side === 'Buy' ? 1 : -1) }}>{r.price}</span>
            <span style={{ fontFamily: MONO, fontSize: 10, flex: 1, color: 'var(--text-secondary)' }}>{(+r.size).toFixed(3)}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, minWidth: 48, textAlign: 'right', color: 'var(--text-muted)' }}>{fmtTs(r.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Bottom panel ──────────────────────────────────────────────────

const BP_TABS = ['Positions', 'History', 'PnL'];

function BottomPanel({ positions, trades, coin, activeBot }) {
  const [tab, setTab] = useState('Positions');

  const filtPos = useMemo(() =>
    (positions || []).filter(p => !coin || normSym(p.symbol) === coin)
  , [positions, coin]);

  const filtTr = useMemo(() =>
    (trades || []).filter(t =>
      (!coin || normSym(t.symbol) === coin) &&
      (!activeBot || (t.source || '') === activeBot)
    )
  , [trades, coin, activeBot]);

  const Hd = ({ ch, right }) => (
    <th style={{
      padding: '5px 12px', fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400,
      textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
      background: 'var(--bg-elevated)', position: 'sticky', top: 0,
    }}>{ch}</th>
  );
  const Td = ({ v, color, right }) => (
    <td style={{
      padding: '5px 12px', fontFamily: MONO, fontSize: 11,
      color: color || 'var(--text-secondary)',
      textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
    }}>{v ?? '—'}</td>
  );

  return (
    <div style={{
      height: 220, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    }}>
      {/* Tab bar */}
      <div style={{ height: 34, flexShrink: 0, display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-subtle)' }}>
        {BP_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '0 16px', fontFamily: SANS, fontSize: 12, fontWeight: tab === t ? 600 : 400,
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--text-primary)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {t}
            {t === 'Positions' && filtPos.length > 0 && (
              <span style={{
                background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                padding: '1px 5px', borderRadius: 3, fontSize: 9, fontFamily: MONO,
              }}>{filtPos.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', scrollbarWidth: 'thin' }}>

        {tab === 'Positions' && (
          filtPos.length === 0
            ? <div style={{ padding: '18px 14px', fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>
                No open positions{coin ? ` · ${coin}` : ''}
              </div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><Hd ch="Symbol"/><Hd ch="Side"/><Hd ch="Size"/><Hd ch="Entry"/><Hd ch="Mark"/><Hd ch="SL"/><Hd ch="TP"/><Hd ch="Liq"/><Hd ch="PnL" right/></tr>
                </thead>
                <tbody>
                  {filtPos.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <Td v={normSym(p.symbol)} color="var(--text-primary)"/>
                      <Td v={p.side} color={(p.side === 'LONG' || p.side === 'Buy') ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                      <Td v={fmtN(p.qty, 3)}/>
                      <Td v={fmtN(p.entry_price, 4)}/>
                      <Td v={fmtN(p.mark_price, 4)}/>
                      <Td v={p.sl ? fmtN(p.sl, 4) : '—'} color={p.sl ? 'var(--accent-red)' : 'var(--text-muted)'}/>
                      <Td v={p.tp ? fmtN(p.tp, 4) : '—'} color={p.tp ? 'var(--accent-green)' : 'var(--text-muted)'}/>
                      <Td v={p.liq_price ? fmtN(p.liq_price, 4) : '—'} color={p.liq_price ? 'var(--accent-amber)' : 'var(--text-muted)'}/>
                      <Td v={`${fmtSign(p.unrealized_pnl ?? 0)} USDT`} color={pclr(p.unrealized_pnl ?? 0)} right/>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}

        {tab === 'History' && (
          filtTr.length === 0
            ? <div style={{ padding: '18px 14px', fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>
                No trades{coin ? ` · ${coin}` : ''}
              </div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr><Hd ch="Symbol"/><Hd ch="Side"/><Hd ch="Bot"/><Hd ch="Size"/><Hd ch="Entry"/><Hd ch="Exit"/><Hd ch="Opened"/><Hd ch="PnL" right/></tr>
                </thead>
                <tbody>
                  {filtTr.slice(0, 200).map((t, i) => {
                    const pnl = getPnl(t);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <Td v={normSym(t.symbol)} color="var(--text-primary)"/>
                        <Td v={t.side} color={(t.side === 'LONG' || t.side === 'Buy') ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                        <Td v={t.source || '—'}/>
                        <Td v={fmtN(t.qty, 3)}/>
                        <Td v={fmtN(t.entry_price, 4)}/>
                        <Td v={fmtN(t.exit_price, 4)}/>
                        <Td v={t.opened_at ? new Date(t.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}/>
                        <Td v={t.closed_at ? `${fmtSign(pnl)} USDT` : 'open'} color={t.closed_at ? pclr(pnl) : 'var(--accent-amber)'} right/>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
        )}

        {tab === 'PnL' && <PnLSummary trades={filtTr}/>}
      </div>
    </div>
  );
}

function PnLSummary({ trades }) {
  const closed   = useMemo(() => (trades || []).filter(t => t.closed_at), [trades]);
  const pnlTotal = closed.reduce((s, t) => s + getPnl(t), 0);
  const wins     = closed.filter(t => getPnl(t) > 0);
  const losses   = closed.filter(t => getPnl(t) < 0);
  const wr       = closed.length ? (wins.length / closed.length * 100).toFixed(1) : null;
  const avgW     = wins.length   ? wins.reduce((s, t) => s + getPnl(t), 0) / wins.length : null;
  const avgL     = losses.length ? losses.reduce((s, t) => s + getPnl(t), 0) / losses.length : null;
  const rr       = avgW && avgL  ? Math.abs(avgW / avgL).toFixed(2) : null;
  const best     = wins.length   ? Math.max(...wins.map(getPnl)) : null;
  const worst    = losses.length ? Math.min(...losses.map(getPnl)) : null;

  const Row = ({ label, value, color }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 16px', borderBottom: '1px solid var(--border-subtle)',
    }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      <Row label="Total PnL"    value={`${fmtSign(pnlTotal)} USDT`} color={pclr(pnlTotal)}/>
      <Row label="Total Trades" value={closed.length}/>
      <Row label="Win Rate"     value={wr ? `${wr}%` : '—'} color={wr && +wr >= 50 ? 'var(--accent-green)' : 'var(--text-muted)'}/>
      <Row label="W / L"        value={`${wins.length} / ${losses.length}`}/>
      <Row label="Avg Win"      value={avgW ? `${fmtSign(avgW)} USDT` : '—'} color="var(--accent-green)"/>
      <Row label="Avg Loss"     value={avgL ? `${fmtSign(avgL)} USDT` : '—'} color="var(--accent-red)"/>
      <Row label="R:R"          value={rr ?? '—'}/>
      <Row label="Best"         value={best != null ? `+${best.toFixed(2)} USDT` : '—'} color="var(--accent-green)"/>
      <Row label="Worst"        value={worst != null ? `${worst.toFixed(2)} USDT` : '—'} color="var(--accent-red)"/>
    </div>
  );
}


// ── Grid Overview ─────────────────────────────────────────────────

function StatCell({ label, value, color }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: color || 'var(--text-primary)', marginTop: 3 }}>{value ?? '—'}</div>
    </div>
  );
}

function CoinCard({ data, onSelect }) {
  const dp      = data.coin === 'BTC' ? 1 : 2;
  const pnlAll  = data.closed_pnl + data.open_pnl;
  return (
    <div
      onClick={onSelect}
      style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{data.coin}/USDT</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Grid Bot · Perpetual{data.leverage ? ` · ${data.leverage}x` : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: pclr(pnlAll) }}>{fmtSign(pnlAll)} USDT</div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>Total PnL</div>
        </div>
      </div>

      {/* Mark price row */}
      {data.mark_price && (
        <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', marginRight: 6 }}>MARK</span>
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>${fmtN(data.mark_price, dp)}</span>
          </div>
          {data.entry_price && (
            <div>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', marginRight: 6 }}>AVG ENTRY</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-secondary)' }}>${fmtN(data.entry_price, dp)}</span>
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: data.open_positions?.length ? 14 : 0 }}>
        <StatCell label="Open Levels"  value={data.open_count} color={data.open_count > 0 ? 'var(--accent-green)' : undefined}/>
        <StatCell label="Unrealized"   value={`${fmtSign(data.open_pnl)} USDT`}   color={pclr(data.open_pnl)}/>
        <StatCell label="Win Rate"     value={data.closed_trades > 0 ? `${data.win_rate}%` : '—'} color={data.win_rate >= 50 ? 'var(--accent-green)' : 'var(--text-muted)'}/>
        <StatCell label="Closed PnL"   value={`${fmtSign(data.closed_pnl)} USDT`} color={pclr(data.closed_pnl)}/>
        <StatCell label="Closed"       value={data.closed_trades}/>
        <StatCell label="Total Trades" value={data.total_trades}/>
      </div>

      {/* Open levels list */}
      {data.open_positions?.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Open Grid Levels
          </div>
          {data.open_positions.slice(0, 5).map((pos, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: pos.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {pos.side} {pos.qty?.toFixed(4)}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-secondary)' }}>@ ${fmtN(pos.entry_price, dp)}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>
                {pos.opened_at ? new Date(pos.opened_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>View chart →</span>
      </div>
    </div>
  );
}

function GridOverview({ onSelectCoin }) {
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/users/grid-positions')
      .then(r => r.ok ? r.json() : [])
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
    const t = setInterval(() => {
      authFetch('/api/users/grid-positions').then(r => r.ok ? r.json() : []).then(d => setData(Array.isArray(d) ? d : [])).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>Loading grid…</span>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg-base)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, maxWidth: 900, margin: '0 auto' }}>
        {data.map(coin => (
          <CoinCard key={coin.coin} data={coin} onSelect={() => onSelectCoin(coin.coin)} />
        ))}
      </div>
    </div>
  );
}


// ── Root ──────────────────────────────────────────────────────────

export default function BotDashboard() {
  const [activeBot,   setBot]        = useState('signal');
  const [coin,        setCoin]       = useState(null);
  const [tf,          setTf]         = useState('60');
  const [fullscreen,  setFullscreen] = useState(false);
  const [balance,     setBalance]    = useState(null);
  const [positions,   setPositions]  = useState([]);
  const [trades,      setTrades]     = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [sRes, tRes] = await Promise.all([
          authFetch('/api/users/bot-summary'),
          authFetch('/api/users/trades?limit=500'),
        ]);
        if (sRes.ok) {
          const d = await sRes.json();
          setBalance(d.balance ?? null);
          setPositions(d.positions ?? []);
        }
        if (tRes.ok) {
          const d = await tRes.json();
          setTrades(Array.isArray(d) ? d : (d.trades ?? []));
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  // Auto-select first coin when bot changes; Grid shows overview first
  useEffect(() => {
    if (activeBot === 'grid') { setCoin(null); return; }
    const available = [...new Set(
      trades.filter(t => (t.source || '') === activeBot).map(t => normSym(t.symbol)).filter(Boolean)
    )].sort();
    if (available.length > 0 && !available.includes(coin)) setCoin(available[0]);
    else if (available.length === 0) setCoin(null);
  }, [activeBot, trades]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <StatsBar balance={balance} trades={trades} positions={positions}/>
      <Selector activeBot={activeBot} setBot={setBot} coin={coin} setCoin={setCoin} trades={trades}/>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {coin ? (
          <>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <ChartPane
                coin={coin} tf={tf} setTf={setTf}
                trades={trades} positions={positions} activeBot={activeBot}
                fullscreen={fullscreen} setFullscreen={setFullscreen}
              />
              {!fullscreen && (
                <BottomPanel positions={positions} trades={trades} coin={coin} activeBot={activeBot}/>
              )}
            </div>
            {!fullscreen && <MarketTrades coin={coin}/>}
          </>
        ) : activeBot === 'grid' ? (
          <GridOverview onSelectCoin={setCoin}/>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)' }}>select a coin above</span>
          </div>
        )}
      </div>
    </div>
  );
}
