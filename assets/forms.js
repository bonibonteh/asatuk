/* ASA TUK: separate forms (news subscription, partnership enquiry, support enquiry).
   Independent of membership: site.js only handles form[data-next]; this file only handles form[data-form].
   Endpoints come from assets/config.js. */
(function(){
var d=document,C=window.ASA_FORMS||{};
function endpoint(k){var id=String(C[k]||'').trim();return id?'https://formspree.io/f/'+encodeURIComponent(id):''}
d.querySelectorAll('form[data-form]').forEach(function(f){
var key=f.dataset.form,msg=f.querySelector('.form-msg'),done=f.querySelector('.form-done'),btn=f.querySelector('button[type=submit]');
function show(html,err){msg.hidden=false;msg.className='form-msg'+(err?' error':'');msg.innerHTML=html}
function mailto(fd){
var lines=[];fd.forEach(function(v,k){if(k[0]!=='_'&&k!=='form'&&String(v).trim())lines.push(k.replace(/_/g,' ')+': '+v)});
var sf=f.dataset.subjectField,who=sf&&f.elements[sf]?f.elements[sf].value:'';
return 'mailto:'+f.dataset.mailto+'?subject='+encodeURIComponent((f.dataset.subject||'ASA TUK website')+(who?' - '+who:''))+'&body='+encodeURIComponent(lines.join('\n'));
}
f.addEventListener('submit',function(e){
e.preventDefault();
if(f.dataset.busy==='1')return;
var fd=new FormData(f);
if(fd.get('_gotcha'))return; /* honeypot: a person never fills this */
var url=endpoint(key);
if(!url){ /* not connected yet: hand the message to the visitor's email app so nothing is lost */
var href=mailto(fd);
show('Your email app should open with your message ready to send. If it does not, <a href="'+href+'">send it by email instead</a>.');
location.href=href;return;
}
f.dataset.busy='1';var label=btn.textContent;btn.disabled=true;btn.textContent='Sending...';
fetch(url,{method:'POST',body:fd,headers:{'Accept':'application/json'}})
.then(function(r){return r.json().catch(function(){return {}}).then(function(j){
if(!r.ok||j.error||j.errors)throw 0; /* only a confirmed save counts as success */
f.reset();f.classList.add('is-done');msg.hidden=true;done.hidden=false;done.focus();
})})
.catch(function(){show((f.dataset.errmsg||'We could not send this.')+' Please check your connection and try again, or <a href="'+mailto(fd)+'">send it by email instead</a>.',true)})
.then(function(){f.dataset.busy='0';btn.disabled=false;btn.textContent=label});
});
});
})();
