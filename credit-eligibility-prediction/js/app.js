(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const nf = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const f = (n, d = 1) => n.toFixed(d).replace('.', ',');
  const rm = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const C1 = '#22d3ee', C2 = '#4ade80', BAD = '#f87171', WN = '#fbbf24', INK = '#e6edf7';
  const H = (t, p) => `<h3>${t}</h3>${p ? `<p class="cap">${p}</p>` : ''}`;
  const PC = (a, k = '') => `<div class="pc ${k}">${a.map(x => `<span>${x}</span>`).join('')}</div>`;
  const LG = a => `<div class="lg">${a.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>`;

  // ---------- Angka sumber (notebook: final project.ipynb) ----------
  const N = { tot: 307511, ok: 282686, bad: 24825, val: 61503, vok: 56554, vbad: 4949 };
  // Matriks kebingungan data uji (positif = layak). LR & LGBM direkonstruksi dari akurasi, presisi, recall di notebook.
  const M = {
    all: { tp: 56554, fp: 4949, tn: 0, fn: 0, auc: .5, nm: 'Tanpa model (semua disetujui)' },
    lr: { tp: 54160, fp: 4411, tn: 538, fn: 2394, auc: .5332, nm: 'Logistic Regression' },
    lgb: { tp: 55911, fp: 4762, tn: 187, fn: 643, auc: .5132, nm: 'LightGBM' }
  };

  // ---------- pembersih timer/animasi antar tahap ----------
  let off = [];
  const later = (fn, ms) => { const id = setTimeout(fn, ms); off.push(() => clearTimeout(id)); };
  const every = (fn, ms) => { const id = setInterval(fn, ms); off.push(() => clearInterval(id)); };
  const tween = (ms, fn, done) => {
    if (rm) { fn(1); done && done(); return () => {}; }
    let id, t0; const st = t => { t0 ??= t; const p = Math.min((t - t0) / ms, 1); fn(1 - (1 - p) ** 3); if (p < 1) id = requestAnimationFrame(st); else done && done(); };
    id = requestAnimationFrame(st); const c = () => cancelAnimationFrame(id); off.push(c); return c;
  };

  // =====================================================================
  // 1. MASALAH & DATA
  // =====================================================================
  const RING = () => {
    const R = 70, C = 2 * Math.PI * R, l = C * N.bad / N.tot;
    return `<svg class="ringv" viewBox="0 0 200 200" role="img" aria-label="Dari 307.511 pemohon, 91,9% layak dan 8,1% gagal bayar" style="--l:${l.toFixed(1)}">
      <circle class="rg-t" cx="100" cy="100" r="${R}"/><circle class="rg-g" cx="100" cy="100" r="${R}"/>
      <circle class="rg-b" cx="100" cy="100" r="${R}" transform="rotate(-90 100 100)"/>
      <text class="big" x="100" y="102">${nf(N.tot)}</text><text class="sm" x="100" y="120">pemohon kredit</text></svg>`;
  };

  // barcode: satu garis = satu kolom
  const barcode = (n, cls, id) => `<svg class="bc" id="${id || ''}" viewBox="0 0 ${n * 8} 74" role="img" aria-label="${n} kolom data digambar sebagai garis">${Array.from({ length: n }, (_, i) => `<rect class="${cls(i)}" x="${i * 8}" y="4" width="5.5" height="66" rx="1.5" style="--i:${i}"/>`).join('')}</svg>`;

  const TUBE = [['Kontrak tunai', 'Cash loans', .9048], ['Tinggal di rumah / apartemen', 'House / apartment', .8873], ['Mengajukan tanpa pendamping', 'Unaccompanied', .8082], ['Pendidikan menengah', 'Secondary', .7102]];
  const tube = ([t, , s], i) => {
    const top = 130 - 120 * s;
    return `<figure><svg viewBox="0 0 140 140" role="img" aria-label="${t}: ${f(s * 100)}% pemohon"><defs><clipPath id="tc${i}"><circle cx="70" cy="70" r="60"/></clipPath></defs>
      <g clip-path="url(#tc${i})"><rect class="tb-w" x="0" y="${top.toFixed(1)}" width="140" height="${(140 - top).toFixed(1)}" style="--h:${(140 - top).toFixed(1)}px;--i:${i}"/><line class="tb-l" x1="10" x2="130" y1="${top.toFixed(1)}" y2="${top.toFixed(1)}" style="--h:${(140 - top).toFixed(1)}px;--i:${i}"/></g>
      <circle class="tb-o" cx="70" cy="70" r="60"/><text class="pv" x="70" y="80">${f(s * 100)}%</text></svg><figcaption>${t}</figcaption></figure>`;
  };

  const S1 = () => H('1. Satu Pertanyaan: Layak atau Tidak?', 'Home Credit menerima ratusan ribu permohonan. Setiap pemohon berakhir lancar atau gagal bayar, dan model harus menebaknya dari data permohonan.')
    + `<div class="hero2"><div>${RING()}</div><div>
      <div class="co g"><b>${nf(N.ok)}</b><span>layak, membayar sesuai jadwal (91,9%)</span></div>
      <div class="co r"><b>${nf(N.bad)}</b><span>gagal bayar (8,1%), sekitar 1 dari tiap 12,4 pemohon</span></div>
      <p class="cap">Label asli Kaggle memakai 1 untuk kesulitan bayar. Notebook membaliknya: <b>1 = layak</b>, <b>0 = gagal bayar</b>. Jadi pada semua metrik di bawah, "positif" berarti pemohon layak.</p></div></div>`
    + H('2. Dari Berapa Kolom Kita Mulai?', 'Satu garis mewakili satu kolom data. Tabel permohonan digabung dengan rata-rata riwayat kredit dari dua tabel lain untuk tahap eksplorasi.')
    + `<div class="bcw">${barcode(154, i => i < 122 ? 'k' : 'w', 'bc1')}<div class="brk2"><span style="flex:122">122 kolom application_train</span><span style="flex:32">+32 rata-rata riwayat</span></div></div>`
    + `<p class="cap" style="margin-top:.7rem">Gabungan 154 kolom dipakai untuk eksplorasi dan pola Apriori. Model prediksi memakai tabel permohonan (122 kolom) saja.</p>`
    + H('3. Pola yang Paling Sering Muncul', 'Apriori dengan dukungan minimum 70% pada data gabungan. Tinggi cairan = persentase pemohon yang punya ciri itu.')
    + `<div class="tubes">${TUBE.map(tube).join('')}</div>`
    + `<p class="cap" style="margin-top:.8rem">Keempat ciri sangat umum, tetapi nilai lift pasangan aturannya 0,995–1,002, hampir persis 1. Artinya ciri-ciri ini tidak saling menguatkan, jadi tidak ada pola khusus yang bisa dipakai untuk menebak kelayakan.</p>`;

  // =====================================================================
  // 2. PEMBERSIHAN: barcode kolom
  // =====================================================================
  const GR = i => i < 13 ? 'n' : i === 13 ? 't' : i < 20 ? 'c' : i < 70 ? 'i' : i < 105 ? 'r' : 'u'; // fitur numerik, target, kategori, IV, korelasi, null
  const bcls = (i, s) => {
    const g = GR(i);
    if (s === 0) return g === 't' ? 't' : 'p';
    if (s < 4) {
      const dead = (g === 'u' && s >= 1) || (g === 'r' && s >= 2) || (g === 'i' && s >= 3);
      if (dead) return 'x' + { u: 1, r: 2, i: 3 }[g];
      return g === 't' ? 't' : s === 3 ? 'k' : 'p';
    }
    return i < 13 ? 'k' : i === 13 ? 't' : i < 112 ? 'g' : 'off';
  };
  const STG = [
    ['Awal', 122, 'Tabel permohonan apa adanya: 122 kolom untuk 307.511 baris.', null, ['SK_ID_CURR', 'NAME_CONTRACT_TYPE', 'AMT_INCOME_TOTAL', 'DAYS_BIRTH', 'EXT_SOURCE_1', 'OCCUPATION_TYPE', '…']],
    ['Null > 60%', 105, '17 kolom yang lebih dari 60% kosong dibuang karena terlalu sedikit isinya.', '−17', ['OWN_CAR_AGE', 'YEARS_BUILD_*', 'COMMONAREA_*', 'FLOORSMIN_*', 'LIVINGAPARTMENTS_*', 'NONLIVINGAPARTMENTS_*', 'FONDKAPREMONT_MODE']],
    ['Korelasi > 0,6', 70, '35 kolom yang berkorelasi kuat dengan kolom lain dibuang agar informasi tidak ganda.', '−35', ['AMT_GOODS_PRICE', 'AMT_ANNUITY', 'DAYS_EMPLOYED', 'EXT_SOURCE_1', 'CNT_FAM_MEMBERS', 'varian _MODE dan _MEDI']],
    ['Seleksi IV', 20, 'Hanya kolom ber-Information Value 0,02–0,5 yang bertahan: 19 fitur dan 1 target.', '−50', ['AMT_INCOME_TOTAL', 'FLAG_OWN_CAR', 'CNT_CHILDREN', 'NAME_CONTRACT_TYPE', 'SK_ID_CURR', 'FLAG_DOCUMENT_* (kecuali _3)']],
    ['One-hot', 112, '6 kolom kategori (gender, jenis pendapatan, pendidikan, status keluarga, pekerjaan, organisasi) menjadi 98 kolom 0/1.', '+92', ['CODE_GENDER → 3', 'NAME_INCOME_TYPE → 8', 'NAME_EDUCATION_TYPE → 5', 'NAME_FAMILY_STATUS → 6', 'OCCUPATION_TYPE → 18', 'ORGANIZATION_TYPE → 58']]
  ];
  const S2 = () => H('Dari 122 Kolom ke 112 Kolom Siap Model', 'Putar animasinya, atau klik tahap untuk melihat kolom mana yang gugur dan kenapa. Satu garis = satu kolom.')
    + `<div class="tg" id="stg" role="group" aria-label="Tahap pembersihan"><button type="button" class="pl" id="play">▶ Putar</button>${STG.map((s, i) => `<button type="button" data-s="${i}" aria-pressed="false">${s[0]}<small>${s[1]}</small></button>`).join('')}</div>`
    + `<div class="bcw">${barcode(122, i => bcls(i, 0), 'bc2')}</div>`
    + `<div class="cnt"><b id="cn">122</b><span>kolom</span><span class="dl" id="dl"></span></div><p class="sd" id="sd"></p><div id="sx"></div>`
    + LG([['#3a5577', 'kolom bertahan'], [BAD, 'null > 60%'], [WN, 'korelasi tinggi'], ['#33507a', 'IV di luar 0,02–0,5'], [C1, 'fitur terpilih'], [INK, 'target'], [C2, 'hasil one-hot']])
    + `<div class="tiles"><div class="tile"><b>0</b><span>baris ganda pada pemeriksaan data gabungan</span></div><div class="tile wn"><b>19,8%</b><span>EXT_SOURCE_3 kosong (60.965 baris), diisi rata-rata</span></div><div class="tile gd"><b>98</b><span>kolom biner lahir dari 6 kolom kategori</span></div></div>`;
  const I2 = () => {
    const svg = $('#bc2'), rs = $$('rect', svg), cn = $('#cn'); let cur = 0, ply = null, shown = 122, cc = () => {};
    const go = s => {
      cur = s; rs.forEach((r, i) => { r.setAttribute('class', bcls(i, s)); r.style.transitionDelay = (rm ? 0 : i * 3) + 'ms'; });
      const [t, n, d, dl, ex] = STG[s];
      $('#sd').textContent = d; $('#dl').textContent = dl || '';
      $('#sx').innerHTML = `<p class="vt">${s === 0 ? 'Contoh kolom' : s === 4 ? 'Jumlah kolom biner per kategori' : 'Contoh yang gugur'}</p>` + PC(ex, s === 4 ? 'k' : s ? 'x' : '');
      $$('[data-s]').forEach(b => { const on = +b.dataset.s === s; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      const a = shown, b = n; shown = n; cc(); cc = tween(900, p => { cn.textContent = Math.round(a + (b - a) * p); });
    };
    $$('[data-s]').forEach(b => b.addEventListener('click', () => { clearInterval(ply); go(+b.dataset.s); }));
    $('#play').addEventListener('click', () => { clearInterval(ply); go(0); let k = 0; if (rm) { go(4); return; } ply = setInterval(() => { k++; go(k); if (k >= 4) clearInterval(ply); }, 1900); off.push(() => clearInterval(ply)); });
    go(0); if (!rm) later(() => $('#play').click(), 1200);
  };

  // =====================================================================
  // 3. SELEKSI FITUR: lollipop IV
  // =====================================================================
  const IV = [['EXT_SOURCE_3', .4209], ['EXT_SOURCE_2', .3193], ['DAYS_BIRTH', .0862], ['OCCUPATION_TYPE', .0862], ['ORGANIZATION_TYPE', .0734], ['NAME_INCOME_TYPE', .0584], ['AMT_CREDIT', .0528], ['NAME_EDUCATION_TYPE', .0508], ['REGION_RATING_CLIENT', .0483], ['DAYS_LAST_PHONE_CHANGE', .0477], ['REGION_POPULATION_RELATIVE', .0455], ['DAYS_ID_PUBLISH', .0397], ['CODE_GENDER', .0386], ['REG_CITY_NOT_WORK_CITY', .0322], ['FLAG_DOCUMENT_3', .0286], ['DAYS_REGISTRATION', .0283], ['APARTMENTS_AVG', .0251], ['REG_CITY_NOT_LIVE_CITY', .0223], ['NAME_FAMILY_STATUS', .0217]];
  const IVX = [['AMT_INCOME_TOTAL', .0118], ['FLAG_OWN_CAR', .0066], ['CNT_CHILDREN', .0017]];
  const lrow = ([n, v], k) => `<div class="lr ${k}"><span class="n" title="${n}">${n}</span><div class="lt" style="--x:${(v / .5 * 100).toFixed(2)}%"><i class="ls"></i><i class="ld"></i></div><span class="v">${f(v, 3)}</span></div>`;
  const S3 = () => H('Siapa yang Benar-benar Membawa Sinyal?', 'Information Value (IV) menilai seberapa baik satu kolom memisahkan pemohon layak dari yang gagal bayar. Aturan umum di credit scoring: di bawah 0,02 tidak berguna, di atas 0,5 mencurigakan.')
    + `<div class="lpw"><div class="lz"><span></span><div><span style="flex:4"></span><span style="flex:16">lemah</span><span style="flex:40">sedang</span><span style="flex:40">kuat</span></div><span></span></div>`
    + IV.map((r, i) => lrow(r, i < 2 ? 'hi' : '')).join('') + IVX.map(r => lrow(r, 'dr')).join('') + `</div>`
    + LG([[C2, 'sinyal kuat (IV ≥ 0,3)'], [C1, 'sinyal lemah, tetap dipakai'], ['#52627f', 'dibuang (IV < 0,02)']])
    + `<div class="tiles"><div class="tile gd"><b>2 dari 19</b><span>fitur ber-IV ≥ 0,3: skor eksternal EXT_SOURCE_2 dan EXT_SOURCE_3</span></div><div class="tile"><b>0,02–0,09</b><span>rentang IV 17 fitur lainnya, semuanya lemah</span></div><div class="tile wn"><b>50 kolom</b><span>gugur di seleksi ini, termasuk SK_ID_CURR</span></div></div>`
    + `<p class="cap" style="margin-top:.8rem">Dua skor eksternal menjadi penentu utama, dan 17 fitur lain melengkapinya dengan sinyal kecil yang digabungkan model. Seleksi ini menjaga model tetap ringkas: 19 fitur dari 69 kolom yang dinilai.</p>`;

  // =====================================================================
  // 4. MODELING
  // =====================================================================
  const SEE = () => `<svg class="ss" id="ss" viewBox="0 0 420 254" role="img" aria-label="Jungkat-jungkit: sebelum SMOTE kelas gagal bayar jauh lebih ringan dari kelas layak, sesudah SMOTE seimbang">
    <path class="fu" d="M210 150L170 218H250Z"/><rect x="120" y="218" width="180" height="8" rx="4" fill="#16223a"/>
    <g class="beam"><rect class="bar" x="40" y="146" width="340" height="8" rx="4"/>
      <circle class="blf bl" cx="80" cy="102" r="44" style="fill:${BAD}"/><circle class="brf br" cx="340" cy="102" r="44" style="fill:${C2}"/></g>
    <circle cx="210" cy="150" r="9" fill="${INK}"/>
    <text class="tl2" id="ssl" x="80" y="234">19.876</text><text class="cp" x="80" y="248">gagal bayar</text><text class="tr2" x="340" y="234" id="ssr">226.132</text><text class="cp" x="340" y="248">layak</text></svg>`;
  const MET = [
    ['Data bersih', '<i>307.511</i> baris × 112 kolom', 'Hasil pembersihan dan seleksi fitur pada tahap sebelumnya.'],
    ['Bagi 80 : 20', 'latih <i>246.008</i> · uji <i>61.503</i>', 'Menyisihkan data uji yang tidak pernah dilihat model, supaya penilaian jujur.'],
    ['SMOTE (hanya data latih)', 'gagal bayar <i>19.876</i> → <i>226.132</i> · total <i>452.264</i>', 'Gagal bayar hanya 8% data latih. Tanpa penyeimbangan, model cenderung selalu menebak "layak".'],
    ['StandardScaler', 'dipelajari dari data latih', 'PCA dan Logistic Regression sensitif terhadap skala fitur.'],
    ['PCA 95% variansi', '111 fitur → <i>97</i> komponen', 'Meringkas fitur yang saling berkorelasi sambil mempertahankan 95% informasi.']];
  const S4 = () => H('Dari Data Bersih ke Dua Model', 'Setiap langkah punya alasan statistik. Data latih diseimbangkan, sedangkan data uji sengaja dibiarkan seperti aslinya agar mewakili kondisi nyata.')
    + `<div class="cols2"><div class="pan"><h3>Jalur data</h3><ol class="metro">${MET.map(([b, e, w], i) => `<li${i === 2 ? ' class="k"' : ''}><b>${b}</b><em>${e}</em><p>${w}</p></li>`).join('')}<li class="k"><b>Dua model dilatih</b><p>Logistic Regression sebagai pembanding yang mudah dijelaskan, LightGBM untuk menangkap pola non-linear.</p><div class="fk"><span>Logistic Regression</span><span>LightGBM</span></div></li></ol></div>`
    + `<div class="pan"><h3>Sebelum dan sesudah SMOTE</h3><div class="tg" role="group" aria-label="Pilih kondisi data latih"><button type="button" class="on" data-sm="0" aria-pressed="true">Sebelum SMOTE</button><button type="button" data-sm="1" aria-pressed="false">Sesudah SMOTE</button></div>${SEE()}<p class="cap" id="smc" style="margin-top:.6rem">Luas lingkaran mewakili jumlah pemohon. Kelas gagal bayar hanya 8% dari data latih, jadi tanpa penyeimbangan model punya sedikit contoh untuk dipelajari.</p></div></div>`
    + H('Dua Model yang Dibandingkan', 'Keduanya dilatih pada komponen PCA dari data yang sudah seimbang, lalu dinilai pada 61.503 pemohon uji yang tidak pernah dilihat model.')
    + `<div class="mc"><div class="pan"><h3>Logistic Regression</h3><p class="cap">Pembanding dasar: sederhana, cepat, dan koefisiennya mudah dijelaskan ke tim bisnis.</p>${PC(['solver liblinear', 'penalti L2', 'C = 1', 'max_iter 1000'])}<div class="ms"><div><b>88,9%</b>akurasi</div><div><b>95,8%</b>recall layak</div></div></div>`
    + `<div class="pan"><h3>LightGBM · terpilih</h3><p class="cap">Pohon bertahap yang menangkap pola non-linear dan interaksi antar fitur. Dipilih karena unggul pada akurasi, recall, dan F1.</p>${PC(['parameter bawaan', 'random_state 42', 'dilatih pada komponen PCA'])}<div class="ms"><div><b>91,2%</b>akurasi</div><div><b>98,9%</b>recall layak</div></div></div></div>`;
  const I4 = () => {
    const ss = $('#ss'), L = $('#ssl'), msg = $('#smc');
    $$('[data-sm]').forEach(b => b.addEventListener('click', () => {
      const a = +b.dataset.sm; ss.classList.toggle('af', !!a);
      $$('[data-sm]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      L.textContent = a ? '226.132' : '19.876';
      msg.textContent = a ? 'SMOTE membuat contoh sintetis untuk kelas gagal bayar sampai jumlahnya sama: 226.132 lawan 226.132.' : 'Luas lingkaran mewakili jumlah pemohon. Kelas gagal bayar hanya 8% dari data latih, jadi tanpa penyeimbangan model punya sedikit contoh untuk dipelajari.';
    }));
  };

  // =====================================================================
  // 5. EVALUASI
  // =====================================================================
  const RL = ['Akurasi', 'Presisi', 'Recall', 'F1'], RV = { lr: [.8894, .9247, .9577, .9409], lgb: [.9121, .9215, .9886, .9539] };
  const RADAR = () => {
    const cx = 210, cy = 190, R = 130, lo = .8, ang = i => -Math.PI / 2 + i * Math.PI / 2;
    const pt = (i, v) => { const r = (v - lo) / (1 - lo) * R; return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))]; };
    const poly = vals => vals.map((v, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ');
    const grid = [.85, .9, .95, 1].map(l => `<polygon class="gr" points="${poly([l, l, l, l])}"/>`).join('');
    const lab = [[cx, cy - R - 14, 'middle'], [cx + R + 12, cy + 4, 'start'], [cx, cy + R + 24, 'middle'], [cx - R - 12, cy + 4, 'end']].map(([x, y, a], i) => `<text class="t" x="${x}" y="${y}" style="text-anchor:${a}">${RL[i]}</text>`).join('');
    const dots = (k, c) => RV[k].map((v, i) => { const [x, y] = pt(i, v); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${c}"/>`; }).join('');
    return `<svg class="rdr" viewBox="0 0 420 380" role="img" aria-label="Radar akurasi, presisi, recall, dan F1 untuk Logistic Regression dan LightGBM; LightGBM lebih tinggi pada akurasi, recall, dan F1">${grid}
      ${[0, 1, 2, 3].map(i => { const [x, y] = pt(i, 1); return `<line class="ax" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
      <text x="${cx + 14}" y="${(cy - ((.95 - lo) / (1 - lo)) * R + 4).toFixed(1)}" style="text-anchor:start">0,95</text><text x="${cx + 14}" y="${(cy - ((.85 - lo) / (1 - lo)) * R + 4).toFixed(1)}" style="text-anchor:start">0,85</text>
      <g class="pl"><polygon points="${poly(RV.lr)}" fill="${C1}22" stroke="${C1}" stroke-width="2.5"/>${dots('lr', C1)}</g>
      <g class="pl pl2"><polygon points="${poly(RV.lgb)}" fill="${C2}26" stroke="${C2}" stroke-width="2.5"/>${dots('lgb', C2)}</g>${lab}</svg>`;
  };
  const MTB = () => { const rows = [['Akurasi', .8894, .9121], ['Presisi', .9247, .9215], ['Recall', .9577, .9886], ['F1', .9409, .9539], ['AUC-ROC (dari label)', .5332, .5132]]; return `<table class="mtb"><thead><tr><th>Metrik</th><th style="color:${C1}">Logistic Regression</th><th style="color:${C2}">LightGBM</th></tr></thead><tbody>${rows.map(([n, a, b]) => `<tr><td>${n}</td><td class="${a > b ? 'hi2' : ''}">${f(a, 3)}</td><td class="${b > a ? 'hi2' : ''}">${f(b, 3)}</td></tr>`).join('')}</tbody></table>`; };
  const S5 = () => H('1. Ke Mana Perginya 61.503 Pemohon Uji?', 'Pilih strategi. Tinggi pita sebanding dengan jumlah pemohon. Positif berarti layak, jadi recall mengukur seberapa banyak pemohon layak yang tetap disetujui.')
    + `<div class="tg" role="group" aria-label="Pilih strategi persetujuan" id="skb">${Object.entries(M).map(([k, m]) => `<button type="button" data-k="${k}" aria-pressed="false">${m.nm}</button>`).join('')}</div>`
    + `<div class="skw"><svg class="sk" id="sk" viewBox="0 0 690 336" role="img" aria-label="Diagram alir pemohon layak dan gagal bayar menuju keputusan disetujui atau ditolak"></svg></div>`
    + LG([[C2, 'layak disetujui'], [WN, 'layak ditolak'], [BAD, 'gagal bayar disetujui'], [C1, 'gagal bayar ditolak']])
    + `<div class="mt"><div class="a"><b id="m1"></b><span>akurasi</span></div><div class="c"><b id="m2"></b><span>pemohon layak yang disetujui (recall)</span></div><div class="l"><b id="m3"></b><span id="m3s">gagal bayar yang ditolak</span></div></div><p class="skm" id="skm"></p>`
    + H('2. Membaca Metrik Secara Utuh', 'Satu metrik tidak cukup pada data yang tidak seimbang, jadi hasil dibaca dari empat metrik berbasis matriks keputusan. Skala radar 0,80–1,00.')
    + `<div class="cols2"><div>${RADAR()}</div><div class="pan"><h3>Hasil pada data uji</h3>${MTB()}<p class="cap" style="margin-top:.8rem">LightGBM lebih tinggi pada akurasi, recall, dan F1, sedangkan Logistic Regression sedikit lebih tinggi pada presisi. Karena itu LightGBM dipilih.</p></div></div>`
    + `<p class="cap" style="margin-top:.8rem">AUC-ROC pada notebook dihitung dari label prediksi (ambang 0,5), sehingga nilainya sama dengan rata-rata recall kedua kelas dan menilai keputusan akhir, bukan peringkat risiko. Karena itu angkanya tidak dibandingkan langsung dengan AUC dari probabilitas.</p>`
    + H('3. Catatan Metodologi')
    + `<div class="lim"><div>Information Value, normalisasi, dan imputasi dipelajari dari seluruh data sebelum split. Memindahkannya ke dalam pipeline setelah split akan membuat penilaian lebih ketat.</div><div>LightGBM dilatih pada komponen PCA. Mencoba fitur asli akan menunjukkan apakah ada informasi tambahan yang tersisa.</div><div>Ambang keputusan memakai nilai bawaan 0,5 dan hyperparameter belum disetel, sehingga masih ada ruang untuk mengatur keseimbangan persetujuan dan penolakan.</div></div>`;

  const I5 = () => {
    const svg = $('#sk'), W = 640, TOP = 30, HH = 250, G = 34, XL = 150, XR = 486, NW = 14, sc = HH / N.val;
    const ids = ['tp', 'fn', 'fp', 'tn'];
    svg.innerHTML = `<text class="hd" x="${XL - 10}" y="14" text-anchor="end">AKTUAL</text><text class="hd" x="${XR + NW + 10}" y="14">KEPUTUSAN</text>`
      + ids.map(k => `<path class="rb ${k}" id="r-${k}"/>`).join('')
      + `<rect class="nd2 g" id="n-la" x="${XL}" width="${NW}"/><rect class="nd2 r" id="n-lb" x="${XL}" width="${NW}"/><rect class="nd2 g" id="n-ra" x="${XR}" width="${NW}"/><rect class="nd2 n" id="n-rr" x="${XR}" width="${NW}"/>`
      + `<text id="t-la" text-anchor="end"><tspan class="a" x="${XL - 10}">Layak</tspan><tspan class="gg" x="${XL - 10}" dy="16" id="v-la"></tspan></text>`
      + `<text id="t-lb" text-anchor="end"><tspan class="a" x="${XL - 10}">Gagal bayar</tspan><tspan class="rr" x="${XL - 10}" dy="16" id="v-lb"></tspan></text>`
      + `<text id="t-ra"><tspan class="a" x="${XR + NW + 10}">Disetujui</tspan><tspan x="${XR + NW + 10}" dy="16" id="v-ra"></tspan><tspan class="rr" x="${XR + NW + 10}" dy="16" id="v-rb"></tspan></text>`
      + `<text id="t-rr"><tspan class="a" x="${XR + NW + 10}">Ditolak</tspan><tspan x="${XR + NW + 10}" dy="16" id="v-rc"></tspan><tspan class="cc" x="${XR + NW + 10}" dy="16" id="v-rd"></tspan></text>`;
    const E = id => svg.querySelector('#' + id);
    const rib = (id, x0, y0, h0, x1, y1, h1) => { const xm = (x0 + x1) / 2, a = h0 < .6 ? .6 : h0, b = h1 < .6 ? .6 : h1; E(id).setAttribute('d', `M${x0} ${y0}C${xm} ${y0} ${xm} ${y1} ${x1} ${y1}L${x1} ${y1 + b}C${xm} ${y1 + b} ${xm} ${y0 + a} ${x0} ${y0 + a}Z`); };
    const paint = v => {
      const hA = (v.tp + v.fn) * sc, hB = (v.fp + v.tn) * sc, yB = TOP + hA + G, hAp = (v.tp + v.fp) * sc, hRj = (v.fn + v.tn) * sc, yR = TOP + hAp + G;
      const x0 = XL + NW, x1 = XR;
      rib('r-tp', x0, TOP, v.tp * sc, x1, TOP, v.tp * sc);
      rib('r-fp', x0, yB, v.fp * sc, x1, TOP + v.tp * sc, v.fp * sc);
      rib('r-fn', x0, TOP + v.tp * sc, v.fn * sc, x1, yR, v.fn * sc);
      rib('r-tn', x0, yB + v.fp * sc, v.tn * sc, x1, yR + v.fn * sc, v.tn * sc);
      const set = (id, y, h) => { E(id).setAttribute('y', y); E(id).setAttribute('height', Math.max(h, .8)); };
      set('n-la', TOP, hA); set('n-lb', yB, hB); set('n-ra', TOP, hAp); set('n-rr', yR, hRj);
      const ty = (id, y, h, k = 1) => E(id).setAttribute('y', (y + h / 2 - 8 * k).toFixed(1));
      ty('t-la', TOP, hA, 1); ty('t-lb', yB, hB, 1); ty('t-ra', TOP, hAp, 2); ty('t-rr', yR, hRj, 2);
      E('v-la').textContent = nf(v.tp + v.fn); E('v-lb').textContent = nf(v.fp + v.tn);
      E('v-ra').textContent = nf(v.tp + v.fp); E('v-rb').textContent = nf(v.fp) + ' gagal bayar';
      E('v-rc').textContent = nf(v.fn + v.tn); E('v-rd').textContent = nf(v.tn) + ' gagal bayar';
    };
    const MSG = {
      all: 'Tanpa model, semua pemohon disetujui. Akurasi 91,95% sama dengan proporsi pemohon layak di data uji: 56.554 ÷ 61.503. Angka ini menjadi titik acuan untuk membaca metrik lain.',
      lr: 'Logistic Regression menolak 2.932 pemohon (4,8%), 538 di antaranya benar gagal bayar. Sebanyak 95,8% pemohon layak tetap disetujui.',
      lgb: 'LightGBM menolak 830 pemohon (1,3%), 187 di antaranya gagal bayar. Sebanyak 98,9% pemohon layak tetap disetujui, sehingga pengalaman nasabah baik terjaga.'
    };
    let cur = { ...M.all }, cancel = () => {};
    const stats = (k, v) => {
      $('#m1').textContent = f((v.tp + v.tn) / N.val * 100, 1) + '%'; $('#m2').textContent = f(v.tp / N.vok * 100, 1) + '%'; $('#m3').textContent = f(v.tn / N.vbad * 100, 1) + '%';
      $('#m3s').textContent = `gagal bayar yang ditolak (${nf(v.tn)} dari ${nf(N.vbad)})`;
    };
    const pick = k => {
      $$('#skb button').forEach(b => { const on = b.dataset.k === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      $('#skm').textContent = MSG[k]; stats(k, M[k]); cancel();
      const a = { ...cur }, t = M[k];
      cancel = tween(1100, p => { const v = {}; for (const q of ['tp', 'fp', 'tn', 'fn']) v[q] = a[q] + (t[q] - a[q]) * p; cur = v; paint(v); });
    };
    let user = false;
    paint(cur); $$('#skb button').forEach(b => b.addEventListener('click', () => { user = true; pick(b.dataset.k); }));
    pick('all'); later(() => { if (!user) pick('lgb'); }, rm ? 0 : 1800);
  };

  // =====================================================================
  // 6. DAMPAK
  // =====================================================================
  const DON = () => {
    const ring = (r, segs) => { const C = 2 * Math.PI * r; let o = 0; return segs.map(([p, c]) => { const l = C * p, e = `<circle class="ar" cx="150" cy="150" r="${r}" transform="rotate(-90 150 150)" style="stroke:${c};--l:${(l - 1.2).toFixed(1)};--o:${(-o).toFixed(1)}"/>`; o += l; return e; }).join(''); };
    const lay = N.vok / N.val, app = (M.lgb.tp + M.lgb.fp) / N.val;
    return `<svg class="rad" viewBox="0 0 300 300" role="img" aria-label="Per 1.000 pemohon: cincin luar menunjukkan 920 layak dan 80 gagal bayar, cincin dalam menunjukkan keputusan LightGBM, 987 disetujui dan 13 ditandai berisiko">
      <circle class="tr" cx="150" cy="150" r="120"/><circle class="tr" cx="150" cy="150" r="88"/>${ring(120, [[lay, C2], [1 - lay, BAD]])}${ring(88, [[app, C1], [1 - app, WN]])}
      <text class="big" x="150" y="152">1.000</text><text class="sm" x="150" y="170">pemohon</text></svg>`;
  };
  const per = x => Math.round(x / N.val * 1000), lg = M.lgb;
  const ENR = (a, b) => f(a / (a + b) * 100);
  const S6 = () => H('1. Jika 1.000 Pemohon Datang', 'Cincin luar adalah kenyataan (layak dan gagal bayar), cincin dalam adalah keputusan LightGBM. Dampak dihitung dalam jumlah pemohon. Konversi ke rupiah membutuhkan biaya per kasus dari tim risiko.')
    + `<div class="rwrap">${DON()}<div class="rl"><div class="l1"><h4>Pengalaman nasabah</h4><p>LightGBM menyetujui <b>±${per(lg.tp)}</b> dari <b>±${per(lg.tp + lg.fn)}</b> pemohon layak (98,9%). Hanya <b>±${per(lg.fn)}</b> per 1.000 yang tertolak.</p></div><div class="l2"><h4>Antrian verifikasi</h4><p><b>±${per(lg.tn + lg.fn)}</b> per 1.000 pemohon ditandai berisiko. Sekitar <b>${ENR(lg.tn, lg.fn)}%</b> di antaranya gagal bayar, atau 2,8 kali rata-rata.</p></div><div class="l0"><h4>Ruang pengembangan</h4><p>Pada ambang bawaan, <b>±${per(lg.fp)}</b> dari <b>±${per(lg.fp + lg.tn)}</b> gagal bayar masih lolos. Ambang dan bobot kelas dapat disetel untuk menangkap lebih banyak.</p></div></div></div>`
    + LG([[C2, 'layak'], [BAD, 'gagal bayar'], [C1, 'disetujui'], [WN, 'ditandai berisiko']])
    + H('2. Seberapa Tepat Kelompok yang Ditandai?', 'Dari pemohon yang ditolak model, bagian yang benar gagal bayar jauh melampaui rata-rata. Artinya model memilah risiko dengan baik, dan hasilnya dapat dipakai untuk memprioritaskan verifikasi manual.')
    + `<div class="cap2"><div><span>Rata-rata semua pemohon</span><div class="pill"><i style="--w:8.0%"></i></div><b>8,0%</b></div><div><span>Ditolak Logistic Regression</span><div class="pill"><i style="--w:${(M.lr.tn / (M.lr.tn + M.lr.fn) * 100).toFixed(1)}%"></i></div><b>${ENR(M.lr.tn, M.lr.fn)}%</b></div><div><span>Ditolak LightGBM</span><div class="pill"><i style="--w:${(lg.tn / (lg.tn + lg.fn) * 100).toFixed(1)}%"></i></div><b>${ENR(lg.tn, lg.fn)}%</b></div></div>`
    + `<p class="cap" style="margin-top:.7rem">Bagian merah = porsi yang benar gagal bayar di antara pemohon yang ditolak. Kelompok yang ditandai LightGBM berisiko sekitar 2,8 kali rata-rata, dan Logistic Regression sekitar 2,3 kali.</p>`
    + `<div class="cols2" style="margin-top:2rem"><div><h3 style="margin:0 0 .7rem">3. Praktik yang Diterapkan</h3><ul class="todo ok"><li><b>SMOTE hanya pada data latih</b><span>Data uji tetap berdistribusi asli (8,0% gagal bayar), jadi hasil uji mewakili kondisi nyata.</span></li><li><b>Seleksi fitur ala credit scoring</b><span>IV dan WoE dipakai untuk menyaring 69 kolom menjadi 19.</span></li><li><b>Evaluasi dengan banyak metrik</b><span>Akurasi, presisi, recall, F1, dan AUC dilaporkan sehingga keputusan model dapat dibaca utuh.</span></li></ul></div>`
    + `<div><h3 style="margin:0 0 .7rem">4. Pengembangan Berikutnya</h3><ol class="todo"><li data-n="1"><b>Nilai dengan probabilitas</b><span>Hitung ROC-AUC, PR-AUC, dan KS dari probabilitas untuk menilai kemampuan peringkat risiko.</span></li><li data-n="2"><b>Tentukan ambang dari biaya</b><span>Seimbangkan kerugian gagal bayar yang lolos dengan peluang dari pemohon layak.</span></li><li data-n="3"><b>Coba LightGBM pada fitur asli</b><span>Tanpa PCA, dengan bobot kelas atau tanpa SMOTE.</span></li><li data-n="4"><b>Bungkus dalam satu pipeline</b><span>Imputasi, skala, dan IV dipelajari setelah split, divalidasi silang.</span></li><li data-n="5"><b>Tambah riwayat kredit</b><span>Rata-rata dari bureau dan previous_application sudah digabung saat eksplorasi, siap dicoba di model.</span></li></ol></div></div>`;

  // =====================================================================
  // Stepper
  // =====================================================================
  const P = [['Masalah & Data', S1, null], ['Pembersihan', S2, I2], ['Seleksi Fitur', S3, null], ['Modeling', S4, I4], ['Evaluasi', S5, I5], ['Dampak', S6, null]];
  const st = $('#stp'), cr = $('#cr'), prv = $('#prv'), nxt = $('#nxt'); let cur = 0;
  st.innerHTML = P.map((p, i) => `<button type="button" data-i="${i}"><b>${i + 1}</b>${p[0]}</button>`).join('');
  const show = (i, sc) => {
    off.forEach(c => c()); off = []; cur = i;
    cr.classList.remove('go'); cr.innerHTML = P[i][1](); if (P[i][2]) P[i][2]();
    $$('button', st).forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-current', j === i ? 'step' : 'false'); });
    prv.disabled = i === 0; nxt.disabled = i === P.length - 1;
    void cr.offsetWidth; later(() => cr.classList.add('go'), 60);
    if (sc) { const h = st.parentElement.offsetHeight, t = cr.getBoundingClientRect().top; if (t < h) scrollTo({ top: t + scrollY - h - 8, behavior: rm ? 'auto' : 'smooth' }); }
  };
  st.addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(+b.dataset.i, 1); });
  st.addEventListener('keydown', e => { const n = cur + (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0); if (n !== cur && n >= 0 && n < P.length) { e.preventDefault(); show(n); st.children[n].focus(); } });
  prv.addEventListener('click', () => show(cur - 1, 1)); nxt.addEventListener('click', () => show(cur + 1, 1));
  show(0);
})();