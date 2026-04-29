import React, { useState } from 'react';
import useScrollReveal from '@/lib/useScrollReveal';

function Tag({ children, color = 'var(--neon-green)' }) {
  return (
    <span className="font-mono text-[9px] tracking-[0.25em] uppercase px-2 py-0.5"
      style={{ border: `1px solid ${color}`, color }}>
      {children}
    </span>
  );
}

function ParamRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-3 font-mono text-[12px]"
      style={{ borderBottom: '1px solid var(--hero-border)' }}>
      <span style={{ color: 'var(--hero-muted)' }}>{label}</span>
      <span style={{ color: accent ? 'var(--neon-green)' : 'var(--site-fg)', fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  );
}

// ── NEWS BOT ─────────────────────────────────────────────────────────────────
function NewsBotSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-news" ref={ref} style={{ borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="px-6 md:px-12 pt-16 pb-6">
        <div className="flex items-start justify-between mb-2">
          <Tag>01 / News Bot</Tag>
          <span className="font-mono text-[10px]" style={{ color: 'var(--hero-muted)' }}>claude-haiku-4-5</span>
        </div>
        <h2 className="font-black text-4xl md:text-6xl tracking-[-0.04em] leading-[0.88] mt-6 mb-4">
          News<br />Intelligence
        </h2>
        <p className="text-base md:text-lg leading-relaxed max-w-xl" style={{ color: 'var(--hero-muted-fg)' }}>
          Monitors 6 Telegram channels and Binance/Bybit announcement feeds in real-time.
          Groq LLaMA-3.1 pre-filters noise, Claude Haiku scores each signal on market impact.
          Positions open within seconds of a qualifying event.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{
        borderTop: '1px solid var(--hero-border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        {/* Sources */}
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--hero-border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>Signal Sources</div>
          {[
            '6 Telegram channels (crypto news)',
            'Binance new listing announcements',
            'Bybit listing announcements',
            'On-chain smart wallet tracker (10 wallets)',
            'Funding rate monitor (20 pairs, 15 min)',
            'DEX volume spikes (GeckoTerminal)',
          ].map(s => (
            <div key={s} className="flex items-start gap-3 py-2 font-mono text-[12px]" style={{ borderBottom: '1px solid var(--hero-border)', color: 'var(--hero-muted-fg)' }}>
              <span style={{ color: 'var(--neon-green)', flexShrink: 0 }}>→</span>{s}
            </div>
          ))}
        </div>

        {/* Params */}
        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>Trading Parameters</div>
          <ParamRow label="BTC / ETH leverage" value="2×" accent />
          <ParamRow label="BTC / ETH take profit" value="5%" accent />
          <ParamRow label="BTC / ETH stop loss" value="2%" />
          <ParamRow label="Altcoin leverage" value="3×" accent />
          <ParamRow label="Altcoin take profit" value="10%" accent />
          <ParamRow label="Altcoin stop loss" value="4%" />
          <ParamRow label="Position size" value="3–5% of balance" />
          <ParamRow label="Scan interval" value="30 seconds" />
          <ParamRow label="Min signal score" value="≥ 8 / 10" accent />
        </div>
      </div>

      {/* How scoring works */}
      <div className="px-6 md:px-12 py-8" style={{ borderTop: '1px solid var(--hero-border)', background: 'rgba(128,128,128,0.03)' }}>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>How Scoring Works</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { step: '01', title: 'Pre-filter', desc: 'Groq LLaMA-3.1 reads every event and discards generic market noise (< 1 second).' },
            { step: '02', title: 'Score', desc: 'Claude Haiku rates sentiment −10 to +10, weighs volume, funding rate, and trend.' },
            { step: '03', title: 'Execute', desc: 'Score ≥ 8 fires a LONG or SHORT on Bybit Futures with TP/SL attached.' },
          ].map(s => (
            <div key={s.step}>
              <div className="font-mono text-[10px] mb-2" style={{ color: 'var(--hero-muted)' }}>{s.step}</div>
              <div className="font-black text-lg mb-2">{s.title}</div>
              <div className="text-[13px] leading-relaxed" style={{ color: 'var(--hero-muted-fg)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── GRID BOT ─────────────────────────────────────────────────────────────────
function GridBotSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-grid" ref={ref} style={{ borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="px-6 md:px-12 pt-16 pb-6">
        <div className="flex items-start justify-between mb-2">
          <Tag>02 / Grid Bot</Tag>
          <span className="font-mono text-[10px]" style={{ color: 'var(--hero-muted)' }}>SOL · BTC · ETH</span>
        </div>
        <h2 className="font-black text-4xl md:text-6xl tracking-[-0.04em] leading-[0.88] mt-6 mb-4">
          Grid<br />Trading
        </h2>
        <p className="text-base md:text-lg leading-relaxed max-w-xl" style={{ color: 'var(--hero-muted-fg)' }}>
          Runs three parallel grids simultaneously on Bybit Futures.
          Buys low and sells high on every level — earns on sideways markets,
          trending moves, and everything in between. No directional prediction needed.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3" style={{
        borderTop: '1px solid var(--hero-border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        {[
          { symbol: 'SOL/USDT', levels: 10, size: '$30', leverage: '2×' },
          { symbol: 'BTC/USDT', levels: 8,  size: '$20', leverage: '2×' },
          { symbol: 'ETH/USDT', levels: 10, size: '$25', leverage: '2×' },
        ].map((g, i) => (
          <div key={g.symbol} style={{
            padding: '2rem',
            borderRight: i < 2 ? '1px solid var(--hero-border)' : 'none',
          }}>
            <div className="font-black text-2xl mb-1" style={{ color: 'var(--neon-green)' }}>{g.symbol}</div>
            <div className="space-y-0">
              <ParamRow label="Grid levels" value={g.levels} />
              <ParamRow label="Capital per level" value={g.size} accent />
              <ParamRow label="Leverage" value={g.leverage} />
              <ParamRow label="Range mode" value="Auto-range" />
            </div>
          </div>
        ))}
      </div>

      <div className="px-6 md:px-12 py-8" style={{ borderTop: '1px solid var(--hero-border)', background: 'rgba(128,128,128,0.03)' }}>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>Why Grid Trading</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: 'No prediction', desc: 'Profits from price oscillation, not direction. Works in flat, bull, and bear markets.' },
            { title: 'Auto-range', desc: 'Grid range recalculates automatically when price breaks out of the current window.' },
            { title: 'Always active', desc: 'Runs 24/7. Earns every time price crosses a grid line — no manual monitoring.' },
          ].map(s => (
            <div key={s.title}>
              <div className="font-black text-lg mb-2">{s.title}</div>
              <div className="text-[13px] leading-relaxed" style={{ color: 'var(--hero-muted-fg)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── LISTING SNIPER ────────────────────────────────────────────────────────────
function ListingSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-listing" ref={ref} style={{ borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="px-6 md:px-12 pt-16 pb-6">
        <div className="flex items-start justify-between mb-2">
          <Tag>03 / Listing Sniper</Tag>
          <span className="font-mono text-[10px]" style={{ color: 'var(--hero-muted)' }}>Binance · Bybit</span>
        </div>
        <h2 className="font-black text-4xl md:text-6xl tracking-[-0.04em] leading-[0.88] mt-6 mb-4">
          Listing<br />Sniper
        </h2>
        <p className="text-base md:text-lg leading-relaxed max-w-xl" style={{ color: 'var(--hero-muted-fg)' }}>
          Detects new token listings on Binance and Bybit the moment the announcement is published.
          Enters the position within seconds — before the typical 20–40% listing pump.
          High leverage, tight risk management.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{
        borderTop: '1px solid var(--hero-border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--hero-border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>Parameters</div>
          <ParamRow label="Leverage" value="5×" accent />
          <ParamRow label="Take profit" value="20%" accent />
          <ParamRow label="Stop loss" value="7%" />
          <ParamRow label="Position size" value="2% of balance" />
          <ParamRow label="Entry trigger" value="Announcement detected" />
          <ParamRow label="Polling rate" value="30 seconds" />
          <ParamRow label="Exchanges" value="Binance + Bybit" />
        </div>
        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>Why It Works</div>
          <div className="space-y-4 text-[13px] leading-relaxed" style={{ color: 'var(--hero-muted-fg)' }}>
            <p>New token listings on major exchanges generate immediate buying pressure. Retail traders react within minutes. The bot enters within seconds.</p>
            <p>Small 2% position size limits damage on failed listings. High 5× leverage amplifies the gain on successful entries.</p>
            <p>A 20% take-profit captures the peak of the initial pump without holding through the correction.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── DEX SNIPER ────────────────────────────────────────────────────────────────
function DexSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-dex" ref={ref} style={{ borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="px-6 md:px-12 pt-16 pb-6">
        <div className="flex items-start justify-between mb-2">
          <Tag>04 / DEX Sniper</Tag>
          <span className="font-mono text-[10px]" style={{ color: 'var(--hero-muted)' }}>BSC / PancakeSwap</span>
        </div>
        <h2 className="font-black text-4xl md:text-6xl tracking-[-0.04em] leading-[0.88] mt-6 mb-4">
          DEX<br />Sniper
        </h2>
        <p className="text-base md:text-lg leading-relaxed max-w-xl" style={{ color: 'var(--hero-muted-fg)' }}>
          Hunts new liquidity pools on PancakeSwap (BSC). Checks token contract safety via GoPlus API
          before every entry — avoiding honeypots, locked liquidity, and high-tax tokens.
          Targets early entries before CEX price discovery.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{
        borderTop: '1px solid var(--hero-border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--hero-border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>Parameters</div>
          <ParamRow label="DEX" value="PancakeSwap V2" />
          <ParamRow label="Chain" value="BSC (BEP-20)" />
          <ParamRow label="Trade size" value="0.03 BNB per trade" />
          <ParamRow label="Take profit" value="+100%" accent />
          <ParamRow label="Stop loss" value="−50%" />
          <ParamRow label="Safety check" value="GoPlus API" accent />
          <ParamRow label="Wallet" value="Isolated sniper wallet" />
        </div>
        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>Safety Checks (GoPlus)</div>
          {[
            'Honeypot detection',
            'Liquidity lock verification',
            'Ownership renounced check',
            'Buy/sell tax analysis',
            'Contract risk score',
          ].map(s => (
            <div key={s} className="flex items-center gap-3 py-2 font-mono text-[12px]" style={{ borderBottom: '1px solid var(--hero-border)', color: 'var(--hero-muted-fg)' }}>
              <span style={{ color: '#22c55e' }}>✓</span>{s}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function BotSections() {
  return (
    <div id="bots">
      <NewsBotSection />
      <GridBotSection />
      <ListingSection />
      <DexSection />
    </div>
  );
}
