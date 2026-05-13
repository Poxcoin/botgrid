import React, { useState, useCallback } from 'react';

const FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

const API = (path, opts = {}) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(async r => {
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || 'Error');
  return j;
});

// ── Icons ──────────────────────────────────────────────────────────────────────
const CheckCircle = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" stroke="#00d4aa" strokeWidth="1.5"/>
    <path d="M6.5 10.5l2.5 2.5 4.5-5" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Strategy cards data ────────────────────────────────────────────────────────
const STRATEGIES = [
  {
    name: 'Grid Bot',
    badge: 'Recommended',
    risk: 'Low',
    riskColor: '#00d4aa',
    desc: 'Places buy/sell orders in a price range. Best for sideways markets. Profits from volatility automatically.',
  },
  {
    name: 'Signal Bot',
    badge: null,
    risk: 'Medium',
    riskColor: '#f5a623',
    desc: 'Follows news & market signals to enter altcoin trades. Higher upside, needs more market movement.',
  },
  {
    name: 'Funding Rate',
    badge: null,
    risk: 'Low–Medium',
    riskColor: '#f5a623',
    desc: 'Exploits funding rate anomalies between long and short positions. Works in any market direction.',
  },
];

// ── Step components ────────────────────────────────────────────────────────────
function WelcomeStep({ username, onNext }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>👋</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>
        Welcome to KADO, {username || 'trader'}!
      </div>
      <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, margin: '0 0 32px' }}>
        Let's get your trading bot running in 3 quick steps.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 36, textAlign: 'left' }}>
        {[
          { n: '1', label: 'Connect your Bybit API key' },
          { n: '2', label: 'Learn about your strategies' },
          { n: '3', label: 'Connect Telegram (optional)' },
        ].map(s => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#111', border: '1px solid #1f1f1f', borderRadius: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{s.n}</span>
            <span style={{ fontSize: 13, color: '#ccc' }}>{s.label}</span>
          </div>
        ))}
      </div>
      <button onClick={onNext} style={btnPrimary}>Get Started →</button>
    </div>
  );
}

