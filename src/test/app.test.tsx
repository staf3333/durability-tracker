import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { TEMPLATES } from '../data/templates';
import { hydrate, reducer, emptyStore, emptySync } from '../state/store';
import { buildText, nameFor } from '../lib/plan';
import type { Store } from '../types';

const KEY = 'dtrack.v1';
const read = (): Store => JSON.parse(localStorage.getItem(KEY)!);
const NOW = '2026-09-15T09:00:00.000Z';
const today = () => Object.keys(read().sessions)[0];

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Steppers add "Decrease/Increase <label>" buttons, so match the input exactly. */
const field = (scope: HTMLElement, name: string, n: number, kind: 'reps' | 'load') =>
  within(scope).getByLabelText(new RegExp(`^${name} set ${n} ${kind}$`, 'i'));

const pick = async (day: string) => {
  await userEvent.selectOptions(screen.getByLabelText('Session'), day);
};

/* ---------- content fidelity: the plan must survive the rewrite ---------- */
describe('plan content', () => {
  it('keeps all 8 sessions and 61 exercises', () => {
    const days = Object.keys(TEMPLATES);
    const exercises = days.flatMap((d) => TEMPLATES[d].blocks.flatMap((b) => b.exercises));
    expect(days).toHaveLength(8);
    expect(exercises).toHaveLength(61);
  });

  it('keeps Soleus Raise on both Monday and Wednesday', () => {
    for (const day of ['mon', 'wed']) {
      const ids = TEMPLATES[day].blocks.flatMap((b) => b.exercises).map((x) => x.id);
      expect(ids).toContain('soleus');
    }
  });

  it('marks the two priority lifts', () => {
    const mon = TEMPLATES.mon.blocks.flatMap((b) => b.exercises);
    expect(mon.find((x) => x.id === 'hens')?.priority).toBe(true);
    expect(mon.find((x) => x.id === 'soleus')?.priority).toBe(true);
  });

  it('only links verified PJF slugs', () => {
    const slugs = Object.values(TEMPLATES)
      .flatMap((t) => t.blocks.flatMap((b) => b.exercises))
      .map((x) => x.slug).filter(Boolean) as string[];
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);
    expect(new Set(slugs).size).toBeGreaterThan(20);
  });
});

/* ---------- reducer is pure, so it can be tested without a DOM ---------- */
describe('reducer', () => {
  it('does not mutate the previous state', () => {
    const before = { ...emptyStore };
    const after = reducer(before, {
      type: 'setSetField', date: '2026-09-15', day: 'mon',
      exId: 'hens', index: 0, field: 'reps', value: '6', now: NOW,
    });
    expect(before.sessions).toEqual({});
    expect(after.sessions['2026-09-15'].exercises.hens[0].reps).toBe('6');
  });

  it('adds and removes a round across every exercise in a group', () => {
    let s = emptyStore as Store;
    const ids = ['razor', 'soleus'];
    s = reducer(s, { type: 'addRound', date: 'd', day: 'mon', exIds: ids, defaults: { razor: 2, soleus: 3 }, now: NOW });
    expect(s.sessions.d.exercises.razor).toHaveLength(3);
    expect(s.sessions.d.exercises.soleus).toHaveLength(4);
    s = reducer(s, { type: 'removeRound', date: 'd', day: 'mon', exIds: ids, now: NOW });
    expect(s.sessions.d.exercises.razor).toHaveLength(2);
    expect(s.sessions.d.exercises.soleus).toHaveLength(3);
  });

  it('migrates v1 vanilla data without losing sets', () => {
    const v1 = JSON.stringify({
      v: 1,
      sessions: { '2026-09-15': { day: 'mon', notes: 'ok', readiness: null, ex: { hens: [{ r: '6', w: '135', done: true }] } } },
    });
    const store = hydrate(v1);
    expect(store.version).toBe(4);
    const set = store.sessions['2026-09-15'].exercises.hens[0];
    expect(set).toEqual({ reps: '6', load: '135', done: true });
  });
});

