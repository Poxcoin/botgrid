import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { init as klInit, dispose as klDispose } from 'klinecharts';

/* ── design ─────────────────────────────────────────────────────── */
const FF = 'var(--font-sans)';
const FM = 'var(--font-mono)';

/* ── api ─────────────────────────────────────────────────────────── */
const api = p =>
  fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status));

/* ── helpers ─────────────────────────────────────────────────────── */
const sym  = s => (s || '').replace('/USDT', '').replace('USDT', '').trim();
const pnl  = t => parseFloat(t?.pnl_usdt ?? t?.pnl ?? 0);
const fix  = (v, d = 2) => v == null || isNaN(+v) ? '—' : (+v).toFixed(d);
const sign = (v, d = 2) => { const n = +v; return isNaN(n) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(d); };
const pos  = v => +v >= 0;
const dstr = s => s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/* ══════════════════════════════════════════════════════════════════
   MARKET TRADES
══════════════════════════════════════════════════════════════════ */
function Trades({ coin }) {
  const [rows, setRows] = useState([]);
  const buf = useRef([]);

  useEffect(() => {
    if (!coin) return;
    fetch(`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${coin}USDT&limit=80`)
      .then(r => r.json()).then(d => {
        const list = (d?.result?.list || []).map(t => ({ id: t.execId, p: t.price, q: t.size, buy: t.side === 'Buy' }));
        buf.current = list; setRows(list);
      }).catch(() => {});

    const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
    ws.onopen = () => ws.send(JSON.stringify({ op: 'subscribe', args: [`publicTrade.${coin}USDT`] }));
    ws.onmessage = e => {
      try {
        const m = JSON.parse(e.data);
        if (m.topic === `publicTrade.${coin}USDT` && Array.isArray(m.data)) {
          buf.current = [...m.data.map(t => ({ id: t.i, p: t.p, q: t.v, buy: t.S === 'Buy' })), ...buf.current].slice(0, 80);
          setRows([...buf.current]);
        }
      } catch {}
    };
    ws.onerror = ws.onclose = () => {};
    return () => ws.close();
  }, [coin]);

  return (
    <div style={{ width: 180, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 40, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto', padding: '0 12px', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Price</span>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Qty</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {rows.map((r, i) => (
          <div key={r.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '2px 12px', gap: 8 }}>
            <span style={{ fontFamily: FM, fontSize: 10, color: r.buy ? 'var(--accent-green)' : 'var(--accent-red)' }}>{r.p}</span>
            <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)' }}>{(+r.q).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   CHART — klinecharts (same engine as Grid Bot)
══════════════════════════════════════════════════════════════════ */

const KL_STYLES = {
  grid: {
    horizontal: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed', dashedValue: [3, 3] },
    vertical:   { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed', dashedValue: [3, 3] },
  },
  candle: {
    type: 'candle_solid',
    bar: { upColor: '#00d4aa', downColor: '#ff4d6d', noChangeColor: '#888', upBorderColor: '#00d4aa', downBorderColor: '#ff4d6d', noChangeBorderColor: '#888', upWickColor: '#00d4aa', downWickColor: '#ff4d6d', noChangeWickColor: '#888' },
    tooltip: { showRule: 'follow_cross', showType: 'standard', labels: ['O', 'H', 'L', 'C', 'Vol'] },
  },
  indicator: {
    ohlc: { upColor: '#00d4aa', downColor: '#ff4d6d', noChangeColor: '#888' },
    bars: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }],
  },
  xAxis: {
    axisLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1 },
    tickLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1, length: 3 },
    tickText: { show: true, color: 'rgba(240,242,245,0.3)', size: 10, family: 'JetBrains Mono, monospace', weight: 'normal' },
  },
  yAxis: {
    axisLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1 },
    tickLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1, length: 3 },
    tickText: { show: true, color: 'rgba(240,242,245,0.3)', size: 10, family: 'JetBrains Mono, monospace', weight: 'normal' },
  },
  separator: { size: 1, color: 'rgba(255,255,255,0.06)', activeBackgroundColor: 'rgba(255,255,255,0.04)' },
  crosshair: {
    show: true,
    horizontal: { line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(255,255,255,0.2)' }, text: { show: true, size: 10, family: 'JetBrains Mono, monospace', color: '#fff', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderSize: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 2, backgroundColor: '#1a1a1a' } },
    vertical:   { line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(255,255,255,0.2)' }, text: { show: true, size: 10, family: 'JetBrains Mono, monospace', color: '#fff', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderSize: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 2, backgroundColor: '#1a1a1a' } },
  },
};

const KL_TYPES = [
  { id: 'candle_solid',     label: 'Candles' },
  { id: 'candle_up_stroke', label: 'B&W'     },
  { id: 'candle_stroke',    label: 'Hollow'  },
  { id: 'area',             label: 'Line'    },
];

const KL_CFG = {
  candle_solid:     { bar: { upColor: '#00d4aa', downColor: '#ff4d6d', noChangeColor: '#888', upBorderColor: '#00d4aa', downBorderColor: '#ff4d6d', noChangeBorderColor: '#888', upWickColor: '#00d4aa', downWickColor: '#ff4d6d', noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
  candle_up_stroke: { bar: { upColor: 'transparent', downColor: 'rgba(255,255,255,0.85)', noChangeColor: 'rgba(255,255,255,0.4)', upBorderColor: 'rgba(255,255,255,0.85)', downBorderColor: 'rgba(255,255,255,0.85)', noChangeBorderColor: 'rgba(255,255,255,0.4)', upWickColor: 'rgba(255,255,255,0.55)', downWickColor: 'rgba(255,255,255,0.55)', noChangeWickColor: 'rgba(255,255,255,0.3)' }, vol: [{ upColor: 'rgba(255,255,255,0.18)', downColor: 'rgba(255,255,255,0.09)', noChangeColor: 'rgba(255,255,255,0.12)' }] },
  candle_stroke:    { bar: { upColor: 'transparent', downColor: 'transparent', noChangeColor: 'transparent', upBorderColor: '#00d4aa', downBorderColor: '#ff4d6d', noChangeBorderColor: '#888', upWickColor: '#00d4aa', downWickColor: '#ff4d6d', noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
  area:             { bar: { upColor: '#00d4aa', downColor: '#ff4d6d', noChangeColor: '#888', upBorderColor: '#00d4aa', downBorderColor: '#ff4d6d', noChangeBorderColor: '#888', upWickColor: '#00d4aa', downWickColor: '#ff4d6d', noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
};

const TF_LIST     = ['1', '5', '15', '60', '240', 'D'];
const TF_LABEL    = { '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', 'D': '1D' };
const POP_COINS   = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','TON','PEPE','SUI'];

function Chart({ coin }) {
  const elRef    = useRef(null);
  const chartRef = useRef(null);
  const timerRef = useRef(null);
  const [tf,        setTf]        = useState('60');
  const [chartType, setChartType] = useState('candle_solid');
  const [full,      setFull]      = useState(false);
  const [tick,      setTick]      = useState(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let mounted = true;
    let ro = null;

    const setup = () => {
      if (!mounted) return;
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) { requestAnimationFrame(setup); return; }

      const chart = klInit(el, { styles: KL_STYLES, locale: 'en-US' });
      chartRef.current = chart;
      const pp = coin === 'BTC' ? 1 : ['DOGE','ADA','XRP','PEPE','LINK','TON'].includes(coin) ? 4 : 2;
      chart.setSymbol({ shortName: `${coin}USDT`, pricePrecision: pp, volumePrecision: 4 });
      chart.setPeriod({ multiplier: 1, timespan: 'custom', text: tf });
      chart.setDataLoader({
        getBars: async ({ period, timestamp, callback }) => {
          try {
            let url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${period.text}&limit=1000`;
            if (timestamp) url += `&end=${timestamp - 1}`;
            const r = await fetch(url);
            const d = await r.json();
            const data = (d.result?.list || []).slice().reverse().map(k => ({
              timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
            }));
            callback(data, data.length >= 1000);
          } catch { callback([], false); }
        },
        subscribeBar: ({ period, callback: cb }) => {
          timerRef.current = setInterval(async () => {
            try {
              const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${period.text}&limit=1`);
              const d = await r.json();
              const k = d?.result?.list?.[0];
              if (k) cb({ timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
            } catch {}
          }, 5000);
        },
        unsubscribeBar: () => {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        },
      });
      requestAnimationFrame(() => { try { chart.zoomAtCoordinate?.(-5); } catch {} });
      ro = new ResizeObserver(() => { try { chartRef.current?.resize(); } catch {} });
      ro.observe(el);
    };

    requestAnimationFrame(setup);

    return () => {
      mounted = false;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (ro) ro.disconnect();
      try { klDispose(el); } catch {}
      chartRef.current = null;
    };
  }, [coin, tf]);

  useEffect(() => {
    const go = () => fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${coin}USDT`)
      .then(r => r.json()).then(d => { const x = d?.result?.list?.[0]; if (x) setTick(x); }).catch(() => {});
    go(); const id = setInterval(go, 5000); return () => clearInterval(id);
  }, [coin]);

  function applyChartType(typeId) {
    setChartType(typeId);
    const cfg = KL_CFG[typeId] || KL_CFG.candle_solid;
    try { chartRef.current?.setStyles({ candle: { type: typeId, bar: cfg.bar }, indicator: { bars: cfg.vol } }); } catch {}
  }

  const chg   = tick ? parseFloat(tick.price24hPcnt) * 100 : null;
  const isPos = chg != null && chg >= 0;

  const Btn = ({ on, label, onClick }) => (
    <button onClick={onClick} style={{
      height: '100%', padding: '0 10px',
      background: on ? 'var(--bg-elevated)' : 'transparent',
      border: 'none', cursor: 'pointer',
      color: on ? 'var(--text-primary)' : 'var(--text-muted)',
      fontSize: 11, fontFamily: FF,
      borderBottom: on ? '1px solid var(--text-primary)' : '1px solid transparent',
    }}
    onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'var(--text-secondary)'; }}
    onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'var(--text-muted)'; }}>
      {label}
    </button>
  );

  return (
    <div style={{
      position: full ? 'fixed' : 'relative', inset: full ? 0 : undefined, zIndex: full ? 9999 : undefined,
      height: full ? '100vh' : 520,
      display: 'flex', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* toolbar */}
        <div style={{ height: 40, flexShrink: 0, display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', borderRight: '1px solid var(--border-subtle)' }}>
            <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{coin}/USDT</span>
            {tick && <>
              <span style={{ fontFamily: FM, fontSize: 12, color: 'var(--text-primary)' }}>{tick.lastPrice}</span>
              <span style={{ fontFamily: FM, fontSize: 11, color: isPos ? 'var(--accent-green)' : 'var(--accent-red)' }}>{isPos ? '+' : ''}{chg?.toFixed(2)}%</span>
            </>}
          </div>
          <div style={{ flex: 1 }}/>
          {KL_TYPES.map(ct => <Btn key={ct.id} on={chartType === ct.id} label={ct.label} onClick={() => applyChartType(ct.id)} />)}
          <div style={{ width: 1, background: 'var(--border-subtle)' }}/>
          {TF_LIST.map(t => <Btn key={t} on={tf === t} label={TF_LABEL[t]} onClick={() => setTf(t)} />)}
          <div style={{ width: 1, background: 'var(--border-subtle)' }}/>
          <button onClick={() => setFull(f => !f)} style={{ width: 40, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
            {full ? '⊡' : '⊞'}
          </button>
        </div>

        {/* canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={elRef} style={{ position: 'absolute', inset: 0 }} />
        </div>
      </div>
      <Trades coin={coin}/>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BOTTOM PANEL
══════════════════════════════════════════════════════════════════ */
function Panel({ botTrades, botPositions, pnl30 }) {
  const [tab, setTab] = useState('open');
  const open   = useMemo(() => botTrades.filter(t => !t.closed_at), [botTrades]);
  const closed = useMemo(() => botTrades.filter(t => !!t.closed_at).sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)), [botTrades]);

  const TABS = [
    { id: 'open',      label: 'Open Orders',   n: open.length },
    { id: 'positions', label: 'Positions',     n: botPositions.length },
    { id: 'history',   label: 'Trade History', n: null },
    { id: 'pnl',       label: 'P&L',           n: null },
  ];

  const Th = ({ v, r }) => (
    <th style={{ padding: '6px 14px', fontFamily: FM, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400, textAlign: r ? 'right' : 'left', background: 'var(--bg-base)', position: 'sticky', top: 0, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{v}</th>
  );
  const Td = ({ v, hi, r }) => (
    <td style={{ padding: '7px 14px', fontFamily: FM, fontSize: 11, color: hi || 'var(--text-secondary)', textAlign: r ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{v ?? '—'}</td>
  );
  const Empty = () => (
    <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>EMPTY</div>
  );

  return (
    <div style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* tabs */}
      <div style={{ display: 'flex', height: 40, borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px',
              background: 'transparent', border: 'none',
              borderBottom: on ? '1px solid var(--text-primary)' : '1px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: FF, fontSize: 12,
              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'var(--text-muted)'; }}>
              {t.label}
              {t.n != null && (
                <span style={{ fontFamily: FM, fontSize: 9, color: 'var(--text-muted)', padding: '1px 5px', border: '1px solid var(--border-default)' }}>
                  {t.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* content */}
      <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'auto' }}>
        {tab === 'open' && (open.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Date"/><Th v="Symbol"/><Th v="Side"/><Th v="Size"/><Th v="Entry"/><Th v="Lev"/></tr></thead>
            <tbody>{open.map((t, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Td v={dstr(t.opened_at)}/>
                <Td v={sym(t.symbol)} hi="var(--text-primary)"/>
                <Td v={t.side} hi={t.side === 'Buy' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                <Td v={fix(t.qty, 3)}/><Td v={fix(t.entry_price, 4)}/><Td v={t.leverage ? `${t.leverage}x` : '—'}/>
              </tr>
            ))}</tbody>
          </table>
        )}

        {tab === 'positions' && (botPositions.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Symbol"/><Th v="Side"/><Th v="Size"/><Th v="Entry"/><Th v="Mark"/><Th v="SL"/><Th v="TP"/><Th v="Unrealized" r/></tr></thead>
            <tbody>{botPositions.map((p, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Td v={sym(p.symbol)} hi="var(--text-primary)"/><Td v={p.side} hi={p.side === 'Buy' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                <Td v={fix(p.qty, 3)}/><Td v={fix(p.entry_price, 4)}/><Td v={fix(p.mark_price, 4)}/>
                <Td v={p.sl ? fix(p.sl, 4) : '—'}/><Td v={p.tp ? fix(p.tp, 4) : '—'}/>
                <Td v={`${sign(p.unrealized_pnl ?? 0)} USDT`} hi={pos(p.unrealized_pnl ?? 0) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
              </tr>
            ))}</tbody>
          </table>
        )}

        {tab === 'history' && (closed.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Date"/><Th v="Symbol"/><Th v="Side"/><Th v="Size"/><Th v="Entry"/><Th v="Exit"/><Th v="PnL" r/></tr></thead>
            <tbody>{closed.slice(0, 200).map((t, i) => {
              const p = pnl(t);
              return (
                <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Td v={dstr(t.closed_at)}/><Td v={sym(t.symbol)} hi="var(--text-primary)"/>
                  <Td v={t.side} hi={t.side === 'Buy' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                  <Td v={fix(t.qty, 3)}/><Td v={fix(t.entry_price, 4)}/><Td v={fix(t.close_price, 4)}/>
                  <Td v={`${sign(p)} USDT`} hi={pos(p) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
                </tr>
              );
            })}</tbody>
          </table>
        )}

        {tab === 'pnl' && (pnl30
          ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 0 }}>
            {[
              ['30d PnL',  `${sign(pnl30.total_pnl)} USDT`, pos(pnl30.total_pnl)],
              ['Win Rate', `${pnl30.win_rate}%`,             pnl30.win_rate >= 50],
              ['Trades',   String(pnl30.total_trades),       true],
              ['W / L',    `${pnl30.wins} / ${pnl30.losses}`, true],
            ].map(([l, v, good]) => (
              <div key={l} style={{ padding: '20px 18px', borderRight: '1px solid var(--border-subtle)' }}>
                <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{l}</div>
                <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, color: good ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{v}</div>
              </div>
            ))}
          </div>
          : <Empty />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════════ */
export default function OverviewTab({ botId = 'signal' }) {
  const [pnl30,   setPnl30]   = useState(null);
  const [summary, setSummary] = useState(null);
  const [trades,  setTrades]  = useState([]);
  const [coin,    setCoin]    = useState('BTC');

  useEffect(() => { api('/api/users/closed-pnl?days=30').then(setPnl30).catch(() => {}); }, []);

  const refresh = useCallback(() => {
    Promise.all([api('/api/users/bot-summary'), api('/api/users/trades?limit=500')])
      .then(([s, td]) => { setSummary(s); setTrades(Array.isArray(td) ? td : (td?.trades ?? [])); })
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);

  const positions = summary?.positions ?? [];
  const balance   = summary?.balance;
  const botTrades = useMemo(() => trades.filter(t => (t.source || '') === botId), [trades, botId]);
  const botPos    = useMemo(() => positions.filter(p => (p.source || '') === botId), [positions, botId]);

  const botCoins = useMemo(() => {
    const s = new Set();
    botTrades.forEach(t => { const c = sym(t.symbol); if (c) s.add(c); });
    botPos.forEach(p => { const c = sym(p.symbol); if (c) s.add(c); });
    return [...s].sort();
  }, [botTrades, botPos]);

  const coins = useMemo(() => {
    const extra = POP_COINS.filter(c => !botCoins.includes(c));
    return [...botCoins, ...extra];
  }, [botCoins]);

  useEffect(() => {
    if (botCoins.length > 0 && !botCoins.includes(coin)) setCoin(botCoins[0]);
  }, [botId, botCoins]);

  const stats = useMemo(() => {
    const cl    = botTrades.filter(t => t.closed_at);
    const total = cl.reduce((s, t) => s + pnl(t), 0);
    const wins  = cl.filter(t => pnl(t) > 0).length;
    return { total, wins, n: cl.length, wr: cl.length ? Math.round(wins / cl.length * 100) : 0 };
  }, [botTrades]);

  const openN = botTrades.filter(t => !t.closed_at).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── STATS ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, border: '1px solid var(--border-subtle)' }}>
        {[
          { label: 'Balance',  value: balance ? `$${(+balance.wallet).toFixed(2)}` : '—', sub: balance?.equity ? `equity $${(+balance.equity).toFixed(2)}` : null, good: null },
          { label: 'Open',     value: String(openN), sub: botPos.length ? `${botPos.length} positions` : null, good: null },
          { label: 'Bot PnL',  value: `${sign(stats.total)} USDT`, sub: `${stats.n} closed trades`, good: stats.n > 0 ? pos(stats.total) : null },
          { label: 'Win Rate', value: `${stats.wr}%`, sub: `${stats.wins}W / ${stats.n - stats.wins}L`, good: stats.n > 0 ? stats.wr >= 50 : null },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: '20px 20px', borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
            <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: s.good === null ? 'var(--text-primary)' : s.good ? 'var(--accent-green)' : 'var(--accent-red)' }}>{s.value}</div>
            {s.sub && <div style={{ fontFamily: FF, fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── COINS ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 8 }}>Pair</span>
        {coins.map(c => {
          const on = coin === c;
          const isBot = botCoins.includes(c);
          const hp    = botPos.some(p => sym(p.symbol) === c);
          return (
            <button key={c} onClick={() => setCoin(c)} style={{
              fontFamily: FM, fontSize: 11, padding: '4px 10px',
              background: on ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${on ? 'var(--border-strong)' : isBot ? 'rgba(0,212,170,0.3)' : 'var(--border-default)'}`,
              color: on ? 'var(--text-primary)' : isBot ? 'var(--accent-green)' : 'var(--text-muted)',
              cursor: 'pointer', position: 'relative',
            }}
            onMouseEnter={e => { if (!on) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; } }}
            onMouseLeave={e => { if (!on) { e.currentTarget.style.color = isBot ? 'var(--accent-green)' : 'var(--text-muted)'; e.currentTarget.style.borderColor = isBot ? 'rgba(0,212,170,0.3)' : 'var(--border-default)'; } }}>
              {c}
              {hp && <span style={{ position: 'absolute', top: 2, right: 2, width: 3, height: 3, borderRadius: '50%', background: 'var(--accent-green)' }}/>}
            </button>
          );
        })}
      </div>

      {/* ── CHART ─────────────────────────────────────────────── */}
      <Chart coin={coin} />

      {/* ── PANEL ─────────────────────────────────────────────── */}
      <Panel botTrades={botTrades} botPositions={botPos} pnl30={pnl30}/>
    </div>
  );
}
