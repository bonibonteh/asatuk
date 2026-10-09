(function(){
var d=document,rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
/* mobile menu: slides and fades open and closed (height is measured, so it never jumps) */
var nv=d.querySelector('nav'),mb=d.querySelector('.menu'),nb=d.querySelector('.navbar'),mq=matchMedia('(max-width:1240px)');
function openMenu(){
nv.style.setProperty('--nh',nb.scrollHeight+28+'px');
nv.classList.add('open');mb.setAttribute('aria-expanded','true');
if(rm){nv.classList.add('settled')}else{setTimeout(function(){if(nv.classList.contains('open'))nv.classList.add('settled')},560)}
}
function closeMenu(){
if(nv.classList.contains('settled')){nv.style.setProperty('--nh',nb.offsetHeight+'px');nv.classList.remove('settled');void nb.offsetHeight}
nv.classList.remove('open');mb.setAttribute('aria-expanded','false');
}
if(mb&&nv&&nb){
mb.addEventListener('click',function(){nv.classList.contains('open')?closeMenu():openMenu()});
d.addEventListener('keydown',function(e){if(e.key==='Escape'&&nv.classList.contains('open')){closeMenu();mb.focus()}});
(mq.addEventListener?mq.addEventListener.bind(mq,'change'):mq.addListener.bind(mq))(function(){if(!mq.matches){nv.classList.remove('open','settled');mb.setAttribute('aria-expanded','false')}});
}
/* forms: send to Formspree (emails the committee); fall back to mailto */
d.querySelectorAll('form[data-next]').forEach(function(f){
var msg=f.querySelector('.form-msg'),btn=f.querySelector('button[type=submit]');
function show(t,err){msg.hidden=false;msg.className='form-msg'+(err?' error':'');msg.innerHTML=t;msg.scrollIntoView({block:'nearest',behavior:'smooth'})}
f.addEventListener('submit',function(e){
e.preventDefault();
if(f.dataset.busy==='1')return;
var fd=new FormData(f);
f.dataset.busy='1';btn.disabled=true;var label=btn.textContent;btn.textContent='Sending...';
fetch(f.action,{method:'POST',body:fd,headers:{'Accept':'application/json'}})
.then(function(r){return r.json().catch(function(){return {}}).then(function(j){
/* only treat as success when Formspree confirms it saved the submission */
if(!r.ok||j.error||j.errors)throw 0;
var next=f.dataset.next;
if(f.dataset.passName!==undefined)next+='?ok=1&n='+encodeURIComponent((f.elements.name.value||'').trim());
location.href=next})})
.catch(function(){f.dataset.busy='0';
var to=f.dataset.mailto,subj=(f.dataset.prefix||'')+(f.elements[f.dataset.subject]?f.elements[f.dataset.subject].value:'')+' - '+f.elements.name.value;
var lines=[];fd.forEach(function(v,k){if(k[0]!=='_'&&k!=='form')lines.push(k+': '+v)});
var href='mailto:'+to+'?subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(lines.join('\n'));
show((f.dataset.errmsg||'We could not send this automatically.')+' Please check your connection and press the button to try again, or <a href="'+href+'">send it by email instead</a>.',true);
btn.disabled=false;btn.textContent=label;});
});});
/* gallery lightbox */
var g=d.querySelector('.gallery');
if(g){var lb=d.createElement('div');lb.className='lb';lb.setAttribute('role','dialog');lb.setAttribute('aria-label','Photo');lb.innerHTML='<div></div>';d.body.appendChild(lb);
g.addEventListener('click',function(e){var t=e.target.closest('.tile');if(!t)return;var c=t.querySelector('img,.ph-img').cloneNode(true);lb.firstChild.innerHTML='';lb.firstChild.appendChild(c);var p=d.createElement('p');p.textContent=t.querySelector('figcaption').textContent;lb.firstChild.appendChild(p);lb.classList.add('open')});
lb.addEventListener('click',function(){lb.classList.remove('open')});
d.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('open')});}
})();
/* small helpers: stagger index for the mobile menu, TBC chip on events */
(function(){
var d=document;
d.querySelectorAll('.navbar li').forEach(function(l,i){l.style.setProperty('--i',i)});
d.querySelectorAll('.ev li>b:first-child').forEach(function(b){if(/TBC/i.test(b.textContent))b.classList.add('tbc')});
})();
/* social links: edit here. An empty URL shows the name as plain text until you add the link. */
(function(){
var S=[['Instagram','@asa_tuk','https://www.instagram.com/asa_tuk/'],['Facebook','ASA TUK',''],['TikTok','@asa_tuk','https://www.tiktok.com/@asa_tuk'],['LinkedIn','ASA TUK',''],['X','@asa_tuk','https://x.com/asa_tuk'],['YouTube','ASA TUK',''],['WhatsApp','','']];
function build(cls,withHandle){
var w=document.createElement('div');w.className='soc '+cls;
var l=document.createElement('b');l.textContent='Follow us';w.appendChild(l);
S.forEach(function(s){
var t=s[0]+(withHandle&&s[1]?' '+s[1]:'');
var e;
if(s[2]){e=document.createElement('a');e.href=s[2];e.target='_blank';e.rel='noopener noreferrer';e.setAttribute('aria-label',s[0]+(s[1]?', '+s[1]:'')+' (opens in a new tab)')}
else e=document.createElement('span');
e.textContent=t;w.appendChild(e)});
return w}
var f=document.querySelector('footer .wrap');if(f)f.appendChild(build('',false));
var c=document.querySelector('#cf');
if(c){var col=c.parentNode.firstElementChild;if(col)col.appendChild(build('soc-c',true))}
})();
