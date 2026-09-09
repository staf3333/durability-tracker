# Durability Tracker

A single-page workout tracker for a custom 12-week basketball strength and
return-to-jumping program built on PJF Performance's *The Durability Code Prime*.

**[Open the tracker →](https://staf3333.github.io/durability-tracker/)**

## What it does

- **Session templates** for each day of the week, with sets, targets, rest and
  links to the original PJF exercise pages
- **Morning check-in** that sets a Green / Yellow / Red status and tells you how
  to modify the session before you start
- **Set logging** — reps, load, and a done tick per set
- **Rest timer** with a vibrate cue, started automatically when you tick a set
- **Export** — copy a plain-text log to paste into a coaching assistant, or
  download a JSON backup

## Privacy

All data is stored in `localStorage` **on your device only**. There is no
account, no backend, and no analytics. Nothing is ever uploaded, including the
pain and swelling entries. Clearing your browser data or using "Erase all data"
removes it permanently — take a JSON backup first.

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
npm test         # 23 assertions
npm run build    # production build into dist/
```

Pushing to `main` runs the tests and deploys to GitHub Pages automatically.

## Files

| Path | Purpose |
|---|---|
| `src/data/templates.ts` | Every session, block and exercise |
| `src/types.ts` | Shared types |
| `src/state/store.tsx` | Reducer, persistence, v1 migration |
| `src/lib/plan.ts` | Derived helpers and log export |
| `src/components/` | Views, blocks, set rows, timers |
| `legacy/` | The original vanilla build, kept for reference |

## Updating the plan

Session content lives in `src/data/templates.ts`:

```ts
{ id: 'soleus', name: 'Soleus Raise', slug: 'soleus-raise-paulfabritz',
  sets: 3, target: '8–12 ea', weight: true, note: 'shown under the name',
  priority: true, side: 'R', rest: 60, seconds: 45 }
```

`id` is the storage key — changing it orphans existing logs. `slug` is the PJF
exercise path, `seconds` turns the set into a countdown, `rest` sets the rest
timer, and `weight` adds a load field.

## Credit

Exercise names and links belong to
[PJF Performance](https://online.pjfperformance.net/) and require an active
subscription to view. This tracker only links to them.
