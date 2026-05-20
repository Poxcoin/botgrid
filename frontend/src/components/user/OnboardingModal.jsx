import React, { useState, useCallback } from 'react';
import { useLang } from '@/lib/LangContext';

const FF   = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";
const CONSENT_KEY = 'kado_consent_v1';

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

// ── Terms step (step 0) ───────────────────────────────────────────────────────
function TermsStep({ onNext }) {
  const { t } = useLang();
  const to = t.dashboard.onboarding;
  const [tosOk, setTosOk] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [busy,  setBusy]  = useState(false);

  async function handleAccept() {
    if (!tosOk || !ageOk) return;
    setBusy(true);
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify({ legal: true, cookies: true, ts: new Date().toISOString() }));
      localStorage.setItem('kado_cookie_consent', 'accepted');
    } catch {}
    try { await API('/api/users/accept-terms'); } catch {}
    setBusy(false);
    onNext();
  }

  const checkRow = (checked, onChange, label) => (
    <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 14px', background: '#0d0d0d', border: `1px solid ${checked ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 8, marginBottom: 10, transition: 'border-color 0.15s' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, cursor: 'pointer', accentColor: '#fff', width: 15, height: 15, flexShrink: 0 }} />
      <span style={{ fontSize: 13, color: '#bbb', lineHeight: 1.55 }}>{label}</span>
    </label>
  );

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>{to.termsTitle}</div>
      <p style={{ color: '#666', fontSize: 13, lineHeight: 1.6, margin: '0 0 22px' }}>
        {to.termsDesc}
      </p>

      {checkRow(tosOk, setTosOk,
        <span>
          I have read and accept the{' '}
          <a href="/legal/terms" target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>Terms of Service</a>,{' '}
          <a href="/legal/risk-disclosure" target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>Risk Disclosure</a>, and{' '}
          <a href="/legal/privacy" target="_blank" rel="noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>Privacy Policy</a>.
          I understand that cryptocurrency trading carries significant risk, including total loss of capital.
        </span>
      )}

      {checkRow(ageOk, setAgeOk,
        'I am at least 18 years old and legally eligible to use this service in my jurisdiction.'
      )}

      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5, marginBottom: 22, padding: '10px 14px', background: '#080808', borderRadius: 6, border: '1px solid #111' }}>
        {to.feeNote}
      </div>

      <button onClick={handleAccept} disabled={!tosOk || !ageOk || busy} style={{
        ...btnPrimary,
        width: '100%', textAlign: 'center',
        background: tosOk && ageOk ? '#fff' : '#191919',
        color: tosOk && ageOk ? '#000' : '#444',
        cursor: tosOk && ageOk ? 'pointer' : 'not-allowed',
      }}>
        {busy ? to.saving : to.iAgree}
      </button>
    </div>
  );
}

// ── Step components ────────────────────────────────────────────────────────────
function WelcomeStep({ username, onNext }) {
  const { t } = useLang();
  const to = t.dashboard.onboarding;

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>👋</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>
        {to.welcomeTitle.replace('{name}', username || 'trader')}
      </div>
      <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, margin: '0 0 32px' }}>
        {to.welcomeDesc}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 36, textAlign: 'left' }}>
        {[to.welcomeStep1, to.welcomeStep2, to.welcomeStep3].map((label, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#111', border: '1px solid #1f1f1f', borderRadius: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 13, color: '#ccc' }}>{label}</span>
          </div>
        ))}
      </div>
      <button onClick={onNext} style={btnPrimary}>{to.getStarted}</button>
    </div>
  );
}

function ApiKeyStep({ onNext, onGoToKeys }) {
  const { t } = useLang();
  const to = t.dashboard.onboarding;
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
        setErr(to.noKeyFound);
      }
    } catch {
      setErr(to.verifyError);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{to.apiKeyTitle}</div>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
        {to.apiKeyDesc}
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
        <button onClick={onGoToKeys} style={btnSecondary}>{to.openApiKeysTab}</button>
        <button onClick={handleCheck} disabled={checking} style={btnPrimary}>
          {checking ? to.checking : to.keyConnected}
        </button>
      </div>
      <button onClick={onNext} style={btnSkip}>{to.skip}</button>
    </div>
  );
}

