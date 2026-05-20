import React, { useState } from 'react';
import { useIsMobile } from '@/lib/useIsMobile';
import { useLang } from '@/lib/LangContext';

const MONO = 'var(--font-mono)';

const cardStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  padding: '24px',
};

const cardTitleStyle = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '.2em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 20,
};

const labelStyle = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  marginBottom: 4,
  display: 'block',
};

const baseInputStyle = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontFamily: MONO,
  fontSize: 12,
  outline: 'none',
  boxSizing: 'border-box',
};

const resultBoxStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 8,
  padding: '16px',
  marginTop: 16,
};

const resultRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontFamily: MONO,
  fontSize: 11,
};

const resultLabelStyle = { color: 'var(--text-muted)' };
const resultValueStyle = { fontWeight: 600, color: 'var(--text-primary)' };
const dividerStyle = { borderBottom: '1px solid var(--border-subtle)' };

function InputField({ label, value, onChange, step, max }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        step={step}
        max={max}
        style={{
          ...baseInputStyle,
          borderColor: focused ? 'var(--accent-green)' : 'var(--border-subtle)',
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}

function ResultRow({ label, value, last }) {
  return (
    <div style={last ? resultRowStyle : { ...resultRowStyle, ...dividerStyle }}>
      <span style={resultLabelStyle}>{label}</span>
      <span style={resultValueStyle}>{value}</span>
    </div>
  );
}

function fmt(n, decimals = 2) {
  if (!isFinite(n) || isNaN(n)) return '—';
  return n.toFixed(decimals);
}

function PositionSizeCalc() {
  const { t } = useLang();
  const tt = t.dashboard.tools;
  const [balance, setBalance] = useState('1000');
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');

  const b = parseFloat(balance);
  const r = parseFloat(risk);
  const e = parseFloat(entry);
  const s = parseFloat(sl);

  const validBase = b > 0 && r > 0;
  const validAll = validBase && e > 0 && s > 0 && e !== s;

  const riskAmount = validBase ? b * r / 100 : null;
  const diff = validAll ? Math.abs(e - s) : null;
  const qty = validAll ? riskAmount / diff : null;
  const positionUSDT = validAll ? qty * e : null;
  const maxLev = validAll ? e / diff : null;

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{tt.posSizeCalc}</div>
      <InputField label={tt.balance} value={balance} onChange={setBalance} />
      <InputField label={tt.riskPct} value={risk} onChange={setRisk} step={0.1} max={100} />
      <InputField label={tt.entryPrice} value={entry} onChange={setEntry} />
      <InputField label={tt.slPrice} value={sl} onChange={setSl} />
      <div style={resultBoxStyle}>
        <ResultRow label={tt.riskAmount} value={riskAmount !== null ? fmt(riskAmount) : '—'} />
        <ResultRow label={tt.posSize} value={positionUSDT !== null ? fmt(positionUSDT) : '—'} />
        <ResultRow label={tt.qty} value={qty !== null ? fmt(qty, 6) : '—'} />
        <ResultRow label={tt.maxLev} value={maxLev !== null ? `${fmt(maxLev, 1)}x` : '—'} last />
      </div>
    </div>
  );
}

function RiskRewardCalc() {
  const { t } = useLang();
  const tt = t.dashboard.tools;
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [size, setSize] = useState('100');

  const e = parseFloat(entry);
  const s = parseFloat(sl);
  const tpVal = parseFloat(tp);
  const sz = parseFloat(size);

  const valid = e > 0 && s > 0 && tpVal > 0 && sz > 0 && e !== s && e !== tpVal;

  const riskUSDT = valid ? Math.abs(e - s) / e * sz : null;
  const rewardUSDT = valid ? Math.abs(tpVal - e) / e * sz : null;
  const riskPct = valid ? Math.abs(e - s) / e * 100 : null;
  const rewardPct = valid ? Math.abs(tpVal - e) / e * 100 : null;
  const rr = valid && riskUSDT > 0 ? rewardUSDT / riskUSDT : null;

  let verdict = null;
  let verdictColor = 'var(--text-muted)';
  if (rr !== null) {
    if (rr >= 2) {
      verdict = tt.goodSetup;
      verdictColor = 'var(--accent-green)';
    } else if (rr >= 1) {
      verdict = tt.okSetup;
      verdictColor = '#f59e0b';
    } else {
      verdict = tt.poorRR;
      verdictColor = 'var(--accent-red)';
    }
  }

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{tt.rrCalc}</div>
      <InputField label={tt.entryPrice} value={entry} onChange={setEntry} />
      <InputField label={tt.slPrice} value={sl} onChange={setSl} />
      <InputField label={tt.tpPrice} value={tp} onChange={setTp} />
      <InputField label={tt.posSize} value={size} onChange={setSize} />
      <div style={resultBoxStyle}>
        <ResultRow label={tt.riskUSDT} value={riskUSDT !== null ? fmt(riskUSDT) : '—'} />
        <ResultRow label={tt.rewardUSDT} value={rewardUSDT !== null ? fmt(rewardUSDT) : '—'} />
        <ResultRow label={tt.riskPctLbl} value={riskPct !== null ? `${fmt(riskPct)}%` : '—'} />
        <ResultRow label={tt.rewardPctLbl} value={rewardPct !== null ? `${fmt(rewardPct)}%` : '—'} />
        <ResultRow label={tt.rrRatio} value={rr !== null ? `1 : ${fmt(rr)}` : '—'} />
        <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: verdictColor }}>
            {verdict ?? '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

function LiquidationCalc() {
  const { t } = useLang();
  const tt = t.dashboard.tools;
  const [entry, setEntry] = useState('');
  const [lev, setLev] = useState('10');
  const [side, setSide] = useState('LONG');

  const e = parseFloat(entry);
  const l = parseFloat(lev);
  const valid = e > 0 && l > 0 && l <= 200;

  const MMR = 0.005;
  const liqPrice = valid
    ? side === 'LONG'
      ? e * (1 - 1 / l + MMR)
      : e * (1 + 1 / l - MMR)
    : null;

  const distPct = valid && liqPrice
    ? Math.abs(e - liqPrice) / e * 100
    : null;

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{tt.liqCalc}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {['LONG', 'SHORT'].map(s => (
          <button key={s} onClick={() => setSide(s)} style={{
            flex: 1, padding: '8px 0', fontFamily: MONO, fontSize: 11,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            border: `1px solid ${side === s ? (s === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--border-subtle)'}`,
            background: side === s ? (s === 'LONG' ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)') : 'transparent',
            color: side === s ? (s === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-muted)',
            borderRadius: 6,
          }}>
            {s}
          </button>
        ))}
      </div>
      <InputField label={tt.entryPrice} value={entry} onChange={setEntry} />
      <InputField label={tt.leverage} value={lev} onChange={setLev} step={1} max={200} />
      <div style={resultBoxStyle}>
        <ResultRow label={tt.liqPrice} value={liqPrice !== null ? fmt(liqPrice, 4) : '—'} />
        <ResultRow label={tt.distToLiq} value={distPct !== null ? `${fmt(distPct)}%` : '—'} />
        <ResultRow label={tt.maintMargin} value="0.5%" last />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6, opacity: 0.7 }}>
        {tt.liqNote}
      </div>
    </div>
  );
}

