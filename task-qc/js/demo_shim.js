/* Shim demo (tanpa backend): menjawab fetch('/tasks?...') dan /api/dashboard-data dari data di halaman, dan mensimulasikan aksi tulis. */
(() => {
  const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  const reply = (body, type = 'text/html') => Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': type } }));
  const wrap = (m) => { const o = history[m].bind(history); history[m] = (...a) => { try { o(...a); } catch (e) { /* file:// */ } }; };
  wrap('pushState'); wrap('replaceState');
  let base = null;
  document.addEventListener('DOMContentLoaded', () => {
    const g = (id) => document.getElementById(id);
    if (g('taskContainer')) base = { tab: g('taskTabMenu').innerHTML, items: [...g('taskContainer').children].map((n) => n.cloneNode(true)), modals: g('taskModalsWrapper').innerHTML };
  }, { once: true });
  function tasks(u) {
    const p = u.searchParams, list = (k) => p.getAll(k).flatMap((v) => v.split(',')).filter((v) => v && v !== 'All');
    const projs = list('project'), pkgs = list('package'), q = (p.get('q') || '').trim().toLowerCase(), status = p.get('status') || 'All', by = p.get('sort_by') || 'updated', dir = p.get('sort_order') || 'desc';
    const other = base.items.filter((n) => !n.hasAttribute('data-category'));
    let cards = base.items.filter((n) => n.hasAttribute('data-category') && (!projs.length || projs.includes(n.dataset.project)) && (!pkgs.length || pkgs.includes(n.dataset.package)) && (!q || n.textContent.toLowerCase().includes(q)));
    const tab = document.createElement('div'); tab.innerHTML = base.tab;
    tab.querySelectorAll('[data-status]').forEach((b) => { const s = b.dataset.status, n = b.querySelector('.task-count-badge'); b.classList.toggle('active', s === status); if (n) n.textContent = s === 'All' ? cards.length : cards.filter((c) => c.dataset.category === s).length; });
    if (status !== 'All') cards = cards.filter((c) => c.dataset.category === status);
    const key = { 'task-id': (c) => c.dataset.taskId, 'task-name': (c) => c.dataset.taskName, pullable: (c) => +c.dataset.pullable || 0 }[by] || ((c) => +c.dataset.updated);
    cards = [...cards].sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'asc' ? 1 : -1); });
    return `<!doctype html><html><body><div id="taskTabMenu">${tab.innerHTML}</div><div id="taskContainer">${cards.concat(other).map((c) => c.outerHTML).join('')}</div><div id="taskModalsWrapper">${base.modals}</div><div id="paginationWrapper"></div></body></html>`;
  }
  window.fetch = (input, init = {}) => {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href);
    if ((init.method || 'GET').toUpperCase() !== 'GET') return reply('{"status":"ok","success":true,"demo":true}', 'application/json');
    if (u.pathname.endsWith('/api/dashboard-data')) {
      const d = window.__DEMO_DASH || {}, f = u.searchParams.get('filter') || 'All', pr = (u.searchParams.get('project') || 'All').split(',').sort().join(',');
      return reply(JSON.stringify(d[`${f}|${pr}`] || d['All|All'] || {}), 'application/json');
    }
    if (base && u.pathname === location.pathname) return reply(tasks(u));
    return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error('offline'));
  };
  let t;
  window.addEventListener('submit', (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault(); toast();
  });
  function toast() {
    let el = document.getElementById('demoToast');
    if (!el) { el = document.createElement('div'); el.id = 'demoToast'; el.setAttribute('role', 'status'); el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#0b1220;color:#e6edf7;border:1px solid #22d3ee;border-radius:10px;padding:10px 16px;font:600 13px system-ui,sans-serif'; document.body.append(el); }
    el.textContent = 'Mode demo: aksi disimulasikan dan tidak disimpan.'; el.style.display = 'block'; clearTimeout(t); t = setTimeout(() => { el.style.display = 'none'; }, 2600);
  }
})();