/* ---------- rendering ---------- */
describe('session rendering', () => {
  it('renders straight sets as exercise cards', async () => {
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]')!;
    expect(squat).toBeInTheDocument();
    expect((squat as HTMLElement).querySelectorAll('.setrow')).toHaveLength(4);
    expect(squat.querySelector('.round')).toBeNull();
  });

  it('renders supersets as rounds, not as separate exercises', async () => {
    render(<App />);
    await pick('mon');
    const groups = document.querySelectorAll('.grp.superset');
    expect(groups).toHaveLength(2);
    const first = groups[0];
    expect(first.querySelector('.ghead')!.textContent).toMatch(/SUPERSET · 3 rounds/);
    expect(first.querySelectorAll('.glist li')).toHaveLength(2);
    expect(first.querySelectorAll('.round')).toHaveLength(3);
  });

  it('pairs both exercises in round 1 and drops the shorter one by round 3', async () => {
    render(<App />);
    await pick('mon');
    const rounds = document.querySelectorAll('.grp.superset .round');
    expect(rounds[0].querySelectorAll('.grow')).toHaveLength(2);
    expect(rounds[2].querySelectorAll('.grow')).toHaveLength(1);
    expect(rounds[2].querySelector('.grow')!.getAttribute('data-ex')).toBe('soleus');
  });

  it('renders the Thursday microdose as a circuit', async () => {
    render(<App />);
    await pick('thu');
    expect(document.querySelector('.grp.circuit')).toBeInTheDocument();
    expect(document.querySelector('.ghead')!.textContent).toMatch(/CIRCUIT/);
  });

  it('shows a set timer only where a duration is defined', async () => {
    render(<App />);
    await pick('thu');
    expect(document.querySelector('[data-ex="slantiso"] .stimer')).toBeInTheDocument();
    expect(document.querySelector('[data-ex="inv"] .stimer')).toBeNull();
  });
});

/* ---------- logging ---------- */
describe('logging', () => {
  it('persists reps, load and done state', async () => {
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.type(field(squat, 'Heels Elevated Narrow Squat', 1, 'reps'), '6');
    await userEvent.type(field(squat, 'Heels Elevated Narrow Squat', 1, 'load'), '135');
    await userEvent.click(within(squat).getByLabelText(/set 1 done/i));
    const set = read().sessions[today()].exercises.hens[0];
    expect(set).toEqual({ reps: '6', load: '135', done: true });
  });

  it('logs a superset round into the same exercise store', async () => {
    render(<App />);
    await pick('mon');
    const round = document.querySelector('.grp.superset .round') as HTMLElement;
    const soleusRow = round.querySelector('[data-ex="soleus"]') as HTMLElement;
    await userEvent.type(field(soleusRow, 'Soleus Raise', 1, 'reps'), '12');
    expect(read().sessions[today()].exercises.soleus[0].reps).toBe('12');
  });

  it('marks a round done only when every member is ticked', async () => {
    render(<App />);
    await pick('mon');
    const group = document.querySelector('.grp.superset') as HTMLElement;
    const round = group.querySelector('.round') as HTMLElement;
    await userEvent.click(within(round.querySelector('[data-ex="razor"]') as HTMLElement).getByLabelText(/done/i));
    expect(document.querySelector('.grp.superset .round')!.className).not.toMatch(/done/);
    const fresh = document.querySelector('.grp.superset .round') as HTMLElement;
    await userEvent.click(within(fresh.querySelector('[data-ex="soleus"]') as HTMLElement).getByLabelText(/done/i));
    expect(document.querySelector('.grp.superset .round')!.className).toMatch(/done/);
  });

  it('adds and removes rounds for the whole group', async () => {
    render(<App />);
    await pick('mon');
    // scope to the superset — the Block 1 circuit also renders round controls
    const group = () => document.querySelectorAll('.grp.superset')[0] as HTMLElement;
    await userEvent.click(within(group()).getByText('+ round'));
    expect(group().querySelectorAll('.round')).toHaveLength(4);
    await userEvent.click(within(group()).getByText('− round'));
    expect(group().querySelectorAll('.round')).toHaveLength(3);
  });
});

