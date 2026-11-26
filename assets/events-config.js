/* Shared defaults + presets for the configurable public events page (used by the Events Manager and the public page). */
(function(){
var PRESETS={
 'EventPlace Violet':{primary:'#5b21b6',secondary:'#5eead4',bg:'#f3f0fb',accent:'#e11d74',font:'sans',cardStyle:'rounded',buttonStyle:'outline'},
 'ASA Forest':{primary:'#14532d',secondary:'#c9a227',bg:'#faf6ea',accent:'#0b3d20',font:'serif',cardStyle:'rounded',buttonStyle:'solid'},
 'Cream & Gold':{primary:'#3b2f1e',secondary:'#b8860b',bg:'#fffaf0',accent:'#8a6d1d',font:'serif',cardStyle:'shadow',buttonStyle:'pill'},
 'Clean White':{primary:'#1f3a2d',secondary:'#2e7d4f',bg:'#ffffff',accent:'#145c38',font:'sans',cardStyle:'sharp',buttonStyle:'outline'},
 'Midnight Green':{primary:'#0a2a1d',secondary:'#d4af37',bg:'#eef3ee',accent:'#1b5e3a',font:'modern',cardStyle:'rounded',buttonStyle:'solid'}};
var DEFAULTS={preset:'EventPlace Violet',primary:'#5b21b6',secondary:'#5eead4',bg:'#f3f0fb',accent:'#e11d74',font:'sans',cardStyle:'rounded',buttonStyle:'outline',cardLayout:'vertical',density:'cozy',spacing:'normal',imgStyle:'cover',
 hero:{show:true,title:'Discover & Explore ASA TUK Events',subtitle:'Connect with architecture, creativity, ideas and opportunities.',intro:'Workshops, exhibitions, site visits and community gatherings from the Architecture Students Association of the Technical University of Kenya.',image:'',overlay:10,ctaText:'Browse upcoming events',ctaUrl:'#upcoming'},
 featured:{count:3,layout:'grid',heading:'Featured events',subtitle:'Hand-picked by the ASA TUK events team',moreText:'See more events'},
 cta:{title:'Have an idea for an event?',text:'Tell the events team and help shape the ASA TUK calendar.',btnText:'Get in touch',btnUrl:'mailto:asatuk@students.tukenya.ac.ke'},
 sections:[{id:'hero',show:true,title:'Hero'},{id:'featured',show:true,title:'Featured events'},{id:'upcoming',show:true,title:'Upcoming events',subtitle:'Find something to attend'},{id:'categories',show:true,title:'Event categories'},{id:'calendar',show:true,title:'Event calendar'},{id:'past',show:true,title:'Past events',subtitle:'Look back at what we have done'},{id:'highlights',show:false,title:'Event highlights'},{id:'gallery',show:false,title:'Event gallery'},{id:'announcements',show:false,title:'Event announcements'},{id:'sponsors',show:true,title:'Our sponsors & partners'},{id:'cta',show:true,title:'Call to action'}]};
function merge(base,over){var o=JSON.parse(JSON.stringify(base));if(!over||typeof over!=='object')return o;
 Object.keys(over).forEach(function(k){if(k==='sections'&&Array.isArray(over.sections)){var seen={},out=[];over.sections.forEach(function(s){var d=base.sections.find(function(x){return x.id===s.id});if(d&&!seen[s.id]){seen[s.id]=1;out.push(Object.assign({},d,s))}});base.sections.forEach(function(d){if(!seen[d.id])out.push(Object.assign({},d))});o.sections=out}
  else if(over[k]&&typeof over[k]==='object'&&!Array.isArray(over[k])&&o[k]&&typeof o[k]==='object')o[k]=Object.assign({},o[k],over[k]);else if(k!=='sections')o[k]=over[k]});return o}
window.EVT={PRESETS:PRESETS,DEFAULTS:DEFAULTS,merge:function(c){return merge(DEFAULTS,c)}};
})();
