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
    const root = document.querySelector('.ev');
    if (!root) return;
    // Remove sample placeholder events so visitors see the actual published records.
    root.replaceChildren();
    const {data, error} = await db.from('events')
      .select('title,description,starts_at,venue,registration_url,status')
      .eq('status', 'published')
      .order('starts_at', {ascending: false});

    if (error) {
      console.error('ASA TUK events could not load:', error);
      showMessage(root, 'Events could not load right now. Please refresh or check the ASA TUK news page.');
      return;
    }
    if (!data || data.length === 0) {
      showMessage(root, 'No published events yet. Please check back soon.');
      return;
    }

    data.forEach(item => {
      const li = document.createElement('li');
      const title = document.createElement('b');
      title.textContent = date(item.starts_at);
      const details = document.createElement('div');
      const name = document.createElement('b');
      name.textContent = item.title || 'ASA TUK event';
      const desc = document.createElement('em');
      desc.textContent = item.description || '';
      details.append(name, desc);
      const venue = document.createElement('span');
      venue.textContent = item.venue || 'ASA TUK';
      if (item.registration_url) {
        venue.append(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.href = item.registration_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Register';
        venue.append(link);
      }
      li.append(title, details, venue);
      root.appendChild(li);
    });
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

  if (path.endsWith('events.html')) loadEvents();
  if (path.endsWith('news.html')) loadNews();
})();