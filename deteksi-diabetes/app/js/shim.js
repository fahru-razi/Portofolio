/* Pengganti backend Flask untuk demo statis. Frontend asli (homepage.js, visualisasi.js) tidak diubah:
   /predict dijalankan oleh model Random Forest asli (../js/model.js) di browser; data peta dan lokasi adalah data dummy.
   Tidak ada data yang dikirim atau disimpan. */
(() => {
  const realFetch = window.fetch ? window.fetch.bind(window) : () => Promise.reject(new Error('fetch tidak tersedia'));
  const json = (o, st = 200) => Promise.resolve(new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json' } }));

  /* ---- model: ColumnTransformer(log1p DPF, Age) -> Random Forest (rata-rata peluang 100 pohon) ---- */
  const proba = (x) => {
    const z = [Math.log1p(x[4]), Math.log1p(x[5]), x[0], x[1], x[2], x[3]].map(Math.fround);
    return window.RF.reduce((s, t) => { let i = 0; while (t.l[i] !== -1) i = z[t.f[i]] <= t.t[i] ? t.l[i] : t.r[i]; return s + t.p[i]; }, 0) / window.RF.length;
  };

  /* ---- faktor risiko & saran: salinan logika get_key_factors di app.py ---- */
  function keyFactors(d, risk) {
    const f = [], glucose = +d.glucose, bp = +d.bloodPressure, bmi = +d.bmi, dpf = +d.diabetesPedigreeFunction, age = +d.age, preg = +d.pregnancies;
    if (risk < 30) {
      if (glucose < 140) f.push('Kadar gula kamu aman, tetap jaga pola makan ya.');
      if (bp < 80) f.push('Tekanan darah kamu normal, good job.');
      if (bmi >= 18.5 && bmi < 25) f.push('BMI kamu ideal, pertahankan pola hidup sehat.');
      if (age < 40) f.push('Masih muda, risiko diabetes lebih rendah. Tapi tetap jaga pola hidup ya.');
      if (dpf < 0.5) f.push('Riwayat keluarga aman, risiko genetik rendah.');
      if (f.length < 3) f.push('Coba lebih sering olahraga dan makan makanan sehat biar tetap sehat.', 'Jangan lupa cek kesehatan rutin ya.');
    } else {
      if (glucose >= 140) f.push(`Gula darah kamu (${glucose} mg/dL) ${glucose >= 200 ? 'di atas batas diabetes' : 'masuk kategori pra-diabetes'}. Harus lebih hati-hati nih.`);
      if (bp >= 80) f.push(`Tekanan darah kamu (${bp} mmHg) ${bp >= 90 ? 'tinggi' : 'mulai naik'}. Kurangi garam dan stres ya.`);
      if (bmi >= 25) f.push(`BMI kamu (${bmi.toFixed(1)}) masuk kategori ${bmi >= 30 ? 'obesitas' : 'kelebihan berat badan'}. Yuk mulai pola hidup sehat.`);
      if (age >= 40) f.push(`Umur kamu (${age}) bikin risiko lebih tinggi, jadi lebih jaga kesehatan ya.`);
      if (dpf >= 0.5) f.push('Riwayat keluarga menunjukkan ada risiko diabetes, lebih hati-hati ya.');
      if (preg > 3) f.push(`Punya riwayat kehamilan lebih dari 3 kali (${preg}) bisa ningkatin risiko diabetes.`);
      if (risk < 70) f.push('Kurangin makanan manis dan perbanyak sayur serta protein sehat.', 'Coba olahraga minimal 150 menit perminggu biar makin sehat.');
      else f.push('Sebaiknya segera konsultasi ke dokter biar lebih jelas kondisinya!', 'Mungkin perlu cek gula darah lebih rutin dan tes tambahan.');
    }
    return f;
  }

  /* ---- data lokasi dummy (provinsi → kota/kabupaten) ---- */
  const L = {
    'Aceh': 'Banda Aceh,Lhokseumawe,Aceh Besar,Pidie,Bireuen', 'Sumatera Utara': 'Medan,Binjai,Deli Serdang,Pematangsiantar,Langkat,Asahan', 'Sumatera Barat': 'Padang,Bukittinggi,Payakumbuh,Agam,Solok',
    'Riau': 'Pekanbaru,Dumai,Kampar,Siak,Rokan Hulu', 'Kepulauan Riau': 'Batam,Tanjungpinang,Bintan,Karimun', 'Jambi': 'Jambi,Sungai Penuh,Batanghari,Muaro Jambi', 'Sumatera Selatan': 'Palembang,Prabumulih,Ogan Ilir,Banyuasin,Lubuklinggau',
    'Kepulauan Bangka Belitung': 'Pangkalpinang,Bangka,Belitung,Bangka Barat', 'Bengkulu': 'Bengkulu,Rejang Lebong,Seluma,Kepahiang', 'Lampung': 'Bandar Lampung,Metro,Lampung Selatan,Lampung Tengah,Pesawaran',
    'DKI Jakarta': 'Jakarta Pusat,Jakarta Utara,Jakarta Barat,Jakarta Selatan,Jakarta Timur', 'Banten': 'Tangerang,Tangerang Selatan,Serang,Cilegon,Lebak,Pandeglang', 'Jawa Barat': 'Bandung,Bekasi,Bogor,Depok,Cirebon,Garut,Tasikmalaya',
    'Jawa Tengah': 'Semarang,Surakarta,Magelang,Banyumas,Kudus,Pekalongan', 'Daerah Istimewa Yogyakarta': 'Yogyakarta,Sleman,Bantul,Kulon Progo,Gunungkidul', 'Jawa Timur': 'Surabaya,Malang,Sidoarjo,Kediri,Jember,Banyuwangi',
    'Bali': 'Denpasar,Badung,Gianyar,Tabanan,Buleleng', 'Nusa Tenggara Barat': 'Mataram,Lombok Barat,Lombok Tengah,Sumbawa,Bima', 'Nusa Tenggara Timur': 'Kupang,Ende,Sikka,Manggarai,Belu',
    'Kalimantan Barat': 'Pontianak,Singkawang,Kubu Raya,Sambas', 'Kalimantan Tengah': 'Palangka Raya,Kotawaringin Barat,Kapuas,Barito Utara', 'Kalimantan Selatan': 'Banjarmasin,Banjarbaru,Banjar,Tanah Laut', 'Kalimantan Timur': 'Samarinda,Balikpapan,Bontang,Kutai Kartanegara', 'Kalimantan Utara': 'Tarakan,Bulungan,Nunukan,Malinau',
    'Sulawesi Utara': 'Manado,Bitung,Tomohon,Minahasa', 'Gorontalo': 'Gorontalo,Bone Bolango,Boalemo,Pohuwato', 'Sulawesi Tengah': 'Palu,Donggala,Poso,Banggai', 'Sulawesi Barat': 'Mamuju,Majene,Polewali Mandar,Mamasa',
    'Sulawesi Selatan': 'Makassar,Parepare,Gowa,Bone,Maros,Palopo', 'Sulawesi Tenggara': 'Kendari,Baubau,Kolaka,Konawe', 'Maluku': 'Ambon,Tual,Maluku Tengah,Seram Bagian Barat', 'Maluku Utara': 'Ternate,Tidore Kepulauan,Halmahera Barat,Halmahera Utara',
    'Papua': 'Jayapura,Merauke,Biak Numfor,Mimika', 'Papua Barat': 'Manokwari,Sorong,Fakfak,Raja Ampat'
  };
  const fmt = (n) => n.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '); // sama dengan formatProvinceName di visualisasi.js
  const lokasi = Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.split(',')]));

  /* ---- statistik dummy per provinsi dan kota (deterministik) ---- */
  const rng = (s) => () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = rng(20261118), big = ['Jawa Barat', 'Jawa Timur', 'Jawa Tengah', 'DKI Jakarta', 'Banten', 'Sumatera Utara'];
  const prov = {};
  Object.keys(lokasi).forEach((p) => {
    const total = Math.round((big.includes(p) ? 180 : 40) + R() * (big.includes(p) ? 220 : 110)), d = Math.round(total * (0.18 + R() * 0.3));
    const cities = lokasi[p].map(() => 0.4 + R()); const sum = cities.reduce((a, b) => a + b, 0);
    prov[fmt(p)] = { total_cases: total, diabetes_cases: d, non_diabetes_cases: total - d, cities: lokasi[p].map((k, i) => { const t = Math.max(2, Math.round(total * cities[i] / sum)), dd = Math.min(t, Math.round(t * (0.15 + R() * 0.4))); return { kota: k, total_cases: t, diabetes_cases: dd, non_diabetes_cases: t - dd }; }) };
  });
  const provStats = () => Object.entries(prov).map(([provinsi, v]) => ({ provinsi, total_cases: v.total_cases, diabetes_cases: v.diabetes_cases, non_diabetes_cases: v.non_diabetes_cases })).sort((a, b) => b.diabetes_cases - a.diabetes_cases);
  const cityStats = (name) => {
    const all = (prov[name] ? prov[name].cities : []).slice().sort((a, b) => b.diabetes_cases - a.diabetes_cases), top = all.slice(0, 5);
    if (all.length > 5) { const o = all.slice(5), s = (k) => o.reduce((a, c) => a + c[k], 0); top.push({ kota: 'Lainnya', total_cases: s('total_cases'), diabetes_cases: s('diabetes_cases'), non_diabetes_cases: s('non_diabetes_cases') }); }
    return top;
  };

  window.fetch = (u, o) => {
    const url = typeof u === 'string' ? u : u.url;
    if (url === '/predict') {
      const t0 = performance.now(), d = JSON.parse(o.body), p = proba([+d.pregnancies, +d.glucose, +d.bloodPressure, +d.bmi, +d.diabetesPedigreeFunction, +d.age]), risk = Math.round(p * 10000) / 100;
      return json({ prediction: p > 0.5 ? 'Terindikasi Diabetes' : 'Tidak Terindikasi Diabetes', probability: risk, riskLevel: risk >= 70 ? 'High Risk' : risk >= 30 ? 'Moderate Risk' : 'Low Risk', keyFactors: keyFactors(d, risk), responseTimeMs: Math.max(1, Math.round(performance.now() - t0)) });
    }
    if (url === '/data/lokasi_indonesia') return json(lokasi);
    if (url === '/data/geojson') return json(window.GEOJSON);
    if (url === '/data/province_stats') return json(provStats());
    if (url.startsWith('/data/city_stats/')) return json(cityStats(decodeURIComponent(url.slice(17))));
    return realFetch(u, o);
  };
})();
