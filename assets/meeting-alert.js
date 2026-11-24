(function(){'use strict';
function go(hub){if(!hub||!hub.db||!hub.user)return;
 hub.db.from('connect_notifications').select('id,message').eq('user_id',hub.user.id).is('read_at',null).order('created_at',{ascending:false}).limit(5).then(function(r){var d=(r&&r.data)||[];if(!d.length)return;
  var main=document.querySelector('#app main.wrap');if(!main)return;var b=document.createElement('section');b.className='panel';b.style.cssText='background:#fff7e0;border:1px solid #f0d58a;padding:14px 18px';
  var t=document.createElement('b');t.textContent='📅 You have '+d.length+' meeting'+(d.length>1?'s':'')+' to attend';b.appendChild(t);
  d.forEach(function(x){var p=document.createElement('div');p.textContent=x.message;b.appendChild(p)});
  var a=document.createElement('a');a.href='connect.html';a.textContent='Open meeting room →';a.style.display='inline-block';a.style.marginTop='6px';b.appendChild(a);main.insertBefore(b,main.firstChild.nextSibling)})}
if(window.ASATUKHub)go(window.ASATUKHub);else window.addEventListener('asatuk-hub-ready',function(){go(window.ASATUKHub)},{once:true})})();