function StrategyStep({ onNext }) {
  const { t } = useLang();
  const to = t.dashboard.onboarding;

  const STRATEGIES = [
    { name: 'Grid Bot',      badge: 'Recommended', risk: 'Low',        riskColor: '#00d4aa', desc: 'Places buy/sell orders in a price range. Best for sideways markets. Profits from volatility automatically.' },
    { name: 'Signal Bot',    badge: null,          risk: 'Medium',      riskColor: '#f5a623', desc: 'Follows news & market signals to enter altcoin trades. Higher upside, needs more market movement.' },
    { name: 'Funding Rate',  badge: null,          risk: 'Low–Medium',  riskColor: '#f5a623', desc: 'Exploits funding rate anomalies between long and short positions. Works in any market direction.' },
  ];

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{to.stratTitle}</div>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
        {to.stratDesc}
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
      <button onClick={onNext} style={btnPrimary}>{to.gotIt}</button>
    </div>
  );
}

function TelegramStep({ onNext, onSkip }) {
  const { t } = useLang();
  const to = t.dashboard.onboarding;
  const botUsername = 'KADO_c_BOT';

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
        {to.tgTitle} <span style={{ fontSize: 13, color: '#555', fontWeight: 400 }}>{to.tgOptional}</span>
      </div>
      <p style={{ color: '#888', fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
        {to.tgDesc}
      </p>
      <div style={{ padding: '16px', background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 8, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{to.tgWhatYouGet}</div>
        {[to.tgItem1, to.tgItem2, to.tgItem3, to.tgItem4].map(item => (
          <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, color: '#bbb' }}>
            <CheckCircle />
            <span>{item}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <a href={`https://t.me/${botUsername}`} target="_blank" rel="noreferrer" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Connect @{botUsername} ↗
        </a>
        <button onClick={onNext} style={btnSecondary}>{to.alreadyConnected}</button>
      </div>
      <button onClick={onSkip} style={btnSkip}>{to.skip}</button>
    </div>
  );
}

function SuccessStep({ onClose }) {
  const { t } = useLang();
  const to = t.dashboard.onboarding;

  return (
    <div style={{ textAlign: 'center', padding: '16px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>{to.successTitle}</div>
      <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6, margin: '0 0 32px' }}>
        {to.successDesc}
      </p>
      <button onClick={onClose} style={btnPrimary}>{to.openDashboard}</button>
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
  const needsTerms = (() => {
    try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || '{}')?.legal !== true; } catch { return true; }
  })();
  const [step, setStep] = useState(needsTerms ? 0 : 1);
  const STEPS = 5;

  const advance = useCallback(async (nextStep) => {
    const s = nextStep ?? step + 1;
    if (s >= STEPS) {
      try { await API('/api/onboarding/step', { method: 'POST', body: JSON.stringify({ step: 4 }) }); } catch {}
      setStep(STEPS);
    } else {
      setStep(s);
      if (s >= 2) {
        try { await API('/api/onboarding/step', { method: 'POST', body: JSON.stringify({ step: s - 1 }) }); } catch {}
      }
    }
  }, [step]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.88)',
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
        {step >= 2 && step < STEPS && <ProgressDots step={step - 2} total={STEPS - 2} />}
        {step === 0 && <TermsStep   onNext={() => advance(1)} />}
        {step === 1 && <WelcomeStep username={username} onNext={() => advance(2)} />}
        {step === 2 && <ApiKeyStep  onNext={() => advance(3)} onGoToKeys={onGoToKeys} />}
        {step === 3 && <StrategyStep onNext={() => advance(4)} />}
        {step === 4 && <TelegramStep onNext={() => advance(5)} onSkip={() => advance(5)} />}
        {step >= STEPS && <SuccessStep onClose={onClose} />}
      </div>
    </div>
  );
}
