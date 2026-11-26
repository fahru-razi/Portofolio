/* ========================================================================
   shift_swap.js  --  Logika interaksi halaman Tukar Shift
   v2 — tanggal sama, durasi hari kerja, auto-revert notice
   ======================================================================== */

/* ========================================================================
   1. TAB SWITCHING
   ======================================================================== */
function switchTab(tab, el) {
  document.querySelectorAll(".swap-tab").forEach(function (t) {
    t.classList.remove("active");
  });
  el.classList.add("active");
  document.getElementById("tab-sent").style.display =
    tab === "sent" ? "" : "none";
  document.getElementById("tab-received").style.display =
    tab === "received" ? "" : "none";
}

/* ========================================================================
   2. REQUEST MODAL
   ======================================================================== */

/** State kuota bulan berjalan (di-refresh setiap kali tanggal berubah) */
var _quotaState = window.__SWAP_QUOTA_STATUS__ || {
  quota: null,
  is_unlimited: true,
  used: 0,
  remaining: null,
  exceeded: false,
};

function openRequestModal() {
  // Blokir pembukaan modal jika kuota bulan berjalan sudah habis.
  // (Pengecekan definitif tetap dilakukan ulang di backend saat submit,
  // karena tanggal swap yang dipilih user bisa jatuh di bulan berbeda.)
  if (_quotaState && !_quotaState.is_unlimited && _quotaState.exceeded) {
    alert(
      "Kuota tukar shift kamu bulan ini sudah habis (" +
        _quotaState.used +
        "/" +
        _quotaState.quota +
        "). Pengajuan baru tidak dapat dikirim.",
    );
    return;
  }
  document.getElementById("requestModalOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
  resetRequestModal();
}

/**
 * Ambil ulang status kuota untuk bulan dari tanggal swap yang dipilih,
 * lalu update UI peringatan pada form (dipanggil saat tanggal mulai berubah).
 */
function _refreshQuotaForDate(swapDateStr) {
  var url = window.__SWAP_QUOTA_STATUS_URL__;
  if (!url) return;
  var q = swapDateStr ? "?swap_date=" + encodeURIComponent(swapDateStr) : "";
  fetch(url + q, { headers: { "X-Requested-With": "XMLHttpRequest" } })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (data) {
      if (!data) return;
      _quotaState = data;
      _renderQuotaFormWarning();
      checkSubmitReady();
    })
    .catch(function () {
      /* diamkan — validasi definitif tetap ada di backend */
    });
}

/** Tampilkan/sembunyikan banner peringatan kuota habis di dalam form modal */
function _renderQuotaFormWarning() {
  var warnEl = document.getElementById("swapQuotaFormWarning");
  if (!warnEl) return;
  var exceeded = _quotaState && !_quotaState.is_unlimited && _quotaState.exceeded;
  warnEl.style.display = exceeded ? "flex" : "none";
  if (exceeded) {
    warnEl.querySelector("#swapQuotaFormWarningText").textContent =
      "Kuota tukar shift bulan ini sudah habis (" +
      _quotaState.used +
      "/" +
      _quotaState.quota +
      "). Pengajuan tidak dapat dikirim.";
  }
  var submitBtn = document.getElementById("submitSwapBtn");
  if (submitBtn) submitBtn.disabled = submitBtn.disabled || exceeded;
}

