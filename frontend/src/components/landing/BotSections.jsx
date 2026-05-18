import React from 'react';
import useScrollReveal from '@/lib/useScrollReveal';

function Tag({ children }) {
  return (
    <span className="font-mono text-[9px] tracking-[0.25em] uppercase px-2 py-0.5"
      style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
      {children}
    </span>
  );
}

function ParamRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-3 font-mono text-[12px]"
      style={{ borderBottom: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ color: 'var(--fg)', fontWeight: accent ? 600 : 400 }}>{value}</span>
    </div>
  );
}

function SectionHeader({ tag, sub, title, desc }) {
  return (
    <div className="px-6 md:px-12 pt-14 pb-6">
      <div className="flex items-start justify-between mb-2">
        <Tag>{tag}</Tag>
        {sub && <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>{sub}</span>}
      </div>
      <h2 className="font-black text-4xl md:text-6xl tracking-[-0.04em] leading-[0.88] mt-6 mb-4">
        {title}
      </h2>
      <p className="text-base leading-relaxed max-w-xl" style={{ color: 'var(--muted-fg)' }}>
        {desc}
      </p>
    </div>
  );
}

// ── NEWS BOT ──
function NewsBotSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-news" ref={ref} style={{ borderBottom: '1px solid var(--border)' }}>
      <SectionHeader
        tag="01 / News Bot" sub="claude-haiku-4-5"
        title={<>News<br />Intelligence</>}
        desc="Monitors 6 Telegram channels and Binance/Bybit announcement feeds in real-time. Groq LLaMA-3.1 pre-filters noise, Claude Haiku scores each signal on market impact. Positions open within seconds of a qualifying event."
      />

      <div className="grid grid-cols-1 md:grid-cols-2" style={{
        borderTop: '1px solid var(--border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Signal Sources</div>
          {[
            '6 Telegram channels (crypto news)',
            'Binance new listing announcements',
            'Bybit listing announcements',
            'On-chain smart wallet tracker (10 wallets)',
            'Funding rate monitor (30 pairs, 15 min)',
            'DEX volume spikes (GeckoTerminal)',
          ].map(s => (
            <div key={s} className="flex items-start gap-3 py-2.5 font-mono text-[12px]" style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
              <span style={{ color: 'var(--fg)', opacity: 0.4, flexShrink: 0 }}>→</span>{s}
            </div>
          ))}
        </div>

        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Trading Parameters</div>
          <ParamRow label="BTC / ETH leverage"   value="2×"              accent />
          <ParamRow label="BTC / ETH take profit" value="5%"              accent />
          <ParamRow label="BTC / ETH stop loss"   value="2%" />
          <ParamRow label="Altcoin leverage"      value="3×"              accent />
          <ParamRow label="Altcoin take profit"   value="10%"             accent />
          <ParamRow label="Altcoin stop loss"     value="4%" />
          <ParamRow label="Position size"         value="3–5% of balance" />
          <ParamRow label="Scan interval"         value="30 seconds" />
          <ParamRow label="Min signal score"      value="≥ 8 / 10"        accent />
        </div>
      </div>

      <div className="px-6 md:px-12 py-8" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-6" style={{ color: 'var(--muted)' }}>How Scoring Works</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { n: '01', title: 'Pre-filter', desc: 'Groq LLaMA-3.1 discards generic market noise in under 1 second.' },
            { n: '02', title: 'Score',      desc: 'Claude Haiku rates sentiment, weighs volume, funding rate, and trend context.' },
            { n: '03', title: 'Execute',    desc: 'Score ≥ 8 fires a LONG or SHORT on Bybit Futures with TP/SL attached.' },
          ].map(s => (
            <div key={s.n}>
              <div className="font-mono text-[9px] mb-2" style={{ color: 'var(--muted)' }}>{s.n}</div>
              <div className="font-black text-lg mb-2">{s.title}</div>
              <div className="text-[13px] leading-relaxed font-mono" style={{ color: 'var(--muted-fg)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── GRID BOT ──
function GridBotSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-grid" ref={ref} style={{ borderBottom: '1px solid var(--border)' }}>
      <SectionHeader
        tag="02 / Grid Bot" sub="SOL · BTC · ETH · DOGE · XRP"
        title={<>Grid<br />Trading</>}
        desc="Runs five parallel ATR-adaptive grids on Bybit Futures. Buys low and sells high on every level — earns on sideways markets, trending moves, and everything in between. No directional prediction needed."
      />

      <div className="grid grid-cols-2 md:grid-cols-5" style={{
        borderTop: '1px solid var(--border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        {[
          { symbol: 'SOL/USDT', levels: 10, leverage: '2×' },
          { symbol: 'BTC/USDT', levels: 8,  leverage: '2×' },
          { symbol: 'ETH/USDT', levels: 10, leverage: '2×' },
          { symbol: 'DOGE/USDT',levels: 10, leverage: '3×' },
          { symbol: 'XRP/USDT', levels: 10, leverage: '3×' },
        ].map((g, i) => (
          <div key={g.symbol} style={{
            padding: '1.5rem',
            borderRight: i < 4 ? '1px solid var(--border)' : 'none',
          }}>
            <div className="font-black text-base mb-3" style={{ letterSpacing: '-0.02em' }}>{g.symbol.replace('/USDT','')}</div>
            <ParamRow label="Levels"   value={g.levels} />
            <ParamRow label="Leverage" value={g.leverage} accent />
            <ParamRow label="Spacing"  value="ATR×10" />
          </div>
        ))}
      </div>

      <div className="px-6 md:px-12 py-8" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-6" style={{ color: 'var(--muted)' }}>Key Features</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: 'No prediction needed', desc: 'Profits from price oscillation regardless of direction. Works in flat, bull, and bear markets.' },
            { title: 'ATR-adaptive spacing',  desc: 'Grid spacing recalculates based on ATR(14,1h)×10. Wide in volatile markets, tight in calm ones.' },
            { title: 'BTC dump filter',       desc: 'New longs pause when BTC drops >2.5% in 2h. Hard stop at −3% daily per coin.' },
          ].map(s => (
            <div key={s.title}>
              <div className="font-black text-lg mb-2">{s.title}</div>
              <div className="text-[13px] leading-relaxed font-mono" style={{ color: 'var(--muted-fg)' }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── LISTING SNIPER ──
function ListingSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-listing" ref={ref} style={{ borderBottom: '1px solid var(--border)' }}>
      <SectionHeader
        tag="03 / Listing Sniper" sub="Binance · Bybit"
        title={<>Listing<br />Sniper</>}
        desc="Detects new token listings on Binance and Bybit the moment the announcement is published. Enters the position within seconds — before the typical 20–40% listing pump. Partial TP + trailing stop."
      />

      <div className="grid grid-cols-1 md:grid-cols-2" style={{
        borderTop: '1px solid var(--border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Parameters</div>
          <ParamRow label="Leverage"       value="5×"                     accent />
          <ParamRow label="TP1 (partial)"  value="+10% (50% of position)" accent />
          <ParamRow label="TP2 (trailing)" value="+20%"                   accent />
          <ParamRow label="Stop loss"      value="7%" />
          <ParamRow label="Position size"  value="2% of balance" />
          <ParamRow label="Polling rate"   value="30 seconds" />
          <ParamRow label="DEX filter"     value="GeckoTerminal >$100K" />
        </div>
        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Why It Works</div>
          <div className="space-y-4 text-[13px] leading-relaxed font-mono" style={{ color: 'var(--muted-fg)' }}>
            <p>New listings generate immediate buying pressure. Retail reacts in minutes. The bot enters in seconds.</p>
            <p>DEX filter skips coins already pumped on-chain — avoiding entries at the top of a pre-pump.</p>
            <p>Partial TP locks 50% of profit at +10%. Remaining 50% trails up to +20% with a 2.5% trailing stop.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── FUNDING RATE ──
function FundingSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-funding" ref={ref} style={{ borderBottom: '1px solid var(--border)' }}>
      <SectionHeader
        tag="04 / Funding Rate" sub="30 perpetuals"
        title={<>Funding<br />Rate Arb</>}
        desc="Mean-reversion strategy across 30 perpetual markets. When funding rate is extreme, the market is overstretched — and price tends to revert. Three-tier entry based on funding rate magnitude."
      />

      <div className="grid grid-cols-1 md:grid-cols-2" style={{
        borderTop: '1px solid var(--border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Tiered Entry</div>
          <ParamRow label="T1 (FR > 0.04%)" value="0.5× position" accent />
          <ParamRow label="T2 (FR > 0.06%)" value="1.0× position" accent />
          <ParamRow label="T3 (FR > 0.10%)" value="1.5× position" accent />
          <ParamRow label="Direction > 0"   value="SHORT (longs overpaying)" />
          <ParamRow label="Direction < 0"   value="LONG (shorts squeezed)" />
          <ParamRow label="RSI confirmation" value="RSI > 65 or < 35" />
          <ParamRow label="Cycle interval"  value="15 minutes" />
        </div>
        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Market Coverage</div>
          <div className="font-mono text-[12px] leading-relaxed" style={{ color: 'var(--muted-fg)' }}>
            <p className="mb-3">30 perpetual pairs monitored every 15 minutes. Includes BTC, ETH, SOL, BNB, XRP, DOGE, and 24 mid-cap altcoins.</p>
            <p className="mb-3">FR trend bonus: if funding rate has been rising for 3+ consecutive cycles, entry score gets +1.5 boost.</p>
            <p>Take profit: 0.5–1.5% (mean reversion target). Stop loss: 2%. Leverage: 2×.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── DEX SNIPER ──
function DexSection() {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id="bot-dex" ref={ref} style={{ borderBottom: '1px solid var(--border)' }}>
      <SectionHeader
        tag="05 / DEX Sniper" sub="BSC / PancakeSwap"
        title={<>DEX<br />Sniper</>}
        desc="Hunts new liquidity pools on PancakeSwap BSC. Every contract passes a GoPlus safety check before entry — honeypot detection, ownership verification, tax analysis. Targets early entries before CEX price discovery."
      />

      <div className="grid grid-cols-1 md:grid-cols-2" style={{
        borderTop: '1px solid var(--border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Parameters</div>
          <ParamRow label="DEX"         value="PancakeSwap V2" />
          <ParamRow label="Chain"       value="BSC (BEP-20)" />
          <ParamRow label="Trade size"  value="0.03 BNB per trade" />
          <ParamRow label="Take profit" value="+100%"               accent />
          <ParamRow label="Stop loss"   value="−50%" />
          <ParamRow label="Safety"      value="GoPlus API"           accent />
          <ParamRow label="Wallet"      value="Isolated sniper wallet" />
        </div>
        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-4" style={{ color: 'var(--muted)' }}>Safety Checks (GoPlus)</div>
          {[
            'Honeypot detection',
            'Liquidity lock verification',
            'Ownership renounced check',
            'Buy / sell tax analysis',
            'Contract risk score',
          ].map(s => (
            <div key={s} className="flex items-center gap-3 py-2.5 font-mono text-[12px]"
              style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
              <span style={{ color: 'var(--fg)', opacity: 0.5, flexShrink: 0 }}>✓</span>{s}
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
      <FundingSection />
      <DexSection />
    </div>
  );
}
