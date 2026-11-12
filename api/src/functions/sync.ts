import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions';
import { getPrincipal, json, unauthorized } from '../lib/auth';
import {
  ensureTables, listSessionsSince, upsertSession, mergeHistory, getHistory, joinPayload,
} from '../lib/store';
import { validWorkoutRecordId } from '../lib/workout';

interface PushBody {
  sessions?: Record<string, { updatedAt: string; deletedAt?: string }>;
  history?: Record<string, { date: string }>;
}

/** GET /api/sync?since=<iso> — everything changed server-side after `since`. */
export async function pull(req: HttpRequest): Promise<HttpResponseInit> {
  const p = getPrincipal(req);
  if (!p) return unauthorized();
  await ensureTables();

  const since = req.query.get('since') ?? undefined;
  const rows = await listSessionsSince(p.userId, since);

  const sessions: Record<string, unknown> = {};
  const deleted: string[] = [];
  for (const r of rows) {
    if (r.Deleted) deleted.push(r.rowKey);
    else sessions[r.rowKey] = JSON.parse(r.Payload);
  }

  const historyRow = await getHistory(p.userId);
  return json(200, {
    serverTime: new Date().toISOString(),
    sessions,
    history: (() => { const raw = joinPayload(historyRow); return raw ? JSON.parse(raw) : {}; })(),
    deleted,
  });
}

/** POST /api/sync — upsert sessions that are newer than what is stored. */
export async function push(req: HttpRequest): Promise<HttpResponseInit> {
  const p = getPrincipal(req);
  if (!p) return unauthorized();
  await ensureTables();

  let body: PushBody;
  try {
    body = (await req.json()) as PushBody;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const serverTime = new Date().toISOString();
  const accepted: string[] = [];
  const conflicts: Record<string, unknown> = {};

  for (const [date, session] of Object.entries(body.sessions ?? {})) {
    // Legacy workouts use the bare date. Planned workouts append a stable id
    // while keeping the date prefix readable and Azure Table-safe.
    if (!validWorkoutRecordId(date)) {
      return json(400, { error: 'bad_workout_id', date });
    }
    if (!session?.updatedAt) return json(400, { error: 'missing_updatedAt', date });

    const res = await upsertSession(p.userId, date, session, session.updatedAt, serverTime);
    if (res.accepted) accepted.push(date);
    else conflicts[date] = JSON.parse(res.stored.Payload);
  }

  try {
    if (body.history) await mergeHistory(p.userId, body.history, serverTime);
  } catch (err) {
    // Sessions already landed; report the history failure without losing them.
    const msg = err instanceof Error ? err.message : 'history_failed';
    return json(200, { serverTime, accepted, conflicts, historyError: msg });
  }

  return json(200, { serverTime, accepted, conflicts });
}

app.http('sync-pull', { methods: ['GET'], authLevel: 'anonymous', route: 'sync', handler: pull });
app.http('sync-push', { methods: ['POST'], authLevel: 'anonymous', route: 'sync', handler: push });