function CompoundCalc() {
  const { t } = useLang();
  const tt = t.dashboard.tools;
  const [balance, setBalance] = useState('10000');
  const [monthly, setMonthly] = useState('5');
  const [months,  setMonths]  = useState('12');
  const [hovIdx,  setHovIdx]  = useState(null);

  const b  = parseFloat(balance);
  const mr = parseFloat(monthly) / 100;
  const n  = Math.min(Math.max(Math.round(parseFloat(months)), 1), 60);

  const valid = b > 0 && mr > -1 && n >= 1;

  const rows = valid ? Array.from({ length: n }, (_, i) => {
    const value = b * Math.pow(1 + mr, i + 1);
    return { month: i + 1, value: parseFloat(value.toFixed(2)) };
  }) : [];

  const finalVal   = rows[rows.length - 1]?.value ?? 0;
  const totalGain  = finalVal - b;
  const gainPct    = valid && b > 0 ? totalGain / b * 100 : 0;
  const maxVal     = Math.max(...rows.map(r => r.value), b);
  const BAR_H      = 72;

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>{tt.compoundCalc}</div>
      <InputField label={tt.startBalance} value={balance} onChange={setBalance} />
      <InputField label={tt.monthlyReturn} value={monthly} onChange={setMonthly} step={0.1} />
      <InputField label={tt.months} value={months} onChange={setMonths} step={1} max={60} />

      {valid && rows.length > 0 && (
        <>
          {/* Bar chart */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: BAR_H + 20 }}>
              {rows.map((r, i) => {
                const h = (r.value / maxVal) * BAR_H;
                const isHov = hovIdx === i;
                const pos = r.value >= b;
                return (
                  <div key={i}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'default' }}
                    onMouseEnter={() => setHovIdx(i)} onMouseLeave={() => setHovIdx(null)}>
                    <div style={{
                      width: '100%', height: Math.max(h, 2),
                      background: pos
                        ? (isHov ? 'var(--accent-green)' : 'rgba(14,203,129,0.55)')
                        : (isHov ? 'var(--accent-red)' : 'rgba(246,70,93,0.45)'),
                      transition: 'background 100ms',
                      borderRadius: '2px 2px 0 0',
                    }} />
                    {rows.length <= 24 && (
                      <div style={{ fontSize: 9, color: isHov ? 'var(--text-secondary)' : 'var(--text-muted)', fontFamily: MONO }}>
                        {r.month}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {hovIdx !== null && rows[hovIdx] && (
              <div style={{
                position: 'absolute', top: 0,
                left: `${(hovIdx / rows.length + 0.5 / rows.length) * 100}%`,
                transform: 'translateX(-50%)',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                padding: '6px 12px', fontFamily: MONO, fontSize: 11,
                pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>{tt.month} {rows[hovIdx].month}</div>
                <div style={{ fontWeight: 700, color: 'var(--accent-green)' }}>${rows[hovIdx].value.toFixed(2)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>+{((rows[hovIdx].value - b) / b * 100).toFixed(1)}%</div>
              </div>
            )}
          </div>

          <div style={resultBoxStyle}>
            <ResultRow label={tt.finalBalance} value={`$${fmt(finalVal)}`} />
            <ResultRow label={tt.totalGain} value={`$${fmt(totalGain)}`} />
            <ResultRow label={tt.growth} value={`+${fmt(gainPct)}%`} last />
          </div>
        </>
      )}
    </div>
  );
}

export default function ToolsTab() {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: 24,
      }}
    >
      <PositionSizeCalc />
      <RiskRewardCalc />
      <LiquidationCalc />
      <CompoundCalc />
    </div>
  );
}
