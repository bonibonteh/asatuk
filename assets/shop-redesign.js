/* ASA TUK Online Shop redesign: navigation, filters, parallax, details & tour. Works on top of the existing cart/checkout script. */
(function(){
  var $=function(id){return document.getElementById(id)};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})};
  var money=function(n){return 'KSh '+Number(n||0).toLocaleString('en-KE')};
  try{$('yr').textContent=new Date().getFullYear()}catch(e){}

  /* ---- navigation ---- */
  var nav=$('shop-nav'),tog=$('nav-toggle');
  tog&&tog.addEventListener('click',function(){var o=nav.classList.toggle('open');tog.setAttribute('aria-expanded',o)});
  document.querySelectorAll('.dd-btn').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation();var dd=b.parentElement,o=!dd.classList.contains('open');document.querySelectorAll('.dd.open').forEach(function(x){x.classList.remove('open')});dd.classList.toggle('open',o);b.setAttribute('aria-expanded',o)})});
  document.addEventListener('click',function(){document.querySelectorAll('.dd.open').forEach(function(x){x.classList.remove('open')})});
  if($('cart-open-2'))$('cart-open-2').addEventListener('click',function(){$('cart-open').click()});

  /* ---- category / filter wiring (drives the existing hidden #category select) ---- */
  function setCat(cat,scroll){
    var sel=$('category');if(!sel)return;
    sel.value=cat;if(sel.value!==cat)sel.value='all';
    sel.dispatchEvent(new Event('change'));
    document.querySelectorAll('.chip').forEach(function(c){c.classList.toggle('on',c.dataset.chip===(sel.value))});
    if(scroll!==false){var t=$('catalogue');t&&t.scrollIntoView({behavior:'smooth',block:'start'})}
    if(nav)nav.classList.remove('open');
    document.querySelectorAll('.dd.open').forEach(function(x){x.classList.remove('open')});
  }
  document.addEventListener('click',function(e){
    var c=e.target.closest('[data-cat]');if(c){e.preventDefault();setCat(c.dataset.cat);return}
    var ch=e.target.closest('[data-chip]');if(ch){setCat(ch.dataset.chip,false)}
  });
  var s=$('search');
  if(s){
    var jumped=false;
    s.addEventListener('input',function(){if(s.value.trim()&&!jumped){jumped=true;var t=$('catalogue');t&&t.scrollIntoView({behavior:'smooth',block:'start'})}if(!s.value.trim())jumped=false});
    s.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();var t=$('catalogue');t&&t.scrollIntoView({behavior:'smooth',block:'start'})}});
  }

  /* ---- hero parallax (mouse + scroll), disabled for reduced motion / touch ---- */
  var scene=$('scene'),reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(scene){
    scene.querySelectorAll('.lyr').forEach(function(l){var d=l.getAttribute('data-d');if(d!=null)l.style.setProperty('--d',d)});
    if(!reduce){
      var hero=scene.closest('.hero-shop'),raf=0,tx=0,ty=0;
      var apply=function(){raf=0;scene.style.setProperty('--mx',tx.toFixed(3));scene.style.setProperty('--my',ty.toFixed(3))};
      hero.addEventListener('pointermove',function(e){if(e.pointerType==='touch')return;var r=hero.getBoundingClientRect();tx=((e.clientX-r.left)/r.width-.5)*-1;ty=((e.clientY-r.top)/r.height-.5)*-1;if(!raf)raf=requestAnimationFrame(apply)});
      hero.addEventListener('pointerleave',function(){tx=0;ty=0;if(!raf)raf=requestAnimationFrame(apply)});
      var sraf=0;window.addEventListener('scroll',function(){if(sraf)return;sraf=requestAnimationFrame(function(){sraf=0;var y=Math.min(window.scrollY,700)/700;scene.style.setProperty('--sy',(y*-1).toFixed(3))})},{passive:true});
    }
  }

  /* ---- product details dialog ---- */
  function list(){return (window.ASA_SHOP&&window.ASA_SHOP.products)||[]}
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-details]');if(!b)return;
    var p=list().find(function(x){return x.id===b.dataset.details});if(!p)return;
    var imgs=(p.image_urls&&p.image_urls.length?p.image_urls:(p.image_url?[p.image_url]:[]));
    $('dd-cat').textContent=p.category||'Merchandise';
    var inStock=p.stock_quantity>0;
    $('dd-body').innerHTML='<div class="dd-body-grid"><div><div class="dd-photo">'+(imgs[0]?'<img id="dd-main" src="'+esc(imgs[0])+'" alt="'+esc(p.name)+'">':'<span>No image</span>')+'</div>'+(imgs.length>1?'<div class="gallery-thumbs">'+imgs.slice(0,6).map(function(u,i){return '<button type="button" data-ddimg="'+esc(u)+'" aria-label="View image '+(i+1)+'"><img src="'+esc(u)+'" alt=""></button>'}).join('')+'</div>':'')+'</div><div class="dd-info"><h2>'+esc(p.name)+'</h2><div class="price">'+money(p.price_ksh)+' <small>KSH</small></div><div class="stock '+(inStock?(p.stock_quantity<=5?'low':'in'):'out')+'">'+(inStock?(p.stock_quantity<=5?'Only '+p.stock_quantity+' left':'In stock · '+p.stock_quantity+' available'):'Out of stock')+'</div><p style="white-space:pre-line">'+esc(p.description||'ASA TUK student essential.')+'</p><button class="btn" type="button" id="dd-add" '+(inStock?'':'disabled')+'>Add to cart</button></div></div>';
    $('detail-dialog').showModal();
    $('dd-add').onclick=function(){var g=document.querySelector('[data-add="'+p.id+'"]');if(g)g.click();$('detail-dialog').close();$('cart-open').click()};
  });
  document.addEventListener('click',function(e){var t=e.target.closest('[data-ddimg]');if(t&&$('dd-main'))$('dd-main').src=t.dataset.ddimg});
  $('dd-close')&&($('dd-close').onclick=function(){$('detail-dialog').close()});
  ['detail-dialog','tour-dialog'].forEach(function(id){var d=$(id);d&&d.addEventListener('click',function(e){if(e.target===d)d.close()})});

  /* ---- shop tour (real product showcase) ---- */
  var slides=[],i=0,timer=0;
  function buildSlides(){
    var ps=list(),arts=[['Welcome to the ASA TUK Online Shop','Official merchandise and student essentials from the Association of Students of Architecture, TU-K, in one place.','s-backpack','0 0 200 270'],['Made for the studio and the lecture hall','Calculators, stationery, studio supplies and more. Use the category cards or the search bar to find what you need fast.','s-notebook','0 0 190 230']];
    slides=arts.map(function(a){return{t:a[0],d:a[1],art:'<svg viewBox="'+a[3]+'"><use href="#'+a[2]+'"/></svg>'}});
    if(ps.length){var p=ps[0];slides.push({t:'Now in stock: '+p.name,d:(p.description||'').slice(0,160)+(p.description&&p.description.length>160?'…':'')+' '+money(p.price_ksh)+'.',art:p.image_url?'<img src="'+esc(p.image_url)+'" alt="'+esc(p.name)+'">':'<svg viewBox="0 0 240 430"><use href="#s-calc"/></svg>',btn:p.id})}
    slides.push({t:'How ordering works',d:'1. Add items to your cart. 2. Submit your order details at checkout. 3. Pay by M-Pesa and share your reference. 4. The Treasurer verifies payment, then you collect from ASA TUK or arrange delivery.',art:'<svg viewBox="0 0 170 210"><use href="#s-bag"/></svg>',last:true});
  }
  function show(n){
    i=(n+slides.length)%slides.length;var s=slides[i];
    $('tour-slide').innerHTML='<div class="tour-art">'+s.art+'</div><div><div class="eyebrow">Step '+(i+1)+' of '+slides.length+'</div><h3>'+esc(s.t)+'</h3><p>'+esc(s.d)+'</p>'+(s.btn?'<button type="button" class="btn" data-details="'+esc(s.btn)+'">View product</button>':'')+(s.last?'<a class="btn" style="display:inline-block;text-decoration:none" href="#catalogue" id="tour-go">Start shopping</a>':'')+'</div>';
    $('tour-dots').innerHTML=slides.map(function(_,k){return '<i class="'+(k===i?'on':'')+'"></i>'}).join('');
    var go=$('tour-go');go&&go.addEventListener('click',function(){$('tour-dialog').close()});
  }
  function stop(){clearInterval(timer);timer=0}
  $('tour-open')&&$('tour-open').addEventListener('click',function(){buildSlides();show(0);$('tour-dialog').showModal();stop();if(!reduce)timer=setInterval(function(){show(i+1)},6500)});
  $('tour-next')&&($('tour-next').onclick=function(){stop();show(i+1)});
  $('tour-prev')&&($('tour-prev').onclick=function(){stop();show(i-1)});
  $('tour-close')&&($('tour-close').onclick=function(){$('tour-dialog').close()});
  $('tour-dialog')&&$('tour-dialog').addEventListener('close',stop);
  document.addEventListener('click',function(e){if(e.target.closest('#tour-slide [data-details]'))$('tour-dialog').close()});

  /* ---- storefront settings (managed from the Merchandise Dashboard) + order tracking ---- */
  (function(){
    var tries=0;(function wait(){var db=window.ASA_DB;if(!db){if(tries++<50)return setTimeout(wait,100);return}
      db.from('storefront_settings').select('key,value').then(function(res){
        var s={};(res.data||[]).forEach(function(x){s[x.key]=x.value||{}});
        var b=s.banner;if(b&&b.active&&b.text){var el=$('sf-banner');if(el){el.textContent=b.text;el.hidden=false}}
        var pm=s.promo_message;if(pm&&pm.text){var badge=document.querySelector('.pill-badge');if(badge){var sv=badge.querySelector('svg');badge.innerHTML=(sv?sv.outerHTML:'')+' '+esc(pm.text)}}
        var a=s.announcement;if(a&&a.active&&a.text){var c=$('catalogue'),n=document.createElement('p');n.id='sf-note';n.textContent=a.text;c&&c.insertBefore(n,c.querySelector('.chips'))}
        var h=(s.hidden_categories&&s.hidden_categories.list)||[];
        h.forEach(function(cat){document.querySelectorAll('.catcard[data-cat="'+cat+'"],.chip[data-chip="'+cat+'"],.dd-menu [data-cat="'+cat+'"]').forEach(function(x){x.hidden=true})});
        var cp=s.campaign;if(cp&&cp.active&&cp.title){var p4=document.querySelector('.promo.p4');if(p4){p4.querySelector('small').textContent=cp.label||'Limited-Time Offer';p4.querySelector('h3').textContent=cp.title}}
      });
    })();
    var open=$('track-open'),dlg=$('track-dialog');
    open&&open.addEventListener('click',function(){dlg.showModal()});
    var labels={new:'Received',payment_pending:'Awaiting payment verification',processing:'Being prepared',ready:'Ready for collection',dispatched:'Dispatched',completed:'Completed',cancelled:'Cancelled'},pl={pending:'Payment not yet verified',verified:'Payment confirmed',rejected:'Payment could not be verified'};
    var f=$('track-form');f&&f.addEventListener('submit',function(e){e.preventDefault();var out=$('track-out');out.textContent='Checking…';
      window.ASA_DB.rpc('track_merchandise_order',{p_order_number:$('track-no').value,p_email:$('track-email').value}).then(function(r){
        var o=r.data;if(r.error||!o){out.textContent='No order found for those details. Check the order number and email.';return}
        out.innerHTML='<p><b>'+esc(o.order_number)+'</b> · '+money(o.total_ksh)+'</p><p>Order: <b>'+esc(labels[o.order_status]||o.order_status)+'</b><br>Payment: <b>'+esc(pl[o.payment_status]||o.payment_status)+'</b>'+(o.payment_note?'<br><small>'+esc(o.payment_note)+'</small>':'')+'</p><ul>'+(o.items||[]).map(function(i){return '<li>'+esc(i.name)+' × '+i.quantity+'</li>'}).join('')+'</ul>';
      })});
  })();
})();
