/* Lets an official with several authorised roles move between their workspaces. Uses assignments the page already loaded. */
(function(){'use strict';
var WS=[['social','Social Media','social-workspace.html'],['pr','PR & Communications','pr-workspace.html'],['events','Events','events-workspace.html'],['academic','Academic','academic-workspace.html'],['treasury','Treasury','treasurer-workspace.html'],['merch','Merchandise','merchandise-admin.html'],['hub','Council Hub','council-hub.html']];
function kinds(a){var d=a.docket||'',t=a.role_title||'',o=[];
 if(d==='Social Media'||/social media/i.test(t))o.push('social');else if(d==='PR & Communications'||a.can_manage_pr)o.push('pr');
 if(d==='Events'||d==='Organizing'||a.can_manage_events)o.push('events');
 if(d==='Academic'||a.can_manage_academics)o.push('academic');
 if(d==='Treasury'||a.can_manage_finance)o.push('treasury');
 if(d==='Merchandise'||a.can_manage_merchandise)o.push('merch');
 return o}
window.ASATUKSwitch={mount:function(asg,admin){try{
 var set={};(asg||[]).forEach(function(a){if(a.is_active===false)return;kinds(a).forEach(function(k){set[k]=1})});
 if(admin)WS.forEach(function(w){set[w[0]]=1});
 var here=location.pathname.split('/').pop()||'';var list=WS.filter(function(w){return set[w[0]]});
 if(list.length<2||document.getElementById('ws-switch'))return;
 var anchor=document.getElementById('ew-out')||document.getElementById('ac-bell');if(!anchor)return;
 var l=document.createElement('label');l.className='ew-theme';l.style.cssText='display:flex;gap:6px;align-items:center;font-size:12px';
 l.innerHTML='<span>Workspace</span><select id="ws-switch" aria-label="Switch workspace" style="border:1px solid #ddd;border-radius:10px;padding:6px 8px;background:#fff;font:inherit">'+list.map(function(w){return '<option value="'+w[2]+'"'+(w[2]===here?' selected':'')+'>'+w[1]+'</option>'}).join('')+'</select>';
 anchor.parentNode.insertBefore(l,anchor);
 document.getElementById('ws-switch').onchange=function(e){location.href=e.target.value};
}catch(e){}}}})();
