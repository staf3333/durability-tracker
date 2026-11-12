# Architecture

Notes on why the React rewrite is shaped the way it is. Written to be read
alongside the code, not instead of it.

## Why this stopped being vanilla JS

The first version was ~750 lines of hand-rolled DOM. It worked, but three bugs
appeared within an hour of adding supersets and per-set timers, all the same
kind:

- `setTimerBtn()` built a CSS selector that matched set rows inside exercise
  cards but not rows inside superset rounds, so a running timer silently stopped
  repainting.
- Tests held DOM references that went stale, because re-rendering meant
  reassigning `innerHTML` and destroying the old nodes.
- Row markup was duplicated across `renderWorkout`, `renderBlock` and
  `renderSets`, which had to be kept in sync by hand. That duplication is what
  produced the first bug.

All three are consequences of *manually querying and patching the DOM*. React
removes the category rather than fixing instances of it.

## State

One `useReducer` in `src/state/store.tsx` owns every mutation. Components never
write to storage directly; they dispatch.

```
Store
└── sessions: Record<workoutRecordId, Session>
    └── Session { id, date, day, workoutId, readiness, exercises, notes, timestamps }
```

Three things follow from that shape:

**The reducer is pure.** No `localStorage` writes inside it, so it can be tested
without a DOM and is safe under React's double-invocation in development.
Persistence is a separate `useEffect` that fires whenever the store changes.

**Sets are keyed by exercise id, not by position in the UI.** A superset round is
just index `n` of each participating exercise. That is why supersets could be
added without changing the storage format, and why previously logged sets
survived the change.

**Rounds are derived, not stored.** `roundsIn()` returns the longest exercise in
a group. Pairing a 2-set exercise with a 3-set one therefore renders three
rounds, the third containing only the longer exercise — which is what the plan
actually prescribes.

## Migration

`hydrate()` reads every prior format. Schema v6 derives stable planned workouts
from `src/data/workouts.ts`. A legacy date-keyed record keeps its original key
for the first matching workout. If it contains exercises from multiple planned
workouts, migration splits it deterministically by exercise membership and uses
`YYYY-MM-DD--<workoutId>` for the additional records. Date-level readiness,
timestamps, and whole-day notes are copied to each split record so no
information is silently discarded; duplicated whole-day notes are the
documented ambiguity. Missing load units are interpreted as pounds.

## Timers

`useCountdown` in `src/components/Timers.tsx` drives per-set work timers, while
`RestProvider` owns the persistent rest timer. The interval lives entirely inside one
`useEffect`, so React tears it down on unmount or when the timer changes. The
vanilla version needed `clearInterval` in five places and still leaked one.

Elapsed time is derived from a wall-clock end timestamp in a ref rather than by
counting ticks, so the countdown stays accurate if the phone throttles timers in
a backgrounded tab.

Workout duration uses accumulated active seconds plus a 30-minute maximum gap
from the latest work interaction. Forgetting to press Complete therefore cannot
turn an hour workout into an all-day timer. Completing after a long idle period
uses the capped last-activity time. Legacy incomplete workouts stop at their
last saved edit. When one legacy whole-day record is split into multiple
planned workouts, its shared start time is omitted because it cannot be assigned
honestly to any one workout; completion and all logged work remain preserved.

Grouped blocks only auto-start rest after the final exercise in a round is
completed. Straight sets retain per-set automatic rest. `useWakeLock` requests a
screen wake lock for the active workout, reacquires it after visibility changes,
and treats unsupported or denied requests as non-fatal.

## Components

Split along the axis that actually varies:

| Component | Responsibility |
|---|---|
| `App` | Tab shell, current date and selected day plan |
| `TodayView` | Day workout dashboard plus the active workout logger |
| `BlockView` | Branches on `mode` — straight sets vs. rounds |
| `SetRow` | One loggable row; identical inside cards and rounds |
| `Views` | Check-in, history, export, rules |

`SetRow` is shared deliberately. In the vanilla build the same row was built by
two different code paths, which is precisely how the two layouts drifted apart.

## Content

`src/data/templates.ts` was generated from the vanilla `T` object rather than
retyped, because transcribing 61 exercises by hand loses data quietly. A test
asserts the counts (8 sessions, 61 exercises) so an accidental deletion fails CI.

Editing a session means editing that file. `id` is the storage key — changing it
orphans logged sets.

## Privacy

Local-first storage keeps logging available offline. Optional GitHub
authentication syncs to Azure Table Storage. Production and staging have
separate Static Web Apps, connection strings, storage accounts, and tables; no
workflow copies entities between them. There is no analytics. A test asserts
that no clinical vocabulary appears in shipped content, since this repository
is public while the training plan it serves is not.

## Environments

Production and staging are separate Azure Static Web Apps with separate Table
Storage accounts and deployment tokens. Staging uses synthetic seed data, a
visible red environment banner, same-origin API calls, an origin-scoped service
worker, and a CSP that restricts network connections to the current origin.
`src/lib/environment.ts` prevents a staging bundle from running on an unknown
hostname. Deployment and promotion details are in
[docs/STAGING.md](docs/STAGING.md).

## Testing

`npm test` runs 23 assertions covering content fidelity, reducer purity, v1
migration, superset round rendering, timer behaviour under fake clocks, the
session-relabelling guard, and export formatting. CI runs them before every
deploy.

One thing worth knowing: fake timers must be reset in `afterEach`. When a test
using `vi.useFakeTimers()` fails before its cleanup line, every subsequent test
inherits the fake clock and times out — which looks like five broken tests
instead of one.
