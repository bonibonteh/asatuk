(function(){'use strict';
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var view=document.getElementById('ew-view');if(!view)return;
var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.08,rootMargin:'0px 0px -40px 0px'}):null;
function count(el){var n=parseFloat(el.dataset.n);if(isNaN(n)||reduce||n===0)return;var t0=performance.now(),d=900;(function f(t){var p=Math.min(1,(t-t0)/d),e=1-Math.pow(1-p,3);el.textContent=Math.round(n*e);if(p<1)requestAnimationFrame(f)})(t0)}
function enhance(){
 view.querySelectorAll('[data-n]').forEach(count);
 var i=0;view.querySelectorAll('.ew-box,.ew-item,.ew-ev,.pc-card').forEach(function(el){if(el.dataset.rv)return;el.dataset.rv=1;if(reduce||!io)return;el.classList.add('pc-rv');el.style.setProperty('--rd',String((i++)%6));io.observe(el)});
 view.querySelectorAll('[data-px]').forEach(function(s){if(s.dataset.pxOn)return;s.dataset.pxOn=1;s.addEventListener('pointermove',function(e){var r=s.getBoundingClientRect();s.style.setProperty('--mx',((e.clientX-r.left)/r.width-.5).toFixed(3));s.style.setProperty('--my',((e.clientY-r.top)/r.height-.5).toFixed(3))})});
 view.querySelectorAll('.pc-tile').forEach(function(t){if(t.dataset.tilt)return;t.dataset.tilt=1;t.addEventListener('pointermove',function(e){if(reduce)return;var r=t.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;t.style.setProperty('--rx',((x-.5)*8).toFixed(2));t.style.setProperty('--ry',((.5-y)*8).toFixed(2));t.style.setProperty('--gx',(x*100)+'%');t.style.setProperty('--gy',(y*100)+'%')});t.addEventListener('pointerleave',function(){t.style.setProperty('--rx',0);t.style.setProperty('--ry',0)})});
}
var last=0;new MutationObserver(function(){
 var now=Date.now();enhance();
 if(now-last>350&&!reduce){view.classList.remove('pc-in');void view.offsetWidth;view.classList.add('pc-in')}last=now;
}).observe(view,{childList:true});
/* bento tile expands into a full-screen scene, then the section opens */
document.addEventListener('click',function(e){
 var t=e.target.closest&&e.target.closest('.pc-tile');if(!t||reduce||t.dataset.go)return;
 e.stopImmediatePropagation();e.preventDefault();
 var r=t.getBoundingClientRect(),cs=getComputedStyle(t),o=document.createElement('div');o.className='pc-expand';
 o.style.cssText+='left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;border-radius:24px;background:'+cs.backgroundImage+',linear-gradient(0,'+cs.backgroundColor+','+cs.backgroundColor+')';
 document.body.appendChild(o);
 var a=o.animate([{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:'24px'},{left:'0px',top:'0px',width:innerWidth+'px',height:innerHeight+'px',borderRadius:'0px'}],{duration:480,easing:'cubic-bezier(.7,0,.2,1)',fill:'forwards'});
 var done=false,fin=function(){if(done)return;done=true;t.dataset.go=1;t.click();delete t.dataset.go;setTimeout(function(){var b=o.animate([{opacity:1},{opacity:0}],{duration:420,easing:'ease-out',fill:'forwards'});b.onfinish=function(){o.remove()}},260)};
 a.onfinish=fin;setTimeout(fin,900)},true);
})();
