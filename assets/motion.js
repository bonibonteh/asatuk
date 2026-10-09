/* ASA TUK motion. Restrained on purpose: a fade and small rise for text, a clip reveal for images,
   gentle parallax on a few large images (wide mouse-driven screens only) and a count-up for statistics.
   Nothing loops. Visitors who prefer reduced motion get the finished page and none of this runs. */
(function(){
var d=document,rm=matchMedia('(prefers-reduced-motion:reduce)').matches;
if(rm||!('IntersectionObserver' in window))return;
var main=d.querySelector('main');if(!main)return;

/* 1. reveals: text rises in, image frames wipe open */
var sel='.head,.cols>div,.stats>div,.ev li,.card,.about p,.post,.tile,.faq details,.form,.two>div,.split>*,.groups>div,.why li,.reports>div,.partners>div,.sub-grid>*,.mv-item,.lede,.ticks li,.ty>*,.sp-lead,.sp-facts,.sp-collage figure,.sp-trio figure';
var grid='.cards>*,.gallery>*,.stats>*,.groups>*,.reports>*,.partners>*,.cols>*';
/* The clipped box must be INSIDE the observed element: a browser treats a fully clipped target as "not visible",
   so it would never be revealed. Hence the collage clips its photo, not the figure itself. */
var clipSel='.media,.card>.photo,.card>.init,.sp-collage figure>img,.sp-ph';
function frames(el){var a=[].slice.call(el.querySelectorAll(clipSel));if(el.matches(clipSel))a.push(el);return a}
var io=new IntersectionObserver(function(en){en.forEach(function(x){
if(!x.isIntersecting)return;
var el=x.target;el.classList.add('in');
frames(el).forEach(function(c){c.classList.add('clip-in')});
io.unobserve(el);
})},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
var strip=matchMedia('(max-width:640px)').matches; /* on phones the gallery is a swipe strip: show every photo, never a blank one */
[].slice.call(main.querySelectorAll(sel)).forEach(function(el){
if(strip&&el.parentNode.classList.contains('gallery'))return;
var sib=[].indexOf.call(el.parentNode.children,el);
var n=el.matches(grid)?sib%4:Math.min(sib,5); /* grids stagger by column, so a long grid never waits */
el.style.setProperty('--d',(n*.08).toFixed(2)+'s');
el.classList.add('rv');
frames(el).forEach(function(c){c.classList.add('clip')});
io.observe(el);
});

/* 2. statistics count up once, when they scroll into view (the real number is already in the HTML) */
var nums=[].slice.call(main.querySelectorAll('.num[data-count]'));
if(nums.length){
var io2=new IntersectionObserver(function(en){en.forEach(function(x){
if(!x.isIntersecting)return;io2.unobserve(x.target);
var el=x.target,end=parseInt(el.dataset.count,10),t0=null,dur=1400;
(function f(t){if(t0===null)t0=t;var p=Math.min((t-t0)/dur,1);el.textContent=Math.round(end*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)})(performance.now());
})},{threshold:.6});
nums.forEach(function(n){n.textContent='0';io2.observe(n)});
}

/* 3. parallax: the hero drawing and any [data-parallax] image. Wide screens with a mouse only. */
var fine=matchMedia('(hover:hover) and (pointer:fine)'),wide=matchMedia('(min-width:861px)');
var plan=d.querySelector('.plan');
var px=[].slice.call(d.querySelectorAll('[data-parallax]')).map(function(el){return{el:el,img:el.querySelector('img'),amt:parseFloat(el.dataset.parallax)||.07}}).filter(function(i){return i.img});
if(plan||px.length){
var tick=false;
var run=function(){
tick=false;var vh=innerHeight;
if(!(wide.matches&&fine.matches)){ /* phones and tablets: switch it all off */
if(plan)plan.style.transform='';
px.forEach(function(i){i.el.classList.remove('px-on');i.img.style.translate=''});return;
}
if(plan)plan.style.transform='translate3d(0,'+(Math.min(scrollY,700)*.16).toFixed(1)+'px,0)';
px.forEach(function(i){
i.el.classList.add('px-on');
var r=i.el.getBoundingClientRect();if(r.bottom<-50||r.top>vh+50)return;
var p=Math.max(-1,Math.min(1,((r.top+r.height/2)-vh/2)/(vh/2+r.height/2)));
i.img.style.translate='0 '+(-p*i.amt*r.height).toFixed(1)+'px';
});
};
var req=function(){if(!tick){tick=true;requestAnimationFrame(run)}};
addEventListener('scroll',req,{passive:true});addEventListener('resize',req);run();
}
})();
