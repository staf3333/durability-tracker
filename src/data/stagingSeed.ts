import type { Store } from '../types';
import { todayKey } from '../lib/plan';

/** Synthetic-only data for a new staging origin. Never derived from production. */
export function stagingSeed(now = new Date()): Store {
  const date = todayKey(now);
  const createdAt = `${date}T08:00:00.000Z`;
  return {
    version: 6,
    sessions: {
      [date]: {
        id: date,
        date,
        day: 'mon',
        workoutId: 'lower-a',
        readiness: {
          ktwR: 10,
          ktwL: 10.5,
          anklePain: 1,
          tendonPain: 1,
          amStiff: 3,
          swelling: 'no',
          notes: 'Synthetic staging check-in',
          status: 'green',
        },
        exercises: {
          hens: [
            { reps: '6', load: '95', loadUnit: 'lb', done: true },
            { reps: '6', load: '95', loadUnit: 'lb', done: false },
            { reps: '', load: '', loadUnit: 'lb', done: false },
            { reps: '', load: '', loadUnit: 'lb', done: false },
          ],
          slrdl: [
            { reps: '8', load: '24', loadUnit: 'kg', done: true },
            { reps: '', load: '', loadUnit: 'kg', done: false },
            { reps: '', load: '', loadUnit: 'kg', done: false },
          ],
        },
        exerciseNotes: { slrdl: 'Synthetic kg example' },
        exerciseSetups: { slrdl: 'Synthetic dumbbell setup' },
        notes: 'Synthetic data only. Safe to edit or erase.',
        createdAt,
        startedAt: createdAt,
        updatedAt: createdAt,
      },
    },
    history: {},
    sync: { userId: null, lastSyncedAt: null, pending: {}, lastError: null },
    prefs: {},
  };
}
