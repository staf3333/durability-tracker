import { useEffect, useRef, useState } from 'react';
import type { Readiness, Status, Store } from '../types';
import { TEMPLATES } from '../data/templates';
import { useStore, emptyStore } from '../state/store';
import { buildText, fmtDate } from '../lib/plan';

const num = (v: string) => (v === '' ? null : Number(v));

export function CheckInView({ date, day }: { date: string; day: string }) {
  const { store, dispatch } = useStore();
  const saved = store.sessions[date]?.readiness ?? null;
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
  }, [date]);

  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    if (!status) { setMsg('Pick Green, Yellow or Red'); return; }
    const readiness: Readiness = {
      ktwR: num(f.ktwR ?? ''), ktwL: num(f.ktwL ?? ''),
      anklePain: num(f.anklePain ?? ''), tendonPain: num(f.tendonPain ?? ''),
      amStiff: num(f.amStiff ?? ''), swelling: (f.swelling as 'yes' | 'no') ?? 'no',
      notes: f.notes ?? '', status,
    };
    dispatch({ type: 'saveReadiness', date, day, readiness });
    setMsg('Check-in saved');
    setTimeout(() => setMsg(''), 1800);
  }

  return (
    <section>
      <h2>Morning check-in</h2>
      <p className="sub">{fmtDate(date)}</p>
      <div className="grid2">
        <label className="f"><span>Knee-to-wall R (cm)</span>
          <input className="t" type="number" step="0.5" inputMode="decimal" value={f.ktwR ?? ''} onChange={set('ktwR')} /></label>
        <label className="f"><span>Knee-to-wall L (cm)</span>
          <input className="t" type="number" step="0.5" inputMode="decimal" value={f.ktwL ?? ''} onChange={set('ktwL')} /></label>
      </div>
      <div className="grid2">
        <label className="f"><span>R ankle pain 0–10</span>
          <input className="t" type="number" min="0" max="10" inputMode="numeric" value={f.anklePain ?? ''} onChange={set('anklePain')} /></label>
        <label className="f"><span>L tendon pain 0–10</span>
          <input className="t" type="number" min="0" max="10" inputMode="numeric" value={f.tendonPain ?? ''} onChange={set('tendonPain')} /></label>
      </div>
      <div className="grid2">
        <label className="f"><span>AM stiffness (min)</span>
          <input className="t" type="number" min="0" inputMode="numeric" value={f.amStiff ?? ''} onChange={set('amStiff')} /></label>
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
      <div className="note" style={{ marginTop: 16 }}>
        <b>Green</b> ankle ≤2/10, no swelling, KTW within ~5%; tendon ≤3 loading / ≤2 jumping.<br />
        <b>Yellow</b> pain 3–4 or rising, mild swelling, KTW down 5–10%.<br />
        <b>Red</b> pain &gt;4 or sharp, giving-way, new swelling, KTW down &gt;10%.
      </div>
    </section>
  );
}

export function HistoryView() {
  const { store } = useStore();
  const keys = Object.keys(store.sessions).sort().reverse();
  if (!keys.length) return <section><h2>History</h2><div className="empty">Nothing logged yet.</div></section>;
  return (
    <section>
      <h2>History</h2><p className="sub">Most recent first</p>
      <table className="hist">
        <tbody>
          <tr><th>Date</th><th>Session</th><th>Ankle</th><th>Tendon</th><th>Sets</th></tr>
          {keys.map((k) => {
            const s = store.sessions[k];
            const done = Object.values(s.exercises).flat().filter((x) => x.done).length;
            return (
              <tr key={k}>
                <td>{s.readiness && <span className={`dot ${s.readiness.status}`} />}{fmtDate(k)}</td>
                <td>{TEMPLATES[s.day]?.name.split('—')[0].trim() ?? s.day}</td>
                <td>{s.readiness?.anklePain ?? '–'}</td>
                <td>{s.readiness?.tendonPain ?? '–'}</td>
                <td>{done}</td>
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
  const fileRef = useRef<HTMLInputElement>(null);
  const text = buildText(store, days);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1800); };

  async function copy() {
    try { await navigator.clipboard.writeText(text); flash('Copied — paste it to your coach'); }
    catch { flash('Select the preview text and copy manually'); }
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

  function restore(file: File) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const parsed = JSON.parse(String(fr.result)) as Store;
        if (!parsed?.sessions) throw new Error('bad');
        if (!window.confirm('Replace all data on this device with the file contents?')) return;
        dispatch({ type: 'replaceAll', store: parsed });
        flash('Restored');
      } catch { flash('That file is not a valid backup'); }
    };
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
      <button className="btn sec" onClick={() => fileRef.current?.click()}>Restore from JSON</button>
      <input ref={fileRef} type="file" accept="application/json" hidden
        onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
      <h3>Preview</h3>
      <pre className="out">{text}</pre>
      <button className="btn dgr" style={{ marginTop: 22 }} onClick={() => {
        if (window.confirm('Erase every logged session on this device? This cannot be undone.')) {
          dispatch({ type: 'wipe' }); flash('Erased');
        }
      }}>Erase all data on this device</button>
      <p className="sub" style={{ marginTop: 10 }}>
        Everything is stored only in this browser. Nothing is uploaded anywhere.
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
      <div className="note">3 sessions/wk is your default: keep primary strength, drop 1 accessory set, cut formal contacts 40–60%.<br />
        Surprise hard pickup → next lower session is automatically Yellow.</div>
      <h3>Non-negotiables</h3>
      <div className="note">Soleus Raise twice a week. Heels Elevated Narrow Squat is the priority lift.
        No maximal left-foot attempts until the dunk ladder criteria are met.</div>
    </section>
  );
}

export { emptyStore };
