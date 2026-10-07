(function(){
var q=document.getElementById('q'),res=document.getElementById('res'),idx=window.IDX||[];
function esc(s){return s.replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function run(){
var t=q.value.trim().toLowerCase();
if(t.length<2){res.className='';res.innerHTML='';return}
var hits=idx.filter(function(x){return (x[0]+' '+x[2]).toLowerCase().indexOf(t)>-1});
res.className='open';
res.innerHTML=hits.length?hits.map(function(x){return '<a href="'+x[1]+'"><b>'+esc(x[0])+'</b><small>'+esc(x[2])+'</small></a>'}).join(''):'<p>No results for "'+esc(q.value.trim())+'". Try "events" or "projects".</p>';
}
q.addEventListener('input',run);q.addEventListener('focus',run);
document.addEventListener('click',function(e){if(!e.target.closest('.srch'))res.className=''});
document.addEventListener('keydown',function(e){
if(e.key==='/'&&!/input|textarea/i.test(document.activeElement.tagName)){e.preventDefault();q.focus()}
if(e.key==='Escape'){res.className='';q.blur()}
});
})();
