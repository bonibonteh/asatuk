// End-to-end flow tests: the REAL page scripts (parsed from the HTML files) run in a stub DOM against a
// fake Supabase.  Covers login, redirects, refresh, logout, expiry, recovery, and role-based access.
// Run from the repo root: node --test      (no install needed; uses Node's built-in test runner)
import test from 'node:test';
import assert from 'node:assert/strict';
import { newBrowser, openPage, seedAccounts, unhandled, settle } from './helpers/page-runner.mjs';

const ADMIN = ['admin@asatuk.test', 'correct horse battery'];
const MEMBER = ['member@asatuk.test', 'member-password-1'];
const COUNCIL = ['council@asatuk.test', 'council-password-1'];
const SUSPENDED = ['suspended@asatuk.test', 'suspended-pass-1'];
const SHARED_KEY = 'sb-oppxkzbebvznohqwglgw-auth-token';
const fresh = () => seedAccounts(newBrowser());
const noLoop = (p) => { assert.equal(p.reloads, 0, 'page must not reload by itself'); assert.deepEqual(p.navigations, [], 'page must not navigate by itself'); };
const button = (p, label) => p.deniedButtons().find((b) => b.textContent === label);

test.afterEach(() => { assert.deepEqual(unhandled.splice(0), [], 'no unhandled promise rejections'); });

test('every staff page loads its scripts without a script error', async () => {
  for (const f of ['admin.html', 'council-hub.html', 'council-access.html', 'merchandise-admin.html']) {
    const p = await openPage(fresh(), f);
    assert.deepEqual(p.errors, [], f);
    assert.equal(p.clients.length, 1, f + ' must create exactly one Supabase client');
  }
});

test('opening a protected page with no session shows sign-in once, without redirecting', async () => {
  const p = await openPage(fresh(), 'admin.html');
  assert.deepEqual(p.errors, []); assert.equal(p.clients.length, 1); assert.equal(p.clients[0].__getSessionCalls, 1, 'session checked exactly once');
  assert.ok(p.visible('login')); assert.ok(!p.visible('dashboard')); noLoop(p);
});

test('fresh login with valid credentials reaches the dashboard and persists the session first', async () => {
  const b = fresh(), p = await openPage(b, 'admin.html');
  await p.signIn(...ADMIN);
  assert.ok(p.visible('dashboard')); assert.ok(!p.visible('login')); assert.equal(p.text('who'), 'ASA Admin');
  assert.equal(b.server.signInCalls, 1); noLoop(p);
  assert.ok(b.storage.getItem(SHARED_KEY), 'session is in storage under the shared key');
});

test('invalid credentials show a clear error and nothing navigates', async () => {
  const b = fresh(), p = await openPage(b, 'admin.html');
  await p.signIn('admin@asatuk.test', 'wrong-password');
  assert.ok(p.visible('login')); assert.ok(!p.visible('dashboard'));
  assert.match(p.text('login-msg'), /Sign-in failed: Invalid login credentials/);
  assert.equal(b.storage.getItem(SHARED_KEY), null); assert.equal(b.server.signInCalls, 1); noLoop(p);
});

test('refreshing the dashboard keeps the valid session (no second sign-in, no sign-out)', async () => {
  const b = fresh(); await (await openPage(b, 'admin.html')).signIn(...ADMIN);
  const reloaded = await openPage(b, 'admin.html');
  assert.ok(reloaded.visible('dashboard')); assert.ok(!reloaded.visible('login'));
  assert.equal(b.server.signInCalls, 1); assert.equal(b.server.localSignOuts + b.server.globalSignOuts, 0); noLoop(reloaded);
});

test('logging out and logging in again works, and sign-out is local-scope', async () => {
  const b = fresh(), p = await openPage(b, 'admin.html'); await p.signIn(...ADMIN);
  await p.fire('logout', 'click');
  assert.equal(p.reloads, 1); assert.equal(b.storage.getItem(SHARED_KEY), null);
  assert.equal(b.server.localSignOuts, 1); assert.equal(b.server.globalSignOuts, 0);
  const again = await openPage(b, 'admin.html'); assert.ok(again.visible('login')); assert.ok(!again.visible('dashboard'));
  await again.signIn(...ADMIN); assert.ok(again.visible('dashboard'));
});

test('expired / unrestorable session shows a message once instead of looping', async () => {
  const b = fresh(); b.server.failSessionRestore = 'Invalid Refresh Token: Refresh Token Not Found';
  const p = await openPage(b, 'admin.html');
  assert.ok(p.visible('login')); assert.ok(!p.visible('dashboard'));
  assert.match(p.text('login-msg'), /Could not restore your sign-in session/); noLoop(p);
});

