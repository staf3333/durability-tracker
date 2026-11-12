import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ExerciseHistory } from '../components/ExerciseHistory';
import { plannedWorkouts } from '../data/workouts';
import { workoutElapsedSeconds } from '../lib/duration';
import { buildAtlasExport, sessionVolumes, todayKey } from '../lib/plan';
import { emptyStore, emptySync, hydrate, reducer } from '../state/store';
import type { Session, Store } from '../types';

const NOW = '2026-10-29T08:00:00.000Z';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const openWorkout = async (day: string, workout: string) => {
  await userEvent.selectOptions(screen.getByLabelText('Day plan'), day);
  await userEvent.click(screen.getByRole('button', { name: `Open ${workout}` }));
};

const openExercise = async (day: string, workout: string, exercise: string) => {
  await openWorkout(day, workout);
  await userEvent.click(screen.getByRole('button', { name: `Open ${exercise}` }));
};

describe('schema v6 planned workouts', () => {
  it('defines the requested stable workout groups for every day', () => {
    expect(plannedWorkouts('tue').map((workout) => workout.id))
      .toEqual(['shooting-wotw', 'daily-microdose', 'upper-1']);
    expect(plannedWorkouts('thu').map((workout) => ({
      id: workout.id,
      blocks: workout.blocks.map((block) => block.title),
    }))).toEqual([
      { id: 'microdose', blocks: ['Microdose', 'Optional'] },
      { id: 'upper-2', blocks: ['Upper 2 · mixed — after work', 'Superset · delts', 'Superset · arms'] },
    ]);
    expect(plannedWorkouts('sat').map((workout) => workout.id))
      .toEqual(['basketball', 'upper-3']);
    expect(plannedWorkouts('mon')).toHaveLength(1);
    expect(plannedWorkouts('wed')).toHaveLength(1);
  });

  it('migrates a date-keyed v4 store without changing its stable key or data', () => {
    const raw = JSON.stringify({
      version: 4,
      sessions: {
        '2026-10-21': {
          day: 'mon',
          readiness: null,
          exercises: { slrdl: [{ reps: '8', load: '24', done: true }] },
          notes: 'Kg not lbs',
          startedAt: '2026-10-21T08:00:00.000Z',
          completedAt: '2026-10-21T11:56:00.000Z',
          updatedAt: '2026-10-21T11:56:00.000Z',
        },
      },
      history: {},
      sync: emptySync,
    });

    const store = hydrate(raw);
    expect(store.version).toBe(6);
    expect(Object.keys(store.sessions)).toEqual(['2026-10-21']);
    expect(store.sessions['2026-10-21']).toMatchObject({
      id: '2026-10-21',
      date: '2026-10-21',
      workoutId: 'lower-a',
      notes: 'Kg not lbs',
      startedAt: '2026-10-21T08:00:00.000Z',
      completedAt: '2026-10-21T11:56:00.000Z',
    });
    expect(store.sessions['2026-10-21'].exercises.slrdl[0])
      .toEqual({ reps: '8', load: '24', done: true });
  });

  it('splits a mixed Tuesday log by planned exercise membership without loss', () => {
    const readiness = {
      ktwR: 10, ktwL: 11, anklePain: 1, tendonPain: 2, amStiff: 5,
      swelling: 'no', notes: 'Ready', status: 'green',
    };
    const store = hydrate(JSON.stringify({
      version: 4, history: {}, sync: emptySync, prefs: {},
      sessions: {
        '2026-10-29': {
          day: 'tue', readiness,
          exercises: {
            wotw: [{ reps: '108', load: '', done: true }],
            banddf: [{ reps: '8', load: '', done: true }],
            bench: [{ reps: '5', load: '185', done: true }],
          },
          exerciseNotes: { bench: 'Strong top set' },
          notes: 'Legacy whole-day note',
          startedAt: '2026-10-29T08:00:00.000Z',
          completedAt: '2026-10-29T12:00:00.000Z',
          updatedAt: NOW,
        },
      },
    }));

    expect(Object.values(store.sessions).map((session) => session.workoutId))
      .toEqual(['shooting-wotw', 'daily-microdose', 'upper-1']);
    expect(store.sessions['2026-10-29'].exercises).toHaveProperty('wotw');
    expect(store.sessions['2026-10-29--daily-microdose'].exercises).toHaveProperty('banddf');
    expect(store.sessions['2026-10-29--upper-1'].exercises.bench[0].load).toBe('185');
    expect(store.sessions['2026-10-29--upper-1'].exerciseNotes?.bench).toBe('Strong top set');
    for (const session of Object.values(store.sessions)) {
      expect(session.readiness).toEqual(readiness);
      expect(session.notes).toBe('Legacy whole-day note');
      expect(session.startedAt).toBeUndefined();
      expect(session.completedAt).toBe('2026-10-29T12:00:00.000Z');
    }
  });

  it('replaces pre-release generic v5 names with planned workout identity', () => {
    const store = hydrate(JSON.stringify({
      version: 5, history: {}, sync: emptySync, prefs: {},
      sessions: {
        '2026-10-29--evening': {
          id: '2026-10-29--evening', date: '2026-10-29',
          name: 'Upper after work', day: 'tue', readiness: null,
          exercises: { bench: [{ reps: '5', load: '185', done: true }] },
          notes: '', updatedAt: NOW,
        },
      },
    }));
    expect(store.sessions['2026-10-29--evening']).toMatchObject({
      workoutId: 'upper-1',
      name: undefined,
    });
  });

  it('migrates a legacy remote mixed-day record and queues planned workouts for push', () => {
    const store = reducer(emptyStore, {
      type: 'applyRemote',
      sessions: {
        '2026-10-29': {
          day: 'tue', readiness: null, notes: '', updatedAt: NOW,
          exercises: {
            wotw: [{ reps: '108', load: '', done: true }],
            bench: [{ reps: '5', load: '185', done: true }],
          },
        },
      },
      history: {},
      deleted: [],
      serverTime: NOW,
      now: NOW,
    });
    expect(store.sessions['2026-10-29'].workoutId).toBe('shooting-wotw');
    expect(store.sessions['2026-10-29--upper-1'].workoutId).toBe('upper-1');
    expect(store.sync.pending).toEqual({
      '2026-10-29': true,
      '2026-10-29--upper-1': true,
    });
  });
});

