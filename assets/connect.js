(function(){'use strict';
const $=id=>document.getElementById(id),cfg=window.ASATUK_SUPABASE;
if(!window.supabase||!cfg||!window.ASATUKAuth){$('login-msg').textContent='Configuration failed to load. Refresh.';return}
const db=window.ASATUKAuth.getClient(cfg);let user=null,isSG=false,meetings=[],cur=null;
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const say=(m,bad)=>{$('notice').textContent=m||'';$('notice').style.color=bad?'#b91c1c':'#166534'};
const rpc=async(n,a)=>{const r=await db.rpc(n,a);if(r.error)throw r.error;return r.data};
const mmss=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const DOCKETS=['Executive','Secretariat','Events','Academic','PR & Communications','Merchandise','Treasury','Organizing'];
function setTab(t){document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));document.querySelectorAll('.tab').forEach(x=>x.hidden=x.id!=='t-'+t);if(t==='health')health();else if(cur)render(t)}
async function loadMeetings(){const r=await db.from('council_meetings').select('id,title,starts_at,status,meeting_link,chapter').order('starts_at',{ascending:false}).limit(50);
 if(r.error){say('Could not load meetings: '+r.error.message,1);return}meetings=r.data||[];
 $('meetings').innerHTML=meetings.map(m=>'<li><button data-id="'+m.id+'" class="'+(cur&&cur.id===m.id?'on':'')+'"><b>'+esc(m.title)+'</b><br><small>'+new Date(m.starts_at).toLocaleString()+' · '+esc(m.status)+'</small></button></li>').join('')||'<li>No meetings yet. Schedule one in the Council Hub.</li>';
 $('meetings').querySelectorAll('button').forEach(b=>b.onclick=()=>{cur=meetings.find(m=>m.id===b.dataset.id);loadMeetings();render(document.querySelector('#tabs .on').dataset.t)})}
async function render(t){if(!cur){document.getElementById('t-'+t).innerHTML='<p class="box">Pick a meeting.</p>';return}
 try{if(t==='room')await room();else if(t==='transcript')await transcript();else if(t==='minutes')await minutes()}catch(e){say(e.message||String(e),1)}}
async function room(){const p=await db.from('connect_participants').select('*').eq('meeting_id',cur.id);if(p.error)throw p.error;const mine=(p.data||[]).find(x=>x.user_id===user.id);
 $('t-room').innerHTML='<div class="box"><h3>'+esc(cur.title)+'</h3><p>Live video conferencing (LiveKit) is <span class="pill warn">not connected</span> until server credentials are added and the <code>connect-livekit-token</code> function is deployed. Until then use the existing meeting link: '+(cur.meeting_link?'<a href="'+esc(cur.meeting_link)+'" target="_blank" rel="noopener">open link</a>':'none set')+'.</p></div>'+
 '<div class="box"><h3>Recording &amp; transcription consent</h3><p>Your consent: <span class="pill '+(mine?mine.consent==='granted'?'ok':'err':'warn')+'">'+(mine?mine.consent:'not recorded')+'</span></p><p>Nobody is recorded unless every participant has granted consent. A visible “● Recording” indicator is shown whenever a recording is active.</p><button id="c-yes">I consent</button> <button id="c-no" class="ghost">I decline</button></div>'+
 '<div class="box"><h3>Participants</h3>'+((p.data||[]).map(x=>'<div>'+esc(x.display_name||x.user_id.slice(0,8))+' <span class="pill '+(x.consent==='granted'?'ok':x.consent==='declined'?'err':'warn')+'">'+x.consent+'</span></div>').join('')||'<p>No consent responses yet.</p>')+'</div>';
 $('c-yes').onclick=()=>act(()=>rpc('connect_set_consent',{p_meeting:cur.id,p_consent:'granted'}),'Consent recorded.',room);$('c-no').onclick=()=>act(()=>rpc('connect_set_consent',{p_meeting:cur.id,p_consent:'declined'}),'Decline recorded.',room)}
