/* ASA TUK — live snowfall.
   One fixed, click-through <canvas> over the whole viewport. Flakes are generated continuously, drift side to side,
   rotate slightly and vary in size, speed and opacity. Lightweight: sprites are pre-rendered, particle count scales with
   screen size and device capability, animation pauses when the tab is hidden and is disabled for prefers-reduced-motion. */
(() => {
  'use strict';
  try { init(); } catch (e) { /* snow is decorative: never let it break a page */ }
  function init() {
  if (window.__asatukSnow) return;            // never create a second instance
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce && reduce.matches) return;       // respect accessibility setting
  const canvas = document.createElement('canvas');
  canvas.id = 'asatuk-snow'; canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9990;display:block;background:transparent';
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  window.__asatukSnow = { canvas, flakes: 0, frames: 0 };

  const weak = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) || (navigator.deviceMemory && navigator.deviceMemory <= 2);
  let W = 0, H = 0, dpr = 1, flakes = [], raf = 0, last = 0, running = false;

  // Pre-rendered sprites (soft white flake with a faint cool outline so it reads on light and dark backgrounds)
  const sprite = (draw, size) => { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size / 2); return c; };
  const dot = sprite((g, r) => {
    g.shadowColor = 'rgba(70,105,160,.75)'; g.shadowBlur = r * 0.35; g.fillStyle = '#fff';
    g.beginPath(); g.arc(r, r, r * 0.62, 0, 7); g.fill();
    g.shadowBlur = 0; g.strokeStyle = 'rgba(80,115,170,.85)'; g.lineWidth = 2; g.beginPath(); g.arc(r, r, r * 0.62, 0, 7); g.stroke();
  }, 48);
  const crystal = sprite((g, r) => {
    g.translate(r, r); g.lineCap = 'round';
    const arms = (col, w) => { g.strokeStyle = col; g.lineWidth = w; for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r * 0.85); g.moveTo(0, -r * 0.5); g.lineTo(r * 0.22, -r * 0.7); g.moveTo(0, -r * 0.5); g.lineTo(-r * 0.22, -r * 0.7); g.stroke(); } };
    arms('rgba(70,105,160,.95)', 7); arms('#fff', 3.6);
  }, 96);

  const target = () => { const base = Math.min(170, Math.max(50, Math.round((W * H) / 8000))); return Math.max(24, Math.round(base * (W < 700 ? 0.55 : 1) * (weak ? 0.6 : 1))); };
  const make = (initial) => {
    const big = Math.random() < 0.2, size = big ? 18 + Math.random() * 14 : 8 + Math.random() * 8;
    const fast = Math.random() < 0.1;
    return { x: Math.random() * W, y: initial ? Math.random() * H : -size - Math.random() * 60, size, crystal: big && Math.random() < 0.7,
      vy: (fast ? 70 + Math.random() * 50 : 22 + Math.random() * 42) * (0.6 + size / 18), amp: 8 + Math.random() * 30, freq: 0.25 + Math.random() * 0.7, ph: Math.random() * 6.28, drift: (Math.random() - 0.5) * 12,
      a: big ? 0.95 : 0.8 + Math.random() * 0.2, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 1.2, t: Math.random() * 100 };
  };
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = target(); while (flakes.length < n) flakes.push(make(true)); if (flakes.length > n) flakes.length = n;
  };
  const frame = (now) => {
    if (!running) return; raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i]; f.t += dt; f.y += f.vy * dt; f.rot += f.vr * dt; f.x += f.drift * dt;
      const x = f.x + Math.sin(f.t * f.freq + f.ph) * f.amp;
      if (f.y > H + f.size || x < -60 || x > W + 60) { flakes[i] = make(false); continue; }
      ctx.globalAlpha = f.a;
      if (f.crystal) { ctx.save(); ctx.translate(x, f.y); ctx.rotate(f.rot); ctx.drawImage(crystal, -f.size / 2, -f.size / 2, f.size, f.size); ctx.restore(); }
      else ctx.drawImage(dot, x - f.size / 2, f.y - f.size / 2, f.size, f.size);
    }
    ctx.globalAlpha = 1; window.__asatukSnow.frames++; window.__asatukSnow.flakes = flakes.length;
  };
  const start = () => { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };
  const mount = () => { document.documentElement.appendChild(canvas); resize(); start(); }; // on <html>: the page body carries a transform that would otherwise stop 'fixed' from meaning the viewport
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', (e) => { if (e.matches) { stop(); canvas.remove(); } else { mount(); } });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', () => { if (!document.hidden && canvas.isConnected) start(); });
  mount();
  }
})();
