/**
 * tracking.js — pelapor lokasi sisi karyawan.
 *
 * Perilaku:
 *   • Tiap ±60 detik (hanya saat tab terlihat) menanyakan status ringan ke
 *     server: ada permintaan update dari eksekutif? Pertanyaan ini TIDAK
 *     membaca GPS.
 *   • Jika sudah ≥ 10 menit sejak laporan terakhir (batch), ATAU server
 *     meminta (send_now) -> baca GPS lalu kirim.
 *   • Jika GPS gagal (izin ditolak / sinyal tidak ada / timeout), laporan
 *     tetap dikirim TANPA koordinat. Server lalu memakai IP perangkat
 *     (jaringan kantor / perkiraan kasar) sebagai opsi terakhir.
 *   • Tidak dibatasi jam kerja / check-in-out. Berhenti sendiri bila tab
 *     ditutup, browser ditutup, atau GPS/izin lokasi dimatikan karyawan.
 *
 * Batasan platform: web tidak bisa membaca GPS di latar belakang. Laporan
 * hanya terkirim selama aplikasi/tab terbuka di layar. Karena situs ini
 * multi-halaman, waktu laporan terakhir disimpan di localStorage agar
 * berpindah halaman tidak memicu laporan baru.
 *
 * Transparansi: ada indikator kecil "lokasi dibagikan" selama berjalan.
 *
 * Bergantung pada: window.Core (core.js), window.TRACKING_CFG (base.html)
 */
(function () {
  "use strict";

  var cfg = window.TRACKING_CFG;
  if (!cfg || !window.Core || !cfg.statusUrl || !cfg.pingUrl) return;

  var T = cfg.i18n || {};
  var BATCH_MS = (cfg.intervalSeconds || 600) * 1000;
  var POLL_MS = (cfg.statusPollSeconds || 60) * 1000;
  var KEY = "trk:lastSent";
  var SRC_KEY = "trk:lastSource";   // sumber lokasi laporan terakhir (untuk indikator)

  var busy = false;
  var stopped = false;
  var pill = null;

  // ── penyimpanan waktu laporan terakhir ─────────────────────────────────────
  function readLast() {
    try { return parseInt(localStorage.getItem(KEY), 10) || 0; } catch (e) { return 0; }
  }
  function writeLast(ts) {
    try { localStorage.setItem(KEY, String(ts)); } catch (e) { /* mode privat */ }
  }
  function clearLast() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(SRC_KEY); } catch (e) { /* abaikan */ }
  }
  function readSource() {
    try { return localStorage.getItem(SRC_KEY) || ""; } catch (e) { return ""; }
  }
  function writeSource(src) {
    try { localStorage.setItem(SRC_KEY, src || "none"); } catch (e) { /* abaikan */ }
  }

  // ── indikator ──────────────────────────────────────────────────────────────
  function ensurePill() {
    if (pill) return pill;
    var style = document.createElement("style");
    style.textContent =
      ".trk-pill{position:fixed;right:12px;" +
      "bottom:calc(3.4rem + 18px + env(safe-area-inset-bottom,0px));z-index:40;" +
      "display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;" +
      "background:rgba(15,37,55,.88);color:#fff;font-size:11px;line-height:1.2;" +
      "max-width:70vw;pointer-events:none}" +
      ".trk-pill i{width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0}" +
      ".trk-pill.warn i{background:#f59e0b}" +
      "@media(min-width:1024px){.trk-pill{bottom:16px}}";
    document.head.appendChild(style);

    pill = document.createElement("div");
    pill.className = "trk-pill";
    pill.setAttribute("role", "status");
    pill.setAttribute("aria-live", "polite");
    pill.appendChild(document.createElement("i"));
    pill.appendChild(document.createElement("span"));
    document.body.appendChild(pill);
    return pill;
  }

  function showPill(text, warn) {
    var p = ensurePill();
    p.className = "trk-pill" + (warn ? " warn" : "");
    p.lastChild.textContent = text;
    p.style.display = "flex";
  }
  function hidePill() {
    if (pill) pill.style.display = "none";
  }

  function pillFromResult(r) {
    if (!r || r.tracking === false) { hidePill(); return; }
    if (r.source === "gps") { showPill(T.active || "Lokasi dibagikan (GPS)", false); return; }
    if (r.source === "office_ip") {
      showPill(T.viaOffice || "GPS mati · terdeteksi di jaringan kantor", true); return;
    }
    if (r.source === "geoip") {
      showPill(T.viaIp || "GPS mati · perkiraan kasar via IP", true); return;
    }
    showPill(T.gpsOff || "GPS mati · lokasi tidak terkirim", true);
  }

  // ── GPS ────────────────────────────────────────────────────────────────────
  function readPosition() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve({ gps_status: "unsupported" }); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            gps_status: "ok",
          });
        },
        function (err) {
          resolve({
            gps_status: err && err.code === 1 ? "denied"
              : err && err.code === 3 ? "timeout" : "unavailable",
          });
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
      );
    });
  }

  function sendReport() {
    busy = true;
    return readPosition()
      .then(function (payload) {
        return window.Core.apiFetch(cfg.pingUrl, "POST", payload);
      })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) { stopped = true; return null; }
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data && data.accepted !== false) writeLast(Date.now());
        if (data && data.tracking !== false) writeSource(data.source);
        if (data) pillFromResult(data);
      })
      .catch(function () { /* coba lagi pada siklus berikutnya */ })
      .then(function () { busy = false; });
  }

  // ── siklus ─────────────────────────────────────────────────────────────────
  function tick() {
    if (stopped || busy || document.hidden) return;

    window.Core.apiFetch(cfg.statusUrl, "GET")
      .then(function (res) {
        if (res.status === 401 || res.status === 403) { stopped = true; return null; }
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (st) {
        if (!st) return;
        if (!st.enabled) { stopped = true; hidePill(); return; }
        if (!st.tracking) { clearLast(); hidePill(); return; }

        var due = Date.now() - readLast() >= BATCH_MS;
        if (st.send_now || due) return sendReport();

        // Belum waktunya laporan: tampilkan kondisi laporan terakhir (bukan
        // teks generik) supaya karyawan tahu GPS-nya sedang mati.
        var src = readSource();
        if (src) pillFromResult({ tracking: true, source: src });
        else showPill(T.onDuty || "Lokasi dibagikan", false);
      })
      .catch(function () { /* jaringan putus — coba lagi nanti */ });
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) tick();
  });
  setInterval(tick, POLL_MS);
  setTimeout(tick, 3000); // beri waktu halaman selesai dimuat
})();
