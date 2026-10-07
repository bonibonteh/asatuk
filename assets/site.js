(function(){
var d=document,rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
/* mobile menu */
var nv=d.querySelector('nav'),mb=d.querySelector('.menu');
if(mb)mb.addEventListener('click',function(){var o=nv.classList.toggle('open');mb.setAttribute('aria-expanded',o)});
d.addEventListener('keydown',function(e){if(e.key==='Escape'&&nv&&nv.classList.contains('open')){nv.classList.remove('open');mb.setAttribute('aria-expanded','false')}});
/* scroll reveal */
if('IntersectionObserver' in window&&!rm){
var sel='.head,.cols>div,.ev li,.card,.about p,.post,.tile,.faq details,.form,.two>div,.ticks li,.ty>*,.sp-lead,.sp-facts,.sp-collage figure,.sp-trio figure';
var els=[].slice.call(d.querySelectorAll('main '+sel.split(',').join(',main ')));
var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
els.forEach(function(el,i){var sib=[].indexOf.call(el.parentNode.children,el);el.classList.add('rv');el.style.setProperty('--d',Math.min(sib,6)*.08+'s');io.observe(el)});
/* hero plan draws itself */
d.querySelectorAll('.plan *').forEach(function(el,i){el.setAttribute('pathLength','1');el.style.setProperty('--d',(i*.06)+'s')});
/* gentle parallax on the plan */
var p=d.querySelector('.plan');
if(p&&!matchMedia("(max-width:860px)").matches){var t=false;addEventListener('scroll',function(){if(t)return;t=true;requestAnimationFrame(function(){p.style.transform='translateY('+Math.min(scrollY,700)*.18+'px)';t=false})},{passive:true})}
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
/* v2: energy upgrade */
(function(){
var d=document,fine=matchMedia('(hover:hover) and (pointer:fine)').matches,rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
d.querySelectorAll('.navbar li').forEach(function(l,i){l.style.setProperty('--i',i)});
d.querySelectorAll('.ev li>b:first-child').forEach(function(b){if(/TBC/i.test(b.textContent))b.classList.add('tbc')});
if(rm)return;
var pg=d.createElement('div');pg.className='pg';pg.setAttribute('aria-hidden','true');d.body.appendChild(pg);
var tk=false;function up(){tk=false;var h=d.documentElement.scrollHeight-innerHeight;pg.style.transform='scaleX('+(h>0?Math.min(scrollY/h,1):0)+')'}
addEventListener('scroll',function(){if(!tk){tk=true;requestAnimationFrame(up)}},{passive:true});up();
var hero=d.querySelector('.hero');
if(hero){
var hb=hero.querySelector('.hero-body');
if(hb){var s=d.createElement('a');s.className='scroll';s.href='#main';s.innerHTML='<i aria-hidden="true"></i>Scroll';hb.appendChild(s)}
if(fine){var r=0;
hero.addEventListener('pointermove',function(e){if(r)return;r=requestAnimationFrame(function(){r=0;var b=hero.getBoundingClientRect();hero.style.setProperty('--sx',e.clientX-b.left+'px');hero.style.setProperty('--sy',e.clientY-b.top+'px');hero.classList.add('lit')})});
hero.addEventListener('pointerleave',function(){hero.classList.remove('lit')})}}
if(fine)d.querySelectorAll('.btn').forEach(function(b){
b.addEventListener('pointermove',function(e){var r=b.getBoundingClientRect();b.style.setProperty('--tx',((e.clientX-r.left)/r.width-.5)*10+'px');b.style.setProperty('--ty',((e.clientY-r.top)/r.height-.5)*8+'px')});
b.addEventListener('pointerleave',function(){b.style.removeProperty('--tx');b.style.removeProperty('--ty')})});
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