describe('idle-safe workout timing', () => {
  it('caps inactive gaps and completes a forgotten workout at the capped activity time', () => {
    let store = reducer(emptyStore, {
      type: 'createWorkout', id: '2026-10-29--upper-1', date: '2026-10-29',
      day: 'tue', workoutId: 'upper-1', now: '2026-10-29T08:00:00.000Z',
    });
    store = reducer(store, {
      type: 'setSetField', date: '2026-10-29--upper-1', day: 'tue',
      exId: 'bench', index: 0, field: 'reps', value: '5',
      now: '2026-10-29T08:00:00.000Z',
    });
    store = reducer(store, {
      type: 'setSetField', date: '2026-10-29--upper-1', day: 'tue',
      exId: 'bench', index: 0, field: 'load', value: '185',
      now: '2026-10-29T08:10:00.000Z',
    });
    store = reducer(store, {
      type: 'toggleDone', date: '2026-10-29--upper-1', day: 'tue',
      exId: 'bench', index: 0, now: '2026-10-29T10:10:00.000Z',
    });
    expect(store.sessions['2026-10-29--upper-1'].activeSeconds).toBe(40 * 60);

    store = reducer(store, {
      type: 'completeSession', date: '2026-10-29--upper-1', day: 'tue',
      now: '2026-10-29T15:10:00.000Z',
    });
    const workout = store.sessions['2026-10-29--upper-1'];
    expect(workout.activeSeconds).toBe(70 * 60);
    expect(workout.completedAt).toBe('2026-10-29T10:40:00.000Z');
    expect(workoutElapsedSeconds(workout)).toBe(70 * 60);
  });

  it('stops a legacy incomplete timer at its last saved activity after idling', () => {
    const workout: Session = {
      day: 'mon', workoutId: 'lower-a', readiness: null, exercises: {}, notes: '',
      startedAt: '2026-10-21T08:00:00.000Z',
      updatedAt: '2026-10-21T09:00:00.000Z',
    };
    expect(workoutElapsedSeconds(workout, Date.parse('2026-10-21T14:00:00.000Z')))
      .toBe(60 * 60);
  });
});

