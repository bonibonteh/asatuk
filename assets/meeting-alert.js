(function(){'use strict';
function go(hub){if(!hub||!hub.db||!hub.user)return;var main=document.querySelector('#app main.wrap');if(!main)return;
 var since=new Date(Date.now()-2*3600*1000).toISOString();
 Promise.all([hub.db.from('council_meetings').select('id,title,starts_at,meeting_link,chapter,status').eq('status','scheduled').gte('starts_at',since).order('starts_at').limit(5),
  hub.db.from('connect_notifications').select('id,meeting_id').eq('user_id',hub.user.id).is('read_at',null)]).then(function(res){
  var ms=(res[0]&&res[0].data)||[];if(!ms.length)return;var unread={};((res[1]&&res[1].data)||[]).forEach(function(n){unread[n.meeting_id]=1});
  var old=document.getElementById('upcoming-meetings');if(old)old.remove();
  var s=document.createElement('section');s.id='upcoming-meetings';s.className='panel';s.style.cssText='background:#fff7e0;border:1px solid #f0d58a;padding:14px 18px';
  var h=document.createElement('h2');h.style.margin='0 0 8px';h.textContent='📅 Upcoming meetings';s.appendChild(h);
  ms.forEach(function(m){var r=document.createElement('div');r.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:8px 0;border-top:1px solid #f0d58a';
   var t=document.createElement('div');var b=document.createElement('b');b.textContent=m.title;t.appendChild(b);
   var d=document.createElement('div');d.className='muted';d.textContent=new Date(m.starts_at).toLocaleString([], {weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' · '+(m.chapter||'All chapters')+(unread[m.id]?' · NEW':'');t.appendChild(d);r.appendChild(t);
   var acts=document.createElement('div');if(m.meeting_link){var j=document.createElement('a');j.className='btn';j.href=m.meeting_link;j.target='_blank';j.rel='noopener';j.textContent='Join';acts.appendChild(j);acts.appendChild(document.createTextNode(' '))}
   var o=document.createElement('a');o.className='secondary';o.href='connect.html';o.textContent='Meeting room & minutes';o.style.cssText='display:inline-block;padding:8px 12px;border:1px solid #deddd5;border-radius:8px;background:#fff;color:inherit;text-decoration:none';acts.appendChild(o);r.appendChild(acts);s.appendChild(r)});
  var head=main.querySelector('.head');main.insertBefore(s,head?head.nextSibling:main.firstChild)})}
if(window.ASATUKHub)go(window.ASATUKHub);else window.addEventListener('asatuk-hub-ready',function(){go(window.ASATUKHub)},{once:true})})();
