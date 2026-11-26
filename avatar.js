(() => {
  if (window.top !== window.self) return;
  const d = document, $ = s => d.querySelector(s), rm = matchMedia('(prefers-reduced-motion:reduce)').matches, touch = matchMedia('(pointer:coarse)').matches;
  const hero = $('#pfa-hero'), lab = $('#pfa-mood');
  const R = new URL('avatar/', d.currentScript.src).href, ROOT = new URL('.', d.currentScript.src).pathname;
  const COLS = 3, ROWS = 3, EMO = ['neutral', 'happy', 'angry'];   // kisi frame: ubah COLS/ROWS jika frame dibuat lebih rapat (mis. 5)
  const U = (e, x, y) => `${R}${e}_${x}_${y}.webp`, B = e => `${R}${e}_blink.webp`;
  const IMG = {}, TX = {}, okc = {}, okg = {}, sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---- opsi B: morph WebGL2. Tiap frame diselaraskan ke frame tengah lewat peta aliran optik (atlas {emosi}_flow.png, dibuat make_flow.py):
  //      separuh kiri = flow kanonik->frame (F), separuh kanan = flow frame->kanonik (G); G memberi posisi kanonik yang tepat pada pose murni.
  //      Fitur wajah digeser mengikuti pose, bukan dipudarkan, sehingga tidak ada bayangan ganda. Syarat: COLS dan ROWS sama dan ganjil.
  const TILE = 256, RUV = .12, FL = e => `${R}${e}_flow.png`;
  const VS = `#version 300 es
in vec2 p;out vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`;
  const FS = `#version 300 es
precision highp float;
in vec2 v;out vec4 o;
uniform sampler2D i0,i1,i2,i3,ib,fa;
uniform vec4 w;uniform vec2 c0,c1,c2,c3;uniform float kb,al;
const float N=${COLS}.,T=${TILE}.,R=${RUV};
const vec2 M=vec2(${(COLS - 1) / 2}.,${(ROWS - 1) / 2}.);
vec2 ft(vec2 c,vec2 x,float s){return(texture(fa,vec2((c.x+clamp(x.x,.5/T,1.-.5/T))/N*.5+s,(c.y+clamp(x.y,.5/T,1.-.5/T))/N)).rg*2.-1.)*R;}
vec2 F(vec2 c,vec2 x){return c==M?vec2(0.):ft(c,x,0.);}
vec2 G(vec2 c,vec2 x){return c==M?vec2(0.):ft(c,x,.5);}
// frame yang dominan dipakai apa adanya (tepat pada pose murni); hanya frame berbobot kecil yang digeser ke geometri campuran
vec4 S(sampler2D t,vec2 c,float k,vec2 x){return k*texture(t,mix(x+F(c,x),v,k*k*k*k));}
void main(){
  vec2 x=v+w.x*G(c0,v)+w.y*G(c1,v)+w.z*G(c2,v)+w.w*G(c3,v);
  vec4 a=S(i0,c0,w.x,x)+S(i1,c1,w.y,x)+S(i2,c2,w.z,x)+S(i3,c3,w.w,x);
  if(kb>0.)a=a*(1.-kb)+kb*texture(ib,x+ft(M,x,0.));
  o=a*al;
}`;
  const glc = d.createElement('canvas'), L = {}; let gl = null;
  if (!rm) try {
    gl = glc.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw 0; return o; };
    const pg = gl.createProgram();
    gl.attachShader(pg, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pg, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pg);
    if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) throw 0;
    gl.useProgram(pg);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(pg, 'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    ['w', 'c0', 'c1', 'c2', 'c3', 'kb', 'al'].forEach(n => { L[n] = gl.getUniformLocation(pg, n); });
    ['i0', 'i1', 'i2', 'i3', 'ib', 'fa'].forEach((n, k) => gl.uniform1i(gl.getUniformLocation(pg, n), k));
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);               // penjumlahan (warna sudah premultiplied)
    glc.addEventListener('webglcontextlost', e => { e.preventDefault(); gl = null; dirty = true; });
  } catch (_) { gl = null; }
  const mkT = (img, photo) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!photo); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    if (photo) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, photo ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const pre = (u, flow) => { const i = new Image(); i.src = u; (i.decode ? i.decode() : new Promise(r => { i.onload = r; })).then(() => { IMG[u] = i; if (gl) try { TX[u] = mkT(i, !flow); } catch (_) {} }).catch(() => {}); };
  const loadE = e => { pre(B(e)); if (gl) pre(FL(e), 1); for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) pre(U(e, x, y)); };
  const okE = e => okc[e] || (okc[e] = !!IMG[B(e)] && [...Array(COLS * ROWS).keys()].every(i => IMG[U(e, i % COLS, (i / COLS) | 0)]));
  const glE = e => okg[e] || (okg[e] = !!TX[FL(e)] && !!TX[B(e)] && [...Array(COLS * ROWS).keys()].every(i => TX[U(e, i % COLS, (i / COLS) | 0)]));
  const drawGL = (s, act, cells, bw) => {
    if (glc.width !== s) glc.width = glc.height = s;
    gl.viewport(0, 0, s, s); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(L.w, cells[0][2], cells[1][2], cells[2][2], cells[3][2]); gl.uniform1f(L.kb, bw);
    cells.forEach((c, k) => gl.uniform2f(L['c' + k], c[0], c[1]));
    for (const [e, we] of act) {
      cells.forEach((c, k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, TX[U(e, c[0], c[1])]); });
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, TX[B(e)]);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, TX[FL(e)]);
      gl.uniform1f(L.al, we); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  };
  loadE('neutral'); (window.requestIdleCallback || (f => setTimeout(f, 800)))(() => { loadE('happy'); loadE('angry'); });

  // ================= tampilan (kanvas): hero besar, dock kecil =================
  const views = []; let dirty = true, run = 0, cur = null, lastEnd = 0;
  const mk = el => {
    el.classList.add('pfa-s');
    el.innerHTML = '<div class="pfa-m"><div class="pfa-p"><canvas></canvas></div></div>';
    const p = el.querySelector('.pfa-p'), cv = p.firstChild, say = d.createElement('div'), dk = !!el.closest('.pfa-dock');
    say.className = 'pfa-say'; say.innerHTML = '<span></span><span class="h"></span>'; el.parentElement.appendChild(say);
    say.addEventListener('click', () => { run++; cur = null; say.classList.remove('on'); });
    const v = { el, p, cv, cx: cv.getContext('2d'), say, vis: false, k: dk ? 3 : 7, z: dk ? 1.5 : 1, w: 0 };
    new ResizeObserver(() => {
      const s = Math.min(768, Math.ceil(el.clientWidth * v.z * Math.min(devicePixelRatio || 1, 2)));
      if (s && s !== v.w) { v.w = cv.width = cv.height = s; v.cx.imageSmoothingQuality = 'high'; dirty = true; }
    }).observe(el);
    views.push(v); return v;
  };

  // ================= mesin gerak: campuran frame kontinu (bilinear antar arah) =================
  const ptr = { x: 0, y: 0, t: -1e9 }, G = { x: 0, y: 0 }, P = { u: 1, v: 1 }, E = { w: { neutral: 1, happy: 0, angry: 0 }, wc: 1, gl: false };
  const S = { e: 'neutral' }, MID = [(COLS - 1) / 2, (ROWS - 1) / 2];
  const cl = n => Math.max(-1, Math.min(1, n));
  // arah tiap frame, DIUKUR dari landmark wajah (yaw/pitch kepala, rata-rata tiga emosi, relatif ke frame tengah; make_pose.py):
  //   kolom x=0,1,2 -> yaw -16,5 / 0 / +20,6 derajat (kiri/kanan layar); baris y=0,1,2 -> pitch -5,7 / 0 / +6,8 derajat (atas/bawah)
  // dinormalkan ke jangkauan masing-masing sumbu. Kursor dipetakan ke vektor arah (sudut 360° + jarak), lalu dipilih pose yang arahnya terdekat.
  const lin = (n, m) => [...Array(n)].map((_, i) => (i - m) / m);
  const PX = COLS === 3 ? [-.8, 0, 1] : lin(COLS, (COLS - 1) / 2), PY = ROWS === 3 ? [-.83, 0, 1] : lin(ROWS, (ROWS - 1) / 2);
  const HYS = .12;    // histeresis: pose baru harus lebih dekat sekian dari pose sekarang, agar tidak bolak-balik di perbatasan
  let sel = ((ROWS - 1) / 2) * COLS + (COLS - 1) / 2, lastGm = null;
  const BAND = .24;   // opsi A: lebar pita campuran antar pose (satuan jarak antar pose); di luar pita satu frame penuh
  let glance = 0, blT = -1, last = '', t0 = 0;
  d.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') { ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = performance.now(); } }, { passive: true });
  const frame = now => {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - (t0 || now)) / 1000); t0 = now;
    const v0 = views.find(v => v.vis); if (!v0) return;
    let nx = 0, ny = 0, tau = .1;                                   // 1) vektor arah yang dituju (panjang <= 1): sudut kursor dari wajah (360°) dan jaraknya
    if (!rm) {
      if (!touch && now - ptr.t < 3500) {
        const r = v0.el.getBoundingClientRect(), dx = ptr.x - r.left - r.width / 2, dy = ptr.y - r.top - r.height * .38;
        const dd = Math.hypot(dx, dy) || 1, am = Math.min(1, dd / (Math.min(innerWidth, innerHeight) * .3));
        nx = dx / dd * am; ny = dy / dd * am;
      } else { tau = .22; if (glance) { nx = glance.x; ny = glance.y; } }
    }
    const a = 1 - Math.exp(-dt / tau); G.x += (nx - G.x) * a; G.y += (ny - G.y) * a;   // peredam halus (hanya untuk geser/putar kontainer)
    let bk = sel, bd = Infinity;                                     // 2) pose terdekat menurut arah terukur tiap gambar
    for (let i = 0; i < COLS * ROWS; i++) { const dd = Math.hypot(nx - PX[i % COLS], ny - PY[(i / COLS) | 0]); if (dd < bd) { bd = dd; bk = i; } }
    if (bk !== sel && Math.hypot(nx - PX[sel % COLS], ny - PY[(sel / COLS) | 0]) - bd < HYS) bk = sel;
    sel = bk;
    const ap = rm ? 1 : 1 - Math.exp(-dt / .085); P.u += ((sel % COLS) - P.u) * ap; P.v += (((sel / COLS) | 0) - P.v) * ap;   // meluncur ke pose terpilih, lalu diam di satu frame
    const sw = rm ? 0 : Math.sin(now / 1900) * .04;
    const u = Math.max(0, Math.min(COLS - 1, P.u + sw)), v = Math.max(0, Math.min(ROWS - 1, P.v + sw * .6));
    const tg = okE(S.e) ? S.e : 'neutral', st = rm ? 1 : dt / .4; let s = 0;   // 2) pergantian emosi: disolve 0,4 detik
    for (const e of EMO) if (e !== tg) { E.w[e] = Math.max(0, E.w[e] - st); s += E.w[e]; } E.w[tg] = 1 - s;
    let b = 0;                                                       // 3) kedip: tutup 70 ms, tahan, buka 130 ms
    if (blT >= 0) { const k = now - blT; b = k < 70 ? k / 70 : k < 130 ? 1 : k < 260 ? 1 - (k - 130) / 130 : 0; if (k >= 260) blT = -1; b = b * b * (3 - 2 * b); }
    const x0 = Math.min(COLS - 2, u | 0), y0 = Math.min(ROWS - 2, v | 0), fx = u - x0, fy = v - y0;
    const ew = EMO.map(e => E.w[e] * E.w[e] * (3 - 2 * E.w[e])), es = ew.reduce((p, c) => p + c, 0) || 1;
    const act = EMO.map((e, i) => [e, ew[i] / es]).filter(a => a[1] >= .003);
    const gm = !!gl && act.every(a => glE(a[0]));                    // opsi B (morph, bobot linear); jika belum siap atau tidak didukung: opsi A
    E.gl = gm; if (gm !== lastGm) { lastGm = gm; d.documentElement.dataset.pfa = gm ? 'morph' : 'blend'; }   // data-pfa di <html>: mode yang sedang aktif
    let sx = fx, sy = fy;
    if (!gm) {                                                       // opsi A: bobot ditajamkan, campuran hanya di pita sempit, maksimal 2 frame
      const sh = f => { const q = Math.max(0, Math.min(1, (f - .5) / BAND + .5)); return q * q * (3 - 2 * q); };
      sx = sh(fx); sy = sh(fy);
      if (sx > 0 && sx < 1 && sy > 0 && sy < 1) { if (Math.abs(fx - .5) < Math.abs(fy - .5)) sy = fy < .5 ? 0 : 1; else sx = fx < .5 ? 0 : 1; }
    }
    const cells = [[x0, y0, (1 - sx) * (1 - sy)], [x0 + 1, y0, sx * (1 - sy)], [x0, y0 + 1, (1 - sx) * sy], [x0 + 1, y0 + 1, sx * sy]];
    const wc = (cells.find(c => c[0] === MID[0] && c[1] === MID[1]) || [0, 0, 0])[2]; E.wc = wc;
    const bw = gm ? b : b * wc;                                      // di mode morph, kedip ikut tergeser ke pose saat ini
    let key, items = [];
    if (gm) key = 'g' + act.map(a => a[0] + a[1].toFixed(3)).join() + cells.map(c => c[0] + '.' + c[1] + ':' + c[2].toFixed(4)).join() + bw.toFixed(3);
    else {
      for (const [e, we] of act) {
        cells.forEach(c => { const w = we * c[2] * (1 - bw); if (w > .003) items.push([U(e, c[0], c[1]), w]); });
        if (bw > .003) items.push([B(e), we * bw]);
      }
      key = items.map(i => i[0] + i[1].toFixed(3)).join();
    }
    if (dirty || key !== last) {
      last = key; dirty = false;
      views.forEach(w => {
        if (!w.vis || !w.w) return;
        const c = w.cx; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w.w, w.w);
        if (gm) { try { drawGL(w.w, act, cells, bw); c.drawImage(glc, 0, 0); } catch (_) { gl = null; dirty = true; } return; }
        c.globalCompositeOperation = 'lighter';
        items.forEach(([q, al]) => { if (IMG[q]) { c.globalAlpha = al; c.drawImage(IMG[q], 0, 0, w.w, w.w); } });
        c.globalAlpha = 1;
      });
    }
    views.forEach(w => { w.p.style.transform = `translate3d(${(G.x * w.k).toFixed(2)}px,${(G.y * w.k * .6).toFixed(2)}px,0) rotate(${(G.x * w.k * .12).toFixed(2)}deg)`; });
  };
  const blinkLoop = () => {
    let ms = 600;
    if (E.wc > .8 || E.gl) { blT = performance.now(); if (Math.random() < .2) setTimeout(() => { blT = performance.now(); }, 330); ms = 2200 + Math.random() * 4200; }
    setTimeout(blinkLoop, ms);
  };
  const glanceLoop = () => setTimeout(() => {
    if (!rm && performance.now() - ptr.t > 3500) { glance = { x: (Math.random() < .5 ? -1 : 1) * .8, y: (Math.random() - .5) * .8 }; setTimeout(() => { glance = 0; }, 900 + Math.random() * 700); }
    glanceLoop();
  }, 4000 + Math.random() * 5000);

  // ================= emosi: dasar (per bagian halaman) + reaksi sementara berprioritas =================
  const mood = { base: 'neutral', ov: null, t: 0 };
  const apply = () => { const e = mood.ov ? mood.ov.e : mood.base; if (e === S.e) return; S.e = e; if (lab) lab.textContent = e; };
  const flash = (e, ms, p = 1) => { if (mood.ov && mood.ov.p > p) return; clearTimeout(mood.t); mood.ov = { e, p }; apply(); mood.t = setTimeout(() => { mood.ov = null; apply(); }, ms); };

  // ================= obrolan: antrean kalimat, ketik bertahap, emosi per kalimat =================
  const talk = async (lines, p = 1) => {
    if (cur && (p === 0 || cur.p > p)) return;                       // prioritas 0 tidak memotong; yang lebih penting tidak dipotong
    const v = views.find(v => v.vis); if (!v) return;
    const id = ++run; cur = { p }; views.forEach(w => { if (w !== v) w.say.classList.remove('on'); });
    const b = v.say;
    for (const L of lines) {
      const o = typeof L === 'string' ? { t: L } : L, t = o.t;
      if (id !== run) return;
      if (o.e) flash(o.e, t.length * 62 + 1700, p);
      b.classList.add('on');
      for (let i = 1; i <= t.length; i++) { if (id !== run) return; b.firstChild.textContent = t.slice(0, i); b.lastChild.textContent = t.slice(i); await sleep(24); }
      await sleep(Math.max(1100, t.length * 38 + 500));
    }
    if (id === run) { b.classList.remove('on'); cur = null; lastEnd = Date.now(); }
  };
  const mem = new Set();
  const seen = (k, persist) => {
    if (mem.has(k)) return 1; mem.add(k); if (!persist) return 0;
    try { const s = JSON.parse(sessionStorage.getItem('av-said') || '[]'); if (s.includes(k)) return 1; s.push(k); sessionStorage.setItem('av-said', JSON.stringify(s)); } catch (_) {}
    return 0;
  };

  // ================= isi obrolan: ditulis ulang dari CV, README tiap aplikasi, dan skripsi (bukan menyalin teks halaman) =================
  // Setiap topik punya beberapa varian; varian dibacakan bergiliran acak tanpa mengulang yang barusan (kantong kocok).
  const bag = {};
  const pick = (k, arr) => {
    if (arr.length < 2) return arr[0];
    let b = bag[k]; if (!b || !b.length) { b = bag[k] = arr.map((_, i) => i).sort(() => Math.random() - .5); if (b[b.length - 1] === bag[k + '~']) b.unshift(b.pop()); }
    const i = b.pop(); bag[k + '~'] = i; return arr[i];
  };

  const SEC = {   // saat bagian halaman terlihat (sekali per muatan halaman)
    pengalaman: [
      [{ t: 'Sejak Februari 2026 saya bekerja di PT Asia Budaya Center sebagai Data & Software Engineer.', e: 'neutral' }, 'Pipeline video VR yang saya bangun mengurus ribuan video per hari dari 75 headset.', 'Kalau dikerjakan manual, hitungan kasarnya setara 10 sampai 15 orang.'],
      ['Di kantor, peran saya melebar: data, aplikasi internal, sampai IT support.', 'Jaringan, hardware, dan perangkat VR di area produksi juga saya yang urus.', 'Polanya sama: kebutuhan produksi, QC, atau SDM saya ubah jadi sistem yang jalan sendiri.']
    ],
    proyek: [
      [{ t: 'Proyek-proyek ini saya bagi menjadi web, analisis data, data engineering, dan data science.', e: 'happy' }, 'Yang ada tombol demonya bisa dicoba langsung. Datanya dummy, jadi aman dieksplor.'],
      [{ t: 'Banyak dari proyek ini lahir dari kebutuhan operasional kantor: produksi, QC, SDM, dan IT support.', e: 'happy' }, 'Sisanya proyek belajar dan riset, termasuk skripsi saya.']
    ],
    pelatihan: [
      ['Saya masuk ke dunia data lewat dua program intensif.', 'Digital Skola sekitar 900 jam untuk data engineering, lalu Rakamin untuk data science.', 'Setelah itu skripsi S1 saya juga di bidang ini: deteksi diabetes dengan machine learning.'],
      ['Waktu kuliah saya aktif di organisasi.', 'Ketua divisi IT di KPU Mahasiswa, dan ketua divisi riset dan teknologi di himpunan informatika.', 'IPK akhir saya 3,78.']
    ],
    sertifikasi: [
      [{ t: 'Ada enam sertifikat di sini.', e: 'happy' }, 'Dua dari Google lewat Coursera, yaitu analitik data dan IT support.', 'Satu lagi dari BNSP untuk Associate Data Scientist.'],
      ['Setiap sertifikat bisa diklik dan langsung membuka berkasnya.', 'BNSP itu lembaga sertifikasi profesi nasional, jadi ini sertifikasi kompetensi, bukan sekadar kursus.']
    ],
    kontak: [
      [{ t: 'Kalau ada yang ingin didiskusikan soal data atau software, silakan hubungi saya.', e: 'happy' }, 'Lewat email, LinkedIn, atau GitHub, semuanya terbuka.'],
      [{ t: 'Saya tertarik pada data engineering, analitik, dan pengembangan aplikasi.', e: 'happy' }, 'Ceritakan kebutuhannya, nanti kita lihat apa yang bisa dibangun.']
    ]
  };

  const PROJ = [   // saat kursor menahan sebuah kartu
    [/CC Indonesia/, [
      ['Di aplikasi ini, jam kerja tiap shift adalah data, bukan kode.', 'Katalognya sudah lebih dari 20 shift, dan menambah satu cukup lewat halaman konfigurasi.'],
      ['Tiap shift punya aturan tanggal kerjanya sendiri, jadi absen shift malam yang melewati tengah malam tetap jatuh di hari yang benar.'],
      ['Tiap menit sistem mengecek siapa yang melewati batas check-in, lalu menandainya Absen.', 'Kecuali ia sudah izin, libur, atau memang bukan hari kerjanya.'],
      ['Rotasi shift mingguan berjalan otomatis tiap Senin dini hari.', 'Karyawan yang sedang tukar shift dilewati supaya jadwalnya tidak tertimpa.'],
      ['Tukar shift melewati tiga langkah: pemohon, rekan satu departemen, lalu persetujuan manajer.', 'Setelah durasinya habis, jadwal kembali ke rotasi normal sendiri.'],
      ['Satu catatan jujur: koordinat GPS dari peramban bisa dipalsukan.', 'Jadi radius kantor itu kontrol kenyamanan. Server menolak akurasi yang tidak masuk akal dan mencatat perangkatnya.'],
      ['Klik dua kali cepat pada check-in tidak membuat dua catatan, karena absensi unik per karyawan, shift, dan tanggal kerja.'],
      ['Antarmukanya tiga bahasa, bisa dipasang di layar utama HP, dan mengirim notifikasi push.']
    ]],
    [/Helpdesk/, [
      ['IT Desk saya rancang agar bisa dipakai perusahaan mana pun.', 'Kelompok permintaan, formulir, alur status, sampai SLA diatur dari dalam aplikasi, tanpa mengubah kode.'],
      ['Sebelum menulis kode, saya mempelajari Jira Service Management, Zendesk, Freshdesk, dan GLPI.', 'Dari sana saya ambil diagram alur status, template balasan, SLA, dan inventaris aset.'],
      ['SLA dihitung dari jam kerja dan hari libur, bukan jam dinding biasa.'],
      ['Soal keamanan: CSRF di semua request tulis, CSP ketat, dan lampiran dicek isi berkasnya, bukan hanya ekstensinya.', 'Di CI ada ruff, bandit, dan pip-audit.'],
      ['Tiket milik orang lain dijawab 404, jadi pemohon tidak bisa mengintipnya.'],
      ['Peran bawaannya Administrator, Agen, dan Pemohon. Peran lain, misalnya Supervisor, dibuat sendiri dengan memilih izinnya.'],
      ['Batasannya: satu instalasi untuk satu perusahaan, dan notifikasi baru di dalam aplikasi, belum lewat email.']
    ]],
    [/Quality Control/, [
      ['Di sini task punya status Need Sample, Sample Done, Revision, Ready, dan Skipped.'],
      ['Atribut seperti SOP, Target Num, dan Pullable Num bisa disinkronkan massal dari Excel atau CSV.'],
      ['Pencarian, filter, dan urutan berjalan lewat AJAX, jadi halaman tidak dimuat ulang.', 'Dokumen PDF juga bisa dibuka langsung di dalam sistem.']
    ]],
    [/Pecah Sandi/, [
      ['Ada lima sandi: Kotak III, Analog, Jam, Kimia, dan Matematika, lengkap dengan tabelnya.'],
      ['Timernya berbasis jam server, dan jawaban terkirim otomatis saat waktu habis.'],
      ['Di soal PUPK, jawaban yang salah ketik sedikit tetap dihargai. Kemiripannya dihitung dari jarak edit, dengan ambang 70%.', 'Tapi angka harus persis: 1907 tidak lolos untuk 1910.'],
      ['Di mode Kombinasi, urutan sandinya memakai kantong kocok, jadi semua sandi muncul merata.'],
      ['Karena simbolnya berupa font, jawabannya bisa terlihat lewat alat pengembang. Cukup untuk latihan, bukan untuk ujian yang diawasi.']
    ]],
    [/Dashboard KPI/, [
      ['Laporan untuk klien dan eksekutif dibuat otomatis lewat Apps Script, per tanggal dan per project.'],
      ['Datanya mengalir dari CSV di Google Drive, dibersihkan, lalu masuk ke Google Sheets sebagai sumber dashboard.']
    ]],
    [/E-Commerce/, [
      ['Dibuat dengan Streamlit, Pandas, dan Plotly.', 'Ada analisis RFM, peta pelanggan, dan dampak keterlambatan kirim terhadap order.']
    ]],
    [/Hadoop/, [
      ['Proyek analitik dengan Hadoop, kodenya terbuka di GitHub.', 'Hadoop juga bagian dari program Data Engineer di Digital Skola.']
    ]],
    [/Virtual Reality/, [
      ['Pipeline ini menarik video dari 75 headset VR lewat ADB melalui Wi-Fi.', 'Hasilnya ribuan video per hari, dan setiap file divalidasi integritasnya.'],
      ['Kalau dikerjakan manual, pekerjaan ini setara 10 sampai 15 orang per hari.']
    ]],
    [/Sentiment/, [
      ['Ini proyek akhir saya di Digital Skola. Waktu prosesnya turun dari sekitar 20 menit menjadi 20 detik.', 'Ketepatan eksekusi terjadwalnya 98%.'],
      ['Alurnya: Finnhub API, MongoDB untuk data mentah, analisis sentimen, lalu PostgreSQL.', 'Semuanya dijalankan Airflow lewat Docker Compose.']
    ]],
    [/Diabetes/, [
      ['Datanya 2.000 pasien dari Frankfurt Hospital.', 'Nilai nol pada glukosa, tekanan darah, ketebalan kulit, insulin, dan BMI saya anggap tidak valid, lalu diimputasi.'],
      ['Fitur yang sangat miring ditransformasi logaritmik, dan kelasnya diseimbangkan dengan SMOTE.'],
      ['Tiga algoritma diadu: Decision Tree, Random Forest, dan XGBoost, dituning dengan GridSearchCV.', 'Random Forest unggul di semua skenario pengujian.'],
      ['Recall Random Forest 0,98 di data uji dan 0,95 di validasi silang berulang.', 'Di data Pima yang tidak pernah dipakai melatih, recall-nya 0,97.'],
      ['Fitur paling berpengaruh: glukosa 31%, BMI 20%, lalu usia 17%.', 'Urutan ini sejalan dengan literatur klinis.'],
      ['Recall jadi metrik utama karena dalam skrining, kasus positif yang terlewat lebih berbahaya daripada salah curiga.'],
      ['Websitenya menampilkan label, probabilitas, level risiko Low, Moderate, atau High, dan saran pola hidup.', 'Ada juga peta sebaran per provinsi, dan panel admin dengan login bcrypt dan ekspor CSV.'],
      ['Ini alat bantu skrining, bukan diagnosis.', 'Saran saya di skripsi: uji dengan data lokal Indonesia dan gandeng fasilitas kesehatan.']
    ]],
    [/Loan Prediction/, [['Proyek dari program Data Science di Rakamin, memakai Logistic Regression, Random Forest, dan XGBoost.', 'Akurasi terbaiknya mencapai 90%.']]],
    [/Classifying Credit/, [
      ['Ini proyek intern saya di ID/X Partners sebagai Risk Analyst: memprediksi kualitas pinjaman dari 466 ribu data nasabah.', 'Ada demo yang menjelaskan tiap keputusan beserta alasannya.'],
      ['Saya membandingkan Random Forest dan XGBoost, dengan SMOTE untuk menyeimbangkan kelas.', 'XGBoost menurunkan bad loan yang lolos dari 1.867 menjadi 915.'],
      ['Fitur dipilih dengan Weight of Evidence dan Information Value, standar analisis kredit.'],
      ['Estimasi dampak bisnisnya: waktu proses turun 44%, biaya turun 25,4%, tenaga turun 33%.']
    ]],
    [/Credit Eligibility/, [['Prediksi kelayakan kredit dengan Logistic Regression dan LGBMClassifier.']]],
    [/Churn/, [['Klasifikasi churn pelanggan dengan Decision Tree, Random Forest, dan XGBoost.', 'Hasilnya diterbitkan dan dipresentasikan di konferensi internasional RESBUS, 14 Mei 2024.']]],
    [/Digital Skola/, [['Programnya sekitar 900 jam, dengan delapan proyek ETL, batch, dan stream processing.', 'Nilai akhir saya 95,81.']]],
    [/Rakamin/, [['Program lima bulan dengan nilai akhir 85,26 dan predikat Excellent.']]],
    [/Informatika/, [['S1 Informatika dengan IPK 3,78.', 'Skripsinya deteksi diabetes berbasis website.']]]
  ];
  const STAT = {
    'g-web': 'Empat aplikasi web, semuanya Flask: absensi, helpdesk, quality control, dan Pecah Sandi.',
    'g-analyst': 'Analitik: dashboard KPI produksi dan QC, dashboard e-commerce, dan analisis dengan Hadoop.',
    'g-engineer': 'Data engineering: pipeline video VR dan pipeline sentimen berita.',
    'g-science': 'Data science: dari skripsi diabetes sampai klasifikasi kredit dan churn.'
  };
  const CERT = [
    [/Analitik Data/, 'Analitik data dari Google lewat Coursera.'],
    [/Data Engineer/, 'Penutup program Data Engineer di Digital Skola.'],
    [/Data Science.*Rakamin|Rakamin/, 'Penutup program Data Science lima bulan di Rakamin.'],
    [/BNSP/, 'BNSP adalah badan sertifikasi profesi nasional. Ini sertifikasi kompetensi Associate Data Scientist.'],
    [/IT Support/, 'IT support dari Google. Pas dengan pekerjaan saya mengurus jaringan dan perangkat kantor.'],
    [/Azure/, 'Dasar-dasar data di cloud Microsoft Azure.']
  ];

  const DEMO = {   // halaman demo: sambutan (sekali per sesi) dan tips yang muncul saat sepi atau saat avatar diklik
    'cc-indonesia': { hi: ['Ini demo CC Indonesia, aplikasi absensi dan shift untuk 120+ karyawan.', 'Coba ganti peran antara Manajer dan Karyawan.'], tips: ['Jam kerja tiap shift tersimpan sebagai data, jadi manajer bisa mengubahnya tanpa developer.', 'Tiap menit sistem menandai Absen karyawan yang melewati batas check-in, kecuali ia izin atau libur.', 'Rotasi shift mingguan berjalan otomatis tiap Senin dini hari.', 'Tukar shift butuh persetujuan rekan lalu manajer. Setelah durasinya habis, jadwal kembali normal.', 'GPS peramban bisa dipalsukan, jadi radius kantor hanya kontrol kenyamanan. Server mencatat perangkat sebagai pengaman tambahan.', 'Antarmukanya tiga bahasa dan bisa dipasang di layar utama HP.', 'Semua datanya dummy, jadi bebas dicoba.'] },
    'helpdesk-it': { hi: ['Ini demo IT Desk, helpdesk yang bisa disesuaikan per perusahaan.', 'Masuk sebagai Pemohon, Agen, atau Administrator, lalu bandingkan tampilannya.'], tips: ['Buka detail tiket: ada diagram alur status yang menyorot posisi tiket sekarang.', 'Setiap tiket menunjukkan berapa lama ia berada di tiap status.', 'SLA dihitung dari jam kerja dan hari libur.', 'Coba jadi Pemohon dulu untuk membuat tiket, lalu lihat dari sisi Agen.', 'Template balasan dan inventaris aset dengan riwayat perbaikan juga ada.', 'Saya meriset Jira Service Management, Zendesk, Freshdesk, dan GLPI sebelum merancang ini.'] },
    'task-qc': { hi: ['Ini demo Task Quality Control untuk alur produksi video VR.', 'Pilih peran Quality Control, Supervisor, atau Developer.'], tips: ['Status task: Need Sample, Sample Done, Revision, Ready, dan Skipped.', 'Atribut task bisa disinkronkan massal dari Excel atau CSV.', 'Filter dan urutan jalan tanpa memuat ulang halaman.', 'Tampilan otomatis mengikuti mode gelap atau terang perangkat Anda.', 'Bandingkan tampilan tiap peran, kewenangannya berbeda.'] },
    'pecah-sandi': { hi: ['Ini Pecah Sandi, aplikasi latihan membaca sandi dengan font kustom.', 'Pilih satu dari lima sandi, lalu atur soal dan waktunya.'], tips: ['Timernya berbasis jam server, dan jawaban terkirim otomatis saat waktu habis.', 'Di PUPK, salah ketik sedikit tetap dihargai, tapi angka harus persis.', 'Mode Kombinasi menulis pertanyaan dalam sandi acak, dan semua sandi muncul merata.', 'Admin bisa mengimpor soal dari Excel atau CSV, sampai 2.000 baris.', 'Menu Riwayat menampilkan statistik, grafik, dan tinjauan jawaban tiap latihan.'] },
    'dashboard-kpi': { hi: ['Ini dashboard KPI produksi dan QC.', 'Ada tiga tab: Dashboard, Pipeline Apps Script, dan Laporan otomatis.'], tips: ['Tab Pipeline Apps Script menunjukkan bagaimana CSV dari Drive dibersihkan lalu masuk ke Google Sheets.', 'Laporan otomatis dibuat per tanggal dan per project, untuk klien dan eksekutif.', 'Tombol Buka di tab baru membuka dashboard aslinya di Looker Studio, dengan data dummy.'] },
    'dashboard-ecommerce': { hi: ['Ini dashboard e-commerce yang saya buat dengan Streamlit.', 'Tab Dashboard berisi tren order, RFM, peta pelanggan, dan dampak keterlambatan kirim.'], tips: ['RFM mengelompokkan pelanggan dari seberapa baru, seberapa sering, dan seberapa besar belanjanya.', 'Tab Logika menjelaskan bagaimana angka-angkanya dihitung.', 'Tombol Buka di tab baru membuka aplikasinya langsung.'] },
    'vr-data-pipeline': { hi: ['Ini alur pengambilan video dari headset VR.', 'Tab Alur proses menunjukkan langkahnya, tab Logika skrip menampilkan skripnya.'], tips: ['Di produksi, pipeline ini mengurus ribuan video per hari dari 75 headset.', 'Video ditarik lewat ADB melalui Wi-Fi, lalu ditransformasikan dan dihitung per task.', 'Setiap file divalidasi integritasnya.', 'Kalau dikerjakan manual, ini setara 10 sampai 15 orang per hari.', 'Ada tiga skrip: pengambilan, transformasi, dan penghitung.'] },
    'sentiment-pipeline': { hi: ['Ini pipeline sentimen berita berbasis Airflow.', 'Ada tab Alur pipeline dan Hasil, serta Coba logikanya untuk mencoba analisis sentimen.'], tips: ['Tiap hari Airflow menjalankan DAG: ambil berita Finnhub, simpan mentah ke MongoDB, hitung sentimen, lalu simpan ke PostgreSQL.', 'Waktu proses turun dari sekitar 20 menit menjadi 20 detik, dengan ketepatan eksekusi terjadwal 98%.', 'Semuanya berjalan di Docker Compose, kodenya ada di GitHub.'] },
    'loan-prediction': { hi: ['Ini proyek akhir kelompok saya di Rakamin: prediksi risiko gagal bayar pinjaman.', 'Coba matriks titik di tengah halaman.'], tips: ['Datanya 252.000 nasabah, dan hanya 12,3% yang berisiko gagal bayar.', 'Menebak semua nasabah aman sudah memberi akurasi 87,7%, tapi tidak menangkap satu pun yang berisiko.', 'Random Forest mencapai akurasi 89,9% dan menangkap sekitar separuh nasabah berisiko.', 'Estimasi tim: waktu proses turun 44%, biaya turun 25,4%, tenaga kerja turun 33%.', 'Jika diulang, saya akan menjalankan SMOTE hanya pada data latih.'] },
    'credit-loan-classification': { hi: ['Ini proyek intern saya di ID/X Partners: klasifikasi kualitas pinjaman.', 'Klik tab Business sampai Dampak bisnis, nanti saya jelaskan tiap tahap.'], tips: ['Datanya 466.285 pinjaman, dan sekitar 11% di antaranya bad loan. Kelas yang timpang inilah yang ditangani SMOTE.', 'Fitur dipilih dengan Weight of Evidence dan Information Value. Di bawah 0,02 dibuang, di atas 0,5 dicurigai.', 'XGBoost meloloskan 915 bad loan, Random Forest 1.867. Recall kelas bad naik dari 50% ke 76%.', 'Catatan jujur: fitur seperti total_pymnt baru diketahui setelah pinjaman cair, jadi AUC 0,97 kemungkinan terlalu optimis.', 'Estimasi dampak bisnis: waktu turun 44%, biaya turun 25,4%, tenaga turun 33%.'], st: [
      ['Masalahnya: penilaian kredit manual lama, tidak konsisten, dan rawan salah.', 'Tiga tahap analisis diambil alih model, diukur lewat default rate, waktu, dan biaya.'],
      ['Sembilan status pinjaman saya ringkas jadi good dan bad.', 'Dari EDA, tenor 60 bulan, sewa rumah, dan status terverifikasi lebih sering muncul di bad loan.'],
      ['Setiap langkah punya alasan: kolom kosong, ID, dan korelasi tinggi dibuang.', 'Weight of Evidence dan Information Value menilai daya pisah tiap fitur. Skewness menentukan scaler.'],
      ['Data dibagi 80:20, lalu SMOTE hanya di data latih supaya data uji tetap asli.', 'Hasil SHAP menunjukkan kontribusi tiap fitur pada prediksi XGBoost.'],
      ['Pilih model di confusion matrix dan perhatikan kotak merah, yaitu bad loan yang lolos.', 'XGBoost unggul di semua metrik, tapi ada risiko data leakage yang saya catat.'],
      ['Dari presentasi bisnis: waktu turun 44%, biaya turun 25,4%, dan tenaga turun 33%.', 'Itu estimasi, bukan hasil produksi.']
    ] },
    'deteksi-diabetes': { hi: ['Ini skripsi saya: deteksi risiko diabetes berbasis website.', 'Ada tab Aplikasi dan tab Demo model.'], tips: ['Datanya 2.000 pasien dari Frankfurt Hospital. Nilai nol yang tidak masuk akal diimputasi, lalu kelasnya diseimbangkan dengan SMOTE.', 'Tiga algoritma diadu. Random Forest menang dengan recall 0,98 di data uji dan 0,97 di data Pima.', 'Glukosa memegang 31% pengaruh model, disusul BMI 20% dan usia 17%.', 'Proses mengikuti CRISP-DM, dengan batas nilai dirujukkan ke ADA, WHO, dan IDF.', 'Ini alat bantu skrining, bukan pengganti diagnosis dokter.'] }
  };
  const seg = location.pathname.slice(ROOT.length).split('/')[0], demo = hero ? null : DEMO[seg];
  if (demo && demo.st) d.addEventListener('click', e => { const b = e.target.closest('.stp [role=tab]'); if (!b) return; const i = [...b.parentElement.children].indexOf(b); if (demo.st[i]) talk(demo.st[i], 1); });
  const TIPS = demo ? demo.tips : [
    'Saya Fahru, Data & Software Engineer dengan pengalaman sekitar dua tahun.',
    'Saya paling sering mengerjakan satu hal: mengubah proses manual menjadi sistem yang jalan sendiri.',
    'Pipeline video VR yang saya bangun mengurus ribuan video per hari dari 75 headset.',
    'Skripsi saya: sistem deteksi diabetes berbasis web. Random Forest-nya mencapai recall 0,98.',
    'Proyek akhir saya di Digital Skola mempercepat pipeline sentimen berita dari sekitar 20 menit menjadi 20 detik.',
    'Di aplikasi absensi saya, jam kerja tiap shift berupa data, jadi manajer bisa mengubahnya sendiri.',
    'Sebelum menulis aplikasi helpdesk, saya meriset Jira Service Management, Zendesk, Freshdesk, dan GLPI.',
    'Saya pernah jadi ketua divisi IT di KPU Mahasiswa dan ketua divisi riset di himpunan informatika.',
    'Tulisan jurnal saya tentang churn dipresentasikan di konferensi RESBUS, 14 Mei 2024.',
    'Saya juga mengurus jaringan, hardware, dan perangkat VR di area produksi.',
    'Ada proses yang masih manual di tempat Anda? Ceritakan, mungkin bisa diotomatisasi.',
    'Coba klik tombol demo di kartu proyek. Datanya dummy, jadi bebas dieksplorasi.'
  ];

  // ---- pemicu hover: tahan 0,5 detik di satu area baru bicara
  const info = el => {
    const c = el.closest('.card'), h = c && c.querySelector('h4');
    if (h) { const hit = PROJ.find(p => p[0].test(h.textContent)); if (hit) return { k: h.textContent, v: hit[1] }; }
    const ce = el.closest('.cert'); if (ce) { const t = ce.querySelector('b').textContent, hit = CERT.find(c2 => c2[0].test(t + ' ' + ce.querySelector('small').textContent)); return { k: ce.textContent, l: [(hit ? hit[1] + ' ' : `${t}, ${ce.querySelector('small').textContent}. `) + 'Klik untuk melihat sertifikatnya.'] }; }
    const bt = el.closest('.cta .btn'); if (bt) return { k: bt.href, l: [/mailto/.test(bt.href) ? 'Kirim email, nanti saya balas.' : /linkedin/.test(bt.href) ? 'Profil profesional saya di LinkedIn.' : 'Kode proyek-proyek saya ada di GitHub.'] };
    const sd = el.closest('.stats > div'), g = sd && sd.querySelector('[data-g]'); if (g && STAT[g.dataset.g]) return { k: g.dataset.g, l: [STAT[g.dataset.g]] };
  };
  let hv = 0, hk = '';
  d.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    if (e.target.closest(hero ? '.card a,.cert,.btn,.pfa-s' : '.pfa-s')) flash('happy', 1600);
    const i = hero && info(e.target);
    if (!i) { clearTimeout(hv); hk = ''; return; }
    if (i.k === hk) return; hk = i.k; clearTimeout(hv);
    hv = setTimeout(() => { if (Date.now() - lastEnd > 2500) talk(i.v ? pick('p:' + i.k, i.v) : i.l, 0); }, 500);
  });

  // ---- klik avatar: obrolan bergilir; klik cepat 3 kali membuatnya marah
  let ck = [];
  d.addEventListener('pointerdown', e => {
    if (!e.target.closest('.pfa-s')) return;
    const n = performance.now(); ck = ck.filter(t => n - t < 1500).concat(n);
    if (ck.length >= 3) { ck = []; talk([{ t: 'Eh, jangan diklik terus!', e: 'angry' }, { t: 'Bercanda. Silakan lanjut membaca.', e: 'happy' }], 2); }
    else talk([{ t: pick('tip', TIPS), e: 'happy' }], 1);
  });
  let back = 0;
  d.addEventListener('visibilitychange', () => { if (!d.hidden && Date.now() - back > 20000) { back = Date.now(); talk([{ t: 'Selamat datang kembali!', e: 'happy' }], 0); } });
  let act = Date.now(); ['pointermove', 'scroll', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { act = Date.now(); }, { passive: true }));
  setInterval(() => {
    if (Date.now() - act < 25000 || cur) return;
    if (demo && !seen('idle', 0)) talk(['Kalau bingung, coba klik tab atau peran yang tersedia di aplikasinya.'], 0);
    else if (hero && views.some(v => v === heroV && v.vis) && !seen('idle', 0)) talk(['Masih di sana? Gulir ke bawah untuk melihat pengalaman dan proyek saya.'], 0);
  }, 5000);

  // ================= bangun tampilan =================
  let heroV, dockV, dock, off = 0;
  try { off = sessionStorage.getItem('av-off'); } catch (_) {}
  if (hero) heroV = mk(hero);
  if (!off) {
    dock = d.createElement('div'); dock.className = 'pfa-dock';
    dock.innerHTML = '<div class="pfa-ring" aria-hidden="true"></div><button type="button" aria-label="Sembunyikan avatar">×</button>';
    d.body.appendChild(dock); dockV = mk(dock.firstChild);
    dock.querySelector('button').addEventListener('click', () => { try { sessionStorage.setItem('av-off', 1); } catch (_) {} views.splice(views.indexOf(dockV), 1); dock.remove(); dockV = null; run++; cur = null; });
  }
  if (heroV) {
    let sy = 0;
    const sync = () => {   // dihitung dari posisi sebenarnya, bukan dari entri observer yang bisa basi (lompat ke #hash, pemulihan gulir, tombol Back)
      const r = hero.getBoundingClientRect(), vh = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
      heroV.vis = r.height > 0 && vh / r.height > .2; dirty = true;
      if (dockV) { dockV.vis = !heroV.vis; dock.classList.toggle('on', dockV.vis); }
    };
    new IntersectionObserver(sync, { threshold: [0, .2, .5, 1] }).observe(hero);
    ['pageshow', 'load', 'hashchange', 'resize'].forEach(ev => addEventListener(ev, sync));
    addEventListener('scroll', () => { clearTimeout(sy); sy = setTimeout(sync, 150); }, { passive: true });   // jaring pengaman setelah gulir berhenti
    let secT = 0;
    const sm = { sertifikasi: 'happy', kontak: 'happy' };
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const id = e.target.id; mood.base = sm[id] || 'neutral'; apply();
      clearTimeout(secT); secT = setTimeout(() => { if (SEC[id] && !seen('sec:' + id)) talk(pick('s:' + id, SEC[id]), 1); }, 900);
    }), { rootMargin: '-40% 0px -55% 0px' });
    d.querySelectorAll('main section[id]').forEach(s => io.observe(s));
    if (!touch) {   // exit intent: kursor keluar lewat sisi atas jendela (sekali per sesi)
      const t1 = Date.now();
      d.documentElement.addEventListener('mouseleave', e => {
        let used = 0; try { used = sessionStorage.getItem('av-exit'); } catch (_) {}
        if (e.clientY > 0 || e.relatedTarget || Date.now() - t1 < 6000 || used) return;
        try { sessionStorage.setItem('av-exit', 1); } catch (_) {}
        talk([{ t: 'Eh, mau ke mana?', e: 'angry' }, { t: 'Demo proyeknya belum dicoba, lho.', e: 'angry' }, { t: 'Kalau ada waktu, mampir lagi ya.', e: 'happy' }], 3);
      });
    }
  } else if (dockV) { dockV.vis = true; dock.classList.add('on'); }

  // ================= mulai setelah frame netral siap =================
  const w0 = setInterval(() => {
    if (!okE('neutral')) return;
    clearInterval(w0); requestAnimationFrame(frame); blinkLoop(); glanceLoop();
    if (heroV) setTimeout(() => talk([{ t: 'Halo! Saya Fahru.', e: 'happy' }, { t: pick('hello', ['Saya membangun pipeline data, dashboard, dan aplikasi web. Silakan gulir ke bawah.', 'Selamat datang. Gulir untuk melihat proyek saya, atau klik saya kalau mau ngobrol.']), e: 'neutral' }], 1), 700);
    else if (demo && dockV) {
      if (!seen('hi:' + seg, 1)) setTimeout(() => talk(demo.hi.map((t, i) => i ? t : { t, e: 'happy' }), 1), 600);
      let n = 0; const tip = () => setTimeout(() => { if (n < 3) { if (!cur && Date.now() - act > 8000) talk([pick('tip', TIPS)], 0); n++; tip(); } }, 18000 + n * 20000); tip();
    }
  }, 60);
})();