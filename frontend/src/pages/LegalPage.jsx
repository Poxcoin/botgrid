import React, { useEffect } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';
import { usePageTitle } from '@/lib/usePageTitle';

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

const RISK_EN = {
  title: 'Risk Disclosure',
  updated: 'Last updated: 2026-05-18',
  body: [
    {
      h: '1. General market risk',
      p: 'Trading cryptocurrencies and crypto derivatives is highly speculative. Cryptocurrency markets operate 24 hours a day, 7 days a week and are not subject to the same regulatory oversight as traditional financial markets. Prices can move 10–50% or more within hours and you may lose your entire allocated capital. Do not allocate funds you cannot afford to lose entirely. This is not a savings product.',
    },
    {
      h: '2. Volatility and liquidity risk',
      p: 'Cryptocurrency prices are subject to extreme volatility driven by market sentiment, social media, regulatory announcements, macroeconomic events, and exchange-level liquidity events. During periods of low liquidity, your orders may execute at significantly worse prices than expected (slippage), or may not fill at all. In fast-moving markets, stop-loss orders are not guaranteed to execute at the specified price.',
    },
    {
      h: '3. Leverage and liquidation risk',
      p: 'Several KADO bots trade perpetual futures contracts using leverage (typically between 2× and 10×, configurable). Leverage amplifies both gains and losses. A 10% adverse move on a 10× leveraged position results in 100% loss of margin. Liquidation can occur within minutes during highly volatile conditions. KADO does not prevent liquidation — it is your responsibility to monitor margin levels and set appropriate position sizes. We strongly recommend using leverage of 3× or less until you are fully familiar with each strategy.',
    },
    {
      h: '4. Technical and operational risk',
      p: 'KADO automates order placement via your exchange API. The following technical events may cause unintended outcomes: (a) network latency or internet outages preventing order submission; (b) exchange API rate limits or maintenance windows causing delayed execution; (c) software bugs or unexpected changes to exchange API behavior; (d) server downtime for maintenance or upgrades; (e) incorrect position states if an order confirmation is lost in transit. Always monitor your open positions independently via the exchange interface.',
    },
    {
      h: '5. Exchange counterparty risk',
      p: 'Your funds are held on Bybit, a centralised cryptocurrency exchange. KADO has no control over Bybit\'s operations. You bear the counterparty risk of exchange insolvency, withdrawal suspensions, security breaches, regulatory actions, or any operational failure by Bybit or its custodians. KADO is not responsible for exchange-side losses. Diversify across exchanges where possible and do not hold more capital on any exchange than you are prepared to lose.',
    },
    {
      h: '6. API key and account security risk',
      p: 'KADO accesses your exchange via API keys you provide. Only trade-only API keys should ever be used — never grant withdrawal permissions. Despite our security measures (AES-256 key encryption, IP whitelisting recommendations, HTTPS-only communication), your API keys could theoretically be compromised through phishing, malware on your device, or a breach of your KADO account. You are responsible for securing your own devices, email accounts, and KADO login credentials. Enable two-factor authentication (TOTP) on both your KADO account and your Bybit account.',
    },
    {
      h: '7. Smart contract and DeFi risk',
      p: 'The DEX Sniper (BSC) and certain other bots interact with decentralised protocols on public blockchains. Smart contracts may contain exploits, rug-pulls, honeypot token mechanics, or front-running vulnerabilities. On-chain transactions are irreversible. Gas fee spikes on BSC or Ethereum can significantly alter the economics of a trade. KADO performs basic token safety checks but cannot guarantee any token is safe.',
    },
    {
      h: '8. Regulatory and compliance risk',
      p: 'Cryptocurrency regulation is evolving rapidly. Activities permitted today may become restricted or prohibited in your jurisdiction. You are solely responsible for determining whether using KADO is lawful in your country, complying with all applicable regulations (including KYC/AML requirements imposed by your exchange), and reporting trading gains and losses for tax purposes. KADO is not available to residents of the following jurisdictions: United States of America, Iran, North Korea, Cuba, Syria, Russia, Belarus, and any jurisdiction subject to comprehensive OFAC sanctions or where such trading services are prohibited by local law. This list may be updated without notice.',
    },
    {
      h: '9. Past performance is not indicative of future results',
      p: 'Any performance data, win rates, backtests, or profit projections displayed on the KADO platform or in marketing materials represent historical or simulated results under specific market conditions. Past performance does not guarantee future results. Market regimes change — a strategy with a historical win rate of 83% may underperform or lose money in future market conditions. Strategy returns will vary by user based on entry timing, position sizing, leverage, and market conditions at the time of use.',
    },
    {
      h: '10. No advisory relationship',
      p: 'KADO is a software tool, not an investment adviser. Nothing on the platform, in its documentation, news feed, signal explanations, or communications constitutes financial, investment, legal, or tax advice. KADO is not registered as an investment adviser, broker-dealer, or financial institution in any jurisdiction. All trading decisions, including whether to activate any bot, configure any strategy, or allocate any capital, are made solely by you.',
    },
    {
      h: '11. Limitation of liability',
      p: 'To the maximum extent permitted by applicable law, KADO and its operators, employees, agents, and affiliates shall not be liable for: (a) any direct, indirect, incidental, consequential, or punitive damages; (b) loss of profits, revenue, capital, or data; (c) losses arising from exchange failure, API downtime, software bugs, or communication failures; (d) any regulatory action against your account or exchange; (e) taxes owed on trading profits. Our aggregate liability, in all cases, shall not exceed the total fees you have paid to KADO in the twelve months preceding the claim.',
    },
    {
      h: '12. Risk acknowledgement',
      p: 'By using KADO, you confirm that: you understand the risks set out in this document; you are trading with funds you can afford to lose entirely; you have independently assessed the suitability of automated crypto trading for your financial situation; you have not relied on any KADO communication as investment advice; and you accept full responsibility for your trading activity and its outcomes.',
    },
  ],
  contact: 'Risk disclosure questions: support@kadoclub.net',
};