/* ---------- the per-set timer ---------- */
describe('set timer', () => {
  it('counts down, pauses, and auto-logs on completion', async () => {
    render(<App />);
    // let the sync hook's identity check settle before fake timers are installed,
    // otherwise it resolves later and updates state outside act()
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText('Session'), { target: { value: 'thu' } });
    vi.useFakeTimers();

    const btn = () => document.querySelector('[data-ex="slantiso"][data-i="0"] .stimer')!;
    expect(btn().textContent).toContain('0:45');

    fireEvent.click(btn());
    expect(btn().textContent).toContain('❚❚');

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(btn().textContent).toContain('0:35');

    fireEvent.click(btn());                        // pause
    const paused = btn().textContent;
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(btn().textContent).toBe(paused);

    fireEvent.click(btn());                        // resume and run out
    act(() => { vi.advanceTimersByTime(40_000); });

    const set = read().sessions[today()].exercises.slantiso[0];
    expect(set.reps).toBe('0:45');
    expect(set.done).toBe(true);
  });
});

/* ---------- readiness gate ---------- */
describe('check-in', () => {
  it('saves readiness and drives the session gate', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Check-in' }));
    await userEvent.type(screen.getByLabelText(/Knee-to-wall R/), '11.5');
    await userEvent.type(screen.getByLabelText(/Knee-to-wall L/), '13');
    await userEvent.type(screen.getByLabelText(/ankle pain/i), '1');
    await userEvent.type(screen.getByLabelText(/tendon pain/i), '2');
    await userEvent.click(screen.getByRole('button', { name: 'YELLOW' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save check-in' }));

    expect(read().sessions[today()].readiness!.status).toBe('yellow');
    expect(document.querySelector('.chip')!.textContent).toBe('YELLOW');

    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByText(/Cut contacts 30–50%/)).toBeInTheDocument();
  });
});

/* ---------- the data-integrity bug found in the vanilla build ---------- */
describe('session relabelling guard', () => {
  it('keeps the original label when the prompt is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.type(field(squat, 'Heels Elevated Narrow Squat', 1, 'reps'), '6');
    await pick('wed');
    expect(read().sessions[today()].day).toBe('mon');
  });

  it('relabels when the prompt is accepted', async () => {
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.type(field(squat, 'Heels Elevated Narrow Squat', 1, 'reps'), '6');
    await pick('wed');
    expect(read().sessions[today()].day).toBe('wed');
  });
});

/* ---------- export ---------- */
describe('export', () => {
  it('resolves exercise names across templates and never emits a raw id', () => {
    const store: Store = {
      version: 4,
      history: {},
      sync: emptySync,
      sessions: {
        '2026-09-15': {
          day: 'wed', updatedAt: NOW,
          readiness: { ktwR: 11.5, ktwL: 13, anklePain: 1, tendonPain: 2, amStiff: 5, swelling: 'no', notes: '', status: 'green' },
          exercises: { hens: [{ reps: '6', load: '135', done: true }] },
          notes: 'felt strong',
        },
      },
    };
    const text = buildText(store, 9999);
    expect(text).toContain('DURABILITY LOG');
    expect(text).toContain('Heels Elevated Narrow Squat: 135×6');
    expect(text).toContain('ankle 1/10 · tendon 2/10');
    expect(text).toContain('KTW R 11.5 / L 13 (88%)');
    expect(text).toContain('Notes: felt strong');
    expect(text).not.toMatch(/\n {2}hens:/);
  });

  it('falls back across templates for ids not in the labelled day', () => {
    expect(nameFor('sun', 'soleus')).toBe('Soleus Raise');
  });
});

/* ---------- privacy ---------- */
describe('privacy', () => {
  it('ships no clinical narrative in app content', () => {
    const blob = JSON.stringify(TEMPLATES);
    expect(blob).not.toMatch(/deltoid|MRI|avulsion|tenosynovitis|malleol|osteochondral/i);
  });
});

