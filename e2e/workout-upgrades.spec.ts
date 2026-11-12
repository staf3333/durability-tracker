import { expect, test, type Page } from '@playwright/test';

const KEY = 'dtrack.v1';

const localDate = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

async function seed(page: Page, store: unknown) {
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem('__durability_e2e_seeded')) return;
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem('__durability_e2e_seeded', '1');
    },
    { key: KEY, value: store },
  );
}

async function seedEmpty(page: Page) {
  await seed(page, {
    version: 6,
    sessions: {},
    history: {},
    sync: { userId: null, lastSyncedAt: null, pending: {}, lastError: null },
    prefs: {},
  });
}

async function chooseDay(page: Page, day: string) {
  await page.getByLabel('Day plan').selectOption(day);
}

async function openWorkout(page: Page, day: string, workout: string) {
  await chooseDay(page, day);
  await page.getByRole('button', { name: `Open ${workout}` }).click();
}

async function expandSets(page: Page) {
  const button = page.getByRole('button', { name: 'Expand all sets' });
  if (await button.isVisible()) await button.click();
}

const field = (page: Page, name: string) =>
  page.getByRole('textbox', { name, exact: true });

test('migrates a v4 workout in the built app without changing its key or entries', async ({ page }) => {
  const date = localDate();
  await seed(page, {
    version: 4,
    sessions: {
      [date]: {
        day: 'mon',
        readiness: null,
        exercises: {
          hens: [{ reps: '6', load: '135', done: true }],
          slrdl: [{ reps: '8', load: '24', done: true }],
        },
        notes: 'Existing log remains intact',
        exerciseNotes: { slrdl: 'Kg not lbs' },
        startedAt: `${date}T08:00:00.000Z`,
        completedAt: `${date}T09:00:00.000Z`,
        updatedAt: `${date}T09:00:00.000Z`,
      },
    },
    history: {},
    sync: { userId: null, lastSyncedAt: null, pending: {}, lastError: null },
    prefs: {},
  });

  await page.goto('/');
  await openWorkout(page, 'mon', 'Lower A');
  await expect(page.getByText('Workout locked in.')).toBeVisible();
  await page.getByRole('button', { name: 'Edit anyway' }).click();
  await expandSets(page);

  await expect(field(page, 'Heels Elevated Narrow Squat set 1 reps')).toHaveValue('6');
  await expect(field(page, 'Heels Elevated Narrow Squat set 1 load')).toHaveValue('135');
  await expect(page.getByLabel('Heels Elevated Narrow Squat set 1 load unit')).toHaveValue('lb');

  await expect.poll(() => page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key)!);
    return {
      version: stored.version,
      keys: Object.keys(stored.sessions),
      workoutId: stored.sessions[Object.keys(stored.sessions)[0]].workoutId,
      set: stored.sessions[Object.keys(stored.sessions)[0]].exercises.slrdl[0],
      note: stored.sessions[Object.keys(stored.sessions)[0]].exerciseNotes.slrdl,
    };
  }, KEY)).toEqual({
    version: 6,
    keys: [date],
    workoutId: 'lower-a',
    set: { reps: '8', load: '24', done: true },
    note: 'Kg not lbs',
  });
});

test('Tuesday shows three planned workouts with independent state and completion', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await seedEmpty(page);
  await page.goto('/');
  await chooseDay(page, 'tue');

  await expect(page.getByRole('button', { name: 'Open Shooting / WOTW' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Daily microdose' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Upper 1' })).toBeVisible();

  await page.getByRole('button', { name: 'Open Shooting / WOTW' }).click();
  await page.getByRole('button', { name: 'Open Current WOTW — game pace' }).click();
  await field(page, 'Current WOTW — game pace set 1 reps').fill('108');
  await page.getByLabel('Mark Current WOTW — game pace set 1 done').click();
  await page.getByLabel('Back to the workout list').click();
  await page.getByRole('button', { name: /Complete workout/ }).click();
  await page.getByRole('button', { name: /Back to day/ }).click();
  await expect(page.getByRole('button', { name: 'Open Shooting / WOTW' }))
    .toContainText('Completed');
  await expect(page.getByRole('button', { name: 'Open Daily microdose' }))
    .toContainText('Not started');

  await page.getByRole('button', { name: 'Open Upper 1' }).click();
  await page.getByRole('button', { name: 'Open Bench Press' }).click();
  await field(page, 'Bench Press set 1 reps').fill('5');
  await field(page, 'Bench Press set 1 load').fill('185');
  await page.getByLabel('Back to the workout list').click();
  await page.getByRole('button', { name: /Back to day/ }).click();

  await expect(page.getByRole('button', { name: 'Open Shooting / WOTW' }))
    .toContainText('Completed');
  await expect(page.getByRole('button', { name: 'Open Upper 1' }))
    .toContainText('In progress');

  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  const workouts = Object.values(stored.sessions) as Array<{
    workoutId: string;
    completedAt?: string;
    exercises: Record<string, Array<{ load: string }>>;
  }>;
  expect(workouts.find((workout) => workout.workoutId === 'shooting-wotw')?.completedAt)
    .toBeTruthy();
  expect(workouts.find((workout) => workout.workoutId === 'upper-1')
    ?.exercises.bench[0].load).toBe('185');
});

