/* Runs a real ASA TUK page (its HTML's <script> tags, in browser order) inside a Node vm with a
   permissive stub DOM, against the fake Supabase from fake-supabase.mjs.

   It is NOT a browser: layout, CSS and real supabase-js are not exercised. It does run the real
   page JavaScript, so redirect / session / role-check logic is exercised exactly as written.

   ASATUK_ROOT can point at another checkout (e.g. an old commit) to prove a test fails on old code. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { FakeStorage, makeServer, makeCreateClient } from './fake-supabase.mjs';

export const SITE_ROOT = process.env.ASATUK_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONFIG = { url: 'https://oppxkzbebvznohqwglgw.supabase.co', publishableKey: 'sb_publishable_test_only' };

export const unhandled = [];
process.on('unhandledRejection', (r) => unhandled.push(String(r && r.message ? r.message : r)));

function makeElement(registry, id) {
  const el = {
    id, hidden: false, disabled: false, textContent: '', innerHTML: '', value: '', checked: false, className: '', open: false,
    style: { cssText: '' }, dataset: {}, children: [], listeners: {}, _qs: {}, files: [], elements: {}, options: [], classes: new Set(),
    classList: {
      add: (...c) => c.forEach((x) => el.classes.add(x)), remove: (...c) => c.forEach((x) => el.classes.delete(x)),
      toggle: (c, f) => { const on = f === undefined ? !el.classes.has(c) : !!f; on ? el.classes.add(c) : el.classes.delete(c); return on; },
      contains: (c) => el.classes.has(c)
    },
    addEventListener(t, f) { (el.listeners[t] ||= []).push(f); }, removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; }, insertBefore(c) { el.children.push(c); return c; }, remove() {},
    querySelector(sel) { return (el._qs[sel] ||= makeElement(registry, id + '>' + sel)); }, querySelectorAll() { return []; },
    setAttribute(k, v) { el['attr:' + k] = v; }, getAttribute(k) { return el['attr:' + k] ?? null; },
    focus() {}, click() {}, reset() {}, showModal() {}, close() {}, scrollIntoView() { el.scrolled = true; }, closest() { return null; },
    reportValidity() { return true; }, select() {}, requestSubmit() {}
  };
  el.parentNode = { insertBefore() {}, appendChild() {} };
  return el;
}

/* `browser` = { storage, server, clients } shared by every page opened in the same simulated browser. */
export function newBrowser({ users, tables } = {}) {
  const server = makeServer({ users, tables });
  return { storage: new FakeStorage(), server, clients: [] };
}

export async function settle(n = 12) { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); }

