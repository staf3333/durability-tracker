import { useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { TodayView } from './components/TodayView';
import { CheckInView, ExportView, HistoryView, RulesView } from './components/Views';
import { defaultDay, fmtDate, todayKey } from './lib/plan';
import { useSync } from './state/useSync';
import { ConflictBanner, SignedOutNote, SyncChip } from './components/SyncUI';

const TABS = [
  ['today', 'Today'], ['check', 'Check-in'], ['history', 'History'],
  ['export', 'Export'], ['rules', 'Rules'],
] as const;
type Tab = (typeof TABS)[number][0];

function Shell() {
  const [tab, setTab] = useState<Tab>('today');
  const [date] = useState(todayKey);
  const { store, dispatch } = useStore();
  const [day, setDay] = useState(() => store.sessions[todayKey()]?.day ?? defaultDay());
  const status = store.sessions[date]?.readiness?.status;
  const sync = useSync();

  return (
    <div className="wrap">
      <header>
        <div className="hrow">
          <div><h1>Durability Tracker</h1><div className="wk">{fmtDate(date)}</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SyncChip
              status={sync.status} pendingCount={sync.pendingCount} conflict={sync.conflict}
              onSync={sync.syncNow} onSignIn={sync.signIn}
            />
            <div className={`chip ${status ?? 'none'}`}>{status ? status.toUpperCase() : 'NO CHECK'}</div>
          </div>
        </div>
        <nav>
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      </header>

      {sync.conflict && (
        <ConflictBanner
          date={sync.conflict.date}
          onRestore={() => {
            const mine = sync.conflict!.mine;
            dispatch({ type: 'applyRemote', sessions: { [sync.conflict!.date]: { ...mine, updatedAt: new Date().toISOString() } },
                       history: {}, deleted: [], serverTime: store.sync.lastSyncedAt ?? new Date().toISOString() });
            dispatch({ type: 'setConflict', date: sync.conflict!.date, mine: null });
          }}
          onDismiss={() => dispatch({ type: 'setConflict', date: sync.conflict!.date, mine: null })}
        />
      )}
      {sync.status === 'signedOut' && tab === 'today' && <SignedOutNote onSignIn={sync.signIn} />}

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
