import React, { useState } from 'react';
import TopBar from '@/components/dashboard/TopBar';
import TabNav from '@/components/dashboard/TabNav';
import OverviewTab from '@/components/dashboard/OverviewTab';
import SignalHistoryTab from '@/components/dashboard/SignalHistoryTab';
import BotAnalyzerTab from '@/components/dashboard/BotAnalyzerTab';
import ExchangeKeysTab from '@/components/dashboard/ExchangeKeysTab';
import SystemLogsTab from '@/components/dashboard/SystemLogsTab';
import BacktesterTab from '@/components/dashboard/BacktesterTab';
import SecurityTab from '@/components/dashboard/SecurityTab';

function EmailBanner() {
  const user = (() => { try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); } catch { return {}; } })();
  if (user.email_verified) return null;
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-8 py-3 flex items-center justify-between gap-4">
      <div className="font-mono text-[11px] tracking-[0.15em] text-amber-700">
        ⚠ Email not verified — some features may be limited.
      </div>
      <span className="font-mono text-[10px] text-amber-500 tracking-widest">Check your inbox</span>
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="min-h-screen bg-white text-kado-black">
      <TopBar />
      <EmailBanner />
      <TabNav active={tab} onChange={setTab} />
      <main>
        {tab === 'overview'    && <OverviewTab />}
        {tab === 'history'     && <SignalHistoryTab />}
        {tab === 'analyzer'    && <BotAnalyzerTab />}
        {tab === 'backtester'  && <BacktesterTab />}
        {tab === 'keys'        && <ExchangeKeysTab />}
        {tab === 'logs'        && <SystemLogsTab />}
        {tab === 'security'    && <SecurityTab />}
      </main>
    </div>
  );
}
