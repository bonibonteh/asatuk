(function(){'use strict';
var cfg=window.ASATUK_SUPABASE;if(!window.supabase||!cfg||!window.ASATUKAuth)return;
var db=window.ASATUKAuth.getClient(cfg),busy=false;
function render(user){var host=document.getElementById('metrics');if(!host||busy)return;busy=true;
 var since=new Date(Date.now()-2*3600*1000).toISOString();
 Promise.all([db.from('council_meetings').select('id,title,starts_at,meeting_link,chapter').eq('status','scheduled').gte('starts_at',since).order('starts_at').limit(5),
  db.from('connect_notifications').select('meeting_id').eq('user_id',user.id).is('read_at',null)]).then(function(res){
  busy=false;var ms=(res[0]&&res[0].data)||[],un={};((res[1]&&res[1].data)||[]).forEach(function(n){un[n.meeting_id]=1});
  var sigNow=JSON.stringify([ms,un]),old=document.getElementById('upcoming-meetings');if(old&&old.dataset.sig===sigNow)return;
  var s=document.createElement('section');s.id='upcoming-meetings';s.dataset.sig=sigNow;s.style.cssText='background:#fff7e0;border:1px solid #f0d58a;border-radius:18px;padding:16px 20px;margin:0 0 18px';
  var h=document.createElement('h2');h.style.cssText='margin:0 0 6px;font-size:20px';h.textContent='📅 Upcoming meetings';s.appendChild(h);
  if(!ms.length){var e=document.createElement('p');e.style.margin='4px 0';e.textContent='No meetings scheduled yet.';s.appendChild(e)}
  ms.forEach(function(m){var r=document.createElement('div');r.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid #f0d58a';
   var t=document.createElement('div'),b=document.createElement('b');b.textContent=m.title;t.appendChild(b);
   var d=document.createElement('div');d.style.cssText='color:#72736c;font-size:14px';d.textContent=new Date(m.starts_at).toLocaleString([],{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' · '+(m.chapter||'All chapters')+(un[m.id]?' · NEW':'');t.appendChild(d);r.appendChild(t);
   var a=document.createElement('div');a.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
   if(m.meeting_link){var j=document.createElement('a');j.href=m.meeting_link;j.target='_blank';j.rel='noopener';j.textContent='Join';j.style.cssText='padding:8px 14px;border-radius:10px;background:#a73a2e;color:#fff;text-decoration:none;font-weight:600';a.appendChild(j)}
   var o=document.createElement('a');o.href='connect.html';o.textContent='Meeting room & minutes';o.style.cssText='padding:8px 14px;border-radius:10px;border:1px solid #deddd5;background:#fff;color:inherit;text-decoration:none;font-weight:600';a.appendChild(o);r.appendChild(a);s.appendChild(r)});
  if(old)old.replaceWith(s);else host.parentNode.insertBefore(s,host)}).catch(function(){busy=false})}
var dash=document.getElementById('dashboard');
function whenShown(){if(!dash||dash.hidden)return;db.auth.getSession().then(function(r){if(r.data&&r.data.session)render(r.data.session.user)})}
if(dash){if(typeof MutationObserver==='function')new MutationObserver(function(){whenShown()}).observe(dash,{attributes:true,attributeFilter:['hidden']});
 whenShown();setInterval(function(){if(!document.hidden)whenShown()},120000)}
})();