async function act(fn,ok,after){try{await fn();say(ok);if(after)await after()}catch(e){say(e.message||String(e),1)}}
async function transcript(){const r=await db.from('connect_transcript_segments').select('*').eq('meeting_id',cur.id).order('start_ms');if(r.error)throw r.error;
 const j=await db.from('connect_jobs').select('*').eq('meeting_id',cur.id).order('created_at',{ascending:false}).limit(10);
 $('t-transcript').innerHTML='<div class="box"><h3>Add transcript segment</h3><p><small>Segments are typed in by the minute-taker.</small></p><div class="row"><label>Speaker<input id="s-who"></label><label>Start (mm:ss)<input id="s-at" value="0:00"></label></div><label>Text<textarea id="s-txt" rows="2"></textarea></label><button id="s-add">Add segment</button></div>'+
 '<div class="box"><h3>Transcript ('+(r.data||[]).length+' segments)</h3>'+((r.data||[]).map(s=>'<div class="seg"><small>'+mmss(s.start_ms)+' · <b>'+esc(s.speaker_name)+'</b> · '+esc(s.source)+(s.edited?' · edited':'')+'</small><div>'+esc(s.text)+'</div><button class="ghost" data-e="'+s.id+'">Correct</button></div>').join('')||'<p>No transcript yet.</p>')+'</div>'+
 '<div class="box"><h3>Processing jobs</h3>'+((j.data||[]).map(x=>'<div>'+x.kind+' <span class="pill '+(x.status==='failed'?'err':x.status==='succeeded'?'ok':'warn')+'">'+x.status+'</span> attempts '+x.attempts+'/'+x.max_attempts+(x.error?' — '+esc(x.error):'')+(x.status==='failed'&&x.attempts<x.max_attempts?' <button class="ghost" data-r="'+x.id+'">Retry</button>':'')+'</div>').join('')||'<p>None.</p>')+'</div>';
 $('s-add').onclick=()=>{const m=/^(\d+):(\d{1,2})$/.exec($('s-at').value.trim());if(!m){say('Time must look like 1:30',1);return}
  act(()=>rpc('connect_add_segment',{p_meeting:cur.id,p_speaker:$('s-who').value,p_speaker_user:null,p_start:(+m[1]*60+ +m[2])*1000,p_end:null,p_text:$('s-txt').value,p_source:'manual'}),'Segment added.',transcript)};
 document.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>{const s=r.data.find(x=>x.id===b.dataset.e),t=prompt('Correct this text:',s.text);if(t!=null)act(()=>rpc('connect_edit_segment',{p_id:s.id,p_text:t,p_speaker:null}),'Correction saved (original kept).',transcript)});
 document.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>act(()=>rpc('connect_retry_job',{p_job:b.dataset.r}),'Job queued for retry.',transcript))}
async function minutes(){const [o,a]=await Promise.all([db.from('connect_ai_outputs').select('*').eq('meeting_id',cur.id).order('version',{ascending:false}),db.from('connect_action_points').select('*').eq('meeting_id',cur.id).order('created_at')]);
 if(o.error)throw o.error;if(a.error)throw a.error;
 const pill=s=>'<span class="pill '+(s==='approved'?'ok':s==='rejected'?'err':'warn')+'">'+s+'</span>';
 $('t-minutes').innerHTML=(isSG?'<div class="box"><h3>New minutes draft</h3><label>Summary<textarea id="d-sum" rows="4"></textarea></label><label>Action point (optional)<input id="d-act" placeholder="e.g. Book the venue"></label><div class="row"><label>Docket<select id="d-dk">'+DOCKETS.map(d=>'<option>'+d+'</option>').join('')+'</select></label><label>Due<input id="d-due" type="date"></label></div><button id="d-save">Save draft</button></div>':'<p class="box">Only the Secretary General can approve minutes and action points.</p>')+
 '<div class="box"><h3>Minutes versions</h3>'+((o.data||[]).map(x=>'<div class="seg"><b>v'+x.version+'</b> '+pill(x.status)+' <small>'+'manual'+'</small><div>'+esc(x.summary)+'</div>'+(isSG&&x.status==='draft'?'<button data-ap="'+x.id+'">Approve into official archive</button> <button class="bad" data-rj="'+x.id+'">Reject</button>':'')+'</div>').join('')||'<p>No drafts yet.</p>')+'<p><small>Drafts are never official until approved.</small></p></div>'+
 '<div class="box"><h3>Action points</h3>'+((a.data||[]).map(x=>'<div class="seg"><b>'+esc(x.title)+'</b> '+pill(x.status)+'<br><small>'+esc(x.docket)+(x.due_date?' · due '+x.due_date:'')+(x.task_id?' · task created':'')+'</small>'+(isSG&&x.status==='proposed'?'<br><button data-aa="'+x.id+'">Approve &amp; create task</button>':'')+'</div>').join('')||'<p>None.</p>')+'</div>';
 if(isSG){$('d-save').onclick=()=>{const t=$('d-act').value.trim();act(()=>rpc('connect_save_draft',{p_meeting:cur.id,p_summary:$('d-sum').value,p_decisions:[],p_actions:t?[{title:t,docket:$('d-dk').value,due_date:$('d-due').value}]:[],p_model:null}),'Draft saved.',minutes)};
 document.querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>act(()=>rpc('connect_approve_minutes',{p_output:b.dataset.ap}),'Minutes approved and archived.',minutes));
 document.querySelectorAll('[data-rj]').forEach(b=>b.onclick=()=>act(()=>rpc('connect_reject_draft',{p_output:b.dataset.rj}),'Draft rejected.',minutes));
 document.querySelectorAll('[data-aa]').forEach(b=>b.onclick=()=>act(()=>rpc('connect_approve_action',{p_id:b.dataset.aa}),'Approved; task created once and assignee notified.',minutes))}}
