import { useEffect, useMemo, useState } from 'react';
import type { Block, PlannedWorkout, Status } from '../types';
import { DAY_ORDER, TEMPLATES } from '../data/templates';
import {
  dateReadiness, plannedWorkouts, workoutRecordId, workoutSession,
} from '../data/workouts';
import { useStore } from '../state/store';
import { countDone, effective, membersInRound, sessionVolumes, setsOf } from '../lib/plan';
import { BlockView } from './BlockView';
import { SessionOverview } from './SessionOverview';
import { ExerciseDetail } from './ExerciseDetail';
import { flatten, nextIndex, prevIndex } from '../lib/session';
import { useCountdown } from './Timers';
import { useRest } from '../state/RestTimer';
import { useWakeLock } from '../state/useWakeLock';
import { workoutElapsedSeconds } from '../lib/duration';

const DAY_LABELS: Record<string, string> = {
  mon: 'Mon · Lower A', tue: 'Tue · Shooting + Upper', wed: 'Wed · Lower B',
  thu: 'Thu · Microdose + Upper', fri: 'Fri · Basketball', sat: 'Sat · Basketball + Upper',
  sun: 'Sun · Recovery', dunk: 'Dunk ladder',
};

const GATE: Record<Status, { cls: string; text: string }> = {
  green: { cls: 'note', text: 'Green. Run the workout as written. Progress one variable only.' },
  yellow: { cls: 'note warn', text: 'Yellow. Cut contacts 30–50%, use bilateral instead of unilateral, drop load or range 10–20%. Keep the primary lift if it feels clean. Do not progress.' },
  red: { cls: 'note stop', text: 'Red. No jumping, sprinting, hard cutting or loaded end-range today. Mobility and pain-free movement only.' },
};

