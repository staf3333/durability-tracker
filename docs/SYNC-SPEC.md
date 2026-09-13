# Sync & Storage Spec

**Status:** Draft · 12 Sep 2026
**Branch:** `sync-spec`
**Owner:** @staf3333

Moving the tracker from device-only `localStorage` to durable, multi-device
storage on Azure, without giving up offline use.

---

## 1. Goals

1. **Durability.** Data survives clearing website data, deleting the app, OS
   storage pressure, and losing the phone.
2. **Multi-device.** Log on the phone at the gym, review on the Mac.
3. **Offline-first, unchanged.** The app must work with no signal, and the UI
   must never wait on the network.
4. **The coach can read the log** without a manual copy/paste step.
5. **Effectively free**, and cheap to reason about.

## 2. Non-goals

- Multi-user or sharing. Single account.
- Real-time collaboration. Seconds-to-minutes convergence is fine.
- Server-side analytics. The dataset is ~72 KB; charts are computed client-side.
- A native app.
- Server-side rendering. It stays a static PWA.

## 3. Constraints

| Constraint | Consequence |
|---|---|
| No signal mid-set | Writes land locally first; sync is background-only |
| Bursty writes (a tap per set) | Pushes are debounced, never per-keystroke |
| Two devices, one human | Conflicts are rare but must not lose data silently |
| Health-adjacent data | Own tenant, encrypted at rest, no third-party analytics |
| Public repo | No secrets in client code, ever |

**The governing decision:** this is *local-first with sync*, not client-server.
`localStorage` remains the local source of truth. Azure is a replica the client
reconciles with. Every design choice below follows from that.

---

## 4. Architecture

```
┌──────────────────────── Azure Static Web Apps (Free) ────────────────────────┐
│                                                                              │
│   Static assets            /.auth/*                    /api/*                │
│   (Vite build output)      built-in auth               managed Functions      │
│         │                       │                           │                │
└─────────┼───────────────────────┼───────────────────────────┼────────────────┘
          │                       │                           │
          ▼                       ▼                           ▼
    ┌───────────┐          ┌────────────┐            ┌──────────────────┐
    │  PWA      │─ login ─▶│  GitHub    │            │  Table Storage   │
    │  React    │          │  provider  │            │  PK=userId       │
    │           │                                    │  RK=sessionDate  │
    │ localStore│◀────────── /api/sync ─────────────▶│                  │
    │ (truth)   │                                    └──────────────────┘
    └───────────┘
```

Everything is same-origin. No CORS, no token handling in client code.

### Why Static Web Apps

SWA's built-in authentication is the reason this is a small project rather than
a large one. `/.auth/login/github` and the injected `x-ms-client-principal`
header give a stable user ID with **no auth code**: no MSAL, no token refresh,
no B2C tenant, no CORS preflight.

### Why Table Storage over Cosmos

| | Table Storage | Cosmos (Table API) |
|---|---|---|
| Cost at our volume | ~$0.02/mo | $0 on free tier |
| Concepts to learn | PK/RK | RUs, partitioning, consistency |
| Change feed | No | Yes |
| Needed here? | — | Not at 72 KB |

Take Table Storage. The access pattern is identical, so migrating to Cosmos
later is a connection-string change plus a data copy.

---

## 5. Authentication

SWA handles the whole flow.

```
GET /.auth/login/github     → provider login, redirect back
GET /.auth/me               → { clientPrincipal: { userId, userDetails, identityProvider } }
GET /.auth/logout           → sign out
```

Functions receive `x-ms-client-principal`: a base64 JSON blob injected by the
platform. It **cannot be set by an external caller** — SWA strips inbound copies.

### Rules

1. **Pin to a single provider: GitHub.** `userId` is provider-scoped. Logging in
   with Microsoft would produce a different ID and therefore an empty, separate
   dataset. Only GitHub is enabled in `staticwebapp.config.json`.
2. **Every query is scoped to the principal's `userId`.** The server never reads
   a user identifier from the request body or query string. This is the single
   most important authorization rule in the system.
3. **Signed out is a valid state.** The app works fully offline-only; sync is
   disabled and the UI says so. Being logged out must never block training.