const TERMS_EN = {
  title: 'Terms of Service',
  updated: 'Last updated: 2026-05-18',
  body: [
    {
      h: '1. Acceptance of terms',
      p: 'By accessing kadoclub.net, registering for an account, or using any KADO service, you agree to be bound by these Terms of Service ("Terms"), together with our Risk Disclosure and Privacy Policy, each of which is incorporated by reference. If you do not agree to these Terms in their entirety, you must not access or use the service. Your continued use of the service after any update to these Terms constitutes acceptance of the updated Terms.',
    },
    {
      h: '2. Eligibility and restricted jurisdictions',
      p: 'You must be at least 18 years old (or the age of legal majority in your jurisdiction, if higher) and legally capable of entering into binding contracts. KADO is not available to residents of the United States of America, Iran, North Korea, Cuba, Syria, Russia, Belarus, or any jurisdiction where the use of automated crypto trading services is prohibited or requires a license we do not hold. By registering, you represent and warrant that you are not a resident of any restricted jurisdiction and that your use of KADO complies with all applicable laws.',
    },
    {
      h: '3. Account registration and security',
      p: 'You must provide accurate, current, and complete information during registration. You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. You must: (a) use a unique, strong password; (b) enable TOTP two-factor authentication; (c) never share your account with third parties; (d) never grant withdrawal permissions to any API key used with KADO. If you suspect unauthorised access, you must notify us immediately at support@kadoclub.net and change your credentials without delay.',
    },
    {
      h: '4. Description of service',
      p: 'KADO is a non-custodial automated trading software platform. It connects to your cryptocurrency exchange account (Bybit) via API keys that you supply, and executes trading strategies on your behalf according to your configuration. KADO does not hold, manage, or take custody of your funds at any point — your assets remain on the exchange at all times. KADO does not provide investment advice, portfolio management, or any regulated financial service. The automated nature of the service means trades will execute continuously without requiring your manual approval, and positions may be opened or closed at any time in accordance with the active strategy.',
    },
    {
      h: '5. Performance fee — calculation and settlement',
      p: 'Users on the Performance plan are charged 25% of net new profits, calculated monthly under a strict high-water-mark (HWM) policy. The HWM is the highest account equity value achieved at the close of any prior fee period. Example: if your HWM is $10,000 and your account reaches $11,200 at month end, the profit above HWM is $1,200 and the performance fee is $300 (25%). If your account closes at $10,500 — below your new HWM of $11,200 — no fee is charged that month. Fees are calculated in USDT based on your Bybit account equity at 00:00 UTC on the first day of each calendar month. Invoices are issued within 3 business days of period end and must be settled within 14 calendar days. Late payment beyond 14 days may result in suspension of bot execution until the outstanding balance is cleared. Fees are non-refundable once settled.',
    },
    {
      h: '6. Referral program',
      p: 'KADO operates a referral program. When you refer a new user who registers via your unique referral link, you receive 5% of the performance fees generated by that referred user, paid monthly for the lifetime of their active subscription. Referral fees are credited in USDT alongside your own fee settlement. The referral relationship is established at the time of registration and is non-transferable. Self-referrals and attempts to abuse the program (including using multiple accounts or fictitious identities) will result in forfeiture of all earned referral credits and account termination. KADO reserves the right to modify or terminate the referral program with 30 days prior notice posted on the platform.',
    },
    {
      h: '7. AML and compliance obligations',
      p: 'You represent and warrant that: (a) you are not on any sanctions list, including OFAC SDN, EU Consolidated List, or UN Security Council sanctions; (b) all funds used on the platform are from legitimate sources; (c) you are not using KADO to launder money, evade taxes, or engage in any fraudulent activity. KADO reserves the right to request identity verification documents (KYC) from any user and to suspend accounts pending satisfactory verification. KADO will report suspicious activity to relevant authorities as required by applicable law.',
    },
    {
      h: '8. Prohibited conduct',
      p: 'You agree not to: (a) use KADO to engage in wash trading, spoofing, front-running, or any form of market manipulation; (b) reverse-engineer, decompile, disassemble, or otherwise attempt to extract the source code or logic of KADO\'s trading algorithms or software; (c) scrape, crawl, or systematically extract data from the platform using automated tools; (d) attempt to circumvent security controls, authentication systems, or rate limiting; (e) sell, sublicense, resell, or commercially exploit access to KADO; (f) make false claims about KADO\'s performance in any public communication; (g) create competing products based on knowledge derived from using KADO.',
    },
    {
      h: '9. Intellectual property',
      p: 'The KADO platform — including its source code, trading algorithms, signal generation logic, bot architecture, user interface, brand identity, documentation, and all underlying business methodology — is the exclusive intellectual property of KADO and its operators, protected under applicable copyright, trade secret, and intellectual property laws. No licence is granted to copy, reproduce, adapt, or exploit any element of the platform. Any person or entity found to have copied, misappropriated, or commercially exploited any part of KADO\'s proprietary systems will be subject to civil legal action including claims for damages, disgorgement of profits, injunctive relief, and full recovery of legal costs. KADO actively monitors for unauthorised replications.',
    },
    {
      h: '10. Confidentiality and proprietary data',
      p: 'Trading signals, strategy configurations, performance data, system architecture details, and pricing models accessible through KADO are proprietary and confidential. You agree not to disclose, reproduce, or commercially exploit this information. User account data is personal data governed by our Privacy Policy. The obligation of confidentiality survives termination of these Terms.',
    },
    {
      h: '11. Service availability',
      p: 'KADO aims to maintain high availability but does not guarantee uninterrupted service. Planned maintenance will be announced via the dashboard and/or Telegram channel with at least 24 hours notice where practicable. Emergency maintenance may occur without advance notice. KADO is not liable for losses arising from planned or unplanned downtime. It is your responsibility to close open positions manually via your exchange if you cannot accept the risk of the service being temporarily unavailable.',
    },
    {
      h: '12. Force majeure',
      p: 'KADO shall not be liable for any delay, failure, or interruption of service caused by events beyond our reasonable control, including: natural disasters, government actions, internet infrastructure failures, exchange outages, blockchain network congestion, DDoS attacks, cyberattacks on our infrastructure, regulatory interventions, pandemics, or any other event that a reasonable business could not have predicted or prevented.',
    },
    {
      h: '13. Termination',
      p: 'You may terminate your account at any time by removing your API keys from the dashboard and submitting a deletion request to support@kadoclub.net. Outstanding performance fees become immediately due upon termination. KADO may suspend or terminate your access without liability for: breach of these Terms, non-payment of fees, suspicious account activity, AML/compliance concerns, legal obligation, or at our sole discretion with 7 days notice. Upon termination, your right to use the service ceases immediately.',
    },
    {
      h: '14. Disclaimers',
      p: 'The service is provided "as is" and "as available" without warranties of any kind, express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, accuracy of signals, or uninterrupted, error-free operation. KADO does not warrant that any trading strategy will be profitable or that historical win rates will be maintained in the future.',
    },
    {
      h: '15. Limitation of liability',
      p: 'To the maximum extent permitted by law, KADO\'s total aggregate liability to you for any and all claims arising from use of the service shall not exceed the total fees you have paid to KADO in the twelve months immediately preceding the claim. KADO is not liable for indirect, consequential, incidental, special, or punitive damages, including loss of profit, capital, opportunity, or data, even if advised of the possibility of such damages.',
    },
    {
      h: '16. Governing law and dispute resolution',
      p: 'These Terms are governed by applicable commercial law. In the event of a dispute, you agree to first attempt informal resolution by contacting legal@kadoclub.net — most issues can be resolved within 30 days. If informal resolution fails, disputes shall be submitted to binding arbitration under internationally recognised arbitration rules. Class actions and jury trials are waived to the extent permitted by applicable law.',
    },
    {
      h: '17. Amendments',
      p: 'We may update these Terms at any time. Material changes will be communicated to your registered email address and via a prominent dashboard notification at least 7 calendar days before the effective date. Changes to fee structures will be communicated at least 30 days in advance. If you disagree with any change, your remedy is to close your open positions and terminate your account before the effective date.',
    },
    {
      h: '18. Severability and entire agreement',
      p: 'If any provision of these Terms is found to be unenforceable, the remaining provisions remain in full force. These Terms, together with the Risk Disclosure and Privacy Policy, constitute the entire agreement between you and KADO regarding the service and supersede all prior agreements or representations.',
    },
  ],
  contact: 'Legal inquiries: legal@kadoclub.net',
};

