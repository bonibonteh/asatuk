/* Minimal in-memory stand-in for Supabase Auth + PostgREST, used only by the tests.
   It models the behaviours that matter for the login-loop bug:
     - which localStorage key a client reads/writes its session from (default key vs custom key)
     - session persistence after sign-in, and what getSession() returns afterwards
     - sign-out scope: 'global' (the supabase-js default) revokes the user's sessions everywhere,
       'local' only clears this browser
     - row lookups for admin_users / council_role_assignments / council_account_requests */

export class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

export function defaultKeyFor(url) { return 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token'; }

export function makeServer({ users = {}, tables = {} } = {}) {
  let n = 0;
  const server = {
    users,                    // { email: { id, password } }
    tables,                   // { tableName: [rows] }
    failTables: {},           // { tableName: 'error message' }
    revoked: new Set(),       // refresh tokens that no longer work
    sessionsByUser: new Map(),// userId -> Set(refresh tokens)
    globalSignOuts: 0,
    localSignOuts: 0,
    signInCalls: 0,
    failSessionRestore: null, // set to a message to emulate an expired/unrefreshable session
    mint(user) {
      n += 1;
      const s = { access_token: 'at-' + n, refresh_token: 'rt-' + n, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user.id, email: user.email } };
      if (!server.sessionsByUser.has(user.id)) server.sessionsByUser.set(user.id, new Set());
      server.sessionsByUser.get(user.id).add(s.refresh_token);
      return s;
    },
    revokeAll(userId) { (server.sessionsByUser.get(userId) || []).forEach((t) => server.revoked.add(t)); }
  };
  return server;
}

function builder(server, table, userId, kind) {
  const calls = [];
  const b = new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve, reject) => {
          let result;
          if (server.failTables[table]) result = { data: null, error: { message: server.failTables[table] } };
          else {
            let rows = (server.tables[table] || []).slice();
            calls.filter((c) => c[0] === 'eq').forEach(([, [col, val]]) => { rows = rows.filter((r) => r[col] === val); });
            const single = calls.some((c) => c[0] === 'maybeSingle' || c[0] === 'single');
            result = { data: single ? (rows[0] ?? null) : rows, error: null };
          }
          return Promise.resolve(result).then(resolve, reject);
        };
      }
      return (...args) => { calls.push([prop, args]); return b; };
    }
  });
  return b;
}

/* Returns a createClient(url, key, opts) that behaves like supabase-js for one browser. */
export function makeCreateClient({ server, storage, onCreate }) {
  return function createClient(url, _key, opts = {}) {
    const key = opts?.auth?.storageKey || defaultKeyFor(url);
    const subs = [];
    const emit = (event, session) => subs.forEach((cb) => Promise.resolve().then(() => cb(event, session)));
    const read = () => { try { return JSON.parse(storage.getItem(key)); } catch { return null; } };
    const client = {
      __key: key, __subs: subs, __emit: emit,
      auth: {
        async signInWithPassword({ email, password }) {
          server.signInCalls += 1;
          const u = server.users[email];
          if (!u || u.password !== password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
          const session = server.mint({ id: u.id, email });
          storage.setItem(key, JSON.stringify(session));
          emit('SIGNED_IN', session);
          return { data: { user: session.user, session }, error: null };
        },
        async getSession() {
          client.__getSessionCalls = (client.__getSessionCalls || 0) + 1;
          if (server.failSessionRestore) return { data: { session: null }, error: { message: server.failSessionRestore } };
          const s = read();
          if (!s) return { data: { session: null }, error: null };
          if (server.revoked.has(s.refresh_token)) { storage.removeItem(key); emit('SIGNED_OUT', null); return { data: { session: null }, error: null }; }
          return { data: { session: s }, error: null };
        },
        onAuthStateChange(cb) { subs.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
        async signOut(o) {
          const scope = o && o.scope ? o.scope : 'global';
          const s = read();
          if (scope === 'global') { server.globalSignOuts += 1; if (s) server.revokeAll(s.user.id); } else server.localSignOuts += 1;
          storage.removeItem(key);
          emit('SIGNED_OUT', null);
          return { error: null };
        },
        async resetPasswordForEmail() { return { data: {}, error: null }; },
        async updateUser() { return { data: {}, error: null }; }
      },
      from(table) { const s = read(); return builder(server, table, s && s.user.id); },
      rpc() { return Promise.resolve({ data: 'pending_approval', error: null }); },
      storage: { from() { return new Proxy({}, { get: () => async () => ({ data: null, error: null }) }); } }
    };
    if (onCreate) onCreate(client, { url, key });
    return client;
  };
}
