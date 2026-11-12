# Durability Tracker

A single-page workout tracker for a custom 12-week basketball strength and
return-to-jumping program built on PJF Performance's *The Durability Code Prime*.

**[Open the tracker →](https://stafinthelab.com/)**

## What it does

- **Planned workouts** nested under each day, with sets, targets, rest and
  links to the original PJF exercise pages
- **Morning check-in** that sets a Green / Yellow / Red status and tells you how
  to modify the session before you start
- **Independent same-day workouts** — for example Tuesday shows Shooting /
  WOTW, Daily microdose, and Upper 1 as separate cards with separate timers,
  progress, notes, and completion locks
- **Set logging** — reps, distance, lb/kg load, setup/variant, and a done tick
- **Rest timer** with a vibrate cue; supersets and circuits start rest only
  after the final member of a round
- **Exercise history** — Last time plus an obvious Previous workouts section
  with all prior sets, units, setup variants, and exercise-specific notes
- **Screen wake lock** while a workout is active, where supported
- **Idle-safe workout timing** — long inactive gaps are capped, so forgetting
  to press Complete does not create an all-day duration
- **Export** — copy a plain-text log to paste into a coaching assistant, or
  download a JSON backup or structured Atlas-friendly JSON

## Privacy

Data is stored in `localStorage` first, so logging works offline without an
account. Optional GitHub sign-in syncs it to the environment's Azure Table
Storage. Production and staging use separate accounts; staging starts with
synthetic data and never reads production. There is no analytics. Clearing
browser data removes the local copy, so take a JSON backup regularly.

This repository contains the tracker interface only. No medical history, clinical
findings or personal training data is committed here.

## Install on a phone

1. Open the link above in Safari (iOS) or Chrome (Android)
2. Share → **Add to Home Screen**

It runs offline after the first load, so a gym with no signal is fine.

## Stack

React + TypeScript + Vite, with `vite-plugin-pwa` for the offline service
worker. See [ARCHITECTURE.md](ARCHITECTURE.md) for why it is built this way.

```bash
npm install
npm run dev      # local dev server
npm test         # unit and component tests
npm run test:e2e # production build + Playwright browser tests
npm run test:e2e:staging # staging build + local PWA smoke
npm run build    # production build into dist/
```

Pushing to `main` runs the full validation suite and deploys production to
Azure Static Web Apps.

Production and staging are isolated Azure Static Web Apps with separate storage
accounts and deployment tokens. See [docs/STAGING.md](docs/STAGING.md) for the
environment inventory, promotion flow, DNS setup, smoke tests, and rollback.

## Files

| Path | Purpose |
|---|---|
| `src/data/templates.ts` | Every block and exercise |
| `src/data/workouts.ts` | Stable planned workouts within each day |
| `src/types.ts` | Shared types |
| `src/state/store.tsx` | Reducer, persistence, v1 migration |
| `src/lib/plan.ts` | Derived helpers and log export |
| `src/components/` | Views, blocks, set rows, timers |
| `legacy/` | The original vanilla build, kept for reference |

## Updating the plan

Exercise and block content lives in `src/data/templates.ts`; named day/workout
grouping lives in `src/data/workouts.ts`:

```ts
{ id: 'soleus', name: 'Soleus Raise', slug: 'soleus-raise-paulfabritz',
  sets: 3, target: '8–12 ea', weight: true, note: 'shown under the name',
  priority: true, side: 'R', rest: 60, seconds: 45 }
```

`id` is the storage key — changing it orphans existing logs. `slug` is the PJF
exercise path, `seconds` turns the set into a countdown, `rest` sets the rest
timer, and `weight` adds a load field. Load and distance tracking can also be
enabled per exercise from its settings without changing that stable ID.

## Atlas export

The Export view can copy or download `durability-tracker.atlas.v2` JSON. It is
generated locally and contains stable workout, exercise and performance IDs,
calendar dates, template names, explicit load/distance units, setup variants,
exercise and workout notes, readiness, completion state, and timestamps. The
export performs no network request and requires no Atlas credentials.

## Credit

Exercise names and links belong to
[PJF Performance](https://online.pjfperformance.net/) and require an active
subscription to view. This tracker only links to them.
