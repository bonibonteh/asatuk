(function(){
  const cfg = window.ASATUK_SUPABASE;
  if (!cfg || !window.supabase) return;
  const db = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const path = location.pathname.toLowerCase();

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }
  function date(value) {
    if (!value) return 'Date to be confirmed';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? safe(value) :
      d.toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'});
  }
  function showMessage(root, text) {
    const p = document.createElement('p');
    p.className = 'evnote';
    p.setAttribute('role', 'status');
    p.textContent = text;
    root.appendChild(p);
  }

  async function loadEvents() {
    const root=document.querySelector('.ev');if(!root)return;root.replaceChildren();
    const {data,error}=await db.from('events').select('id,title,description,starts_at,ends_at,venue,cover_image_url,registration_url,status').eq('status','published').order('starts_at',{ascending:true});
    if(error){console.error('ASA TUK events could not load:',error);showMessage(root,'Events could not load right now. Please refresh the page.');return}
    if(!data||!data.length){showMessage(root,'No published events yet. Please check back soon.');return}
    const now=Date.now(),bar=document.createElement('div');bar.className='event-filter';bar.setAttribute('role','group');bar.setAttribute('aria-label','Filter events');bar.innerHTML='<button type="button" class="event-filter-btn active" data-event-filter="upcoming">Upcoming</button><button type="button" class="event-filter-btn" data-event-filter="past">Past events</button><button type="button" class="event-filter-btn" data-event-filter="all">All events</button>';root.before(bar);
    const list=document.createElement('div');list.className='event-grid';root.appendChild(list);let detail=document.getElementById('event-detail-dialog');if(!detail){detail=document.createElement('dialog');detail.id='event-detail-dialog';detail.className='event-detail-dialog';detail.innerHTML='<button type="button" class="event-detail-close" aria-label="Close event details">×</button><div class="event-detail-content"></div>';document.body.appendChild(detail);detail.querySelector('.event-detail-close').addEventListener('click',()=>detail.close());detail.addEventListener('click',e=>{if(e.target===detail)detail.close()})}
    function render(mode){const rows=data.filter(x=>mode==='all'||(mode==='past'?x.starts_at&&new Date(x.starts_at).getTime()<now:!x.starts_at||new Date(x.starts_at).getTime()>=now));list.replaceChildren();if(!rows.length){showMessage(list,mode==='past'?'No past events published yet.':'No upcoming events published yet.');return}
    rows.forEach(item=>{const article=document.createElement('article');article.className='event-card';if(item.cover_image_url&&/^https?:\/\//i.test(item.cover_image_url)){const image=document.createElement('img');image.src=item.cover_image_url;image.alt='';image.loading='lazy';image.className='event-cover';article.appendChild(image)}const body=document.createElement('div');body.className='event-card-body';const dt=document.createElement('span');dt.className='event-date';dt.textContent=date(item.starts_at);const h=document.createElement('h2');h.textContent=item.title||'ASA TUK event';const desc=document.createElement('p');desc.textContent=item.description||'More details will be shared by ASA TUK.';const meta=document.createElement('p');meta.className='event-meta';meta.textContent=(item.venue||'Venue to be confirmed')+(item.ends_at?' · Ends '+date(item.ends_at):'');body.append(dt,h,desc,meta);if(item.registration_url&&/^https?:\/\//i.test(item.registration_url)){const a=document.createElement('a');a.href=item.registration_url;a.target='_blank';a.rel='noopener noreferrer';a.className='event-register';a.textContent='Register ↗';body.appendChild(a)}article.appendChild(body);article.tabIndex=0;article.setAttribute('role','button');article.setAttribute('aria-label','View details for '+(item.title||'ASA TUK event'));function openDetail(){const content=detail.querySelector('.event-detail-content');content.replaceChildren();if(item.cover_image_url&&/^https?:\/\//i.test(item.cover_image_url)){const im=document.createElement('img');im.src=item.cover_image_url;im.alt='';im.className='event-detail-image';content.appendChild(im)}const h=document.createElement('h2');h.textContent=item.title||'ASA TUK event';const dateEl=document.createElement('p');dateEl.textContent=date(item.starts_at)+(item.ends_at?' · Ends '+date(item.ends_at):'');const venueEl=document.createElement('p');venueEl.textContent=item.venue||'Venue to be confirmed';const description=document.createElement('p');description.textContent=item.description||'More details will be shared by ASA TUK.';content.append(h,dateEl,venueEl,description);if(item.registration_url&&/^https?:\/\//i.test(item.registration_url)){const a=document.createElement('a');a.href=item.registration_url;a.target='_blank';a.rel='noopener noreferrer';a.className='event-register';a.textContent='Register ↗';content.appendChild(a)}detail.showModal()}article.addEventListener('click',openDetail);article.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail()}});list.appendChild(article)})}
    bar.addEventListener('click',e=>{const b=e.target.closest('[data-event-filter]');if(!b)return;bar.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render(b.dataset.eventFilter)});render('upcoming');
  }

  function words(text,max){
    const w=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
    return w.length>max?w.slice(0,max).join(' ').replace(/[.,;:\-–—]+$/,'')+'…':w.join(' ');
  }
  function isUrl(u){return /^https?:\/\//i.test(String(u||''))}
  function isImg(u){return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(u||''))}
  function dayOnly(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}
  function getDialog(){
    let d=document.getElementById('detail-dialog');
    if(!d){d=document.createElement('dialog');d.id='detail-dialog';d.className='event-detail-dialog';d.innerHTML='<button type="button" class="event-detail-close" aria-label="Close details">×</button><div class="event-detail-content"></div>';document.body.appendChild(d);d.querySelector('.event-detail-close').addEventListener('click',()=>d.close());d.addEventListener('click',e=>{if(e.target===d)d.close()})}
    return d;
  }
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  function linkBtn(href,text,cls){const a=el('a',cls||'event-register',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a}
  function openDetail(build){const d=getDialog(),c=d.querySelector('.event-detail-content');c.replaceChildren();build(c);d.showModal()}

  async function loadNews() {
    const root = document.querySelector('.posts');
    if (!root) return;
    const {data, error} = await db.from('announcements')
      .select('title,body,category,image_url,published_at,created_at')
      .eq('status', 'published')
      .order('published_at', {ascending: false});
    if (error) { console.error('ASA TUK news could not load:', error); showMessage(root, 'New online announcements could not load. Please refresh the page.'); return; }
    if (!data || data.length === 0) { showMessage(root, 'No published news yet. New announcements will appear here after an administrator publishes them.'); return; }
    data.forEach(item => {
      const titleText = String(item.title || '').trim().toLowerCase();
      const duplicate = Array.from(root.querySelectorAll('article.post h3')).some(h => h.textContent.trim().toLowerCase() === titleText);
      if (duplicate) return;
      const when = date(item.published_at || item.created_at), title = item.title || 'ASA TUK announcement', cat = item.category || 'Announcement';
      const article = el('article','post');
      const meta = el('div','pm'); const time = el('time','',when); meta.append(time, el('span','',cat));
      const body = el('div');
      const heading = el('h3','',title);
      const summary = el('p','post-summary',words(item.body,35));
      const more = el('button','read-more','Read more →'); more.type='button';
      more.setAttribute('aria-label','Read more: '+title);
      more.addEventListener('click',()=>openDetail(c=>{
        if(isUrl(item.image_url)&&isImg(item.image_url)){const im=el('img','event-detail-image');im.src=item.image_url;im.alt='';c.appendChild(im)}
        c.append(el('h2','',title),el('p','event-meta',when+' · '+cat));
        const full=el('p','full-text',item.body||'');full.style.whiteSpace='pre-line';c.appendChild(full);
        if(isUrl(item.image_url)&&!isImg(item.image_url))c.appendChild(linkBtn(item.image_url,'Open attachment ↗'));
      }));
      body.append(heading, summary, more);
      if(isUrl(item.image_url)&&isImg(item.image_url)){const image=el('img','news-cover');image.src=item.image_url;image.alt='';image.loading='lazy';article.appendChild(image)}
      article.append(meta, body);
      root.appendChild(article);
    });
  }

  async function loadOpportunities() {
    const root = document.querySelector('.opps');
    if (!root) return;
    const {data, error} = await db.from('opportunities')
      .select('id,title,description,organisation,category,deadline,application_url,created_at')
      .eq('status','published').order('created_at',{ascending:false});
    if (error) { console.error('ASA TUK opportunities could not load:', error); showMessage(root,'Opportunities could not load right now. Please refresh the page.'); return; }
    if (!data || !data.length) { showMessage(root,'No opportunities published yet. Please check back soon.'); return; }
    const today=new Date();today.setHours(0,0,0,0);
    const rows=data.slice().sort((a,b)=>{const ea=a.deadline&&new Date(a.deadline)<today,eb=b.deadline&&new Date(b.deadline)<today;if(!!ea!==!!eb)return ea?1:-1;return (a.deadline?new Date(a.deadline).getTime():Infinity)-(b.deadline?new Date(b.deadline).getTime():Infinity)});
    const grid=el('div','event-grid');root.appendChild(grid);
    rows.forEach(item=>{
      const title=item.title||'ASA TUK opportunity',closed=item.deadline&&new Date(item.deadline)<today;
      const card=el('article','event-card opp-card');const body=el('div','event-card-body');
      const tag=el('span','event-date',(item.category||'Opportunity')+(item.organisation?' · '+item.organisation:''));
      const h=el('h2','',title);
      const dl=el('p','opp-deadline',item.deadline?(closed?'Closed ':'Deadline: ')+dayOnly(item.deadline):'Deadline: not stated');if(closed)dl.classList.add('closed');
      const sum=el('p','',words(item.description,45));
      const more=el('button','read-more','View opportunity →');more.type='button';more.setAttribute('aria-label','View opportunity: '+title);
      more.addEventListener('click',()=>openDetail(c=>{
        c.append(el('h2','',title),el('p','event-meta',[item.category,item.organisation].filter(Boolean).join(' · ')||'Opportunity'),el('p','opp-deadline'+(closed?' closed':''),item.deadline?(closed?'Closed ':'Deadline: ')+dayOnly(item.deadline):'Deadline: not stated'));
        const full=el('p','full-text',item.description||'More details will be shared by ASA TUK.');full.style.whiteSpace='pre-line';c.appendChild(full);
        if(isUrl(item.application_url))c.appendChild(linkBtn(item.application_url,(isImg(item.application_url)||/\.(pdf|docx?|pptx?|xlsx?)(\?|$)/i.test(item.application_url))?'Open attachment ↗':'Apply / learn more ↗'));
      }));
      body.append(tag,h,dl,sum,more);card.appendChild(body);grid.appendChild(card);
    });
  }

  // Netlify serves these pages through both pretty URLs (/events, /news)
  // and their physical HTML paths (/events.html, /news.html).
  if (/(^|\/)events(?:\.html)?\/?$/.test(path)) loadEvents();
  if (/(^|\/)news(?:\.html)?\/?$/.test(path)) loadNews();
  if (/(^|\/)opportunities(?:\.html)?\/?$/.test(path)) loadOpportunities();
})();