(() => {
  const d = document, $ = s => [...d.querySelectorAll(s)];
  const rm = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const bars = [[22, 45], [52, 28], [82, 52], [112, 18], [142, 38]].map(([x, y], i) => `<rect x="${x}" y="${y}" width="18" height="${90 - y}" rx="2" style="animation-delay:${i * .3}s"/>`).join('');
  const rows = [90, 70, 100, 60].map((w, i) => `<rect class="r" x="14" y="${28 + i * 14}" width="${w}" height="7" rx="3" style="animation-delay:${i * .4}s"/>`).join('');
  const W = (u, b) => `<svg viewBox="0 0 200 100"><rect class="f" x="4" y="4" width="192" height="92" rx="6"/><circle class="a" cx="13" cy="11" r="2.2"/><circle class="b" cx="20" cy="11" r="2.2"/><circle class="c" cx="27" cy="11" r="2.2"/><rect x="36" y="7" width="130" height="8" rx="4" fill="#16223a"/><text class="u" x="42" y="13">${u}</text>${b}</svg>`;
  const dc = ['#4ade80', '#fbbf24', '#f87171'], tm = (a, i) => (a + i * .6).toFixed(2) + 's';
  const V = {
    cc: '<iframe src="cc-indonesia/html/manager/dashboard/index.html" title="" tabindex="-1" loading="lazy" aria-hidden="true"></iframe>',
    helpdesk: '<iframe src="helpdesk-it/html/agent/board/index.html" title="" tabindex="-1" loading="lazy" aria-hidden="true"></iframe>',
    qc: '<iframe src="task-qc/html/quality-control/tasks/index.html" title="" tabindex="-1" loading="lazy" aria-hidden="true"></iframe>',
    diabetes: '<iframe src="deteksi-diabetes/app/index.html" title="" tabindex="-1" loading="lazy" aria-hidden="true"></iframe>',
    sandi: '<iframe src="pecah-sandi/html/play/index.html" title="" tabindex="-1" loading="lazy" aria-hidden="true"></iframe>',
    app: `<svg viewBox="0 0 200 100"><rect class="f" x="6" y="6" width="188" height="88" rx="6"/><circle class="a" cx="16" cy="15" r="2.5"/><circle class="b" cx="24" cy="15" r="2.5"/><circle class="c" cx="32" cy="15" r="2.5"/>${rows}<circle class="map" cx="150" cy="58" r="24"/><circle class="pin" cx="150" cy="58" r="4"/><circle class="ping" cx="150" cy="58" r="4"/></svg>`,
    sent: `<svg viewBox="0 0 200 100"><text class="sl" x="48" y="11">extract_load</text><text class="sl" x="152" y="11">sa_load</text><path class="sb sb1" d="M6 21V16H90V21"/><path class="sb sb2" d="M110 21V16H194V21"/><path class="flow" d="M38 50H58M90 50H162"/>${[0, 1, 2].map(i => `<circle class="sd1" r="3" style="animation-delay:${tm(0, i)}"/>`).join('')}${dc.map((c, i) => `<circle class="sd2" r="3" style="--dc:${c};animation-delay:${tm(3.5, i)}"/>`).join('')}<rect class="nb" x="6" y="34" width="32" height="32" rx="6"/><text class="nt" x="22" y="53">API</text><rect class="nb" x="58" y="34" width="32" height="32" rx="6"/>${[0, 1, 2].map(i => `<rect class="sdoc" x="64" y="${40 + i * 7}" width="20" height="4" rx="2" style="animation-delay:${tm(.54, i)}"/>`).join('')}<rect class="nb" x="110" y="34" width="32" height="32" rx="6"/>${dc.map((c, i) => `<circle class="sc" cx="${118 + i * 8}" cy="50" r="3" fill="${c}" style="animation-delay:${tm(4.9, i)}"/>`).join('')}<rect class="nb" x="162" y="34" width="32" height="32" rx="6"/>${dc.map((c, i) => `<g class="sr" style="animation-delay:${tm(6.5, i)}"><circle cx="169" cy="${42 + i * 8}" r="2.2" fill="${c}"/><rect x="175" y="${40 + i * 8}" width="13" height="4" rx="2" fill="#2b4a66"/></g>`).join('')}<text class="sl" x="22" y="78">Finnhub</text><text class="sl" x="74" y="78">MongoDB</text><text class="sl" x="126" y="78">TextBlob</text><text class="sl" x="178" y="78">PostgreSQL</text><text class="sl" x="100" y="94">cron 0 0 * * * · harian 00:00 UTC</text></svg>`,
    vr: `<svg viewBox="0 0 200 100">${[19, 45, 71].map((y, i) => `<g><rect class="vb" x="6" y="${y - 9}" width="32" height="18" rx="7"/><circle class="vl" cx="17" cy="${y}" r="3.2" style="animation-delay:${i * .5}s"/><circle class="vl" cx="27" cy="${y}" r="3.2" style="animation-delay:${i * .5}s"/></g><path class="flow" d="M38 ${y}C62 ${y} 64 50 80 50"/>`).join('')}${[19, 45, 71].map((y, i) => [0, 1.5].map(o => `<circle class="vp" r="2.6" style="offset-path:path('M38 ${y}C62 ${y} 64 50 80 50');animation-delay:${(i * .5 + o).toFixed(1)}s"/>`).join('')).join('')}<rect class="vpc" x="80" y="37" width="30" height="20" rx="3"/><path class="vpl" d="M85 44H100M85 50H94"/><path class="vst" d="M90 63H100M95 57V63"/><path class="flow" d="M112 47H128"/>${[3, 3.5, 4].map(s => `<circle class="vq" r="2.4" style="offset-path:path('M112 47H128');animation-delay:${s}s"/>`).join('')}${[['vfa', 22, 3.6], ['vfb', 42, 4.1], ['vfc', 62, 4.6]].map(([c, y, s]) => `<path class="vfd ${c}" d="M130 ${y}h8l2 3h13v11h-23z" style="animation-delay:${s}s"/>`).join('')}<rect class="nb" x="166" y="30" width="30" height="40" rx="6"/>${[16, 11, 20].map((w, i) => `<rect class="vrb" x="171" y="${38 + i * 9}" width="${w}" height="4" rx="2" style="animation-delay:${5.8 + i * .25}s"/>`).join('')}<text class="sl" x="22" y="92">Headset VR</text><text class="sl" x="95" y="92">PC</text><text class="sl" x="143" y="92">per task</text><text class="sl" x="181" y="92">ringkasan</text></svg>`,
    loan: `<svg viewBox="0 0 200 100">${[['Waktu', 10, 56.25, '−44%'], ['Biaya', 32, 74.5, '−25,4%'], ['Tenaga kerja', 54, 66.7, '−33%']].map(([n, y, p, d], i) => `<text class="bs" x="6" y="${y + 9.5}">${n}</text><rect class="bm" x="52" y="${y}" width="98" height="6" rx="3"/><rect class="bx" x="${(52 + 98 * p / 100).toFixed(1)}" y="${y + 8}" width="${(98 * (100 - p) / 100).toFixed(1)}" height="6" rx="3"/><rect class="bg" x="52" y="${y + 8}" width="${(98 * p / 100).toFixed(1)}" height="6" rx="3" style="animation-delay:${i * .4}s"/><text class="bt" x="194" y="${y + 11.5}">${d}</text>`).join('')}<rect class="bm" x="6" y="77" width="4" height="4" rx="1"/><text class="bs" x="13" y="80.4">manual</text><rect class="bg2" x="44" y="77" width="4" height="4" rx="1"/><text class="bs" x="51" y="80.4">dengan model</text><text class="bs" x="6" y="94">akurasi</text><rect class="lt" x="52" y="88" width="98" height="6" rx="3"/><rect class="lf" x="52" y="88" width="88.1" height="6" rx="3"/><text class="bt c" x="194" y="94">89,9%</text></svg>`,
    credit: (() => {
      const R = [[0, 3, 1], [1, 7, 1], [2, 1, 1], [3, 5, 0], [4, 9, 1], [5, 2, 1], [6, 6, 0], [7, 0, 1], [8, 4, 1], [9, 8, 0]]; // [baris, kolom, tertangkap?]
      let dots = '';
      for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
        const k = R.find(a => a[0] === r && a[1] === c), x = (9 + c * 5.4).toFixed(1), y = (16 + r * 5.4).toFixed(1);
        dots += `<circle class="${k ? (k[2] ? 'cl-x' : 'cl-r') : 'cl-g'}" cx="${x}" cy="${y}" r="2.1"${k && k[2] ? ` style="--r:${r}"` : ''}/>`;
      }
      return `<svg viewBox="0 0 200 100"><text class="cl-t" x="6" y="9">100 pinjaman disetujui</text>${dots}<rect class="cl-s" x="5" y="14" width="56" height="1.2" rx=".6"/><path class="cl-dv" d="M70 8V92"/><circle class="cl-r" cx="8" cy="87" r="2"/><text class="cl-t" x="13" y="89">bad</text><circle class="cl-g" cx="30" cy="87" r="2"/><text class="cl-t" x="35" y="89">good</text>` +
        `<text class="cl-t" x="84" y="13">bad loan tertangkap (recall)</text>` +
        `<text class="cl-t" x="84" y="24">RF</text><rect class="cl-k" x="96" y="20" width="70" height="5" rx="2.5"/><rect class="cl-b cl-rf" x="96" y="20" width="35" height="5" rx="2.5"/><text class="cl-v cl-o" x="170" y="24.5" style="fill:#93a4bd">50%</text>` +
        `<text class="cl-t" x="84" y="34">XGB</text><rect class="cl-k" x="96" y="30" width="70" height="5" rx="2.5"/><rect class="cl-b cl-xg" x="96" y="30" width="53.2" height="5" rx="2.5"/><text class="cl-v cl-o" x="170" y="34.5">76%</text>` +
        `<text class="cl-t" x="84" y="50">default rate pinjaman disetujui</text>` +
        `<text class="cl-big cl-a" x="84" y="68" style="fill:#f87171">10,3%</text><text class="cl-big cl-o" x="84" y="68" style="fill:#4ade80">2,7%</text>` +
        `<g class="cl-o"><rect x="140" y="56" width="50" height="12" rx="6" fill="none" stroke="#4ade80"/><text class="cl-v" x="165" y="63.8" style="fill:#4ade80;text-anchor:middle">−7,6 poin</text></g>` +
        `<rect class="cl-k" x="84" y="78" width="106" height="6" rx="3"/><rect class="cl-d" x="84" y="78" width="91" height="6" rx="3"/>` +
        `<text class="cl-t cl-a" x="84" y="94">penilaian manual</text><text class="cl-t cl-o" x="84" y="94" style="fill:#4ade80">dengan XGBoost</text></svg>`;
    })(),
    elig: `<svg viewBox="0 0 200 100"><text class="sl" x="40" y="11">akurasi</text><text class="sl" x="146" y="11">risiko kelompok ditandai</text><circle class="el-t" cx="40" cy="42" r="24"/><circle class="el-r" cx="40" cy="42" r="24" transform="rotate(-90 40 42)"/><text class="el-n" x="40" y="45.5">91,2%</text><path class="el-a1" d="M110 66A36 36 0 0 1 120.5 40.5"/><path class="el-a2" d="M120.5 40.5A36 36 0 0 1 182 66"/><text class="el-m" x="113" y="36">1×</text><g class="el-nd"><path class="el-pn" d="M146 66V38"/><circle cx="146" cy="66" r="2.8" fill="#e6edf7"/></g><text class="el-v" x="146" y="79">2,8× rata-rata</text><text class="el-l el-x" x="8" y="86">pemohon layak disetujui</text><text class="el-l el-e el-y" x="192" y="86">98,9%</text><rect class="el-bt" x="8" y="90" width="184" height="4" rx="2"/><rect class="el-bc" x="8" y="90" width="182" height="4" rx="2"/></svg>`,
    pipe: `<svg viewBox="0 0 200 100"><path class="flow" d="M30 50H170"/><g class="n"><rect x="8" y="36" width="44" height="28" rx="6"/><rect x="78" y="36" width="44" height="28" rx="6"/><rect x="148" y="36" width="44" height="28" rx="6"/><text x="30" y="54">E</text><text x="100" y="54">T</text><text x="170" y="54">L</text></g><circle class="dot" r="3.5"/></svg>`,
    dash: `<svg viewBox="0 0 200 100"><path class="ax" d="M12 10V90H190"/><g class="bars">${bars}</g><path class="ln" d="M20 70L60 55L90 62L120 30L150 42L185 18"/></svg>`,
    ml: `<svg viewBox="0 0 200 100"><path class="ax" d="M12 10V90H190"/><path class="ax" stroke-dasharray="3 4" d="M12 90L190 10"/><path class="ln" d="M12 90C30 40 60 22 190 12"/></svg>`
  };
  $('.vis').forEach(e => {
    e.innerHTML = V[e.dataset.v === 'shot' ? 'dash' : e.dataset.v];
    if (e.dataset.v !== 'shot') return;
    const i = new Image(); i.alt = '';
    i.onload = () => e.replaceChildren(i);
    i.src = e.dataset.src;
  });
  $('.vis iframe').forEach(f => { const p = f.parentElement, fit = () => { f.style.transform = `scale(${p.clientWidth / 1280})`; }; fit(); new ResizeObserver(fit).observe(p); });

  $('[data-g]').forEach(e => { const n = d.querySelectorAll('#' + e.dataset.g + ' .card').length; e.dataset.n = n; e.textContent = n; });

  const mq = d.querySelector('.mq'), t = mq.dataset.t.split(',').map(s => `<span>${s}</span>`).join('');
  mq.innerHTML = `<div>${t}${t}</div>`;

  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  $('.rv').forEach((e, i) => { e.style.transitionDelay = (i % 3) * 90 + 'ms'; io.observe(e); });

  const cu = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    cu.unobserve(e.target);
    const n = +e.target.dataset.n, s = e.target.dataset.s || '', t0 = performance.now();
    if (rm) return;
    const f = now => { const p = Math.min((now - t0) / 1400, 1); e.target.textContent = Math.round(n * (1 - (1 - p) ** 3)) + s; if (p < 1) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  $('[data-n]').forEach(e => cu.observe(e));

  d.addEventListener('pointermove', e => {
    const c = e.target.closest('.card,.cert');
    if (!c) return;
    const r = c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    c.style.setProperty('--mx', x + 'px'); c.style.setProperty('--my', y + 'px');
    if (c.classList.contains('cert') && !rm) { c.style.setProperty('--ry', (x / r.width - .5) * 10 + 'deg'); c.style.setProperty('--rx', (.5 - y / r.height) * 10 + 'deg'); }
  });
  $('.cert').forEach(c => {
    c.addEventListener('pointerleave', () => { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); });
    if (c.dataset.img) { c.classList.add('has'); c.insertAdjacentHTML('afterbegin', `<img src="${c.dataset.img}" alt="" loading="lazy">`); }
  });

  const bar = d.getElementById('prog'), tl = d.querySelector('.tl'); let tk = 0;
  const up = () => {
    tk = 0; const h = d.documentElement;
    bar.style.setProperty('--p', h.scrollTop / (h.scrollHeight - h.clientHeight || 1));
    const r = tl.getBoundingClientRect();
    tl.style.setProperty('--tp', Math.max(0, Math.min(1, (innerHeight * .7 - r.top) / r.height)));
  };
  addEventListener('scroll', () => tk || (tk = requestAnimationFrame(up)), { passive: true }); up();

  const links = $('nav a');
  const nav = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(a => a.removeAttribute('aria-current'));
    const a = links.find(a => a.hash === '#' + e.target.id);
    if (a) a.setAttribute('aria-current', 'true');
  }), { rootMargin: '-40% 0px -55% 0px' });
  $('main section[id]').forEach(s => nav.observe(s));

  const hd = d.querySelector('.top'), mb = d.querySelector('.menu');
  if (hd && mb) {
    const set = o => { hd.classList.toggle('open', o); mb.setAttribute('aria-expanded', o); mb.setAttribute('aria-label', o ? 'Tutup menu' : 'Buka menu'); };
    mb.addEventListener('click', () => set(!hd.classList.contains('open')));
    links.forEach(a => a.addEventListener('click', () => set(false)));
    d.addEventListener('pointerdown', e => { if (!hd.contains(e.target)) set(false); });
    d.addEventListener('keydown', e => { if (e.key === 'Escape' && hd.classList.contains('open')) { set(false); mb.focus(); } });
    matchMedia('(max-width:40rem)').addEventListener('change', () => set(false));
  }
})();