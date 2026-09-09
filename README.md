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

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup, styles, view shell |
| `app.js` | Session templates, state, logging, export |
| `sw.js` | Service worker — network-first with cache fallback |
| `manifest.webmanifest` | Home-screen install metadata |

## Updating the plan

Session templates live in the `T` object at the top of `app.js`. Each exercise
takes:

```js
{ id:'soleus', n:'Soleus Raise', l:'soleus-raise-paulfabritz',
  s:3, t:'8–12 ea', w:1, d:'note shown under the name',
  flag:'pri', side:'R', opt:1, rest:60 }
```

`id` is the storage key — changing it orphans existing logs. `l` is the PJF
exercise slug, `s` the default number of set rows, `t` the target text, `w`
enables a weight field, `rest` is the timer in seconds.

After changing any file, bump `CACHE` in `sw.js` so installed clients pick it up.

## Credit

Exercise names and links belong to
[PJF Performance](https://online.pjfperformance.net/) and require an active
subscription to view. This tracker only links to them.
