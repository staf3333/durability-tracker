// Integration check against real Azure Table Storage.
// Requires api/local.settings.json (gitignored). Run: npm run build && node src/test/integration.mjs
import { readFileSync } from 'node:fs';
const conn = JSON.parse(readFileSync(new URL('../../local.settings.json', import.meta.url),'utf8')).Values.STORAGE_CONNECTION_STRING;
process.env.STORAGE_CONNECTION_STRING = conn;
const { upsertSession, listSessionsSince, getSession, mergeHistory, ensureTables } = await import('../../dist/src/lib/store.js');

const USER = '60760f99ce384f6a8d17751617776ad5';   // the real principal from /api/me
const D = '2026-09-14';
const T1 = '2026-09-14T08:00:00.000Z';
const T2 = '2026-09-14T09:00:00.000Z';
const ok = [], bad = [];
const t = (n,c,e='') => (c?ok:bad).push(n + (c?'':' — '+e));

await ensureTables();

const first = await upsertSession(USER, D, { day:'mon', updatedAt:T1, exercises:{ hens:[{reps:'6',load:'70'}] } }, T1, T1);
t('write accepted', first.accepted === true);

const back = await getSession(USER, D);
t('round-trips payload', JSON.parse(back.Payload).exercises.hens[0].load === '70', back && JSON.parse(back.Payload).exercises?.hens?.[0]?.load);
t('stores both clocks', back.UpdatedAt === T1 && back.ServerUpdatedAt === T1);

const newer = await upsertSession(USER, D, { day:'mon', updatedAt:T2, exercises:{ hens:[{reps:'6',load:'75'}] } }, T2, T2);
t('newer write wins', newer.accepted === true);

const stale = await upsertSession(USER, D, { day:'mon', updatedAt:T1, exercises:{ hens:[{reps:'6',load:'999'}] } }, T1, T1);
t('stale write rejected', stale.accepted === false);
const after = await getSession(USER, D);
t('stale write did not corrupt stored data', JSON.parse(after.Payload).exercises.hens[0].load === '75', JSON.parse(after.Payload).exercises.hens[0].load);

const since = await listSessionsSince(USER, '2026-09-14T08:30:00.000Z');
t('cursor filters by server time', since.length === 1 && since[0].rowKey === D, `${since.length} rows`);
const none = await listSessionsSince(USER, '2099-01-01T00:00:00.000Z');
t('future cursor returns nothing', none.length === 0, `${none.length} rows`);

const other = await listSessionsSince('someone-else-entirely');
t('other users see none of it', other.length === 0, `${other.length} rows`);

const h = await mergeHistory(USER, { hens: { date:'2026-04-17', source:'PJF', sets:[{reps:'8',load:'90',done:true}] } }, T1);
t('history merge persists', h.hens.date === '2026-04-17');

console.log('PASS ' + ok.length); ok.forEach(o=>console.log('  ✓ '+o));
if (bad.length) { console.log('FAIL ' + bad.length); bad.forEach(b=>console.log('  ✗ '+b)); }
console.log(bad.length ? '\nRESULT: FAILURES' : '\nRESULT: ALL GREEN — real Azure Table Storage');
process.exit(bad.length?1:0);