### `staticwebapp.config.json`

```json
{
  "routes": [
    { "route": "/api/*", "allowedRoles": ["authenticated"] },
    { "route": "/*", "allowedRoles": ["anonymous"] }
  ],
  "auth": {
    "identityProviders": {
      "github": { "registration": { "clientIdSettingName": "GITHUB_CLIENT_ID",
                                    "clientSecretSettingName": "GITHUB_CLIENT_SECRET" } }
    }
  },
  "navigationFallback": { "rewrite": "/index.html", "exclude": ["/assets/*", "/api/*"] }
}
```

---

## 6. Data model

### 6.1 Client — schema v4

Adds sync metadata. Migration follows the v2→v3 pattern already in `hydrate()`.

```ts
interface Session {
  day: string;
  readiness: Readiness | null;
  exercises: Record<string, SetEntry[]>;
  notes: string;
  updatedAt: string;          // NEW — ISO, set locally on every mutation
  deletedAt?: string;         // NEW — soft-delete tombstone
}

interface Store {
  version: 4;                 // was 3
  sessions: Record<string, Session>;
  history: Record<string, HistoryEntry>;
  sync: {                     // NEW
    userId: string | null;
    lastSyncedAt: string | null;   // SERVER time from the last successful sync
    pending: Record<string, true>; // session dates awaiting push
    lastError: string | null;
  };
}
```

**Why an explicit `pending` set** rather than deriving dirtiness from
`updatedAt > lastSyncedAt`: offline writes are stamped with the *device* clock
while `lastSyncedAt` is *server* time. A device running slow would mark its own
writes as already-synced and silently drop them. An explicit set is immune to
skew. It is persisted, so it survives a reload mid-sync.

### 6.2 Server — Table Storage

One entity per session.

| Field | Type | Notes |
|---|---|---|
| `PartitionKey` | string | `userId` from the principal |
| `RowKey` | string | Session date, `YYYY-MM-DD` |
| `Payload` | string | JSON-serialised `Session` |
| `UpdatedAt` | string | Client-supplied ISO — used for conflict comparison |
| `ServerUpdatedAt` | string | **Server-stamped** ISO — used for the sync cursor |
| `Deleted` | bool | Tombstone |

History is one entity per user in a separate table: `PartitionKey=userId`,
`RowKey="history"`.

**Two timestamps, deliberately.** `UpdatedAt` decides *who wins* a conflict and
must come from the writer. `ServerUpdatedAt` drives the `since` cursor and must
come from the server, or a skewed client's cursor would skip records forever.

Queries are partition scans (`PartitionKey eq userId and ServerUpdatedAt gt
@since`). That is unindexed, but with a few hundred rows per user it is trivial.
Revisit past ~10k rows per user.

---

## 7. API contract

Base `/api`. All routes require `authenticated`. All responses JSON.

### `GET /api/me`

```json
{ "userId": "github|12345678", "provider": "github", "serverTime": "2026-09-12T22:40:11Z" }
```

`401` when signed out.

### `GET /api/sync?since=<iso>`

Returns everything changed server-side after `since`. Omit `since` for a full
pull (first sync on a new device).

```json
{
  "serverTime": "2026-09-12T22:40:11Z",
  "sessions": {
    "2026-09-14": {
      "day": "mon", "readiness": null, "exercises": { "hens": [...] },
      "notes": "", "updatedAt": "2026-09-14T08:12:00Z"
    }
  },
  "history": { "hens": { "date": "2026-04-17", "source": "PJF", "sets": [...] } },
  "deleted": ["2026-09-02"]
}
```

### `POST /api/sync`

```json
{
  "sessions": { "2026-09-14": { ...Session } },
  "history": { "hens": { ... } },
  "lastSyncedAt": "2026-09-12T22:30:00Z"
}
```

Response:

```json
{
  "serverTime": "2026-09-12T22:40:11Z",
  "accepted": ["2026-09-14"],
  "conflicts": { "2026-09-13": { ...serverVersionOfSession } }
}
```

**Upsert rule.** For each incoming session, write only if
`incoming.updatedAt > stored.UpdatedAt`. Otherwise skip and return the stored
row under `conflicts`.