const PRIVACY_EN = {
  title: 'Privacy Policy',
  updated: 'Last updated: 2026-05-18',
  body: [
    {
      h: '1. Who we are and scope',
      p: 'KADO ("we", "us") operates the automated trading platform at kadoclub.net. This Privacy Policy explains what personal data we collect, why we collect it, how we protect it, and your rights as a data subject. KADO operates from infrastructure located in Germany (EU), and this policy is designed to comply with the European Union General Data Protection Regulation (GDPR, Regulation 2016/679) and other applicable data protection laws.',
    },
    {
      h: '2. Data we collect and legal basis',
      p: 'We collect the following categories of personal data: (a) Account data — your email address and chosen username, collected on registration; legal basis: performance of contract. (b) Exchange API credentials — your Bybit API key and secret, encrypted with AES-256-CBC Fernet before storage; legal basis: performance of contract. (c) Telegram ID — your Telegram chat ID if you connect our notification bot; legal basis: consent. (d) Trading history — records of orders placed by our bot on your behalf; legal basis: performance of contract and legitimate interests (service improvement). (e) Technical logs — your IP address in server access logs (retained 30 days); legal basis: legitimate interests (security and fraud prevention). (f) Session and consent data — authentication JWT token (httpOnly, Secure, 24h expiry) and your cookie consent preference; legal basis: necessary for security / consent.',
    },
    {
      h: '3. What we explicitly do not collect',
      p: 'We do not collect or store: withdrawal-capable API keys (withdrawal permission should never be granted and we will reject key validation if detected); payment card numbers or banking details; government ID or passport data unless voluntarily submitted for KYC; biometric data; data from minors under 18; or browsing history beyond the KADO platform.',
    },
    {
      h: '4. How we store and protect your data',
      p: 'Your data is stored in a secured SQLite database with WAL journaling on a Hetzner VPS server located in Falkenstein, Germany (EU). Security measures in place include: TLS 1.3 encryption for all data in transit; AES-256-CBC Fernet encryption for API keys at rest; bcrypt (cost factor 12) password hashing — passwords are never stored or logged in any recoverable form; TOTP-based two-factor authentication available to all users; IP-aware rate limiting on authentication endpoints; Cloudflare WAF and DDoS protection at the network edge; automated hourly SQLite backups with 24-hour, 7-day, 4-week, and 12-month retention tiers.',
    },
    {
      h: '5. Sub-processors and third-party services',
      p: 'We share data with the following third-party processors, each under a Data Processing Agreement (DPA) or adequate legal mechanism: Hetzner Online GmbH (Germany, EU) — VPS hosting, processes all server-stored data; Cloudflare Inc. (USA, SCCs) — CDN, WAF, and web analytics (privacy-preserving, cookieless); Bybit Fintech Ltd — receives your encrypted API credentials for trade execution only, under their published API terms; Telegram Messenger (voluntary opt-in only) — receives your Telegram chat ID for trade notifications; Groq Inc. (USA, SCCs) — AI inference for news analysis features, receives anonymised text only. We do not share personal data with advertisers, data brokers, or any party not listed above.',
    },
    {
      h: '6. International data transfers',
      p: 'Our primary data processing occurs on servers in Germany (EU). Where data is transferred to processors outside the EU/EEA (specifically Cloudflare and Groq, both based in the USA), we rely on Standard Contractual Clauses (SCCs) approved by the European Commission as the legal transfer mechanism. No personal data is transferred to any country without an adequacy decision or approved safeguards.',
    },
    {
      h: '7. Your GDPR rights',
      p: 'Under GDPR, you have the following rights, exercisable by contacting privacy@kadoclub.net: (a) Right of access — request a copy of all personal data we hold about you; (b) Right to rectification — correct inaccurate data; (c) Right to erasure ("right to be forgotten") — request deletion of your account and all associated personal data; (d) Right to data portability — receive your data in a structured, machine-readable JSON format; (e) Right to restriction — restrict processing in certain circumstances; (f) Right to object — object to processing based on legitimate interests; (g) Right to withdraw consent — where processing is based on consent (e.g. Telegram notifications), you may withdraw at any time. We will respond to all requests within 30 calendar days. If we are unable to comply, we will explain why.',
    },
    {
      h: '8. Right to lodge a complaint',
      p: 'If you believe we have handled your data unlawfully, you have the right to lodge a complaint with the competent supervisory authority. As our primary infrastructure is in Germany, the relevant authority is the Bayerisches Landesamt für Datenschutzaufsicht (BayLDA) or the Federal Commissioner for Data Protection and Freedom of Information (BfDI). You may also contact the supervisory authority in your country of residence.',
    },
    {
      h: '9. Data retention',
      p: 'While your account is active, we retain your data as necessary to provide the service. Upon account deletion: your personal data and API credentials are permanently deleted within 30 calendar days; anonymised trading records (no personally identifying fields) may be retained for up to 2 years for tax and regulatory compliance; server logs are purged at 30 days on a rolling basis. Upon request, we can provide a deletion confirmation receipt.',
    },
    {
      h: '10. Cookies and tracking',
      p: 'We use only two cookies: kado_token (JWT session cookie — httpOnly, Secure flag, SameSite=Strict, 24-hour expiry) used for authentication; and kado_cookie_consent (your cookie consent preference, 1-year expiry). We do not use advertising cookies, cross-site tracking pixels, or any third-party analytics cookies. Our web analytics are provided by Cloudflare Web Analytics, which is privacy-preserving and cookieless — it does not track individuals or set cookies. To reset your cookie consent banner, clear the kado_cookie_consent localStorage key.',
    },
    {
      h: '11. Data breach notification',
      p: 'In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will notify the competent supervisory authority within 72 hours of becoming aware of the breach, as required by GDPR Article 33. If the breach is likely to result in a high risk to your rights, we will also notify you directly by email without undue delay, describing the nature of the breach, likely consequences, and steps we are taking. We maintain an internal data breach register.',
    },
    {
      h: '12. Children\'s privacy',
      p: 'KADO is not directed at persons under the age of 18 and we do not knowingly collect personal data from minors. If we become aware that a minor has registered an account, we will delete the account and all associated data immediately. If you believe a minor has provided us with their data, contact privacy@kadoclub.net.',
    },
    {
      h: '13. Changes to this policy',
      p: 'We may update this Privacy Policy from time to time. Material changes — particularly those affecting your rights or the legal basis of processing — will be communicated by email to your registered address and through a prominent dashboard notice at least 7 days before taking effect. The date of the last update is shown at the top of this policy. Continued use of the service after the effective date of an update constitutes your acceptance of the revised policy.',
    },
  ],
  contact: 'Privacy and GDPR inquiries: privacy@kadoclub.net',
};

