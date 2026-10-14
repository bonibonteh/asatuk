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
    const list=document.createElement('div');list.className='event-grid';root.appendChild(list);
    function render(mode){const rows=data.filter(x=>mode==='all'||(mode==='past'?x.starts_at&&new Date(x.starts_at).getTime()<now:!x.starts_at||new Date(x.starts_at).getTime()>=now));list.replaceChildren();if(!rows.length){showMessage(list,mode==='past'?'No past events published yet.':'No upcoming events published yet.');return}
    rows.forEach(item=>{const article=document.createElement('article');article.className='event-card';if(item.cover_image_url&&/^https?:\/\//i.test(item.cover_image_url)){const image=document.createElement('img');image.src=item.cover_image_url;image.alt='';image.loading='lazy';image.className='event-cover';article.appendChild(image)}const body=document.createElement('div');body.className='event-card-body';const dt=document.createElement('span');dt.className='event-date';dt.textContent=date(item.starts_at);const h=document.createElement('h2');h.textContent=item.title||'ASA TUK event';const desc=document.createElement('p');desc.textContent=item.description||'More details will be shared by ASA TUK.';const meta=document.createElement('p');meta.className='event-meta';meta.textContent=(item.venue||'Venue to be confirmed')+(item.ends_at?' · Ends '+date(item.ends_at):'');body.append(dt,h,desc,meta);if(item.registration_url&&/^https?:\/\//i.test(item.registration_url)){const a=document.createElement('a');a.href=item.registration_url;a.target='_blank';a.rel='noopener noreferrer';a.className='event-register';a.textContent='Register ↗';body.appendChild(a)}article.appendChild(body);list.appendChild(article)})}
    bar.addEventListener('click',e=>{const b=e.target.closest('[data-event-filter]');if(!b)return;bar.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render(b.dataset.eventFilter)});render('upcoming');
  }

  async function loadNews() {
    const root = document.querySelector('.posts');
    if (!root) return;
    const {data, error} = await db.from('announcements')
      .select('title,body,category,published_at,created_at')
      .eq('status', 'published')
      .order('published_at', {ascending: false});

    if (error) {
      console.error('ASA TUK news could not load:', error);
      showMessage(root, 'New online announcements could not load. Please refresh the page.');
      return;
    }
    if (!data || data.length === 0) { showMessage(root, 'No published news yet. New announcements will appear here after an administrator publishes them.'); return; }

    data.forEach(item => {
      // Avoid duplicates if an announcement is also maintained in the static page content.
      const titleText = String(item.title || '').trim().toLowerCase();
      const duplicate = Array.from(root.querySelectorAll('article.post h3'))
        .some(h => h.textContent.trim().toLowerCase() === titleText);
      if (duplicate) return;
      const article = document.createElement('article');
      article.className = 'post';
      const meta = document.createElement('div');
      meta.className = 'pm';
      const time = document.createElement('time');
      time.textContent = date(item.published_at || item.created_at);
      const category = document.createElement('span');
      category.textContent = item.category || 'Announcement';
      meta.append(time, category);
      const body = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = item.title || 'ASA TUK announcement';
      const paragraph = document.createElement('p');
      paragraph.textContent = item.body || '';
      body.append(heading, paragraph);
      article.append(meta, body);
      root.prepend(article);
    });
  }

  // Netlify serves these pages through both pretty URLs (/events, /news)
  // and their physical HTML paths (/events.html, /news.html).
  if (/(^|\/)events(?:\.html)?\/?$/.test(path)) loadEvents();
  if (/(^|\/)news(?:\.html)?\/?$/.test(path)) loadNews();
})();