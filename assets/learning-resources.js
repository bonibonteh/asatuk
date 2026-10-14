(function(){
const root=document.querySelector('main[data-resource-type]');
const type=root?.dataset.resourceType||'all';
const status=document.getElementById('resource-status'),list=document.getElementById('resources');
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const urlOk=v=>{try{const u=new URL(v);return u.protocol==='https:'||u.protocol==='http:'}catch{return false}};
let rows=[];
function render(){
 const term=(document.getElementById('search')?.value||'').trim().toLowerCase();
 const programme=document.getElementById('programme')?.value||'';
 const year=document.getElementById('year')?.value||'';
 const filtered=rows.filter(r=>(type==='all'||r.resource_type===type)&&(!programme||r.programme===programme||r.programme==='All programmes')&&(!year||String(r.year_of_study||'')===year)&&(!term||[r.title,r.course_code,r.description,r.programme,r.semester,r.academic_year,r.file_name].some(v=>String(v||'').toLowerCase().includes(term))));
 list.innerHTML=filtered.map(r=>'<article class="resource"><div class="eyebrow">'+(r.resource_type==='exam'?'Past exam paper':'Revision material')+'</div><h2>'+safe(r.title)+'</h2><div class="meta">'+(r.course_code?'<span>'+safe(r.course_code)+'</span>':'')+'<span>'+safe(r.programme||'All programmes')+'</span>'+(r.year_of_study?'<span>Year '+safe(r.year_of_study)+'</span>':'')+'<span>'+safe(r.semester||'Any semester')+'</span>'+(r.academic_year?'<span>'+safe(r.academic_year)+'</span>':'')+'</div>'+(r.description?'<p>'+safe(r.description)+'</p>':'')+'<p>'+safe(r.file_name||'Open resource')+'</p>'+(urlOk(r.file_url)?'<a class="open" href="'+safe(r.file_url)+'" target="_blank" rel="noopener noreferrer">Open / download ↗</a>':'')+'</article>').join('');
 status.textContent=filtered.length?filtered.length+' resource'+(filtered.length===1?'':'s')+' available.':'No published resources match your search yet.';
}
async function init(){
 if(!window.supabase||!window.ASATUK_SUPABASE){status.textContent='The Student Hub connection is not configured. Please contact ASA TUK.';return}
 const db=window.supabase.createClient(window.ASATUK_SUPABASE.url,window.ASATUK_SUPABASE.publishableKey);
 const {data,error}=await db.from('learning_resources').select('id,resource_type,title,course_code,programme,year_of_study,semester,academic_year,description,file_url,file_name,created_at').eq('status','published').order('created_at',{ascending:false}).limit(300);
 if(error){console.error('Student Hub resources failed to load',error);status.textContent='Resources could not load right now. Please refresh the page or try again later.';return}
 rows=data||[];
 if(!rows.length){status.textContent='No published resources yet. Check back after ASA TUK administrators add materials.';return}
 render();
}
['search','programme','year'].forEach(id=>document.getElementById(id)?.addEventListener('input',render));
init();
})();