test('session ended in another tab returns to sign-in with an explanation, without reloading', async () => {
  const b = fresh(), p = await openPage(b, 'admin.html'); await p.signIn(...ADMIN);
  await p.authEvent('SIGNED_OUT');
  assert.ok(p.visible('login')); assert.ok(!p.visible('dashboard')); assert.match(p.text('login-msg'), /session ended/); noLoop(p);
});

test('ordinary member is denied without a loop, keeps their session, and can sign out', async () => {
  const b = fresh(), p = await openPage(b, 'admin.html'); await p.signIn(...MEMBER);
  assert.ok(!p.visible('dashboard')); assert.match(p.text('login-msg'), /waiting for an authorised ASA TUK administrator/);
  assert.equal(p.el('login-form').hidden, true); noLoop(p);
  assert.ok(b.storage.getItem(SHARED_KEY), 'denial must not destroy the session');
  const out = button(p, 'Sign out'); assert.ok(out, 'a denied user must be offered Sign out');
  await p.fire(out, 'click');
  assert.equal(b.storage.getItem(SHARED_KEY), null); assert.equal(b.server.globalSignOuts, 0); assert.equal(p.reloads, 1);
  const next = await openPage(b, 'admin.html'); assert.ok(next.visible('login')); assert.equal(next.el('login-form').hidden, false);
});

test('a denied member who refreshes sees the denial again (not a redirect loop) and can still sign out', async () => {
  const b = fresh(); await (await openPage(b, 'admin.html')).signIn(...MEMBER);
  const again = await openPage(b, 'admin.html');
  assert.ok(!again.visible('dashboard')); assert.match(again.text('login-msg'), /waiting for an authorised/); assert.ok(button(again, 'Sign out')); noLoop(again);
});

test('permission lookup failure is reported, offers Try again + Sign out, and keeps the session', async () => {
  const b = fresh(); b.server.failTables.admin_users = 'permission denied for table admin_users';
  const p = await openPage(b, 'admin.html'); await p.signIn(...ADMIN);
  assert.ok(!p.visible('dashboard')); assert.match(p.text('login-msg'), /Could not verify your dashboard permissions/);
  assert.ok(button(p, 'Try again')); assert.ok(button(p, 'Sign out')); assert.ok(b.storage.getItem(SHARED_KEY)); noLoop(p);
});

test('suspended administrator is denied, not admitted and not looped', async () => {
  const p = await openPage(fresh(), 'admin.html'); await p.signIn(...SUSPENDED);
  assert.ok(!p.visible('dashboard')); assert.match(p.text('login-msg'), /suspended/); noLoop(p);
});

test('council member with an assignment reaches the dashboard', async () => {
  const p = await openPage(fresh(), 'admin.html'); await p.signIn(...COUNCIL);
  assert.ok(p.visible('dashboard')); assert.equal(p.text('who'), 'Council Events'); noLoop(p);
});

test('expired email link: message is shown, and the error is removed from the URL BEFORE the client starts', async () => {
  const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
  const p = await openPage(fresh(), 'admin.html', { hash });
  assert.match(p.text('login-msg'), /expired or was already used/);
  assert.equal(p.hashAtClientCreation, ''); assert.equal(p.ctx.location.hash, ''); noLoop(p);
});

test('expired email link does not disturb an already valid session', async () => {
  const b = fresh(); await (await openPage(b, 'admin.html')).signIn(...ADMIN);
  const p = await openPage(b, 'admin.html', { hash: '#error=access_denied&error_code=otp_expired&error_description=x' });
  assert.ok(p.visible('dashboard')); assert.ok(b.storage.getItem(SHARED_KEY)); assert.equal(b.server.localSignOuts + b.server.globalSignOuts, 0);
});

test('password-recovery link opens the recovery form and does not initialise the dashboard', async () => {
  const b = fresh(), p = await openPage(b, 'admin.html', { hash: '#access_token=tok&refresh_token=r&type=recovery' });
  assert.deepEqual(p.errors, []); assert.equal(p.clients.length, 1);
  assert.equal(p.el('password-recovery-panel').scrolled, true, 'recovery form was shown');
  assert.equal(p.clients[0].__getSessionCalls || 0, 0, 'dashboard session restore must not run during recovery'); assert.ok(!p.visible('dashboard'));
  assert.ok(p.ctx.location.hash.includes('type=recovery'), 'recovery token left intact for the client'); noLoop(p);
});

