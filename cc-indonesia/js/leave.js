/**
 * leave.js — Halaman Pengajuan Izin Karyawan
 *
 * Data dari server dibaca dari JSON island #leave-config (lihat leave.html):
 *   { limits: {reasonMin, maxSpanDays, maxAheadDays}, i18n: {...} }
 *
 * CATATAN KEAMANAN
 *  • Validasi di sini hanya untuk UX dan lapisan pertama. Penyerang bisa
 *    melewati JS sepenuhnya — server WAJIB memvalidasi ulang semua input
 *    (services/leaves.py → validate_leave_submission).
 *  • Semua teks dari server/pengguna ditulis lewat textContent, tidak pernah
 *    innerHTML. Jangan ubah ini.
 *  • Karakter < > tidak diblokir di input: itu bukan pertahanan XSS yang benar
 *    (output di-escape oleh Jinja) dan justru memblokir teks yang sah.
 */

(function () {
  "use strict";

  /* ── Utilitas dasar: dari core.js (satu sumber untuk seluruh aplikasi) ── */
  if (!window.Core) {
    console.error("[leave] core.js belum dimuat — tambahkan sebelum leave.js");
    return;
  }
  var csrfToken = window.Core.csrfToken;
  var fetchWithTimeout = window.Core.fetchWithTimeout;

  /* ── Konfigurasi dari server (JSON island, bukan inline script) ─── */
  function readConfig() {
    var el = document.getElementById("leave-config");
    if (!el) return {};
    try {
      var d = JSON.parse(el.textContent);
      return d && typeof d === "object" ? d : {};
    } catch (_) {
      return {};
    }
  }
  var CFG = readConfig();
  var I18N = Object.assign({}, window.I18N || {}, CFG.i18n || {});

  // Terjemahan + variabel {x}. Hasilnya selalu string biasa (aman untuk textContent).
  function T(key, fallback, vars) {
    var s = typeof I18N[key] === "string" && I18N[key] ? I18N[key] : fallback;
    if (vars)
      Object.keys(vars).forEach(function (k) {
        s = s.split("{" + k + "}").join(String(vars[k]));
      });
    return s;
  }
  function toInt(v, d) {
    var n = parseInt(v, 10);
    return isFinite(n) && n > 0 ? n : d;
  }

  /* ── Konstanta validasi ──────────────────────────────────────── */
  var ALLOWED_TYPES = ["day_off", "extra_off", "sick"]; // harus sama dengan server
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // ID pengajuan: tanpa "/", "?", "#", "."
  var DAY_MS = 86400000;
  var MAX_TOAST_LEN = 300;

  /* ── Scroll lock ─────────────────────────────────────────────── */
  var _scrollLockCount = 0;
  function lockScroll() {
    _scrollLockCount++;
    document.body.style.overflow = "hidden";
  }
  function unlockScroll() {
    _scrollLockCount = Math.max(0, _scrollLockCount - 1);
    if (_scrollLockCount === 0) document.body.style.overflow = "";
  }
  window.addEventListener("pageshow", function () {
    _scrollLockCount = 0;
    document.body.style.overflow = "";
  });

  /* ── Abstraksi modal ─────────────────────────────────────────── */
  function openModal(overlay, focusEl) {
    overlay.classList.add("is-open");
    overlay.removeAttribute("aria-hidden");
    lockScroll();
    setTimeout(function () {
      var el =
        focusEl ||
        overlay.querySelector(
          "button:not([disabled]), input:not([disabled]), select, textarea",
        );
      if (el) el.focus();
    }, 50);
  }

  function closeModal(overlay, returnEl) {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    unlockScroll();
    if (returnEl)
      setTimeout(function () {
        returnEl.focus();
      }, 50);
  }

  /* ── Referensi elemen ────────────────────────────────────────── */
  var btnOpen = document.getElementById("btnOpenModal");
  var modalOverlay = document.getElementById("modalOverlay");
  var btnCloseModal = document.getElementById("btnCloseModal");
  var btnCancelModal = document.getElementById("btnCancelModal");
  var typeGroup = document.getElementById("leaveTypeSelector");
  var startInput = document.getElementById("startDate");
  var endInput = document.getElementById("endDate");
  var reasonArea = document.getElementById("reason");
  var reasonHint = document.getElementById("reasonHint");
  var reasonCount = document.getElementById("reasonCount");
  var durSummary = document.getElementById("durationSummary");
  var durText = document.getElementById("durationText");
  var extraOffInfo = document.getElementById("extraOffInfo");
  var btnSubmit = document.getElementById("btnSubmitLeave");
  var submitText = document.getElementById("submitText");
  var submitSpin = document.getElementById("submitSpinner");
  var typeError = document.getElementById("typeError");
  var startError = document.getElementById("startError");
  var endError = document.getElementById("endError");
  var reasonError = document.getElementById("reasonError");
  var cancelOverlay = document.getElementById("cancelOverlay");
  var btnCloseCancelMd = document.getElementById("btnCloseCancelModal");
  var btnKeepLeave = document.getElementById("btnKeepLeave");
  var btnConfirmCancel = document.getElementById("btnConfirmCancel");
  var cancelTypeName = document.getElementById("cancelTypeName");
  var cancelText = document.getElementById("cancelText");
  var cancelSpin = document.getElementById("cancelSpinner");
  var statusTabs = document.getElementById("statusTabs");
  var cancelTargetId = null;

  // Batas input. Panjang alasan: atribut maxlength di HTML = sumber tunggal.
  var CL = CFG.limits || {};
  var LIMITS = {
    reasonMax:
      reasonArea && reasonArea.maxLength > 0 ? reasonArea.maxLength : 500,
    reasonMin: toInt(CL.reasonMin, 3),
    maxSpanDays: toInt(CL.maxSpanDays, 366),
    maxAheadDays: toInt(CL.maxAheadDays, 366),
  };

  if (modalOverlay) modalOverlay.setAttribute("aria-hidden", "true");
  if (cancelOverlay) cancelOverlay.setAttribute("aria-hidden", "true");

  /* ── Modal pengajuan ─────────────────────────────────────────── */
  function doOpenLeaveModal() {
    resetLeaveForm();
    openModal(modalOverlay);
  }
  function doCloseLeaveModal() {
    closeModal(modalOverlay, btnOpen);
  }

  if (btnOpen) btnOpen.addEventListener("click", doOpenLeaveModal);
  if (btnCloseModal) btnCloseModal.addEventListener("click", doCloseLeaveModal);
  if (btnCancelModal)
    btnCancelModal.addEventListener("click", doCloseLeaveModal);
  if (modalOverlay)
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === modalOverlay) doCloseLeaveModal();
    });

  /* ── Modal konfirmasi batalkan ───────────────────────────────── */
  function doOpenCancelModal(id, typeName) {
    cancelTargetId = id;
    if (cancelTypeName) cancelTypeName.textContent = typeName;
    setCancelLoading(false);
    openModal(cancelOverlay, btnConfirmCancel);
  }
  function doCloseCancelModal() {
    cancelTargetId = null;
    closeModal(cancelOverlay);
  }

  if (btnCloseCancelMd)
    btnCloseCancelMd.addEventListener("click", doCloseCancelModal);
  if (btnKeepLeave) btnKeepLeave.addEventListener("click", doCloseCancelModal);
  if (cancelOverlay)
    cancelOverlay.addEventListener("click", function (e) {
      if (e.target === cancelOverlay) doCloseCancelModal();
    });

  /* ── Escape key ──────────────────────────────────────────────── */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (cancelOverlay && cancelOverlay.classList.contains("is-open"))
      doCloseCancelModal();
    else if (modalOverlay && modalOverlay.classList.contains("is-open"))
      doCloseLeaveModal();
  });

  /* ══════════════════════════════════════════════════════════════
     VALIDASI INPUT
  ══════════════════════════════════════════════════════════════ */

  /* ── Tanggal ─────────────────────────────────────────────────── */
  // Ketat: format YYYY-MM-DD DAN tanggal kalender yang benar (tolak 2026-02-31,
  // "0050-01-01", string aneh yang diubah lewat DevTools). Hasil: ms UTC / NaN.
  function parseDateStrict(str) {
    if (typeof str !== "string" || !DATE_RE.test(str)) return NaN;
    var y = +str.slice(0, 4);
    var m = +str.slice(5, 7);
    var d = +str.slice(8, 10);
    var ms = Date.UTC(y, m - 1, d);
    var dt = new Date(ms);
    if (
      dt.getUTCFullYear() !== y ||
      dt.getUTCMonth() !== m - 1 ||
      dt.getUTCDate() !== d
    )
      return NaN;
    return ms;
  }
  function toISO(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }
  function fmtDate(iso) {
    return iso.split("-").reverse().join("/");
  }

  // Batas tanggal: "hari ini" diambil dari atribut min yang dirender SERVER
  // (bukan jam perangkat pengguna yang bisa diubah). Fallback: jam perangkat.
  var minMs = parseDateStrict(startInput ? startInput.min : "");
  if (isNaN(minMs)) {
    var _n = new Date();
    minMs = Date.UTC(_n.getFullYear(), _n.getMonth(), _n.getDate());
  }
  var maxMs = minMs + LIMITS.maxAheadDays * DAY_MS;
  [startInput, endInput].forEach(function (el) {
    if (!el) return;
    el.min = toISO(minMs);
    el.max = toISO(maxMs);
  });

  /* ── Teks bebas (alasan) ─────────────────────────────────────── */
  // Bersihkan hal-hal yang tidak pernah dibutuhkan teks normal tapi sering
  // dipakai untuk spoofing/merusak tampilan: karakter kontrol, zero-width, dan
  // override arah teks (bidi, "Trojan Source"). Baris baru tetap dipertahankan.
  function sanitizeText(raw) {
    var s = String(raw == null ? "" : raw);
    try {
      s = s.normalize("NFC");
    } catch (_) {
      /* browser lama: lanjut tanpa normalisasi */
    }
    return s
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
      .replace(/[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function charLen(s) {
    return Array.from(s).length; // hitung code point (emoji = 1), sama dengan len() Python
  }

  /* ── Jenis izin ──────────────────────────────────────────────── */
  function getSelectedType() {
    var checked = document.querySelector('input[name="leave_type"]:checked');
    var v = checked ? checked.value : null;
    return v && ALLOWED_TYPES.indexOf(v) !== -1 ? v : null; // whitelist
  }

  /* ── Aturan per-field: fungsi mengembalikan pesan error ("" = valid) ── */
  function checkType() {
    return getSelectedType()
      ? ""
      : T("errType", "Pilih jenis izinnya dulu ya.");
  }
  function checkStart() {
    var v = startInput ? startInput.value : "";
    if (!v) return T("errStartEmpty", "Tanggal mulainya belum dipilih nih.");
    var ms = parseDateStrict(v);
    if (isNaN(ms))
      return T(
        "errDateInvalid",
        "Tanggalnya nggak valid nih. Pilih lewat kalender ya.",
      );
    if (ms < minMs)
      return T("errStartPast", "Tanggal mulai paling cepat {min} ya.", {
        min: fmtDate(toISO(minMs)),
      });
    if (ms > maxMs)
      return T("errFar", "Kejauhan nih, maksimal {n} hari dari sekarang ya.", {
        n: LIMITS.maxAheadDays,
      });
    return "";
  }
  function checkEnd() {
    var v = endInput ? endInput.value : "";
    if (!v) return T("errEndEmpty", "Tanggal selesainya belum dipilih nih.");
    var ms = parseDateStrict(v);
    if (isNaN(ms))
      return T(
        "errDateInvalid",
        "Tanggalnya nggak valid nih. Pilih lewat kalender ya.",
      );
    if (ms < minMs)
      return T("errEndPast", "Tanggal selesai paling cepat {min} ya.", {
        min: fmtDate(toISO(minMs)),
      });
    var s = parseDateStrict(startInput ? startInput.value : "");
    if (!isNaN(s) && ms < s)
      return T(
        "errEndBefore",
        "Tanggal selesai nggak boleh sebelum tanggal mulai ya.",
      );
    if (ms > maxMs)
      return T("errFar", "Kejauhan nih, maksimal {n} hari dari sekarang ya.", {
        n: LIMITS.maxAheadDays,
      });
    if (!isNaN(s) && Math.round((ms - s) / DAY_MS) + 1 > LIMITS.maxSpanDays)
      return T(
        "errEndSpan",
        "Maksimal {n} hari per pengajuan ya. Kalau lebih, pisah jadi beberapa pengajuan.",
        { n: LIMITS.maxSpanDays },
      );
    return "";
  }
  function cleanReason() {
    return sanitizeText(reasonArea ? reasonArea.value : "");
  }
  function checkReason() {
    var len = charLen(cleanReason());
    if (!len) return T("errReasonEmpty", "Alasannya belum diisi nih.");
    if (len < LIMITS.reasonMin)
      return T(
        "errReasonShort",
        "Ceritain sedikit lagi dong, minimal {n} karakter ya.",
        { n: LIMITS.reasonMin },
      );
    if (len > LIMITS.reasonMax)
      return T(
        "errReasonLong",
        "Alasannya kepanjangan nih, maksimal {n} karakter ya (sekarang {len}).",
        { n: LIMITS.reasonMax, len: len },
      );
    return "";
  }

  /* ── Tampilkan / hapus pesan error di bawah field ────────────── */
  var FIELDS = {
    type: { el: typeGroup, err: typeError, check: checkType, aria: false },
    start: { el: startInput, err: startError, check: checkStart, aria: true },
    end: { el: endInput, err: endError, check: checkEnd, aria: true },
    reason: {
      el: reasonArea,
      err: reasonError,
      check: checkReason,
      aria: true,
      extra: "reasonCount",
    },
  };
  function describedBy(f, withErr) {
    var ids = [];
    if (withErr && f.err && f.err.id) ids.push(f.err.id);
    if (f.extra) ids.push(f.extra);
    return ids.join(" ");
  }
  function setFieldError(f, msg) {
    if (f.err) {
      f.err.textContent = msg; // textContent: aman dari XSS
      f.err.hidden = false;
    }
    if (!f.el) return;
    if (f.aria) {
      f.el.setAttribute("aria-invalid", "true");
      f.el.setAttribute("aria-describedby", describedBy(f, true));
    } else {
      f.el.classList.add("is-invalid");
    }
  }
  function clearFieldError(f) {
    if (f.err) {
      f.err.textContent = "";
      f.err.hidden = true;
    }
    if (!f.el) return;
    if (f.aria) {
      f.el.removeAttribute("aria-invalid");
      var d = describedBy(f, false);
      if (d) f.el.setAttribute("aria-describedby", d);
      else f.el.removeAttribute("aria-describedby");
    } else {
      f.el.classList.remove("is-invalid");
    }
  }
  function runCheck(f) {
    var msg = f.check();
    if (msg) setFieldError(f, msg);
    else clearFieldError(f);
    return !msg;
  }
  function focusField(f) {
    var el =
      f === FIELDS.type
        ? document.querySelector('input[name="leave_type"]')
        : f.el;
    if (!el) return;
    el.focus();
    if (el.scrollIntoView) el.scrollIntoView({ block: "center" });
  }

  /* ── Jenis izin radio cards ──────────────────────────────────── */
  var typeRadios = document.querySelectorAll('input[name="leave_type"]');
  typeRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
      runCheck(FIELDS.type);
      if (extraOffInfo) extraOffInfo.hidden = this.value !== "extra_off";
      if (reasonHint)
        reasonHint.textContent =
          this.value === "sick" ? I18N.leaveOptional || "(opsional)" : "";
      recalcDuration();
    });
  });

  /* ── Kalkulasi durasi ────────────────────────────────────────── */
  function recalcDuration() {
    if (!startInput || !endInput || !durSummary || !durText) return;
    var startMs = parseDateStrict(startInput.value);
    var endMs = parseDateStrict(endInput.value);
    if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
      durSummary.hidden = true;
      return;
    }
    var days = Math.round((endMs - startMs) / DAY_MS) + 1;
    durText.textContent = days + " " + (I18N.leaveDay || "hari");
    durSummary.hidden = false;
  }

  /* ── Validasi langsung saat mengisi ──────────────────────────── */
  if (startInput) {
    startInput.addEventListener("change", function () {
      var startMs = parseDateStrict(this.value);
      if (endInput && !isNaN(startMs)) {
        endInput.min = toISO(Math.max(startMs, minMs));
        if (endInput.value && endInput.value < this.value)
          endInput.value = this.value;
      }
      runCheck(FIELDS.start);
      if (endInput && endInput.value) runCheck(FIELDS.end); // bergantung pada tanggal mulai
      recalcDuration();
    });
  }
  if (endInput) {
    endInput.addEventListener("change", function () {
      runCheck(FIELDS.end);
      recalcDuration();
    });
  }

  var reasonTouched = false;
  function updateReasonCount() {
    if (!reasonArea || !reasonCount) return;
    var len = charLen(reasonArea.value);
    reasonCount.textContent = len + "/" + LIMITS.reasonMax;
    reasonCount.classList.toggle("is-near", len >= LIMITS.reasonMax * 0.9);
    reasonCount.classList.toggle("is-over", len > LIMITS.reasonMax);
  }
  if (reasonArea) {
    reasonArea.addEventListener("input", function () {
      reasonTouched = true;
      updateReasonCount();
      // Pesan ikut diperbarui saat mengetik; hilang begitu sudah benar
      if (this.hasAttribute("aria-invalid")) runCheck(FIELDS.reason);
    });
    reasonArea.addEventListener("blur", function () {
      if (reasonTouched || this.value) runCheck(FIELDS.reason);
    });
  }

  /* ── Validasi form (saat submit) ─────────────────────────────── */
  function validateLeaveForm() {
    var firstBad = null;
    ["type", "start", "end", "reason"].forEach(function (k) {
      if (!runCheck(FIELDS[k]) && !firstBad) firstBad = FIELDS[k];
    });
    if (firstBad) focusField(firstBad);
    return !firstBad;
  }

  /* ── Reset form ──────────────────────────────────────────────── */
  function resetLeaveForm() {
    typeRadios.forEach(function (r) {
      r.checked = false;
    });
    if (startInput) startInput.value = "";
    if (endInput) {
      endInput.value = "";
      endInput.min = toISO(minMs);
    }
    if (reasonArea) reasonArea.value = "";
    reasonTouched = false;
    Object.keys(FIELDS).forEach(function (k) {
      clearFieldError(FIELDS[k]);
    });
    updateReasonCount();
    if (durSummary) durSummary.hidden = true;
    if (extraOffInfo) extraOffInfo.hidden = true;
    if (reasonHint) reasonHint.textContent = "";
    setSubmitLoading(false);
  }

  /* ── Respons server ──────────────────────────────────────────── */
  // Hanya terima JSON. Respons lain (mis. halaman login HTML setelah sesi habis,
  // atau error 502 dari proxy) dianggap gagal — tidak pernah dianggap sukses.
  function readJson(res) {
    var ct =
      res.headers && res.headers.get ? res.headers.get("content-type") || "" : "";
    if (ct.indexOf("application/json") === -1)
      return Promise.resolve({ ok: false, data: {} });
    return res
      .json()
      .then(function (d) {
        return { ok: res.ok, data: d && typeof d === "object" ? d : {} };
      })
      .catch(function () {
        return { ok: false, data: {} };
      });
  }
  // Pesan dari server: harus string, dipotong. (Tetap hanya lewat textContent.)
  function safeText(v, fallback) {
    return typeof v === "string" && v.trim()
      ? v.trim().slice(0, MAX_TOAST_LEN)
      : fallback;
  }
  // Jika server menyebut field yang salah ({"field": "start_date"}), tampilkan
  // pesannya langsung di bawah field itu.
  var SERVER_FIELDS = {
    leave_type: "type",
    start_date: "start",
    end_date: "end",
    reason: "reason",
  };
  function applyServerFieldError(data) {
    if (
      !data ||
      typeof data.field !== "string" ||
      !Object.prototype.hasOwnProperty.call(SERVER_FIELDS, data.field) ||
      typeof data.message !== "string"
    )
      return false;
    var f = FIELDS[SERVER_FIELDS[data.field]];
    setFieldError(f, safeText(data.message, ""));
    focusField(f);
    return true;
  }

  /* ── Submit pengajuan ────────────────────────────────────────── */
  var submitBusy = false;
  function setSubmitLoading(loading) {
    submitBusy = loading;
    if (!btnSubmit) return;
    btnSubmit.disabled = loading;
    if (submitText) submitText.hidden = loading;
    if (submitSpin) submitSpin.hidden = !loading;
  }

  if (btnSubmit) {
    btnSubmit.addEventListener("click", function () {
      if (submitBusy) return; // cegah kirim ganda (klik cepat / Enter berulang)
      if (!validateLeaveForm()) return;
      setSubmitLoading(true);

      // Kirim nilai yang sudah divalidasi + dibersihkan, bukan nilai mentah
      var payload = {
        leave_type: getSelectedType(),
        start_date: startInput.value,
        end_date: endInput.value,
        reason: cleanReason(),
      };

      fetchWithTimeout("/employee/leave", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken(),
        },
        body: JSON.stringify(payload),
      })
        .then(readJson)
        .then(function (r) {
          if (r.ok) {
            doCloseLeaveModal();
            showToast(
              safeText(
                r.data.message,
                I18N.leaveSubmitSuccess || "Pengajuan berhasil dikirim.",
              ),
              "success",
            );
            setTimeout(function () {
              location.reload();
            }, 900);
          } else {
            if (!applyServerFieldError(r.data))
              showToast(
                safeText(
                  r.data.message,
                  I18N.leaveErrorRetry || "Terjadi kesalahan. Silakan coba lagi.",
                ),
                "danger",
              );
            setSubmitLoading(false);
          }
        })
        .catch(function (err) {
          showToast(
            err && err.name === "AbortError"
              ? I18N.leaveTimeout ||
                  "Permintaan timeout. Periksa koneksi internet."
              : I18N.leaveConnFailed || "Gagal terhubung ke server.",
            "danger",
          );
          setSubmitLoading(false);
        });
    });
  }

  /* ── Filter tabel ────────────────────────────────────────────── */
  if (statusTabs) {
    statusTabs.addEventListener("click", function (e) {
      var tab = e.target.closest(".tab");
      if (!tab) return;
      statusTabs.querySelectorAll(".tab").forEach(function (t) {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      var filter = tab.dataset.filter;
      document.querySelectorAll("#leaveTable tbody tr").forEach(function (row) {
        row.classList.toggle(
          "row-hidden",
          filter !== "all" && row.dataset.status !== filter,
        );
      });
    });
  }

  /* ── Batalkan pengajuan ──────────────────────────────────────── */
  document.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var btn = e.target.closest(".btn-cancel-leave");
    if (!btn) return;
    var id = btn.dataset.id || "";
    // ID masuk ke path URL: tolak apa pun yang bukan ID polos (mis. "../admin")
    if (!ID_RE.test(id)) {
      showToast(
        T(
          "errBadId",
          "Pengajuan ini nggak bisa dibatalkan. Coba muat ulang halamannya ya.",
        ),
        "danger",
      );
      return;
    }
    doOpenCancelModal(
      id,
      (btn.dataset.type || I18N.leaveDefaultType || "izin").slice(0, 60),
    );
  });

  function setCancelLoading(loading) {
    if (!btnConfirmCancel) return;
    btnConfirmCancel.disabled = loading;
    if (cancelText) cancelText.hidden = loading;
    if (cancelSpin) cancelSpin.hidden = !loading;
  }

  if (btnConfirmCancel) {
    btnConfirmCancel.addEventListener("click", function () {
      if (!cancelTargetId || !ID_RE.test(cancelTargetId)) return;
      setCancelLoading(true);

      fetchWithTimeout(
        "/employee/leave/" + encodeURIComponent(cancelTargetId) + "/cancel",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "X-CSRFToken": csrfToken() },
        },
      )
        .then(readJson)
        .then(function (r) {
          if (r.ok) {
            doCloseCancelModal();
            showToast(
              safeText(
                r.data.message,
                I18N.leaveCancelSuccess || "Pengajuan dibatalkan.",
              ),
              "success",
            );
            setTimeout(function () {
              location.reload();
            }, 900);
          } else {
            showToast(
              safeText(
                r.data.message,
                I18N.leaveCancelFailed || "Gagal membatalkan pengajuan.",
              ),
              "danger",
            );
            setCancelLoading(false);
          }
        })
        .catch(function (err) {
          showToast(
            err && err.name === "AbortError"
              ? I18N.leaveTimeout || "Permintaan timeout."
              : I18N.leaveConnFailed || "Gagal terhubung ke server.",
            "danger",
          );
          setCancelLoading(false);
        });
    });
  }

  /* ── Toast notifikasi ────────────────────────────────────────── */
  function showToast(message, category) {
    var cat = category === "success" ? "success" : "danger"; // whitelist → className
    var wrap = document.querySelector(".flash-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "flash-wrap";
      var main = document.getElementById("main-content");
      (main || document.body).insertBefore(
        wrap,
        (main || document.body).firstChild,
      );
    }
    var flash = document.createElement("div");
    flash.className = "flash flash-" + cat;
    flash.setAttribute("role", "alert");
    flash.setAttribute("aria-live", "polite");

    var msgSpan = document.createElement("span");
    msgSpan.textContent = String(message).slice(0, MAX_TOAST_LEN);

    var closeBtn = document.createElement("button");
    closeBtn.className = "flash-close";
    closeBtn.setAttribute("aria-label", I18N.leaveClose || "Tutup");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", function () {
      flash.remove();
    });

    flash.appendChild(msgSpan);
    flash.appendChild(closeBtn);
    wrap.appendChild(flash);
    setTimeout(function () {
      if (flash.parentNode) flash.remove();
    }, 5000);
  }

  updateReasonCount();
})();