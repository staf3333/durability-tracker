import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { TEMPLATES } from '../data/templates';
import { countDone, fmtDate, sessionVolumes, todayKey } from '../lib/plan';
import type { Session } from '../types';
import { sessionDate, sessionsForDate, workoutName } from '../data/workouts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const key = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function hasWork(s: Session | undefined) {
  if (!s) return false;
  return Object.values(s.exercises).some((sets) => sets.some((x) => x.done || x.reps || x.load));
}

/** Simple sparkline over the last N readings. */
function Spark({ points, invert }: { points: Array<{ date: string; v: number }>; invert?: boolean }) {
  if (points.length < 2) return <span className="nodata">not enough readings yet</span>;
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 100;
  const h = 26;
  const d = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p.v - min) / span) * h;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const first = vals[0];
  const last = vals[vals.length - 1];
  const rising = last > first;
  // For pain and stiffness, rising is bad; for range of motion it is good.
  const good = invert ? !rising : rising;

  return (
    <div className="spark">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke"
          stroke={last === first ? '#999' : good ? 'var(--green)' : 'var(--red)'} />
      </svg>
      <span className="sparkv">{last}</span>
    </div>
  );
}

export function DashboardView() {
  const { store } = useStore();
  const today = todayKey();
  const [cursor, setCursor] = useState(() => {
    const latest = Object.entries(store.sessions)
      .filter(([, session]) => !session.deletedAt)
      .map(([id, session]) => sessionDate(id, session))
      .sort()
      .at(-1) ?? today;
    const [y, m] = latest.split('-').map(Number);
    return { y, m: m - 1 };
  });

  const stats = useMemo(() => {
    const entries = Object.entries(store.sessions)
      .filter(([, session]) => !session.deletedAt)
      .sort((a, b) => {
        const byDate = sessionDate(a[0], a[1]).localeCompare(sessionDate(b[0], b[1]));
        return byDate || a[1].updatedAt.localeCompare(b[1].updatedAt);
      });
    const trained = entries.filter(([, session]) => hasWork(session));

    const since = (days: number) => {
      const c = new Date();
      c.setDate(c.getDate() - days);
      return trained.filter(([id, session]) => {
        const [y, m, dd] = sessionDate(id, session).split('-').map(Number);
        return new Date(y, m - 1, dd) >= c;
      });
    };

    const readings = (pick: (s: Session) => number | null | undefined) =>
      entries
        .map(([id, session]) => ({ date: sessionDate(id, session), v: pick(session) }))
        .filter((p): p is { date: string; v: number } => typeof p.v === 'number')
        .slice(-14);

    const volume = trained.reduce((sum, [, session]) => {
      const current = sessionVolumes(session);
      return { lb: sum.lb + current.lb, kg: sum.kg + current.kg };
    }, { lb: 0, kg: 0 });

    // Consecutive days back from today that have either a check-in or logged work.
    let streak = 0;
    const cur = new Date();
    for (;;) {
      const k = key(cur.getFullYear(), cur.getMonth(), cur.getDate());
      const sessions = sessionsForDate(store, k).map(([, session]) => session);
      if (sessions.some((session) => hasWork(session) || session.readiness)) {
        streak++;
        cur.setDate(cur.getDate() - 1);
      }
      else break;
    }

    return {
      trained, streak, volume,
      week: since(7).length,
      month: since(30).length,
      checkIns: entries.filter(([, session]) => session.readiness).length,
      ankle: readings((s) => s.readiness?.anklePain),
      tendon: readings((s) => s.readiness?.tendonPain),
      stiff: readings((s) => s.readiness?.amStiff),
      ktw: readings((s) => (s.readiness?.ktwR != null && s.readiness?.ktwL
        ? Math.round((s.readiness.ktwR / s.readiness.ktwL) * 100) : null)),
    };
  }, [store]);

  const first = new Date(cursor.y, cursor.m, 1);
  const startPad = (first.getDay() + 6) % 7;          // Monday-first
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();

  const move = (delta: number) => setCursor(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <section>
      <h2>Dashboard</h2>
      <p className="sub">{stats.trained.length} workouts logged · {stats.checkIns} check-ins</p>

      <div className="dashstats">
        <div><b>{stats.week}</b><span>this week</span></div>
        <div><b>{stats.month}</b><span>last 30 days</span></div>
        <div><b>{stats.streak}</b><span>day streak</span></div>
        <div>
          <b>{[
            stats.volume.lb ? `${Math.round(stats.volume.lb / 1000)}k lb` : '',
            stats.volume.kg ? `${Math.round(stats.volume.kg / 1000)}k kg` : '',
          ].filter(Boolean).join(' · ') || '—'}</b>
          <span>total volume</span>
        </div>
      </div>

      <div className="calhead">
        <button className="mini" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <b>{MONTHS[cursor.m]} {cursor.y}</b>
        <button className="mini" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>

      <div className="cal" role="grid" aria-label="Training calendar">
        {DOW.map((d, i) => <span key={i} className="cdow">{d}</span>)}
        {Array.from({ length: startPad }, (_, i) => <span key={`p${i}`} className="cday pad" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const k = key(cursor.y, cursor.m, d);
          const workouts = sessionsForDate(store, k);
          const worked = workouts.some(([, session]) => hasWork(session));
          const status = [...workouts].reverse()
            .find(([, session]) => session.readiness)?.[1].readiness?.status;
          const completed = workouts.length > 0
            && workouts.every(([, session]) => !!session.completedAt);
          const sets = workouts.reduce((sum, [, session]) => sum + countDone(session), 0);
          const cls = [
            'cday',
            worked ? 'worked' : '',
            status ? `s-${status}` : '',
            k === today ? 'today' : '',
            completed ? 'locked' : '',
          ].filter(Boolean).join(' ');
          const label = workouts.length
            ? `${fmtDate(k)}: ${worked ? `${sets} sets across ${workouts.length} workout${workouts.length === 1 ? '' : 's'}` : 'check-in only'}${status ? `, ${status}` : ''}`
            : fmtDate(k);
          return (
            <span key={k} className={cls} title={label} aria-label={label}>
              {d}
              {worked && <i className="cdot" />}
            </span>
          );
        })}
      </div>

      <div className="callegend">
        <span><i className="sw worked" /> trained</span>
        <span><i className="sw s-green" /> green</span>
        <span><i className="sw s-yellow" /> yellow</span>
        <span><i className="sw s-red" /> red</span>
      </div>

      <h3>Trends · last 14 readings</h3>
      <div className="trends">
        <div className="trow">
          <span className="tname">Ankle pain</span>
          <Spark points={stats.ankle} invert />
        </div>
        <div className="trow">
          <span className="tname">Tendon pain</span>
          <Spark points={stats.tendon} invert />
        </div>
        <div className="trow">
          <span className="tname">AM stiffness</span>
          <Spark points={stats.stiff} invert />
        </div>
        <div className="trow">
          <span className="tname">Ankle ROM · R as % of L</span>
          <Spark points={stats.ktw} />
        </div>
      </div>

      <h3>Recent</h3>
      {stats.trained.slice(-8).reverse().map(([id, s]) => {
        const date = sessionDate(id, s);
        return (
          <div key={id} className="recent">
            <span className={`rdot ${s.readiness?.status ?? 'none'}`} />
            <span className="rdate">{fmtDate(date)}</span>
            <span className="rname">{workoutName(s)} · {TEMPLATES[s.day]?.name.split('—')[0].trim() ?? s.day}</span>
            <span className="rsets">{countDone(s)} sets</span>
          </div>
        );
      })}
      {!stats.trained.length && <div className="empty">Nothing logged yet.</div>}
    </section>
  );
}
