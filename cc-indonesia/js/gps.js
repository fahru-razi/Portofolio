/**
 * GPS Check-in/out Handler
 * Dipakai di: employee/dashboard.html dan manager/dashboard.html
 *
 * Perbaikan:
 *  1. Office data di-fetch live dari API (/employee/offices.json atau
 *     /manager/offices.json) setiap kali halaman dibuka — tidak lagi
 *     bergantung pada window.OFFICES yang bisa stale setelah edit kantor.
 *  2. window.OFFICES tetap sebagai fallback jika fetch gagal (offline, dsb).
 *  3. setStatus() mempertahankan base class elemen (mgr-gps-status vs gps-status).
 *
 * CHANGELOG:
 *  ISSUE 1 FIX: Ganti optional chaining (?.) ke null-safe ES5 equivalent
 *               — mencegah SyntaxError di Chrome < 80 / Safari iOS < 13.4.
 *  ISSUE 2 FIX: GPS_TIMEOUT dinaikkan 12s → 20s, GPS_MAX_AGE 8s → 30s
 *               — cold-start GPS chip di HP lama butuh hingga 15–30 detik.
 *  ISSUE 3 FIX: Tambahkan retry mechanism — setelah GPS error, tombol
 *               "Coba Lagi" muncul; klik re-run acquisition tanpa full reload.
 *  DEVICE-ID FIX: Tambahkan device_id ke payload checkin/checkout (dari
 *               window.getDeviceId(), disediakan oleh device-id.js). Bersifat
 *               opsional — jika device-id.js belum di-load atau gagal,
 *               device_id dikirim null dan check-in/checkout tetap normal.
 *               Tidak ada validasi/pembatasan berbasis device_id di sini
 *               maupun di backend — murni untuk pencatatan.
 *
 * I18N keys yang dibutuhkan (definisikan di template sebelum script ini):
 *   gpsOfficeNotConfigured, gpsOfficeNotFound, gpsTapCheckOut, gpsTapCheckIn,
 *   gpsWaiting, gpsDetecting, gpsInsideArea, gpsOutsideArea, gpsDistanceUnknown,
 *   gpsMetersFromOffice, gpsKmFromOffice, gpsPermissionDenied, gpsSignalUnavailable,
 *   gpsTimedOut, gpsError, gpsOutsideOffice, gpsBrowserNoSupport, gpsNotSupported,
 *   gpsNotReady, gpsProcessing, gpsUpdatingPage, gpsConnectionError, gpsRetry
 */

