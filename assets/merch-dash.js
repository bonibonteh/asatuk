/* ASA TUK Merchandise Dashboard: overview, inventory, reports, customers, storefront, activity.
   Uses the session/permissions exposed by merchandise-admin.html as window.MerchDash. All figures come from the database. */
(function(){
'use strict';
var $=function(id){return document.getElementById(id)},D=null;
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
var money=function(n){return 'KSh '+Number(n||0).toLocaleString('en-KE')};
var fmtD=function(v){return v?new Date(v).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}):'—'};
var state={settings:{},movements:[],audit:[],loaded:false,period:'daily'};
var CATS=['Electronics','Stationery','Accessories','Books','Apparel','Calculators','Studio supplies','General'];
function P(){return D.products()}function O(){return D.orders()}function IT(){return D.items()}
function paid(o){return o.payment_status==='verified'&&o.order_status!=='cancelled'}
function lowT(p){return p.low_stock_threshold==null?5:p.low_stock_threshold}
function say(el,text,bad){var e=$(el);if(e){e.textContent=text;e.className=bad?'msg':'ok-msg'}}
function csv(name,rows){var t=rows.map(function(r){return r.map(function(c){c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c}).join(',')}).join('\n');var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/csv'}));a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},2000)}

async function loadExtra(){
  var a=await Promise.all([D.db.from('storefront_settings').select('key,value'),D.db.from('merchandise_stock_movements').select('*').order('created_at',{ascending:false}).limit(300),D.db.from('merchandise_audit_log').select('*').order('created_at',{ascending:false}).limit(300)]);
  state.settings={};(a[0].data||[]).forEach(function(r){state.settings[r.key]=r.value||{}});
  state.movements=a[1].data||[];state.audit=a[2].data||[];state.loaded=true;
}
function dayKey(d){return new Date(d).toISOString().slice(0,10)}

/* ---------- Overview ---------- */
function overview(){
  var o=O(),p=P(),paidO=o.filter(paid),total=paidO.reduce(function(s,x){return s+x.total_ksh},0);
  var low=p.filter(function(x){return x.status!=='archived'&&x.stock_quantity>0&&x.stock_quantity<=lowT(x)}),out=p.filter(function(x){return x.status==='published'&&x.stock_quantity<1});
  var pending=o.filter(function(x){return !['completed','cancelled'].includes(x.order_status)});
  $('ov-metrics').innerHTML=[['Total sales',money(total),'Verified payments only'],['Total orders',o.length,o.filter(function(x){return x.order_status==='cancelled'}).length+' cancelled'],['Total products',p.length,p.filter(function(x){return x.status==='published'}).length+' published'],['Pending orders',pending.length,'Not yet completed'],['Low stock',low.length+out.length,out.length+' out of stock'],['Confirmed payments',paidO.length,o.filter(function(x){return x.payment_status==='pending'}).length+' awaiting check']].map(function(m){return '<div class="metric"><span>'+m[0]+'</span><strong>'+m[1]+'</strong><small>'+m[2]+'</small></div>'}).join('');
  var days=[],map={};for(var i=13;i>=0;i--){var d=new Date();d.setDate(d.getDate()-i);var k=dayKey(d);days.push(k);map[k]=0}
  paidO.forEach(function(x){var k=dayKey(x.payment_verified_at||x.created_at);if(k in map)map[k]+=x.total_ksh});
  var mx=Math.max.apply(null,days.map(function(k){return map[k]}).concat([1]));
  $('ov-chart').innerHTML='<div class="chart" role="img" aria-label="Verified sales for the last 14 days">'+days.map(function(k){var v=map[k];return '<div class="b" title="'+k+': '+money(v)+'"><em>'+(v?Math.round(v/100)/10+'k':'')+'</em><i style="height:'+Math.max(2,Math.round(v/mx*120))+'px"></i><span>'+k.slice(8)+'</span></div>'}).join('')+'</div>';
  $('ov-recent').innerHTML=o.slice(0,6).map(function(x){return '<li><span><b>'+esc(x.order_number)+'</b><br><small class="muted">'+esc(x.customer_name)+' · '+fmtD(x.created_at)+'</small></span><span>'+money(x.total_ksh)+'<br><span class="pill '+esc(x.order_status)+'">'+esc(x.order_status.replace(/_/g,' '))+'</span></span></li>'}).join('')||'<li class="muted">No orders yet.</li>';
  var sold={};paidO.forEach(function(x){(IT()[x.id]||[]).forEach(function(i){sold[i.product_name]=(sold[i.product_name]||0)+i.quantity})});
  var best=Object.keys(sold).sort(function(a,b){return sold[b]-sold[a]}).slice(0,5);
  $('ov-best').innerHTML=best.map(function(n){return '<li><span>'+esc(n)+'</span><b>'+sold[n]+' sold</b></li>'}).join('')||'<li class="muted">Bestsellers appear after the first verified sale.</li>';
  $('ov-alerts').innerHTML=out.map(function(x){return '<li><span>'+esc(x.name)+'</span><span class="pill out">Out of stock</span></li>'}).concat(low.map(function(x){return '<li><span>'+esc(x.name)+'</span><span class="pill low">'+x.stock_quantity+' left</span></li>'})).join('')||'<li class="muted">No stock alerts.</li>';
  $('ov-pay').innerHTML=o.filter(function(x){return x.payment_reference||x.payment_status!=='pending'}).slice(0,6).map(function(x){return '<li><span><b>'+esc(x.payment_reference||'No reference')+'</b><br><small class="muted">'+esc(x.order_number)+' · '+esc(x.customer_name)+'</small></span><span class="pill '+esc(x.payment_status)+'">'+esc(x.payment_status)+'</span></li>'}).join('')||'<li class="muted">No payment activity yet.</li>';
}

/* ---------- Inventory ---------- */
function inventory(){
  var rows=P().filter(function(x){return x.status!=='archived'});
  $('inv-table').innerHTML=rows.length?'<table><thead><tr><th>Product</th><th>Stock</th><th>Alert at</th><th>Availability</th><th>Actions</th></tr></thead><tbody>'+rows.map(function(x){var st=x.stock_quantity<1?['out','Out of stock']:x.stock_quantity<=lowT(x)?['low','Low stock']:['ok','In stock'];return '<tr><td><b>'+esc(x.name)+'</b><br><small class="muted">'+esc(x.category)+'</small></td><td><b>'+x.stock_quantity+'</b></td><td>'+lowT(x)+'</td><td><span class="pill '+st[0]+'">'+st[1]+'</span></td><td>'+(D.perm().merch?'<button class="secondary" data-restock="'+x.id+'">Restock / adjust</button> ':'')+'<button class="secondary" data-history="'+x.id+'">History</button></td></tr>'}).join('')+'</tbody></table>':'<p class="muted">No products yet.</p>';
}
function openAdjust(id){var p=P().find(function(x){return x.id===id});$('adj-product').textContent=p.name+' · now '+p.stock_quantity;$('adj-form').elements.id.value=id;$('adj-form').elements.delta.value='';$('adj-form').elements.reason.value='';say('adj-msg','');$('adj-dialog').showModal()}
function openHistory(id){var p=P().find(function(x){return x.id===id});var m=state.movements.filter(function(x){return x.product_id===id});$('hist-title').textContent='Stock history · '+p.name;$('hist-body').innerHTML=m.length?'<ul class="list">'+m.map(function(x){return '<li><span><b>'+(x.change_qty>0?'+':'')+x.change_qty+'</b> <span class="pill">'+esc(x.kind)+'</span><br><small class="muted">'+esc(x.reason)+'</small></span><span>→ '+(x.stock_after==null?'—':x.stock_after)+'<br><small class="muted">'+fmtD(x.created_at)+'</small></span></li>'}).join('')+'</ul>':'<p class="muted">No recorded movements yet.</p>';$('hist-dialog').showModal()}

/* ---------- Reports ---------- */
function reports(){
  var o=O().filter(paid),per=state.period,b={};
  o.forEach(function(x){var d=new Date(x.payment_verified_at||x.created_at),k;if(per==='daily')k=dayKey(d);else if(per==='monthly')k=dayKey(d).slice(0,7);else{var t=new Date(d);t.setDate(t.getDate()-((t.getDay()+6)%7));k='Week of '+dayKey(t)}b[k]=b[k]||{n:0,v:0};b[k].n++;b[k].v+=x.total_ksh});
  var ks=Object.keys(b).sort().reverse().slice(0,31);
  $('rp-period').innerHTML=ks.length?'<table><thead><tr><th>Period</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>'+ks.map(function(k){return '<tr><td>'+esc(k)+'</td><td>'+b[k].n+'</td><td><b>'+money(b[k].v)+'</b></td></tr>'}).join('')+'</tbody></table>':'<p class="muted">No verified sales yet.</p>';
  var catOf={};P().forEach(function(x){catOf[x.id]=x.category});var cat={},sold={};
  o.forEach(function(x){(IT()[x.id]||[]).forEach(function(i){var c=catOf[i.product_id]||'Other';cat[c]=(cat[c]||0)+i.line_total_ksh;sold[i.product_name]=(sold[i.product_name]||0)+i.quantity})});
  $('rp-cat').innerHTML=Object.keys(cat).sort(function(a,c){return cat[c]-cat[a]}).map(function(c){return '<li><span>'+esc(c)+'</span><b>'+money(cat[c])+'</b></li>'}).join('')||'<li class="muted">No data yet.</li>';
  $('rp-best').innerHTML=Object.keys(sold).sort(function(a,c){return sold[c]-sold[a]}).slice(0,8).map(function(n){return '<li><span>'+esc(n)+'</span><b>'+sold[n]+' sold</b></li>'}).join('')||'<li class="muted">No data yet.</li>';
  var all=O(),live=all.filter(function(x){return x.order_status!=='cancelled'}),done=live.filter(function(x){return x.order_status==='completed'}).length;
  $('rp-kpi').innerHTML='<li><span>Total verified revenue</span><b>'+money(o.reduce(function(s,x){return s+x.total_ksh},0))+'</b></li><li><span>Order completion rate</span><b>'+(live.length?Math.round(done/live.length*100):0)+'% ('+done+' of '+live.length+')</b></li><li><span>Cancelled orders</span><b>'+(all.length-live.length)+'</b></li>';
  $('rp-inv').innerHTML=P().filter(function(x){return x.status!=='archived'}).map(function(x){var s=sold[x.name]||0;return '<li><span>'+esc(x.name)+'</span><span>'+s+' sold · '+x.stock_quantity+' left</span></li>'}).join('')||'<li class="muted">No products.</li>';
}

/* ---------- Customers ---------- */
function customers(){
  var m={};O().forEach(function(x){var k=(x.customer_email||'').toLowerCase();var c=m[k]=m[k]||{name:x.customer_name,email:k,phone:x.customer_phone,orders:[],total:0};c.orders.push(x);if(paid(x))c.total+=x.total_ksh});
  var term=($('cu-search').value||'').toLowerCase(),a=Object.keys(m).map(function(k){return m[k]}).filter(function(c){return !term||(c.name+c.email+c.phone).toLowerCase().includes(term)}).sort(function(a,b){return b.total-a.total});
  $('cu-table').innerHTML=a.length?'<table><thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Verified purchases</th><th>Order history</th></tr></thead><tbody>'+a.map(function(c){return '<tr><td><b>'+esc(c.name)+'</b></td><td>'+esc(c.email)+'<br>'+esc(c.phone)+'</td><td>'+c.orders.length+'</td><td><b>'+money(c.total)+'</b></td><td><small>'+c.orders.slice(0,4).map(function(x){return esc(x.order_number)+' · '+fmtD(x.created_at)+' · '+esc(x.order_status.replace(/_/g,' '))}).join('<br>')+'</small></td></tr>'}).join('')+'</tbody></table>':'<p class="muted">No customers yet.</p>';
}

/* ---------- Storefront ---------- */
function sfFill(){
  var s=state.settings,g=function(k){return s[k]||{}};
  var f=$('sf-form').elements;
  f.banner_active.checked=!!g('banner').active;f.banner_text.value=g('banner').text||'';
  f.promo_text.value=g('promo_message').text||'';
  f.ann_active.checked=!!g('announcement').active;f.ann_text.value=g('announcement').text||'';
  f.camp_active.checked=!!g('campaign').active;f.camp_label.value=g('campaign').label||'';f.camp_title.value=g('campaign').title||'';
  var hid=(g('hidden_categories').list)||[];
  $('sf-cats').innerHTML=CATS.map(function(c){return '<label class="chk"><input type="checkbox" name="show_'+esc(c)+'" '+(hid.indexOf(c)<0?'checked':'')+'> '+esc(c)+' visible</label>'}).join('');
  $('sf-products').innerHTML=P().filter(function(x){return x.status==='published'}).map(function(x){return '<tr><td><b>'+esc(x.name)+'</b></td><td><input type="checkbox" data-feat="'+x.id+'" '+(x.featured?'checked':'')+'></td><td><input type="number" style="width:80px" data-order="'+x.id+'" value="'+(x.display_order||0)+'"></td></tr>'}).join('')||'<tr><td colspan="3" class="muted">Publish products first.</td></tr>';
  $('disc-cat').innerHTML=CATS.map(function(c){return '<option>'+esc(c)+'</option>'}).join('');
}
async function saveSetting(key,value){var r=await D.db.from('storefront_settings').upsert({key:key,value:value,updated_by:D.user().id,updated_at:new Date().toISOString()});if(r.error)throw r.error}
async function sfSave(e){e.preventDefault();if(!D.perm().merch){say('sf-msg','Only merchandise officers can change the storefront.',1);return}
  var f=e.target.elements;say('sf-msg','Saving…');
  try{
    await saveSetting('banner',{active:f.banner_active.checked,text:f.banner_text.value.trim().slice(0,200)});
    await saveSetting('promo_message',{text:f.promo_text.value.trim().slice(0,120)});
    await saveSetting('announcement',{active:f.ann_active.checked,text:f.ann_text.value.trim().slice(0,300)});
    await saveSetting('campaign',{active:f.camp_active.checked,label:f.camp_label.value.trim().slice(0,60),title:f.camp_title.value.trim().slice(0,160)});
    await saveSetting('hidden_categories',{list:CATS.filter(function(c){return !f['show_'+c].checked})});
    var ups=[];document.querySelectorAll('[data-feat]').forEach(function(c){var id=c.dataset.feat,ord=Number(document.querySelector('[data-order="'+id+'"]').value)||0,p=P().find(function(x){return x.id===id});if(p&&(!!p.featured!==c.checked||(p.display_order||0)!==ord))ups.push(D.db.from('merchandise_products').update({featured:c.checked,display_order:ord,updated_at:new Date().toISOString()}).eq('id',id))});
    var rs=await Promise.all(ups);var bad=rs.find(function(r){return r.error});if(bad)throw bad.error;
    await D.reload();await loadExtra();say('sf-msg','Saved. The public shop now shows these changes.');
  }catch(err){say('sf-msg','Could not save: '+(err.message||err),1)}
}
async function discount(apply){if(!D.perm().merch)return;var cat=$('disc-cat').value,pct=Number($('disc-pct').value);
  if(apply&&(!(pct>=1&&pct<=90))){say('disc-msg','Enter a discount between 1 and 90.',1);return}
  var list=P().filter(function(x){return x.category===cat&&x.status==='published'});if(!list.length){say('disc-msg','No published products in '+cat+'.',1);return}
  if(!confirm((apply?'Apply '+pct+'% off to ':'End the discount on ')+list.length+' '+cat+' product(s)?'))return;
  try{for(var i=0;i<list.length;i++){var x=list[i],upd;
    if(apply){var base=x.original_price_ksh>x.price_ksh?x.original_price_ksh:x.price_ksh;upd={original_price_ksh:base,price_ksh:Math.max(1,Math.round(base*(1-pct/100)))}}
    else if(x.original_price_ksh>x.price_ksh)upd={price_ksh:x.original_price_ksh,original_price_ksh:null};else continue;
    upd.updated_at=new Date().toISOString();var r=await D.db.from('merchandise_products').update(upd).eq('id',x.id);if(r.error)throw r.error}
    await D.reload();say('disc-msg',apply?'Discount applied. The original price is kept and shown struck through in the shop.':'Discount ended; original prices restored.')}catch(err){say('disc-msg','Failed: '+err.message,1)}}

/* ---------- Activity ---------- */
function activity(){
  var name={};O().forEach(function(x){name[x.id]=x.order_number});
  $('ac-audit').innerHTML=state.audit.slice(0,40).map(function(a){var d=a.detail||{};return '<li><span><b>'+esc(a.action.replace('_',' '))+'</b> · '+esc(name[a.order_id]||'order')+'<br><small class="muted">'+esc(d.from||'')+' → '+esc(d.to||'')+(d.reference?' · ref '+esc(d.reference):'')+(d.note?' · '+esc(d.note):'')+'</small></span><small class="muted">'+fmtD(a.created_at)+'</small></li>'}).join('')||'<li class="muted">No recorded changes yet.</li>';
  var pn={};P().forEach(function(x){pn[x.id]=x.name});
  $('ac-mov').innerHTML=state.movements.slice(0,40).map(function(m){return '<li><span><b>'+(m.change_qty>0?'+':'')+m.change_qty+'</b> '+esc(pn[m.product_id]||'product')+' <span class="pill">'+esc(m.kind)+'</span><br><small class="muted">'+esc(m.reason)+'</small></span><small class="muted">'+fmtD(m.created_at)+'</small></li>'}).join('')||'<li class="muted">No stock movements yet.</li>';
}

function renderAll(){if(!D||!state.loaded)return;overview();inventory();reports();customers();sfFill();activity()}

function wire(){
  document.addEventListener('click',async function(e){
    var b=e.target.closest('button,[data-goto]');if(!b)return;
    if(b.dataset.goto){var t=document.querySelector('[data-tab="'+b.dataset.goto+'"]');t&&t.click()}
    if(b.dataset.restock)openAdjust(b.dataset.restock);
    if(b.dataset.history)openHistory(b.dataset.history);
    if(b.dataset.period){state.period=b.dataset.period;document.querySelectorAll('[data-period]').forEach(function(x){x.classList.toggle('active',x===b)});reports()}
    if(b.id==='rp-export'){var o=O().filter(paid);csv('asatuk-merch-sales.csv',[['Order','Date','Customer','Payment ref','Total KSh']].concat(o.map(function(x){return [x.order_number,fmtD(x.payment_verified_at||x.created_at),x.customer_name,x.payment_reference,x.total_ksh]})))}
    if(b.id==='rp-export-inv')csv('asatuk-merch-inventory.csv',[['Product','Category','Price KSh','Stock','Status']].concat(P().map(function(x){return [x.name,x.category,x.price_ksh,x.stock_quantity,x.status]})));
    if(b.id==='disc-apply')discount(true);if(b.id==='disc-end')discount(false);
    if(b.id==='ov-refresh'){await D.reload();await loadExtra();renderAll()}
  });
  $('adj-form').onsubmit=async function(e){e.preventDefault();var f=e.target.elements,delta=parseInt(f.delta.value,10);if(!delta){say('adj-msg','Enter a non-zero quantity (negative to remove).',1);return}
    say('adj-msg','Saving…');var r=await D.db.rpc('adjust_merchandise_stock',{p_product:f.id.value,p_delta:delta,p_kind:f.kind.value,p_reason:f.reason.value});
    if(r.error){say('adj-msg',r.error.message,1);return}$('adj-dialog').close();await D.reload();await loadExtra();renderAll()};
  $('adj-cancel').onclick=function(){$('adj-dialog').close()};$('hist-close').onclick=function(){$('hist-dialog').close()};
  $('sf-form').onsubmit=sfSave;$('cu-search').oninput=customers;
  document.addEventListener('merch-data',renderAll);
  document.addEventListener('click',function(e){var t=e.target.closest('[data-tab]');if(t&&['overview','inventory','reports','customers','storefront','activity'].indexOf(t.dataset.tab)>-1&&!state.loaded)loadExtra().then(renderAll)});
  setInterval(function(){if(D&&!document.hidden&&$('app')&&!$('app').classList.contains('hidden'))D.reload().then(function(){return loadExtra()}).then(renderAll)},60000);
}
var started=false;async function init(){if(started||!window.MerchDash)return;started=true;D=window.MerchDash;wire();await loadExtra();renderAll()}
document.addEventListener('merch-ready',init);init();
})();
