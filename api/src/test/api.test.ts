import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { HttpRequest } from '@azure/functions';
import { getPrincipal } from '../lib/auth';

const principalHeader = (obj: unknown) =>
  Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');

const req = (header?: string) =>
  ({ headers: { get: (k: string) => (k === 'x-ms-client-principal' ? header ?? null : null) } }) as unknown as HttpRequest;

describe('principal parsing', () => {
  it('accepts a well-formed GitHub principal', () => {
    const p = getPrincipal(req(principalHeader({
      userId: 'github|123', userDetails: 'staf3333', identityProvider: 'github',
    })));
    expect(p).toEqual({ userId: 'github|123', userDetails: 'staf3333', identityProvider: 'github' });
  });

  it('rejects a missing header', () => {
    expect(getPrincipal(req())).toBeNull();
  });

  it('rejects malformed base64 without throwing', () => {
    expect(getPrincipal(req('not-base64-at-all!!'))).toBeNull();
  });

  it('rejects a principal with no userId', () => {
    expect(getPrincipal(req(principalHeader({ identityProvider: 'github' })))).toBeNull();
  });

  it('rejects providers other than GitHub', () => {
    // userId is provider-scoped, so a second provider would silently create a
    // separate, empty dataset rather than an error the user would notice.
    expect(getPrincipal(req(principalHeader({
      userId: 'aad|999', userDetails: 'x', identityProvider: 'aad',
    })))).toBeNull();
  });
});

/* ---------- the conflict rule ---------- */

const rows = new Map<string, any>();
const key = (pk: string, rk: string) => `${pk}/${rk}`;

vi.mock('@azure/data-tables', () => ({
  odata: (strings: TemplateStringsArray, ...vals: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + (i < vals.length ? String(vals[i]) : ''), ''),
  TableClient: {
    fromConnectionString: () => ({
      createTable: async () => {},
      getEntity: async (pk: string, rk: string) => {
        const e = rows.get(key(pk, rk));
        if (!e) { const err: any = new Error('404'); err.statusCode = 404; throw err; }
        return e;
      },
      upsertEntity: async (e: any) => { rows.set(key(e.partitionKey, e.rowKey), e); },
      listEntities: () => ({
        async *[Symbol.asyncIterator]() { for (const v of rows.values()) yield v; },
      }),
    }),
  },
}));

const { upsertSession, mergeHistory } = await import('../lib/store');

beforeEach(() => rows.clear());

describe('upsert conflict rule', () => {
  const USER = 'github|123';
  const T1 = '2026-09-14T08:00:00.000Z';
  const T2 = '2026-09-14T09:00:00.000Z';

  it('accepts a first write', async () => {
    const res = await upsertSession(USER, '2026-09-14', { updatedAt: T1 }, T1, T1);
    expect(res.accepted).toBe(true);
  });

  it('accepts a strictly newer write', async () => {
    await upsertSession(USER, '2026-09-14', { updatedAt: T1, load: 'old' }, T1, T1);
    const res = await upsertSession(USER, '2026-09-14', { updatedAt: T2, load: 'new' }, T2, T2);
    expect(res.accepted).toBe(true);
    expect(JSON.parse(rows.get(key(USER, '2026-09-14')).Payload).load).toBe('new');
  });

  it('rejects a stale write and returns the stored version', async () => {
    await upsertSession(USER, '2026-09-14', { updatedAt: T2, load: 'winner' }, T2, T2);
    const res = await upsertSession(USER, '2026-09-14', { updatedAt: T1, load: 'loser' }, T1, T1);
    expect(res.accepted).toBe(false);
    if (!res.accepted) expect(JSON.parse(res.stored.Payload).load).toBe('winner');
    expect(JSON.parse(rows.get(key(USER, '2026-09-14')).Payload).load).toBe('winner');
  });

  it('rejects an equal timestamp, so a replay cannot overwrite', async () => {
    await upsertSession(USER, '2026-09-14', { updatedAt: T1, load: 'first' }, T1, T1);
    const res = await upsertSession(USER, '2026-09-14', { updatedAt: T1, load: 'second' }, T1, T1);
    expect(res.accepted).toBe(false);
  });

  it('records the server clock separately from the writer clock', async () => {
    const deviceSkewed = '2026-09-14T23:00:00.000Z';
    const serverTime = '2026-09-14T09:00:05.000Z';
    await upsertSession(USER, '2026-09-14', { updatedAt: deviceSkewed }, deviceSkewed, serverTime);
    const stored = rows.get(key(USER, '2026-09-14'));
    expect(stored.UpdatedAt).toBe(deviceSkewed);
    expect(stored.ServerUpdatedAt).toBe(serverTime);
  });

  it('flags a tombstone so deletes propagate', async () => {
    await upsertSession(USER, '2026-09-14', { updatedAt: T1, deletedAt: T1 }, T1, T1);
    expect(rows.get(key(USER, '2026-09-14')).Deleted).toBe(true);
  });

  it('scopes rows to the caller, so two users never collide', async () => {
    await upsertSession('github|aaa', '2026-09-14', { updatedAt: T1, who: 'a' }, T1, T1);
    await upsertSession('github|bbb', '2026-09-14', { updatedAt: T1, who: 'b' }, T1, T1);
    expect(JSON.parse(rows.get(key('github|aaa', '2026-09-14')).Payload).who).toBe('a');
    expect(JSON.parse(rows.get(key('github|bbb', '2026-09-14')).Payload).who).toBe('b');
  });
});

describe('history merge', () => {
  const USER = 'github|123';

  it('keeps the later dated entry per exercise', async () => {
    await mergeHistory(USER, { hens: { date: '2025-04-25' } }, 'S1');
    const merged = await mergeHistory(USER, { hens: { date: '2026-04-17' } }, 'S2');
    expect(merged.hens.date).toBe('2026-04-17');
  });

  it('does not regress to an older entry', async () => {
    await mergeHistory(USER, { hens: { date: '2026-04-17' } }, 'S1');
    const merged = await mergeHistory(USER, { hens: { date: '2025-01-01' } }, 'S2');
    expect(merged.hens.date).toBe('2026-04-17');
  });

  it('unions exercises across pushes', async () => {
    await mergeHistory(USER, { hens: { date: '2026-04-17' } }, 'S1');
    const merged = await mergeHistory(USER, { soleus: { date: '2025-02-01' } }, 'S2');
    expect(Object.keys(merged).sort()).toEqual(['hens', 'soleus']);
  });
});