/* ---------- imported history feeds "last time" without inventing sessions ---------- */
describe('imported history', () => {
  const seeded: Store = {
    version: 4,
    sync: emptySync,
    sessions: {},
    history: {
      hens: { date: '2026-04-17', source: 'Vert Code Elite Phase 1',
              sets: [{ reps: '8', load: '90', done: true }, { reps: '8', load: '90', done: true }] },
    },
  };

  it('never appears as a logged session', () => {
    const s = reducer(seeded, { type: 'mergeHistory', history: seeded.history, now: NOW });
    expect(Object.keys(s.sessions)).toHaveLength(0);
  });

  it('is excluded from the exported log', () => {
    expect(buildText(seeded, 9999)).toBe('No sessions logged in this range.');
  });

  it('surfaces as a PJF-labelled last-time line', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify(seeded));
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    const line = squat.querySelector('.lastline')!;
    expect(line.textContent).toMatch(/PJF/);
    expect(line.textContent).toMatch(/90×8, 90×8/);
  });

  it('prefills the set placeholder so the load is visible before you lift', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify(seeded));
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    const loadInput = within(squat).getByLabelText(/^Heels Elevated Narrow Squat set 1 load$/i);
    expect(loadInput).toHaveAttribute('placeholder', '90');
  });

  it('is superseded once a real session is logged', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify({
      ...seeded,
      sessions: {
        '2026-09-01': { day: 'mon', readiness: null, notes: '', updatedAt: NOW,
                        exercises: { hens: [{ reps: '6', load: '75', done: true }] } },
      },
    }));
    render(<App />);
    await pick('mon');
    const line = document.querySelector('.ex[data-ex="hens"] .lastline')!;
    expect(line.textContent).toMatch(/last/);
    expect(line.textContent).toMatch(/75×6/);
    expect(line.textContent).not.toMatch(/PJF/);
  });

  it('migrates a v2 store without dropping data', () => {
    const v2 = JSON.stringify({ version: 2, sessions: { d: { day: 'mon', readiness: null, notes: '', exercises: {} } } });
    const s = hydrate(v2);
    expect(s.version).toBe(4);
    expect(s.history).toEqual({});
    expect(Object.keys(s.sessions)).toHaveLength(1);
  });
});

/* ---------- steppers ---------- */
describe('steppers', () => {
  it('increments load by 5 and reps by 1', async () => {
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(squat).getByLabelText(/^Increase .* set 1 load$/i));
    await userEvent.click(within(squat).getByLabelText(/^Increase .* set 1 reps$/i));
    const set = JSON.parse(localStorage.getItem('dtrack.v1')!).sessions[
      Object.keys(JSON.parse(localStorage.getItem('dtrack.v1')!).sessions)[0]].exercises.hens[0];
    expect(set.load).toBe('5');
    expect(set.reps).toBe('1');
  });

  it('steps up from the imported value rather than from zero', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify(seededStore));
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(squat).getByLabelText(/^Increase .* set 1 load$/i));
    const store = JSON.parse(localStorage.getItem('dtrack.v1')!);
    const set = store.sessions[Object.keys(store.sessions)[0]].exercises.hens[0];
    expect(set.load).toBe('95');
  });

  it('never goes below zero', async () => {
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(squat).getByLabelText(/^Decrease .* set 1 load$/i));
    const store = JSON.parse(localStorage.getItem('dtrack.v1')!);
    const set = store.sessions[Object.keys(store.sessions)[0]].exercises.hens[0];
    expect(set.load).toBe('0');
  });
});

const seededStore: Store = {
  version: 4, sync: emptySync, sessions: {},
  history: { hens: { date: '2026-04-17', source: 'PJF', sets: [{ reps: '8', load: '90', done: true }] } },
};

