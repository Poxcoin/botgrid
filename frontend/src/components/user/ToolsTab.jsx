import React, { useState } from 'react';
import { useIsMobile } from '@/lib/useIsMobile';

const MONO = 'var(--font-mono)';

const cardStyle = {
  background: 'var(--bg-surface)',
  border: '1px solid rgba(255,255,255,0.06)',
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
  border: '1px solid rgba(255,255,255,0.08)',
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
  border: '1px solid rgba(255,255,255,0.08)',
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
const dividerStyle = { borderBottom: '1px solid rgba(255,255,255,0.04)' };

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
          borderColor: focused ? 'var(--accent-green)' : 'rgba(255,255,255,0.08)',
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
      <div style={cardTitleStyle}>Position Size Calculator</div>
      <InputField label="Account Balance (USDT)" value={balance} onChange={setBalance} />
      <InputField label="Risk per Trade (%)" value={risk} onChange={setRisk} step={0.1} max={100} />
      <InputField label="Entry Price" value={entry} onChange={setEntry} />
      <InputField label="Stop Loss Price" value={sl} onChange={setSl} />
      <div style={resultBoxStyle}>
        <ResultRow label="Risk Amount (USDT)" value={riskAmount !== null ? fmt(riskAmount) : '—'} />
        <ResultRow label="Position Size (USDT)" value={positionUSDT !== null ? fmt(positionUSDT) : '—'} />
        <ResultRow label="Quantity (coins)" value={qty !== null ? fmt(qty, 6) : '—'} />
        <ResultRow label="Max Leverage" value={maxLev !== null ? `${fmt(maxLev, 1)}x` : '—'} last />
      </div>
    </div>
  );
}

function RiskRewardCalc() {
  const [entry, setEntry] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [size, setSize] = useState('100');

  const e = parseFloat(entry);
  const s = parseFloat(sl);
  const t = parseFloat(tp);
  const sz = parseFloat(size);

  const valid = e > 0 && s > 0 && t > 0 && sz > 0 && e !== s && e !== t;

  const riskUSDT = valid ? Math.abs(e - s) / e * sz : null;
  const rewardUSDT = valid ? Math.abs(t - e) / e * sz : null;
  const riskPct = valid ? Math.abs(e - s) / e * 100 : null;
  const rewardPct = valid ? Math.abs(t - e) / e * 100 : null;
  const rr = valid && riskUSDT > 0 ? rewardUSDT / riskUSDT : null;

  let verdict = null;
  let verdictColor = 'var(--text-muted)';
  if (rr !== null) {
    if (rr >= 2) {
      verdict = 'Good setup ✓';
      verdictColor = 'var(--accent-green)';
    } else if (rr >= 1) {
      verdict = 'OK';
      verdictColor = '#f59e0b';
    } else {
      verdict = 'Poor risk/reward';
      verdictColor = 'var(--accent-red)';
    }
  }

  return (
    <div style={cardStyle}>
      <div style={cardTitleStyle}>Risk / Reward Calculator</div>
      <InputField label="Entry Price" value={entry} onChange={setEntry} />
      <InputField label="Stop Loss Price" value={sl} onChange={setSl} />
      <InputField label="Take Profit Price" value={tp} onChange={setTp} />
      <InputField label="Position Size (USDT)" value={size} onChange={setSize} />
      <div style={resultBoxStyle}>
        <ResultRow label="Risk (USDT)" value={riskUSDT !== null ? fmt(riskUSDT) : '—'} />
        <ResultRow label="Reward (USDT)" value={rewardUSDT !== null ? fmt(rewardUSDT) : '—'} />
        <ResultRow label="Risk %" value={riskPct !== null ? `${fmt(riskPct)}%` : '—'} />
        <ResultRow label="Reward %" value={rewardPct !== null ? `${fmt(rewardPct)}%` : '—'} />
        <ResultRow label="R:R Ratio" value={rr !== null ? `1 : ${fmt(rr)}` : '—'} />
        <div style={{ paddingTop: 10, marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: verdictColor }}>
            {verdict ?? '—'}
          </span>
        </div>
      </div>
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
    </div>
  );
}
