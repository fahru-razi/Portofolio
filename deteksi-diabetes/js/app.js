/* Demo Deteksi Diabetes: tab Aplikasi (iframe app/), CRISP-DM visual, dan demo model Random Forest asli (js/model.js). */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- tab utama ---------- */
  const tabs = $$('.tabs [role=tab]');
  const show = (t) => tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; });
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); show(n); } });
  });

  /* ---------- pustaka (nomor sama dengan draf skripsi) ---------- */
  const REFS = { 1: 'International Diabetes Federation, IDF Diabetes Atlas, 10th ed., 2021.', 3: 'Fajarini dkk., Hambatan skrining GDM di Kota Yogyakarta, Jurnal Kebidanan Indonesia, 2024.', 8: 'Zuhri dkk., Perbandingan Random Forest dan Naïve Bayes untuk identifikasi diabetes, JINTEKS, 2025.', 9: 'Safitry dkk., Decision Tree, Naive Bayes, dan Induction Rule untuk klasifikasi diabetes, JIAC, 2023.', 10: 'Brahmandjati dkk., Optimasi prediksi diabetes dengan XGBoost dan preprocessing, LOGIC, 2024.', 12: 'Nasution dkk., Faktor risiko kejadian diabetes mellitus, Jurnal Ilmu Kesehatan, 2021.', 13: 'Sari & Adelina, Pola makan sebagai faktor dominan DM tipe 2 di Indonesia, JAKAGI, 2020.', 14: 'Lestari dkk., Hubungan kadar glukosa darah dengan tekanan darah pada pasien DM tipe 2, 2024.', 15: 'American Diabetes Association, Classification and Diagnosis of Diabetes: Standards of Care in Diabetes 2024, Diabetes Care 47 (Suppl 1).', 16: 'Unger dkk., 2020 International Society of Hypertension Global Hypertension Practice Guidelines, Hypertension 75(6), 2020.', 19: 'World Health Organization, Obesity and overweight (fact sheet), 2024.', 20: 'Mostaza dkk., SEA 2024 Standards for Global Control of Vascular Risk, Clín Investig Arterioscler 36(3), 2024.', 21: 'Sweeting dkk., A Clinical Update on Gestational Diabetes Mellitus, Endocrine Reviews 43(5), 2022.', 60: 'Alam dkk., Enhancing Transfer Learning for Medical Image Classification with SMOTE, arXiv:2412.20235, 2024.', 61: 'Lee, Understanding Mean Imputation, Number Analytics, 2025.', 62: 'sofyan, Median: a robust measure for skewed, outlier-prone data, Scolary.blog, 2025.', 63: 'Lundberg dkk., Explainable AI for Trees, Nature Machine Intelligence 2(1), 2020.', 64: 'Ahmad dkk., Impact of Missing Values in Machine Learning, arXiv, 2024.', 65: 'Hassanloo dkk., BMI trajectories and type 2 diabetes incidence, Scientific Reports 14, 2024.', 66: 'American Diabetes Association, Standards of Medical Care in Diabetes—2022 Abridged for Primary Care Providers, Clinical Diabetes 40(1), 2022.', 68: 'Huo dkk., Density-Aware Personalized Training for Risk Prediction in Imbalanced Medical Data, MLHC, 2022.' };
  $('#refs').innerHTML = Object.entries(REFS).map(([n, t]) => `<li value="${n}">${t}</li>`).join('');
  const ch = (...n) => n.map((i) => `<span class="rf" title="${REFS[i].replace(/"/g, '&quot;')}">[${i}]</span>`).join(' ');

  /* ---------- helper visual ---------- */
  const band = (segs) => `<div class="band">${segs.map(([t, w, c]) => `<span style="flex:${w};background:${c}">${t}</span>`).join('')}</div>`;
  const hb = (rows, max) => rows.map(([l, v, c, s]) => `<div class="ib"><span>${l}</span><i style="width:${Math.max(2, v / max * 100)}%;${c ? `background:${c}` : ''}"></i><b>${s ?? v}</b></div>`).join('');
  const lg = (a) => `<div class="lg">${a.map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>`;
  const flow = (a) => `<div class="flw">${a.map(([t, k], i) => `${i ? '<i>→</i>' : ''}<span class="${k || ''}">${t}</span>`).join('')}</div>`;
  const G = '#4ade80', Y = '#fbbf24', Rd = '#f87171', C = '#22d3ee', M = '#93a4bd';

  /* ---------- CRISP-DM: data evaluasi ---------- */
  const EV = { 'Hold-out': [['Decision Tree', .96, .93], ['Random Forest', .98, .97], ['XGBoost', .93, .92]], 'Cross-validation': [['Decision Tree', .93, .91], ['Random Forest', .95, .94], ['XGBoost', .91, .91]], 'Data Pima': [['Decision Tree', .96, .94], ['Random Forest', .97, .98], ['XGBoost', .98, .98]] };
  const MC = { 'Decision Tree': M, 'Random Forest': G, XGBoost: C };
  const evChart = (mi) => {
    const keys = Object.keys(EV), W = 520, H = 230, y0 = .8, Y1 = (v) => 190 - (v - y0) / (1 - y0) * 160;
    let s = `<svg class="sv" viewBox="0 0 ${W} ${H}" role="img" aria-label="Perbandingan model per skema evaluasi">` + [.8, .9, 1].map((v) => `<line x1="40" x2="${W - 10}" y1="${Y1(v)}" y2="${Y1(v)}" stroke="#1d2a40"/><text x="4" y="${Y1(v) + 3}">${v.toFixed(1)}</text>`).join('');
    keys.forEach((k, g) => EV[k].forEach(([n, ...v], j) => { const x = 60 + g * 152 + j * 38, val = v[mi]; s += `<rect x="${x}" y="${Y1(val)}" width="32" height="${190 - Y1(val)}" rx="3" fill="${MC[n]}"/><text x="${x + 2}" y="${Y1(val) - 4}">${val.toFixed(2)}</text>`; }) || (s += `<text x="${60 + g * 152 + 55}" y="212" text-anchor="middle">${k}</text>`));
    return s + '</svg>';
  };
  const IMP = [['Glucose', .31, 'Diagnostik utama (OGTT 2 jam)', [14, 15]], ['BMI', .20, 'Obesitas → resistensi insulin', [13, 15, 19]], ['Age', .17, 'Risiko naik seiring usia', [12, 15]], ['DPF', .14, 'Riwayat keluarga', [12, 15]], ['BloodPressure', .10, 'Sindrom metabolik', [14, 15, 16]], ['Pregnancies', .08, 'Diabetes gestasional', [1, 21]]];

  const PH = [
    ['Business', () => `<h3>Masalah yang dijawab</h3><div class="tiles"><div class="tile"><b>19,5 jt</b><span>dewasa dengan diabetes di Indonesia ${ch(1)}</span></div><div class="tile"><b>10,6%</b><span>prevalensi dewasa 20–79 th ${ch(1)}</span></div><div class="tile rd"><b>2</b><span>hambatan: biaya HbA1c/OGTT dan akses fasilitas ${ch(3)}</span></div></div>
      <h3>Pendekatan</h3>${flow([['Tes lab', 'x'], ['6 input kesehatan dasar', 'k'], ['Hasil dalam detik', 'k'], ['Rujuk ke dokter', 'k']])}<p class="vt">PRINSIP DESAIN</p>${flow([['Skrining, bukan diagnosis'], ['Fitur mudah didapat di layanan primer'], ['Kasus positif tidak boleh terlewat → recall']])}`],
    ['Data', () => `<h3>Dataset Frankfurt Hospital</h3><p class="cap">2.000 baris · 8 fitur + target · kelas tidak seimbang (data latih)</p>${band([['Non-diabetes 1.053 (66%)', 66, C], ['Diabetes 547 (34%)', 34, Rd]])}
      <h3>Nilai 0 yang mustahil secara medis (dari 2.000 baris)</h3>${hb([['Insulin', 956, Rd, '956'], ['SkinThickness', 573, Rd, '573'], ['BloodPressure', 90, Y, '90'], ['BMI', 28, Y, '28'], ['Glucose', 13, Y, '13']], 956)}${lg([['dibuang dari model', Rd], ['diimputasi', Y]])}
      <h3>Setiap variabel punya dasar klinis</h3>
      <div class="vr"><b>Glucose 2 jam OGTT</b>${band([['< 140 normal', 45, G], ['140–199 pra-diabetes', 35, Y], ['≥ 200 diabetes', 20, Rd]])}<small>mg/dL ${ch(15)}</small></div>
      <div class="vr"><b>BMI</b>${band([['< 18,5', 15, M], ['18,5–24,9', 30, G], ['25–29,9', 28, Y], ['≥ 30 obesitas', 27, Rd]])}<small>kg/m² ${ch(19, 20)}</small></div>
      <div class="vr"><b>Tekanan diastolik</b>${band([['< 85', 35, G], ['85–89', 20, '#a3e635'], ['90–99', 25, Y], ['≥ 100', 20, Rd]])}<small>mmHg ${ch(14, 16)}</small></div>
      <div class="vr"><b>Usia</b>${band([['< 35', 40, G], ['≥ 35: skrining dianjurkan', 60, Y]])}<small>tahun ${ch(12, 15)}</small></div>
      <div class="vr"><b>DPF (keluarga)</b>${band([['Ayah 0,5', 25, C], ['Ibu 0,5', 25, '#38bdf8'], ['Saudara 0,3', 18, '#818cf8'], ['Kakek/nenek 0,2', 20, '#a78bfa'], ['Paman 0,1', 12, M]])}<small>bobot kedekatan ${ch(15, 20)}</small></div>
      <div class="vr"><b>Kehamilan</b>${band([['Riwayat diabetes gestasional → risiko DM2 ≈ 7×', 100, Y]])}<small>${ch(1, 21)}</small></div>`],
    ['Prep', () => `<h3>Alur persiapan data</h3>${flow([['2.000 baris'], ['0 → kosong'], ['Imputasi'], ['log1p'], ['Pilih 6 fitur', 'k'], ['Split 1.600 / 400', 'k'], ['SMOTE (latih saja)', 'k']])}
      <h3>Imputasi mengikuti sebaran</h3><p class="cap">Mean untuk Glucose dan BloodPressure; median untuk SkinThickness, Insulin, BMI (lebih tahan nilai ekstrem) ${ch(61, 62)}</p>
      <h3>Skewness &gt; 1 → log1p ${ch(63)}</h3>${hb([['Insulin', 2.98, Rd], ['DPF', 1.81, Rd], ['SkinThickness', 1.31, Rd], ['Age', 1.18, Rd]], 3)}
      <h3>Seleksi fitur (ANOVA F) lalu pertimbangan klinis ${ch(64, 65, 66)}</h3>${hb([['Glucose', 624.61, G, '624,6'], ['BMI', 173.18, G, '173,2'], ['Age', 162.19, G, '162,2'], ['Insulin', 118.98, Rd, '119,0']], 625)}
      <p class="vt">INSULIN &amp; SKINTHICKNESS DIBUANG</p>${flow([['956 &amp; 573 nilai tidak valid'], ['butuh lab / alat khusus'], ['tak sesuai tujuan skrining'], ['Glucose, BMI, Age sudah kuat']])}
      <h3>SMOTE hanya pada data latih ${ch(60)}</h3>${band([['Sebelum: 1.053 vs 547', 100, '#2b4a66']])}<div style="height:.4rem"></div>${band([['Sesudah: 1.053 vs 1.053', 100, G]])}`],
    ['Modeling', () => `<h3>Tiga algoritma, tuning GridSearchCV berbasis recall</h3><div class="mc">
      <div class="pan"><h3>Decision Tree <span class="rf">${ch(9)}</span></h3><p class="cap">mudah ditafsirkan</p><div class="pc"><span>max_depth 15</span><span>entropy</span><span>sqrt</span><span>balanced</span></div></div>
      <div class="pan sel"><h3>Random Forest <span class="rf">${ch(8)} dipilih</span></h3><p class="cap">ensemble, tahan overfitting</p><div class="pc"><span>100 pohon</span><span>max_depth 15</span><span>min_split 4</span><span>sqrt</span><span>balanced</span></div></div>
      <div class="pan"><h3>XGBoost <span class="rf">${ch(10)}</span></h3><p class="cap">gradient boosting</p><div class="pc"><span>1200 pohon</span><span>depth 10</span><span>lr 0,008</span><span>subsample 0,8</span><span>scale_pos_weight 1,2</span></div></div></div>`],
    ['Evaluation', () => `<h3>Metrik utama: recall dan F1 ${ch(68)}</h3><p class="cap">False negative = pasien terlewat. Karena itu recall diutamakan.</p><div class="tg" id="mt" role="group" aria-label="Pilih metrik"><button type="button" data-m="0" class="on">Recall</button><button type="button" data-m="1">F1</button></div><div id="evc">${evChart(0)}</div>${lg(Object.entries(MC).map(([n, c]) => [n, c]))}<p class="cap">Sumbu mulai dari 0,80. Sumber: skripsi, Tabel 4.2–4.4.</p>
      <h3>Apakah model belajar sains yang benar?</h3><p class="cap">Urutan feature importance sama dengan literatur klinis.</p>${IMP.map(([n, v, t, r]) => `<div class="ib"><span>${n}</span><i style="width:${v / .31 * 100}%"></i><b>${v.toFixed(2)}</b></div><div class="cl2">${t} ${ch(...r)}</div>`).join('')}
      <h3>Keterbatasan</h3><div class="lim"><div>⚠ CV dijalankan pada data yang sudah di-SMOTE → skor cenderung optimis</div><div>⚠ Skor Pima ~1,00: tumpang tindih dengan data Frankfurt perlu diverifikasi</div><div>⚠ Satu sumber data publik; belum diuji pada data lokal Indonesia</div></div>`],
    ['Deployment', () => `<h3>Dari model ke situs</h3>${flow([['6 input mentah'], ['log1p (DPF, Age)', 'k'], ['Random Forest 100 pohon', 'k'], ['peluang rata-rata'], ['label + level risiko + saran']])}
      <h3>Level risiko</h3>${band([['Rendah &lt; 30%', 30, G], ['Sedang 30–70%', 40, Y], ['Tinggi ≥ 70%', 30, Rd]])}
      <p class="vt">STACK &amp; UJI</p>${flow([['Flask'], ['PostgreSQL'], ['Leaflet + Chart.js'], ['Black-box: 14/14 skenario lolos', 'k']])}`]
  ];
  const stp = $('#stp'), cr = $('#cr');
  stp.innerHTML = PH.map(([n], i) => `<button type="button" data-i="${i}"><b>${i + 1}</b>${n}</button>`).join('');
  const open = (i) => {
    $$('button', stp).forEach((b, k) => b.classList.toggle('on', k === i));
    cr.innerHTML = `<div class="pan crs">${PH[i][1]()}</div>`;
    const mt = $('#mt'); if (mt) mt.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $$('button', mt).forEach((x) => x.classList.toggle('on', x === b)); $('#evc').innerHTML = evChart(+b.dataset.m); });
  };
  stp.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) open(+b.dataset.i); });
  open(0);

  /* ---------- tab Demo model ---------- */
  const predict = (x) => {
    const z = [Math.log1p(x[4]), Math.log1p(x[5]), x[0], x[1], x[2], x[3]].map(Math.fround);
    const per = window.RF.map((t) => { let i = 0; while (t.l[i] !== -1) i = z[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i]; return t.p[i]; });
    return { p: per.reduce((a, b) => a + b, 0) / per.length, per };
  };
  const level = (pct) => (pct >= 70 ? ['hi', 'Tinggi'] : pct >= 30 ? ['mo', 'Sedang'] : ['lo', 'Rendah']);
  const label = (p) => (p > 0.5 ? 'Terindikasi Diabetes' : 'Tidak Terindikasi Diabetes');
  const F = [['preg', 'Pregnancies (kehamilan)', 0, 15, 1, ''], ['glu', 'Glucose (mg/dL, 2 jam OGTT)', 60, 250, 1, 'ADA: 140 / 200'], ['bp', 'BloodPressure (diastolik, mmHg)', 40, 120, 1, ''], ['bmi', 'BMI (kg/m²)', 15, 55, 0.1, 'WHO: 25 / 30'], ['dpf', 'DiabetesPedigreeFunction', 0, 2.5, 0.01, ''], ['age', 'Age (tahun)', 21, 80, 1, 'ADA: skrining ≥35']];
  const PRE = { 'Profil rendah': [0, 100, 70, 22, 0.1, 28], 'Profil pra-diabetes': [2, 150, 82, 29, 0.5, 45], 'Profil tinggi': [4, 190, 92, 33, 1.0, 58] };
  $('#sl').innerHTML = F.map(([k, n, a, b, s, h]) => `<div class="fl"><div class="fh"><label for="r_${k}">${n}</label><span class="ro" id="v_${k}"></span></div><input type="range" id="r_${k}" min="${a}" max="${b}" step="${s}"><small>${h}</small></div>`).join('');
  $('#pre').innerHTML = Object.keys(PRE).map((k) => `<button type="button" data-k="${k}">${k}</button>`).join('');
  const get = () => F.map(([k]) => +$('#r_' + k).value);
  const set = (a) => { F.forEach(([k], i) => { $('#r_' + k).value = a[i]; }); run(); };
  function run() {
    const x = get(); F.forEach(([k], i) => { $('#v_' + k).textContent = x[i]; });
    const { p, per } = predict(x), pct = +(p * 100).toFixed(1), [c, l] = level(pct);
    $('#mo').className = 'out ' + c;
    $('#mo').innerHTML = `<div class="lab">${label(p)}</div><div class="pb"><i style="width:${pct}%"></i></div><p>Peluang rata-rata <b>${pct}%</b> · level <b>${l}</b></p><p class="cl2">Masukan ke pohon: ln(1+DPF) = ${Math.log1p(x[4]).toFixed(3)}, ln(1+Age) = ${Math.log1p(x[5]).toFixed(3)}</p>`;
    $('#tr').innerHTML = per.map((q) => `<i style="background:rgba(34,211,238,${(0.12 + 0.88 * q).toFixed(2)})"></i>`).join('');
    $('#lg').textContent = `${per.filter((q) => q > 0.5).length} dari ${per.length} pohon condong ke diabetes.`;
    const pts = []; for (let g = 70; g <= 250; g += 5) { const y = x.slice(); y[1] = g; pts.push([g, predict(y).p]); }
    const X = (g) => 36 + (g - 70) / 180 * 470, Y = (q) => 160 - q * 140;
    $('#sv').innerHTML = `<path d="M36 20V160H506" fill="none" stroke="#2b4a66"/>` + [0, .5, 1].map((q) => `<text x="4" y="${Y(q) + 3}">${q * 100}%</text>`).join('') + [100, 140, 200, 250].map((g) => `<text x="${X(g) - 8}" y="178">${g}</text>`).join('') + [140, 200].map((g) => `<line x1="${X(g)}" x2="${X(g)}" y1="20" y2="160" stroke="#fbbf24" stroke-dasharray="4 4"/>`).join('') + `<polyline fill="none" stroke="#4ade80" stroke-width="2.5" points="${pts.map(([g, q]) => X(g) + ',' + Y(q)).join(' ')}"/><circle cx="${X(Math.min(250, Math.max(70, x[1])))}" cy="${Y(p)}" r="5" fill="#22d3ee"/>`;
  }
  $('#sl').addEventListener('input', run);
  $('#pre').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { set(PRE[b.dataset.k]); $$('button', $('#pre')).forEach((x) => x.classList.toggle('on', x === b)); } });
  set(PRE['Profil pra-diabetes']);
})();