/* ---------- schema v4: sync metadata ---------- */
describe('schema v4', () => {
  it('stamps updatedAt and queues the date for push on every mutation', () => {
    const s = reducer(emptyStore, {
      type: 'setSetField', date: '2026-09-14', day: 'mon',
      exId: 'hens', index: 0, field: 'load', value: '75', now: NOW,
    });
    expect(s.sessions['2026-09-14'].updatedAt).toBe(NOW);
    expect(s.sync.pending).toEqual({ '2026-09-14': true });
  });

  it('re-stamps on a later edit', () => {
    const later = '2026-09-14T10:00:00.000Z';
    let s = reducer(emptyStore, {
      type: 'setSetField', date: '2026-09-14', day: 'mon',
      exId: 'hens', index: 0, field: 'load', value: '75', now: NOW,
    });
    s = reducer(s, { type: 'toggleDone', date: '2026-09-14', day: 'mon', exId: 'hens', index: 0, now: later });
    expect(s.sessions['2026-09-14'].updatedAt).toBe(later);
  });

  it('clears pending and advances the cursor on markSynced', () => {
    let s = reducer(emptyStore, {
      type: 'setSetField', date: '2026-09-14', day: 'mon',
      exId: 'hens', index: 0, field: 'load', value: '75', now: NOW,
    });
    const serverTime = '2026-09-14T09:00:05.000Z';
    s = reducer(s, { type: 'markSynced', dates: ['2026-09-14'], serverTime, now: NOW });
    expect(s.sync.pending).toEqual({});
    expect(s.sync.lastSyncedAt).toBe(serverTime);
  });

  it('uses server time for the cursor, never the device clock', () => {
    // device clock running an hour fast
    const skewed = '2026-09-14T10:00:00.000Z';
    const serverTime = '2026-09-14T09:00:05.000Z';
    let s = reducer(emptyStore, {
      type: 'setSetField', date: '2026-09-14', day: 'mon',
      exId: 'hens', index: 0, field: 'load', value: '75', now: skewed,
    });
    s = reducer(s, { type: 'markSynced', dates: ['2026-09-14'], serverTime, now: skewed });
    expect(s.sync.lastSyncedAt).toBe(serverTime);
    expect(s.sync.lastSyncedAt! < s.sessions['2026-09-14'].updatedAt).toBe(true);
  });

  it('does not mark history merges as pending session pushes', () => {
    const s = reducer(emptyStore, {
      type: 'mergeHistory', now: NOW,
      history: { hens: { date: '2026-04-17', source: 'PJF', sets: [] } },
    });
    expect(s.sync.pending).toEqual({});
    expect(s.history.hens).toBeDefined();
  });

  it('migrates v3 sessions with a deterministic updatedAt', () => {
    const v3 = JSON.stringify({
      version: 3, history: {},
      sessions: { '2026-09-01': { day: 'mon', readiness: null, notes: '', exercises: {} } },
    });
    const s = hydrate(v3);
    expect(s.version).toBe(4);
    expect(s.sessions['2026-09-01'].updatedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(s.sync).toEqual(emptySync);
  });

  it('migrates v1 vanilla data all the way to v4', () => {
    const v1 = JSON.stringify({
      v: 1,
      sessions: { '2026-09-01': { day: 'mon', ex: { hens: [{ r: '6', w: '135', done: true }] } } },
    });
    const s = hydrate(v1);
    expect(s.version).toBe(4);
    expect(s.sessions['2026-09-01'].exercises.hens[0]).toEqual({ reps: '6', load: '135', done: true });
    expect(s.sessions['2026-09-01'].updatedAt).toBeTruthy();
  });

  it('records a sync error without touching training data', () => {
    let s = reducer(emptyStore, {
      type: 'setSetField', date: '2026-09-14', day: 'mon',
      exId: 'hens', index: 0, field: 'load', value: '75', now: NOW,
    });
    s = reducer(s, { type: 'setSyncError', message: 'offline', now: NOW });
    expect(s.sync.lastError).toBe('offline');
    expect(s.sessions['2026-09-14'].exercises.hens[0].load).toBe('75');
    expect(s.sync.pending).toEqual({ '2026-09-14': true });
  });
});

/* ---------- the check-in grades yesterday, not just today ---------- */
describe('check-in context', () => {
  it('shows the previous logged session and what it contained', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 4, history: {}, sync: emptySync,
      sessions: {
        '2026-09-10': {
          day: 'mon', readiness: null, notes: 'legs felt heavy', updatedAt: NOW,
          exercises: { hens: [
            { reps: '6', load: '75', done: true },
            { reps: '6', load: '75', done: true },
          ] },
        },
      },
    }));
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Check-in' }));

    const panel = document.querySelector('.grading')!;
    expect(panel.textContent).toMatch(/You are grading/i);
    expect(panel.textContent).toMatch(/Sep 10/);
    expect(panel.textContent).toMatch(/2 sets/);
    expect(panel.textContent).toMatch(/900 lbs/);          // 75 x 6 x 2
    expect(panel.textContent).toMatch(/legs felt heavy/);
  });

  it('explains why the next-morning reading is the one that counts', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 4, history: {}, sync: emptySync,
      sessions: {
        '2026-09-10': { day: 'mon', readiness: null, notes: '', updatedAt: NOW,
                        exercises: { hens: [{ reps: '6', load: '75', done: true }] } },
      },
    }));
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(document.querySelector('.grading')!.textContent)
      .toMatch(/reports the morning after, not during/i);
  });

  it('shows nothing to grade when there is no prior session', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(document.querySelector('.grading')).toBeNull();
  });

  it('ignores an empty session and grades the last real one', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 4, history: {}, sync: emptySync,
      sessions: {
        '2026-09-09': { day: 'mon', readiness: null, notes: 'the real one', updatedAt: NOW,
                        exercises: { hens: [{ reps: '6', load: '70', done: true }] } },
        '2026-09-11': { day: 'tue', readiness: null, notes: '', updatedAt: NOW, exercises: {} },
      },
    }));
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Check-in' }));
    expect(document.querySelector('.grading')!.textContent).toMatch(/the real one/);
  });
});

