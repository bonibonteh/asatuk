// Unit tests for assets/auth-session.js (the shared session helper).  Run from the repo root: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FakeStorage, makeServer, makeCreateClient } from './helpers/fake-supabase.mjs';

const A = createRequire(import.meta.url)('../assets/auth-session.js');
const URL_ = 'https://oppxkzbebvznohqwglgw.supabase.co';
const CFG = { url: URL_, publishableKey: 'sb_publishable_test_only' };
const session = (exp, rt) => JSON.stringify({ access_token: 'a', refresh_token: rt, expires_at: exp, user: { id: 'u1' } });

test('storage key equals supabase-js default for this project', () => {
  assert.equal(A.storageKeyFor(URL_), 'sb-oppxkzbebvznohqwglgw-auth-token');
});

test('legacy admin session is migrated, and the old key removed', () => {
  const s = new FakeStorage(); s.setItem('asatuk-admin-auth-v1', session(2000, 'old'));
  assert.equal(A.migrateLegacySession(s, 'K'), 'migrated');
  assert.equal(JSON.parse(s.getItem('K')).refresh_token, 'old');
  assert.equal(s.getItem('asatuk-admin-auth-v1'), null);
});

test('migration never replaces a newer shared session with an older legacy one', () => {
  const s = new FakeStorage(); s.setItem('K', session(5000, 'new')); s.setItem('asatuk-admin-auth-v1', session(1000, 'old'));
  assert.equal(A.migrateLegacySession(s, 'K'), 'kept-current');
  assert.equal(JSON.parse(s.getItem('K')).refresh_token, 'new');
  assert.equal(s.getItem('asatuk-admin-auth-v1'), null);
});

test('migration prefers a newer legacy session over an older shared one', () => {
  const s = new FakeStorage(); s.setItem('K', session(1000, 'stale')); s.setItem('asatuk-admin-auth-v1', session(9000, 'fresh'));
  assert.equal(A.migrateLegacySession(s, 'K'), 'migrated');
  assert.equal(JSON.parse(s.getItem('K')).refresh_token, 'fresh');
});

test('migration is a no-op without a legacy session, and never throws on broken storage', () => {
  assert.equal(A.migrateLegacySession(new FakeStorage(), 'K'), 'none');
  const broken = { getItem() { throw new Error('denied'); }, setItem() {}, removeItem() {} };
  assert.equal(A.migrateLegacySession(broken, 'K'), 'error');
});

test('expired-link errors become a friendly message; recovery and sign-in links are not errors', () => {
  const e = A.parseLinkError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', '');
  assert.equal(e.code, 'otp_expired'); assert.match(e.message, /expired or was already used/);
  assert.equal(A.parseLinkError('#access_token=abc&refresh_token=r&type=recovery', ''), null);
  assert.equal(A.parseLinkError('', '?view=events'), null);
  assert.equal(A.parseLinkError('', ''), null);
  assert.match(A.parseLinkError('', '?error=server_error&error_description=Boom').message, /Boom/);
});

test('consumeLinkError strips only the error parameters and keeps everything else', () => {
  const replaced = [];
  const hist = { replaceState: (_a, _b, u) => replaced.push(u) };
  const found = A.consumeLinkError({ pathname: '/admin.html', search: '?view=events', hash: '#error=access_denied&error_code=otp_expired&error_description=x' }, hist);
  assert.ok(found); assert.deepEqual(replaced, ['/admin.html?view=events']);
  const none = A.consumeLinkError({ pathname: '/admin.html', search: '', hash: '#access_token=t&type=recovery' }, hist);
  assert.equal(none, null); assert.equal(replaced.length, 1, 'a recovery link must be left alone');
});

function env() {
  const storage = new FakeStorage(), server = makeServer(), created = [];
  const lib = { createClient: makeCreateClient({ server, storage, onCreate: (c, i) => created.push({ c, i }) }) };
  return { storage, server, created, lib, holder: {} };
}

test('getClient is a singleton per page: one client, one shared storage key, persistence on', () => {
  const e = env(); let opts;
  const spy = { createClient: (u, k, o) => { opts = o; return e.lib.createClient(u, k, o); } };
  const deps = { supabase: spy, storage: e.storage, holder: e.holder, location: { pathname: '/x', search: '', hash: '' }, history: { replaceState() {} } };
  const a = A.getClient(CFG, deps), b = A.getClient(CFG, deps);
  assert.equal(a, b); assert.equal(e.created.length, 1);
  assert.deepEqual(opts.auth, { storageKey: 'sb-oppxkzbebvznohqwglgw-auth-token', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true });
});

test('getClient fails loudly (not silently) when the library or config is missing', () => {
  assert.throws(() => A.getClient(CFG, { supabase: null, holder: {} }), /did not load/);
  assert.throws(() => A.getClient({}, { supabase: { createClient() {} }, holder: {}, storage: new FakeStorage() }), /configuration is missing/);
});

test('getClient migrates a legacy session before the client starts reading storage', () => {
  const e = env(); const s = e.server.mint({ id: 'u1', email: 'a@b.c' });
  e.storage.setItem('asatuk-admin-auth-v1', JSON.stringify(s));
  const c = A.getClient(CFG, { supabase: e.lib, storage: e.storage, holder: e.holder, location: { pathname: '/', search: '', hash: '' }, history: { replaceState() {} } });
  return c.auth.getSession().then(({ data }) => { assert.equal(data.session.refresh_token, s.refresh_token); assert.equal(e.storage.getItem('asatuk-admin-auth-v1'), null); });
});

test('signOut uses LOCAL scope only and never revokes the user\'s other devices', async () => {
  const e = env(); const user = { id: 'u1', email: 'a@b.c' };
  const other = e.server.mint(user), mine = e.server.mint(user); e.storage.setItem('sb-oppxkzbebvznohqwglgw-auth-token', JSON.stringify(mine));
  const c = A.getClient(CFG, { supabase: e.lib, storage: e.storage, holder: e.holder, location: { pathname: '/', search: '', hash: '' }, history: { replaceState() {} } });
  await A.signOut(c, { storage: e.storage, holder: e.holder });
  assert.equal(e.server.globalSignOuts, 0); assert.equal(e.server.localSignOuts, 1);
  assert.ok(!e.server.revoked.has(other.refresh_token), 'another device must stay signed in');
  assert.equal(e.storage.getItem('sb-oppxkzbebvznohqwglgw-auth-token'), null);
});

test('signOut still clears the local session if the network call fails, and does not throw', async () => {
  const e = env(); e.storage.setItem('K', '{}');
  const client = { __asatukStorageKey: 'K', auth: { signOut: async () => { throw new Error('offline'); } } };
  const r = await A.signOut(client, { storage: e.storage });
  assert.equal(e.storage.getItem('K'), null); assert.match(r.error.message, /offline/);
  await assert.doesNotReject(() => A.signOut(null, { storage: e.storage, holder: {} }));
});
