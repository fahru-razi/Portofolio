/* Demo E-Commerce Dashboard: tab, dan animasi visual yang hanya berjalan saat terlihat. */
(() => {
  const $$ = (s) => [...document.querySelectorAll(s)];
  const tabs = $$('[role=tab]');
  const show = (t) => tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n); } });
  });
  const pvs = $$('.pv');
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('on', e.isIntersecting)), { threshold: 0.3 }); pvs.forEach((v) => io.observe(v)); }
  else pvs.forEach((v) => v.classList.add('on'));
})();