test('persists kg, lb, distance, setup, notes, and Atlas workouts through reload', async ({ page }) => {
  await seedEmpty(page);
  await page.goto('/');
  await openWorkout(page, 'mon', 'Lower A');
  await page.getByRole('button', { name: 'Open Razor Curl Progressions' }).click();
  await expect(page.locator('.dset')).toHaveCount(2);

  await page.getByRole('button', { name: 'Exercise settings' }).click();
  await page.getByRole('checkbox', { name: 'Track load' }).check();
  await page.getByRole('checkbox', { name: 'Track distance' }).check();
  await expect(page.locator('.dset')).toHaveCount(2);
  await page.getByLabel('Default load unit').selectOption('kg');
  await page.getByLabel('Distance unit').selectOption('km');

  await field(page, 'Razor Curl Progressions set 1 reps').fill('10');
  await field(page, 'Razor Curl Progressions set 1 load').fill('24');
  await field(page, 'Razor Curl Progressions set 1 distance').fill('0.1');
  await page.getByLabel('Setup for Razor Curl Progressions').fill('Nordic bench, short ROM');
  await page.getByLabel('Notes for Razor Curl Progressions').fill('Exercise-specific note');
  await page.getByLabel('Mark Razor Curl Progressions set 1 done').click();

  await page.getByLabel('Back to the workout list').click();
  await page.getByRole('button', { name: 'Open Soleus Raise' }).click();
  await field(page, 'Soleus Raise set 1 reps').fill('10');
  await field(page, 'Soleus Raise set 1 load').fill('70');
  await page.getByLabel('Mark Soleus Raise set 1 done').click();
  await expect(page.locator('.stats')).toContainText('700 lb · 240 kg');

  await page.reload();
  await openWorkout(page, 'mon', 'Lower A');
  await page.getByRole('button', { name: 'Open Razor Curl Progressions' }).click();
  await expect(page.locator('.dset')).toHaveCount(2);
  await expect(field(page, 'Razor Curl Progressions set 1 load')).toHaveValue('24');
  await expect(page.getByLabel('Razor Curl Progressions set 1 load unit')).toHaveValue('kg');
  await expect(field(page, 'Razor Curl Progressions set 1 distance')).toHaveValue('0.1');
  await expect(page.getByLabel('Setup for Razor Curl Progressions'))
    .toHaveValue('Nordic bench, short ROM');

  await page.getByRole('button', { name: 'Export' }).click();
  const atlas = JSON.parse(await page.locator('pre.out').nth(1).textContent() ?? '{}');
  expect(atlas.schema).toBe('durability-tracker.atlas.v2');
  const exercise = atlas.workouts[0].exercises.find(
    (candidate: { id: string }) => candidate.id === 'razor',
  );
  expect(exercise).toMatchObject({
    id: 'razor',
    name: 'Razor Curl Progressions',
    note: 'Exercise-specific note',
    setup: 'Nordic bench, short ROM',
  });
  expect(exercise.performances[0]).toMatchObject({
    load: { value: '24', unit: 'kg' },
    distance: { value: '0.1', unit: 'km' },
    done: true,
  });
});

test('starts grouped rest after the final member and keeps straight-set rest immediate', async ({ page }) => {
  await seedEmpty(page);
  await page.goto('/');
  await openWorkout(page, 'mon', 'Lower A');
  await expandSets(page);

  const firstRound = page.locator('.grp.superset').first().locator('.round').first();
  await firstRound.getByLabel('Mark Razor Curl Progressions set 1 done').click();
  await expect(page.locator('.restbar')).toHaveCount(0);
  await firstRound.getByLabel('Mark Soleus Raise set 1 done').click();
  await expect(page.locator('.restbar')).toContainText('Superset · round 1');
  await page.getByLabel('Stop rest timer').click();

  await page.getByLabel('Mark Heels Elevated Narrow Squat set 1 done').click();
  await expect(page.locator('.restbar'))
    .toContainText('Heels Elevated Narrow Squat · set 1');
});

test('shows multiple previous Bench Press workouts inside active Upper 1', async ({ page }) => {
  await seed(page, {
    version: 6,
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
        exercises: { bench: [{ reps: '5', load: '190', loadUnit: 'lb', done: true }] },
        exerciseNotes: { bench: 'Fast bar speed' },
        notes: '', updatedAt: '2026-10-28T18:00:00.000Z',
      },
    },
    history: {
      bench: {
        date: '2026-09-01', source: 'Imported programme',
        sets: [{ reps: '5', load: '80', loadUnit: 'kg', done: true }],
        note: 'Imported baseline',
      },
    },
    sync: { userId: null, lastSyncedAt: null, pending: {}, lastError: null },
    prefs: {},
  });

  await page.goto('/');
  await openWorkout(page, 'tue', 'Upper 1');
  await page.getByRole('button', { name: 'Open Bench Press' }).click();
  await expect(page.locator('.dlast')).toContainText('190 lb × 5');
  await page.getByRole('button', { name: /Previous workouts/ }).click();

  const history = page.getByRole('dialog', { name: 'Previous Bench Press workouts' });
  await expect(history.locator('.hrow')).toHaveCount(3);
  await expect(history).toContainText('190 lb × 5');
  await expect(history).toContainText('185 lb × 5');
  await expect(history).toContainText('195 lb × 4 (not done)');
  await expect(history).toContainText('Competition bench');
  await expect(history).toContainText('Paused first rep');
  await expect(history).toContainText('Imported programme');
});

