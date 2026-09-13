import { useMemo, useState } from 'react';
import type { Block, Status } from '../types';
import { TEMPLATES, DAY_ORDER } from '../data/templates';
import { useStore } from '../state/store';
import { countDone, sessionHasData, sessionVolume, setsOf } from '../lib/plan';
import { BlockView } from './BlockView';
import { RestBar, useCountdown } from './Timers';
import { fmtSec } from '../lib/plan';

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon · Lower A', tue: 'Tue · Shooting', wed: 'Wed · Lower B',
  thu: 'Thu · Microdose', fri: 'Fri · Basketball', sat: 'Sat · Basketball',
  sun: 'Sun · Off', dunk: 'Dunk ladder',
};

const GATE: Record<Status, { cls: string; text: string }> = {
  green: { cls: 'note', text: 'Green. Run the session as written. Progress one variable only.' },
  yellow: { cls: 'note warn', text: 'Yellow. Cut contacts 30–50%, use bilateral instead of unilateral, drop load or range 10–20%. Keep the primary lift if it feels clean. Do not progress.' },
  red: { cls: 'note stop', text: 'Red. No jumping, sprinting, hard cutting or loaded end-range today. Mobility and pain-free movement only.' },
};

export function TodayView({ date, day, setDay }: { date: string; day: string; setDay: (d: string) => void }) {
  const { store, dispatch } = useStore();
  const session = store.sessions[date];
  const tpl = TEMPLATES[day];
  const [toast, setToast] = useState('');

  const rest = useCountdown();
  const setTimer = useCountdown((key, total) => {
    const [exId, idx] = key.split(':');
    dispatch({ type: 'completeTimedSet', date, day, exId, index: +idx, value: fmt(total) });
    setToast('Set complete');
    setTimeout(() => setToast(''), 1800);
  });

  const defaultsFor = useMemo(() => {
    const m: Record<string, number> = {};
    tpl.blocks.forEach((b) => b.exercises.forEach((x) => { m[x.id] = x.sets; }));
    return m;
  }, [tpl]);

  function changeDay(next: string) {
    if (session && session.day !== next && sessionHasData(session)) {
      const okay = window.confirm(
        `You have already logged a "${TEMPLATES[session.day]?.name ?? session.day}" session today.\n\n` +
        `Switching will re-label that log as "${TEMPLATES[next]?.name ?? next}". Continue?`);
      if (!okay) return;
    }
    setTimer.stop();
    setDay(next);
    dispatch({ type: 'setDay', date, day: next });
  }

  const status = session?.readiness?.status;
  const volume = sessionVolume(session);
  const done = countDone(session);

  return (
    <section>
      {(done > 0 || volume > 0) && (
        <div className="stats">
          <div><b>{done}</b><span>sets done</span></div>
          <div><b>{volume ? volume.toLocaleString() : '—'}</b><span>lbs moved</span></div>
          <div><b>{rest.timer ? fmtSec(rest.timer.remain) : '—'}</b><span>rest</span></div>
        </div>
      )}
      <label className="f">
        <span>Session</span>
        <select className="t" value={day} onChange={(e) => changeDay(e.target.value)} aria-label="Session">
          {DAY_ORDER.map((d) => <option key={d} value={d}>{DAY_LABELS[d] ?? d}</option>)}
        </select>
      </label>

      {status
        ? <div className={GATE[status].cls}>{GATE[status].text}</div>
        : <div className="note warn"><b>No check-in yet.</b> Do the morning check first — it decides today's volume.</div>}

      <h2>{tpl.name}</h2>
      <p className="sub">{tpl.sub}</p>
      <div className="note">{tpl.note}</div>

      {tpl.blocks.map((block, i) => (
        <BlockView
          key={i}
          block={block}
          session={session}
          store={store}
          date={date}
          timer={setTimer.timer}
          onField={(exId, index, field, value) =>
            dispatch({ type: 'setSetField', date, day, exId, index, field, value })}
          onToggle={(exId, index) => {
            dispatch({ type: 'toggleDone', date, day, exId, index });
            const ex = block.exercises.find((x) => x.id === exId);
            const wasDone = setsOf(session, ex!)[index]?.done;
            if (ex?.rest && !wasDone) rest.toggle('rest', ex.rest);
          }}
          onTimer={(exId, index, seconds) => setTimer.toggle(`${exId}:${index}`, seconds)}
          onAddSet={(exId, defaults) => dispatch({ type: 'addSet', date, day, exId, defaults })}
          onRemoveSet={(exId, index) => dispatch({ type: 'removeSet', date, day, exId, index })}
          onAddRound={(b: Block) => dispatch({
            type: 'addRound', date, day,
            exIds: b.exercises.map((x) => x.id), defaults: defaultsFor,
          })}
          onRemoveRound={(b: Block) => {
            const min = b.exercises.reduce((n, ex) => Math.max(n, setsOf(session, ex).length), 1);
            if (min <= 1) { setToast('Keep at least one round'); setTimeout(() => setToast(''), 1800); return; }
            dispatch({ type: 'removeRound', date, day, exIds: b.exercises.map((x) => x.id) });
          }}
          onRest={(sec) => rest.toggle('rest', sec)}
        />
      ))}

      <h3>Session notes</h3>
      <textarea
        className="t"
        placeholder="Basketball minutes, RPE, how it felt…"
        value={session?.notes ?? ''}
        onChange={(e) => dispatch({ type: 'setNotes', date, day, notes: e.target.value })}
      />

      <RestBar timer={rest.timer} onStop={rest.stop} onExtend={rest.extend} />
      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </section>
  );
}

function fmt(total: number) {
  return `${Math.floor(total / 60)}:${total % 60 < 10 ? '0' : ''}${total % 60}`;
}