export async function openPage(browser, htmlFile, { search = '', hash = '', beforeScripts } = {}) {
  const html = fs.readFileSync(path.join(SITE_ROOT, htmlFile), 'utf8');
  const registry = new Map();
  const page = { file: htmlFile, errors: [], reloads: 0, navigations: [], replaced: [], clients: [], logs: [] };

  // Elements declared `hidden` / class="hidden" in the markup start hidden, like in a browser.
  for (const m of html.matchAll(/<[a-z0-9]+\s[^>]*\bid="([^"]+)"[^>]*>/gi)) {
    const el = (registry.get(m[1]) || registry.set(m[1], makeElement(registry, m[1])).get(m[1]));
    if (/\shidden(\s|>|=)/.test(m[0])) el.hidden = true;
    const cls = /class="([^"]*)"/.exec(m[0]); if (cls) cls[1].split(/\s+/).forEach((c) => c && el.classes.add(c));
  }

  const location = {
    pathname: '/' + htmlFile, origin: 'https://asatukstudents.vercel.app', search, hash,
    reload() { page.reloads += 1; }, assign(u) { page.navigations.push(String(u)); }, replace(u) { page.navigations.push(String(u)); },
    set href(u) { page.navigations.push(String(u)); }, get href() { return this.origin + this.pathname + this.search + this.hash; }
  };
  const history = {
    replaceState(_s, _t, url) {
      const u = new URL(url, 'https://x.test'); location.pathname = u.pathname; location.search = u.search; location.hash = u.hash;
      page.replaced.push(String(url));
    },
    pushState() {}
  };
  const documentStub = {
    getElementById(id) { return registry.get(id) || registry.set(id, makeElement(registry, id)).get(id); },
    createElement(tag) { return makeElement(registry, '<' + tag + '>'); },
    querySelector(sel) { return documentStub.getElementById('q:' + sel); }, querySelectorAll() { return []; },
    addEventListener(t, f) { (documentStub._l[t] ||= []).push(f); }, _l: {},
    body: makeElement(registry, 'body'), documentElement: makeElement(registry, 'html'), title: ''
  };

  const createClient = makeCreateClient({
    server: browser.server, storage: browser.storage,
    onCreate: (client, info) => { page.hashAtClientCreation = location.hash; page.clients.push(client); browser.clients.push({ page: htmlFile, key: info.key, client }); }
  });

  const unref = (fn) => (...a) => { const t = fn(...a); if (t && t.unref) t.unref(); return t; };
  const ctx = vm.createContext({
    console: { log: (...a) => page.logs.push(a.join(' ')), warn: () => {}, error: (...a) => page.logs.push('ERR ' + a.join(' ')), info() {}, debug() {} },
    document: documentStub, location, history, localStorage: browser.storage, sessionStorage: new (browser.storage.constructor)(),
    URL, URLSearchParams, setTimeout: unref(setTimeout), clearTimeout, setInterval: unref(setInterval), clearInterval,
    Promise, Date, Math, JSON, Object, Array, String, Number, Boolean, Set, Map, Error, RegExp, Symbol, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    FormData: class { constructor() { this.m = new Map(); } get(k) { return this.m.get(k) ?? null; } forEach() {} entries() { return []; } },
    Blob: class {}, File: class {}, navigator: { userAgent: 'node-test' }, confirm: () => true, alert() {},
    fetch: async () => { throw new Error('network is not available in tests'); },
    queueMicrotask, requestAnimationFrame: (f) => setTimeout(f, 0), matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener() {}, removeEventListener() {}
  });
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  ctx.supabase = { createClient };
  ctx.ASATUK_SUPABASE = CONFIG; // admin-config.js would set the same value

  const run = (code, filename) => { try { vm.runInContext(code, ctx, { filename }); } catch (e) { page.errors.push(filename + ': ' + (e && e.message)); } };
  if (beforeScripts) beforeScripts(ctx, page);

  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1], body: m[2] }));
  const deferred = [];
  for (const s of scripts) {
    const src = /src="([^"]+)"/.exec(s.attrs);
    if (src) {
      if (/^https?:/.test(src[1])) continue; // supabase-js CDN: replaced by the fake above
      const code = fs.readFileSync(path.join(SITE_ROOT, src[1]), 'utf8');
      if (/\bdefer\b/.test(s.attrs)) deferred.push([src[1], code]); else run(code, src[1]);
    } else if (s.body.trim()) run(s.body, htmlFile + '#inline');
  }
  deferred.forEach(([f, code]) => run(code, f));
  await settle();

  const fire = (target, type, evt = {}) => {
    const el = typeof target === 'string' ? documentStub.getElementById(target) : target;
    const e = { preventDefault() {}, stopPropagation() {}, target: el, currentTarget: el, ...evt };
    const handlers = [...(el.listeners[type] || [])]; if (typeof el['on' + type] === 'function') handlers.push(el['on' + type]);
    return Promise.all(handlers.map((h) => h.call(el, e)));
  };
  Object.assign(page, {
    ctx, browser,
    el: (id) => documentStub.getElementById(id),
    visible: (id) => { const e = documentStub.getElementById(id); return !e.hidden && !e.classes.has('hidden'); },
    text: (id) => documentStub.getElementById(id).textContent,
    async fire(t, type, evt) { const r = await fire(t, type, evt); await settle(); return r; },
    async signIn(email, password) {
      page.el('email').value = email; page.el('password').value = password;
      await page.fire('login-form', 'submit');
    },
    async authEvent(event, session = null) { page.clients.forEach((c) => c.__emit(event, session)); await settle(); },
    /* Buttons added by showDenied() under the login panel. */
    deniedButtons() { const panel = page.el('login')._qs['.auth-denied-links']; return panel ? panel.children : []; }
  });
  return page;
}

export function seedAccounts(browser) {
  browser.server.users['admin@asatuk.test'] = { id: 'u-admin', password: 'correct horse battery' };
  browser.server.users['member@asatuk.test'] = { id: 'u-member', password: 'member-password-1' };
  browser.server.users['council@asatuk.test'] = { id: 'u-council', password: 'council-password-1' };
  browser.server.users['suspended@asatuk.test'] = { id: 'u-susp', password: 'suspended-pass-1' };
  browser.server.tables.admin_users = [
    { user_id: 'u-admin', role: 'admin', display_name: 'ASA Admin', is_suspended: false },
    { user_id: 'u-susp', role: 'admin', display_name: 'Suspended', is_suspended: true }
  ];
  browser.server.tables.council_role_assignments = [
    { id: 'a1', user_id: 'u-council', is_active: true, docket: 'Events', display_name: 'Council Events', can_manage_events: true }
  ];
  browser.server.tables.council_account_requests = [
    { user_id: 'u-member', status: 'pending_approval', requested_position: 'PR team' }
  ];
  return browser;
}
