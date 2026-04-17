import React, { useState } from 'react';
import TopBar from '@/components/dashboard/TopBar';
import TabNav from '@/components/dashboard/TabNav';
import OverviewTab from '@/components/dashboard/OverviewTab';
import SignalHistoryTab from '@/components/dashboard/SignalHistoryTab';
import BotAnalyzerTab from '@/components/dashboard/BotAnalyzerTab';
import ExchangeKeysTab from '@/components/dashboard/ExchangeKeysTab';
import SystemLogsTab from '@/components/dashboard/SystemLogsTab';
import BacktesterTab from '@/components/dashboard/BacktesterTab';

export default function Dashboard() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="min-h-screen bg-white text-kado-black">
      <TopBar />
      <TabNav active={tab} onChange={setTab} />
      <main>
        {tab === 'overview'    && <OverviewTab />}
        {tab === 'history'     && <SignalHistoryTab />}
        {tab === 'analyzer'    && <BotAnalyzerTab />}
        {tab === 'backtester'  && <BacktesterTab />}
        {tab === 'keys'        && <ExchangeKeysTab />}
        {tab === 'logs'        && <SystemLogsTab />}
      </main>
    </div>
  );
}
