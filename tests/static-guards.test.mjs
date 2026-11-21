// Static regression guards. These would have caught the actual production outage (admin.js did not parse)
// and they lock in the session rules that prevent cross-page sign-in loops.  Run from the repo root: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { SITE_ROOT } from './helpers/page-runner.mjs';

const read = (f) => fs.readFileSync(path.join(SITE_ROOT, f), 'utf8');
const html = fs.readdirSync(SITE_ROOT).filter((f) => f.endsWith('.html'));
const assets = fs.readdirSync(path.join(SITE_ROOT, 'assets')).filter((f) => f.endsWith('.js')).map((f) => 'assets/' + f);
const inline = (src) => [...src.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => !/ld\+json/.test(m[1]) && m[2].trim()).map((m) => m[2]);
const STAFF_PAGES = ['admin.html', 'council-hub.html', 'council-access.html', 'merchandise-admin.html', 'treasurer-workspace.html'];

test('every JavaScript file parses (a parse error silently disables a whole page)', () => {
  for (const f of assets) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
});

test('every inline <script> in every page parses', () => {
  for (const f of html) inline(read(f)).forEach((code, i) => assert.doesNotThrow(() => new vm.Script(code, { filename: f + '#' + i }), f + ' inline #' + i));
});

test('staff pages load the session helper after config + library and before anything that uses it', () => {
  for (const f of STAFF_PAGES) {
    const s = read(f), at = (needle) => s.indexOf(needle);
    const lib = at('@supabase/supabase-js'), cfg = at('assets/admin-config.js'), helper = at('assets/auth-session.js'), ui = at('assets/auth-ui.js');
    assert.ok(lib > -1 && cfg > lib && helper > cfg && ui > helper, f + ': script order must be supabase-js, admin-config, auth-session, auth-ui');
    assert.equal(s.split('assets/auth-session.js').length - 1, 1, f + ': helper included exactly once');
  }
});

test('staff pages never create their own Supabase client (one shared client per page)', () => {
  for (const f of [...STAFF_PAGES, 'assets/admin.js']) assert.ok(!/\.createClient\(/.test(read(f)), f + ' must use ASATUKAuth.getClient');
  // council-requests.js (loaded by council-access.html) may only fall back to its own client if the helper is absent
  assert.match(read('assets/council-requests.js'), /ASATUKAuth\?window\.ASATUKAuth\.getClient\(cfg\)/);
});

test('nothing signs out with the default GLOBAL scope', () => {
  // Only the raw Supabase call is flagged; ASATUKAuth.signOut() is the helper, which is hard-wired to local scope.
  for (const f of [...html, ...assets]) assert.ok(!/\.auth\.signOut\(\s*\)/.test(read(f)), f + ' calls auth.signOut() with no scope (global)');
  assert.match(read('assets/auth-session.js'), /signOut\(\{ scope: 'local' \}\)/);
});

test('the private admin storage key survives only as the helper\'s migration source', () => {
  for (const f of [...html, ...assets].filter((x) => x !== 'assets/auth-session.js')) assert.ok(!read(f).includes('asatuk-admin-auth-v1'), f);
});

test('sign-in forms cannot fall back to a GET that puts the password in the URL', () => {
  for (const f of STAFF_PAGES) assert.match(read(f), /<form id="login-form" method="post"/, f);
});

test('staff pages do not redirect on their own (only an explicit reload after sign-out)', () => {
  const sources = { 'assets/admin.js': read('assets/admin.js'), ...Object.fromEntries(STAFF_PAGES.slice(1).map((f) => [f, inline(read(f)).join('\n')])) };
  for (const [f, code] of Object.entries(sources)) assert.ok(!/location\s*\.\s*(href\s*=|replace\(|assign\()/.test(code), f + ' must not assign location');
});

test('no secret keys are present in browser-served files', () => {
  for (const f of [...html, ...assets]) {
    const s = read(f);
    assert.ok(!/service_role|sb_secret_|SUPABASE_SERVICE/i.test(s), f + ' mentions a service/secret key');
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(s), f + ' contains a JWT-looking token');
  }
});
