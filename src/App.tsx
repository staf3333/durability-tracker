import { useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { TodayView } from './components/TodayView';
import { CheckInView, ExportView, HistoryView, RulesView } from './components/Views';
import { defaultDay, fmtDate, todayKey } from './lib/plan';

const TABS = [
  ['today', 'Today'], ['check', 'Check-in'], ['history', 'History'],
  ['export', 'Export'], ['rules', 'Rules'],
] as const;
type Tab = (typeof TABS)[number][0];

function Shell() {
  const [tab, setTab] = useState<Tab>('today');
  const [date] = useState(todayKey);
  const { store } = useStore();
  const [day, setDay] = useState(() => store.sessions[todayKey()]?.day ?? defaultDay());
  const status = store.sessions[date]?.readiness?.status;

  return (
    <div className="wrap">
      <header>
        <div className="hrow">
          <div><h1>Durability Tracker</h1><div className="wk">{fmtDate(date)}</div></div>
          <div className={`chip ${status ?? 'none'}`}>{status ? status.toUpperCase() : 'NO CHECK'}</div>
        </div>
        <nav>
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      </header>

      {tab === 'today' && <TodayView date={date} day={day} setDay={setDay} />}
      {tab === 'check' && <CheckInView date={date} day={day} />}
      {tab === 'history' && <HistoryView />}
      {tab === 'export' && <ExportView />}
      {tab === 'rules' && <RulesView />}
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>;
}