test('forgot-password requests a reset to this same page and reports what happened', async () => {
  const b = fresh(), p = await openPage(b, 'admin.html');
  let redirectTo; p.clients[0].auth.resetPasswordForEmail = async (_e, o) => { redirectTo = o.redirectTo; return { error: null }; };
  p.el('email').value = 'admin@asatuk.test'; await p.fire('forgot', 'click');
  assert.equal(redirectTo, 'https://asatukstudents.vercel.app/admin.html'); assert.match(p.text('login-msg'), /password reset instructions/);
});

// ---- The cross-page loop: a session created on one workspace must be recognised on the others. ----
test('ONE sign-in works across every staff workspace (no second login prompt)', async () => {
  const b = fresh(); await (await openPage(b, 'admin.html')).signIn(...ADMIN);
  for (const f of ['council-hub.html', 'merchandise-admin.html', 'council-access.html', 'admin.html']) {
    const p = await openPage(b, f);
    assert.ok(p.visible('app') || p.visible('dashboard'), f + ' must open straight into the workspace');
    assert.ok(!p.visible('login'), f + ' must not show sign-in again'); assert.deepEqual(p.errors, [], f); noLoop(p);
  }
  assert.equal(b.server.signInCalls, 1); assert.equal(new Set(b.clients.map((c) => c.key)).size, 1);
  assert.equal(b.clients.filter((c) => c.page === 'council-access.html').length, 1, 'council-access.html must not run two clients');
});

test('signing in on a sibling page is also recognised on admin.html', async () => {
  const b = fresh(), hub = await openPage(b, 'council-hub.html'); await hub.signIn(...ADMIN);
  assert.ok(hub.visible('app'));
  const admin = await openPage(b, 'admin.html'); assert.ok(admin.visible('dashboard')); assert.equal(b.server.signInCalls, 1);
});

test('a session saved by the OLD admin key is upgraded in place, not lost (no forced re-login after deploy)', async () => {
  const b = fresh(); const s = b.server.mint({ id: 'u-admin', email: ADMIN[0] });
  b.storage.setItem('asatuk-admin-auth-v1', JSON.stringify(s));
  const p = await openPage(b, 'admin.html');
  assert.ok(p.visible('dashboard')); assert.equal(b.storage.getItem('asatuk-admin-auth-v1'), null); assert.ok(b.storage.getItem(SHARED_KEY)); assert.equal(b.server.signInCalls, 0);
});

test('non-admin on an admin-only page is denied (with Sign out), and the same session still opens their own workspace', async () => {
  const b = fresh(); await (await openPage(b, 'admin.html')).signIn(...COUNCIL);
  const access = await openPage(b, 'council-access.html');
  assert.ok(!access.visible('app')); assert.match(access.text('login-msg'), /restricted to active ASA TUK administrators/); assert.ok(button(access, 'Sign out')); noLoop(access);
  const hub = await openPage(b, 'council-hub.html'); assert.ok(hub.visible('app')); assert.equal(b.server.signInCalls, 1);
});

test('non-admin without Merchandise/Finance is denied on the merchandise dashboard with a way out', async () => {
  const b = fresh(); await (await openPage(b, 'admin.html')).signIn(...COUNCIL);
  const m = await openPage(b, 'merchandise-admin.html');
  assert.ok(!m.visible('app')); assert.match(m.text('login-msg'), /not assigned to Merchandise or Finance/); assert.ok(button(m, 'Sign out')); noLoop(m);
});

test('signing out of a sibling page never revokes the user\'s other devices', async () => {
  const b = fresh(); await (await openPage(b, 'admin.html')).signIn(...ADMIN);
  const otherDevice = b.server.mint({ id: 'u-admin', email: ADMIN[0] });
  const hub = await openPage(b, 'council-hub.html'); await hub.fire('logout', 'click');
  assert.equal(b.server.globalSignOuts, 0); assert.ok(!b.server.revoked.has(otherDevice.refresh_token)); assert.equal(b.storage.getItem(SHARED_KEY), null);
});

test('council hub invalid password shows an error on the page (no native reload)', async () => {
  const b = fresh(), hub = await openPage(b, 'council-hub.html'); await hub.signIn('council@asatuk.test', 'nope');
  assert.match(hub.text('login-msg'), /Invalid login credentials/); assert.ok(!hub.visible('app')); noLoop(hub);
});
