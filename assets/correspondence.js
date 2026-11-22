/* Council Correspondence & Inter-Docket Communication — runs inside council-hub.html.
   All access control is enforced by Supabase RLS / RPCs (see supabase/migrations/20261121200000_council_correspondence.sql);
   this file only presents what the database allows. Uses the Council Hub's shared client via window.ASATUKHub. */
(() => {
  'use strict';
  const BUCKET = 'correspondence-files';
  const DOCKETS = ['Executive', 'Secretariat', 'Events', 'Organizing', 'Academic', 'PR & Communications', 'Merchandise', 'Treasury'];
  const TYPES = ['Official Letter', 'Internal Memo', 'Request', 'Invitation', 'Notice', 'Report Submission', 'Other'];
  const PRIORITIES = ['Normal', 'Urgent', 'High Priority'];
  const EXT_MIME = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  const MAX_BYTES = 20 * 1024 * 1024;
  const VIEWS = [['inbox', 'Inbox'], ['outbox', 'Outbox'], ['compose', 'Compose'], ['drafts', 'Drafts'], ['pending', 'Pending Action'], ['forwarded', 'Forwarded'], ['archive', 'Archive'], ['tracking', 'Tracking']];
  const RSTATUS = { received: 'Received', acknowledged: 'Acknowledged', under_review: 'Under review', action_required: 'Action required', clarification_requested: 'Clarification requested', responded: 'Responded', completed: 'Completed' };
  const CSTATUS = { draft: 'Draft', sent: 'Dispatched', completed: 'Completed', archived: 'Archived' };
  const EVLABEL = { created: 'Created', dispatched: 'Dispatched', opened: 'Opened', acknowledged: 'Acknowledged receipt', under_review: 'Marked under review', action_required: 'Marked action required', clarification_requested: 'Requested clarification', response: 'Responded', forwarded: 'Forwarded', cc_added: 'Copied to additional recipients', completed: 'Marked completed', archived: 'Archived' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
  const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const today = () => new Date().toISOString().slice(0, 10);
  const daysTo = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);

  let H = null, db = null, me = null;
  const S = { view: 'inbox', rows: [], rcpt: {}, ev: {}, att: {}, notifs: [], dir: [], q: '', pri: 'all', sort: 'new', docket: 'all', status: 'all', year: 'all', limit: 20, loaded: false, draft: null, files: [], detailId: null };

  /* ---------- identity helpers (UI hints only; the database enforces the rules) ---------- */
  const mine = () => H.assignments || [];
  const myDockets = () => [...new Set(mine().map((a) => a.docket))];
  const myHeadDockets = () => [...new Set(mine().filter((a) => a.is_docket_head).map((a) => a.docket))];
  const oversight = () => !!H.canDelete;
  const sendDockets = () => {
    const set = new Set(mine().map((a) => a.docket));
    if (H.admin) set.add('Administration');
    return [...set];
  };
  const canCompose = () => sendDockets().length > 0;
  const senderIdentity = (docket) => {
    const a = mine().find((x) => x.docket === docket);
    return { name: a?.display_name || H.adminName || H.user.email, designation: a?.role_title || (H.admin ? 'Administrator' : 'Council official') };
  };
  const rowsFor = (id) => S.rcpt[id] || [];
  const isMineRow = (r) => r.user_id === me || (!r.user_id && myDockets().includes(r.docket));
  const myToRows = (c) => rowsFor(c.id).filter((r) => r.kind === 'to' && isMineRow(r));
  const isIncoming = (c) => c.status !== 'draft' && rowsFor(c.id).some(isMineRow);
  const isOutgoing = (c) => c.status !== 'draft' && (c.sender_user_id === me || myHeadDockets().includes(c.sender_docket));
  const isUnread = (c) => c.status !== 'draft' && rowsFor(c.id).some((r) => isMineRow(r) && !r.read_at);
  const needsAction = (c) => c.status === 'sent' && myToRows(c).some((r) => ['action_required', 'under_review', 'clarification_requested'].includes(r.status) || (c.response_deadline && !['responded', 'completed'].includes(r.status)));
  const awaitingResponse = (c) => c.status === 'sent' && isOutgoing(c) && rowsFor(c.id).some((r) => r.kind === 'to' && !['responded', 'completed'].includes(r.status));
  const isForwardedByMe = (c) => (S.ev[c.id] || []).some((e) => e.event_type === 'forwarded' && (e.actor_user_id === me || myDockets().includes(e.actor_docket)));
  const canForward = (c) => c.status === 'sent' && (oversight() || c.sender_user_id === me || myHeadDockets().includes(c.sender_docket) || rowsFor(c.id).some((r) => r.kind === 'to' && (r.user_id === me || (!r.user_id && myHeadDockets().includes(r.docket)))));
  const canArchive = (c) => ['sent', 'completed'].includes(c.status) && (oversight() || c.sender_user_id === me || myHeadDockets().includes(c.sender_docket)) && (c.status === 'completed' || oversight());
  const canAct = (c) => c.status === 'sent' && myToRows(c).length > 0;

  const VIEW_FILTER = {
    inbox: (c) => isIncoming(c) && c.status !== 'archived',
    outbox: (c) => isOutgoing(c) && c.status !== 'archived',
    drafts: (c) => c.status === 'draft',
    pending: (c) => needsAction(c) || awaitingResponse(c),
    forwarded: (c) => c.status !== 'draft' && isForwardedByMe(c),
    archive: (c) => c.status === 'archived',
    tracking: (c) => c.status !== 'draft',
  };

  /* ---------- data ---------- */
  async function load() {
    const q = (t, o = 'created_at') => db.from(t).select('*').order(o, { ascending: false }).limit(2000);
    const [c, r, e, a, n] = await Promise.all([db.from('correspondence').select('*').order('created_at', { ascending: false }).limit(1000), q('correspondence_recipients', 'added_at'), db.from('correspondence_events').select('*').order('created_at', { ascending: true }).limit(5000), q('correspondence_attachments'), db.from('correspondence_notifications').select('*').order('created_at', { ascending: false }).limit(60)]);
    const err = c.error || r.error || e.error || a.error || n.error;
    if (err) { note('Correspondence could not load: ' + err.message); return; }
    S.rows = c.data || [];
    const group = (list, key) => list.reduce((m, x) => ((m[x[key]] ||= []).push(x), m), {});
    S.rcpt = group(r.data || [], 'correspondence_id'); S.ev = group(e.data || [], 'correspondence_id'); S.att = group(a.data || [], 'correspondence_id');
    S.notifs = n.data || []; S.loaded = true;
    render(); renderOverview();
  }
  const note = (s, ok) => { const n = $('corr-note'); if (n) { n.textContent = s || ''; n.style.color = ok ? 'var(--green)' : ''; } };
  const rpc = async (name, args) => { const { data, error } = await db.rpc(name, args); if (error) throw new Error(error.message); return data; };

  /* ---------- list ---------- */
  const pill = (t, cls) => '<span class="pill ' + (cls || '') + '">' + esc(t) + '</span>';
  const priPill = (p) => (p === 'Normal' ? '' : pill(p, p === 'High Priority' ? 'p-high' : 'p-urgent'));
  const sortKey = (c) => c.dispatched_at || c.created_at;
  function visible() {
    const f = VIEW_FILTER[S.view] || (() => true), q = S.q.trim().toLowerCase();
    let list = S.rows.filter(f);
    if (S.pri !== 'all') list = list.filter((c) => c.priority === S.pri);
    if (S.docket !== 'all') list = list.filter((c) => c.sender_docket === S.docket || rowsFor(c.id).some((r) => r.docket === S.docket));
    if (S.status !== 'all') list = list.filter((c) => c.status === S.status || myToRows(c).some((r) => r.status === S.status));
    if (S.year !== 'all') list = list.filter((c) => (sortKey(c) || '').slice(0, 4) === S.year);
    if (q) list = list.filter((c) => [c.ref_no, c.subject, c.body, c.sender_docket, c.sender_name, ...rowsFor(c.id).map((r) => r.docket + ' ' + (r.recipient_name || ''))].join(' ').toLowerCase().includes(q));
    const by = { new: (a, b) => sortKey(b).localeCompare(sortKey(a)), old: (a, b) => sortKey(a).localeCompare(sortKey(b)), deadline: (a, b) => (a.response_deadline || '9999').localeCompare(b.response_deadline || '9999'), priority: (a, b) => PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority) };
    return list.sort(by[S.sort]);
  }
  function card(c) {
    const unread = isUnread(c), to = rowsFor(c.id).filter((r) => r.kind === 'to').map((r) => r.recipient_name || r.docket);
    const mineRow = myToRows(c)[0];
    const dl = c.response_deadline && c.status === 'sent' ? (() => { const d = daysTo(c.response_deadline); return '<span class="pill ' + (d < 0 ? 'p-urgent' : d <= 3 ? 'p-high' : '') + '">Due ' + esc(fmtDate(c.response_deadline)) + (d < 0 ? ' · overdue' : d === 0 ? ' · today' : '') + '</span>'; })() : '';
    return '<article class="corr-card' + (unread ? ' unread' : '') + '" tabindex="0" role="button" data-open="' + c.id + '">' +
      '<div class="corr-card-top"><span class="corr-ref">' + esc(c.ref_no || 'DRAFT') + '</span><span class="corr-date">' + esc(fmtDate(c.dispatched_at || c.created_at)) + '</span></div>' +
      '<h3>' + (unread ? '<i class="dot" aria-label="Unread"></i>' : '') + esc(c.subject || '(no subject)') + '</h3>' +
      '<p class="muted corr-line">' + esc(c.sender_docket) + ' → ' + esc(to.join(', ') || '—') + '</p>' +
      '<p class="corr-snippet">' + esc((c.body || '').replace(/\s+/g, ' ').slice(0, 140)) + '</p>' +
      '<div class="corr-tags">' + pill(c.comm_type) + priPill(c.priority) + pill(CSTATUS[c.status], 'st-' + c.status) + (mineRow ? pill('You: ' + RSTATUS[mineRow.status]) : '') + dl + '</div></article>';
  }
  function render() {
    const nav = $('corr-nav'); if (!nav) return;
    const counts = Object.fromEntries(Object.keys(VIEW_FILTER).map((k) => [k, S.rows.filter(VIEW_FILTER[k]).length]));
    const unread = S.rows.filter((c) => VIEW_FILTER.inbox(c) && isUnread(c)).length;
    nav.innerHTML = VIEWS.filter(([k]) => k !== 'compose' || canCompose()).map(([k, l]) => '<button type="button" class="' + (S.view === k ? 'active' : '') + '" data-corr-view="' + k + '">' + esc(l) + (k === 'inbox' && unread ? ' <b class="badge">' + unread + '</b>' : counts[k] ? ' <span class="count">' + counts[k] + '</span>' : '') + '</button>').join('');
    const list = $('corr-list');
    $('corr-tools').hidden = S.view === 'compose';
    const years = [...new Set(S.rows.map((c) => (sortKey(c) || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const fill = (id, first, opts, cur) => { const el = $(id); const html = '<option value="all">' + first + '</option>' + opts.map(([v, l]) => '<option value="' + esc(v) + '">' + esc(l) + '</option>').join(''); if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; } el.value = cur; };
    fill('corr-docket', 'All dockets', DOCKETS.concat(['Administration']).map((d) => [d, d]), S.docket); fill('corr-status', 'Any status', Object.entries(CSTATUS).filter(([k]) => k !== 'draft').concat(Object.entries(RSTATUS)).map(([k, v]) => [k, v]), S.status); fill('corr-year', 'All years', years.map((y) => [y, y]), S.year);
    if (S.view === 'compose') { list.innerHTML = '<div class="empty">Opening the letter composer…</div>'; return; }
    if (!S.loaded) { list.innerHTML = '<div class="empty">Loading correspondence…</div>'; return; }
    const rows = visible();
    const empty = { inbox: 'No incoming correspondence.', outbox: 'You have not sent any correspondence yet.', drafts: 'No saved drafts.', pending: 'Nothing is waiting for action.', forwarded: 'You have not forwarded any correspondence.', archive: 'No archived correspondence.', tracking: 'No correspondence to track.' }[S.view];
    const shown = rows.slice(0, S.limit); let lastMonth = '';
    const grouped = shown.map((c) => { const m = new Date(sortKey(c)).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' }); const h = m !== lastMonth ? '<h3 class="corr-month">' + esc(m) + '</h3>' : ''; lastMonth = m; return h + card(c); }).join('') + (rows.length > S.limit ? '<button type="button" class="secondary corr-more" id="corr-more">Show more (' + (rows.length - S.limit) + ' older)</button>' : '');
    $('corr-count').textContent = rows.length + (rows.length === 1 ? ' letter' : ' letters');
    list.innerHTML = rows.length ? grouped : '<div class="empty">' + esc(S.q || S.pri !== 'all' || S.docket !== 'all' || S.status !== 'all' || S.year !== 'all' ? 'Nothing matches your search or filter.' : empty) + '</div>';
    $('corr-scope').textContent = S.view === 'tracking' && oversight() ? 'Council-wide view: every dispatched letter, with its status and history.' : S.view === 'tracking' ? 'Status and history of the correspondence you can access.' : '';
  }

  /* ---------- overview (Council Hub dashboard) ---------- */
  function renderOverview() {
    const box = $('corr-overview'); if (!box || !S.loaded) return;
    const inbox = S.rows.filter(VIEW_FILTER.inbox).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    const outbox = S.rows.filter(VIEW_FILTER.outbox).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    const unread = inbox.filter(isUnread), act = S.rows.filter(needsAction), wait = S.rows.filter(awaitingResponse);
    const due = S.rows.filter((c) => c.status === 'sent' && c.response_deadline && (myToRows(c).some((r) => !['responded', 'completed'].includes(r.status)) || awaitingResponse(c))).sort((a, b) => a.response_deadline.localeCompare(b.response_deadline));
    const done = S.rows.filter((c) => ['completed', 'archived'].includes(c.status) && (isIncoming(c) || isOutgoing(c))).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    const unreadN = S.notifs.filter((n) => !n.read_at);
    const list = (arr, empty, extra) => arr.length ? '<ul class="corr-mini">' + arr.slice(0, 4).map((c) => '<li><button type="button" data-open="' + c.id + '"><b>' + esc(c.subject || '(no subject)') + '</b><span class="muted">' + esc(c.ref_no || '') + (extra ? ' · ' + esc(extra(c)) : '') + '</span></button></li>').join('') + '</ul>' : '<p class="muted">' + empty + '</p>';
    const stat = (n, l, v) => '<button type="button" class="corr-stat" data-corr-go="' + v + '"><b>' + n + '</b><span>' + l + '</span></button>';
    let council = '';
    if (oversight()) { const all = S.rows.filter((c) => c.status !== 'draft'), overdue = all.filter((c) => c.status === 'sent' && c.response_deadline && daysTo(c.response_deadline) < 0); council = '<p class="muted corr-council">Council-wide: ' + all.length + ' letters on record · ' + all.filter((c) => c.status === 'sent').length + ' in circulation · ' + overdue.length + ' past deadline · ' + all.filter((c) => c.status === 'completed').length + ' completed.</p>'; }
    box.innerHTML = '<div class="panel-head"><div><h2>Correspondence</h2><p class="muted" style="margin:2px 0 0">Official letters and memos between council dockets.</p></div><div class="toolbar">' + (canCompose() ? '<button type="button" class="btn" data-corr-go="compose">＋ New letter</button>' : '') + '<button type="button" class="secondary" data-corr-go="inbox">Open correspondence ↗</button></div></div>' + council +
      '<div class="corr-stats">' + stat(unread.length, 'Unread', 'inbox') + stat(act.length, 'Need action', 'pending') + stat(wait.length, 'Awaiting responses', 'pending') + stat(due.length, 'Upcoming deadlines', 'pending') + '</div>' +
      '<div class="grid corr-over-grid"><section><h3>Recent incoming</h3>' + list(inbox, 'No incoming correspondence.', (c) => c.sender_docket) + '</section><section><h3>Recent outgoing</h3>' + list(outbox, 'Nothing sent yet.', (c) => CSTATUS[c.status]) + '</section><section><h3>Requires action</h3>' + list(act, 'Nothing needs action.', (c) => c.response_deadline ? 'due ' + fmtDate(c.response_deadline) : '') + '</section>' +
      '<section><h3>Upcoming response deadlines</h3>' + list(due, 'No deadlines pending.', (c) => 'due ' + fmtDate(c.response_deadline)) + '</section><section><h3>Pending responses</h3>' + list(wait, 'No letters awaiting a reply.', (c) => c.response_deadline ? 'due ' + fmtDate(c.response_deadline) : 'no deadline') + '</section><section><h3>Recently completed</h3>' + list(done, 'None yet.', (c) => CSTATUS[c.status]) + '</section></div>' +
      '<section class="corr-notifs"><div class="panel-head" style="margin:14px 0 6px"><h3 style="margin:0">Notifications' + (unreadN.length ? ' <b class="badge">' + unreadN.length + '</b>' : '') + '</h3>' + (unreadN.length ? '<button type="button" class="secondary" id="corr-mark-all">Mark all read</button>' : '') + '</div>' +
      (S.notifs.length ? '<ul class="corr-mini notif">' + S.notifs.slice(0, 6).map((n) => '<li><button type="button" class="' + (n.read_at ? '' : 'unread') + '" data-notif="' + n.id + '" data-open="' + n.correspondence_id + '"><b>' + esc(n.message) + '</b><span class="muted">' + esc(fmtDateTime(n.created_at)) + '</span></button></li>').join('') + '</ul>' : '<p class="muted">No notifications yet.</p>') + '</section>';
  }

  /* ---------- storage ---------- */
  const cleanName = (n) => n.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100) || 'file';
  function checkFile(f) {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!EXT_MIME[ext]) return f.name + ': this file type is not allowed. Use PDF, Word, Excel, PowerPoint, text, JPG or PNG.';
    if (f.size > MAX_BYTES) return f.name + ': larger than 20 MB.';
    if (f.size < 1) return f.name + ': the file is empty.';
    return '';
  }
  async function uploadFiles(cid, files, eventId, setMsg) {
    let i = 0;
    for (const f of files) {
      i++; setMsg && setMsg('Uploading ' + i + ' of ' + files.length + ': ' + f.name + '…');
      const ext = (f.name.split('.').pop() || '').toLowerCase(), mime = EXT_MIME[ext], path = cid + '/' + crypto.randomUUID() + '-' + cleanName(f.name);
      const up = await db.storage.from(BUCKET).upload(path, f, { contentType: mime, upsert: false });
      if (up.error) throw new Error(f.name + ' could not be uploaded: ' + up.error.message);
      const ins = await db.from('correspondence_attachments').insert({ correspondence_id: cid, event_id: eventId || null, path, name: f.name.slice(0, 200), mime_type: mime, size_bytes: f.size, uploaded_by: me });
      if (ins.error) { await db.storage.from(BUCKET).remove([path]); throw new Error(f.name + ' could not be attached: ' + ins.error.message); }
    }
  }
  async function openFile(path, name, download) {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 300, download ? { download: name } : undefined);
    if (error || !data?.signedUrl) { note('Could not open the attachment: ' + (error?.message || 'no link returned')); return; }
    const a = document.createElement('a'); a.href = data.signedUrl; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- detail ---------- */
  const evAtts = (cid, evId) => (S.att[cid] || []).filter((a) => (evId ? a.event_id === evId : !a.event_id));
  const attList = (arr) => arr.length ? '<ul class="corr-atts">' + arr.map((a) => '<li><span><b>' + esc(a.name) + '</b> <span class="muted">' + esc(fmtSize(a.size_bytes)) + '</span></span><span class="actions"><button type="button" class="secondary" data-file-open="' + esc(a.path) + '" data-name="' + esc(a.name) + '">Open</button><button type="button" class="secondary" data-file-dl="' + esc(a.path) + '" data-name="' + esc(a.name) + '">Download</button></span></li>').join('') + '</ul>' : '';
  async function openDetail(id) {
    const c = S.rows.find((x) => x.id === id); if (!c) { note('That correspondence is no longer available.'); return; }
    if (c.status === 'draft') { openCompose(c); return; }
    S.detailId = id; renderDetail(c); const d = $('corr-detail'); if (!d.open) d.showModal();
    if (isUnread(c)) { try { await rpc('correspondence_act', { p_id: id, p_action: 'open' }); await load(); renderDetail(S.rows.find((x) => x.id === id)); } catch (e) { /* non-fatal */ } }
  }
  function renderDetail(c) {
    if (!c) return;
    const rc = rowsFor(c.id), to = rc.filter((r) => r.kind === 'to'), cc = rc.filter((r) => r.kind === 'cc');
    const who = (r) => '<li><span>' + esc(r.recipient_name ? r.recipient_name + ' — ' + (r.designation || r.docket) : r.docket) + (r.forwarded_from ? ' <span class="muted">(forwarded)</span>' : '') + '</span>' + (r.kind === 'to' ? pill(RSTATUS[r.status], 'st-' + r.status) : '') + '</li>';
    const events = (S.ev[c.id] || []).map((e) => '<li><i class="tl-dot ev-' + esc(e.event_type) + '"></i><div><b>' + esc(EVLABEL[e.event_type] || e.event_type) + '</b> <span class="muted">· ' + esc([e.actor_name, e.actor_designation && e.actor_designation + ', ' + e.actor_docket].filter(Boolean).join(' · ')) + '</span><div class="muted">' + esc(fmtDateTime(e.created_at)) + '</div>' + (e.body ? '<p class="tl-body">' + esc(e.body) + '</p>' : '') + (e.event_type === 'forwarded' || e.event_type === 'cc_added' ? '<div class="muted">' + esc([...(e.meta?.dockets || [])].join(', ')) + '</div>' : '') + attList(evAtts(c.id, e.id)) + '</div></li>').join('');
    const acts = [];
    if (canAct(c)) {
      acts.push(['acknowledge', 'Acknowledge receipt'], ['under_review', 'Mark under review'], ['action_required', 'Action required'], ['clarification', 'Request clarification'], ['respond', 'Respond officially'], ['complete', 'Mark completed']);
    }
    $('corr-detail-body').innerHTML =
      '<div class="corr-detail-head"><div><span class="corr-ref">' + esc(c.ref_no) + '</span><h2>' + esc(c.subject) + '</h2><div class="corr-tags">' + pill(c.comm_type) + priPill(c.priority) + pill(CSTATUS[c.status], 'st-' + c.status) + '</div></div></div>' +
      '<dl class="corr-meta"><div><dt>From</dt><dd>' + esc(c.sender_name) + '<br><span class="muted">' + esc(c.sender_designation + ' · ' + c.sender_docket) + '</span></dd></div><div><dt>Date</dt><dd>' + esc(fmtDate(c.letter_date)) + '</dd></div><div><dt>Dispatched</dt><dd>' + esc(fmtDateTime(c.dispatched_at)) + '</dd></div><div><dt>Response deadline</dt><dd>' + esc(c.response_deadline ? fmtDate(c.response_deadline) : 'None') + '</dd></div>' + (c.completed_at ? '<div><dt>Completed</dt><dd>' + esc(fmtDateTime(c.completed_at)) + '</dd></div>' : '') + (c.archived_at ? '<div><dt>Archived</dt><dd>' + esc(fmtDateTime(c.archived_at)) + '</dd></div>' : '') + '</dl>' +
      '<h4>To</h4><ul class="corr-who">' + (to.map(who).join('') || '<li class="muted">—</li>') + '</ul>' + (cc.length ? '<h4>Copy (CC)</h4><ul class="corr-who">' + cc.map(who).join('') + '</ul>' : '') +
      '<h4>Letter</h4><div class="corr-body">' + esc(c.body) + '</div>' + ((S.att[c.id] || []).some((a) => !a.event_id) ? '<h4>Attachments</h4>' + attList(evAtts(c.id, null)) : '') +
      '<div class="actions corr-actions"><button type="button" class="secondary" data-letter="' + c.id + '">Preview / print letter</button>' + (canForward(c) ? '<button type="button" class="secondary" data-forward="' + c.id + '">Forward / add CC</button>' : '') + (canArchive(c) ? '<button type="button" class="secondary" data-archive="' + c.id + '">Archive</button>' : '') + '</div>' +
      (acts.length ? '<h4>Your response</h4><div class="actions corr-actions">' + acts.map(([k, l]) => '<button type="button" class="' + (k === 'respond' ? 'btn' : 'secondary') + '" data-act="' + k + '" data-id="' + c.id + '">' + esc(l) + '</button>').join('') + '</div>' : '') +
      '<h4>History</h4><ol class="corr-timeline">' + (events || '<li class="muted">No history yet.</li>') + '</ol><p id="corr-detail-msg" class="msg" role="status"></p>';
  }

  /* ---------- actions ---------- */
  async function doAct(id, action) {
    const needsText = ['respond', 'clarification'].includes(action);
    const label = { acknowledge: 'Acknowledge receipt', under_review: 'Mark under review', action_required: 'Mark action required', clarification: 'Request clarification', respond: 'Official response', complete: 'Mark completed' }[action];
    openRespond(id, action, label, needsText);
  }
  function openRespond(id, action, label, needsText) {
    $('corr-respond-title').textContent = label; $('corr-respond-form').dataset.id = id; $('corr-respond-form').dataset.action = action;
    $('corr-respond-text').required = needsText; $('corr-respond-text').value = ''; $('corr-respond-files').value = ''; $('corr-respond-files').closest('label').hidden = !['respond', 'clarification'].includes(action);
    $('corr-respond-text').closest('label').firstChild.textContent = needsText ? 'Message *' : 'Note (optional)'; $('corr-respond-msg').textContent = '';
    $('corr-respond').showModal();
  }
  const mapNames = (list) => Object.fromEntries(list.map((x) => [x.value, x]));

  /* ---------- forward ---------- */
  function checks(name, items) { return '<div class="corr-checks">' + items.map((i) => '<label class="check"><input type="checkbox" name="' + name + '" value="' + esc(i.value) + '"> <span>' + esc(i.label) + '</span></label>').join('') + '</div>'; }
  const dirItems = () => S.dir.map((p) => ({ value: p.user_id, label: p.display_name + ' — ' + p.role_title + ' (' + p.docket + ')' }));
  function openForward(id) {
    const c = S.rows.find((x) => x.id === id); const have = new Set(rowsFor(id).map((r) => r.docket));
    $('corr-forward-form').dataset.id = id;
    $('corr-forward-dockets').innerHTML = checks('f_dockets', DOCKETS.filter((d) => d !== c.sender_docket && !have.has(d)).map((d) => ({ value: d, label: d })));
    $('corr-forward-users').innerHTML = checks('f_users', dirItems().filter((u) => u.value !== me));
    $('corr-forward-note').value = ''; $('corr-forward-msg').textContent = ''; $('corr-forward').showModal();
  }

  /* ---------- compose ---------- */
  function openCompose(draft) {
    if (!canCompose()) { note('Your role cannot send official correspondence.'); return; }
    S.draft = draft || null; S.files = [];
    const f = $('corr-compose-form'); f.reset();
    const docks = sendDockets(); f.docket.innerHTML = docks.map((d) => '<option>' + esc(d) + '</option>').join('');
    f.comm_type.innerHTML = TYPES.map((t) => '<option>' + esc(t) + '</option>').join(''); f.priority.innerHTML = PRIORITIES.map((t) => '<option>' + esc(t) + '</option>').join('');
    const toD = DOCKETS.map((d) => ({ value: d, label: d })), users = dirItems().filter((u) => u.value !== me);
    $('corr-to-dockets').innerHTML = checks('to_dockets', toD); $('corr-to-users').innerHTML = checks('to_users', users);
    $('corr-cc-dockets').innerHTML = checks('cc_dockets', toD); $('corr-cc-users').innerHTML = checks('cc_users', users);
    if (draft) {
      f.docket.value = draft.sender_docket; f.comm_type.value = draft.comm_type; f.priority.value = draft.priority; f.response_deadline.value = draft.response_deadline || ''; f.subject.value = draft.subject; f.body.value = draft.body;
      rowsFor(draft.id).forEach((r) => { const k = r.kind === 'cc' ? 'cc_' : 'to_'; const sel = r.user_id ? k + 'users' : k + 'dockets', v = r.user_id || r.docket; const el = [...f.querySelectorAll('input[name="' + sel + '"]')].find((x) => x.value === v); if (el) el.checked = true; });
    }
    $('corr-compose-title').textContent = draft ? 'Edit draft' : 'New official communication'; updateSender(); renderFileList(); $('corr-compose-msg').textContent = ''; $('corr-compose').showModal();
  }
  function updateSender() {
    const f = $('corr-compose-form'), id = senderIdentity(f.docket.value);
    $('corr-sender').textContent = id.name + ' — ' + id.designation + ', ' + f.docket.value + ' · ' + fmtDate(today());
  }
  function renderFileList() {
    const existing = S.draft ? (S.att[S.draft.id] || []) : [];
    $('corr-files-list').innerHTML = existing.map((a) => '<li><span><b>' + esc(a.name) + '</b> <span class="muted">' + esc(fmtSize(a.size_bytes)) + ' · saved</span></span><button type="button" class="secondary" data-rm-saved="' + a.id + '">Remove</button></li>').join('') + S.files.map((f, i) => '<li><span><b>' + esc(f.name) + '</b> <span class="muted">' + esc(fmtSize(f.size)) + ' · not yet uploaded</span></span><button type="button" class="secondary" data-rm-new="' + i + '">Remove</button></li>').join('');
  }
  function collect() {
    const f = $('corr-compose-form'), vals = (n) => [...f.querySelectorAll('input[name="' + n + '"]:checked')].map((x) => x.value);
    const sender = senderIdentity(f.docket.value);
    const rec = [];
    vals('to_dockets').forEach((d) => rec.push({ kind: 'to', docket: d })); vals('cc_dockets').forEach((d) => rec.push({ kind: 'cc', docket: d }));
    const byId = Object.fromEntries(S.dir.map((p) => [p.user_id, p]));
    vals('to_users').forEach((u) => byId[u] && rec.push({ kind: 'to', docket: byId[u].docket, user_id: u, designation: byId[u].role_title, recipient_name: byId[u].display_name }));
    vals('cc_users').forEach((u) => byId[u] && rec.push({ kind: 'cc', docket: byId[u].docket, user_id: u, designation: byId[u].role_title, recipient_name: byId[u].display_name }));
    return { fields: { sender_docket: f.docket.value, sender_name: sender.name.slice(0, 120), sender_designation: sender.designation.slice(0, 120), comm_type: f.comm_type.value, priority: f.priority.value, response_deadline: f.response_deadline.value || null, subject: f.subject.value.trim(), body: f.body.value.trim() }, rec };
  }
  async function saveDraft(setMsg) {
    const { fields, rec } = collect();
    let id = S.draft?.id;
    if (id) { const r = await db.from('correspondence').update(fields).eq('id', id).select('id'); if (r.error) throw new Error(r.error.message); if (!r.data?.length) throw new Error('This draft can no longer be edited.'); }
    else { const r = await db.from('correspondence').insert({ ...fields, sender_user_id: me, status: 'draft' }).select('*').single(); if (r.error) throw new Error(r.error.message); id = r.data.id; S.draft = r.data; }
    const del = await db.from('correspondence_recipients').delete().eq('correspondence_id', id); if (del.error) throw new Error(del.error.message);
    if (rec.length) { const ins = await db.from('correspondence_recipients').insert(rec.map((r) => ({ ...r, correspondence_id: id }))); if (ins.error) throw new Error(ins.error.message); }
    if (S.files.length) { await uploadFiles(id, S.files, null, setMsg); S.files = []; }
    return id;
  }
  function letterHtml(src) {
    const c = src, rc = src.rec || rowsFor(c.id), to = rc.filter((r) => r.kind === 'to'), cc = rc.filter((r) => r.kind === 'cc');
    const name = (r) => esc(r.recipient_name ? r.recipient_name + ', ' + (r.designation || '') + ' — ' + r.docket : 'The Head, ' + r.docket + ' Docket');
    const atts = src.atts || evAtts(c.id, null);
    return '<div class="sheet"><header class="lh"><img src="assets/logo.png" alt="Architecture Students Association logo" width="96" height="96"><b class="lh-name">ASA TUK</b></header><div class="lh-rule"></div><p class="lh-org">ASSOCIATION OF STUDENTS OF ARCHITECTURE</p>' +
      '<table class="lh-meta"><tr><td><b>Ref:</b> ' + esc(c.ref_no || 'Assigned on dispatch') + '</td><td style="text-align:right"><b>Date:</b> ' + esc(fmtDate(c.letter_date || today())) + '</td></tr></table>' +
      '<p><b>To:</b><br>' + (to.map(name).join('<br>') || '—') + '</p>' + (cc.length ? '<p><b>Copy:</b><br>' + cc.map(name).join('<br>') + '</p>' : '') +
      '<p class="subj">' + esc((c.subject || '').toUpperCase()) + '</p>' + (c.priority && c.priority !== 'Normal' ? '<p><b>Priority:</b> ' + esc(c.priority) + '</p>' : '') + (c.response_deadline ? '<p><b>Response requested by:</b> ' + esc(fmtDate(c.response_deadline)) + '</p>' : '') +
      '<div class="lbody">' + esc(c.body) + '</div><p class="sig">Yours faithfully,<br><br><b>' + esc(c.sender_name) + '</b><br>' + esc(c.sender_designation) + '<br>' + esc(c.sender_docket) + ' Docket, ASA TUK</p>' +
      (atts.length ? '<p><b>Attachments:</b></p><ol>' + atts.map((a) => '<li>' + esc(a.name) + '</li>').join('') + '</ol>' : '') + '</div>';
  }
  function showLetter(html) { $('corr-letter-body').innerHTML = html; const d = $('corr-letter'); if (!d.open) d.showModal(); }
  function printLetter() {
    const root = document.createElement('div'); root.id = 'corr-print-root'; root.innerHTML = $('corr-letter-body').innerHTML; document.body.appendChild(root); document.body.classList.add('corr-printing');
    const done = () => { document.body.classList.remove('corr-printing'); root.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); window.print(); setTimeout(() => root.isConnected && done(), 4000);
  }

  /* ---------- wiring ---------- */
  function setView(v) { S.view = v; S.limit = 20; if (v === 'compose') { openCompose(null); S.view = 'inbox'; } render(); }
  function goTab(v) { document.querySelector('[data-tab="correspondence"]')?.click(); document.getElementById('correspondence-panel')?.scrollIntoView({ block: 'start' }); setView(v); }
  function wire() {
    document.addEventListener('click', async (e) => {
      const t = e.target.closest('button,[data-open]'); if (!t) return;
      try {
        if (t.id === 'corr-more') { S.limit += 20; return render(); }
        if (t.dataset.corrView) return setView(t.dataset.corrView);
        if (t.dataset.corrGo) return goTab(t.dataset.corrGo);
        if (t.id === 'corr-mark-all') { await db.from('correspondence_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null).eq('user_id', me); return load(); }
        if (t.dataset.notif) { await db.from('correspondence_notifications').update({ read_at: new Date().toISOString() }).eq('id', t.dataset.notif); }
        if (t.dataset.open) { const id = t.dataset.open; if (!t.closest('#correspondence-panel')) goTab('inbox'); return openDetail(id); }
        if (t.dataset.fileOpen) return openFile(t.dataset.fileOpen, t.dataset.name, false);
        if (t.dataset.fileDl) return openFile(t.dataset.fileDl, t.dataset.name, true);
        if (t.dataset.act) return doAct(t.dataset.id, t.dataset.act);
        if (t.dataset.forward) return openForward(t.dataset.forward);
        if (t.dataset.letter) { const c = S.rows.find((x) => x.id === t.dataset.letter); return showLetter(letterHtml(c)); }
        if (t.dataset.archive) {
          const c = S.rows.find((x) => x.id === t.dataset.archive); if (!window.confirm('Archive ' + c.ref_no + '? It stays on record and can still be read by those with access.')) return;
          await rpc('correspondence_archive', { p_id: c.id }); await load(); renderDetail(S.rows.find((x) => x.id === c.id)); return note('Archived ' + c.ref_no + '.', true);
        }
        if (t.dataset.rmNew) { S.files.splice(+t.dataset.rmNew, 1); return renderFileList(); }
        if (t.dataset.rmSaved) {
          const a = (S.att[S.draft.id] || []).find((x) => x.id === t.dataset.rmSaved); const d = await db.from('correspondence_attachments').delete().eq('id', a.id); if (d.error) throw d.error;
          await db.storage.from(BUCKET).remove([a.path]); S.att[S.draft.id] = S.att[S.draft.id].filter((x) => x.id !== a.id); return renderFileList();
        }
      } catch (err) { note(err.message || 'Something went wrong.'); const m = $('corr-detail-msg'); if (m) m.textContent = err.message || ''; }
    });
    document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.corr-card')) { e.preventDefault(); openDetail(e.target.dataset.open); } });
    $('corr-q').oninput = (e) => { S.q = e.target.value; S.limit = 20; render(); };
    [['corr-docket', 'docket'], ['corr-status', 'status'], ['corr-year', 'year']].forEach(([id, k]) => ($(id).onchange = (e) => { S[k] = e.target.value; S.limit = 20; render(); }));
    $('corr-clear').onclick = () => { Object.assign(S, { q: '', pri: 'all', docket: 'all', status: 'all', year: 'all', limit: 20 }); $('corr-q').value = ''; $('corr-pri').value = 'all'; render(); };
    $('corr-pri').onchange = (e) => { S.pri = e.target.value; render(); };
    $('corr-sort').onchange = (e) => { S.sort = e.target.value; render(); };
    $('corr-compose-form').docket.onchange = updateSender;
    $('corr-files').onchange = (e) => { const bad = []; [...e.target.files].forEach((f) => { const m = checkFile(f); m ? bad.push(m) : S.files.push(f); }); e.target.value = ''; $('corr-compose-msg').textContent = bad.join('\n'); renderFileList(); };
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
    $('corr-print').onclick = printLetter;
    $('corr-save').onclick = async () => {
      const b = $('corr-save'), m = $('corr-compose-msg'); b.disabled = true; m.style.color = ''; m.textContent = 'Saving draft…';
      try { await saveDraft((s) => (m.textContent = s)); m.style.color = 'var(--green)'; m.textContent = 'Draft saved.'; await load(); renderFileList(); } catch (err) { m.textContent = err.message; } finally { b.disabled = false; }
    };
    $('corr-preview').onclick = () => { const { fields, rec } = collect(); const atts = (S.draft ? S.att[S.draft.id] || [] : []).concat(S.files.map((f) => ({ name: f.name }))); showLetter(letterHtml({ ...fields, rec, atts, ref_no: S.draft?.ref_no, letter_date: today() })); };
    $('corr-compose-form').onsubmit = async (e) => {
      e.preventDefault(); const b = $('corr-send'), m = $('corr-compose-msg'); const { fields, rec } = collect();
      if (!rec.some((r) => r.kind === 'to')) { m.textContent = 'Choose at least one recipient (a docket or an official).'; return; }
      if (!window.confirm('Send this as an official communication? Once dispatched it receives a reference number and cannot be edited or deleted.')) return;
      b.disabled = true; m.style.color = ''; m.textContent = 'Sending…';
      try { const id = await saveDraft((s) => (m.textContent = s)); const ref = await rpc('correspondence_dispatch', { p_id: id }); S.draft = null; $('corr-compose').close(); await load(); S.view = 'outbox'; render(); note('Dispatched as ' + ref + '.', true); }
      catch (err) { m.textContent = err.message; await load(); } finally { b.disabled = false; }
    };
    $('corr-respond-form').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, m = $('corr-respond-msg'), b = $('corr-respond-ok'), id = f.dataset.id, action = f.dataset.action;
      const files = [...$('corr-respond-files').files]; const bad = files.map(checkFile).filter(Boolean); if (bad.length) { m.textContent = bad.join('\n'); return; }
      b.disabled = true; m.textContent = 'Submitting…';
      try { const ev = await rpc('correspondence_act', { p_id: id, p_action: action, p_body: $('corr-respond-text').value.trim() || null }); if (files.length && ev) await uploadFiles(id, files, ev, (s) => (m.textContent = s)); $('corr-respond').close(); await load(); renderDetail(S.rows.find((x) => x.id === id)); note('Recorded in the correspondence history.', true); }
      catch (err) { m.textContent = err.message; await load(); } finally { b.disabled = false; }
    };
    $('corr-forward-form').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, m = $('corr-forward-msg'), id = f.dataset.id, vals = (n) => [...f.querySelectorAll('input[name="' + n + '"]:checked')].map((x) => x.value);
      const kind = f.querySelector('input[name="f_kind"]:checked').value; m.textContent = 'Sending…';
      try { await rpc('correspondence_forward', { p_id: id, p_dockets: vals('f_dockets'), p_users: vals('f_users'), p_kind: kind, p_note: $('corr-forward-note').value.trim() || null }); $('corr-forward').close(); await load(); renderDetail(S.rows.find((x) => x.id === id)); note(kind === 'to' ? 'Forwarded.' : 'Copy recipients added.', true); }
      catch (err) { m.textContent = err.message; }
    };
  }

  async function init(ctx) {
    if (H) return; H = ctx; db = H.db; me = H.user.id;
    wire(); render();
    try { const d = await db.rpc('correspondence_directory'); S.dir = d.data || []; } catch (e) { S.dir = []; }
    try { await db.rpc('correspondence_refresh_deadline_alerts'); } catch (e) { /* alerts are best-effort */ }
    await load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
  }
  window.ASATUKCorrespondence = { init };
  if (window.ASATUKHub) init(window.ASATUKHub); else window.addEventListener('asatuk-hub-ready', () => init(window.ASATUKHub), { once: true });
})();
