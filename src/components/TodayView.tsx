import { useEffect, useMemo, useState } from 'react';
import type { Block, Status } from '../types';
import { TEMPLATES, DAY_ORDER } from '../data/templates';
import { useStore } from '../state/store';
import { countDone, sessionHasData, sessionVolume, setsOf } from '../lib/plan';
import { BlockView } from './BlockView';
import { SessionOverview } from './SessionOverview';
import { ExerciseDetail } from './ExerciseDetail';
import { flatten, nextIndex, prevIndex } from '../lib/session';
import { useCountdown } from './Timers';
import { useRest } from '../state/RestTimer';
import { effective } from '../lib/plan';


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
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const rest = useRest();
  const setTimer = useCountdown((key, total) => {
    const [exId, idx] = key.split(':');
    dispatch({ type: 'completeTimedSet', date, day, exId, index: +idx, value: fmt(total) });
    setToast('Set complete');
    setTimeout(() => setToast(''), 1800);
  });

  const flat = useMemo(() => flatten(tpl.blocks), [tpl]);

  const handlers = {
    onField: (exId: string, index: number, field: 'reps' | 'load', value: string) =>
      dispatch({ type: 'setSetField', date, day, exId, index, field, value }),
    onToggle: (exId: string, index: number) => {
      const wasDone = !!session?.exercises[exId]?.[index]?.done;
      dispatch({ type: 'toggleDone', date, day, exId, index });
      const base = flat.find((f) => f.ex.id === exId)?.ex;
      const ex = base ? effective(base, store) : undefined;
      if (ex?.rest && !wasDone) {
        rest.start(`${exId}:${index}`, `${ex.name} · set ${index + 1}`, ex.rest);
      }
    },
    onTimer: (exId: string, index: number, seconds: number) =>
      setTimer.toggle(`${exId}:${index}`, seconds),
    onAddSet: (exId: string, defaults: number) =>
      dispatch({ type: 'addSet', date, day, exId, defaults }),
    onRemoveSet: (exId: string, index: number) =>
      dispatch({ type: 'removeSet', date, day, exId, index }),
    onRest: (sec: number, exId?: string, index?: number) =>
      rest.start(`${exId ?? 'manual'}:${index ?? 0}`, exId ? `${exId} · rest` : 'Rest', sec),
    onPref: (exId: string, pref: import('../types').ExercisePref) =>
      dispatch({ type: 'setExercisePref', exId, pref }),
    onNote: (exId: string, note: string) =>
      dispatch({ type: 'setExerciseNote', date, day, exId, note }),
  };

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
  const locked = !!session?.completedAt;

  // Session clock: runs from the first logged activity until it is locked in.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!session?.startedAt || locked) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.startedAt, locked]);

  const elapsed = session?.startedAt
    ? Math.max(0, Math.round(
        ((locked && session.completedAt ? Date.parse(session.completedAt) : nowTick)
          - Date.parse(session.startedAt)) / 1000))
    : 0;
  const clock = elapsed >= 3600
    ? `${Math.floor(elapsed / 3600)}h ${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}m`
    : `${Math.floor(elapsed / 60)}m ${String(elapsed % 60).padStart(2, '0')}s`;

  return (
    <section>
      {(done > 0 || volume > 0 || session?.startedAt) && (
        <div className={`stats${locked ? ' locked' : ''}`}>
          <div><b>{clock}</b><span>{locked ? 'total' : 'elapsed'}</span></div>
          <div><b>{done}</b><span>sets done</span></div>
          <div><b>{volume ? volume.toLocaleString() : '—'}</b><span>lbs moved</span></div>
        </div>
      )}

      {locked && (
        <div className="note locknote">
          <b>Session locked in.</b> Finished {new Date(session!.completedAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          <button className="mini" style={{ marginLeft: 10 }}
            onClick={() => dispatch({ type: 'reopenSession', date, day })}>Edit anyway</button>
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

      {openIndex === null ? (
        <>
          <button className="viewtog" onClick={() => setExpanded((e) => !e)}>
            {expanded ? 'Compact list' : 'Expand all sets'}
          </button>

          {expanded ? tpl.blocks.map((block, i) => (
            <BlockView
              key={i}
              block={block} session={session} store={store} date={date} timer={setTimer.timer}
              {...handlers}
              onRest={(sec: number) => rest.start('manual:0', 'Rest', sec)}
              onAddRound={(b: Block) => dispatch({
                type: 'addRound', date, day,
                exIds: b.exercises.map((x) => x.id), defaults: defaultsFor,
              })}
              onRemoveRound={(b: Block) => {
                const min = b.exercises.reduce((n, ex) => Math.max(n, setsOf(session, ex).length), 1);
                if (min <= 1) { setToast('Keep at least one round'); setTimeout(() => setToast(''), 1800); return; }
                dispatch({ type: 'removeRound', date, day, exIds: b.exercises.map((x) => x.id) });
              }}
            />
          )) : (
            <SessionOverview
              blocks={tpl.blocks} session={session} store={store} date={date}
              onOpen={setOpenIndex}
            />
          )}

          {done > 0 && !locked && (
            <button className="btn complete" onClick={() => {
              if (window.confirm(
                `Lock in this session?\n\n${done} sets · ${clock}`
                + `${volume ? ` · ${volume.toLocaleString()} lbs` : ''}`
                + '\n\nYou can still edit it afterwards.')) {
                dispatch({ type: 'completeSession', date, day });
                setToast('Session locked in');
                setTimeout(() => setToast(''), 2200);
              }
            }}>
              Complete workout · {clock}
            </button>
          )}
        </>
      ) : (
        <ExerciseDetail
          current={flat[openIndex]}
          next={(() => { const n = nextIndex(flat, openIndex, session); return n == null ? null : flat[n]; })()}
          prev={(() => { const n = prevIndex(openIndex); return n == null ? null : flat[n]; })()}
          session={session} store={store} date={date} timer={setTimer.timer}
          {...handlers}
          locked={locked}
          onGo={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}

      <h3>Session notes</h3>
      <textarea
        className="t"
        placeholder="Basketball minutes, RPE, how it felt…"
        value={session?.notes ?? ''}
        onChange={(e) => dispatch({ type: 'setNotes', date, day, notes: e.target.value })}
      />

      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </section>
  );
}

function fmt(total: number) {
  return `${Math.floor(total / 60)}:${total % 60 < 10 ? '0' : ''}${total % 60}`;
}
