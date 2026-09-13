import { TableClient, odata } from '@azure/data-tables';

const CONN = process.env.STORAGE_CONNECTION_STRING ?? '';
export const SESSIONS_TABLE = 'sessions';
export const HISTORY_TABLE = 'history';

const clients = new Map<string, TableClient>();

export function table(name: string): TableClient {
  let c = clients.get(name);
  if (!c) {
    c = TableClient.fromConnectionString(CONN, name, { allowInsecureConnection: true });
    clients.set(name, c);
  }
  return c;
}

/** Idempotent; safe to call on every cold start. */
export async function ensureTables() {
  await Promise.all([
    table(SESSIONS_TABLE).createTable().catch(ignoreExists),
    table(HISTORY_TABLE).createTable().catch(ignoreExists),
  ]);
}

function ignoreExists(err: unknown) {
  const code = (err as { statusCode?: number })?.statusCode;
  if (code !== 409) throw err;
}

export interface SessionEntity {
  partitionKey: string;
  rowKey: string;
  Payload: string;
  /** Writer's clock. Decides who wins a conflict. */
  UpdatedAt: string;
  /** Server clock. Drives the sync cursor — never a device clock. */
  ServerUpdatedAt: string;
  Deleted: boolean;
}

export async function listSessionsSince(userId: string, since?: string) {
  const filter = since
    ? odata`PartitionKey eq ${userId} and ServerUpdatedAt gt ${since}`
    : odata`PartitionKey eq ${userId}`;
  const out: SessionEntity[] = [];
  for await (const e of table(SESSIONS_TABLE).listEntities<SessionEntity>({ queryOptions: { filter } })) {
    out.push(e);
  }
  return out;
}

export async function getSession(userId: string, date: string) {
  try {
    return await table(SESSIONS_TABLE).getEntity<SessionEntity>(userId, date);
  } catch (err) {
    if ((err as { statusCode?: number })?.statusCode === 404) return null;
    throw err;
  }
}

/**
 * Writes only when the incoming edit is newer than what is stored. Returns the
 * stored entity when it loses, so the client can surface a conflict rather than
 * discovering the loss later.
 */
export async function upsertSession(
  userId: string, date: string, payload: unknown, updatedAt: string, serverTime: string,
): Promise<{ accepted: true } | { accepted: false; stored: SessionEntity }> {
  const existing = await getSession(userId, date);
  if (existing && existing.UpdatedAt >= updatedAt) {
    return { accepted: false, stored: existing };
  }
  const entity: SessionEntity = {
    partitionKey: userId,
    rowKey: date,
    Payload: JSON.stringify(payload),
    UpdatedAt: updatedAt,
    ServerUpdatedAt: serverTime,
    Deleted: !!(payload as { deletedAt?: string })?.deletedAt,
  };
  await table(SESSIONS_TABLE).upsertEntity(entity, 'Replace');
  return { accepted: true };
}

export interface HistoryEntity {
  partitionKey: string;
  rowKey: 'history';
  Payload: string;
  ServerUpdatedAt: string;
}

export async function getHistory(userId: string) {
  try {
    return await table(HISTORY_TABLE).getEntity<HistoryEntity>(userId, 'history');
  } catch (err) {
    if ((err as { statusCode?: number })?.statusCode === 404) return null;
    throw err;
  }
}

/** History is effectively append-only: per exercise, the later date wins. */
export async function mergeHistory(
  userId: string, incoming: Record<string, { date: string }>, serverTime: string,
) {
  const existing = await getHistory(userId);
  const merged: Record<string, { date: string }> = existing ? JSON.parse(existing.Payload) : {};
  for (const [exId, entry] of Object.entries(incoming ?? {})) {
    if (!merged[exId] || entry.date > merged[exId].date) merged[exId] = entry;
  }
  await table(HISTORY_TABLE).upsertEntity<HistoryEntity>({
    partitionKey: userId, rowKey: 'history',
    Payload: JSON.stringify(merged), ServerUpdatedAt: serverTime,
  }, 'Replace');
  return merged;
}