describe('planned workout day dashboard', () => {
  it('shows Tuesday three named workouts and tracks them independently', async () => {
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText('Day plan'), 'tue');

    expect(screen.getByRole('button', { name: 'Open Shooting / WOTW' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Daily microdose' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Upper 1' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Open Shooting / WOTW' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open Current WOTW — game pace' }));
    await userEvent.type(screen.getByRole('textbox', {
      name: 'Current WOTW — game pace set 1 reps',
    }), '108');
    await userEvent.click(screen.getByLabelText(/Mark Current WOTW — game pace set 1 done/i));
    await userEvent.click(screen.getByLabelText(/Back to the workout list/i));
    await userEvent.click(screen.getByRole('button', { name: /Complete workout/i }));
    await userEvent.click(screen.getByRole('button', { name: /Back to day/i }));

    const shooting = screen.getByRole('button', { name: 'Open Shooting / WOTW' });
    expect(shooting).toHaveTextContent('Completed');
    expect(screen.getByRole('button', { name: 'Open Daily microdose' }))
      .toHaveTextContent('Not started');

    await userEvent.click(screen.getByRole('button', { name: 'Open Upper 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open Bench Press' }));
    await userEvent.type(screen.getByRole('textbox', {
      name: 'Bench Press set 1 load',
    }), '185');
    await userEvent.click(screen.getByLabelText(/Back to the workout list/i));
    await userEvent.click(screen.getByRole('button', { name: /Back to day/i }));

    expect(screen.getByRole('button', { name: 'Open Shooting / WOTW' }))
      .toHaveTextContent('Completed');
    expect(screen.getByRole('button', { name: 'Open Upper 1' }))
      .toHaveTextContent('In progress');
  });
});

describe('load units and distance', () => {
  it('partitions volume by unit instead of adding kg and lb together', () => {
    const session: Session = {
      day: 'mon', readiness: null, notes: '', updatedAt: NOW,
      exercises: {
        hens: [
          { reps: '5', load: '100', loadUnit: 'lb', done: true },
          { reps: '5', load: '20', loadUnit: 'kg', done: true },
        ],
      },
    };
    expect(sessionVolumes(session)).toEqual({ lb: 500, kg: 100 });
  });

  it('keeps set rows mounted after enabling load and supports kg plus distance', async () => {
    render(<App />);
    await openExercise('mon', 'Lower A', 'Razor Curl Progressions');
    expect(document.querySelectorAll('.dset')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Exercise settings' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Track load' }));
    expect(document.querySelectorAll('.dset')).toHaveLength(2);
    expect(document.querySelectorAll(
      'input[aria-label^="Razor Curl Progressions set"][aria-label$=" load"]',
    )).toHaveLength(2);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Track distance' }));
    expect(document.querySelectorAll('.dset')).toHaveLength(2);
    expect(document.querySelectorAll(
      'input[aria-label^="Razor Curl Progressions set"][aria-label$=" distance"]',
    )).toHaveLength(2);

    await userEvent.selectOptions(
      screen.getByLabelText('Razor Curl Progressions set 1 load unit'), 'kg',
    );
    await userEvent.type(screen.getByLabelText('Razor Curl Progressions set 1 load'), '24');
    await userEvent.type(screen.getByLabelText('Razor Curl Progressions set 1 distance'), '10');

    const stored = JSON.parse(localStorage.getItem('dtrack.v1')!) as Store;
    const workout = stored.sessions[Object.keys(stored.sessions)[0]];
    expect(workout.exercises.razor[0]).toMatchObject({
      load: '24', loadUnit: 'kg', distance: '10',
    });
    expect(workout.exercises.razor).toHaveLength(2);
  });
});

