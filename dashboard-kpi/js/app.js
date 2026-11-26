/* Demo Dashboard KPI & laporan otomatis: logika Apps Script (kode di index.html) dijalankan di browser dengan data sintetis. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ---------- tab utama ---------- */
  const tabs = $$('[role=tab]');
  const show = (t) => tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n); } });
  });

  /* ---------- Alur pipeline (visual) ---------- */
  const pvs = $$('.pv');
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('on', e.isIntersecting)), { threshold: 0.3 }); pvs.forEach((v) => io.observe(v)); }
  else pvs.forEach((v) => v.classList.add('on'));

  /* ---------- Laporan otomatis (replika sidebar + sheet) ---------- */
  const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = rng(20261117), iso = (d) => d.toISOString().slice(0, 10), TODAY = '2026-11-17';
  const PROJ = ['Project Alpha', 'Project Beta', 'Project Gamma'];
  const PRODS = [['Rina Lestari', [0, 1]], ['Dito Pratama', [0]], ['Maya Anggraini', [1, 2]], ['Bagas Wijaya', [0, 2]], ['Sinta Maharani', [1]], ['Eko Prasetyo', [2]], ['Citra Dewi', [0, 1]], ['Fajar Nugroho', [2]], ['Hana Putri', [0]], ['Indra Kusuma', [1, 2]]];
  const ERRS = ['Poor lighting', 'Rigid movement', 'Object mismatch', 'Wrong scene', 'Task incomplete'];
  const MASTER = [];
  for (let k = 29; k >= 0; k--) {
    const d = new Date(Date.UTC(2026, 10, 17 - k)); if (d.getUTCDay() === 0) continue;
    const tgl = iso(d), recent = k <= 1;
    PRODS.forEach(([name, ps]) => {
      if (R() < 0.1) return;
      ps.forEach((pi) => {
        const total = 6 + Math.floor(R() * 17), avg = 1700 + R() * 800, f = Math.round(total * (0.07 + R() * 0.1)), w = Math.round(total * (recent ? 0.25 + R() * 0.2 : 0.02 + R() * 0.04)), p = Math.max(0, total - f - w);
        const dur = Math.round(total * avg * 100) / 100, pd = dur * p / total, fd = dur * f / total, wd = dur - pd - fd, tr = (s) => [s, s / 60, s / 3600];
        MASTER.push([tgl, name, PROJ[pi], ...tr(dur), ...tr(pd), ...tr(fd), ...tr(wd), total, p, f, w, p + f ? (p / (p + f) * 100).toFixed(1) + '%' : '', f ? ERRS[Math.floor(R() * ERRS.length)] : '']);
      });
    });
  }
  const C = { title: '#1F3864', date: '#2E75B6', sub: '#BDD7EE', tot: '#375623', totBg: '#E2EFDA', totFg: '#1A3100', even: '#DDEEFF', odd: '#FFFFFF', failBg: '#FCE4E4', failFg: '#8A1C1C', waitBg: '#FFF3D6', waitFg: '#8A6400' };
  const rc = (r) => (r === null ? ['#F2F2F2', '#595959'] : r >= 80 ? ['#C6EFCE', '#276221'] : r >= 50 ? ['#FFEB9C', '#9C6500'] : ['#FFC7CE', '#9C0006']);
  const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100, f2 = (n) => r2(n).toFixed(2);
  const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const tglIndo = (s) => { const p = s.split('-'); return +p[2] + ' ' + BLN[+p[1] - 1] + ' ' + p[0]; };
  const tglPendek = (s) => { const p = s.split('-'); return ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay()] + ' ' + +p[2] + '/' + +p[1]; };
  const K = ['dur', 'pass', 'fd', 'wd', 'n', 'p', 'f', 'w'];
  const agg = (rows) => { const o = { dur: 0, pass: 0, fd: 0, wd: 0, n: 0, p: 0, f: 0, w: 0 }; rows.forEach((r) => { o.dur += r[5]; o.pass += r[8]; o.fd += r[11]; o.wd += r[14]; o.n += r[15]; o.p += r[16]; o.f += r[17]; o.w += r[18]; }); return o; };
  const rate = (o) => (o.p + o.f ? o.p / (o.p + o.f) * 100 : null), rs = (v) => (v === null ? '-' : v.toFixed(1) + '%');
  const cell = (v, st = '', cls = '') => `<td class="${cls}" style="${st}">${v}</td>`;
  function detail(rows, dates, proj, periode) {
    const pm = {}, bd = {}; dates.forEach((d) => { bd[d] = { dur: 0, pass: 0 }; });
    rows.forEach((r) => { (pm[r[1]] = pm[r[1]] || []).push(r); });
    const names = Object.keys(pm).sort(), T = agg(rows), rt = rate(T), [sbg, sfg] = rc(rt), cols = 2 + dates.length * 2 + 5;
    const th = (t, bg, extra = '') => `<th ${extra} style="background:${bg};color:#fff">${t}</th>`;
    let h = `<table><tr><th colspan="${cols}" style="background:${C.title};color:#fff;font-size:13px;padding:6px">PRODUCTION QUALITY  |  ${esc(proj)}  |  ${periode}</th></tr>`;
    h += `<tr><td colspan="${cols}" class="l" style="background:${sbg};color:${sfg};font-weight:700;font-size:10px">📊 Total Dur: ${f2(T.dur)} h | Passed: ${f2(T.pass)} h | Failed: ${f2(T.fd)} h | Waiting: ${f2(T.wd)} h | Video: ${T.n} | Passed: ${T.p} | Failed: ${T.f} | Waiting: ${T.w} | Pass Rate: ${rs(rt)}</td></tr>`;
    h += `<tr>${th('No', C.title, 'rowspan="2"')}${th('Producer', C.title, 'rowspan="2"')}${dates.map((d) => th(tglPendek(d), C.date, 'colspan="2"')).join('')}${['Total Dur', 'Total Pass', 'Total Failed', 'Total Waiting', 'Pass Rate'].map((t) => th(t, C.tot, 'rowspan="2"')).join('')}</tr>`;
    h += '<tr>' + dates.map(() => `<th style="background:${C.sub};color:${C.title};font-size:9px">Dur</th><th style="background:${C.sub};color:${C.title};font-size:9px">Pass</th>`).join('') + '</tr>';
    names.forEach((n, i) => {
      const p = agg(pm[n]), bg = i % 2 ? C.odd : C.even, [rb, rf] = rc(rate(p)), by = {};
      pm[n].forEach((r) => { const b = by[r[0]] || (by[r[0]] = { dur: 0, pass: 0 }); b.dur += r[5]; b.pass += r[8]; });
      h += `<tr>${cell(i + 1, `background:${bg}`)}${cell(esc(n), `background:${bg}`, 'l')}`;
      dates.forEach((d) => { const b = by[d]; if (b) { bd[d].dur += b.dur; bd[d].pass += b.pass; } h += cell(b ? f2(b.dur) : '', `background:${bg}`) + cell(b ? f2(b.pass) : '', `background:${bg}`); });
      h += cell(f2(p.dur), `background:${C.totBg};color:${C.totFg};font-weight:700`) + cell(f2(p.pass), `background:${C.totBg};color:${C.totFg};font-weight:700`) + cell(f2(p.fd), `background:${C.failBg};color:${C.failFg};font-weight:700`) + cell(f2(p.wd), `background:${C.waitBg};color:${C.waitFg};font-weight:700`) + cell(rs(rate(p)), `background:${rb};color:${rf};font-weight:700`) + '</tr>';
    });
    const tb = `background:${C.title};color:#fff;font-weight:700`;
    h += `<tr>${cell('', tb)}${cell('TOTAL', tb, 'l')}${dates.map((d) => cell(f2(bd[d].dur), tb) + cell(f2(bd[d].pass), tb)).join('')}${[T.dur, T.pass, T.fd, T.wd].map((v) => cell(f2(v), tb)).join('')}${cell(rs(rt), `background:${sbg};color:${sfg};font-weight:700`)}</tr></table>`;
    return h;
  }
  function summary(map, list, periode) {
    let G = { dur: 0, pass: 0, fd: 0, wd: 0, n: 0, p: 0, f: 0, w: 0 }, h = `<table><tr><th colspan="10" style="background:${C.title};color:#fff;font-size:13px;padding:6px">PROJECT SUMMARY  |  ${periode}</th></tr><tr>${['Project', 'Total Dur (h)', 'Total Pass (h)', 'Total Failed (h)', 'Total Waiting (h)', 'Total Video', 'Passed', 'Failed', 'Waiting', 'Pass Rate'].map((t) => `<th style="background:${C.date};color:#fff">${t}</th>`).join('')}</tr>`;
    list.forEach((pr, i) => {
      const a = agg(map[pr]), bg = i % 2 ? C.odd : C.even, [rb, rf] = rc(rate(a)); K.forEach((k) => { G[k] += a[k]; });
      h += `<tr>${cell(esc(pr), `background:${bg};font-weight:700`, 'l')}${cell(f2(a.dur), `background:${C.totBg};color:${C.totFg};font-weight:700`)}${cell(f2(a.pass), `background:${C.totBg};color:${C.totFg};font-weight:700`)}${cell(f2(a.fd), `background:${C.failBg};color:${C.failFg};font-weight:700`)}${cell(f2(a.wd), `background:${C.waitBg};color:${C.waitFg};font-weight:700`)}${[a.n, a.p, a.f, a.w].map((v) => cell(v, `background:${bg}`)).join('')}${cell(rs(rate(a)), `background:${rb};color:${rf};font-weight:700`)}</tr>`;
    });
    const [gb, gf] = rc(rate(G)), tb = `background:${C.title};color:#fff;font-weight:700`;
    return h + `<tr>${cell('TOTAL KESELURUHAN', tb, 'l')}${[G.dur, G.pass, G.fd, G.wd].map((v) => cell(f2(v), tb)).join('')}${[G.n, G.p, G.f, G.w].map((v) => cell(v, tb)).join('')}${cell(rs(rate(G)), `background:${gb};color:${gf};font-weight:700`)}</tr></table>`;
  }
  const masterHtml = () => '<table><tr>' + ['Tanggal', 'Producer', 'Project', 'Durasi Detik', 'Durasi Menit', 'Durasi Jam', 'Passed Detik', 'Passed Menit', 'Passed Jam', 'Failed Detik', 'Failed Menit', 'Failed Jam', 'Waiting Detik', 'Waiting Menit', 'Waiting Jam', 'Jumlah Video', 'Passed', 'Failed', 'Waiting', 'Pass Rate', 'Top Error'].map((t) => `<th style="background:#f1f3f4;font-weight:700">${t}</th>`).join('') + '</tr>' + MASTER.slice(-80).map((r) => '<tr>' + r.map((v) => `<td>${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : esc(v)}</td>`).join('') + '</tr>').join('') + '</table>';

  const sheets = { MASTER_DATA: masterHtml() };
  let cur = 'MASTER_DATA', period = 'month', mode = 'detail';
  const drawSheets = () => {
    $('#sheetTabs').innerHTML = Object.keys(sheets).map((n) => `<button type="button" aria-pressed="${n === cur}" data-n="${esc(n)}">${esc(n)}</button>`).join('');
    $('#grid').innerHTML = sheets[cur];
  };
  $('#sheetTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { cur = b.dataset.n; drawSheets(); } });
  const chips = (el, items, get, set) => {
    el.innerHTML = items.map(([k, t]) => `<button type="button" data-k="${k}" class="${get() === k ? 'on' : ''}">${t}</button>`).join('');
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; set(b.dataset.k); $$('button', el).forEach((x) => x.classList.toggle('on', x === b)); });
  };
  chips($('#presets'), [['today', 'Hari Ini'], ['week', 'Minggu Ini'], ['month', 'Bulan Ini'], ['custom', 'Custom']], () => period, (k) => { period = k; $('#custom').hidden = k !== 'custom'; });
  chips($('#modes'), [['detail', '📁 Detail per Project'], ['summary', '📊 Summary (Semua Project)']], () => mode, (k) => { mode = k; $('#projCard').hidden = k !== 'detail'; });
  $('#projList').innerHTML = PROJ.map((p, i) => `<div class="pi"><input type="checkbox" class="pchk" id="pj${i}" value="${esc(p)}" checked><label for="pj${i}">${esc(p)}</label></div>`).join('');
  const cnt = () => { $('#cnt').textContent = $$('.pchk:checked').length + ' dari ' + PROJ.length + ' project dipilih'; };
  $('#projList').addEventListener('change', cnt); cnt();
  const range = () => {
    const d = new Date(TODAY + 'T00:00:00Z');
    if (period === 'today') return [TODAY, TODAY];
    if (period === 'week') { const day = d.getUTCDay() || 7, a = new Date(d), b = new Date(d); a.setUTCDate(d.getUTCDate() - day + 1); b.setUTCDate(d.getUTCDate() - day + 7); return [iso(a), iso(b)]; }
    if (period === 'month') return [iso(new Date(Date.UTC(2026, 10, 1))), iso(new Date(Date.UTC(2026, 11, 0)))];
    return [$('#df').value, $('#dt').value];
  };
  function build(from, to, sel) {
    const rows = MASTER.filter((r) => r[0] >= from && r[0] <= to && (!sel || sel.includes(r[2])));
    if (!rows.length) throw new Error('Tidak ada data pada rentang ' + from + ' – ' + to + (sel ? ' untuk project yang dipilih.' : '.'));
    const map = {}; rows.forEach((r) => { (map[r[2]] = map[r[2]] || []).push(r); });
    const list = Object.keys(map).sort(), dates = [...new Set(rows.map((r) => r[0]))].sort(), periode = from === to ? tglIndo(from) : tglIndo(from) + ' – ' + tglIndo(to);
    if (mode === 'summary') { sheets['Monthly Summary'] = summary(map, list, periode); cur = 'Monthly Summary'; drawSheets(); return `Monthly Summary diperbarui! ${list.length} project pada periode ${periode}.\n(Sheet detail per project (RPT_*) tidak diubah oleh mode ini.)`; }
    list.forEach((p) => { sheets['RPT_' + p] = detail(map[p], dates, p, periode); });
    cur = 'RPT_' + list[list.length - 1]; drawSheets();
    return `Detail per project selesai! ${list.length} project diproses:\n` + list.map((p) => `• ${p} (${new Set(map[p].map((r) => r[1])).size} producer)`).join('\n') + `\nPeriode: ${periode}\n(Sheet Monthly Summary tidak diubah oleh mode ini.)`;
  }
  $('#gen').addEventListener('click', () => {
    const [from, to] = range(), st = $('#status'), say = (m, c) => { st.className = 'status ' + c; st.textContent = m; };
    if (!from || !to || from > to) return say('⚠️ Rentang tanggal tidak valid.', 'e');
    const sel = mode === 'detail' ? $$('.pchk:checked').map((c) => c.value) : null;
    if (mode === 'detail' && !sel.length) return say('⚠️ Pilih minimal 1 project.', 'e');
    say(`Membuat laporan ${from} s/d ${to}...`, 'l'); $('#gen').disabled = true;
    setTimeout(() => { try { say('✅ ' + build(from, to, sel), 'd'); } catch (e) { say('❌ ' + e.message, 'e'); } $('#gen').disabled = false; }, 450);
  });
  drawSheets();
})();