function ApiKeyStep({ onNext, onGoToKeys }) {
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState('');

  const handleCheck = async () => {
    setChecking(true);
    setErr('');
    try {
      const me = await API('/api/users/me');
      if (me.has_api_keys) {
        onNext();
      } else {
        setErr('No API key found. Add one in the API Keys tab, then come back.');
      }
    } catch {
      setErr('Could not verify. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Connect your Bybit API key</div>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
        Your key lets KADO trade on your behalf. No withdrawal permission needed.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {[
          'Log in to Bybit → Avatar → API Management',
          'Create New Key → System-generated → name it "Kado"',
          'Enable: Unified Trading (Read), Derivatives (Read + Trade). Disable Withdrawal.',
          'Copy the API Key and Secret → paste in the API Keys tab',
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 12px', background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 6 }}>
            <span style={{ color: '#555', fontSize: 12, flexShrink: 0, lineHeight: '18px' }}>{i + 1}.</span>
            <span style={{ fontSize: 13, color: '#bbb', lineHeight: 1.5 }}>{s}</span>
          </div>
        ))}
      </div>
      {err && <div style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={onGoToKeys} style={btnSecondary}>Open API Keys tab ↗</button>
        <button onClick={handleCheck} disabled={checking} style={btnPrimary}>
          {checking ? 'Checking...' : "I've connected my key →"}
        </button>
      </div>
      <button onClick={onNext} style={btnSkip}>Skip for now</button>
    </div>
  );
}

function StrategyStep({ onNext }) {
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Your trading strategies</div>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
        KADO runs multiple strategies in parallel. All are active by default — no manual selection needed.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {STRATEGIES.map(s => (
          <div key={s.name} style={{ padding: '14px 16px', background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
              {s.badge && (
                <span style={{ fontSize: 10, padding: '2px 7px', background: 'rgba(0,212,170,0.1)', color: '#00d4aa', borderRadius: 4, fontWeight: 600 }}>{s.badge}</span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: s.riskColor }}>{s.risk} risk</span>
            </div>
            <div style={{ fontSize: 12, color: '#666', lineHeight: 1.5 }}>{s.desc}</div>
          </div>
        ))}
      </div>
      <button onClick={onNext} style={btnPrimary}>Got it →</button>
    </div>
  );
}

function TelegramStep({ onNext, onSkip }) {
  const botUsername = 'KADO_c_BOT';
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Connect Telegram <span style={{ fontSize: 13, color: '#555', fontWeight: 400 }}>(optional)</span></div>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
        Get instant trade notifications, balance updates, and alerts directly in Telegram.
      </p>
      <div style={{ padding: '16px', background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 8, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>What you'll receive:</div>
        {['Trade opened / closed notifications', 'Daily PnL summary', 'Balance alerts', 'Strategy signals'].map(i => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: '#bbb' }}>
            <CheckCircle />
            <span>{i}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Connect @{botUsername} ↗
        </a>
        <button onClick={onNext} style={btnSecondary}>Already connected</button>
      </div>
      <button onClick={onSkip} style={btnSkip}>Skip for now</button>
    </div>
  );
}

function SuccessStep({ onClose }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>You're all set!</div>
      <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, margin: '0 0 32px' }}>
        Your bot is watching the markets. Signals and trades will appear in the dashboard within minutes.
      </p>
      <button onClick={onClose} style={btnPrimary}>Open Dashboard →</button>
    </div>
  );
}

// ── Button styles ──────────────────────────────────────────────────────────────
const btnPrimary = {
  background: '#fff', color: '#000', border: 'none', cursor: 'pointer',
  padding: '11px 22px', fontSize: 13, fontWeight: 600, fontFamily: FF,
  letterSpacing: '0.01em', borderRadius: 100,
};
const btnSecondary = {
  background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
  cursor: 'pointer', padding: '10px 20px', fontSize: 13, fontFamily: FF, borderRadius: 100,
};
const btnSkip = {
  background: 'none', border: 'none', cursor: 'pointer', color: '#444',
  fontSize: 12, fontFamily: FF, padding: '8px 0', display: 'block', marginTop: 8,
};

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressDots({ step, total }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? 20 : 6, height: 6,
          borderRadius: 3,
          background: i <= step ? '#fff' : '#222',
          transition: 'width 0.25s, background 0.25s',
        }} />
      ))}
    </div>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export default function OnboardingModal({ username, onClose, onGoToKeys }) {
  const [step, setStep] = useState(0);
  const STEPS = 4;

  const advance = useCallback(async (nextStep) => {
    const s = nextStep ?? step + 1;
    if (s >= STEPS) {
      // mark completed
      try {
        await API('/api/onboarding/step', { method: 'POST', body: JSON.stringify({ step: 3 }) });
      } catch { /* silent */ }
      setStep(STEPS); // success screen
    } else {
      setStep(s);
      if (s > 0) {
        try {
          await API('/api/onboarding/step', { method: 'POST', body: JSON.stringify({ step: s }) });
        } catch { /* silent */ }
      }
    }
  }, [step]);

  const handleClose = () => {
    // mark completed when closing from success screen
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '36px 32px',
        width: '100%', maxWidth: 480,
        fontFamily: FF, color: '#fff',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {step < STEPS && step > 0 && <ProgressDots step={step - 1} total={STEPS - 1} />}
        {step === 0 && <WelcomeStep username={username} onNext={() => advance(1)} />}
        {step === 1 && <ApiKeyStep onNext={() => advance(2)} onGoToKeys={() => { onGoToKeys(); }} />}
        {step === 2 && <StrategyStep onNext={() => advance(3)} />}
        {step === 3 && <TelegramStep onNext={() => advance(4)} onSkip={() => advance(4)} />}
        {step >= STEPS && <SuccessStep onClose={handleClose} />}
      </div>
    </div>
  );
}