async function health(){const el=$('t-health');el.innerHTML='<p class="box">Checking…</p>';
 let h;try{h=await rpc('connect_health')}catch(e){el.innerHTML='<p class="box">Database check failed: '+esc(e.message)+'. Supabase may be unreachable or your session expired.</p>';return}
 const st=(n,s,fix)=>'<div class="box"><b>'+n+'</b> <span class="pill '+(s==='ok'?'ok':s==='untested'?'warn':'err')+'">'+s+'</span><p><small>'+fix+'</small></p></div>';
 el.innerHTML=st('Supabase database','ok','Reachable; checked '+new Date(h.checked_at).toLocaleTimeString())+
 st('LiveKit','untested','Not verified. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET as Supabase secrets and deploy connect-livekit-token (see supabase/functions/README.md).')+
 '<div class="box"><h3>Counts</h3><p>Pending jobs: <b>'+h.pending_jobs+'</b> · Failed jobs: <b>'+h.failed_jobs+'</b> · Failed recordings: <b>'+h.failed_recordings+'</b> · Notification failures: <b>'+h.failed_notifications+'</b></p><p><small>Failed job → open the meeting’s Transcript tab and press Retry (max 3). Failed recording → record again after every participant consents; the meeting itself is never lost.</small></p></div>'+
 '<div class="box"><h3>Recent errors</h3>'+((h.recent_errors||[]).map(e=>'<div class="seg"><small>'+new Date(e.created_at).toLocaleString()+' · '+esc(e.service)+'</small><div>'+esc(e.message)+'</div></div>').join('')||'<p>No errors recorded.</p>')+'</div>'}
async function start(u){user=u;try{
 const [a,c]=await Promise.all([db.from('admin_users').select('role,is_suspended').eq('user_id',u.id).maybeSingle(),db.from('council_role_assignments').select('docket,role_title,is_docket_head,display_name').eq('user_id',u.id).eq('is_active',true)]);
 const adm=!!(a.data&&a.data.role==='admin'&&!a.data.is_suspended),as=c.data||[];
 if(!adm&&!as.length){$('login-msg').textContent='This account has no council role.';return}
 isSG=adm||as.some(x=>x.docket==='Secretariat'&&(x.is_docket_head||/secretary/i.test(x.role_title)));
 $('who').textContent=(as[0]&&as[0].display_name)||u.email;$('health-tab').hidden=!isSG;$('login').hidden=true;$('app').hidden=false;await loadMeetings();render('room')}catch(e){$('login-msg').textContent='Could not load: '+(e.message||e)}}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>setTab(b.dataset.t));
$('signout').onclick=async()=>{await window.ASATUKAuth.signOut(db);location.reload()};
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-msg').textContent='Signing in…';const r=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(r.error){$('login-msg').textContent=r.error.message;return}start(r.data.user)});
db.auth.getSession().then(({data})=>{if(data&&data.session)start(data.session.user)});
})();