function closeRequestModal() {
  document.getElementById("requestModalOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

function closeRequestModalOnBg(e) {
  if (e.target === document.getElementById("requestModalOverlay"))
    closeRequestModal();
}

function resetRequestModal() {
  _selectedEmp = null;
  _lastQuery = "";
  _lastSearchQ = "";
  _lastSearchDate = "";
  _myShiftForDate = null;

  var form = document.getElementById("swapReqForm");
  if (form) form.reset();

  /* Reset tanggal selesai dan kalkulasi */
  var endInput = document.getElementById("inputSwapEnd");
  if (endInput) {
    endInput.value = "";
    endInput.removeAttribute("min");
    endInput.removeAttribute("max");
  }
  var calcEl = document.getElementById("durCalc");
  if (calcEl) calcEl.style.display = "none";
  var hiddenDur = document.getElementById("inputDurationDays");
  if (hiddenDur) hiddenDur.value = "1";

  var chip = document.getElementById("selectedEmpChip");
  if (chip) chip.style.display = "none";

  clearSearchResults();

  var preview = document.getElementById("swapPreview");
  if (preview) preview.style.display = "none";

  var submitBtn = document.getElementById("submitSwapBtn");
  if (submitBtn) submitBtn.disabled = true;

  clearFieldError("inputSwapDate-wrapper");
  clearFieldError("inputSwapEnd-wrapper");
  clearFieldError("searchEmpWrapper");

  // Reset status kuota ke default hasil render halaman, lalu re-render banner
  _quotaState = window.__SWAP_QUOTA_STATUS__ || _quotaState;
  _renderQuotaFormWarning();
}

/* ========================================================================
   3. DURASI — kalkulasi otomatis dari tanggal mulai & selesai
   ======================================================================== */

/** Hitung jumlah hari kerja (Sen–Sab) antara dua Date, inklusif kedua ujung.
 * Sesuai DEFAULT_WORK_DAYS backend (app/services/common.py): perusahaan
 * kerja Senin–Sabtu, hanya Minggu yang libur mingguan.
 * CATATAN: ini memakai default perusahaan, bukan WorkSchedule per-user —
 * departemen/karyawan dengan hari kerja custom (mis. shift khusus 5 hari)
 * tidak tercermin di sini karena data itu tidak tersedia di client tanpa
 * endpoint API tambahan. Nilai final tetap divalidasi ulang di backend. */
function _countWorkDays(startDate, endDate) {
  var count = 0;
  var d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  var end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (d <= end) {
    var dow = d.getDay(); // 0 = Minggu
    if (dow !== 0) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/** Format Date → "Senin, 3 Jun 2025" */
var _DAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
var _MONTHS_ID = [
  "",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
function _fmtShort(d) {
  return (
    _DAYS_ID[d.getDay()] +
    ", " +
    d.getDate() +
    " " +
    _MONTHS_ID[d.getMonth() + 1] +
    " " +
    d.getFullYear()
  );
}

function onSwapEndChange() {
  _recalcDuration();
  checkSubmitReady();
}

function _recalcDuration() {
  var startVal = document.getElementById("inputSwapDate").value;
  var endVal = document.getElementById("inputSwapEnd").value;
  var calcEl = document.getElementById("durCalc");
  var calcText = document.getElementById("durCalcText");
  var hiddenDur = document.getElementById("inputDurationDays");

  if (!startVal || !endVal) {
    if (calcEl) calcEl.style.display = "none";
    return;
  }

  var start = new Date(startVal + "T00:00:00");
  var end = new Date(endVal + "T00:00:00");

  /* Validasi: end >= start */
  if (end < start) {
    document.getElementById("inputSwapEnd").classList.add("is-error");
    if (calcEl) calcEl.style.display = "none";
    if (hiddenDur) hiddenDur.value = "1";
    return;
  }
  document.getElementById("inputSwapEnd").classList.remove("is-error");

  /* Hitung hari kalender & hari kerja */
  var calDays = Math.round((end - start) / 86400000) + 1; // inklusif
  var workDays = _countWorkDays(start, end);

  /* Update hidden input (backend pakai ini) */
  if (hiddenDur) hiddenDur.value = String(workDays > 0 ? workDays : 1);

  /* Update teks kalkulasi */
  if (calcEl && calcText) {
    var parts = [];
    parts.push(calDays + (calDays === 1 ? " hari" : " hari"));
    if (workDays !== calDays) {
      parts.push(workDays + " hari kerja");
    }

    /* "Kembali normal" adalah hari SETELAH tanggal selesai tukar — tanggal
       selesai itu sendiri masih memakai jadwal hasil tukar. Bug lama
       memakai endVal langsung, sehingga teks bilang jadwal "kembali normal"
       pada hari yang justru masih ditukar (mis. tukar s/d Sabtu 10 Okt
       tertulis "kembali normal pada Sabtu, 10 Okt" — seharusnya Minggu,
       11 Okt, hari berikutnya). */
    var revertDate = new Date(endVal + "T00:00:00");
    revertDate.setDate(revertDate.getDate() + 1);
    var revertNote =
      "Jadwal kembali ke rotasi normal pada " + _fmtShort(revertDate);

    calcText.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">' +
      '<rect x="3" y="4" width="18" height="18" rx="2"/>' +
      '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>' +
      '<line x1="3" y1="10" x2="21" y2="10"/></svg>' +
      "<strong>" +
      parts.join(" · ") +
      "</strong>" +
      '<span style="font-weight:400;color:var(--text-muted);margin-left:.2rem;">· ' +
      revertNote +
      "</span>";

    calcEl.style.display = "";
  }
}

/* ========================================================================
   4. RESPOND MODAL (Terima / Tolak)
   ======================================================================== */
function openRespond(
  id,
  action,
  requesterName,
  reqShift,
  swapDate,
  tgtShift,
  swapEndDate,
  durationDays,
) {
  var isAccept = action === "accept";
  document.getElementById("respondModalTitle").textContent = isAccept
    ? "Terima Tukar Shift"
    : "Tolak Tukar Shift";
  document.getElementById("respondAction").value = action;
  document.getElementById("respondForm").action =
    "/employee/shift-swap/" + id + "/respond";

  var startStr = formatDateID(swapDate);
  var endStr =
    swapEndDate && swapEndDate !== swapDate ? formatDateID(swapEndDate) : "";
  var rangeStr = endStr ? startStr + " – " + endStr : startStr;
  var workDayStr = durationDays > 1 ? " (" + durationDays + " hari kerja)" : "";

  document.getElementById("respondModalBody").innerHTML = isAccept
    ? "Kamu setuju bertugas shift <strong>" +
      escapeHtml(reqShift || "?") +
      "</strong> pada <strong>" +
      rangeStr +
      "</strong>" +
      workDayStr +
      ". " +
      escapeHtml(requesterName) +
      " akan menjalani shift kamu di periode yang sama." +
      (durationDays > 1
        ? "<br><span style='font-size:.78rem;color:var(--success);display:inline-flex;align-items:center;gap:.3rem;margin-top:.35rem;'>" +
          "↩ Jadwal kembali ke rotasi normal setelah periode selesai.</span>"
        : "")
    : "Kamu akan menolak pengajuan tukar shift dari <strong>" +
      escapeHtml(requesterName) +
      "</strong>.";

  var btn = document.getElementById("respondSubmitBtn");
  btn.textContent = isAccept ? "✓ Terima" : "Tolak";
  // swap class untuk warna yang konsisten dengan CSS
  btn.classList.remove("swap-btn--confirm-accept", "swap-btn--confirm-reject");
  btn.classList.add(
    isAccept ? "swap-btn--confirm-accept" : "swap-btn--confirm-reject",
  );
  btn.style.background = "";

  document.getElementById("respondModalOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeRespondModal() {
  document.getElementById("respondModalOverlay").classList.remove("open");
  document.body.style.overflow = "";
}

function closeRespondModalOnBg(e) {
  if (e.target === document.getElementById("respondModalOverlay"))
    closeRespondModal();
}

/* ========================================================================
   5. CANDIDATE SEARCH — real-time dengan debounce
   ======================================================================== */
var _searchTimer = null;
var _selectedEmp = null;
var _lastQuery = "";
var _lastSearchQ = "";
var _lastSearchDate = "";
/* Shift SAYA pada tanggal yang sedang dipilih di form (bukan shift hari
   ini) — di-update tiap kali response /candidates diterima, dipakai oleh
   updatePreview() supaya preview "Kamu" tanggal-aware, bukan statis. */
var _myShiftForDate = null;

function onSwapDateChange() {
  var q = document.getElementById("searchEmp").value.trim();
  clearFieldError("inputSwapDate-wrapper");
  if (q.length >= 1) searchCandidates(q);

  var swapDateVal = document.getElementById("inputSwapDate").value;
  _refreshQuotaForDate(swapDateVal);
}

function searchCandidates(q) {
  var trimmed = q.trim();
  if (!trimmed) {
    clearSearchResults();
    return;
  }

  var swapDate = document.getElementById("inputSwapDate").value;
  if (!swapDate) {
    var wrap = document.getElementById("searchResults");
    wrap.innerHTML =
      '<div class="swap-search-empty" style="color:var(--brand,#4f6ef7);">' +
      "Pilih tanggal terlebih dahulu.</div>";
    wrap.style.display = "";
    _lastQuery = "";
    return;
  }

  var cacheKey = trimmed + "__" + swapDate;
  if (cacheKey === _lastQuery) return;

  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(function () {
    _doSearch(trimmed, swapDate, cacheKey);
  }, 300);
}

function _doSearch(q, swapDate, cacheKey) {
  _lastQuery = cacheKey;
  _lastSearchQ = q;
  _lastSearchDate = swapDate;

  var wrap = document.getElementById("searchResults");
  wrap.innerHTML = '<div class="swap-search-loading">Mencari…</div>';
  wrap.style.display = "";

  fetch(
    "/employee/shift-swap/candidates?q=" +
      encodeURIComponent(q) +
      "&swap_date=" +
      swapDate,
    { headers: { "X-Requested-With": "XMLHttpRequest" } },
  )
    .then(function (res) {
      if (res.status === 401 || res.redirected) {
        wrap.innerHTML =
          '<div class="swap-search-empty">' +
          'Sesi habis. <a href="/auth/login" style="color:var(--brand);font-weight:600;">Login ulang</a>.</div>';
        wrap.style.display = "";
        _lastQuery = "";
        return null;
      }
      if (!res.ok) {
        return res.text().then(function (body) {
          throw new Error(
            "HTTP " + res.status + " — " + body.substring(0, 120),
          );
        });
      }
      var ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        return res.text().then(function (body) {
          throw new Error("Bukan JSON — " + body.substring(0, 120));
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (data !== null && data !== undefined) renderCandidates(data);
    })
    .catch(function (err) {
      wrap.innerHTML =
        '<div class="swap-search-empty">Tidak dapat memuat daftar rekan.' +
        '<div style="font-size:.65rem;color:var(--danger,#ef4444);margin-top:.3rem;word-break:break-all;">' +
        escapeHtml(err.message) +
        "</div>" +
        '<button onclick="retrySearch()" style="display:block;margin:.5rem auto 0;' +
        "background:var(--brand);color:#fff;border:none;border-radius:6px;" +
        'padding:.35rem .8rem;font-size:.75rem;cursor:pointer;font-weight:600;">Coba lagi</button></div>';
      wrap.style.display = "";
      _lastQuery = "";
      console.error("[shift_swap] search error:", err);
    });
}

function retrySearch() {
  if (_lastSearchQ)
    _doSearch(
      _lastSearchQ,
      _lastSearchDate,
      _lastSearchQ + "__" + _lastSearchDate,
    );
}

function renderCandidates(data) {
  var wrap = document.getElementById("searchResults");

  /* Response sekarang berbentuk { my_shift, candidates }. Simpan my_shift
     global supaya updatePreview() bisa pakai versi tanggal-aware, bukan
     dataset statis dari saat halaman dimuat. */
  _myShiftForDate =
    data && data.my_shift ? data.my_shift : null;

  var items = data && Array.isArray(data.candidates) ? data.candidates : [];

  /* Jika sudah ada karyawan terpilih, refresh preview-nya sesuai my_shift
     terbaru — meng-cover kasus user ganti tanggal SETELAH memilih rekan. */
  if (_selectedEmp) updatePreview(_selectedEmp);

  if (!items.length) {
    wrap.innerHTML =
      '<div class="swap-search-empty">Tidak ada rekan yang cocok di departemenmu.</div>';
    wrap.style.display = "";
    return;
  }
  wrap.innerHTML = items
    .map(function (emp) {
      var isSelected =
        _selectedEmp && _selectedEmp.id === emp.id ? " selected" : "";
      var isIncompat = emp.is_compatible === false;
      var empJson = JSON.stringify(emp).replace(/"/g, "&quot;");

      var shiftChip =
        '<span class="shift-chip shift-chip--' +
        emp.shift_type +
        '" style="font-size:10px;padding:1px 7px;">' +
        escapeHtml(emp.shift_name) +
        "</span>";

      var sub =
        escapeHtml(emp.department || "—") + " &nbsp;·&nbsp; " + shiftChip;
      if (emp.shift_time) {
        sub +=
          '<span style="color:var(--text-faint);font-size:.68rem;margin-left:3px;">' +
          escapeHtml(emp.shift_time) +
          "</span>";
      }

      var incompatNote = "";
      if (isIncompat && emp.reject_reason) {
        incompatNote =
          '<div class="swap-search-item-incompat">' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ' +
          escapeHtml(emp.reject_reason) +
          "</div>";
      }

      var clickAttr = isIncompat
        ? " onclick=\"selectEmpBlocked('" +
          escapeHtml(emp.reject_reason) +
          "')\""
        : ' onclick="selectEmp(' + empJson + ')"';

      return (
        '<div class="swap-search-item' +
        isSelected +
        (isIncompat ? " swap-search-item--incompat" : "") +
        '" role="option"' +
        clickAttr +
        ">" +
        '<div class="swap-search-item-info">' +
        '<div class="swap-search-item-name">' +
        escapeHtml(emp.full_name) +
        "</div>" +
        '<div class="swap-search-item-sub">' +
        sub +
        "</div>" +
        incompatNote +
        "</div></div>"
      );
    })
    .join("");
  wrap.style.display = "";
}

function selectEmpBlocked(reason) {
  showFieldError(
    "searchEmpWrapper",
    reason || "Karyawan ini tidak dapat diajak tukar shift.",
  );
}

function clearSearchResults() {
  var wrap = document.getElementById("searchResults");
  if (wrap) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
  }
  _lastQuery = "";
}

/* ========================================================================
   6. PILIH / HAPUS KARYAWAN
   ======================================================================== */
function selectEmp(emp) {
  if (emp.is_compatible === false) {
    selectEmpBlocked(emp.reject_reason);
    return;
  }
  _selectedEmp = emp;
  document.getElementById("inputTargetId").value = emp.id;
  document.getElementById("searchEmp").value = "";
  clearSearchResults();

  document.getElementById("selectedEmpName").textContent = emp.full_name;
  document.getElementById("selectedEmpChip").style.display = "";

  clearFieldError("searchEmpWrapper");
  updatePreview(emp);
  checkSubmitReady();
}

function clearSelectedEmp() {
  _selectedEmp = null;
  document.getElementById("inputTargetId").value = "";
  document.getElementById("selectedEmpChip").style.display = "none";
  var preview = document.getElementById("swapPreview");
  if (preview) preview.style.display = "none";
  checkSubmitReady();
}

/* ========================================================================
   7. PREVIEW PERTUKARAN
   ======================================================================== */
function updatePreview(emp) {
  document.getElementById("previewMyName").textContent = "Kamu";
  document.getElementById("previewTargetName").textContent = emp.full_name;

  var targetChip =
    '<span class="shift-chip shift-chip--' +
    emp.shift_type +
    '" style="font-size:10px;padding:1px 7px;">' +
    escapeHtml(emp.shift_name) +
    "</span>";
  document.getElementById("previewTargetShift").innerHTML = targetChip;
  document.getElementById("previewTargetShiftOrig").innerHTML = targetChip;

  var preview = document.getElementById("swapPreview");
  /* Prioritas: shift tanggal-aware dari API /candidates (_myShiftForDate).
     Fallback ke dataset statis (shift HARI INI, di-render saat page load)
     hanya jika API belum sempat merespons — mis. race condition awal. */
  var myType = "";
  var myName = "?";
  if (_myShiftForDate) {
    myType = _myShiftForDate.shift_type || "";
    myName = _myShiftForDate.shift_name || "?";
  } else {
    myType = preview.dataset.myShiftType || "";
    myName = preview.dataset.myShiftName || "?";
  }
  var myChip =
    '<span class="shift-chip shift-chip--' +
    myType +
    '" style="font-size:10px;padding:1px 7px;">' +
    escapeHtml(myName) +
    "</span>";
  document.getElementById("previewMyShift").innerHTML = myChip;
  document.getElementById("previewMyShiftTarget").innerHTML = myChip;

  preview.style.display = "";
}

/* ========================================================================
   8. VALIDASI & SUBMIT READINESS
   ======================================================================== */
function checkSubmitReady() {
  var hasStart = !!document.getElementById("inputSwapDate").value;
  var hasEnd = !!document.getElementById("inputSwapEnd").value;
  var hasEmp = !!_selectedEmp;
  var quotaExceeded =
    _quotaState && !_quotaState.is_unlimited && _quotaState.exceeded;
  document.getElementById("submitSwapBtn").disabled = !(
    hasStart &&
    hasEnd &&
    hasEmp &&
    !quotaExceeded
  );
}

function validateSwapForm(e) {
  var valid = true;

  var startInput = document.getElementById("inputSwapDate");
  if (!startInput.value) {
    showFieldError("inputSwapDate-wrapper", "Tanggal mulai wajib diisi.");
    valid = false;
  } else {
    clearFieldError("inputSwapDate-wrapper");
  }

  var endInput = document.getElementById("inputSwapEnd");
  if (!endInput.value) {
    showFieldError("inputSwapEnd-wrapper", "Tanggal selesai wajib diisi.");
    valid = false;
  } else if (new Date(endInput.value) < new Date(startInput.value)) {
    showFieldError(
      "inputSwapEnd-wrapper",
      "Tanggal selesai harus sama atau setelah tanggal mulai.",
    );
    valid = false;
  } else {
    clearFieldError("inputSwapEnd-wrapper");
  }

  if (!_selectedEmp) {
    showFieldError(
      "searchEmpWrapper",
      "Pilih rekan yang ingin diajak tukar shift.",
    );
    valid = false;
  } else {
    clearFieldError("searchEmpWrapper");
  }

  // Lapisan terakhir di sisi client: blokir submit jika kuota bulan ini
  // (dari perspektif tanggal swap yang dipilih) sudah habis. Backend tetap
  // menjadi validasi definitif untuk mencegah bypass.
  if (_quotaState && !_quotaState.is_unlimited && _quotaState.exceeded) {
    alert(
      "Kuota tukar shift kamu bulan ini sudah habis (" +
        _quotaState.used +
        "/" +
        _quotaState.quota +
        "). Pengajuan tidak dapat dikirim.",
    );
    valid = false;
  }

  if (!valid) e.preventDefault();
}

function showFieldError(wrapperId, msg) {
  var wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  var input = wrap.querySelector(".form-input");
  if (input) input.classList.add("is-error");
  var errEl = wrap.querySelector(".form-error-msg");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.className = "form-error-msg";
    wrap.appendChild(errEl);
  }
  errEl.textContent = msg;
  errEl.classList.add("visible");
}

function clearFieldError(wrapperId) {
  var wrap = document.getElementById(wrapperId);
  if (!wrap) return;
  var input = wrap.querySelector(".form-input");
  if (input) input.classList.remove("is-error");
  var errEl = wrap.querySelector(".form-error-msg");
  if (errEl) errEl.classList.remove("visible");
}

/* ========================================================================
   9. UTILITAS
   ======================================================================== */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateID(iso) {
  if (!iso) return "-";
  var MONTHS = [
    "",
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  var parts = iso.split("-");
  return (
    parseInt(parts[2], 10) +
    " " +
    MONTHS[parseInt(parts[1], 10)] +
    " " +
    parseInt(parts[0], 10)
  );
}

/* ========================================================================
   10. EVENT LISTENERS
   ======================================================================== */

/**
 * Sinkronkan min/max tanggal selesai berdasarkan tanggal mulai yang dipilih.
 * Dipanggil dari:
 *   - event 'change' pada inputSwapDate
 *   - resetRequestModal() saat modal dibuka (defensif, jaga-jaga browser
 *     tidak fire 'change' pada autofill/restore nilai form)
 * PENTING: HTML tidak boleh hardcode max="{{ today }}" pada inputSwapEnd —
 * itu akan mengunci tanggal selesai ke hari ini SAJA dan memblokir swap
 * untuk tanggal masa depan (mis. ajukan hari Sabtu utk swap hari Senin).
 * min/max HARUS selalu dihitung ulang dari nilai inputSwapDate saat ini.
 */
function _syncEndDateBounds() {
  var startInput = document.getElementById("inputSwapDate");
  var endInput = document.getElementById("inputSwapEnd");
  if (!startInput || !endInput || !startInput.value) return;

  var start = new Date(startInput.value + "T00:00:00");
  var maxEnd = new Date(start);
  maxEnd.setDate(start.getDate() + 6); /* +6 hari = 7 hari total */
  endInput.min = startInput.value;
  endInput.max = maxEnd.toISOString().slice(0, 10);

  /* Jika end sudah diisi tapi di luar range baru, reset ke tanggal mulai */
  if (
    endInput.value &&
    (endInput.value < startInput.value || endInput.value > endInput.max)
  ) {
    endInput.value = startInput.value; /* default: 1 hari */
  }
}

document.addEventListener("DOMContentLoaded", function () {
  /* Tanggal mulai: update min/max untuk tanggal selesai */
  var startInput = document.getElementById("inputSwapDate");
  if (startInput) {
    startInput.addEventListener("change", function () {
      clearFieldError("inputSwapDate-wrapper");
      checkSubmitReady();
      onSwapDateChange();
      _syncEndDateBounds();
      _recalcDuration();
      checkSubmitReady();
    });
  }

  /* Tanggal selesai */
  var endInput = document.getElementById("inputSwapEnd");
  if (endInput) {
    endInput.addEventListener("change", function () {
      clearFieldError("inputSwapEnd-wrapper");
      _recalcDuration();
      checkSubmitReady();
    });
  }

  /* Form submit */
  var form = document.getElementById("swapReqForm");
  if (form) form.addEventListener("submit", validateSwapForm);

  /* Tutup dropdown saat klik di luar */
  document.addEventListener("click", function (e) {
    var searchGroup = document.getElementById("searchEmpWrapper");
    if (searchGroup && !searchGroup.contains(e.target)) clearSearchResults();
  });

  /* ESC menutup modal */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeRequestModal();
      closeRespondModal();
    }
  });
});