**History merge.** Per exercise id, keep whichever entry has the later `date`.
History is effectively append-only.

### Status codes

| Code | Meaning | Client action |
|---|---|---|
| 200 | OK | Apply response |
| 401 | Not authenticated | Pause sync, show sign-in |
| 409 | — *(not used; conflicts return 200 with a body)* | — |
| 413 | Payload too large | Split the batch, retry |
| 429 | Throttled | Exponential backoff |
| 5xx | Server error | Backoff, keep `pending` |

---

## 8. Sync protocol

### Triggers

- App gains focus (`visibilitychange`)
- 5s debounce after the last mutation
- `online` event fires
- Manual "Sync now" button

Never on a timer while backgrounded, and never blocking a UI interaction.

### Algorithm

```
sync():
  if offline or signed out: return
  if a sync is already running: mark rerun and return   # single-flight

  push = { sessions: store.sessions filtered by pending,
           history: store.history,
           lastSyncedAt: store.sync.lastSyncedAt }

  res = POST /api/sync push
  clear pending for res.accepted
  for each date in res.conflicts:
      resolve(local, remote)                            # section 9

  pull = GET /api/sync?since=store.sync.lastSyncedAt
  merge pull.sessions   (remote wins only if newer)
  merge pull.history
  apply pull.deleted as local tombstones

  store.sync.lastSyncedAt = pull.serverTime             # SERVER time, always
```

Push before pull, so a conflict is detected against what the server already
holds rather than against a copy we just overwrote.

### Single-flight

Concurrent syncs corrupt the cursor. Only one runs at a time; further triggers
set a rerun flag consumed on completion.

---

## 9. Conflict resolution

**Granularity is the session-day.** Two devices editing different days never
conflict — which covers essentially all real use.

**Same day, both edited:** last-write-wins on `updatedAt`.

This can lose work: if the phone logs sets offline while the Mac edits the same
day online, the loser's edits vanish on merge. Mitigations, in order:

1. **Rarity.** One person rarely edits one training day from two devices.
2. **Never silent.** The loser's version is written to
   `store.sync.lastConflict` and surfaced as a dismissible banner with a "restore
   my version" action.
3. **Not merged set-by-set.** Deliberate. Field-level merge means CRDTs, and the
   complexity is not justified — revisit only if this actually bites.

**Deletes** are tombstones (`deletedAt`), not row removal, so a delete on one
device propagates instead of being resurrected by the other. "Erase all data on
this device" stays **local-only** and does not sync — wiping the phone must not
wipe the account.

---

## 10. Offline behaviour

- All mutations write to `localStorage` synchronously, as today.
- `pending` accumulates dates. Nothing is lost while offline.
- Retries use exponential backoff: 1s, 2s, 4s … capped at 5 min.
- After 5 consecutive failures the UI shows "not syncing" with the reason.
- Service worker caches the app shell (already in place via `vite-plugin-pwa`);
  `/api/*` is **never** cached.

---

## 11. Security & privacy

| Concern | Handling |
|---|---|
| Data at rest | Azure Storage SSE, on by default |
| In transit | HTTPS only; SWA enforces |
| Storage credentials | Connection string in SWA application settings; never shipped to the client |
| Authorization | Server scopes every query to the principal `userId`; request-supplied IDs ignored |
| Repo safety | No secrets committed; existing `.gitignore` covers `durability-data/` |
| Analytics | None. No third-party scripts. |
| Account compromise | GitHub account is the single point of access — 2FA required |
| Data export | `GET /api/sync` with no `since` returns everything; the JSON backup button stays |

Personal training data continues to live outside the repo.

---

## 12. Failure modes

| Failure | Detection | Response |
|---|---|---|
| No network | `navigator.onLine`, fetch rejection | Queue in `pending`, retry on `online` |
| Session expired | 401 | Pause sync, prompt re-auth, keep logging |
| Clock skew on device | — | Cursor uses server time, so unaffected |
| Two devices, same day | `conflicts` in the push response | LWW + banner + restore action |
| Storage throttled | 429 | Backoff |
| Partial push | `accepted` shorter than sent | Keep unaccepted dates pending |
| Corrupt local store | `hydrate()` throws | Fall back to `emptyStore`, keep a raw copy under `dtrack.corrupt` |
| Function cold start | Slow first request | Irrelevant — sync is background |
| Wrong provider login | `userId` mismatch vs `store.sync.userId` | Warn and refuse to merge; offer to switch account |