(function () {
  "use strict";

  var I18N = window.I18N || {};

  /* ISSUE 2 FIX: Naikkan timeout & max_age */
  var GPS_TIMEOUT = 20000;  // dari 12000 — cold-start chip butuh 15-30 detik
  var GPS_MAX_AGE = 30000;  // dari 8000  — cached fix masih valid 30 detik

  var btnMain  = document.getElementById("btn-main");
  var statusEl = document.getElementById("gps-status");

  /* ISSUE 1 FIX: Ganti ?. ke null-safe equivalent */
  var statusText = statusEl ? statusEl.querySelector(".gps-status-text") : null;
  var GPS_BASE_CLASS = (statusEl && statusEl.classList.contains("mgr-gps-status"))
    ? "mgr-gps-status"
    : "gps-status";

  var accuracyEl = document.getElementById("gps-accuracy");
  var noteEl     = document.getElementById("checkin-note");
  var locationTextEl = document.getElementById("ed-location-text");
  var locationTextDefault = locationTextEl ? locationTextEl.innerHTML : null;

  var STATE              = window.CHECKIN_STATE || "out";
  var IS_MANAGER         = window.location.pathname.indexOf("/manager") === 0;
  var BASE_PATH          = IS_MANAGER ? "/manager" : "/employee";

  // Jika sudah check-out, sedang cuti/izin, atau terlalu awal untuk checkout
  // — tidak perlu GPS sama sekali.
  if (STATE === "done" || STATE === "leave" || STATE === "early") return;

  // Jika sudah check-in tapi belum waktunya checkout (checkout_too_early),
  // GPS tetap berjalan agar tombol bisa aktif saat jam buka checkout tiba —
  // NAMUN jika CHECKOUT_TOO_EARLY = true saat init, nonaktifkan tombol dulu
  // dengan pesan yang tepat sampai GPS resolve & waktu valid.
  var IS_CHECKOUT_TOO_EARLY = window.CHECKOUT_TOO_EARLY === true;

  // Jika btn-main tidak ada (misal: absensi ditutup / past_cutoff),
  // GPS tetap berjalan agar status lokasi tetap ditampilkan di UI.
  // enableButton() dan disableButton() sudah null-safe (ada guard !btnMain).

  // ── State ──────────────────────────────────────────────────────────────────
  var offices       = [];    // populated after API fetch (or fallback)
  var userLat       = null;
  var userLng       = null;
  var userAccuracy  = null;
  var gpsReady      = false;
  var positionReady = false;

  // ── UI helpers ─────────────────────────────────────────────────────────────
  function setStatus(type, text) {
    if (!statusEl) return;
    statusEl.className = GPS_BASE_CLASS + " gps-" + type;
    if (statusText) statusText.textContent = text;
  }

  /* [LOCATION-TEXT] Update teks lokasi di sisi kiri ed-location-bar dengan
     jarak-dari-kantor hasil GPS. Dipanggil berdampingan dengan setStatus()
     di semua call-site yang sama — lihat evaluatePosition() & onError().
     Jika elemen tidak ada di halaman (mis. manager/dashboard.html yang tidak
     punya #ed-location-text), fungsi ini no-op — null-safe. */
  function setLocationText(html) {
    if (!locationTextEl) return;
    locationTextEl.innerHTML = html;
  }

  function resetLocationTextToDefault() {
    if (!locationTextEl || locationTextDefault === null) return;
    locationTextEl.innerHTML = locationTextDefault;
  }

  function setNote(text) {
    if (noteEl) noteEl.textContent = text;
  }

  function enableButton() {
    if (!btnMain) return;
    btnMain.disabled = false;
    setNote(STATE === "in" ? I18N.gpsTapCheckOut : I18N.gpsTapCheckIn);
  }

  function disableButton(reason) {
    if (!btnMain) return;
    btnMain.disabled = true;
    setNote(reason);
  }

  // ── ISSUE 3 FIX: Retry mechanism ──────────────────────────────────────────
  // Setelah GPS error, tampilkan tombol "Coba Lagi" tanpa full page reload.
  // Tombol disisipkan ke dalam statusEl; di-remove saat retry dimulai.

  var retryBtn = null;

  function showRetryButton() {
    if (!statusEl || retryBtn) return;  // sudah ada, skip
    retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.textContent = I18N.gpsRetry || "Coba Lagi";
    retryBtn.style.cssText = [
      "margin-left:8px",
      "padding:2px 8px",
      "font-size:11px",
      "font-weight:600",
      "border:1.5px solid currentColor",
      "border-radius:5px",
      "background:transparent",
      "color:inherit",
      "cursor:pointer",
      "flex-shrink:0"
    ].join(";");
    retryBtn.addEventListener("click", retryGps);
    statusEl.appendChild(retryBtn);
  }

  function removeRetryButton() {
    if (retryBtn && retryBtn.parentNode) {
      retryBtn.parentNode.removeChild(retryBtn);
    }
    retryBtn = null;
  }

  function retryGps() {
    removeRetryButton();
    positionReady = false;
    gpsReady      = false;
    userLat       = null;
    userLng       = null;
    userAccuracy  = null;

    setStatus("detecting", I18N.gpsDetecting);
    setLocationText(escapeHtml(I18N.gpsDetecting));
    if (IS_CHECKOUT_TOO_EARLY) {
      disableButton(I18N.checkoutTooEarly || I18N.gpsWaiting);
    } else {
      disableButton(I18N.gpsWaiting);
    }

    var geoRetryPromise = new Promise(function (resolve) {
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          onPosition(pos);
          resolve();
        },
        function (err) {
          onError(err);
          resolve();
        },
        {
          enableHighAccuracy: true,
          timeout: GPS_TIMEOUT,
          maximumAge: GPS_MAX_AGE,
        }
      );
    });

    geoRetryPromise.then(function () {
      if (!positionReady) return;
      evaluatePosition();
    });
  }

  // ── Haversine ──────────────────────────────────────────────────────────────
  function haversine(lat1, lng1, lat2, lng2) {
    var R      = 6371000;
    var toRad  = function (d) { return (d * Math.PI) / 180; };
    var dLat   = toRad(lat2 - lat1);
    var dLng   = toRad(lng2 - lng1);
    var sinDLat = Math.sin(dLat / 2);
    var sinDLng = Math.sin(dLng / 2);
    var a =
      sinDLat * sinDLat +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLng * sinDLng;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Office proximity check ─────────────────────────────────────────────────
  function checkAllOffices(lat, lng) {
    if (!offices.length) return { inside: false, office: null, distance: null };

    var nearestOffice   = null;
    var nearestDistance = null;

    for (var i = 0; i < offices.length; i++) {
      var office = offices[i];
      if (office.lat == null || office.lng == null) continue;
      var d = haversine(lat, lng, office.lat, office.lng);

      if (nearestDistance === null || d < nearestDistance) {
        nearestDistance = d;
        nearestOffice   = office;
      }

      if (d <= office.radius_meters) {
        return { inside: true, office: office, distance: d };
      }
    }

    return { inside: false, office: nearestOffice, distance: nearestDistance };
  }

  // ── Evaluate position against current offices ──────────────────────────────
  function evaluatePosition() {
    if (!positionReady) return;

    if (!offices.length) {
      setStatus("error", I18N.gpsOfficeNotConfigured);
      disableButton(I18N.gpsOfficeNotFound);
      resetLocationTextToDefault();
      return;
    }

    var result = checkAllOffices(userLat, userLng);

    if (result.inside) {
      setStatus("ok", I18N.gpsInsideArea + " " + (result.office.name || ""));
      setLocationText(
        (I18N.gpsAtOffice || "") + " <strong>" +
        escapeHtml(result.office.name || "") + "</strong>"
      );
      gpsReady = true;
      if (IS_CHECKOUT_TOO_EARLY) {
        // Dalam area, tapi belum waktunya checkout — update status lokasi
        // tapi jangan enable tombol (pesan sudah diset dari template)
        disableButton(I18N.checkoutTooEarly || I18N.gpsWaiting);
      } else {
        enableButton();
      }
    } else {
      gpsReady = false;
      var dist     = result.distance;
      var distText =
        dist === null
          ? I18N.gpsDistanceUnknown
          : dist < 1000
            ? Math.round(dist) + " " + I18N.gpsMetersFromOffice
            : (dist / 1000).toFixed(1) + " " + I18N.gpsKmFromOffice;
      setStatus("outside", I18N.gpsOutsideArea + " \u00b7 " + distText);
      setLocationText(escapeHtml(distText));
      disableButton(I18N.gpsOutsideOffice);
    }
  }

  /* Escape sederhana — result.office.name berasal dari API/offices.json,
     bukan input pengguna, tapi tetap di-escape sebelum masuk innerHTML
     sebagai langkah aman. */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ── Fetch fresh office data from API ───────────────────────────────────────
  function fetchOffices() {
    return fetch(BASE_PATH + "/offices.json", { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (Array.isArray(data.offices) && data.offices.length > 0) {
          offices = data.offices;
        } else {
          useFallbackOffices();
        }
      })
      .catch(function () {
        // Network/parse error — fallback to baked-in data silently
        useFallbackOffices();
      });
  }

  function useFallbackOffices() {
    offices =
      window.OFFICES && window.OFFICES.length
        ? window.OFFICES
        : window.OFFICE && window.OFFICE.lat
          ? [window.OFFICE]
          : [];
  }

  // ── GPS callbacks ──────────────────────────────────────────────────────────
  function onPosition(pos) {
    userLat      = pos.coords.latitude;
    userLng      = pos.coords.longitude;
    userAccuracy = pos.coords.accuracy;
    positionReady = true;

    if (accuracyEl) {
      accuracyEl.textContent = "\u00b1" + Math.round(userAccuracy) + " m";
    }
  }

  function onError(err) {
    var msgs = {
      1: I18N.gpsPermissionDenied,
      2: I18N.gpsSignalUnavailable,
      3: I18N.gpsTimedOut,
    };
    var msg = msgs[err.code] || I18N.gpsError;
    setStatus("error", msg);
    disableButton(msg);
    resetLocationTextToDefault();
    positionReady = false;

    /* ISSUE 3 FIX: Tampilkan tombol retry setelah error */
    // Tidak perlu retry untuk permission denied (code=1) — user harus ubah setting browser
    if (err.code !== 1) {
      showRetryButton();
    }
  }

  // ── Bootstrap: run GPS + office fetch in parallel ─────────────────────────
  if (!("geolocation" in navigator)) {
    setStatus("error", I18N.gpsBrowserNoSupport);
    disableButton(I18N.gpsNotSupported);
    return;
  }

  setStatus("detecting", I18N.gpsDetecting);
  setLocationText(escapeHtml(I18N.gpsDetecting));
  if (IS_CHECKOUT_TOO_EARLY) {
    // Sudah check-in, belum waktunya checkout — tombol tetap disabled dengan pesan tepat
    disableButton(I18N.checkoutTooEarly || I18N.gpsWaiting);
  } else {
    disableButton(I18N.gpsWaiting);
  }

  var geoPromise = new Promise(function (resolve) {
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        onPosition(pos);
        resolve();
      },
      function (err) {
        onError(err);
        resolve();
      },
      {
        enableHighAccuracy: true,
        timeout: GPS_TIMEOUT,
        maximumAge: GPS_MAX_AGE,
      }
    );
  });

  var officesPromise = fetchOffices();

  // Evaluate once BOTH are ready
  Promise.all([geoPromise, officesPromise]).then(function () {
    if (!positionReady) return; // GPS failed — onError() already handled UI
    evaluatePosition();
  });

  // ── Checkin / checkout action ──────────────────────────────────────────────
  window.doCheckin = function (action) {
    // GPS REQUIRED FIX: cek lat DAN lng — sebelumnya hanya userLat yang
    // dicek, jadi state yang timpang (mis. race saat DOM belum siap,
    // btn-main tidak ketemu sehingga disableButton() no-op) tetap bisa
    // mengirim request checkout/checkin dengan koordinat tidak lengkap.
    // Backend (schemas.py + _do_checkout()) sudah menolak ini juga, tapi
    // guard di sini mencegah request sia-sia terkirim sama sekali.
    if (!gpsReady || userLat === null || userLng === null) {
      setNote(I18N.gpsNotReady);
      if (btnMain) btnMain.disabled = true;
      return;
    }

    btnMain.disabled = true;
    setNote(I18N.gpsProcessing);

    fetch(BASE_PATH + "/" + action, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": window.CSRF_TOKEN || "",
      },
      body: JSON.stringify({
        lat: userLat,
        lng: userLng,
        accuracy: userAccuracy,
        device_id: (window.getDeviceId ? window.getDeviceId() : null),
      }),
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.status === "ok") {
          setStatus("ok", data.message || "OK");
          setNote(I18N.gpsUpdatingPage);
          setTimeout(function () {
            location.reload();
          }, 1100);
        } else if (data.status === "outside") {
          setStatus("outside", data.message || I18N.gpsOutsideOffice);
          setNote(data.message || I18N.gpsOutsideOffice);
          if (gpsReady) btnMain.disabled = false;
        } else if (data.status === "already_checked_in") {
          /* BUG-FIX (409-machine-gun): status ini berarti state di server
           * sudah beda dari yang ditampilkan halaman (mis. today_log basi
           * karena window check-in shift malam terbuka lagi malam
           * berikutnya sebelum user checkout). Tombol tidak di-re-enable
           * -- reload supaya Jinja render ulang state yang benar (biasanya
           * jadi tombol "Check-out Sekarang"). Ini SATU-SATUNYA status
           * non-"ok" yang memicu reload; status lain (outside, error GPS,
           * dst.) tetap seperti semula supaya user tidak kehilangan
           * progress GPS untuk error yang tidak terkait state basi.
           */
          setStatus("ok", data.message || I18N.gpsUpdatingPage);
          setNote(I18N.gpsUpdatingPage);
          setTimeout(function () {
            location.reload();
          }, 1100);
        } else {
          setNote(data.message || I18N.gpsError);
          if (gpsReady) btnMain.disabled = false;
        }
      })
      .catch(function () {
        setNote(I18N.gpsConnectionError);
        if (gpsReady) btnMain.disabled = false;
      });
  };
})();