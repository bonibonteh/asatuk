/* ASA TUK shared Supabase session helper (browser-safe; contains no secrets).

   Why this file exists
   --------------------
   Every staff page (admin.html, council-hub.html, council-access.html,
   merchandise-admin.html) must see the SAME signed-in session. Before this helper:
     * admin.js stored its session under a private key ("asatuk-admin-auth-v1") while the
       other pages used Supabase's default key, so a session created on one page was
       invisible on the next. Links between workspaces therefore landed on a login screen
       again, which looked like an endless redirect between sign-in and the dashboards.
     * council-access.html ran two clients on one session (inline script + council-requests.js),
       so refresh tokens were refreshed twice at the same moment.
     * Three pages signed out with the default scope ("global"), which ends the user's
       sessions on EVERY device and tab, so signing out of one workspace could silently
       kill an open admin session.

   Rules this helper enforces
   --------------------------
     1. One storage key for every page (the Supabase default for this project).
     2. One client per page (getClient is a singleton).
     3. Sign-out is always local-scope.
     4. A one-time, non-destructive migration of any session saved under the old admin key.
     5. Error parameters in an email-link URL (expired link etc.) are read and removed from the
        URL before the client starts, so they become a readable message and never reach it. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.ASATUKAuth = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var LEGACY_KEYS = ['asatuk-admin-auth-v1'];
  var CLIENT_SLOT = '__asatukSupabaseClient';
  var linkErrorResult = null;

  /* Same value supabase-js uses by default: sb-<project-ref>-auth-token. */
  function storageKeyFor(url) {
    return 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token';
  }

  function expiresAt(raw) {
    try { var n = Number(JSON.parse(raw).expires_at); return isFinite(n) ? n : 0; } catch (_) { return 0; }
  }

  /* Move a session saved under an old key into the shared key so nobody is signed out by the
     deploy. Never overwrites a newer session, always removes the old key, never throws. */
  function migrateLegacySession(storage, targetKey, legacyKeys) {
    var result = 'none';
    try {
      (legacyKeys || LEGACY_KEYS).forEach(function (legacyKey) {
        var legacy = storage.getItem(legacyKey);
        if (legacy === null || legacy === undefined) return;
        var current = storage.getItem(targetKey);
        if (current === null || current === undefined || expiresAt(legacy) > expiresAt(current)) {
          storage.setItem(targetKey, legacy);
          result = 'migrated';
        } else if (result === 'none') {
          result = 'kept-current';
        }
        storage.removeItem(legacyKey);
      });
    } catch (_) { return 'error'; }
    return result;
  }

  var FRIENDLY = {
    otp_expired: 'That email link has expired or was already used. Request a new one and open the most recent email.',
    access_denied: 'That email link is no longer valid. Request a new one and open the most recent email.'
  };

  /* Returns { code, description, message } when the URL carries an auth error, otherwise null. */
  function parseLinkError(hash, search) {
    var sources = [String(hash || '').replace(/^#/, ''), String(search || '').replace(/^\?/, '')];
    for (var i = 0; i < sources.length; i++) {
      if (!sources[i]) continue;
      var p = new URLSearchParams(sources[i]);
      var code = p.get('error_code') || '', err = p.get('error') || '', desc = p.get('error_description') || '';
      if (!code && !err && !desc) continue;
      return {
        code: code || err,
        description: desc,
        message: FRIENDLY[code] || FRIENDLY[err] || (desc ? desc + ' Request a new link and try again.' : 'That email link could not be used. Request a new one and try again.')
      };
    }
    return null;
  }

  function stripParams(raw, names) {
    var p = new URLSearchParams(String(raw || '').replace(/^[#?]/, ''));
    names.forEach(function (n) { p.delete(n); });
    return p.toString();
  }

  /* Reads an auth error from the URL, removes ONLY the error parameters (a recovery or
     sign-in token in the same URL is left untouched), and remembers the message. */
  function consumeLinkError(loc, hist) {
    loc = loc || root.location; hist = hist || root.history;
    var found = parseLinkError(loc.hash, loc.search);
    if (!found) return null;
    linkErrorResult = found;
    try {
      var names = ['error', 'error_code', 'error_description'];
      var h = stripParams(loc.hash, names), s = stripParams(loc.search, names);
      hist.replaceState(null, '', loc.pathname + (s ? '?' + s : '') + (h ? '#' + h : ''));
    } catch (_) { /* cosmetic only */ }
    return found;
  }

  function lastLinkError() { return linkErrorResult; }

  /* The one Supabase client for this page. */
  function getClient(cfg, deps) {
    deps = deps || {};
    var holder = deps.holder || root;
    if (holder[CLIENT_SLOT]) return holder[CLIENT_SLOT];
    var lib = deps.supabase || root.supabase;
    if (!lib || typeof lib.createClient !== 'function') throw new Error('Supabase JavaScript library did not load.');
    if (!cfg || !cfg.url || !cfg.publishableKey) throw new Error('Supabase configuration is missing.');
    var storage = deps.storage || safeStorage();
    var key = storageKeyFor(cfg.url);
    if (storage) migrateLegacySession(storage, key);
    consumeLinkError(deps.location, deps.history);
    holder[CLIENT_SLOT] = lib.createClient(cfg.url, cfg.publishableKey, {
      auth: { storageKey: key, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    holder[CLIENT_SLOT].__asatukStorageKey = key;
    return holder[CLIENT_SLOT];
  }

  function safeStorage() { try { return root.localStorage || null; } catch (_) { return null; } }

  /* Local sign-out only: ends THIS browser's session, never the user's other devices or tabs. */
  async function signOut(client, deps) {
    deps = deps || {};
    client = client || (deps.holder || root)[CLIENT_SLOT];
    var result = { error: null };
    if (client && client.auth) {
      try { var r = await client.auth.signOut({ scope: 'local' }); if (r && r.error) result.error = r.error; }
      catch (e) { result.error = e; }
    }
    try {
      var storage = deps.storage || safeStorage();
      var key = client && client.__asatukStorageKey;
      if (storage && key) storage.removeItem(key);
    } catch (_) { /* nothing more to clear */ }
    return result;
  }

  return {
    LEGACY_KEYS: LEGACY_KEYS, storageKeyFor: storageKeyFor, migrateLegacySession: migrateLegacySession,
    parseLinkError: parseLinkError, consumeLinkError: consumeLinkError, lastLinkError: lastLinkError,
    getClient: getClient, signOut: signOut
  };
});