/* ---------- pasting a backup, for cutover on a phone ---------- */
describe('paste import', () => {
  it('imports a pasted full backup', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const payload = JSON.stringify({
      version: 4, history: {}, sync: emptySync,
      sessions: { '2026-09-11': { day: 'mon', readiness: null, notes: 'from my phone',
                                  updatedAt: NOW, exercises: {} } },
    });
    fireEvent.change(screen.getByLabelText(/Paste backup JSON/i), { target: { value: payload } });
    await userEvent.click(screen.getByRole('button', { name: /Import pasted data/i }));
    expect(read().sessions['2026-09-11'].notes).toBe('from my phone');
  });

  it('rejects malformed input without destroying existing data', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 4, history: {}, sync: emptySync,
      sessions: { '2026-09-11': { day: 'mon', readiness: null, notes: 'keep me',
                                  updatedAt: NOW, exercises: {} } },
    }));
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.change(screen.getByLabelText(/Paste backup JSON/i), { target: { value: 'not json' } });
    await userEvent.click(screen.getByRole('button', { name: /Import pasted data/i }));
    expect(read().sessions['2026-09-11'].notes).toBe('keep me');
  });
});

/* ---------- browsing every past performance of an exercise ---------- */
describe('exercise history', () => {
  const withArchive = {
    version: 4, sync: emptySync, sessions: {},
    history: {
      hens: {
        date: '2026-04-17', source: 'The Vert Code- Elite Phase 1',
        note: 'Kinda light but no good setup',
        sets: [{ reps: '8', load: '90', done: true }],
        archive: [
          { date: '2025-04-28', source: 'The Vert Code- Elite Phase 1',
            sets: [{ reps: '8', load: '115', done: true }] },
          { date: '2025-02-20', source: 'The Durability Code Prime',
            sets: [{ reps: '5', load: '90', done: true }], note: 'Left knee struggling' },
        ],
      },
    },
  };

  it('is collapsed until asked for, with a count', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify(withArchive));
    render(<App />);
    await pick('mon');
    const card = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    expect(within(card).getByText(/history · 3/)).toBeInTheDocument();
    expect(card.querySelector('.hlist')).toBeNull();
  });

  it('lists every performance newest first when opened', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify(withArchive));
    render(<App />);
    await pick('mon');
    const card = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(card).getByText(/history · 3/));
    const dates = [...card.querySelectorAll('.hdate')].map((d) => d.textContent);
    expect(dates).toEqual(['2026-04-17', '2025-04-28', '2025-02-20']);
  });

  it('surfaces the heaviest load ever recorded', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify(withArchive));
    render(<App />);
    await pick('mon');
    const card = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(card).getByText(/history · 3/));
    expect(card.querySelector('.hbest')!.textContent).toMatch(/115 lb/);
  });

  it('keeps your own notes attached to the right session', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify(withArchive));
    render(<App />);
    await pick('mon');
    const card = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(card).getByText(/history · 3/));
    expect(card.textContent).toMatch(/Left knee struggling/);
  });

  it('distinguishes sessions logged here from imported ones', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify({
      ...withArchive,
      sessions: {
        '2026-09-14': { day: 'mon', readiness: null, notes: '', updatedAt: NOW,
                        exercises: { hens: [{ reps: '6', load: '75', done: true }] } },
      },
    }));
    render(<App />);
    await pick('mon');
    const card = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(card).getByText(/history · 4/));
    const own = card.querySelector('.hrow.mine')!;
    expect(own.querySelector('.hdate')!.textContent).toBe('2026-09-14');
    expect(card.querySelectorAll('.hrow.mine')).toHaveLength(1);
  });

  it('shows nothing for an exercise with no record', async () => {
    render(<App />);
    await pick('mon');
    const card = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    expect(card.querySelector('.exhist')).toBeNull();
  });
});
