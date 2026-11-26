/* Halaman Sentiment Analysis Data Pipeline: tab, animasi saat terlihat, dan simulasi aturan label polarity. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- tab ---------- */
  const tabs = $$('[role=tab]');
  const show = (t, focus) => {
    tabs.forEach((x) => {
      const on = x === t;
      x.setAttribute('aria-selected', on);
      x.tabIndex = on ? 0 : -1;
      $('#' + x.getAttribute('aria-controls')).hidden = !on;
    });
    $$('.sc[data-start=end]').forEach((s) => { if (!s.closest('[hidden]')) s.scrollLeft = s.scrollWidth; });
    if (focus) t.focus();
    try { history.replaceState(null, '', '#' + t.dataset.k); } catch (e) { /* abaikan */ }
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => {
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      show(tabs[(to + tabs.length) % tabs.length], true);
    });
  });
  const start = tabs.find((t) => '#' + t.dataset.k === location.hash);
  if (start) show(start);

  /* ---------- animasi hanya berjalan saat visual terlihat ---------- */
  const pvs = $$('.pv');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('on', e.isIntersecting)), { threshold: 0.3 });
    pvs.forEach((v) => io.observe(v));
  } else pvs.forEach((v) => v.classList.add('on'));

  /* ---------- simulasi aturan label (sentiment_analysis.py) ---------- */
  const pol = $('#pol');
  if (!pol) return;
  const out = $('#polv'), needle = $('#needle'), chip = $('#chip'), row = $('#rowout');
  const fmt = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',');
  const rules = { positive: '#r1', neutral: '#r2', negative: '#r3' }, cls = { positive: 'ok', neutral: 'wt', negative: 'no' };
  const update = () => {
    const v = Math.round(parseFloat(pol.value) * 100) / 100;
    const label = v > 0 ? 'positive' : v === 0 ? 'neutral' : 'negative';
    out.textContent = fmt(v);
    pol.setAttribute('aria-valuetext', fmt(v) + ', ' + label);
    needle.style.left = ((v + 1) / 2 * 100) + '%';
    chip.textContent = label;
    chip.className = 'cp ' + cls[label];
    Object.entries(rules).forEach(([k, sel]) => $(sel).classList.toggle('on', k === label));
    row.textContent = "{'text': 'summary berita …', 'sentiment': '" + label + "'}";
  };
  pol.addEventListener('input', update);
  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pol.value = b.dataset.v;
    update();
  });
  update();
})();