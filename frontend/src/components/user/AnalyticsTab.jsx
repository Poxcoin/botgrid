import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLang } from '@/lib/LangContext';
import {
  MONO, FONT, BOT_LABELS, LOCALE_MAP, shortDay,
  getToken, pct, exportTradesCSV,
  StatCard, HeroSparkline, SectionLabel, Skeleton,
} from './analytics/atoms';
import { DataTable, TradeRow, CoinGrid } from './analytics/tables';

import { DailyChart, DayOfWeekChart, HourOfDayChart, CalendarHeatmap, EquityCurve } from './analytics/charts';


const PAGE_SIZE = 50;

const PNL_LOC = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };
const shortMonth = (monthIdx, locale) =>
  new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2000, monthIdx, 1));

export default function AnalyticsTab() {
  const { t, lang } = useLang();
  // Single source of truth for trade-derived metrics is /api/users/closed-pnl.
  // /api/users/me gives hasKey, /api/users/balance gives wallet/equity/free.
  // /api/users/pnl drives the monthly grouping table below the charts.
  const [hasKey, setHasKey] = useState(null); // null = loading, bool = known
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allTrades, setAllTrades] = useState([]);
  const [tradePage, setTradePage] = useState(1);
  const [allDays,   setAllDays]   = useState(0);
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeSide,   setTradeSide]   = useState('ALL');
  const [coinView,    setCoinView]    = useState('cards');
  const [coinSort,    setCoinSort]    = useState('pnl');
  const [coinSortAsc, setCoinSortAsc] = useState(false);
  const [botSort,     setBotSort]     = useState('pnl');
  const [botSortAsc,  setBotSortAsc]  = useState(false);
  const [tradeSource, setTradeSource] = useState('ALL');
  const [pnlRows,     setPnlRows]     = useState([]);
  const [hovBar,      setHovBar]      = useState(null);

  const fetchStatic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [meRes, balanceRes, pnlRes] = await Promise.all([
        fetch('/api/users/me',      { headers }),
        fetch('/api/users/balance', { headers }),
        fetch('/api/users/pnl',     { headers }),
      ]);
      if (!meRes.ok) throw new Error(`HTTP ${meRes.status}`);
      const me = await meRes.json();
      setHasKey(!!me.has_api_keys);
      if (balanceRes.ok) setBalance(await balanceRes.json());
      if (pnlRes.ok) { const d = await pnlRes.json(); setPnlRows(Array.isArray(d) ? d : []); }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrades = useCallback(async (days) => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    try {
      const res = await fetch(`/api/users/closed-pnl?days=${days}`, { headers });
      if (res.ok) { const j = await res.json(); setAllTrades(j.trades || []); }
    } catch {}
  }, []);

  useEffect(() => { fetchStatic(); fetchTrades(allDays); }, [fetchStatic, fetchTrades]);
  useEffect(() => { fetchTrades(allDays); }, [allDays, fetchTrades]);

  // All stats computed from allTrades so they respond to the period selector
  // NOTE: must be before any early returns (loading/error/noData) to keep hook count stable
  // Equity series for hero sparkline — declared BEFORE any early return to keep hook order stable
  const equitySeries = useMemo(() => {
    if (!allTrades.length) return [];
    const sorted = [...allTrades].sort((a, b) => parseInt(a.closed_at) - parseInt(b.closed_at));
    let cum = 0;
    return sorted.map(tr => { cum += parseFloat(tr.pnl ?? 0); return cum; });
  }, [allTrades]);

  const periodStats = useMemo(() => {
    if (!allTrades.length) return {
      totalPnl: 0, wins: 0, losses: 0, winRate: '—',
      avgTrade: null, streak: 0, streakDir: null, profitFactor: null, maxDrawdown: null, avgDuration: null,
      bestDay: null, worstDay: null,
      byCoin: [], bySource: [], best: [], worst: [], dailyPnl: [],
    };

    const sorted = [...allTrades].sort((a, b) => parseInt(a.closed_at) - parseInt(b.closed_at));
    let totalPnl = 0, wins = 0;
    let totalWin = 0, totalLoss = 0, peak = 0, equity = 0, maxDD = 0;
    let durSum = 0, durCount = 0;
    const coinMap = {}, srcMap = {};

    for (const t of sorted) {
      const p = parseFloat(t.pnl ?? 0);
      totalPnl += p;
      if (p > 0) wins += 1;

      // coin aggregation
      const c = t.symbol || '';
      if (!coinMap[c]) coinMap[c] = { coin: c, trades: 0, pnl: 0, wins: 0, win_pnls: [], loss_pnls: [] };
      coinMap[c].trades += 1; coinMap[c].pnl += p;
      if (p > 0) { coinMap[c].wins += 1; coinMap[c].win_pnls.push(p); } else { coinMap[c].loss_pnls.push(p); }

      // source aggregation (merge news+signal → Signal Bot)
      const src = t.source || 'other';
      const lbl = BOT_LABELS[src] || src;
      if (!srcMap[lbl]) srcMap[lbl] = { source: src, label: lbl, trades: 0, pnl: 0, wins: 0, win_pnls: [], loss_pnls: [] };
      srcMap[lbl].trades += 1; srcMap[lbl].pnl += p;
      if (p > 0) { srcMap[lbl].wins += 1; srcMap[lbl].win_pnls.push(p); } else { srcMap[lbl].loss_pnls.push(p); }

      // advanced metrics
      if (p > 0) totalWin += p; else totalLoss += Math.abs(p);
      equity += p;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
      const o = parseInt(t.opened_at), cl = parseInt(t.closed_at);
      if (o && cl && cl > o) { durSum += (cl - o) / 60000; durCount++; }
    }

    // streak
    let count = 0, dir = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const w = parseFloat(sorted[i].pnl ?? 0) > 0;
      if (dir === null) { dir = w; count = 1; } else if (dir === w) count++; else break;
    }

    const agg = map => Object.values(map).map(v => ({
      ...v, pnl: parseFloat(v.pnl.toFixed(2)),
      avg_win:  v.win_pnls.length  ? parseFloat((v.win_pnls.reduce((s, x) => s + x, 0)  / v.win_pnls.length).toFixed(2))  : 0,
      avg_loss: v.loss_pnls.length ? parseFloat((v.loss_pnls.reduce((s, x) => s + x, 0) / v.loss_pnls.length).toFixed(2)) : 0,
    })).sort((a, b) => b.pnl - a.pnl);

    const byDate = [...allTrades].sort((a, b) => parseFloat(b.pnl ?? 0) - parseFloat(a.pnl ?? 0));
    const losses = allTrades.length - wins;

    // daily PnL — group by calendar date (period-aware: feeds chart + best/worst day stat)
    const dayMap = {};
    for (const t of sorted) {
      const ms = parseInt(t.closed_at);
      if (!ms) continue;
      const d = new Date(ms).toISOString().slice(0, 10);
      if (!dayMap[d]) dayMap[d] = { pnl: 0, trades: 0 };
      dayMap[d].pnl += parseFloat(t.pnl ?? 0);
      dayMap[d].trades += 1;
    }
    const entries = Object.entries(dayMap);
    const dailyPnl = entries.map(([date, v]) => ({ date, pnl: parseFloat(v.pnl.toFixed(2)), trades: v.trades })).sort((a, b) => a.date.localeCompare(b.date));
    const bestDayEntry  = entries.length ? entries.reduce((a, b) => (b[1].pnl > a[1].pnl ? b : a), [null, { pnl: -Infinity }]) : [null, null];
    const worstDayEntry = entries.length ? entries.reduce((a, b) => (b[1].pnl < a[1].pnl ? b : a), [null, { pnl:  Infinity }]) : [null, null];
    const bestDay  = bestDayEntry[0]  ? { date: bestDayEntry[0],  pnl: parseFloat(bestDayEntry[1].pnl.toFixed(2))  } : null;
    const worstDay = worstDayEntry[0] ? { date: worstDayEntry[0], pnl: parseFloat(worstDayEntry[1].pnl.toFixed(2)) } : null;

    return {
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      wins, losses,
      winRate: allTrades.length ? pct(wins, allTrades.length) : '—',
      avgTrade: totalPnl / allTrades.length,
      streak: count, streakDir: dir,
      profitFactor: totalLoss > 0 ? +(totalWin / totalLoss).toFixed(2) : null,
      maxDrawdown: maxDD > 0 ? +maxDD.toFixed(2) : null,
      avgDuration: durCount > 0 ? Math.round(durSum / durCount) : null,
      bestDay, worstDay, dailyPnl,
      byCoin: agg(coinMap),
      bySource: agg(srcMap),
      best:  byDate.slice(0, 5).map(t => ({ coin: t.symbol, pnl: parseFloat(t.pnl ?? 0), closed_at: t.closed_at, side: t.side, source: t.source, duration_min: (() => { const o = parseInt(t.opened_at), c = parseInt(t.closed_at); return (o && c && c > o) ? Math.round((c - o) / 60000) : null; })() })),
      worst: byDate.slice(-5).reverse().map(t => ({ coin: t.symbol, pnl: parseFloat(t.pnl ?? 0), closed_at: t.closed_at, side: t.side, source: t.source, duration_min: (() => { const o = parseInt(t.opened_at), c = parseInt(t.closed_at); return (o && c && c > o) ? Math.round((c - o) / 60000) : null; })() })),
    };
  }, [allTrades]);

  if (loading) {
    return (
      <div>
        <style>{`@keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
        <div style={{ display: 'flex', gap: 1, marginBottom: 1, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, minWidth: 140, background: 'var(--bg-base)', padding: '28px 24px' }}>
              <Skeleton w={60} h={9} />
              <div style={{ marginTop: 14 }}><Skeleton w={100} h={26} /></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 1 }}><Skeleton h={200} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', padding: '40px 0' }}>
        <div style={{ marginBottom: 12, letterSpacing: '0.08em' }}>{t.dashboard.analytics.errorPrefix} {error}</div>
        <button onClick={() => fetchData(allDays)} style={{
          background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '7px 16px', cursor: 'pointer',
        }}>
          {t.dashboard.analytics.retry}
        </button>
      </div>
    );
  }

  // Empty/sparse states: instead of replacing the whole page with a centered
  // CTA, keep the hero rendered (showing — placeholders) and surface the CTA
  // inside the unified INFO banner below the hero.
  const { totalPnl, winRate, avgTrade, streak, streakDir, profitFactor, maxDrawdown, avgDuration, bestDay, worstDay, dailyPnl } = periodStats;
  const mergedBySource = periodStats.bySource;

  const botCols = [
    { key: 'source', label: t.dashboard.analytics.hSource, bold: true, render: r => r.label || r.source },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${parseFloat(r.pnl).toFixed(2)}` },
    { key: 'avg_win', label: t.dashboard.analytics.hAvgWin, align: 'right', render: r => r.avg_win > 0 ? `+${parseFloat(r.avg_win).toFixed(2)}` : parseFloat(r.avg_win).toFixed(2) },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right', muted: true, render: r => parseFloat(r.avg_loss || 0).toFixed(2) },
    { key: '_rr', label: 'R:R', align: 'right', muted: true, render: r => r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss)).toFixed(2) : '—' },
  ];

  const coinCols = [
    { key: 'coin', label: t.dashboard.analytics.hCoin, bold: true },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${parseFloat(r.pnl).toFixed(2)}` },
    { key: 'avg_win', label: t.dashboard.analytics.hAvgWin, align: 'right', render: r => r.avg_win > 0 ? `+${parseFloat(r.avg_win).toFixed(2)}` : '—' },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right', muted: true, render: r => r.avg_loss < 0 ? parseFloat(r.avg_loss).toFixed(2) : '—' },
    { key: '_rr', label: 'R:R', align: 'right', muted: true, render: r => r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss)).toFixed(2) : '—' },
  ];

  const fmtDuration = r => {
    const o = parseInt(r.opened_at), c = parseInt(r.closed_at);
    if (!o || !c || c <= o) return '—';
    const m = Math.round((c - o) / 60000);
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${Math.floor(m / 1440)}d`;
  };

  const allTradesCols = [
    { key: 'date', label: t.dashboard.hDate, muted: true, render: r => { const ms = parseInt(r.closed_at); const loc = { en:'en-US',es:'es-ES',uk:'uk-UA',ru:'ru-RU',de:'de-DE',zh:'zh-CN' }[lang]||'en-US'; return ms ? new Date(ms).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'; } },
    { key: 'symbol', label: t.dashboard.hSymbol, bold: true, render: r => r.symbol || '—' },
    { key: 'side', label: t.dashboard.hSide, render: r => <span style={{ color: r.side === 'LONG' ? 'var(--accent-green)' : r.side === 'SHORT' ? 'var(--accent-red)' : 'var(--text-muted)' }}>{r.side || '—'}</span> },
    { key: 'entry_price', label: t.dashboard.hEntry, render: r => r.entry_price ? (+r.entry_price).toFixed(4) : '—' },
    { key: 'exit_price', label: t.dashboard.hExit, render: r => r.exit_price ? (+r.exit_price).toFixed(4) : '—' },
    { key: 'qty', label: t.dashboard.hQty, muted: true, render: r => r.qty ? (+r.qty).toFixed(3) : '—' },
    { key: '_dur', label: t.dashboard.hDur, muted: true, render: fmtDuration },
    { key: 'source', label: t.dashboard.hSource, muted: true, render: r => BOT_LABELS[r.source] || r.source || '—' },
    { key: 'pnl', label: t.dashboard.hPnL, align: 'right', bold: true, render: r => `${(r.pnl ?? 0) >= 0 ? '+' : ''}${(r.pnl ?? 0).toFixed(2)}` },
  ];

  const sign = v => (v >= 0 ? '+' : '') + parseFloat(v ?? 0).toFixed(2);
  const upnl = balance?.unrealized_pnl ?? 0;

  const sparseHint = allTrades.length > 0 && allTrades.length < 5
    ? t.dashboard.analytics?.sparseHint ?? `Поки що ${allTrades.length} закритих торгів. Деякі графіки з'являться, коли набереться більше історії (5+ трейдів).`
    : null;
  const emptyHint = allTrades.length === 0
    ? (hasKey
        ? (t.dashboard.analytics?.noTradesDesc ?? 'API-ключ підключено. Аналітика з\'явиться, коли бот виконає угоди на вашому рахунку.')
        : (t.dashboard.analytics?.noKeyDesc ?? 'Підключіть API-ключ Bybit щоб побачити вашу аналітику — баланс, PnL, історію торгів і деталі по монетах.'))
    : null;
  const showAddKeyCta = allTrades.length === 0 && !hasKey;

  const heroIsPos = totalPnl >= 0;

  return (
    <div style={{ color: 'var(--text-primary)', fontFamily: FONT }}>
      <style>{`
        @keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }
        @keyframes kado-fadeup { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
        .kado-fadeup { animation: kado-fadeup 380ms cubic-bezier(.2,.6,.2,1) both; }
        .kado-fadeup-1 { animation-delay: 40ms; }
        .kado-fadeup-2 { animation-delay: 90ms; }
        .kado-fadeup-3 { animation-delay: 140ms; }
      `}</style>

      {/* ── HERO: big PnL + sparkline + 3 KPI side rail ── */}
      <div className="kado-fadeup" style={{
        position: 'relative',
        border: '1px solid var(--border-subtle)',
        background: heroIsPos
          ? 'radial-gradient(120% 100% at 0% 0%, rgba(14,203,129,0.10) 0%, transparent 55%), var(--bg-elevated)'
          : totalPnl < 0
            ? 'radial-gradient(120% 100% at 0% 0%, rgba(246,70,93,0.08) 0%, transparent 55%), var(--bg-elevated)'
            : 'var(--bg-elevated)',
        marginBottom: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        overflow: 'hidden',
      }}>
        {/* Left: big PnL block */}
        <div style={{ padding: '34px 36px 28px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 22 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: heroIsPos ? 'var(--accent-green)' : totalPnl < 0 ? 'var(--accent-red)' : 'var(--text-muted)', boxShadow: heroIsPos ? '0 0 12px var(--accent-green)' : totalPnl < 0 ? '0 0 12px var(--accent-red)' : 'none' }} />
              {t.dashboard.analytics.totalPnl}
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>
                {allTrades.length} {t.dashboard.analytics.tradesLbl}
              </span>
            </div>
            <div style={{
              fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1,
              fontSize: 'clamp(40px, 6vw, 64px)',
              color: heroIsPos ? 'var(--accent-green)' : totalPnl < 0 ? 'var(--accent-red)' : 'var(--text-primary)',
              textShadow: heroIsPos ? '0 0 40px rgba(14,203,129,0.30)' : totalPnl < 0 ? '0 0 40px rgba(246,70,93,0.20)' : 'none',
              display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
            }}>
              <span>{totalPnl > 0 ? '+' : ''}{totalPnl.toFixed(2)}</span>
              <span style={{ fontSize: '0.42em', letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500 }}>USDT</span>
            </div>
          </div>
          {equitySeries.length >= 2 && (
            <div style={{ marginTop: 6 }}>
              <HeroSparkline equity={equitySeries} isPos={heroIsPos} />
            </div>
          )}
        </div>

        {/* Right: 3 supporting KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-subtle)' }}>
          {[
            { label: t.dashboard.analytics.winRate, value: winRate, accent: winRate !== '—' ? (totalPnl > 0 ? 'pos' : 'neg') : null, sub: `${periodStats.wins}W · ${periodStats.losses}L` },
            { label: t.dashboard.analytics.profitFactor, value: profitFactor == null ? '—' : `${profitFactor}×`, accent: profitFactor == null ? null : (profitFactor >= 1 ? 'pos' : 'neg'), sub: t.dashboard.analytics.grossPerLoss },
            { label: t.dashboard.analytics.maxDrawdown, value: maxDrawdown == null ? '—' : `−${maxDrawdown}`, accent: maxDrawdown == null ? null : 'neg', sub: t.dashboard.analytics.fromPeak },
          ].map((k, i, arr) => {
            const col = k.accent === 'pos' ? 'var(--accent-green)' : k.accent === 'neg' ? 'var(--accent-red)' : 'var(--text-primary)';
            return (
              <div key={k.label} style={{
                flex: 1, padding: '18px 26px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                  {k.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: col }}>
                    {k.value}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    {k.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(emptyHint || sparseHint) && (
        <div className="kado-fadeup kado-fadeup-1" style={{
          padding: '14px 18px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderLeft: `2px solid ${emptyHint ? 'var(--accent-amber)' : 'var(--text-muted)'}`,
          marginTop: 1, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: emptyHint ? 'var(--accent-amber)' : 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>INFO</span>
          <span style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--text-secondary, var(--text-muted))', lineHeight: 1.6, flex: 1, minWidth: 240 }}>
            {emptyHint || sparseHint}
          </span>
          {showAddKeyCta && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
              style={{
                background: 'var(--text-primary)', color: 'var(--bg-base)',
                border: 'none', padding: '8px 18px',
                fontFamily: MONO, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'opacity 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {t.dashboard.analytics?.noKeyBtn ?? 'ADD API KEY →'}
            </button>
          )}
        </div>
      )}

      {/* ── Balance bar — compact horizontal bar with subtle gradient ── */}
      {balance && (
        <div className="kado-fadeup kado-fadeup-1" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          marginTop: 1, marginBottom: 24,
          border: '1px solid var(--border-subtle)',
          background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-base) 100%)',
        }}>
          {[
            { label: t.dashboard.analytics.bWallet,     value: `$${parseFloat(balance.usdt_wallet ?? 0).toFixed(2)}`, color: null },
            { label: t.dashboard.analytics.bEquity,     value: `$${parseFloat(balance.usdt_equity ?? 0).toFixed(2)}`, color: null },
            { label: t.dashboard.analytics.bUnrealized, value: `${sign(upnl)} USDT`,  color: upnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
            { label: t.dashboard.analytics.bAvailable,  value: `$${parseFloat(balance.usdt_free ?? 0).toFixed(2)}`, color: null },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              padding: '16px 22px',
              borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: s.color || 'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Secondary metrics grid ── */}
      <div className="kado-fadeup kado-fadeup-2" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        marginBottom: 36,
      }}>
        <StatCard
          label={t.dashboard.analytics.totalTrades}
          value={allTrades.length}
          sub={`${periodStats.wins}W · ${periodStats.losses}L`}
          accent={periodStats.wins > periodStats.losses ? 'pos' : periodStats.losses > periodStats.wins ? 'neg' : 'neutral'}
        />
        {bestDay && (
          <StatCard
            label={t.dashboard.analytics.bestDay}
            value={<span style={{ color: bestDay.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{`${bestDay.pnl >= 0 ? '+' : ''}${parseFloat(bestDay.pnl).toFixed(2)}`}</span>}
            sub={bestDay.date}
            accent={bestDay.pnl >= 0 ? 'pos' : 'neg'}
          />
        )}
        {worstDay && (
          <StatCard
            label={t.dashboard.analytics.worstDay}
            value={<span style={{ color: worstDay.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{`${worstDay.pnl >= 0 ? '+' : ''}${parseFloat(worstDay.pnl).toFixed(2)}`}</span>}
            sub={worstDay.date}
            accent={worstDay.pnl >= 0 ? 'pos' : 'neg'}
          />
        )}
        {avgTrade != null && (
          <StatCard
            label={t.dashboard.analytics.avgTrade}
            value={<span style={{ color: avgTrade >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{`${avgTrade >= 0 ? '+' : ''}${avgTrade.toFixed(2)}`}</span>}
            sub="USDT"
            accent={avgTrade >= 0 ? 'pos' : 'neg'}
          />
        )}
        {streak > 0 && (
          <StatCard
            label={t.dashboard.analytics.currentStreak}
            value={<span style={{ color: streakDir ? 'var(--accent-green)' : 'var(--accent-red)' }}>{streak}×</span>}
            sub={streakDir ? t.dashboard.analytics.winning : t.dashboard.analytics.losing}
            accent={streakDir ? 'pos' : 'neg'}
          />
        )}
        {avgDuration != null && (
          <StatCard
            label={t.dashboard.analytics.avgDuration}
            value={avgDuration < 60 ? `${avgDuration}m` : avgDuration < 1440 ? `${Math.floor(avgDuration / 60)}h ${avgDuration % 60}m` : `${Math.floor(avgDuration / 1440)}d`}
            sub={t.dashboard.analytics.perTrade}
            accent="neutral"
          />
        )}
      </div>

      {/* Period selector for trade-based charts */}
      {allTrades.length >= 2 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {[{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }, { label: t.dashboard.analytics.all, days: 0 }].map(p => (
            <button key={p.days} onClick={() => { setAllDays(p.days); setTradePage(1); }}
              style={{
                background: 'none', border: `1px solid ${allDays === p.days ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                color: allDays === p.days ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: MONO, fontSize: 11, padding: '5px 14px', cursor: 'pointer',
                letterSpacing: '0.08em', transition: 'border-color 150ms, color 150ms',
              }}>
              {p.label}
            </button>
          ))}
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 6 }}>
            {allTrades.length} {t.dashboard.analytics.tradesLbl}
          </span>
        </div>
      )}

      {/* Daily PnL chart — period-aware */}
      {dailyPnl.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.dailyPnl} right={allDays === 0 ? t.dashboard.analytics.allTime : `${t.dashboard.analytics.lastDays} ${allDays}d`} />
          <DailyChart daily={dailyPnl} t={t} />
        </div>
      )}

      {/* Trading calendar heatmap — all-time only; filtered periods leave most cells empty */}
      {allDays === 0 && dailyPnl.length >= 7 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.calendarHeatmap} right={t.dashboard.analytics.allTime} />
          <CalendarHeatmap dailyPnl={dailyPnl} />
        </div>
      )}

      {/* Equity curve */}
      {allTrades.length >= 2 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.equityCurve} right={allDays === 0 ? t.dashboard.analytics.allTime : `${t.dashboard.analytics.lastDays} ${allDays}d`} />
          <EquityCurve trades={allTrades} />
        </div>
      )}

      {/* Day of week breakdown */}
      {allTrades.length >= 3 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.dayOfWeek} right={t.dashboard.analytics.avgByWeekday} />
          <DayOfWeekChart trades={allTrades} />
        </div>
      )}

      {/* Hour of day breakdown */}
      {allTrades.length >= 4 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.hourOfDay} right={t.dashboard.analytics.cumByHour} />
          <HourOfDayChart trades={allTrades} />
        </div>
      )}

      {/* Long vs Short breakdown */}
      {allTrades.length >= 2 && (() => {
        const sides = { LONG: { trades: 0, pnl: 0, wins: 0 }, SHORT: { trades: 0, pnl: 0, wins: 0 } };
        for (const tr of allTrades) {
          const side = (tr.side || '').toUpperCase();
          if (!sides[side]) continue;
          const p = parseFloat(tr.pnl ?? 0);
          sides[side].trades += 1;
          sides[side].pnl   += p;
          if (p > 0) sides[side].wins += 1;
        }
        const hasBoth = sides.LONG.trades > 0 && sides.SHORT.trades > 0;
        if (!hasBoth && sides.LONG.trades + sides.SHORT.trades < 4) return null;
        return (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel title={t.dashboard.analytics.longVsShort} right={t.dashboard.analytics.dirBreakdown} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border-subtle)' }}>
              {['LONG', 'SHORT'].map(side => {
                const s = sides[side];
                const pnl = parseFloat(s.pnl.toFixed(2));
                const wr = s.trades ? Math.round(s.wins / s.trades * 100) : 0;
                const pos = pnl >= 0;
                const col = side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)';
                return (
                  <div key={side} style={{ background: 'var(--bg-base)', padding: '20px 24px' }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: col, marginBottom: 10, fontWeight: 700 }}>{side}</div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: pos ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: 8, letterSpacing: '-0.02em' }}>
                      {pos ? '+' : ''}{pnl.toFixed(2)}
                    </div>
                    <div style={{ display: 'flex', gap: 20 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{t.dashboard.analytics.hTrades}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{s.trades}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{t.dashboard.analytics.hWinRate}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{wr}%</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{t.dashboard.analytics.avgTrade}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: s.trades ? (s.pnl / s.trades >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-muted)' }}>
                          {s.trades ? `${s.pnl / s.trades >= 0 ? '+' : ''}${(s.pnl / s.trades).toFixed(2)}` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* By coin — card grid or table */}
      {periodStats.byCoin.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10, marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {t.dashboard.analytics.byCoin}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>{periodStats.byCoin.length} {t.dashboard.analytics.coinsSort}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {['cards', 'table'].map(v => (
                  <button key={v} onClick={() => setCoinView(v)} style={{
                    background: 'none', border: `1px solid ${coinView === v ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                    color: coinView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', padding: '2px 8px', cursor: 'pointer',
                    textTransform: 'uppercase', transition: 'all 120ms',
                  }}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          {coinView === 'cards'
            ? <CoinGrid coins={periodStats.byCoin} />
            : (
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                <DataTable
                  cols={coinCols}
                  rows={[...periodStats.byCoin].sort((a, b) => {
                    let va, vb;
                    if (coinSort === '_wr') { va = a.trades ? a.wins / a.trades : 0; vb = b.trades ? b.wins / b.trades : 0; }
                    else { va = parseFloat(a[coinSort] ?? 0); vb = parseFloat(b[coinSort] ?? 0); }
                    return coinSortAsc ? va - vb : vb - va;
                  })}
                  getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'avg_win' ? 'var(--accent-green)' : k === 'avg_loss' ? 'var(--accent-red)' : k === '_rr' && r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss) >= 1 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
                  sortCol={coinSort}
                  sortAsc={coinSortAsc}
                  onSort={col => { if (coinSort === col) setCoinSortAsc(a => !a); else { setCoinSort(col); setCoinSortAsc(false); } }}
                />
              </div>
            )
          }
        </div>
      )}

      {/* By bot source */}
      {(mergedBySource?.length ?? 0) > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel
            title={t.dashboard.analytics.byBotSource}
            right={`${mergedBySource.length} ${t.dashboard.analytics.sources}`}
          />
          {/* Visual PnL bar chart */}
          {(() => {
            const sorted = [...mergedBySource].sort((a, b) => b.pnl - a.pnl);
            const maxAbs = Math.max(...sorted.map(r => Math.abs(r.pnl)), 0.01);
            return (
              <div style={{ border: '1px solid var(--border-subtle)', borderBottom: 'none', marginBottom: 0 }}>
                {sorted.map((r, i) => {
                  const pnl = parseFloat(r.pnl);
                  const pos = pnl >= 0;
                  const barW = Math.abs(pnl) / maxAbs * 100;
                  const wr = r.trades ? Math.round(r.wins / r.trades * 100) : 0;
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '110px 1fr 90px 60px',
                      alignItems: 'center', gap: 12,
                      padding: '9px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: 'var(--bg-base)',
                    }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label || r.source}
                      </span>
                      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${barW}%`,
                          background: pos ? 'rgba(14,203,129,0.7)' : 'rgba(246,70,93,0.7)',
                          borderRadius: 1,
                        }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, textAlign: 'right', color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {pos ? '+' : ''}{pnl.toFixed(2)}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 10, textAlign: 'right', color: r.trades && pos ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                        {r.trades ? `${wr}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderTop: 'none' }}>
            <DataTable
              cols={botCols}
              rows={[...mergedBySource].sort((a, b) => {
                let va, vb;
                if (botSort === '_wr') { va = a.trades ? a.wins / a.trades : 0; vb = b.trades ? b.wins / b.trades : 0; }
                else { va = parseFloat(a[botSort] ?? 0); vb = parseFloat(b[botSort] ?? 0); }
                return botSortAsc ? va - vb : vb - va;
              })}
              getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'avg_win' ? 'var(--accent-green)' : k === 'avg_loss' ? 'var(--accent-red)' : k === '_rr' && r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss) >= 1 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
              sortCol={botSort}
              sortAsc={botSortAsc}
              onSort={col => { if (botSort === col) setBotSortAsc(a => !a); else { setBotSort(col); setBotSortAsc(false); } }}
            />
          </div>
        </div>
      )}

      {/* Top 5 best / worst trades */}
      {(periodStats.best.length > 0 || periodStats.worst.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          {periodStats.best.length > 0 && (
            <div>
              <SectionLabel title={t.dashboard.analytics.topBest} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {periodStats.best.map((tr, i) => <TradeRow key={i} tr={tr} />)}
              </div>
            </div>
          )}
          {periodStats.worst.length > 0 && (
            <div>
              <SectionLabel title={t.dashboard.analytics.topWorst} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {periodStats.worst.map((tr, i) => <TradeRow key={i} tr={tr} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All trades — paginated, newest first */}
      {allTrades.length > 0 && (() => {
        const sources = [...new Set(allTrades.map(t => t.source).filter(Boolean))].sort();
        const lc = tradeSearch.toLowerCase();
        const filtered = [...allTrades]
          .filter(t => {
            if (tradeSide !== 'ALL' && (t.side || '').toUpperCase() !== tradeSide) return false;
            if (tradeSource !== 'ALL' && t.source !== tradeSource) return false;
            if (lc && !(t.symbol || '').toLowerCase().includes(lc)) return false;
            return true;
          })
          .sort((a, b) => parseInt(b.closed_at) - parseInt(a.closed_at));
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        const page = Math.min(tradePage, totalPages);
        const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        const btnSide = {
          background: 'none', border: '1px solid var(--border-subtle)', fontFamily: MONO,
          fontSize: 10, letterSpacing: '0.1em', padding: '4px 10px', cursor: 'pointer', transition: 'all 120ms',
        };
        return (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel title={t.dashboard.analytics.allTradesTitle} right={`${filtered.length !== allTrades.length ? `${filtered.length} / ` : ''}${allTrades.length} ${t.dashboard.analytics.total}`} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {['ALL', 'LONG', 'SHORT'].map(s => (
                <button key={s} onClick={() => { setTradeSide(s); setTradePage(1); }} style={{
                  ...btnSide,
                  borderColor: tradeSide === s ? (s === 'LONG' ? 'var(--accent-green)' : s === 'SHORT' ? 'var(--accent-red)' : 'var(--border-default)') : 'var(--border-subtle)',
                  color: tradeSide === s ? (s === 'LONG' ? 'var(--accent-green)' : s === 'SHORT' ? 'var(--accent-red)' : 'var(--text-primary)') : 'var(--text-muted)',
                }}>{s}</button>
              ))}
              <input
                value={tradeSearch}
                onChange={e => { setTradeSearch(e.target.value); setTradePage(1); }}
                placeholder={t.dashboard.searchCoin}
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 3,
                  color: 'var(--text-primary)', fontFamily: MONO, fontSize: 10, padding: '4px 10px',
                  outline: 'none', width: 110, letterSpacing: '0.04em',
                }}
              />
              {sources.length > 1 && (
                <select
                  value={tradeSource}
                  onChange={e => { setTradeSource(e.target.value); setTradePage(1); }}
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    color: tradeSource !== 'ALL' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: MONO, fontSize: 10, padding: '4px 10px', outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="ALL">{t.dashboard.analytics.allBots}</option>
                  {sources.map(s => (
                    <option key={s} value={s}>{BOT_LABELS[s] || s}</option>
                  ))}
                </select>
              )}
              {filtered.length > 0 && (
                <button onClick={() => exportTradesCSV(filtered)}
                  style={{ ...btnSide, marginLeft: 'auto', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >↓ CSV</button>
              )}
            </div>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <DataTable
                cols={allTradesCols}
                rows={pageRows}
                getRowColor={(k, r) => k === 'pnl' ? ((r.pnl ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
              />
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12 }}>
                <button
                  onClick={() => setTradePage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{
                    background: 'none', border: '1px solid var(--border-subtle)', color: page <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                    fontFamily: MONO, fontSize: 11, padding: '5px 14px', cursor: page <= 1 ? 'default' : 'pointer',
                    opacity: page <= 1 ? 0.4 : 1, transition: 'border-color 150ms',
                  }}
                >{t.dashboard.analytics.prev}</button>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setTradePage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    background: 'none', border: '1px solid var(--border-subtle)', color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                    fontFamily: MONO, fontSize: 11, padding: '5px 14px', cursor: page >= totalPages ? 'default' : 'pointer',
                    opacity: page >= totalPages ? 0.4 : 1, transition: 'border-color 150ms',
                  }}
                >{t.dashboard.analytics.next}</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Monthly PnL (from PnL tab) ─────────────────────────── */}
      {pnlRows.length > 0 && (() => {
        const locale = PNL_LOC[lang] || 'en-US';
        const totalGross = pnlRows.reduce((s, r) => s + r.gross_pnl, 0);
        const totalFee   = pnlRows.reduce((s, r) => s + r.performance_fee, 0);
        const totalNet   = pnlRows.reduce((s, r) => s + r.net_pnl, 0);
        const maxAbs     = Math.max(...pnlRows.map(r => Math.abs(r.gross_pnl)), 1);
        const multiYear  = new Set(pnlRows.map(r => r.year)).size > 1;
        const reversed   = [...pnlRows].reverse();

        // cumulative net PnL line
        const sorted  = [...pnlRows].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
        let cum = 0;
        const cumPts  = sorted.map(r => { cum += r.net_pnl; return parseFloat(cum.toFixed(2)); });
        const minV    = Math.min(...cumPts, 0);
        const maxV    = Math.max(...cumPts, 0);
        const range   = (maxV - minV) || 1;
        const cumH    = 64, cumN = cumPts.length;
        const cumXs   = cumPts.map((_, i) => (i / Math.max(cumN - 1, 1)) * 100);
        const cumYs   = cumPts.map(v => cumH - ((v - minV) / range) * cumH);
        const linePth = cumXs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${cumYs[i].toFixed(1)}`).join(' ');
        const areaPth = `${linePth} L${cumXs[cumXs.length-1].toFixed(1)},${cumH} L0,${cumH} Z`;
        const cumPos  = cumPts[cumPts.length - 1] >= 0;
        const cumCol  = cumPos ? 'var(--accent-green)' : 'var(--accent-red)';

        const pnlTableCols = [
          { key: 'month',  label: t.dashboard.hMonth, render: r => `${shortMonth(r.month - 1, locale)} ${r.year}` },
          { key: 'gross',  label: t.dashboard.pnl.hGrossPnl, align: 'right', render: r => `${r.gross_pnl >= 0 ? '+' : ''}${r.gross_pnl.toFixed(2)}` },
          { key: 'fee',    label: t.dashboard.pnl.hFee,      align: 'right', muted: true, render: r => r.performance_fee.toFixed(2) },
          { key: 'net',    label: t.dashboard.pnl.hNetPnl,   align: 'right', render: r => `${r.net_pnl >= 0 ? '+' : ''}${r.net_pnl.toFixed(2)}` },
          { key: 'paid',   label: t.dashboard.pnl.hPaid,     align: 'right', muted: true, render: r => r.fee_paid ? '✓' : '—' },
        ];

        return (
          <div style={{ marginBottom: 32, marginTop: 32 }}>
            <SectionLabel title={t.dashboard.pnl.monthlyGrossPnl} right={`${pnlRows.length} ${t.dashboard.analytics.tradesLbl.replace('trades','mo').trim()}`} />

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border-subtle)', marginBottom: 1 }}>
              {[
                { label: t.dashboard.pnl.totalGross, val: totalGross, col: true },
                { label: t.dashboard.pnl.totalFee,   val: totalFee,   col: false },
                { label: t.dashboard.pnl.totalNet,   val: totalNet,   col: true },
              ].map(({ label, val, col }) => (
                <div key={label} style={{ padding: '18px 20px', background: 'var(--bg-base)' }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: col ? (val >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-primary)' }}>
                    {val >= 0 ? '+' : ''}{val.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Monthly bar chart */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '12px 16px 8px', marginBottom: 1, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
                {reversed.map((r, i) => {
                  const h = Math.abs(r.gross_pnl) / maxAbs * 64;
                  const pos = r.gross_pnl >= 0;
                  const isH = hovBar === i;
                  return (
                    <div key={`${r.year}-${r.month}`}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'default' }}
                      onMouseEnter={() => setHovBar(i)} onMouseLeave={() => setHovBar(null)}>
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: 66 }}>
                        <div style={{ marginTop: 'auto', width: '100%', height: Math.max(h, 2),
                          background: pos ? (isH ? 'var(--accent-green)' : 'rgba(14,203,129,0.65)') : (isH ? 'var(--accent-red)' : 'rgba(246,70,93,0.65)'),
                          transition: 'background 100ms' }} />
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: isH ? 'var(--text-secondary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {shortMonth(r.month - 1, locale)}{multiYear ? ` '${String(r.year).slice(2)}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hovBar != null && reversed[hovBar] && (
                <div style={{
                  position: 'absolute', top: 8,
                  left: `${(hovBar / reversed.length + 0.5 / reversed.length) * 100}%`,
                  transform: 'translateX(-50%)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  padding: '7px 12px', fontFamily: MONO, fontSize: 11,
                  pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
                }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 3 }}>
                    {shortMonth(reversed[hovBar].month - 1, locale)} {reversed[hovBar].year}
                  </div>
                  <div style={{ color: reversed[hovBar].gross_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
                    {reversed[hovBar].gross_pnl >= 0 ? '+' : ''}{reversed[hovBar].gross_pnl.toFixed(2)} {t.dashboard.pnl.gross}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 1 }}>
                    {t.dashboard.pnl.net} {reversed[hovBar].net_pnl >= 0 ? '+' : ''}{reversed[hovBar].net_pnl.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Cumulative net PnL line */}
            {cumN >= 2 && (
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderTop: 'none', padding: '10px 16px 8px', marginBottom: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t.dashboard.pnl.cumNetPnl}</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: cumCol }}>
                    {cumPos ? '+' : ''}{cumPts[cumPts.length - 1].toFixed(2)} USDT
                  </div>
                </div>
                <svg viewBox={`0 0 100 ${cumH}`} preserveAspectRatio="none" style={{ width: '100%', height: cumH, display: 'block' }}>
                  <path d={areaPth} fill={cumPos ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)'} />
                  <path d={linePth} fill="none" stroke={cumCol} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  <circle cx={cumXs[cumXs.length-1].toFixed(1)} cy={cumYs[cumYs.length-1].toFixed(1)} r="2" fill={cumCol} vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            )}

            {/* Monthly table */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderTop: 'none' }}>
              <DataTable
                cols={pnlTableCols}
                rows={pnlRows}
                getRowColor={(k, r) => k === 'gross' ? (r.gross_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'net' ? (r.net_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
              />
            </div>
          </div>
        );
      })()}

      <div style={{ paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
        <button onClick={() => fetchData(allDays)} style={{
          background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)',
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '8px 20px', cursor: 'pointer', transition: 'border-color 150ms, color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {t.dashboard.refresh}
        </button>
      </div>
    </div>
  );
}