describe('group rest behavior', () => {
  it('starts automatic rest only after the final member of a superset round', async () => {
    render(<App />);
    await openWorkout('mon', 'Lower A');
    await userEvent.click(screen.getByText('Expand all sets'));

    const round = document.querySelector('.grp.superset .round') as HTMLElement;
    await userEvent.click(within(round).getByLabelText(/Mark Razor Curl Progressions set 1 done/i));
    expect(screen.queryByRole('timer', { name: 'Rest timer' })).not.toBeInTheDocument();

    await userEvent.click(within(round).getByLabelText(/Mark Soleus Raise set 1 done/i));
    expect(screen.getByRole('timer', { name: 'Rest timer' })).toHaveTextContent(/round 1/i);
  });

  it('keeps straight-set automatic rest unchanged', async () => {
    render(<App />);
    await openWorkout('mon', 'Lower A');
    await userEvent.click(screen.getByText('Expand all sets'));
    const squat = document.querySelector('.ex[data-ex="hens"]') as HTMLElement;
    await userEvent.click(within(squat).getByLabelText(/Mark Heels Elevated Narrow Squat set 1 done/i));
    expect(screen.getByRole('timer', { name: 'Rest timer' }))
      .toHaveTextContent(/Heels Elevated Narrow Squat · set 1/i);
  });

  it('still allows manual rest before a grouped round is complete', async () => {
    render(<App />);
    await openWorkout('mon', 'Lower A');
    await userEvent.click(screen.getByText('Expand all sets'));
    const round = document.querySelector('.grp.superset .round') as HTMLElement;
    await userEvent.click(within(round).getByRole('button', { name: /rest 1:00/i }));
    expect(screen.getByRole('timer', { name: 'Rest timer' })).toBeInTheDocument();
  });
});