test('handles wake-lock reacquisition and mobile day navigation without crashes', async ({ page }) => {
  const date = localDate();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ key, dateKey }) => {
    const state = window as typeof window & {
      __wakeRequests?: number;
      __wakeReleases?: number;
      __visibility?: DocumentVisibilityState;
    };
    state.__wakeRequests = 0;
    state.__wakeReleases = 0;
    state.__visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state.__visibility,
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          state.__wakeRequests = (state.__wakeRequests ?? 0) + 1;
          return {
            released: false,
            release: async () => {
              state.__wakeReleases = (state.__wakeReleases ?? 0) + 1;
            },
          };
        },
      },
    });
    localStorage.setItem(key, JSON.stringify({
      version: 6,
      sessions: {
        [dateKey]: {
          id: dateKey, date: dateKey, day: 'mon', workoutId: 'lower-a',
          readiness: null,
          exercises: { hens: [{ reps: '6', load: '75', done: true }] },
          notes: '', startedAt: `${dateKey}T08:00:00.000Z`,
          updatedAt: `${dateKey}T08:05:00.000Z`,
        },
      },
      history: {},
      sync: { userId: null, lastSyncedAt: null, pending: {}, lastError: null },
      prefs: {},
    }));
  }, { key: KEY, dateKey: date });

  await page.goto('/');
  await openWorkout(page, 'mon', 'Lower A');
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __wakeRequests?: number }).__wakeRequests,
  )).toBe(1);

  await page.evaluate(() => {
    const state = window as typeof window & { __visibility?: DocumentVisibilityState };
    state.__visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    state.__visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __wakeRequests?: number }).__wakeRequests,
  )).toBe(2);

  await page.getByRole('button', { name: /Back to day/ }).click();
  await chooseDay(page, 'tue');
  await expect(page.getByRole('button', { name: 'Open Shooting / WOTW' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Daily microdose' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Upper 1' })).toBeVisible();
});

test('caps a forgotten workout timer instead of counting hours of inactivity', async ({ page }) => {
  const date = localDate();
  const lastActive = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const started = new Date(lastActive.getTime() - 60 * 60 * 1000);
  page.on('dialog', (dialog) => dialog.accept());
  await seed(page, {
    version: 6,
    sessions: {
      [date]: {
        id: date, date, day: 'mon', workoutId: 'lower-a', readiness: null,
        exercises: { hens: [{ reps: '6', load: '95', loadUnit: 'lb', done: true }] },
        notes: '',
        startedAt: started.toISOString(),
        activeSeconds: 60 * 60,
        lastActiveAt: lastActive.toISOString(),
        updatedAt: lastActive.toISOString(),
      },
    },
    history: {},
    sync: { userId: null, lastSyncedAt: null, pending: {}, lastError: null },
    prefs: {},
  });

  await page.goto('/');
  await openWorkout(page, 'mon', 'Lower A');
  await expect(page.locator('.stats')).toContainText('1h 30m');
  await page.getByRole('button', { name: /Complete workout/ }).click();

  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), KEY);
  expect(stored.sessions[date].activeSeconds).toBe(90 * 60);
  expect(stored.sessions[date].completedAt)
    .toBe(new Date(lastActive.getTime() + 30 * 60 * 1000).toISOString());
});

test('opens an older workout from History with complete read-only details', async ({ page }) => {
  await seed(page, {
    version: 6,
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
        notes: 'Good workout',
        startedAt: '2026-10-21T08:00:00.000Z',
        completedAt: '2026-10-21T08:45:00.000Z',
        updatedAt: '2026-10-21T08:45:00.000Z',
      },
    },
    history: {},
    sync: { userId: null, lastSyncedAt: null, pending: {}, lastError: null },
    prefs: {},
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByRole('button', { name: /Open Lower A from/i }).click();
  await expect(page.getByRole('heading', { name: 'Lower A' })).toBeVisible();
  await expect(page.getByText('24 kg × 8 · 10 m')).toBeVisible();
  await expect(page.getByText(/Setup: Two dumbbells/)).toBeVisible();
  await expect(page.getByText(/Exercise note: Controlled tempo/)).toBeVisible();
  await expect(page.getByText(/Workout notes/).locator('..')).toContainText('Good workout');
  await page.getByRole('button', { name: /Back to history/i }).click();
  await expect(page.getByRole('table')).toBeVisible();
});
