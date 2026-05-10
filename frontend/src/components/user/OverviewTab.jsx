import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';

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
const sec  = s => s ? Math.floor(new Date(s).getTime() / 1000) : null;
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
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>Price</span>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>Qty</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {rows.map((r, i) => (
          <div key={r.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '2px 12px', gap: 8 }}>
            <span style={{ fontFamily: FM, fontSize: 10, color: r.buy ? '#fff' : 'rgba(255,255,255,0.35)' }}>{r.p}</span>
            <span style={{ fontFamily: FM, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{(+r.q).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   CHART
══════════════════════════════════════════════════════════════════ */
function Chart({ coin, botTrades, botPositions }) {
  const wrap = useRef(null);
  const C    = useRef(null);
  const S    = useRef(null);
  const PL   = useRef([]);

  const [tf,   setTf]   = useState('60');
  const [type, setType] = useState('Candles');
  const [full, setFull] = useState(false);
  const [tick, setTick] = useState(null);

  const TFS   = ['1', '5', '15', '60', '240', 'D'];
  const TFLBL = { '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', 'D': '1D' };

  const markers = useMemo(() => {
    const out = [];
    botTrades.filter(t => sym(t.symbol) === coin && t.opened_at).forEach(t => {
      const et = sec(t.opened_at);
      if (et) out.push({ time: et, position: t.side === 'Buy' ? 'belowBar' : 'aboveBar', color: '#fff', shape: t.side === 'Buy' ? 'arrowUp' : 'arrowDown', size: 1 });
      if (t.closed_at) {
        const ct = sec(t.closed_at), p = pnl(t);
        if (ct) out.push({ time: ct, position: t.side === 'Buy' ? 'aboveBar' : 'belowBar', color: pos(p) ? '#fff' : 'rgba(255,255,255,0.4)', shape: 'circle', text: sign(p, 1), size: 0.8 });
      }
    });
    return out.sort((a, b) => a.time - b.time);
  }, [botTrades, coin]);

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth, height: el.clientHeight,
      layout: { background: { color: '#050505' }, textColor: 'rgba(240,242,245,0.3)' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(255,255,255,0.2)' }, horzLine: { color: 'rgba(255,255,255,0.2)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
    });
    C.current = chart;

    let series;
    if (type === 'Candles') {
      series = chart.addCandlestickSeries({ upColor: '#fff', downColor: 'transparent', borderUpColor: '#fff', borderDownColor: 'rgba(255,255,255,0.4)', wickUpColor: '#fff', wickDownColor: 'rgba(255,255,255,0.4)' });
    } else if (type === 'Line') {
      series = chart.addLineSeries({ color: '#fff', lineWidth: 1 });
    } else {
      series = chart.addAreaSeries({ lineColor: '#fff', topColor: 'rgba(255,255,255,0.06)', bottomColor: 'transparent', lineWidth: 1 });
    }
    S.current = series;

    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${tf}&limit=300`);
        const j = await r.json();
        if (!alive || !j.result?.list) return;
        const raw = j.result.list.slice().reverse();
        if (type === 'Candles') series.setData(raw.map(k => ({ time: Math.floor(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4] })));
        else series.setData(raw.map(k => ({ time: Math.floor(+k[0] / 1000), value: +k[4] })));
        vol.setData(raw.map(k => ({ time: Math.floor(+k[0] / 1000), value: +k[5], color: +k[4] >= +k[1] ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)' })));
        chart.timeScale().fitContent();
      } catch {}
    };
    load();
    const timer = setInterval(load, 15000);
    const ro = new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => { alive = false; clearInterval(timer); ro.disconnect(); chart.remove(); C.current = null; S.current = null; };
  }, [coin, tf, type]);

  useEffect(() => {
    const s = S.current; if (!s) return;
    if (type === 'Candles') { try { s.setMarkers(markers); } catch {} }
    PL.current.forEach(pl => { try { s.removePriceLine(pl); } catch {} });
    PL.current = [];
    botPositions.filter(p => sym(p.symbol) === coin).forEach(p => {
      const add = (price, color, title, style = LineStyle.Dashed) => {
        if (!price || isNaN(+price)) return;
        try { PL.current.push(s.createPriceLine({ price: +price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })); } catch {}
      };
      add(p.entry_price, 'rgba(255,255,255,0.4)', 'Entry', LineStyle.Solid);
      add(p.sl, 'rgba(255,255,255,0.25)', 'SL');
      add(p.tp, '#fff', 'TP');
      add(p.liq_price, 'rgba(255,255,255,0.15)', 'Liq', LineStyle.Dotted);
    });
  }, [markers, botPositions, coin, type]);

  useEffect(() => {
    const go = () => fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${coin}USDT`)
      .then(r => r.json()).then(d => { const x = d?.result?.list?.[0]; if (x) setTick(x); }).catch(() => {});
    go(); const id = setInterval(go, 5000); return () => clearInterval(id);
  }, [coin]);

  const chg = tick ? parseFloat(tick.price24hPcnt) * 100 : null;

  const Btn = ({ on, label, onClick }) => (
    <button onClick={onClick} style={{
      height: '100%', padding: '0 10px', background: on ? 'rgba(255,255,255,0.08)' : 'transparent',
      border: 'none', cursor: 'pointer',
      color: on ? '#fff' : 'rgba(255,255,255,0.3)',
      fontSize: 11, fontFamily: FF,
      borderBottom: on ? '1px solid #fff' : '1px solid transparent',
    }}
    onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
    onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
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
            <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 600, color: '#fff' }}>{coin}/USDT</span>
            {tick && <>
              <span style={{ fontFamily: FM, fontSize: 12, color: pos(chg) ? '#fff' : 'rgba(255,255,255,0.5)' }}>{tick.lastPrice}</span>
              <span style={{ fontFamily: FM, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{chg >= 0 ? '+' : ''}{chg?.toFixed(2)}%</span>
            </>}
          </div>
          <div style={{ flex: 1 }}/>
          {['Candles', 'Line', 'Area'].map(t => <Btn key={t} on={type === t} label={t} onClick={() => setType(t)} />)}
          <div style={{ width: 1, background: 'var(--border-subtle)' }}/>
          {TFS.map(t => <Btn key={t} on={tf === t} label={TFLBL[t]} onClick={() => setTf(t)} />)}
          <div style={{ width: 1, background: 'var(--border-subtle)' }}/>
          <button onClick={() => setFull(f => !f)} style={{ width: 40, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.25)'}>
            {full ? '⊡' : '⊞'}
          </button>
        </div>

        <div ref={wrap} style={{ flex: 1, minHeight: 0 }}/>
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
    <td style={{ padding: '7px 14px', fontFamily: FM, fontSize: 11, color: hi || 'rgba(255,255,255,0.4)', textAlign: r ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{v ?? '—'}</td>
  );
  const Empty = () => (
    <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.15)' }}>EMPTY</div>
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
              borderBottom: on ? '1px solid #fff' : '1px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: FF, fontSize: 12,
              color: on ? '#fff' : 'rgba(255,255,255,0.3)',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
              {t.label}
              {t.n != null && (
                <span style={{ fontFamily: FM, fontSize: 9, color: 'rgba(255,255,255,0.25)', padding: '1px 5px', border: '1px solid rgba(255,255,255,0.1)' }}>
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
                <Td v={sym(t.symbol)} hi="#fff"/>
                <Td v={t.side} hi={t.side === 'Buy' ? '#fff' : 'rgba(255,255,255,0.45)'}/>
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
                <Td v={sym(p.symbol)} hi="#fff"/><Td v={p.side} hi={p.side === 'Buy' ? '#fff' : 'rgba(255,255,255,0.45)'}/>
                <Td v={fix(p.qty, 3)}/><Td v={fix(p.entry_price, 4)}/><Td v={fix(p.mark_price, 4)}/>
                <Td v={p.sl ? fix(p.sl, 4) : '—'}/><Td v={p.tp ? fix(p.tp, 4) : '—'}/>
                <Td v={`${sign(p.unrealized_pnl ?? 0)} USDT`} hi={pos(p.unrealized_pnl ?? 0) ? '#fff' : 'rgba(255,255,255,0.4)'} r/>
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
                  <Td v={dstr(t.closed_at)}/><Td v={sym(t.symbol)} hi="#fff"/>
                  <Td v={t.side} hi={t.side === 'Buy' ? '#fff' : 'rgba(255,255,255,0.45)'}/>
                  <Td v={fix(t.qty, 3)}/><Td v={fix(t.entry_price, 4)}/><Td v={fix(t.close_price, 4)}/>
                  <Td v={`${sign(p)} USDT`} hi={pos(p) ? '#fff' : 'rgba(255,255,255,0.4)'} r/>
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
                <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 10 }}>{l}</div>
                <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, color: good ? '#fff' : 'rgba(255,255,255,0.4)' }}>{v}</div>
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

  const positions   = summary?.positions ?? [];
  const balance     = summary?.balance;
  const botTrades   = useMemo(() => trades.filter(t => (t.source || '') === botId), [trades, botId]);
  const botPos      = useMemo(() => positions.filter(p => (p.source || '') === botId), [positions, botId]);

  const coins = useMemo(() => {
    const s = new Set();
    botTrades.forEach(t => { const c = sym(t.symbol); if (c) s.add(c); });
    botPos.forEach(p => { const c = sym(p.symbol); if (c) s.add(c); });
    return [...s].sort().slice(0, 16);
  }, [botTrades, botPos]);

  useEffect(() => { if (coins.length > 0 && !coins.includes(coin)) setCoin(coins[0]); }, [botId, coins]);

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
          { label: 'Balance',     value: balance ? `$${(+balance.wallet).toFixed(2)}` : '—', sub: balance?.equity ? `equity $${(+balance.equity).toFixed(2)}` : null, good: null },
          { label: 'Open',        value: String(openN),   sub: botPos.length ? `${botPos.length} positions` : null, good: null },
          { label: 'Bot PnL',     value: `${sign(stats.total)} USDT`, sub: `${stats.n} closed trades`, good: stats.n > 0 ? pos(stats.total) : null },
          { label: 'Win Rate',    value: `${stats.wr}%`, sub: `${stats.wins}W / ${stats.n - stats.wins}L`,  good: stats.n > 0 ? stats.wr >= 50 : null },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: '20px 20px', borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
            <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: s.good === null ? '#fff' : s.good ? '#fff' : 'rgba(255,255,255,0.4)' }}>{s.value}</div>
            {s.sub && <div style={{ fontFamily: FF, fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── COINS ─────────────────────────────────────────────── */}
      {coins.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginRight: 8 }}>Pair</span>
          {coins.map(c => {
            const on = coin === c;
            const hp = botPos.some(p => sym(p.symbol) === c);
            return (
              <button key={c} onClick={() => setCoin(c)} style={{
                fontFamily: FM, fontSize: 11, padding: '4px 10px',
                background: on ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: `1px solid ${on ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: on ? '#fff' : 'rgba(255,255,255,0.35)',
                cursor: 'pointer', position: 'relative',
              }}
              onMouseEnter={e => { if (!on) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; } }}
              onMouseLeave={e => { if (!on) { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; } }}>
                {c}
                {hp && <span style={{ position: 'absolute', top: 2, right: 2, width: 3, height: 3, borderRadius: '50%', background: '#fff' }}/>}
              </button>
            );
          })}
        </div>
      )}

      {/* ── CHART ─────────────────────────────────────────────── */}
      <Chart coin={coin} botTrades={botTrades} botPositions={botPos}/>

      {/* ── PANEL ─────────────────────────────────────────────── */}
      <Panel botTrades={botTrades} botPositions={botPos} pnl30={pnl30}/>
    </div>
  );
}