describe('exercise history', () => {
  it('shows every logged performance with its exercise note and setup, not the session note', () => {
    const store: Store = {
      version: 6,
      sync: emptySync,
      history: {
        soleus: {
          date: '2026-09-01', source: 'Imported',
          sets: [{ reps: '12', load: '45', done: true }],
          note: 'Imported note',
        },
      },
      sessions: {
        '2026-10-21': {
          id: '2026-10-21', date: '2026-10-21', day: 'mon', workoutId: 'lower-a',
          readiness: null,
          updatedAt: NOW, notes: 'Wrong session note',
          exerciseNotes: { soleus: 'Exercise-specific note' },
          exerciseSetups: { soleus: 'Smith machine with wedge' },
          exercises: { soleus: [{ reps: '10', load: '70', done: true }] },
        },
        '2026-10-21--later': {
          id: '2026-10-21--later', date: '2026-10-21', day: 'wed', workoutId: 'lower-b',
          readiness: null,
          updatedAt: '2026-10-21T18:00:00.000Z', notes: '',
          exercises: { soleus: [{ reps: '8', load: '80', done: true }] },
        },
      },
    };

    render(<ExerciseHistory exId="soleus" store={store} startOpen />);
    expect(screen.getByText('Exercise-specific note')).toBeInTheDocument();
    expect(screen.queryByText('Wrong session note')).not.toBeInTheDocument();
    expect(screen.getByText('Smith machine with wedge')).toBeInTheDocument();
    expect(document.querySelectorAll('.hrow')).toHaveLength(3);
  });

  it('shows obvious multi-workout Bench Press history inside Upper 1', async () => {
    const date = todayKey();
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 6,
      sync: emptySync,
      prefs: {},
      history: {
        bench: {
          date: '2026-09-01', source: 'Imported programme',
          sets: [{ reps: '5', load: '80', loadUnit: 'kg', done: true }],
          note: 'Imported baseline',
        },
      },
      sessions: {
        '2026-10-21--upper-1': {
          id: '2026-10-21--upper-1', date: '2026-10-21',
          day: 'tue', workoutId: 'upper-1', readiness: null,
          exercises: {
            bench: [
              { reps: '5', load: '185', loadUnit: 'lb', done: true },
              { reps: '4', load: '195', loadUnit: 'lb', done: false },
            ],
          },
          exerciseNotes: { bench: 'Paused first rep' },
          exerciseSetups: { bench: 'Competition bench' },
          notes: '', updatedAt: '2026-10-21T18:00:00.000Z',
        },
        '2026-10-28--upper-1': {
          id: '2026-10-28--upper-1', date: '2026-10-28',
          day: 'tue', workoutId: 'upper-1', readiness: null,
          exercises: {
            bench: [{ reps: '5', load: '190', loadUnit: 'lb', done: true }],
          },
          exerciseNotes: { bench: 'Fast bar speed' },
          notes: '', updatedAt: '2026-10-28T18:00:00.000Z',
        },
      },
    }));

    render(<App />);
    await openExercise('tue', 'Upper 1', 'Bench Press');
    expect(screen.getByText(/Last time/).closest('.dlast')).toHaveTextContent('190 lb × 5');

    await userEvent.click(screen.getByRole('button', { name: /Previous workouts/i }));
    const panel = screen.getByRole('dialog', { name: 'Previous Bench Press workouts' });
    expect(within(panel).getAllByText(/2026-/)).toHaveLength(3);
    expect(panel).toHaveTextContent('190 lb × 5');
    expect(panel).toHaveTextContent('185 lb × 5');
    expect(panel).toHaveTextContent('195 lb × 4 (not done)');
    expect(panel).toHaveTextContent('Competition bench');
    expect(panel).toHaveTextContent('Paused first rep');
    expect(panel).toHaveTextContent('Imported programme');

    const currentId = `${date}--upper-1`;
    expect(JSON.parse(localStorage.getItem('dtrack.v1')!).sessions[currentId]).toBeDefined();
  });
});

