import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { TEMPLATES } from '../data/templates';
import { hydrate, reducer, emptyStore } from '../state/store';
import { buildText, nameFor } from '../lib/plan';
import type { Store } from '../types';

const KEY = 'dtrack.v1';
const read = (): Store => JSON.parse(localStorage.getItem(KEY)!);
const today = () => Object.keys(read().sessions)[0];

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
      exId: 'hens', index: 0, field: 'reps', value: '6',
    });
    expect(before.sessions).toEqual({});
    expect(after.sessions['2026-09-15'].exercises.hens[0].reps).toBe('6');
  });

  it('adds and removes a round across every exercise in a group', () => {
    let s = emptyStore as Store;
    const ids = ['razor', 'soleus'];
    s = reducer(s, { type: 'addRound', date: 'd', day: 'mon', exIds: ids, defaults: { razor: 2, soleus: 3 } });
    expect(s.sessions.d.exercises.razor).toHaveLength(3);
    expect(s.sessions.d.exercises.soleus).toHaveLength(4);
    s = reducer(s, { type: 'removeRound', date: 'd', day: 'mon', exIds: ids });
    expect(s.sessions.d.exercises.razor).toHaveLength(2);
    expect(s.sessions.d.exercises.soleus).toHaveLength(3);
  });

  it('migrates v1 vanilla data without losing sets', () => {
    const v1 = JSON.stringify({
      v: 1,
      sessions: { '2026-09-15': { day: 'mon', notes: 'ok', readiness: null, ex: { hens: [{ r: '6', w: '135', done: true }] } } },
    });
    const store = hydrate(v1);
    expect(store.version).toBe(2);
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
    expect(within(squat as HTMLElement).getAllByLabelText(/set \d reps/i)).toHaveLength(4);
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
    await userEvent.type(within(squat).getAllByLabelText(/set 1 reps/i)[0], '6');
    await userEvent.type(within(squat).getAllByLabelText(/set 1 load/i)[0], '135');
    await userEvent.click(within(squat).getAllByLabelText(/set 1 done/i)[0]);
    const set = read().sessions[today()].exercises.hens[0];
    expect(set).toEqual({ reps: '6', load: '135', done: true });
  });

  it('logs a superset round into the same exercise store', async () => {
    render(<App />);
    await pick('mon');
    const round = document.querySelector('.grp.superset .round') as HTMLElement;
    const soleusRow = round.querySelector('[data-ex="soleus"]') as HTMLElement;
    await userEvent.type(within(soleusRow).getByLabelText(/set 1 reps/i), '12');
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
    await userEvent.type(within(squat).getAllByLabelText(/set 1 reps/i)[0], '6');
    await pick('wed');
    expect(read().sessions[today()].day).toBe('mon');
  });

  it('relabels when the prompt is accepted', async () => {
    render(<App />);
    await pick('mon');
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.type(within(squat).getAllByLabelText(/set 1 reps/i)[0], '6');
    await pick('wed');
    expect(read().sessions[today()].day).toBe('wed');
  });
});

/* ---------- export ---------- */
describe('export', () => {
  it('resolves exercise names across templates and never emits a raw id', () => {
    const store: Store = {
      version: 2,
      sessions: {
        '2026-09-15': {
          day: 'wed',
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