export function TodayView({
  date, day, setDay,
}: { date: string; day: string; setDay: (day: string) => void }) {
  const { store, dispatch } = useStore();
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const workouts = plannedWorkouts(day);
  const readiness = dateReadiness(store, date);

  useEffect(() => setActiveWorkoutId(null), [day]);

  const openWorkout = (workout: PlannedWorkout) => {
    const existing = workoutSession(store, date, workout.id);
    if (!existing) {
      dispatch({
        type: 'createWorkout',
        id: workoutRecordId(date, workout.id),
        date,
        day,
        workoutId: workout.id,
        readiness,
      });
    }
    setActiveWorkoutId(workout.id);
  };

  if (activeWorkoutId) {
    const workout = workouts.find((candidate) => candidate.id === activeWorkoutId);
    if (workout) {
      const existing = workoutSession(store, date, workout.id);
      return (
        <WorkoutLogger
          key={workout.id}
          date={date}
          day={day}
          workout={workout}
          sessionId={existing?.[0] ?? workoutRecordId(date, workout.id)}
          onBack={() => setActiveWorkoutId(null)}
        />
      );
    }
  }

  return (
    <section>
      <label className="f">
        <span>Day plan</span>
        <select className="t" value={day} onChange={(event) => setDay(event.target.value)}
          aria-label="Day plan">
          {DAY_ORDER.map((id) => <option key={id} value={id}>{DAY_LABELS[id] ?? id}</option>)}
        </select>
      </label>

      <div className="dayintro">
        <h2>{TEMPLATES[day].name}</h2>
        <p>{TEMPLATES[day].sub}</p>
      </div>
      {readiness?.status
        ? <div className={GATE[readiness.status].cls}>{GATE[readiness.status].text}</div>
        : <div className="note warn"><b>No check-in yet.</b> Do the morning check first — it decides today's volume.</div>}
      <p className="daycue">{TEMPLATES[day].note}</p>

      <div className="workoutlist">
        {workouts.map((workout) => {
          const entry = workoutSession(store, date, workout.id);
          const session = entry?.[1];
          const done = countDone(session);
          const total = workout.blocks.reduce((sum, block) =>
            sum + block.exercises.reduce((blockSum, exercise) =>
              blockSum + setsOf(session, exercise).length, 0), 0);
          const status = session?.completedAt
            ? 'Completed'
            : session?.startedAt || done > 0
              ? 'In progress'
              : 'Not started';
          const progress = total ? Math.round((done / total) * 100) : 0;
          return (
            <button key={workout.id} className="workoutcard"
              onClick={() => openWorkout(workout)}
              aria-label={`Open ${workout.name}`}>
              <span className="workoutmain">
                <b>{workout.name}</b>
                <small>{workout.blocks.map((block) => block.title).join(' · ')}</small>
                <span className="workoutprogress" aria-hidden>
                  <i style={{ width: `${progress}%` }} />
                </span>
              </span>
              <span className={`workoutstatus ${status.toLowerCase().replace(' ', '-')}`}>
                {status}
                <small>{done}/{total} sets</small>
              </span>
              <span className="workoutchev" aria-hidden>›</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WorkoutLogger({
  date, day, workout, sessionId, onBack,
}: {
  date: string;
  day: string;
  workout: PlannedWorkout;
  sessionId: string;
  onBack: () => void;
}) {
  const { store, dispatch } = useStore();
  const session = store.sessions[sessionId];
  const [toast, setToast] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const rest = useRest();
  const flat = useMemo(() => flatten(workout.blocks), [workout]);
  const locked = !!session?.completedAt;

  const setTimer = useCountdown((key, total) => {
    const [exId, idx] = key.split(':');
    startAutomaticRest(exId, +idx, false);
    dispatch({
      type: 'completeTimedSet', date: sessionId, day, exId, index: +idx,
      value: fmt(total), defaults: flat.find((item) => item.ex.id === exId)?.ex.sets,
    });
    setToast('Set complete');
    setTimeout(() => setToast(''), 1800);
  });

  function startAutomaticRest(exId: string, index: number, wasDone: boolean) {
    if (wasDone) return;
    const item = flat.find((candidate) => candidate.ex.id === exId);
    if (!item) return;
    if (item.block.mode === 'straight') {
      const exercise = effective(item.ex, store);
      if (exercise.rest) {
        rest.start(`${exId}:${index}`, `${exercise.name} · set ${index + 1}`, exercise.rest);
      }
      return;
    }
    const members = membersInRound(item.block, session, index);
    const finalMember = members.every((member) =>
      member.id === exId || !!session?.exercises[member.id]?.[index]?.done);
    if (!finalMember) return;
    const seconds = members.reduce((max, member) =>
      Math.max(max, effective(member, store).rest ?? 0), 0);
    if (seconds) {
      rest.start(
        `${item.blockIndex}:${index}`,
        `${item.block.mode === 'superset' ? 'Superset' : 'Circuit'} · round ${index + 1}`,
        seconds,
      );
    }
  }

  const handlers = {
    onField: (
      exId: string, index: number,
      field: 'reps' | 'load' | 'loadUnit' | 'distance', value: string,
    ) => {
      if (locked) return;
      dispatch({
        type: 'setSetField', date: sessionId, day, exId, index, field, value,
        defaults: flat.find((item) => item.ex.id === exId)?.ex.sets,
      });
    },
    onToggle: (exId: string, index: number) => {
      if (locked) return;
      const wasDone = !!session?.exercises[exId]?.[index]?.done;
      startAutomaticRest(exId, index, wasDone);
      dispatch({
        type: 'toggleDone', date: sessionId, day, exId, index,
        defaults: flat.find((item) => item.ex.id === exId)?.ex.sets,
      });
    },
    onTimer: (exId: string, index: number, seconds: number) =>
      !locked && setTimer.toggle(`${exId}:${index}`, seconds),
    onAddSet: (exId: string, defaults: number) =>
      !locked && dispatch({ type: 'addSet', date: sessionId, day, exId, defaults }),
    onRemoveSet: (exId: string, index: number) =>
      !locked && dispatch({ type: 'removeSet', date: sessionId, day, exId, index }),
    onRest: (seconds: number, exId?: string, index?: number) =>
      rest.start(`${exId ?? 'manual'}:${index ?? 0}`, exId ? `${exId} · rest` : 'Rest', seconds),
    onPref: (exId: string, pref: import('../types').ExercisePref) =>
      !locked && dispatch({ type: 'setExercisePref', exId, pref }),
    onNote: (exId: string, note: string) =>
      !locked && dispatch({ type: 'setExerciseNote', date: sessionId, day, exId, note }),
    onSetup: (exId: string, setup: string) =>
      !locked && dispatch({ type: 'setExerciseSetup', date: sessionId, day, exId, setup }),
  };

  const defaultsFor = useMemo(() => {
    const defaults: Record<string, number> = {};
    workout.blocks.forEach((block) =>
      block.exercises.forEach((exercise) => { defaults[exercise.id] = exercise.sets; }));
    return defaults;
  }, [workout]);

  const volumes = sessionVolumes(session);
  const done = countDone(session);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!session?.startedAt || locked) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session?.startedAt, locked]);

  const elapsed = workoutElapsedSeconds(session, nowTick);
  const clock = elapsed >= 3600
    ? `${Math.floor(elapsed / 3600)}h ${String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}m`
    : `${Math.floor(elapsed / 60)}m ${String(elapsed % 60).padStart(2, '0')}s`;
  useWakeLock(!!session?.startedAt && !locked);

  const goBack = () => {
    setTimer.stop();
    onBack();
  };

  return (
    <section>
      <div className="workouttitlebar">
        <button className="mini workoutback" onClick={goBack}
          aria-label="Back to day">‹ Day</button>
        <div><h2>{workout.name}</h2><p>{workout.sub}</p></div>
      </div>
      <p className="workoutcue">{workout.note}</p>

      {(done > 0 || volumes.lb > 0 || volumes.kg > 0 || session?.startedAt) && (
        <div className={`stats${locked ? ' locked' : ''}`}>
          <div><b>{clock}</b><span>{locked ? 'total' : 'elapsed'}</span></div>
          <div><b>{done}</b><span>sets done</span></div>
          <div>
            <b>{[
              volumes.lb ? `${volumes.lb.toLocaleString()} lb` : '',
              volumes.kg ? `${volumes.kg.toLocaleString()} kg` : '',
            ].filter(Boolean).join(' · ') || '—'}</b>
            <span>volume</span>
          </div>
        </div>
      )}

      {locked && (
        <div className="note locknote">
          <b>Workout locked in.</b> Finished {new Date(session!.completedAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          <button className="mini" style={{ marginLeft: 10 }}
            onClick={() => dispatch({ type: 'reopenSession', date: sessionId, day })}>Edit anyway</button>
        </div>
      )}

      {openIndex === null ? (
        <>
          <button className="viewtog" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Compact list' : 'Expand all sets'}
          </button>
          {expanded ? workout.blocks.map((block, index) => (
            <BlockView
              key={index}
              block={block} session={session} store={store} date={date} timer={setTimer.timer}
              locked={locked}
              {...handlers}
              onRest={(seconds: number) => rest.start('manual:0', 'Rest', seconds)}
              onAddRound={(group: Block) => dispatch({
                type: 'addRound', date: sessionId, day,
                exIds: group.exercises.map((exercise) => exercise.id), defaults: defaultsFor,
              })}
              onRemoveRound={(group: Block) => {
                const min = group.exercises.reduce((count, exercise) =>
                  Math.max(count, setsOf(session, exercise).length), 1);
                if (min <= 1) {
                  setToast('Keep at least one round');
                  setTimeout(() => setToast(''), 1800);
                  return;
                }
                dispatch({
                  type: 'removeRound', date: sessionId, day,
                  exIds: group.exercises.map((exercise) => exercise.id),
                });
              }}
            />
          )) : (
            <SessionOverview
              blocks={workout.blocks} session={session} store={store} date={date}
              onOpen={setOpenIndex}
            />
          )}

          {done > 0 && !locked && (
            <button className="btn complete" onClick={() => {
              if (window.confirm(
                `Lock in this workout?\n\n${done} sets · ${clock}`
                + `${volumes.lb ? ` · ${volumes.lb.toLocaleString()} lb` : ''}`
                + `${volumes.kg ? ` · ${volumes.kg.toLocaleString()} kg` : ''}`
                + '\n\nYou can still edit it afterwards.')) {
                dispatch({ type: 'completeSession', date: sessionId, day });
                setToast('Workout locked in');
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
          next={(() => { const next = nextIndex(flat, openIndex, session); return next == null ? null : flat[next]; })()}
          prev={(() => { const previous = prevIndex(openIndex); return previous == null ? null : flat[previous]; })()}
          session={session} sessionId={sessionId} store={store} date={date} timer={setTimer.timer}
          {...handlers}
          locked={locked}
          onGo={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}

      <details className="workoutnotes">
        <summary>Workout notes{session?.notes ? ' · saved' : ''}</summary>
        <textarea
          className="t"
          placeholder="Minutes, RPE, how it felt…"
          value={session?.notes ?? ''}
          onChange={(event) => dispatch({
            type: 'setNotes', date: sessionId, day, notes: event.target.value,
          })}
          disabled={locked}
        />
      </details>
      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </section>
  );
}

function fmt(total: number) {
  return `${Math.floor(total / 60)}:${total % 60 < 10 ? '0' : ''}${total % 60}`;
}