describe('workout history drilldown', () => {
  it('opens a complete read-only view of an older workout and returns to the list', async () => {
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 6, sync: emptySync, history: {}, prefs: {},
      sessions: {
        '2026-10-21': {
          id: '2026-10-21', date: '2026-10-21', day: 'mon', workoutId: 'lower-a',
          readiness: {
            ktwR: 10, ktwL: 11, anklePain: 1, tendonPain: 2, amStiff: 5,
            swelling: 'no', notes: 'Ready to train', status: 'green',
          },
          exercises: {
            slrdl: [{
              reps: '8', load: '24', loadUnit: 'kg', distance: '10',
              distanceUnit: 'm', done: true,
            }],
          },
          exerciseNotes: { slrdl: 'Controlled tempo' },
          exerciseSetups: { slrdl: 'Two dumbbells' },
          notes: 'Good session',
          startedAt: '2026-10-21T08:00:00.000Z',
          completedAt: '2026-10-21T08:45:00.000Z',
          updatedAt: '2026-10-21T08:45:00.000Z',
        },
      },
    }));

    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(screen.getByRole('button', { name: /Open Lower A from/i }));

    expect(screen.getByRole('heading', { name: 'Lower A' })).toBeInTheDocument();
    expect(screen.getByText('24 kg × 8 · 10 m')).toBeInTheDocument();
    expect(screen.getByText(/Two dumbbells/)).toBeInTheDocument();
    expect(screen.getByText(/Controlled tempo/)).toBeInTheDocument();
    expect(screen.getByText(/Good session/)).toBeInTheDocument();
    expect(screen.getByText(/45 min/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Back to history/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('screen wake lock', () => {
  it('acquires for an active workout, reacquires on visibility, and releases on cleanup', async () => {
    const releases = [vi.fn(async () => {}), vi.fn(async () => {})];
    const request = vi.fn()
      .mockResolvedValueOnce({ released: false, release: releases[0] })
      .mockResolvedValueOnce({ released: false, release: releases[1] });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request },
    });
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const date = todayKey();
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 6, history: {}, sync: emptySync, prefs: {},
      sessions: {
        [date]: {
          id: date, date, day: 'mon', workoutId: 'lower-a', readiness: null,
          exercises: { hens: [{ reps: '6', load: '75', done: true }] },
          notes: '', createdAt: NOW, startedAt: NOW, updatedAt: NOW,
        },
      },
    }));

    const view = render(<App />);
    await openWorkout('mon', 'Lower A');
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledWith('screen');

    visibility = 'hidden';
    fireEvent(document, new Event('visibilitychange'));
    visibility = 'visible';
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(releases[1]).toHaveBeenCalled();
  });

  it('treats a denied wake-lock request as non-fatal', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const date = todayKey();
    localStorage.setItem('dtrack.v1', JSON.stringify({
      version: 6, history: {}, sync: emptySync, prefs: {},
      sessions: {
        [date]: {
          id: date, date, day: 'mon', workoutId: 'lower-a', readiness: null,
          exercises: { hens: [{ reps: '6', load: '75', done: true }] },
          notes: '', startedAt: NOW, updatedAt: NOW,
        },
      },
    }));

    render(<App />);
    await act(async () => { await Promise.resolve(); });
    await openWorkout('mon', 'Lower A');
    expect(screen.getByText('Heels Elevated Narrow Squat')).toBeInTheDocument();
  });
});

describe('Atlas export', () => {
  it('includes stable IDs, units, distance, setup, notes, readiness and timestamps', () => {
    const store: Store = {
      version: 6, sync: emptySync, history: {},
      sessions: {
        '2026-10-29--upper-1': {
          id: '2026-10-29--upper-1', date: '2026-10-29',
          day: 'tue', workoutId: 'upper-1',
          readiness: {
            ktwR: 10, ktwL: 11, anklePain: 1, tendonPain: 2, amStiff: 5,
            swelling: 'no', notes: 'Ready', status: 'green',
          },
          exercises: {
            dips: [{
              reps: '5', load: '20', loadUnit: 'kg', distance: '0.5',
              distanceUnit: 'm', done: true,
            }],
          },
          exerciseNotes: { dips: 'Clean reps' },
          exerciseSetups: { dips: 'Belt with plates' },
          notes: 'Evening workout',
          createdAt: NOW, startedAt: NOW,
          completedAt: '2026-10-29T09:00:00.000Z',
          updatedAt: '2026-10-29T09:00:00.000Z',
        },
      },
    };

    const out = buildAtlasExport(store, '2026-11-12T12:00:00.000Z');
    expect(out.schema).toBe('durability-tracker.atlas.v2');
    expect(out.workouts[0]).toMatchObject({
      id: '2026-10-29--upper-1',
      workoutId: 'upper-1',
      date: '2026-10-29',
      name: 'Upper 1',
      notes: 'Evening workout',
    });
    expect(out.workouts[0].exercises[0]).toMatchObject({
      id: 'dips',
      name: 'Dips',
      note: 'Clean reps',
      setup: 'Belt with plates',
    });
    expect(out.workouts[0].exercises[0].performances[0]).toEqual({
      id: '2026-10-29--upper-1:dips:1',
      index: 1,
      reps: '5',
      load: { value: '20', unit: 'kg' },
      distance: { value: '0.5', unit: 'm' },
      done: true,
    });
  });
});