That last one matters: signing in as a different identity must not silently
merge two people's logs.

---

## 13. Cost

| Item | Assumption | Monthly |
|---|---|---|
| Static Web Apps | Free tier | $0.00 |
| Functions | ~5k executions | $0.00 (1M free) |
| Table Storage | <1 MB, ~20k tx | ~$0.02 |
| Bandwidth | <1 GB | $0.00 |
| **Total** | | **~$0.02** |

Against $150/month of credits. Cost is not a design input; it is noise.

---

## 14. Deployment

- GitHub Actions builds and deploys to SWA (SWA generates the workflow on link).
- `npm test` gates deployment, as it does today.
- Existing Pages deployment stays live until cutover.
- SWA staging environments give every PR a preview URL for free.

### Hosting cutover

The URL changes from `staf3333.github.io/durability-tracker` to the SWA
hostname. The installed PWA points at the old origin and **will not follow**.

Options, preferred first:

1. **Custom domain** on SWA (free, needs a domain) — then the URL never moves again.
2. Re-add to home screen after cutover. Local data does not transfer across
   origins, so export JSON first and import after.

**Data does not migrate automatically across origins.** Export → cut over →
sign in → import. This is a one-time manual step and must be in the runbook.

---

## 15. Phased plan

| Phase | Work | Risk | Can ship before Monday? |
|---|---|---|---|
| **P0** | Schema v4: `updatedAt`, `deletedAt`, `sync` block, migration + tests. Client only, no backend. | Low | **Yes** — safe, isolated |
| **P1** | Provision: resource group, storage account, SWA, GitHub OAuth app | Low | Optional |
| **P2** | Functions API + auth wiring, tested against the real table | Medium | No |
| **P3** | Client sync layer, conflict banner, sync status UI | Medium | No |
| **P4** | Hosting cutover, custom domain, data migration | Medium | No |

P0 is worth landing tonight: it is pure client-side schema work, fully covered
by tests, and it unblocks everything else. P2–P4 are weekend work.

---

## 16. Testing

**Unit** — reducer purity under the new schema; v1→v4 and v3→v4 migration;
conflict resolution as a pure function over (local, remote).

**Integration** — sync against a mocked `/api`: offline queueing, 401 pause,
partial accept, conflict surfacing, cursor advancement.

**Manual** — two real devices, same day, both offline, then both online. This is
the case that unit tests will not catch.

**Never** — tests that hit real Azure. Use Azurite locally if needed.

---

## 17. Open questions

1. **Custom domain?** Avoids ever moving the URL again. Needs a domain — do you
   own one, or want one?
2. **Region.** `westus2` is nearest; any reason to prefer another?
3. **Retention.** Keep every version, or only current? Table Storage has no
   built-in history. A `sessions-archive` table on every overwrite is cheap
   insurance against LWW loss — worth it?
4. **Coach access.** Should the agent read the API directly with a service
   principal, or keep reading exported JSON locally?
5. **Do we want P0 tonight** and the rest after baselines?

## 18. Decision log

| Date | Decision | Why |
|---|---|---|
| 12 Sep | Local-first, not client-server | Offline at the gym is non-negotiable |
| 12 Sep | Static Web Apps over raw Functions + Pages | Built-in auth removes the entire auth layer |
| 12 Sep | Table Storage over Cosmos | Same access pattern, fewer concepts, ~free |
| 12 Sep | Per-session rows over one blob | Gives conflict granularity for free |
| 12 Sep | Two timestamps (client + server) | Client clock skew must not break the cursor |
| 12 Sep | Explicit `pending` set | Derived dirtiness breaks under clock skew |
| 12 Sep | GitHub as the only provider | `userId` is provider-scoped; two providers = two datasets |
| 12 Sep | Session-level LWW, no CRDT | Complexity unjustified for one user; revisit if it bites |
| 12 Sep | Local wipe does not sync | Clearing a phone must not clear the account |
