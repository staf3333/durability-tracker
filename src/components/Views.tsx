import { useEffect, useRef, useState } from 'react';
import type { Readiness, Status, Store } from '../types';
import { TEMPLATES } from '../data/templates';
import { hydrate, useStore, emptyStore } from '../state/store';
import {
  buildAtlasExport, buildText, fmtDate, formatSet, nameFor, previousSession,
} from '../lib/plan';
import { dateReadiness, sessionDate, workoutName } from '../data/workouts';
import { workoutElapsedSeconds } from '../lib/duration';

const num = (v: string) => (v === '' ? null : Number(v));

export function CheckInView({
  calendarDate, day,
}: { calendarDate: string; day: string }) {
  const { store, dispatch } = useStore();
  const saved = dateReadiness(store, calendarDate);
  const [f, setF] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setF({
      ktwR: saved?.ktwR?.toString() ?? '', ktwL: saved?.ktwL?.toString() ?? '',
      anklePain: saved?.anklePain?.toString() ?? '', tendonPain: saved?.tendonPain?.toString() ?? '',
      amStiff: saved?.amStiff?.toString() ?? '', swelling: saved?.swelling ?? 'no',
      notes: saved?.notes ?? '',
    });
    setStatus(saved?.status ?? null);
  }, [calendarDate, saved]);

  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!status) { setMsg('Pick Green, Yellow or Red'); return; }
    const readiness: Readiness = {
      ktwR: num(f.ktwR ?? ''), ktwL: num(f.ktwL ?? ''),
      anklePain: num(f.anklePain ?? ''), tendonPain: num(f.tendonPain ?? ''),
      amStiff: num(f.amStiff ?? ''), swelling: (f.swelling as 'yes' | 'no') ?? 'no',
      notes: f.notes ?? '', status,
    };
    dispatch({ type: 'saveReadinessForDate', date: calendarDate, day, readiness });
    setMsg('Check-in saved');
    setTimeout(() => setMsg(''), 1800);
  }

  const prev = previousSession(store, calendarDate);

  return (
    <section>
      <h2>Morning check-in</h2>
      <p className="sub">{fmtDate(calendarDate)}</p>

      {prev && (
        <div className="grading">
          <div className="glabel">You are grading</div>
          <b>{fmtDate(prev.date)} · {TEMPLATES[prev.session.day]?.name ?? prev.session.day}</b>
          <div className="gstats">
            {prev.setsDone} sets{prev.volume > 0 && <> · {prev.volume.toLocaleString()} lbs</>}
          </div>
          {prev.session.notes && <div className="gnote">“{prev.session.notes}”</div>}
          <div className="ghint">
            Your tendon reports the morning after, not during. These numbers are
            the verdict on that workout.
          </div>
        </div>
      )}
      <div className="grid2">
        <label className="f">
          <span>Knee-to-wall R (cm)</span>
          <input className="t" type="number" step="0.5" inputMode="decimal" value={f.ktwR ?? ''} onChange={set('ktwR')} />
          <em className="hint">Toe to wall, heel down, knee touching.</em>
        </label>
        <label className="f">
          <span>Knee-to-wall L (cm)</span>
          <input className="t" type="number" step="0.5" inputMode="decimal" value={f.ktwL ?? ''} onChange={set('ktwL')} />
          <em className="hint">Same foot position every time.</em>
        </label>
      </div>
      <div className="grid2">
        <label className="f">
          <span>R ankle pain 0–10</span>
          <input className="t" type="number" min="0" max="10" inputMode="numeric" value={f.anklePain ?? ''} onChange={set('anklePain')} />
          <em className="hint">During knee-to-wall + 5 single-leg calf raises. Not at rest.</em>
        </label>
        <label className="f">
          <span>L tendon pain 0–10</span>
          <input className="t" type="number" min="0" max="10" inputMode="numeric" value={f.tendonPain ?? ''} onChange={set('tendonPain')} />
          <em className="hint">During a single-leg decline squat, same depth each time.</em>
        </label>
      </div>
      <div className="grid2">
        <label className="f">
          <span>AM stiffness (min)</span>
          <input className="t" type="number" min="0" inputMode="numeric" value={f.amStiff ?? ''} onChange={set('amStiff')} />
          <em className="hint">Minutes from getting up until it eases.</em>
        </label>
        <label className="f"><span>Ankle swelling?</span>
          <select className="t" value={f.swelling ?? 'no'} onChange={set('swelling')}>
            <option value="no">No</option><option value="yes">Yes</option>
          </select></label>
      </div>
      <label className="f">
        <span>Status — set it honestly, it drives today's volume</span>
        <div className="seg">
          {(['green', 'yellow', 'red'] as Status[]).map((s) => (
            <button key={s} data-v={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </label>
      <label className="f"><span>Notes</span>
        <textarea className="t" value={f.notes ?? ''} onChange={set('notes')}
          placeholder="How the ankle and tendon actually feel…" /></label>
      <button className="btn" onClick={save}>Save check-in</button>
      <div className={`toast${msg ? ' on' : ''}`}>{msg}</div>
      <div className="note warn" style={{ marginTop: 16 }}>
        <b>Score under load, not at rest.</b> Resting pain tells you almost nothing here —
        use the same provocation test each morning so the numbers are comparable. If the
        ankle pinches at end range rather than aching, say so in the notes: those mean
        different things.
      </div>
      <div className="note" style={{ marginTop: 12 }}>
        <b>Green</b> ankle ≤2/10, no swelling, KTW within ~5%; tendon ≤3 loading / ≤2 jumping.<br />
        <b>Yellow</b> pain 3–4 or rising, mild swelling, KTW down 5–10%.<br />
        <b>Red</b> pain &gt;4 or sharp, giving-way, new swelling, KTW down &gt;10%.
      </div>
    </section>
  );
}

export function HistoryView() {
  const { store } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries = Object.entries(store.sessions)
    .filter(([, session]) => !session.deletedAt && (
      !!session.startedAt || !!session.completedAt || !!session.notes
      || Object.values(session.exercises).some((sets) =>
        sets.some((set) => set.done || set.reps || set.load || set.distance))
    ))
    .sort((a, b) => {
      const byDate = sessionDate(b[0], b[1]).localeCompare(sessionDate(a[0], a[1]));
      return byDate || b[1].updatedAt.localeCompare(a[1].updatedAt);
    });
  if (!entries.length) return <section><h2>History</h2><div className="empty">Nothing logged yet.</div></section>;

  const selected = selectedId
    ? entries.find(([id]) => id === selectedId)
    : undefined;
  if (selected) {
    const [id, session] = selected;
    const date = sessionDate(id, session);
    const template = TEMPLATES[session.day];
    const templateIds = template?.blocks.flatMap((block) =>
      block.exercises.map((exercise) => exercise.id)) ?? [];
    const exerciseIds = [
      ...templateIds.filter((exerciseId) => session.exercises[exerciseId]),
      ...Object.keys(session.exercises).filter((exerciseId) => !templateIds.includes(exerciseId)),
    ];
    const duration = session.startedAt
      ? Math.round(workoutElapsedSeconds(session, Date.parse(session.updatedAt)) / 60)
      : null;

    return (
      <section>
        <button className="mini histback" onClick={() => setSelectedId(null)}>
          ‹ Back to history
        </button>
        <h2>{workoutName(session)}</h2>
        <p className="sub">
          {fmtDate(date)} · {template?.name ?? session.day}
          {duration != null ? ` · ${duration} min` : ''}
        </p>

        {session.readiness && (
          <div className={`histreadiness ${session.readiness.status}`}>
            <b>{session.readiness.status.toUpperCase()} check-in</b>
            <span>
              Ankle {session.readiness.anklePain ?? '–'}/10 · Tendon{' '}
              {session.readiness.tendonPain ?? '–'}/10 · KTW R{' '}
              {session.readiness.ktwR ?? '–'} / L {session.readiness.ktwL ?? '–'} cm
            </span>
            {session.readiness.notes && <em>{session.readiness.notes}</em>}
          </div>
        )}

        <div className="histdetails">
          {exerciseIds.map((exerciseId) => {
            const sets = session.exercises[exerciseId]
              .map((set, index) => ({ set, index }))
              .filter(({ set }) => set.done || set.reps || set.load || set.distance);
            if (!sets.length) return null;
            return (
              <article key={exerciseId} className="histdetail">
                <h3>{nameFor(session.day, exerciseId)}</h3>
                <ol>
                  {sets.map(({ set, index }) => (
                    <li key={index}>
                      <b>Set {index + 1}</b>
                      <span>{formatSet(set)}{set.done ? '' : ' · not completed'}</span>
                    </li>
                  ))}
                </ol>
                {session.exerciseSetups?.[exerciseId] && (
                  <p><b>Setup:</b> {session.exerciseSetups[exerciseId]}</p>
                )}
                {session.exerciseNotes?.[exerciseId] && (
                  <p><b>Exercise note:</b> {session.exerciseNotes[exerciseId]}</p>
                )}
              </article>
            );
          })}
        </div>

        {session.notes && (
          <div className="note histnotes"><b>Workout notes</b><br />{session.notes}</div>
        )}
        <p className="histstamp">
          Started {session.startedAt ? new Date(session.startedAt).toLocaleString() : '—'}
          {' · '}Completed {session.completedAt ? new Date(session.completedAt).toLocaleString() : 'not locked'}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>History</h2><p className="sub">Most recent first · select a workout to inspect it</p>
      <table className="hist">
        <tbody>
          <tr><th>Date</th><th>Workout</th><th>Ankle</th><th>Tendon</th><th>Sets</th><th /></tr>
          {entries.map(([id, s]) => {
            const done = Object.values(s.exercises).flat().filter((x) => x.done).length;
            const label = workoutName(s);
            const date = sessionDate(id, s);
            return (
              <tr
                key={id}
                className="histrow"
                role="button"
                tabIndex={0}
                aria-label={`Open ${label} from ${fmtDate(date)}`}
                onClick={() => setSelectedId(id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(id);
                  }
                }}
              >
                <td>{s.readiness && <span className={`dot ${s.readiness.status}`} />}{fmtDate(date)}</td>
                <td>
                  {label}
                  <small className="hworkout">{TEMPLATES[s.day]?.name.split('—')[0].trim() ?? s.day}</small>
                </td>
                <td>{s.readiness?.anklePain ?? '–'}</td>
                <td>{s.readiness?.tendonPain ?? '–'}</td>
                <td>{done}</td>
                <td className="histchev" aria-hidden>›</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function ExportView() {
  const { store, dispatch } = useStore();
  const [days, setDays] = useState(7);
  const [msg, setMsg] = useState('');
  const [paste, setPaste] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const text = buildText(store, days);
  const atlas = JSON.stringify(buildAtlasExport(store), null, 2);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1800); };

  async function copy() {
    try { await navigator.clipboard.writeText(text); flash('Copied — paste it to your coach'); }
    catch { flash('Select the preview text and copy manually'); }
  }

  async function copyBackup() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(store));
      flash('Full backup copied — paste it on the other device');
    } catch { flash('Could not copy; use the file download instead'); }
  }

  async function copyAtlas() {
    try {
      await navigator.clipboard.writeText(atlas);
      flash('Atlas JSON copied');
    } catch { flash('Could not copy Atlas JSON; use the download instead'); }
  }

  function downloadAtlas() {
    const blob = new Blob([atlas], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `durability-atlas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('Atlas JSON downloaded');
  }

  function download() {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `durability-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('JSON downloaded');
  }

  function applyImport(raw: string) {
    try {
      const parsed = JSON.parse(raw) as Store;
      if (!parsed || (!parsed.sessions && !parsed.history)) throw new Error('bad');

      const historyOnly = parsed.history && Object.keys(parsed.sessions ?? {}).length === 0;
      if (historyOnly) {
        const n = Object.keys(parsed.history).length;
        if (!window.confirm(
          `Add previous-performance data for ${n} exercises?\n\n` +
          'This only fills the "last time" line. It adds no workouts and ' +
          'overwrites nothing you have logged.')) return;
        dispatch({ type: 'mergeHistory', history: parsed.history });
        flash(`History added for ${n} exercises`);
        setPaste('');
        return;
      }

      const n = Object.keys(parsed.sessions).length;
      if (!window.confirm(`Replace all data on this device with ${n} imported workout${n === 1 ? '' : 's'}?`)) return;
      dispatch({ type: 'replaceAll', store: hydrate(JSON.stringify(parsed)) });
      setPaste('');
      flash('Restored');
    } catch { flash('That is not a valid backup'); }
  }

  function restore(file: File) {
    const fr = new FileReader();
    fr.onload = () => applyImport(String(fr.result));
    fr.readAsText(file);
  }

  return (
    <section>
      <h2>Export</h2>
      <p className="sub">Paste the text into your coach, or download JSON as a backup.</p>
      <label className="f"><span>Range</span>
        <select className="t" value={days} onChange={(e) => setDays(+e.target.value)}>
          <option value={7}>Last 7 days</option><option value={14}>Last 14 days</option>
          <option value={28}>Last 28 days</option><option value={9999}>Everything</option>
        </select></label>
      <button className="btn" onClick={copy}>Copy log for coach</button>
      <button className="btn sec" onClick={download}>Download JSON backup</button>
      <button className="btn sec" onClick={copyBackup}>Copy full backup to clipboard</button>
      <button className="btn sec" onClick={copyAtlas}>Copy Atlas JSON</button>
      <button className="btn sec" onClick={downloadAtlas}>Download Atlas JSON</button>
      <button className="btn sec" onClick={() => fileRef.current?.click()}>Restore from a file</button>
      <input ref={fileRef} type="file" accept="application/json" hidden
        onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />

      <h3>Paste a backup</h3>
      <p className="sub">
        Easier than files on a phone. Copy the JSON from another device, paste it
        here, and import.
      </p>
      <textarea
        className="t" value={paste} onChange={(e) => setPaste(e.target.value)}
        placeholder='{"version":6,"sessions":{ … }}'
        aria-label="Paste backup JSON"
        style={{ minHeight: 90, fontFamily: 'monospace', fontSize: '.76rem' }}
      />
      <button className="btn sec" disabled={!paste.trim()} onClick={() => applyImport(paste)}>
        Import pasted data
      </button>
      <h3>Preview</h3>
      <pre className="out">{text}</pre>
      <h3>Atlas export</h3>
      <p className="sub">
        Structured JSON with stable workout, exercise and performance IDs,
        explicit units, distance, notes, readiness and timestamps.
      </p>
      <pre className="out">{atlas}</pre>
      <button className="btn dgr" style={{ marginTop: 22 }} onClick={() => {
        if (window.confirm('Erase every logged workout on this device? This cannot be undone.')) {
          dispatch({ type: 'wipe' }); flash('Erased');
        }
      }}>Erase all data on this device</button>
      <p className="sub" style={{ marginTop: 10 }}>
        Everything is stored only in this browser. Nothing is uploaded anywhere.
        Take a JSON backup regularly — deleting the app or clearing website data
        erases it, silently.
      </p>
      <div className={`toast${msg ? ' on' : ''}`}>{msg}</div>
    </section>
  );
}

export function RulesView() {
  return (
    <section>
      <h2>Decision rules</h2>
      <div className="note"><b>Green</b> — run the plan. Progress <b>one</b> variable only.</div>
      <div className="note warn"><b>Yellow</b> — cut contacts 30–50%, bilateral instead of unilateral, drop load/range 10–20%. Do not progress.</div>
      <div className="note stop"><b>Red</b> — no jumping, sprinting, hard cutting or loaded end-range. Contact your clinician if it repeats.</div>
      <h3>Cut in this order</h3>
      <div className="note">1. Extra conditioning → 2. High-volume extensive contacts → 3. Decel/landing sets basketball already gave you → 4. Accessory sets → 5. Secondary strength → <b>6. Primary heavy strength last.</b></div>
      <h3>Basketball load</h3>
      <div className="note">3 basketball workouts/wk is your default: keep primary strength, drop 1 accessory set, cut formal contacts 40–60%.<br />
        Surprise hard pickup → next lower workout is automatically Yellow.</div>
      <h3>Non-negotiables</h3>
      <div className="note">Soleus Raise twice a week. Heels Elevated Narrow Squat is the priority lift.
        No maximal left-foot attempts until the dunk ladder criteria are met.</div>
    </section>
  );
}

export { emptyStore };
