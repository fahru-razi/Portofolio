/* Pecah Sandi: API tiruan di browser (tanpa backend). Logika sandi, penilaian, dan pencocokan PUPK diport dari Python. */
(() => {
  const P = window.__PS, root = document.documentElement, page = root.dataset.demoPage, KIND = root.dataset.demoKind;
  const KEYS = ['kotak', 'analog', 'jam', 'kimia', 'matematika'], NAMES = { kotak: 'Kotak III', analog: 'Analog', jam: 'Jam', kimia: 'Kimia', matematika: 'Matematika' };
  const CFG = { min_length: 3, max_length: 30, min_time: 30, max_time: 1800, max_questions: 20 };
  const store = { get: (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } }, del: (k) => { try { sessionStorage.removeItem(k); } catch (e) { /* abaikan */ } } };
  const now = () => Date.now() / 1000, rnd = (n) => Math.floor(Math.random() * n), pick = (a) => a[rnd(a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const unaccent = (t) => (t || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const cleanWord = (t) => (t || '').replace(/[^A-Za-z ]/g, '').toUpperCase().replace(/ +/g, ' ').trim();
  const fold = (t) => unaccent(t).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(), compact = (t) => fold(t).replace(/ /g, '');
  const SAT = ['nol', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const say = (n) => { const r = (x) => (x ? ' ' + say(x) : ''); if (n < 12) return SAT[n]; if (n < 20) return say(n - 10) + ' belas'; if (n < 100) return say(Math.floor(n / 10)) + ' puluh' + r(n % 10); if (n < 200) return 'seratus' + r(n - 100); if (n < 1000) return say(Math.floor(n / 100)) + ' ratus' + r(n % 100); if (n < 2000) return 'seribu' + r(n - 1000); const [s, nm] = [[1e9, 'miliar'], [1e6, 'juta'], [1e3, 'ribu']].find(([x]) => n >= x); return say(Math.floor(n / s)) + ' ' + nm + r(n % s); };
  const spell = (d) => ((d.length > 1 && d[0] === '0') || d.length > 12 ? [...d].map((x) => SAT[+x]).join(' ') : say(+d));
  const toCipher = (t) => cleanWord(unaccent(t).replace(/['’]/g, '').replace(/\d+/g, (m) => ' ' + spell(m) + ' ').replace(/[^A-Za-z]+/g, ' '));
  const sandiFor = (a) => { if (/\d/.test(a)) return null; const t = toCipher(a); return t.replace(/ /g, '').length >= 3 && t.length <= 60 && t.split(' ').every((w) => w.length <= 24) ? t : null; };
  const dist = (a, b) => { let p2 = null, p = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) { let best = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)); if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, p2[j - 2] + 1); c.push(best); } p2 = p; p = c; } return p[b.length]; };
  const grade = (answer, refs, th) => { const g = compact(answer), dg = g.replace(/\D/g, ''); const c = refs.map((r) => { const k = compact(r), ok = Math.max(0, k.length - dist(g, k)); return { letters_correct: ok, letters_total: k.length, similarity: ok / k.length, is_correct: ok * 100 >= th * k.length && dg === k.replace(/\D/g, '') ? 1 : 0 }; }); return c.reduce((b, x) => (x.is_correct > b.is_correct || (x.is_correct === b.is_correct && x.similarity > b.similarity) ? x : b)); };
  const counts = (t) => { const w = t.split(' '); return [w.reduce((n, x) => n + x.length, 0), w.length]; };
  const normAnswer = (a) => (typeof a === 'string' ? a.toUpperCase().replace(/[^A-Z _]/g, '').slice(0, 400) : '');
  const scoreQ = (text, ans) => { const w = text.split(' '), g = ans.split(' '); let lo = 0, lt = 0, wo = 0; w.forEach((x, i) => { const y = g[i] || ''; lt += x.length; for (let k = 0; k < Math.min(x.length, y.length); k++) if (x[k] === y[k]) lo++; if (y === x) wo++; }); return { letters_correct: lo, letters_total: lt, words_correct: wo, words_total: w.length, is_correct: wo === w.length ? 1 : 0 }; };
  const final = (sc, a) => { const [o, t] = sc === 'huruf' ? [a.lc, a.lt] : sc === 'kata' ? [a.wc, a.wt] : [a.qc, a.qt]; return t ? Math.round((1000 * o) / t) / 10 : 0; };
  const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
  const err = (m, s = 400, extra = {}) => reply({ error: m, ...extra }, s);
  const rows = (g) => P.items.filter((i) => g === null || i.group_id === g);

  /* ---------- Sandi (latihan) ---------- */
  const COLS = ['id', 'cipher', 'mode', 'scoring', 'length', 'num_questions', 'time_limit', 'status', 'group_id'];
  const activeOf = () => { const a = store.get('ps_attempt'); return a && a.status === 'active' ? a : null; };
  const activePayload = (a) => ({ attempt: Object.fromEntries(COLS.map((k) => [k, a[k]])), questions: a.questions.map((q) => ({ idx: q.idx, text: q.text })), remaining: Math.max(0, a.deadline_at - now()) });
  const fullPayload = (a) => ({ attempt: { ...a, user_id: 1, questions: undefined }, questions: a.questions });
  function createAttempt(d) {
    const num = (k, lo, hi, l) => { const v = parseInt(d[k], 10); if (!(v >= lo && v <= hi)) throw new Error(`${l} harus antara ${lo} dan ${hi}.`); return v; };
    try {
      if (!KEYS.includes(d.cipher)) throw new Error('Pilih sandi yang tersedia.');
      if (!['random', 'database', 'pupk'].includes(d.mode)) throw new Error('Mode soal tidak dikenal.');
      if (!['huruf', 'kata', 'utuh'].includes(d.scoring)) throw new Error('Mode penilaian tidak dikenal.');
      if (d.mode === 'random' && d.scoring === 'kata') throw new Error('Penilaian per kata hanya untuk soal dari bank soal.');
      let n = num('num_questions', 1, CFG.max_questions, 'Jumlah soal'); const tl = num('time_limit', CFG.min_time, CFG.max_time, 'Waktu (detik)');
      let texts, length = null, note = null, gid = null;
      if (d.mode === 'random') { length = num('length', CFG.min_length, CFG.max_length, 'Panjang huruf'); texts = Array.from({ length: n }, () => Array.from({ length }, () => String.fromCharCode(65 + rnd(26))).join('')); }
      else {
        let src; if (d.mode === 'database') src = P.words; else { gid = d.group_id === null || d.group_id === '' || d.group_id === undefined ? null : parseInt(d.group_id, 10); src = [...new Set(rows(gid).map((i) => sandiFor(i.answer)).filter(Boolean))]; }
        if (!src.length) throw new Error(d.mode === 'database' ? 'Bank soal masih kosong.' : 'Belum ada jawaban PUPK yang bisa disandikan di pilihan ini.');
        texts = shuffle(src).slice(0, n); if (texts.length < n) { note = `Sumber soal hanya punya ${texts.length} pilihan, jadi soal dikurangi.`; n = texts.length; }
      }
      const t0 = now(), id = (store.get('ps_next') || 100) + 1; store.set('ps_next', id);
      const tot = texts.reduce((a, t) => { const [l, w] = counts(t); return [a[0] + l, a[1] + w]; }, [0, 0]);
      const a = { id, cipher: d.cipher, mode: d.mode, scoring: d.scoring, length, num_questions: n, time_limit: tl, started_at: t0, deadline_at: t0 + tl, finished_at: null, status: 'active', timed_out: 0, score: null, letters_correct: 0, letters_total: tot[0], words_correct: 0, words_total: tot[1], questions_correct: 0, questions_total: n, duration: null, group_id: gid, questions: texts.map((t, i) => ({ idx: i, text: t })) };
      store.set('ps_attempt', a); return reply({ ...activePayload(a), note }, 201);
    } catch (e) { return err(e.message); }
  }
  function submitAttempt(a, body) {
    if (now() > a.deadline_at + 5) { a.status = 'expired'; a.score = 0; store.set('ps_attempt', a); return err('Waktu habis sebelum jawaban terkirim.', 409, { status: 'expired', attempt_id: a.id }); }
    const ag = { lc: 0, lt: 0, wc: 0, wt: 0, qc: 0, qt: a.questions.length };
    a.questions = a.questions.map((q) => { const ans = normAnswer((body.answers || [])[q.idx] || ''), r = scoreQ(q.text, ans); ag.lc += r.letters_correct; ag.lt += r.letters_total; ag.wc += r.words_correct; ag.wt += r.words_total; ag.qc += r.is_correct; return { idx: q.idx, text: q.text, answer: ans, ...r }; });
    const fin = Math.min(now(), a.deadline_at);
    Object.assign(a, { status: 'finished', finished_at: fin, duration: fin - a.started_at, timed_out: now() >= a.deadline_at - 1 ? 1 : 0, score: final(a.scoring, ag), letters_correct: ag.lc, letters_total: ag.lt, words_correct: ag.wc, words_total: ag.wt, questions_correct: ag.qc });
    store.set('ps_attempt', a); return reply(fullPayload(a));
  }

  /* ---------- PUPK dan Kombinasi (run) ---------- */
  const THRESH = 80, KL = { pupk: 'PUPK', kombinasi: 'Kombinasi' }, SL = { huruf: 'per huruf', utuh: 'utuh' };
  const newRun = (kind, gid, title, scoring, shuffled, list) => { const l = shuffled ? shuffle(list) : list.slice(), c = kind === 'kombinasi' ? cipherSeq(l.length) : l.map(() => null); return { id: 100 + (store.get('ps_next') || 0), kind, group_id: gid, title, scoring, shuffled: shuffled ? 1 : 0, status: 'active', started_at: now(), updated_at: now(), finished_at: null, items: l.map((r, i) => ({ idx: i, question: r.question, answer: r.answer, alt_answers: r.alts || r.alt_answers || [], cipher: c[i], cipher_text: c[i] ? toCipher(r.question) : null, user_answer: null, letters_correct: 0, letters_total: compact(r.answer).length, similarity: 0, is_correct: 0, answered_at: null })) }; };
  const cipherSeq = (n) => { let o = []; while (o.length < n) o = o.concat(shuffle(KEYS)); return o.slice(0, n); };
  const pub = (r) => { const it = r.items, lc = it.reduce((a, x) => a + x.letters_correct, 0), lt = it.reduce((a, x) => a + x.letters_total, 0), qc = it.reduce((a, x) => a + x.is_correct, 0); return { id: r.id, kind: r.kind, title: r.title, scoring: r.scoring, shuffled: r.shuffled, status: r.status, total: it.length, answered: it.filter((x) => x.answered_at).length, letters_correct: lc, letters_total: lt, questions_correct: qc, score: final(r.scoring, { lc, lt, qc, qt: it.length }) }; };
  const view = (r, x, reveal) => { const done = !!x.answered_at, show = done || reveal, v = { idx: x.idx, done, cipher: x.cipher, cipher_text: x.cipher_text }; if (r.kind === 'pupk' || show) v.question = x.question; if (show) Object.assign(v, { key: x.answer, alts: x.alt_answers, answer: x.user_answer, is_correct: x.is_correct, letters_correct: x.letters_correct, letters_total: x.letters_total, similarity: x.similarity }); return v; };
  const runPayload = (r) => ({ run: pub(r), items: r.items.map((x) => view(r, x, r.status === 'finished')) });
  const curRun = (kind) => { let r = store.get('ps_run'); if (!r || (kind && r.kind !== kind)) { r = newRun(kind || 'pupk', null, 'Semua kelompok', 'huruf', false, P.items); store.set('ps_run', r); } return r; };
  const startRun = (kind, gid, scoring, shuffled, list, title) => { const r = newRun(kind, gid, title, scoring, shuffled, list); store.set('ps_run', r); location.href = `../${kind}-run/index.html`; };
  const verdict = (s) => (s >= 100 ? 'Sempurna. Semua jawaban benar.' : s >= 90 ? 'Hampir sempurna. Tinggal satu dua soal.' : s >= 70 ? 'Bagus. Periksa soal yang salah di bawah.' : s >= 40 ? 'Lumayan. Pelajari kuncinya, lalu ulangi soal yang salah.' : 'Belum hafal. Pelajari kuncinya, lalu coba lagi.');

  window.fetch = (input, init = {}) => {
    const u = new URL(typeof input === 'string' ? input : input.url, location.href), p = u.pathname, m = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    if (p.endsWith('/api/attempts') && m === 'POST') return createAttempt(body);
    if (p.endsWith('/api/attempts/active')) { const a = activeOf(); return reply(a ? activePayload(a) : { attempt: null }); }
    let x = p.match(/\/api\/attempts\/(\d+)\/(submit|cancel)$/);
    if (x) { const a = store.get('ps_attempt'); if (x[2] === 'cancel') { store.del('ps_attempt'); return reply({ ok: true }); } return a ? (a.status === 'finished' ? reply(fullPayload(a)) : submitAttempt(a, body)) : err('Latihan tidak ditemukan.', 404); }
    x = p.match(/\/api\/pupk\/runs\/\d+\/(answer|finish)$/);
    if (x) {
      const r = curRun();
      if (x[1] === 'finish') { r.status = 'finished'; r.finished_at = now(); store.set('ps_run', r); return reply({ url: `../${r.kind}-result/index.html` }); }
      if (r.status !== 'active') return err('Latihan ini sudah selesai.', 409);
      const it = r.items[body.idx]; if (!it || typeof body.answer !== 'string' || !body.answer.trim()) return err('Tulis jawabanmu dulu.');
      if (it.answered_at) return err('Soal ini sudah dijawab.', 409);
      Object.assign(it, grade(body.answer.trim(), [it.answer, ...it.alt_answers], THRESH), { user_answer: body.answer.trim().slice(0, 400), answered_at: now() });
      store.set('ps_run', r); return reply({ item: view(r, it, false), run: pub(r) });
    }
    return Promise.reject(new Error('offline'));
  };

  /* ---------- halaman ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fnum = (v) => { v = Math.round(v * 10) / 10; return Number.isInteger(v) ? String(v) : String(v).replace('.', ','); };
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const fdt = (ts) => { const d = new Date(ts * 1000 + (d0 => d0)(0)), j = new Date(d.getTime() + (7 * 60 + d.getTimezoneOffset()) * 60000); return `${j.getDate()} ${BULAN[j.getMonth()]} ${j.getFullYear()}, ${String(j.getHours()).padStart(2, '0')}.${String(j.getMinutes()).padStart(2, '0')}`; };
  function renderResult(r) {
    const run = pub(r), items = runPayload(r).items, h = (c) => c, back = run.questions_correct < run.total;
    const b = (t) => run.scoring === t ? '<span class="tag">Dasar nilai</span> ' : '';
    const rv = items.map((it) => `<article class="rv pv"><div class="rv-head"><span>Soal ${it.idx + 1}</span>${!it.done ? '<span class="badge">Belum dijawab</span>' : it.is_correct && it.similarity >= 1 ? '<span class="badge ok">Benar</span>' : it.is_correct ? '<span class="badge warn">Benar, ejaan sedikit berbeda</span>' : '<span class="badge bad">Belum tepat</span>'}${it.done ? `<small>${it.letters_correct} dari ${it.letters_total} huruf · mirip ${Math.round(it.similarity * 100)}%</small>` : ''}${it.cipher ? `<small>sandi ${NAMES[it.cipher]}</small>` : ''}</div><p class="qtext">${esc(it.question)}</p><dl class="fb"><div><dt>Jawabanmu</dt><dd>${it.answer ? esc(it.answer) : '–'}</dd></div><div><dt>Kunci</dt><dd>${esc(it.key)}${it.alts && it.alts.length ? ` <span class="muted">(atau: ${it.alts.map(esc).join(', ')})</span>` : ''}</dd></div></dl></article>`).join('');
    return `<h1 class="sr-only">Hasil ${KL[run.kind]} #${run.id}</h1><p class="small muted" style="margin-bottom:14px"><a href="../history/index.html">Riwayat</a> / ${KL[run.kind]} #${run.id} · ${fdt(r.finished_at || r.updated_at)}</p><div class="result-top"><div class="score-row"><div class="score-lcd" role="img" aria-label="Nilai ${fnum(run.score)} dari 100">${fnum(run.score)}</div><span class="score-unit">dari 100</span></div><p class="score-sub">${verdict(run.score)}</p></div><p class="small muted">${KL[run.kind]} · ${esc(run.title)} · dinilai ${SL[run.scoring]}${run.shuffled ? ' · urutan acak' : ''}</p><dl class="metrics"><div class="metric ${run.scoring === 'huruf' ? 'is-scored' : ''}"><dt>${b('huruf')}Huruf benar</dt><dd>${run.letters_correct}<small> / ${run.letters_total}</small></dd></div><div class="metric ${run.scoring === 'utuh' ? 'is-scored' : ''}"><dt>${b('utuh')}Soal benar</dt><dd>${run.questions_correct}<small> / ${run.total}</small></dd></div><div class="metric"><dt>Dijawab</dt><dd>${run.answered}<small> / ${run.total}</small></dd></div></dl><div class="result-actions">${back ? `<form method="post" action="/pupk/run/${run.id}/ulang" style="display:contents"><button class="btn btn-primary" type="submit">Ulangi ${run.total - run.questions_correct} soal yang salah</button></form>` : ''}<a class="btn ${back ? '' : 'btn-primary'}" href="../${run.kind}/index.html">Mulai latihan lain</a><a class="btn btn-quiet" href="../history/index.html">Lihat riwayat</a></div><section class="review"><h2>Tinjau jawaban</h2><p class="small muted" style="margin-bottom:6px">Kunci jawaban ditampilkan di bawah tiap soal.</p>${rv}</section>`;
  }
  if (page === 'run') {
    const r = curRun(KIND), el = document.getElementById('run-data'); if (el) el.textContent = JSON.stringify(runPayload(r));
    const k = document.querySelector('.run-kicker'), dot = ' <span aria-hidden="true">·</span> ';
    if (k) k.innerHTML = `${KL[r.kind]}${dot}${esc(r.title)}${dot}dinilai ${SL[r.scoring]}${r.shuffled ? dot + 'urutan acak' : ''}`;
  }
  if (page === 'result') { const r = curRun(KIND); if (r.status !== 'finished') { r.status = 'finished'; r.finished_at = now(); store.set('ps_run', r); } const w = document.querySelector('.game-wrap'); if (w) w.innerHTML = renderResult(r); }
  let t; const toast = () => { let e = document.getElementById('demoToast'); if (!e) { e = document.createElement('div'); e.id = 'demoToast'; e.setAttribute('role', 'status'); e.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;background:#0b1220;color:#e6edf7;border:1px solid #22d3ee;border-radius:10px;padding:10px 16px;font:600 13px system-ui,sans-serif'; document.body.append(e); } e.textContent = 'Mode demo: aksi disimulasikan dan tidak disimpan.'; e.style.display = 'block'; clearTimeout(t); t = setTimeout(() => { e.style.display = 'none'; }, 2600); };
  window.addEventListener('submit', (e) => {
    const f = e.target, act = f.getAttribute('action') || '';
    if (f.id === 'start-form') {
      e.preventDefault(); const fd = new FormData(f), kind = fd.get('kind'), sub = e.submitter ? e.submitter.value : 'all', gid = sub === 'all' || sub === '' ? null : parseInt(sub, 10), g = P.groups.find((x) => x.id === gid);
      return startRun(kind, gid, fd.get('scoring') || 'huruf', !!fd.get('shuffled'), rows(gid), g ? g.name : 'Semua kelompok');
    }
    if (act.endsWith('/reset')) { e.preventDefault(); const r = curRun(); startRun(r.kind, r.group_id, r.scoring, !!r.shuffled, r.items.map((x) => ({ question: x.question, answer: x.answer, alts: x.alt_answers })), r.title); return; }
    if (act.endsWith('/ulang')) { e.preventDefault(); const r = curRun(); startRun(r.kind, r.group_id, r.scoring, !!r.shuffled, r.items.filter((x) => !x.is_correct).map((x) => ({ question: x.question, answer: x.answer, alts: x.alt_answers })), r.title.replace(/ · soal yang salah$/, '') + ' · soal yang salah'); return; }
    if (!e.defaultPrevented) { e.preventDefault(); toast(); }
  });
})();