function LegalPage({ doc }) {
  useEffect(() => {
    if (window.location.hash) {
      const el = document.querySelector(window.location.hash);
      if (el) { setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }
    } else {
      window.scrollTo(0, 0);
    }
  }, []);
  usePageTitle(doc.title);
  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: FONT, minHeight: '100vh' }}>
      <LandingHeader />
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '80px 32px 100px' }}>

        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontSize: 'clamp(30px,5vw,50px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05, margin: '0 0 14px' }}>
            {doc.title}
          </h1>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {doc.updated}
          </div>
        </div>

        {/* Table of contents */}
        <nav style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '20px 24px', marginBottom: 52 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', color: '#444', textTransform: 'uppercase', marginBottom: 14 }}>
            Contents
          </div>
          <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {doc.body.map((sec, i) => (
              <li key={i}>
                <a
                  href={`#section-${i}`}
                  style={{ fontFamily: FONT, fontSize: 13, color: '#555', textDecoration: 'none', lineHeight: 1.4, transition: 'color 150ms' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#aaa'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
                >
                  {sec.h}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Body sections */}
        <div>
          {doc.body.map((sec, i) => (
            <section key={i} id={`section-${i}`} style={{ marginBottom: 36, paddingBottom: 36, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 12, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {sec.h}
              </h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.85, margin: 0 }}>
                {sec.p}
              </p>
            </section>
          ))}
        </div>

        {/* Contact */}
        <div style={{ marginTop: 48, padding: '20px 24px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, fontFamily: FONT, fontSize: 13, color: 'var(--text-secondary)' }}>
          {doc.contact}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}

export function RiskDisclosurePage()  { return <LegalPage doc={RISK_EN} />; }
export function TermsOfServicePage()  { return <LegalPage doc={TERMS_EN} />; }
export function PrivacyPolicyPage()   { return <LegalPage doc={PRIVACY_EN} />; }
