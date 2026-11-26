/**
 * corrections.js — Bug fixes + Restore Feature + UX Improvements
 * ─────────────────────────────────────────────────────────────────────────────
 * BUG FIXES:
 *
 * [FIX-1] Tab Duplikat — panel.style.display diset ke "block" (bukan "")
 *         Panel CSS default = display:none, clear inline style = kembali ke none
 *
 * [FIX-2] Detail modal — _serialize_log backend mengembalikan "effective_date"
 *         bukan "eff_date". renderDupLogCard sekarang pakai lg.effective_date
 *         untuk group-key agar tombol "Pertahankan" bisa menemukan grupnya.
 *         Juga data-group-key di card duplikat kini menggunakan effective_date.
 *
 * [FIX-3] Koreksi Baru modal — pastikan openModal benar-benar set display flex
 *         menggunakan style langsung bukan hanya class. Juga hapus konflik
 *         inline style double di corrDupWarning (ada display:none 2x di HTML).
 *
 * [FIX-4] openLogDetail() global function dipastikan selalu bisa dipanggil
 *         meskipun IIFE belum expose window.CorrDup. Fallback ke direct fetch.
 *
 * FITUR BARU:
 *
 * [FEAT-1] Tombol Restore Log di detail modal — tampil jika source=deleted,
 *          memanggil /corrections/log/<id>/restore (POST)
 *
 * [FEAT-2] Date range filter di panel Riwayat — filter langsung ke server
 *          melalui /corrections/history API dengan pagination server-side
 *
 * [FEAT-3] Konfirmasi sebelum close modal jika ada perubahan belum disimpan
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  "use strict";

  // ── Konstanta URL ──────────────────────────────────────────────────────────
  const URL_DUPLICATES = "/manager/corrections/duplicates";
  const URL_MERGE = "/manager/corrections/duplicates/merge";
  const URL_BULK_DELETE = "/manager/corrections/bulk-delete";
  const URL_LOG_DELETE = (id) => `/manager/corrections/log/${id}`;
  const URL_LOG_DETAIL = (id) => `/manager/corrections/log/${id}`;
  const URL_LOG_RESTORE = (id) => `/manager/corrections/log/${id}/restore`;
  const URL_ATT_LOOKUP = "/manager/attendance-log";
  const URL_CORR_SAVE = "/manager/corrections";
  const URL_LOG_CREATE = "/manager/corrections/create-log";
  const URL_HISTORY = "/manager/corrections/history";
  const URL_MISSING_DATES = "/manager/corrections/missing-dates"; // [BUG-6 FIX]
  const URL_MIDNIGHT_SCAN = "/manager/corrections/midnight-window";
  const URL_MIDNIGHT_APPLY = "/manager/corrections/midnight-window/apply";
  const URL_FALSE_ABSENTS = "/manager/corrections/false-absents";
  const URL_FALSE_ABSENTS_DELETE = "/manager/corrections/false-absents/delete";
  // NEW (overtime)
  const URL_OVERTIME_CREATE = "/manager/overtime/create-log";
  const URL_OVERTIME_SHIFTS = "/manager/overtime/shifts";
  const URL_OVERTIME_LOOKUP = "/manager/overtime/lookup";
  const URL_OVERTIME_UPDATE = (id) => `/manager/overtime/${id}`;

  // ── CSRF Token — baca dari meta tag yang di-render Flask-WTF ──────────────
  function getCsrf() {
    return document.querySelector('meta[name="csrf-token"]')?.content || "";
  }

  // Helper fetch dengan CSRF otomatis untuk semua request mutating
  function fetchJson(url, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };
    if (method !== "GET" && method !== "HEAD") {
      headers["X-CSRFToken"] = getCsrf();
    }
    return fetch(url, { ...options, headers });
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let dupGroups = [];
  let bulkSelectedIds = new Set();
  let pendingDeleteCb = null;
  let currentMergeGroup = null;

  // State untuk modal koreksi
  let corrState = {
    empId: "",
    empName: "",
    logId: "",
    shiftInfo: null,
    logData: null,
    sourcePanel: "history", // panel yang memicu modal: "history" | "missing"
  };

  // [FRONTEND-OVERTIME-MODAL] state untuk modal Lembur (Cari → Edit, atau
  // + Catat Baru — mirip corrState tapi punya field tambahan `results`
  // untuk kasus >1 baris lembur di tanggal yang sama, dan `mode` untuk
  // membedakan create vs edit saat submit.
  let otState = {
    empId: "",
    empName: "",
    workDate: "",
    mode: "search", // "search" | "create" | "edit"
    logId: "",
    shiftInfo: null,
    results: [],
  };

  // ── Helper ─────────────────────────────────────────────────────────────────
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function showEl(el) {
    if (el) el.style.display = "";
  }
  function hideEl(el) {
    if (el) el.style.display = "none";
  }

  function toast(msg, type = "success") {
    if (window.showToast) {
      window.showToast(msg, type);
      return;
    }
    const div = document.createElement("div");
    div.textContent = msg;
    Object.assign(div.style, {
      position: "fixed",
      bottom: "1.5rem",
      right: "1.5rem",
      zIndex: 9999,
      padding: ".75rem 1.25rem",
      borderRadius: "8px",
      fontSize: ".875rem",
      background:
        type === "success"
          ? "#16a34a"
          : type === "error"
            ? "#dc2626"
            : "#d97706",
      color: "#fff",
      boxShadow: "0 4px 12px rgba(0,0,0,.2)",
      maxWidth: "360px",
      transition: "opacity .3s",
    });
    document.body.appendChild(div);
    setTimeout(() => {
      div.style.opacity = "0";
      setTimeout(() => div.remove(), 350);
    }, 3000);
  }

  function formatDate(d) {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "Mei",
      "Jun",
      "Jul",
      "Agt",
      "Sep",
      "Okt",
      "Nov",
      "Des",
    ];
    return `${parseInt(day)} ${months[parseInt(m) - 1]} ${y}`;
  }

  function calcAutoStatus(checkIn, workStart, lateTolerance, openBefore) {
    if (!checkIn || !workStart) return null;
    const [ih, im] = checkIn.split(":").map(Number);
    const [wh, wm] = workStart.split(":").map(Number);
    const ob = openBefore === undefined || openBefore === null ? 120 : openBefore;
    // Selisih check-in terhadap work_start dalam menit, dinormalisasi ke
    // rentang [-openBefore, 1440-openBefore) supaya shift lintas tengah
    // malam benar: work_start 23:45, check-in 00:15 -> +30 (terlambat),
    // bukan 15 - 1425 = -1410 (dianggap "hadir").
    let diff = ih * 60 + im - (wh * 60 + wm);
    while (diff < -ob) diff += 1440;
    while (diff >= 1440 - ob) diff -= 1440;
    return diff <= (lateTolerance || 0) ? "present" : "late";
  }

  const STATUS_LABEL = {
    present: "Hadir",
    late: "Terlambat",
    absent: "Tidak Hadir",
    sick: "Sakit",
    day_off: "Libur",
    extra_off: "Izin",
    remote: "Remote",
    deleted: "[Dihapus]",
  };
  const SOURCE_LABEL = {
    gps: "GPS",
    correction: "Koreksi",
    system: "Sistem",
    deleted: "Dihapus",
    unknown: "?",
  };
  const SOURCE_CLASS = {
    gps: "src-gps",
    correction: "src-correction",
    system: "src-system",
    deleted: "src-deleted",
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TAB SWITCHING — [FIX-1] set display "block" bukan ""
  // ═══════════════════════════════════════════════════════════════════════════
  function initTabs() {
    const tabs = $$(".corr-tab");
    const panels = {
      history: $("#panelHistory"),
      duplicates: $("#panelDuplicates"),
      missing: $("#panelMissing"), // [BUG-6 FIX]
      midnight: $("#panelMidnight"),
      false_absent: $("#panelFalseAbsent"),
      overtime: $("#panelOvertime"), // NEW (overtime)
    };
    let dupFetched = false;

    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.tab;
        Object.entries(panels).forEach(([k, p]) => {
          if (!p) return;
          // [FIX-1] Harus set "block" secara eksplisit, bukan "" (clear)
          // karena CSS default panel adalah display:none dan "" akan kembali ke CSS rule
          p.style.display = k === target ? "block" : "none";
        });
        if (target === "duplicates" && !dupFetched) {
          dupFetched = true;
          fetchDuplicates();
        }
      });
    });
  }

  function switchToTab(name) {
    const tab = $(`.corr-tab[data-tab="${name}"]`);
    if (tab) tab.click();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. EMPLOYEE AUTOCOMPLETE
  // ═══════════════════════════════════════════════════════════════════════════
  function initEmployeeAutocomplete() {
    const input = $("#corrEmpSearch");
    const dropdown = $("#corrEmpDropdown");
    const clearBtn = $("#corrEmpClear");
    const hiddenId = $("#corrEmployee");

    if (!input) return;

    const sourceSelect = $("#corrEmployeeSource");
    const employees = sourceSelect
      ? [...sourceSelect.options]
          .filter((o) => o.value)
          .map((o) => ({ id: o.value, name: o.text }))
      : [];

    function renderDropdown(list) {
      if (!list.length) {
        hideEl(dropdown);
        return;
      }
      dropdown.innerHTML = list
        .map(
          (e) =>
            `<div class="emp-option" data-id="${e.id}" data-name="${e.name}">
              <div class="mgr-avatar" style="width:22px;height:22px;font-size:.6rem;flex-shrink:0">${e.name.slice(0, 2).toUpperCase()}</div>
              <span>${e.name}</span>
            </div>`,
        )
        .join("");
      showEl(dropdown);
    }

    input.addEventListener("input", () => {
      const q = input.value.toLowerCase().trim();
      if (!q) {
        hideEl(dropdown);
        hiddenId.value = "";
        return;
      }
      renderDropdown(
        employees.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8),
      );
    });

    document.addEventListener("click", (e) => {
      const opt = e.target.closest(".emp-option");
      if (opt) {
        hiddenId.value = opt.dataset.id;
        input.value = opt.dataset.name;
        corrState.empId = opt.dataset.id;
        corrState.empName = opt.dataset.name;
        hideEl(dropdown);
        showEl(clearBtn);
        const dateVal = $("#corrDate")?.value;
        // [REVERT-OVERTIME-SCOPE] Auto-lookup hanya butuh tanggal — shift
        // tidak lagi dipilih manual di modal ini (diresolve otomatis
        // backend via get_user_shift()).
        if (dateVal) doLookup();
        return;
      }
      if (!input.contains(e.target) && !dropdown?.contains(e.target))
        hideEl(dropdown);
    });

    clearBtn?.addEventListener("click", () => {
      input.value = "";
      hiddenId.value = "";
      corrState.empId = "";
      corrState.empName = "";
      corrState.logId = "";
      corrState.logData = null;
      hideEl(clearBtn);
      hideEl(dropdown);
      resetCorrForm();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2b. MODAL LEMBUR — [FRONTEND-OVERTIME-MODAL]
  // Cari (user_id+date) → 0 hasil: "+ Catat Baru" (create) | 1 hasil: form
  // edit langsung | >1 hasil: daftar pilihan dulu. Autocomplete karyawan
  // mengikuti pola initEmployeeAutocomplete() di atas, dengan elemen #ot*.
  // ═══════════════════════════════════════════════════════════════════════════
  function initOvertimeEmployeeAutocomplete() {
    const input = $("#otEmpSearch");
    const dropdown = $("#otEmpDropdown");
    const clearBtn = $("#otEmpClear");
    const hiddenId = $("#otEmployee");

    if (!input) return;

    const sourceSelect = $("#otEmployeeSource");
    const employees = sourceSelect
      ? [...sourceSelect.options]
          .filter((o) => o.value)
          .map((o) => ({ id: o.value, name: o.text }))
      : [];

    function renderDropdown(list) {
      if (!list.length) {
        hideEl(dropdown);
        return;
      }
      dropdown.innerHTML = list
        .map(
          (e) =>
            `<div class="emp-option" data-id="${e.id}" data-name="${e.name}">
              <div class="mgr-avatar" style="width:22px;height:22px;font-size:.6rem;flex-shrink:0">${e.name.slice(0, 2).toUpperCase()}</div>
              <span>${e.name}</span>
            </div>`,
        )
        .join("");
      showEl(dropdown);
    }

    input.addEventListener("input", () => {
      const q = input.value.toLowerCase().trim();
      if (!q) {
        hideEl(dropdown);
        hiddenId.value = "";
        otState.empId = "";
        return;
      }
      renderDropdown(
        employees.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 8),
      );
    });

    document.addEventListener("click", (e) => {
      const opt = e.target.closest(".emp-option");
      // Guard: hanya proses klik dropdown milik modal ini, bukan modal koreksi
      if (opt && dropdown?.contains(opt)) {
        hiddenId.value = opt.dataset.id;
        input.value = opt.dataset.name;
        otState.empId = opt.dataset.id;
        otState.empName = opt.dataset.name;
        hideEl(dropdown);
        showEl(clearBtn);
        return;
      }
      if (!input.contains(e.target) && !dropdown?.contains(e.target))
        hideEl(dropdown);
    });

    clearBtn?.addEventListener("click", () => {
      input.value = "";
      hiddenId.value = "";
      otState.empId = "";
      otState.empName = "";
      hideEl(clearBtn);
      hideEl(dropdown);
    });
  }

  // Populate dropdown #otShift dari /manager/overtime/shifts, DIFILTER ke
  // kantor + departemen `userId` — jawaban keluhan #1 soal shift duplikat
  // per departemen. Dipanggil tiap masuk mode create/edit dengan userId
  // yang relevan (bukan lazy-once), supaya daftar selalu sesuai karyawan
  // yang sedang ditangani.
  async function fetchOvertimeShiftsForModal(userId, selectedShiftId) {
    const sel = $("#otShift");
    if (!sel) return;
    sel.innerHTML = `<option value="">Memuat…</option>`;
    try {
      const url = userId
        ? `${URL_OVERTIME_SHIFTS}?user_id=${encodeURIComponent(userId)}`
        : URL_OVERTIME_SHIFTS;
      const res = await fetch(url);
      const data = await res.json();
      const shifts = data.shifts || [];
      sel.innerHTML =
        `<option value="">— Pilih shift —</option>` +
        shifts
          .map(
            (s) =>
              `<option value="${s.id}" data-shift-type="${s.shift_type}">` +
              `${s.type_label}${s.office_name ? " · " + s.office_name : ""} ` +
              `(${s.time_range})` +
              `</option>`,
          )
          .join("");
      if (selectedShiftId) sel.value = selectedShiftId;
    } catch (e) {
      console.error("Gagal memuat daftar shift lembur:", e);
      sel.innerHTML = `<option value="">Gagal memuat shift — refresh halaman</option>`;
    }
  }

  function resetOvertimeModal() {
    otState = {
      empId: "",
      empName: "",
      workDate: "",
      mode: "search",
      logId: "",
      shiftInfo: null,
      results: [],
    };
    hideEl($("#otWindowWarning"));
    hideEl($("#otError"));
    hideEl($("#otStep1Error"));
    hideEl($("#otResultsList"));
    hideEl($("#otNoResult"));
    hideEl($("#otFormFields"));
    hideEl($("#btnOtCreateNew"));
    hideEl($("#btnOtSubmit"));
    showEl($("#otStep1"));
    showEl($("#btnOtSearch"));
    ["otCheckIn", "otCheckOut", "otReasonNote"].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.value = "";
    });
    const shiftEl = $("#otShift");
    if (shiftEl) shiftEl.innerHTML = `<option value="">— Pilih shift —</option>`;
    const reasonEl = $("#otReason");
    if (reasonEl) reasonEl.value = "extra_shift";
    const statusEl = $("#otStatus");
    if (statusEl) statusEl.value = "present";
    const empInput = $("#otEmpSearch");
    if (empInput) empInput.value = "";
    const empHidden = $("#otEmployee");
    if (empHidden) empHidden.value = "";
    hideEl($("#otEmpClear"));
  }

  function openOvertimeModal() {
    resetOvertimeModal();
    const dateEl = $("#otDate");
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    openModal("modalOvertime");
    setTimeout(() => $("#otEmpSearch")?.focus(), 100);
  }

  // Render daftar pilihan saat >1 hasil lembur di tanggal yang sama.
  function renderOvertimeResultsList(logs) {
    const listEl = $("#otResultsList");
    if (!listEl) return;
    listEl.innerHTML =
      `<div class="form-hint" style="margin-bottom:8px">${logs.length} baris lembur ditemukan — pilih salah satu untuk diedit:</div>` +
      logs
        .map(
          (lg) => `
        <div class="corr-preview-card ot-result-item" data-log-id="${lg.id}" style="cursor:pointer;margin-bottom:8px">
          <div class="corr-preview-cols">
            <div class="corr-preview-col">
              <span class="corr-preview-label">SHIFT</span>
              <span class="corr-preview-val">${lg.shift_label || "—"}</span>
            </div>
            <div class="corr-preview-col">
              <span class="corr-preview-label">JAM</span>
              <span class="corr-preview-val">${lg.check_in || "—"}–${lg.check_out || "—"}</span>
            </div>
            <div class="corr-preview-col">
              <span class="corr-preview-label">KATEGORI</span>
              <span class="corr-preview-val">${lg.overtime_reason_label || "—"}</span>
            </div>
          </div>
        </div>`,
        )
        .join("");
    showEl(listEl);
  }

  function fillOvertimeFormFromLog(lg) {
    otState.logId = lg.id;
    otState.shiftInfo = {
      work_start: null, // lembur tidak divalidasi ketat thd window utk block
      crosses_midnight: !!lg.crosses_midnight,
    };
    const inEl = $("#otCheckIn");
    const outEl = $("#otCheckOut");
    const reasonSel = $("#otReason");
    const statusSel = $("#otStatus");
    if (inEl) inEl.value = lg.check_in || "";
    if (outEl) outEl.value = lg.check_out || "";
    if (reasonSel) reasonSel.value = lg.overtime_reason || "extra_shift";
    if (statusSel) statusSel.value = lg.status || "present";
    hideEl($("#otResultsList"));
    hideEl($("#otNoResult"));
    hideEl($("#otStep1"));
    hideEl($("#btnOtSearch"));
    hideEl($("#btnOtCreateNew"));
    showEl($("#otFormFields"));
    showEl($("#btnOtSubmit"));
    // Shift dropdown: tampilkan daftar shift dept karyawan, pre-fill ke
    // shift baris ini, tapi tidak bisa diubah saat edit (shift bukan
    // bagian dari kontrak overtime_log_update()).
    fetchOvertimeShiftsForModal(otState.empId, lg.shift_id);
    const shiftEl = $("#otShift");
    if (shiftEl) shiftEl.disabled = true;
    const titleEl = $("#otModalTitle");
    if (titleEl) titleEl.textContent = `✏️ Edit Lembur — ${otState.empName}`;
  }

  function showOvertimeCreateForm() {
    otState.mode = "create";
    otState.logId = "";
    otState.shiftInfo = null;
    hideEl($("#otResultsList"));
    hideEl($("#otNoResult"));
    hideEl($("#otStep1"));
    hideEl($("#btnOtSearch"));
    hideEl($("#btnOtCreateNew"));
    showEl($("#otFormFields"));
    showEl($("#btnOtSubmit"));
    const shiftEl = $("#otShift");
    if (shiftEl) shiftEl.disabled = false;
    fetchOvertimeShiftsForModal(otState.empId);
    const titleEl = $("#otModalTitle");
    if (titleEl) titleEl.textContent = `🕒 Catat Lembur Baru — ${otState.empName}`;
  }

  async function doOvertimeLookup() {
    const empId = otState.empId || $("#otEmployee")?.value || "";
    const workDate = $("#otDate")?.value || "";
    const errEl = $("#otStep1Error");

    if (!empId) {
      showEl(errEl);
      errEl.textContent = "Pilih karyawan terlebih dahulu.";
      return;
    }
    if (!workDate) {
      showEl(errEl);
      errEl.textContent = "Pilih tanggal terlebih dahulu.";
      return;
    }
    hideEl(errEl);
    otState.workDate = workDate;

    const btnSearch = $("#btnOtSearch");
    if (btnSearch) {
      btnSearch.disabled = true;
      btnSearch.textContent = "Mencari…";
    }

    try {
      const res = await fetch(
        `${URL_OVERTIME_LOOKUP}?user_id=${encodeURIComponent(empId)}&date=${encodeURIComponent(workDate)}`,
      );
      const data = await res.json();

      if (res.status === 404 && data.no_log) {
        otState.mode = "create";
        otState.results = [];
        hideEl($("#otResultsList"));
        showEl($("#otNoResult"));
        const noResultText = $("#otNoResultText");
        if (noResultText) {
          noResultText.textContent = `📋 Belum ada lembur tercatat untuk ${otState.empName} pada tanggal ini.`;
        }
        showEl($("#btnOtCreateNew"));
        hideEl($("#btnOtSearch"));
        return;
      }

      if (!res.ok) {
        showEl(errEl);
        errEl.textContent = data.message || "Gagal mencari data lembur.";
        return;
      }

      const logs = data.logs || [];
      otState.results = logs;

      if (logs.length === 1) {
        otState.mode = "edit";
        fillOvertimeFormFromLog(logs[0]);
      } else {
        // >1 hasil: tampilkan daftar pilihan, form edit muncul setelah dipilih
        hideEl($("#otNoResult"));
        hideEl($("#otStep1"));
        hideEl($("#btnOtSearch"));
        renderOvertimeResultsList(logs);
      }
    } catch (e) {
      showEl(errEl);
      errEl.textContent = "Gagal menghubungi server.";
      console.error(e);
    } finally {
      if (btnSearch) {
        btnSearch.disabled = false;
        btnSearch.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Cari Lembur`;
      }
    }
  }

  async function doOvertimeModalSubmit() {
    const errEl = $("#otError");
    const warnEl = $("#otWindowWarning");
    const warnText = $("#otWindowWarningText");
    const spinner = $("#otSubmitSpinner");
    const btnSubmit = $("#btnOtSubmit");

    hideEl(errEl);
    hideEl(warnEl);

    const checkIn = $("#otCheckIn")?.value || "";
    const checkOut = $("#otCheckOut")?.value || "";
    const overtimeReason = $("#otReason")?.value || "";
    const status = $("#otStatus")?.value || "present";
    const reasonNote = ($("#otReasonNote")?.value || "").trim();

    if (!checkIn && otState.mode === "create") {
      showEl(errEl);
      errEl.textContent = "Jam check-in wajib diisi.";
      return;
    }
    if (!reasonNote) {
      showEl(errEl);
      errEl.textContent = "Catatan/alasan lembur wajib diisi.";
      return;
    }

    showEl(spinner);
    if (btnSubmit) btnSubmit.disabled = true;

    try {
      let res, data;

      if (otState.mode === "edit" && otState.logId) {
        res = await fetchJson(URL_OVERTIME_UPDATE(otState.logId), {
          method: "POST",
          body: JSON.stringify({
            new_check_in: checkIn || undefined,
            new_check_out: checkOut || undefined,
            new_status: status,
            overtime_reason: overtimeReason,
            reason: reasonNote,
          }),
        });
      } else {
        const shiftId = $("#otShift")?.value || "";
        if (!shiftId) {
          hideEl(spinner);
          if (btnSubmit) btnSubmit.disabled = false;
          showEl(errEl);
          errEl.textContent = "Pilih shift terlebih dahulu.";
          return;
        }
        res = await fetchJson(URL_OVERTIME_CREATE, {
          method: "POST",
          body: JSON.stringify({
            user_id: otState.empId,
            work_date: otState.workDate,
            shift_id: shiftId,
            check_in: checkIn,
            check_out: checkOut || undefined,
            overtime_reason: overtimeReason,
            status,
            reason: reasonNote,
          }),
        });
      }

      data = await res.json();

      if (res.ok) {
        toast(data.message || "Lembur berhasil disimpan.");
        // [OVERTIME] warning window shift ditampilkan SETELAH sukses —
        // non-blocking, murni informasi (jam lembur wajar di luar window
        // normal shift yang dipilih).
        if (data.warning && warnEl && warnText) {
          warnText.textContent = data.warning;
          showEl(warnEl);
        }
        setTimeout(
          () => {
            closeModal("modalOvertime");
            location.reload();
          },
          data.warning ? 2200 : 1000,
        );
      } else {
        showEl(errEl);
        errEl.textContent = data.message || "Gagal menyimpan catatan lembur.";
      }
    } catch (e) {
      showEl(errEl);
      errEl.textContent = "Gagal menghubungi server.";
      console.error(e);
    } finally {
      hideEl(spinner);
      if (btnSubmit) btnSubmit.disabled = false;
    }
  }

  // Buka modal Lembur langsung dalam mode edit untuk log tertentu — dipakai
  // saat baris tabel "Riwayat Lembur" diklik, atau saat _openCorrModalForLog()
  // mendeteksi log yang diklik adalah is_overtime=True.
  async function openOvertimeModalForLog(userId, userName, workDate) {
    resetOvertimeModal();
    otState.empId = userId;
    otState.empName = userName;
    otState.workDate = workDate;

    const empInput = $("#otEmpSearch");
    const hiddenId = $("#otEmployee");
    if (empInput) empInput.value = userName;
    if (hiddenId) hiddenId.value = userId;
    const clearBtn = $("#otEmpClear");
    if (clearBtn) showEl(clearBtn);
    const dateEl = $("#otDate");
    if (dateEl) dateEl.value = workDate || new Date().toISOString().slice(0, 10);

    openModal("modalOvertime");
    await doOvertimeLookup();
  }

  function initOvertimeModal() {
    initOvertimeEmployeeAutocomplete();
    $("#btnOtNew")?.addEventListener("click", openOvertimeModal);
    $("#btnCloseOt")?.addEventListener("click", () => closeModal("modalOvertime"));
    $("#btnCancelOt")?.addEventListener("click", () => closeModal("modalOvertime"));
    $("#btnOtSearch")?.addEventListener("click", doOvertimeLookup);
    $("#btnOtCreateNew")?.addEventListener("click", showOvertimeCreateForm);
    $("#btnOtSubmit")?.addEventListener("click", doOvertimeModalSubmit);

    document.addEventListener("click", (e) => {
      const item = e.target.closest(".ot-result-item");
      if (item) {
        const logId = item.dataset.logId;
        const lg = otState.results.find((r) => String(r.id) === String(logId));
        if (lg) {
          otState.mode = "edit";
          fillOvertimeFormFromLog(lg);
        }
        return;
      }
      // Baris tabel "Riwayat Lembur" di panelOvertime
      const row = e.target.closest(".ot-row-clickable");
      if (row) {
        openOvertimeModalForLog(
          row.dataset.userId,
          row.dataset.userName,
          row.dataset.workDate,
        );
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. MODAL KOREKSI BARU — [FIX-3] openModal yang lebih robust
  // ═══════════════════════════════════════════════════════════════════════════
  function initCorrModal() {
    const btnNew = $("#btnCorrNew");
    const btnClose = $("#btnCloseCorr");
    const btnCancel = $("#btnCancelCorr");
    const btnSearch = $("#btnCorrSearch");
    const btnSubmit = $("#btnCorrSubmit");

    btnNew?.addEventListener("click", openCorrModal);
    btnClose?.addEventListener("click", () => closeModal("modalCorr"));
    btnCancel?.addEventListener("click", () => closeModal("modalCorr"));

    $("#corrDate")?.addEventListener("change", () => {
      if (corrState.empId) doLookup();
    });

    btnSearch?.addEventListener("click", doLookup);
    btnSubmit?.addEventListener("click", doSubmit);

    $("#corrNewIn")?.addEventListener("input", updateAutoStatus);
    // Juga trigger saat status berubah (untuk hint check-in opsional)
    $("#corrNewStatus")?.addEventListener("change", (e) => {
      e.target.dataset.userSet = "1"; // manajer memilih sendiri
      updateAutoStatus();
    });

    $("#btnDeleteThisLog")?.addEventListener("click", () => {
      if (!corrState.logId) return;
      openConfirmDelete(
        "Apakah Anda yakin ingin menghapus log absensi ini?",
        async (reason) => {
          const res = await fetchJson(URL_LOG_DELETE(corrState.logId), {
            method: "DELETE",
            body: JSON.stringify({ reason }),
          });
          const data = await res.json();
          if (res.ok) {
            toast(data.message || "Log berhasil dihapus.");
            closeModal("modalCorr");
            setTimeout(() => location.reload(), 1200);
          } else throw new Error(data.message || "Gagal menghapus log.");
        },
      );
    });

    $("#btnGoToDupPanel")?.addEventListener("click", () => {
      closeModal("modalCorr");
      switchToTab("duplicates");
    });
  }

  // [FIX-3] openModal sekarang set display flex secara langsung
  function openModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add("active");
    // Set display langsung, tidak clear — pastikan flex agar centering berjalan
    m.style.display = "flex";
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("active");
    m.style.display = "none";
    // Restore scroll jika tidak ada modal lain yang terbuka
    const anyOpen = document.querySelector(".modal-overlay.active");
    if (!anyOpen) document.body.style.overflow = "";
  }

  // Tutup modal saat klik overlay
  document.addEventListener("click", (e) => {
    [
      "modalMerge",
      "modalConfirmDelete",
      "modalLogDetail",
      "modalCorr",
      "modalOvertime",
    ].forEach((id) => {
      const m = document.getElementById(id);
      if (m && e.target === m) closeModal(id);
    });
  });

  // ESC untuk tutup modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [
        "modalCorr",
        "modalLogDetail",
        "modalMerge",
        "modalConfirmDelete",
        "modalOvertime",
      ].forEach(closeModal);
    }
  });

  function openCorrModal() {
    corrState = {
      empId: "",
      empName: "",
      logId: "",
      shiftInfo: null,
      logData: null,
      sourcePanel: "history", // dibuka dari tombol "+ Koreksi Baru"
    };

    const empInput = $("#corrEmpSearch");
    if (empInput) empInput.value = "";
    const hiddenId = $("#corrEmployee");
    if (hiddenId) hiddenId.value = "";
    hideEl($("#corrEmpClear"));
    hideEl($("#corrEmpDropdown"));

    const dateEl = $("#corrDate");
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

    resetCorrForm();
    openModal("modalCorr");

    // Focus ke input karyawan setelah animasi
    setTimeout(() => $("#corrEmpSearch")?.focus(), 100);
  }

  function resetCorrForm() {
    hideEl($("#corrDataPreview"));
    hideEl($("#corrFormFields"));
    hideEl($("#btnCorrSubmit"));
    showEl($("#btnCorrSearch"));
    hideEl($("#corrDupWarning"));
    hideEl($("#corrOvertimeContext"));
    hideEl($("#corrDeleteRow"));
    hideEl($("#corrStep1Error"));
    hideEl($("#corrError"));
    hideEl($("#created-at-hint")); // [BUG-2 FIX]

    ["corrNewIn", "corrNewOut", "corrReason"].forEach((id) => {
      const el = $(`#${id}`);
      if (el) el.value = "";
    });
    const stEl = $("#corrNewStatus");
    if (stEl) {
      stEl.value = "";
      delete stEl.dataset.userSet;
    }
  }

  async function doLookup() {
    const empId = corrState.empId || $("#corrEmployee")?.value || "";
    const dateVal = $("#corrDate")?.value || "";
    const errEl = $("#corrStep1Error");

    if (!empId) {
      showEl(errEl);
      errEl.textContent = "Pilih karyawan terlebih dahulu.";
      return;
    }
    if (!dateVal) {
      showEl(errEl);
      errEl.textContent = "Pilih tanggal terlebih dahulu.";
      return;
    }
    hideEl(errEl);

    const btnSearch = $("#btnCorrSearch");
    if (btnSearch) {
      btnSearch.disabled = true;
      btnSearch.textContent = "Mencari…";
    }

    try {
      // [REVERT-OVERTIME-SCOPE] shift_id tidak lagi dikirim — backend
      // otomatis resolve shift reguler karyawan via get_user_shift().
      const res = await fetch(
        `${URL_ATT_LOOKUP}?user_id=${encodeURIComponent(empId)}&date=${encodeURIComponent(dateVal)}`,
      );
      const data = await res.json();

      corrState.shiftInfo = {
        work_start: data.work_start || null,
        work_end: data.work_end || null,
        late_tolerance: data.late_tolerance || 0,
        shift_label: data.shift_label || null,
        shift_type: data.shift_type || null,
        office_name: data.office_name || null,
        cutoff: data.cutoff || null,
        // Window params untuk validasi jam check-in / check-out
        checkin_open_before:
          data.checkin_open_before !== undefined &&
          data.checkin_open_before !== null
            ? data.checkin_open_before
            : 120,
        checkout_grace:
          data.checkout_grace !== undefined && data.checkout_grace !== null
            ? data.checkout_grace
            : 120,
        crosses_midnight: !!data.crosses_midnight,
      };

      // [BUG-2 FIX] Tampilkan info akun dibuat sebagai petunjuk saja (tidak blokir)
      const hintEl = $("#created-at-hint");
      if (hintEl) {
        if (data.user_created_at) {
          hintEl.textContent = `ℹ️ Akun dibuat: ${formatDate(data.user_created_at)}`;
          showEl(hintEl);
        } else {
          hideEl(hintEl);
        }
      }

      if (res.ok) {
        corrState.logId = data.id;
        corrState.logData = data;
        renderDataPreview(data);
        fillFormFromLog(data);
        showFormFields(true, data.source === "deleted");
      } else if (res.status === 404 && data.no_log) {
        corrState.logId = "";
        corrState.logData = null;
        renderDataPreview(null, data);
        fillFormNew();
        showFormFields(false, false);
      } else {
        showEl(errEl);
        errEl.textContent = data.message || "Gagal mencari data absensi.";
        return;
      }

      // [REVERT-OVERTIME-SCOPE] overtime_context: info read-only kalau
      // karyawan sudah punya baris lembur di tanggal ini — BUKAN hasil
      // koreksi modal ini, hanya penunjuk agar manajer tahu dan bisa
      // membukanya lewat modal Lembur terpisah.
      const otCtxEl = $("#corrOvertimeContext");
      if (data.overtime_context && data.overtime_context.length > 0 && otCtxEl) {
        const items = data.overtime_context
          .map(
            (o) =>
              `${o.shift_label || "—"} (${o.check_in || "—"}–${o.check_out || "—"})`,
          )
          .join(", ");
        otCtxEl.innerHTML = `ℹ️ Karyawan ini juga punya lembur di tanggal ini: ${items}. Gunakan tombol "Lembur" untuk mengedit.`;
        showEl(otCtxEl);
      } else if (otCtxEl) {
        hideEl(otCtxEl);
      }

      hideEl($("#corrDupWarning"));
      hideEl(btnSearch);
      showEl($("#btnCorrSubmit"));
    } catch (e) {
      showEl(errEl);
      errEl.textContent = "Gagal menghubungi server.";
      console.error(e);
    } finally {
      if (btnSearch) {
        btnSearch.disabled = false;
        btnSearch.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Cari Data Absensi`;
      }
    }
  }

  function renderDataPreview(logData, noLogData) {
    const previewEl = $("#corrDataPreview");
    if (!previewEl) return;

    const si = corrState.shiftInfo;

    if (logData) {
      const checkIn = logData.check_in || "—";
      const checkOut = logData.check_out || "—";
      const status = STATUS_LABEL[logData.status] || logData.status || "—";
      const shift = logData.shift_label || si?.shift_label || "—";
      const isDeleted = logData.source === "deleted";

      previewEl.innerHTML = `
        <div class="corr-preview-card${isDeleted ? " corr-preview-deleted" : ""}">
          ${isDeleted ? '<div class="corr-preview-deleted-banner">⚠️ Log ini sudah dihapus (soft-delete) — Anda dapat memulihkannya</div>' : ""}
          <div class="corr-preview-cols">
            <div class="corr-preview-col">
              <span class="corr-preview-label">CHECK-IN</span>
              <span class="corr-preview-val">${checkIn}</span>
            </div>
            <div class="corr-preview-col">
              <span class="corr-preview-label">CHECK-OUT</span>
              <span class="corr-preview-val">${checkOut}</span>
            </div>
            <div class="corr-preview-col">
              <span class="corr-preview-label">STATUS</span>
              <span class="corr-preview-val corr-preview-status">${status}</span>
            </div>
          </div>
          ${
            si?.work_start
              ? `
            <div class="corr-shift-info">
              ℹ️ ${si.office_name ? si.office_name + ": " : ""}${si.work_start}
              ${si.late_tolerance ? `— toleransi ${si.late_tolerance} mnt` : ""}
              ${shift !== "—" ? ` · Shift: ${shift}` : ""}
              ${si.cutoff ? ` · Cutoff: ${si.cutoff}` : ""}
            </div>
          `
              : ""
          }
          ${
            logData.shift_mismatch
              ? `<div class="corr-shift-info" style="color:var(--danger,#b91c1c)">
              ⚠️ Log ini tercatat di <strong>${shift}</strong>, sedangkan jadwal karyawan pada tanggal ini
              ${logData.scheduled_shift_label ? `<strong>${logData.scheduled_shift_label}</strong>` : "<strong>tidak ada</strong>"}.
              Jam yang Anda isi divalidasi menurut ${shift}.
            </div>`
              : ""
          }
        </div>
      `;
    } else {
      const ws = si?.work_start || "";
      const shiftLabel = si?.shift_label || "";
      previewEl.innerHTML = `
        <div class="corr-preview-card corr-preview-new">
          <span class="corr-preview-new-label">📋 Belum ada log absensi${shiftLabel ? ` untuk shift ${shiftLabel}` : ""} — akan membuat log baru</span>
          ${ws ? `<span class="corr-preview-new-ws">Jam kerja mulai: <strong>${ws}</strong></span>` : ""}
        </div>
      `;
    }
    showEl(previewEl);
  }

  function fillFormFromLog(data) {
    const inEl = $("#corrNewIn");
    const outEl = $("#corrNewOut");
    const stEl = $("#corrNewStatus");
    if (inEl) inEl.value = data.check_in || "";
    if (outEl) outEl.value = data.check_out || "";
    if (stEl) {
      stEl.value = data.status || "";
      delete stEl.dataset.userSet;
    }
    updateAutoStatus();
  }

  function fillFormNew() {
    const inEl = $("#corrNewIn");
    const outEl = $("#corrNewOut");
    const stEl = $("#corrNewStatus");
    if (inEl) inEl.value = "";
    if (outEl) outEl.value = "";
    if (stEl) stEl.value = "present";
  }

  // isDeleted: log sudah dihapus, sembunyikan form edit, tampilkan restore
  function showFormFields(hasLog, isDeleted) {
    if (isDeleted) {
      // Log terhapus: tampilkan hanya opsi restore, sembunyikan form edit
      hideEl($("#corrFormFields"));
      hideEl($("#btnCorrSubmit"));
      showEl($("#corrDeleteRow"));
      // Ganti teks tombol "Hapus Log Ini" menjadi tidak relevan, tapi
      // tambahkan tombol restore langsung di preview — lihat renderDataPreview
      const delBtn = $("#btnDeleteThisLog");
      if (delBtn) hideEl(delBtn);
      return;
    }
    showEl($("#corrFormFields"));
    if (hasLog) showEl($("#corrDeleteRow"));
    else hideEl($("#corrDeleteRow"));
    const delBtn = $("#btnDeleteThisLog");
    if (delBtn) showEl(delBtn);
  }

  // Status yang dipilih user secara manual — TIDAK boleh di-override oleh auto-detection
  const MANUAL_STATUS_PRESERVE = new Set([
    "sick",
    "day_off",
    "extra_off",
    "absent",
    "remote",
  ]);
  // Status yang tidak perlu jam check-in
  const NO_CHECKIN_STATUSES = new Set([
    "absent",
    "sick",
    "day_off",
    "extra_off",
  ]);

  function updateAutoStatus() {
    const si = corrState.shiftInfo;
    const inVal = $("#corrNewIn")?.value || "";
    const autoEl = $("#corrAutoStatus");
    const stEl = $("#corrNewStatus");
    const leaveHint = $("#corrStatusLeaveHint");

    // Tampilkan/sembunyikan hint check-in opsional sesuai status saat ini
    if (leaveHint) {
      leaveHint.style.display = NO_CHECKIN_STATUSES.has(stEl?.value || "")
        ? ""
        : "none";
    }

    if (!si?.work_start || !inVal) {
      if (autoEl) hideEl(autoEl);
      return;
    }
    const autoSt = calcAutoStatus(
      inVal,
      si.work_start,
      si.late_tolerance,
      si.checkin_open_before,
    );
    if (!autoSt) return;

    // Jika user sudah memilih status manual (bukan hadir/terlambat), jangan override.
    // Khusus "absent": nilai itu sering hanya bawaan dari log lama (baris alpa
    // hasil scheduler), bukan pilihan manajer. Selama dropdown belum disentuh
    // manajer, mengisi check-in harus otomatis mengubah status ke hadir/terlambat.
    const userChose = stEl?.dataset.userSet === "1";
    if (
      stEl &&
      MANUAL_STATUS_PRESERVE.has(stEl.value) &&
      (userChose || stEl.value !== "absent")
    ) {
      // Tetap tampilkan badge sebagai referensi tapi jangan ubah nilai
      if (autoEl) {
        autoEl.textContent = `(${STATUS_LABEL[autoSt] || autoSt})`;
        autoEl.className = `corr-auto-badge status-pill pill-${autoSt}`;
        autoEl.style.opacity = "0.6";
        showEl(autoEl);
      }
      return;
    }

    if (stEl) stEl.value = autoSt;
    if (autoEl) {
      autoEl.textContent = STATUS_LABEL[autoSt] || autoSt;
      autoEl.className = `corr-auto-badge status-pill pill-${autoSt}`;
      autoEl.style.opacity = "";
      showEl(autoEl);
    }
  }

  /**
   * Validasi jam check-in/check-out terhadap window shift.
   * Mengembalikan string pesan error, atau null jika valid.
   */
  function validateShiftWindow(si, checkIn, checkOut) {
    if (!si || !si.work_start) return null;

    function toMin(hhmm) {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    }
    function pad2(n) {
      return String(n).padStart(2, "0");
    }
    function fromMin(m) {
      return pad2(Math.floor(m / 60)) + ":" + pad2(m % 60);
    }

    if (checkIn) {
      const entered = toMin(checkIn);
      const wsMin = toMin(si.work_start);
      const openBefore =
        si.checkin_open_before !== undefined ? si.checkin_open_before : 120;
      let openMin = wsMin - openBefore;
      if (openMin < 0) openMin += 1440;

      if (si.cutoff) {
        const cutoffMin = toMin(si.cutoff);
        // Handle wrap-around: jika openMin > cutoffMin berarti span tengah malam
        const inWindow =
          openMin <= cutoffMin
            ? entered >= openMin && entered <= cutoffMin
            : entered >= openMin || entered <= cutoffMin;
        if (!inWindow) {
          return (
            `Jam check-in ${checkIn} di luar window shift ` +
            `${si.shift_label || ""} (${fromMin(openMin)}–${si.cutoff}).` +
            ` Shift ini: ${si.work_start}–${si.work_end || "?"}.`
          );
        }
      }
    }

    if (checkOut && si.work_end) {
      const entered = toMin(checkOut);
      const wsMin = toMin(si.work_start);
      const weMin = toMin(si.work_end);
      const grace = si.checkout_grace !== undefined ? si.checkout_grace : 120;

      if (!si.crosses_midnight) {
        let closeMin = weMin + grace;
        if (closeMin >= 1440) closeMin -= 1440;
        const inWindow = entered >= wsMin && entered <= closeMin;
        if (!inWindow) {
          return (
            `Jam check-out ${checkOut} di luar window shift ` +
            `${si.shift_label || ""} (${si.work_start}–${fromMin(closeMin)}).`
          );
        }
      } else {
        // Shift malam: valid jika >= work_start ATAU <= work_end+grace (mod 24h)
        const wePlusGrace = (weMin + grace) % 1440;
        const inWindow = entered >= wsMin || entered <= wePlusGrace;
        if (!inWindow) {
          return (
            `Jam check-out ${checkOut} di luar window shift ` +
            `${si.shift_label || ""} (${si.work_start}–+${fromMin(wePlusGrace)}).`
          );
        }
      }
    }

    return null;
  }

  async function doSubmit() {
    const reason = ($("#corrReason")?.value || "").trim();
    const newIn = ($("#corrNewIn")?.value || "").trim();
    const newOut = ($("#corrNewOut")?.value || "").trim();
    const newStatus = ($("#corrNewStatus")?.value || "").trim();
    const errEl = $("#corrError");
    const spinner = $("#corrSubmitSpinner");
    const btnSubmit = $("#btnCorrSubmit");

    if (!reason) {
      showEl(errEl);
      errEl.textContent = "Alasan koreksi wajib diisi.";
      return;
    }

    // [SHIFT-VALID] Validasi window shift di frontend sebelum kirim ke server
    const shiftErr = validateShiftWindow(
      corrState.shiftInfo,
      newIn || null,
      newOut || null,
    );
    if (shiftErr) {
      showEl(errEl);
      errEl.textContent = shiftErr;
      return;
    }

    hideEl(errEl);
    showEl(spinner);
    if (btnSubmit) btnSubmit.disabled = true;

    try {
      let res, data;

      if (corrState.logId) {
        // Koreksi log yang sudah ada
        const body = { attendance_id: corrState.logId, reason };
        if (newIn) body.new_check_in = newIn;
        if (newOut) body.new_check_out = newOut;
        if (newStatus) body.new_status = newStatus;

        res = await fetchJson(URL_CORR_SAVE, {
          method: "POST",
          body: JSON.stringify(body),
        });
      } else {
        // Buat log baru (dari Absensi Hilang atau + Koreksi Baru)
        const empId = corrState.empId || $("#corrEmployee")?.value || "";
        const dateVal = $("#corrDate")?.value || "";
        const resolvedStatus = newStatus || "present";

        // [LEAVE-FIX] Check-in wajib hanya untuk status hadir/terlambat/remote
        if (!newIn && !NO_CHECKIN_STATUSES.has(resolvedStatus)) {
          hideEl(spinner);
          if (btnSubmit) btnSubmit.disabled = false;
          showEl(errEl);
          errEl.textContent = "Jam masuk wajib diisi untuk status ini.";
          return;
        }

        // [REVERT-OVERTIME-SCOPE] shift_id TIDAK LAGI dikirim — backend
        // meresolve shift reguler otomatis via get_user_shift(), persis
        // seperti attendance_log_lookup(). Endpoint akan menolak (400)
        // jika request ini masih menyertakan shift_id yang tidak dikenali
        // parameternya; cukup kirim field di bawah ini.
        const body = {
          user_id: empId,
          work_date: dateVal,
          reason,
          status: resolvedStatus,
        };
        if (newIn) body.check_in = newIn;
        if (newOut) body.check_out = newOut;

        res = await fetchJson(URL_LOG_CREATE, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }

      data = await res.json();
      if (res.ok) {
        toast(data.message || "Berhasil disimpan.");
        closeModal("modalCorr");
        // [MISSING-TAB-FIX] Jika modal dibuka dari panel Absensi Hilang,
        // refresh data missing in-place daripada reload seluruh halaman
        if (corrState.sourcePanel === "missing") {
          setTimeout(() => checkMissingDates(), 400);
        } else {
          setTimeout(() => location.reload(), 1000);
        }
      } else {
        showEl(errEl);
        errEl.textContent = data.message || "Gagal menyimpan koreksi.";
      }
    } catch (e) {
      showEl(errEl);
      errEl.textContent = "Gagal menghubungi server.";
      console.error(e);
    } finally {
      hideEl(spinner);
      if (btnSubmit) btnSubmit.disabled = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. DUPLICATE SCANNER
  // ═══════════════════════════════════════════════════════════════════════════
  function initDuplicateScanner() {
    const btnScan = $("#btnScanDup");
    const btnRefresh = $("#btnRefreshDup");
    if (btnScan)
      btnScan.addEventListener("click", () => {
        switchToTab("duplicates");
        fetchDuplicates();
      });
    if (btnRefresh) btnRefresh.addEventListener("click", fetchDuplicates);

    const today = new Date();
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = $("#dupDateFrom"),
      toEl = $("#dupDateTo");
    if (fromEl) fromEl.value = first.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);
  }

  async function fetchDuplicates() {
    const fromEl = $("#dupDateFrom"),
      toEl = $("#dupDateTo");
    const params = new URLSearchParams();
    if (fromEl?.value) params.set("date_from", fromEl.value);
    if (toEl?.value) params.set("date_to", toEl.value);

    const loadingEl = $("#dupLoading"),
      emptyEl = $("#dupEmpty");
    const listEl = $("#dupGroupList");
    const badgeEl = $("#dupBadge"),
      tabCount = $("#tabDupCount");
    const summary = $("#dupSummary");

    showEl(loadingEl);
    hideEl(emptyEl);
    if (listEl) listEl.innerHTML = "";

    try {
      const res = await fetch(`${URL_DUPLICATES}?${params}`);
      const data = await res.json();
      dupGroups = data.groups || [];
      hideEl(loadingEl);

      if (dupGroups.length === 0) {
        showEl(emptyEl);
        if (badgeEl) hideEl(badgeEl);
        if (tabCount) hideEl(tabCount);
        if (summary) summary.textContent = "";
      } else {
        const totalLogs = dupGroups.reduce((s, g) => s + g.logs.length, 0);
        if (badgeEl) {
          badgeEl.textContent = dupGroups.length;
          showEl(badgeEl);
        }
        if (tabCount) {
          tabCount.textContent = dupGroups.length;
          showEl(tabCount);
        }
        if (summary)
          summary.textContent = `${dupGroups.length} grup duplikat · ${totalLogs} log total`;
        renderDuplicateGroups(dupGroups);
      }
    } catch (e) {
      hideEl(loadingEl);
      if (listEl)
        listEl.innerHTML = `<div class="form-error" style="display:block">Gagal memuat data duplikat.</div>`;
      console.error(e);
    }
  }

  function renderDuplicateGroups(groups) {
    const listEl = $("#dupGroupList");
    if (!listEl) return;
    listEl.innerHTML = groups
      .map(
        (grp, gi) => `
      <div class="dup-group" data-group-idx="${gi}">
        <div class="dup-group-header">
          <div class="dup-group-identity">
            <div class="mgr-avatar mgr-avatar-sm">${grp.user_name.slice(0, 2).toUpperCase()}</div>
            <div>
              <span class="dup-group-name">${grp.user_name}</span>
              ${grp.user_dept ? `<span class="dup-group-dept">${grp.user_dept}</span>` : ""}
            </div>
          </div>
          <div class="dup-group-meta">
            <span class="dup-date-badge">${formatDate(grp.eff_date)}</span>
            <span class="dup-count-badge">${grp.logs.length} log</span>
          </div>
        </div>
        <div class="dup-log-list">${grp.logs.map((lg) => renderDupLogCard(lg, grp.recommended_keep_id, grp.eff_date)).join("")}</div>
        <div class="dup-group-actions">
          <button class="btn-merge-group" data-group-idx="${gi}">🔀 Merge — Pilih yang Dipertahankan</button>
          <button class="btn-select-all-group" data-group-idx="${gi}">☑ Pilih Semua untuk Bulk Delete</button>
        </div>
      </div>
    `,
      )
      .join("");

    $$(".btn-merge-group").forEach((btn) =>
      btn.addEventListener("click", () =>
        openMergeModal(parseInt(btn.dataset.groupIdx)),
      ),
    );
    $$(".btn-select-all-group").forEach((btn) =>
      btn.addEventListener("click", () =>
        selectAllInGroup(parseInt(btn.dataset.groupIdx)),
      ),
    );
    $$(".dup-log-checkbox").forEach((cb) =>
      cb.addEventListener("change", updateBulkBar),
    );
  }

  // [FIX-2] Tambahkan parameter effDate, pakai effective_date (dari _serialize_log)
  // bukan eff_date yang tidak ada di log object
  function renderDupLogCard(lg, recommendedId, grpEffDate) {
    const isRec = lg.id === recommendedId;
    const srcClass = SOURCE_CLASS[lg.source] || "src-unknown";
    // [FIX-2] _serialize_log mengembalikan "effective_date", bukan "eff_date"
    // Gunakan lg.effective_date untuk group-key agar "Pertahankan" bisa matching
    const effDate = lg.effective_date || grpEffDate || "";
    const groupKey = `${lg.user_id}_${effDate}`;
    return `
      <div class="dup-log-card ${isRec ? "dup-log-recommended" : ""}">
        <label class="dup-log-select-wrap">
          <input type="checkbox" class="dup-log-checkbox" value="${lg.id}" />
        </label>
        <div class="dup-log-content">
          <div class="dup-log-row">
            <span class="dup-log-time">${lg.check_in || "—"} → ${lg.check_out || "—"}</span>
            <span class="status-pill pill-${(lg.status || "").replace("_", "-")}">${STATUS_LABEL[lg.status] || lg.status}</span>
            <span class="dup-log-src ${srcClass}">${SOURCE_LABEL[lg.source] || lg.source}</span>
          </div>
          <div class="dup-log-meta">
            <span>ID: <code>${lg.id.slice(0, 8)}…</code></span>
            <span>Dibuat: ${lg.created_at}</span>
            ${lg.office_name && lg.office_name !== "—" ? `<span>📍 ${lg.office_name}</span>` : ""}
            ${lg.shift_label ? `<span>⏱ ${lg.shift_label}</span>` : ""}
          </div>
          ${isRec ? '<div class="dup-log-rec-badge">⭐ Direkomendasikan dipertahankan</div>' : ""}
          ${lg.is_flagged ? `<div class="dup-log-flag">⚑ ${lg.source === "deleted" ? "Sudah dihapus (soft-delete)" : "Terindikasi masalah"}</div>` : ""}
        </div>
        <div class="dup-log-actions">
          <button class="btn-dup-detail" data-log-id="${lg.id}" title="Lihat detail log ini">👁 Detail</button>
          <button class="btn-dup-keep btn-dup-single-merge"
            data-log-id="${lg.id}"
            data-group-key="${groupKey}"
            title="Pertahankan log ini, hapus lainnya">
            ✓ Pertahankan
          </button>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. LOG DETAIL MODAL — [FIX-4] + [FEAT-1] Tombol Restore
  // ═══════════════════════════════════════════════════════════════════════════
  function initLogDetailModal() {
    $("#btnCloseLogDetail")?.addEventListener("click", () =>
      closeModal("modalLogDetail"),
    );
    $("#btnCloseLogDetailFooter")?.addEventListener("click", () =>
      closeModal("modalLogDetail"),
    );

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-dup-detail");
      if (btn) openDetailModal(btn.dataset.logId);
    });
  }

  // [FIX-4] Fungsi ini juga di-expose ke global agar inline onclick di HTML bisa pakai
  async function openDetailModal(logId) {
    if (!logId) return;
    const bodyEl = $("#logDetailBody");
    const footerEl = $("#logDetailFooter");
    if (!bodyEl) {
      window.open(URL_LOG_DETAIL(logId), "_blank");
      return;
    }
    bodyEl.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--text-muted)">Memuat…</div>`;
    // Bersihkan tombol footer dinamis
    if (footerEl) {
      const dynBtns = footerEl.querySelectorAll(".btn-detail-dynamic");
      dynBtns.forEach((b) => b.remove());
    }
    openModal("modalLogDetail");

    try {
      const res = await fetch(URL_LOG_DETAIL(logId));
      const data = await res.json();
      if (!res.ok) {
        bodyEl.innerHTML = `<div class="form-error" style="display:block">${data.message || "Gagal memuat."}</div>`;
        return;
      }

      const corrRows =
        (data.corrections || [])
          .map(
            (c) => `
        <div class="detail-corr-item">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;flex-wrap:wrap">
            <strong style="font-size:.8rem">${_actionLabel(c.action_type)}</strong>
            <span style="font-size:.75rem;color:var(--text-faint)">${c.created_at}</span>
          </div>
          <span style="font-size:.775rem;color:var(--text-secondary)">oleh ${c.corrector}</span>
          ${
            c.old_status !== "—"
              ? `
            <div style="margin-top:.35rem;display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
              <span style="font-size:.75rem;color:var(--text-muted)">Sebelum:</span>
              <span class="status-pill pill-${c.old_status || "absent"}" style="font-size:.65rem">${STATUS_LABEL[c.old_status] || c.old_status}</span>
              <span style="font-size:.75rem;color:var(--text-muted)">${c.old_in} – ${c.old_out}</span>
            </div>
          `
              : ""
          }
          ${
            c.new_status !== "—"
              ? `
            <div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap">
              <span style="font-size:.75rem;color:var(--text-muted)">Sesudah:</span>
              <span class="status-pill pill-${c.new_status || "absent"}" style="font-size:.65rem">${STATUS_LABEL[c.new_status] || c.new_status}</span>
              <span style="font-size:.75rem;color:var(--text-muted)">${c.new_in} – ${c.new_out}</span>
            </div>
          `
              : ""
          }
          <div style="margin-top:.3rem;font-size:.75rem;color:var(--text-muted);font-style:italic">${c.reason}</div>
        </div>
      `,
          )
          .join("") ||
        "<p style='color:var(--text-muted);font-size:.8rem'>Belum ada riwayat koreksi.</p>";

      const isDeleted = data.source === "deleted";
      const sourceClass = SOURCE_CLASS[data.source] || "src-unknown";

      bodyEl.innerHTML = `
        ${isDeleted ? `<div class="detail-deleted-notice">⚠️ Log ini sudah dihapus (soft-delete). Data tidak terhitung dalam laporan.</div>` : ""}
        <table>
          <tr><td>Karyawan</td><td><strong>${data.user_name}</strong>${data.user_dept ? ` · <span style="color:var(--text-muted)">${data.user_dept}</span>` : ""}</td></tr>
          <tr><td>Tanggal Efektif</td><td>${formatDate(data.effective_date)}</td></tr>
          <tr><td>Shift</td><td>${data.shift_label || "—"}</td></tr>
          <tr><td>Check-in</td><td><strong>${data.check_in || "—"}</strong></td></tr>
          <tr><td>Check-out</td><td><strong>${data.check_out || "—"}</strong></td></tr>
          <tr><td>Status</td><td><span class="status-pill pill-${data.status}">${STATUS_LABEL[data.status] || data.status}</span></td></tr>
          <tr><td>Sumber</td><td><span class="dup-log-src ${sourceClass}">${SOURCE_LABEL[data.source] || data.source}</span></td></tr>
          <tr><td>Kantor</td><td>${data.office_name || "—"}</td></tr>
          <tr><td>Menit kerja</td><td>${data.working_minutes != null ? data.working_minutes + " mnt" : "—"}</td></tr>
          ${data.is_flagged ? `<tr><td>Flag</td><td style="color:var(--danger);font-size:.8rem">⚑ Terindikasi masalah</td></tr>` : ""}
        </table>
        ${
          data.siblings && data.siblings.length > 0
            ? `
          <div style="margin-top:.75rem;padding:.6rem;background:var(--bg-warning,#fef3c7);border-radius:var(--radius-xs);font-size:.8rem">
            ⚠️ Terdapat ${data.siblings.length} log lain di tanggal ini.
            <button class="btn-secondary" style="margin-left:.5rem;font-size:.75rem;padding:.2rem .5rem"
              onclick="closeModal && closeModal('modalLogDetail');document.querySelector('.corr-tab[data-tab=duplicates]')?.click()">
              Lihat Duplikat
            </button>
          </div>
        `
            : ""
        }
        <div class="detail-corr-history">
          <strong style="font-size:.8rem;color:var(--text-muted)">Riwayat Koreksi (${data.corrections?.length || 0})</strong>
          <div style="margin-top:.5rem">${corrRows}</div>
        </div>
      `;

      // [FEAT-1] Tambahkan tombol Restore ke footer jika log dalam keadaan deleted
      if (isDeleted && footerEl) {
        const restoreBtn = document.createElement("button");
        restoreBtn.className = "btn-corr-add btn-detail-dynamic";
        restoreBtn.style.marginRight = "auto";
        restoreBtn.innerHTML = "↩ Pulihkan Log";
        restoreBtn.addEventListener("click", () => {
          closeModal("modalLogDetail");
          openRestoreModal(logId, data.user_name, data.effective_date);
        });
        footerEl.insertBefore(restoreBtn, footerEl.firstChild);
      }

      // Tambahkan tombol Koreksi / Edit ke footer jika tidak deleted
      if (!isDeleted && footerEl) {
        const editBtn = document.createElement("button");
        editBtn.className = "btn-corr-add btn-detail-dynamic";
        editBtn.style.marginRight = "auto";
        editBtn.innerHTML = "✏️ Koreksi Log Ini";
        editBtn.addEventListener("click", () => {
          closeModal("modalLogDetail");
          const user_id = data.user_id;
          const work_date = data.effective_date;
          // [FRONTEND-OVERTIME-MODAL] Log lembur (is_overtime=True) punya
          // jalur edit terpisah sepenuhnya — arahkan ke modal Lembur, bukan
          // modal Koreksi biasa (yang sejak revert tidak lagi menangani
          // baris is_overtime=True sama sekali).
          if (data.is_overtime) {
            openOvertimeModalForLog(user_id, data.user_name, work_date);
          } else {
            _openCorrModalForLog(user_id, data.user_name, work_date);
          }
        });
        footerEl.insertBefore(editBtn, footerEl.firstChild);
      }
    } catch (e) {
      bodyEl.innerHTML = `<div class="form-error" style="display:block">Gagal memuat detail log.</div>`;
      console.error(e);
    }
  }

  function _actionLabel(type) {
    const map = {
      correction: "✏️ Koreksi",
      delete: "🗑️ Hapus",
      bulk_delete: "🗑️ Bulk Hapus",
      merge: "🔀 Merge",
      manual: "📝 Manual",
    };
    return map[type] || "Koreksi";
  }

  // Pre-fill modal koreksi dari detail log
  // [REVERT-OVERTIME-SCOPE] Parameter shiftId dihapus — modal ini hanya
  // pernah menangani shift reguler sekarang, yang selalu diresolve
  // otomatis oleh backend (get_user_shift()). Fungsi ini TIDAK PERNAH
  // dipanggil untuk log is_overtime=True — lihat cabang is_overtime di
  // openDetailModal() yang mengarahkan ke openOvertimeModalForLog().
  async function _openCorrModalForLog(userId, userName, workDate) {
    corrState = {
      empId: userId,
      empName: userName,
      logId: "",
      shiftInfo: null,
      logData: null,
    };
    const empInput = $("#corrEmpSearch");
    const hiddenId = $("#corrEmployee");
    if (empInput) empInput.value = userName;
    if (hiddenId) hiddenId.value = userId;
    const clearBtn = $("#corrEmpClear");
    if (clearBtn) showEl(clearBtn);
    const dateEl = $("#corrDate");
    if (dateEl)
      dateEl.value = workDate || new Date().toISOString().slice(0, 10);
    resetCorrForm();
    openModal("modalCorr");
    setTimeout(doLookup, 100);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // [FEAT-1] RESTORE MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  function openRestoreModal(logId, userName, workDate) {
    // Re-use confirm delete modal untuk restore — buat dinamis
    const msgEl = $("#confirmDeleteMsg");
    const reasonEl = $("#confirmDeleteReason");
    const errEl = $("#confirmDeleteError");
    const titleEl = $(".modal-title", $("#modalConfirmDelete"));

    if (titleEl) titleEl.textContent = "↩ Konfirmasi Pulihkan Log";
    if (msgEl)
      msgEl.textContent = `Pulihkan log absensi ${userName} pada ${formatDate(workDate)}?`;
    if (reasonEl) reasonEl.value = "";
    if (errEl) {
      hideEl(errEl);
      errEl.textContent = "";
    }

    const doBtn = $("#btnDoDelete");
    if (doBtn) doBtn.innerHTML = "↩ Pulihkan";

    pendingDeleteCb = async (reason) => {
      const res = await fetchJson(URL_LOG_RESTORE(logId), {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(data.message || "Log berhasil dipulihkan.");
        setTimeout(() => location.reload(), 1000);
      } else {
        throw new Error(data.message || "Gagal memulihkan log.");
      }
    };

    openModal("modalConfirmDelete");
    if (reasonEl) reasonEl.focus();

    // Reset tombol setelah modal ditutup
    const restoreOnClose = () => {
      if (doBtn)
        doBtn.innerHTML = `<span id="deleteSpinner" style="display:none">⏳</span> 🗑️ Hapus`;
      if (titleEl) titleEl.textContent = "🗑️ Konfirmasi Hapus";
    };
    $("#btnCancelConfirmDelete")?.addEventListener("click", restoreOnClose, {
      once: true,
    });
    $("#btnCloseConfirmDelete")?.addEventListener("click", restoreOnClose, {
      once: true,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. MODAL MERGE
  // ═══════════════════════════════════════════════════════════════════════════
  function initMergeModal() {
    $("#btnCloseMerge")?.addEventListener("click", closeMergeModal);
    $("#btnCancelMerge")?.addEventListener("click", closeMergeModal);

    $("#btnConfirmMerge")?.addEventListener("click", async () => {
      const reason = ($("#mergeReason")?.value || "").trim();
      const errEl = $("#mergeError");
      if (!reason) {
        showEl(errEl);
        errEl.textContent = "Alasan merge wajib diisi.";
        return;
      }
      hideEl(errEl);
      const keepId = $('input[name="mergeKeep"]:checked')?.value;
      if (!keepId) {
        showEl(errEl);
        errEl.textContent = "Pilih log yang dipertahankan.";
        return;
      }

      const deleteIds = currentMergeGroup.logs
        .map((l) => l.id)
        .filter((id) => id !== keepId);
      const spinner = $("#mergeSpinner"),
        btn = $("#btnConfirmMerge");
      showEl(spinner);
      btn.disabled = true;

      try {
        const res = await fetchJson(URL_MERGE, {
          method: "POST",
          body: JSON.stringify({
            keep_id: keepId,
            delete_ids: deleteIds,
            reason,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast(data.message || "Merge berhasil.");
          closeMergeModal();
          fetchDuplicates();
        } else {
          showEl(errEl);
          errEl.textContent = data.message || "Gagal melakukan merge.";
        }
      } catch (e) {
        showEl(errEl);
        errEl.textContent = "Gagal menghubungi server.";
      } finally {
        hideEl(spinner);
        btn.disabled = false;
      }
    });

    document.addEventListener("change", (e) => {
      if (e.target.name === "mergeKeep") {
        const btn = $("#btnConfirmMerge");
        if (btn) btn.disabled = false;
      }
    });
  }

  function closeMergeModal() {
    closeModal("modalMerge");
    currentMergeGroup = null;
  }

  function openMergeModal(groupIdx) {
    currentMergeGroup = dupGroups[groupIdx];
    if (!currentMergeGroup) return;
    const cardsEl = $("#mergeLogCards");
    if (!cardsEl) return;

    cardsEl.innerHTML = currentMergeGroup.logs
      .map((lg) => {
        const isRec = lg.id === currentMergeGroup.recommended_keep_id;
        const srcClass = SOURCE_CLASS[lg.source] || "";
        return `
        <label class="merge-card ${isRec ? "merge-card-rec" : ""}">
          <input type="radio" name="mergeKeep" value="${lg.id}" ${isRec ? "checked" : ""} />
          <div class="merge-card-content">
            <div class="merge-card-row">
              <span class="merge-card-time">${lg.check_in || "—"} → ${lg.check_out || "—"}</span>
              <span class="status-pill pill-${(lg.status || "").replace("_", "-")}">${STATUS_LABEL[lg.status] || lg.status}</span>
              <span class="dup-log-src ${srcClass}">${SOURCE_LABEL[lg.source] || lg.source}</span>
            </div>
            <div class="merge-card-meta">Dibuat: ${lg.created_at}${isRec ? " · <strong>Direkomendasikan</strong>" : ""}</div>
          </div>
          ${isRec ? '<span class="merge-rec-star">⭐</span>' : ""}
        </label>
      `;
      })
      .join("");

    const errEl = $("#mergeError");
    if (errEl) {
      hideEl(errEl);
      errEl.textContent = "";
    }
    const reasonEl = $("#mergeReason");
    if (reasonEl) reasonEl.value = "";
    const btnConfirm = $("#btnConfirmMerge");
    if (btnConfirm)
      btnConfirm.disabled = !currentMergeGroup.recommended_keep_id;
    openModal("modalMerge");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. BULK DELETE
  // ═══════════════════════════════════════════════════════════════════════════
  function selectAllInGroup(groupIdx) {
    const grp = dupGroups[groupIdx];
    if (!grp) return;
    $$(".dup-log-checkbox").forEach((cb) => {
      if (
        grp.logs.some((l) => l.id === cb.value) &&
        cb.value !== grp.recommended_keep_id
      ) {
        cb.checked = true;
        bulkSelectedIds.add(cb.value);
      }
    });
    updateBulkBar();
  }

  function updateBulkBar() {
    bulkSelectedIds.clear();
    $$(".dup-log-checkbox:checked").forEach((cb) =>
      bulkSelectedIds.add(cb.value),
    );
    const bar = $("#bulkBar"),
      count = $("#bulkSelectedCount");
    if (bulkSelectedIds.size > 0) {
      showEl(bar);
      if (count) count.textContent = `${bulkSelectedIds.size} log dipilih`;
    } else hideEl(bar);
  }

  function initBulkDelete() {
    $("#btnBulkDelete")?.addEventListener("click", () => {
      if (!bulkSelectedIds.size) return;
      openConfirmDelete(
        `Hapus ${bulkSelectedIds.size} log yang dipilih secara permanen?`,
        async (reason) => {
          const res = await fetchJson(URL_BULK_DELETE, {
            method: "POST",
            body: JSON.stringify({ ids: [...bulkSelectedIds], reason }),
          });
          const data = await res.json();
          if (res.ok) {
            toast(data.message || `${data.deleted_count} log dihapus.`);
            bulkSelectedIds.clear();
            updateBulkBar();
            fetchDuplicates();
          } else throw new Error(data.message || "Gagal menghapus.");
        },
      );
    });

    $("#btnBulkCancel")?.addEventListener("click", () => {
      $$(".dup-log-checkbox").forEach((cb) => (cb.checked = false));
      bulkSelectedIds.clear();
      updateBulkBar();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. SINGLE LOG QUICK-KEEP
  // ═══════════════════════════════════════════════════════════════════════════
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-dup-single-merge");
    if (!btn) return;
    const keepId = btn.dataset.logId;
    const groupKey = btn.dataset.groupKey;
    // [FIX-2] Cari grup berdasarkan key yang sudah menggunakan effective_date
    const grp = dupGroups.find((g) => {
      // Cek kecocokan dengan user_id dan eff_date (dari API response group)
      const gKey = `${g.user_id}_${g.eff_date}`;
      // Atau match dengan effective_date dari log
      return (
        gKey === groupKey ||
        g.logs.some((l) => `${l.user_id}_${l.effective_date}` === groupKey)
      );
    });
    if (!grp) {
      toast("Grup tidak ditemukan.", "error");
      return;
    }
    const deleteIds = grp.logs.map((l) => l.id).filter((id) => id !== keepId);
    if (!deleteIds.length) {
      toast("Tidak ada log lain untuk dihapus.", "info");
      return;
    }
    openConfirmDelete(
      `Pertahankan log ini dan hapus ${deleteIds.length} log duplikat lainnya?`,
      async (reason) => {
        const res = await fetchJson(URL_MERGE, {
          method: "POST",
          body: JSON.stringify({
            keep_id: keepId,
            delete_ids: deleteIds,
            reason,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast(data.message || "Merge berhasil.");
          fetchDuplicates();
        } else throw new Error(data.message || "Gagal merge.");
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. MODAL KONFIRMASI HAPUS (shared)
  // ═══════════════════════════════════════════════════════════════════════════
  function openConfirmDelete(message, onConfirm, prefillReason = "") {
    const msgEl = $("#confirmDeleteMsg"),
      reasonEl = $("#confirmDeleteReason");
    const errEl = $("#confirmDeleteError");
    const titleEl = $(".modal-title", $("#modalConfirmDelete"));
    // Reset judul ke default
    if (titleEl) titleEl.textContent = "🗑️ Konfirmasi Hapus";
    const doBtn = $("#btnDoDelete");
    if (doBtn)
      doBtn.innerHTML = `<span id="deleteSpinner" style="display:none">⏳</span> 🗑️ Hapus`;

    if (msgEl) msgEl.textContent = message;
    if (reasonEl) reasonEl.value = prefillReason;
    if (errEl) {
      hideEl(errEl);
      errEl.textContent = "";
    }
    pendingDeleteCb = onConfirm;
    openModal("modalConfirmDelete");
    if (reasonEl) reasonEl.focus();
  }

  function initConfirmDeleteModal() {
    const btnDo = $("#btnDoDelete");
    const errEl = $("#confirmDeleteError");
    [$("#btnCloseConfirmDelete"), $("#btnCancelConfirmDelete")].forEach((btn) =>
      btn?.addEventListener("click", () => {
        closeModal("modalConfirmDelete");
        pendingDeleteCb = null;
      }),
    );
    btnDo?.addEventListener("click", async () => {
      const reason = ($("#confirmDeleteReason")?.value || "").trim();
      if (!reason) {
        showEl(errEl);
        errEl.textContent = "Alasan wajib diisi.";
        return;
      }
      if (!pendingDeleteCb) return;
      const spinner = $("#deleteSpinner");
      showEl(spinner);
      btnDo.disabled = true;
      try {
        await pendingDeleteCb(reason);
        closeModal("modalConfirmDelete");
        pendingDeleteCb = null;
      } catch (e) {
        showEl(errEl);
        errEl.textContent = e.message || "Terjadi kesalahan.";
      } finally {
        hideEl(spinner);
        btnDo.disabled = false;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. FILTER TABEL HISTORY — [FEAT-2] Tambah date filter + server-side search
  // ═══════════════════════════════════════════════════════════════════════════
  function initActionFilter() {
    const actionFilter = $("#corrActionFilter");
    const statusFilter = $("#corrStatusFilter");
    const searchInput = $("#corrSearch");
    if (!actionFilter) return;

    // Client-side filter: status & action (cepat, tidak perlu reload)
    [actionFilter, statusFilter].forEach((el) =>
      el?.addEventListener("change", applyLocalFilters),
    );

    // [SEARCH-FIX] Search karyawan: debounce → server-side redirect
    // Juga tetap terapkan local filter untuk immediate feedback sementara menunggu debounce
    let searchDebounceTimer = null;
    if (searchInput) {
      // Jalankan local filter saat pertama load (jika ada nilai dari URL)
      applyLocalFilters();

      searchInput.addEventListener("input", () => {
        // Immediate local feedback (terbatas pada halaman saat ini)
        applyLocalFilters();

        // Setelah 700ms tanpa ketikan baru → cari ke server (semua halaman)
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          const val = searchInput.value.trim();
          const url = new URL(window.location.href);
          if (val) url.searchParams.set("search", val);
          else url.searchParams.delete("search");
          url.searchParams.delete("page"); // reset ke hal. 1
          window.location.href = url.toString();
        }, 700);
      });

      // Enter: langsung cari server tanpa tunggu debounce
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          clearTimeout(searchDebounceTimer);
          const val = searchInput.value.trim();
          const url = new URL(window.location.href);
          if (val) url.searchParams.set("search", val);
          else url.searchParams.delete("search");
          url.searchParams.delete("page");
          window.location.href = url.toString();
        }
      });
    }

    // Toggle advanced filter panel
    $("#btnToggleAdvFilter")?.addEventListener("click", () => {
      const panel = $("#corrAdvFilter");
      if (!panel) return;
      panel.style.display = panel.style.display === "none" ? "block" : "none";
    });

    // Server-side filter via tombol Apply Filter
    const btnApplyFilter = $("#btnApplyHistFilter");
    if (btnApplyFilter) {
      btnApplyFilter.addEventListener("click", () => {
        const dateFrom = $("#histDateFrom")?.value || "";
        const dateTo = $("#histDateTo")?.value || "";
        const uid = $("#histEmpFilter")?.value || "";
        const action = actionFilter?.value || "";
        const search = searchInput?.value.trim() || "";
        const url = new URL(window.location.href);
        if (dateFrom) url.searchParams.set("date_from", dateFrom);
        else url.searchParams.delete("date_from");
        if (dateTo) url.searchParams.set("date_to", dateTo);
        else url.searchParams.delete("date_to");
        if (uid) url.searchParams.set("user_id", uid);
        else url.searchParams.delete("user_id");
        if (action) url.searchParams.set("action", action);
        else url.searchParams.delete("action");
        if (search) url.searchParams.set("search", search);
        else url.searchParams.delete("search");
        url.searchParams.delete("page");
        window.location.href = url.toString();
      });
    }

    // [SEARCH-FIX] Local filter: hanya untuk status/action, bukan nama karyawan
    // (nama karyawan sudah ditangani server-side lewat ?search=)
    function applyLocalFilters() {
      const statusVal = statusFilter?.value || "";
      const actionVal = actionFilter.value || "";
      // Untuk search lokal: tetap filter nama pada halaman saat ini (sementara debounce)
      const searchVal = (searchInput?.value || "").toLowerCase().trim();
      const rows = $$("#corrBody tr[data-name]");
      let visible = 0;
      rows.forEach((row) => {
        const show =
          (!searchVal || row.dataset.name?.includes(searchVal)) &&
          (!statusVal || row.dataset.status === statusVal) &&
          (!actionVal || row.dataset.action === actionVal);
        row.style.display = show ? "" : "none";
        if (show) visible++;
      });
      const noResults = $("#corrNoResults");
      if (noResults)
        noResults.style.display =
          visible === 0 && rows.length > 0 ? "block" : "none";
      const countEl = $("#corrCount");
      // Jika sedang melakukan filter lokal, tampilkan jumlah sementara
      if (countEl && (statusVal || actionVal || searchVal)) {
        countEl.textContent = `${visible} entri (filter lokal)`;
      } else if (countEl) {
        // Kembalikan ke teks server-side total
        const serverTotal = countEl.dataset.serverTotal;
        if (serverTotal) countEl.textContent = serverTotal;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. ABSENSI HILANG — [BUG-6 FIX]
  // Deteksi hari kerja tanpa log absensi dalam rentang tanggal tertentu.
  // ═══════════════════════════════════════════════════════════════════════════
  let missingData = [];

  function initMissingDates() {
    // Set default range: 7 hari terakhir
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 7);

    const fromEl = $("#missingDateFrom");
    const toEl = $("#missingDateTo");
    if (fromEl) fromEl.value = weekAgo.toISOString().slice(0, 10);
    if (toEl) toEl.value = today.toISOString().slice(0, 10);

    $("#btnCheckMissing")?.addEventListener("click", checkMissingDates);

    // Tombol "Buat Semua (Absent)" — buat log absent untuk semua yang hilang
    $("#btnFillAllMissing")?.addEventListener("click", () => {
      if (!missingData.length) return;
      if (
        !confirm(
          `Buat ${missingData.length} log absent secara bulk? Aksi ini tidak bisa dibatalkan.`,
        )
      )
        return;
      bulkCreateAbsent(missingData);
    });
  }

  async function checkMissingDates() {
    const dateFrom = $("#missingDateFrom")?.value || "";
    const dateTo = $("#missingDateTo")?.value || "";
    const userId = $("#missingUserFilter")?.value || "";

    const loadingEl = $("#missingLoading");
    const emptyEl = $("#missingEmpty");
    const resultsEl = $("#missingResults");
    const promptEl = $("#missingPrompt");
    const summaryEl = $("#missingSummary");

    if (!dateFrom || !dateTo) {
      toast("Pilih rentang tanggal terlebih dahulu.", "warning");
      return;
    }

    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if ((to - from) / 86400000 > 31) {
      toast("Range maksimal 31 hari.", "warning");
      return;
    }

    showEl(loadingEl);
    hideEl(emptyEl);
    hideEl(resultsEl);
    hideEl(promptEl);
    if (summaryEl) summaryEl.textContent = "";

    let url = `${URL_MISSING_DATES}?date_from=${dateFrom}&date_to=${dateTo}`;
    if (userId) url += `&user_id=${encodeURIComponent(userId)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();
      hideEl(loadingEl);

      if (!res.ok) {
        toast(data.message || "Gagal memuat data.", "error");
        showEl(promptEl);
        return;
      }

      missingData = data.missing || [];
      const total = data.total || 0;

      if (summaryEl) {
        summaryEl.textContent =
          total > 0
            ? `${total} absensi hilang ditemukan`
            : "Tidak ada absensi hilang";
      }

      // Update badge pada tab
      const badge = $("#tabMissingCount");
      if (badge) {
        if (total > 0) {
          badge.textContent = total;
          showEl(badge);
        } else {
          hideEl(badge);
        }
      }

      if (total === 0) {
        showEl(emptyEl);
        return;
      }

      // Render tabel hasil
      const alertBanner = $("#missingAlertBanner");
      if (alertBanner) alertBanner.style.display = "flex";
      const titleEl = $("#missingResultTitle");
      if (titleEl)
        titleEl.textContent = `${total} absensi hilang pada ${dateFrom} – ${dateTo}`;

      const tbody = $("#missingTableBody");
      if (tbody) {
        tbody.innerHTML = missingData
          .map(
            (item) => `
          <tr>
            <td>
              <div class="mgr-employee-cell">
                <div class="mgr-avatar">${item.full_name.slice(0, 2).toUpperCase()}</div>
                <span class="mgr-emp-name">${item.full_name}</span>
              </div>
            </td>
            <td class="mgr-td-mono">${formatDate(item.date)}</td>
            <td class="mgr-td-muted">${item.day_name}</td>
            <td>
              <button
                class="btn-detail-corr"
                onclick="window.openCreateManualModal('${item.user_id}', '${item.date}')"
              >
                📝 Buat Manual
              </button>
            </td>
          </tr>
        `,
          )
          .join("");
      }

      showEl(resultsEl);
      // Pastikan alert banner terlihat dan menggunakan flex
      const alertBannerFix = $("#missingAlertBanner");
      if (alertBannerFix) alertBannerFix.style.display = "flex";
    } catch (e) {
      hideEl(loadingEl);
      showEl(promptEl);
      toast("Gagal menghubungi server.", "error");
      console.error(e);
    }
  }

  // Buat log absent secara bulk untuk semua entri hilang
  async function bulkCreateAbsent(items) {
    let success = 0;
    let failed = 0;

    for (const item of items) {
      try {
        const res = await fetchJson(URL_LOG_CREATE, {
          method: "POST",
          body: JSON.stringify({
            user_id: item.user_id,
            work_date: item.date,
            check_in: null,
            status: "absent",
            reason: "[BULK] Auto-fill absensi hilang",
          }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      toast(`✅ ${success} log absent berhasil dibuat.`);
    } else {
      toast(`${success} berhasil, ${failed} gagal.`, "warning");
    }
    // Refresh deteksi
    checkMissingDates();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. MIDNIGHT-WINDOW SCANNER — Fase 5
  // ═══════════════════════════════════════════════════════════════════════════
  let midnightScanData = [];

  function initMidnightWindow() {
    // Gunakan tanggal lokal (bukan toISOString yang UTC) agar tidak off-by-one
    // di timezone Jakarta (UTC+7) — misal jam 00:xx lokal = hari sebelumnya di UTC
    function toLocalDateStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = $("#mwDateFrom"),
      toEl = $("#mwDateTo");
    if (fromEl) fromEl.value = toLocalDateStr(firstOfMonth);
    if (toEl) toEl.value = toLocalDateStr(today);

    $("#btnScanMidnight")?.addEventListener("click", scanMidnightWindow);

    $("#mwCheckAll")?.addEventListener("change", (e) => {
      $$("#mwTableBody .mw-row-check").forEach((cb) => {
        cb.checked = e.target.checked;
      });
      updateApplyBtn();
    });

    $("#btnApplyMidnight")?.addEventListener("click", applyMidnightFixes);
  }

  async function scanMidnightWindow() {
    const fromEl = $("#mwDateFrom"),
      toEl = $("#mwDateTo");
    const dateFrom = fromEl?.value || "";
    const dateTo = toEl?.value || "";

    if (!dateFrom || !dateTo) {
      toast("Pilih rentang tanggal terlebih dahulu.", "warning");
      return;
    }

    const loadingEl = $("#mwLoading");
    const promptEl = $("#mwPrompt");
    const emptyEl = $("#mwEmpty");
    const resultsEl = $("#mwResults");
    const summaryEl = $("#mwSummary");

    showEl(loadingEl);
    hideEl(promptEl);
    hideEl(emptyEl);
    hideEl(resultsEl);
    if (summaryEl) summaryEl.textContent = "";

    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });
      const res = await fetch(URL_MIDNIGHT_SCAN + "?" + params);
      const data = await res.json();
      hideEl(loadingEl);

      if (!res.ok) {
        toast(data.message || "Gagal memindai.", "error");
        showEl(promptEl);
        return;
      }

      midnightScanData = data.results || [];
      const total = data.total || 0;

      const badge = $("#tabMidnightCount");
      if (badge) {
        if (total > 0) {
          badge.textContent = total;
          showEl(badge);
        } else hideEl(badge);
      }

      if (summaryEl) {
        summaryEl.textContent =
          total > 0
            ? total + " log bermasalah ditemukan"
            : "Tidak ada log bermasalah";
      }

      if (total === 0) {
        showEl(emptyEl);
        const ca = $("#mwCheckAll");
        if (ca) ca.checked = false;
        return;
      }

      const alertBanner = $("#mwAlertBanner");
      const alertText = $("#mwAlertText");
      if (alertBanner) alertBanner.style.display = "flex";
      if (alertText)
        alertText.textContent =
          total + " log shift malam dengan shift_date salah.";

      const tbody = $("#mwTableBody");
      if (tbody) {
        tbody.innerHTML = midnightScanData
          .map(function (row) {
            const statusOld = STATUS_LABEL[row.old_status] || row.old_status;
            const statusNew = STATUS_LABEL[row.new_status] || row.new_status;
            const sameStatus = row.old_status === row.new_status;
            return (
              "<tr>" +
              '<td style="text-align:center">' +
              '<input type="checkbox" class="mw-row-check dup-log-checkbox"' +
              ' value="' +
              row.log_id +
              '" onchange="updateApplyBtn()"/>' +
              "</td>" +
              '<td><div class="mgr-employee-cell">' +
              '<div class="mgr-avatar">' +
              row.user_name.slice(0, 2).toUpperCase() +
              "</div>" +
              "<div>" +
              '<span class="mgr-emp-name">' +
              row.user_name +
              "</span>" +
              (row.office_name
                ? '<span class="mgr-emp-dept">' + row.office_name + "</span>"
                : "") +
              "</div>" +
              "</div></td>" +
              '<td><span class="mw-shift-badge">' +
              row.shift_label +
              "</span></td>" +
              '<td class="mgr-td-mono">' +
              row.check_in +
              "</td>" +
              '<td><div class="mw-date-change">' +
              '<span class="mw-date-old">' +
              formatDate(row.old_shift_date) +
              "</span>" +
              '<span class="mw-date-arrow">\u2192</span>' +
              '<span class="mw-date-new">' +
              formatDate(row.new_shift_date) +
              "</span>" +
              "</div></td>" +
              "<td>" +
              (sameStatus
                ? '<span class="status-pill pill-' +
                  row.old_status +
                  '">' +
                  statusOld +
                  "</span>"
                : '<span class="status-pill pill-' +
                  row.old_status +
                  ' mw-status-dim">' +
                  statusOld +
                  "</span>" +
                  '<span class="mw-arrow-inline">\u2192</span>' +
                  '<span class="status-pill pill-' +
                  row.new_status +
                  '">' +
                  statusNew +
                  "</span>") +
              "</td>" +
              "<td>" +
              (row.has_dup_absent
                ? '<span class="mw-dup-badge">\uD83D\uDDD1 akan dihapus</span>'
                : '<span class="mgr-td-muted">\u2014</span>') +
              "</td>" +
              "</tr>"
            );
          })
          .join("");
      }

      const ca = $("#mwCheckAll");
      if (ca) ca.checked = false;
      updateApplyBtn();
      showEl(resultsEl);
    } catch (e) {
      hideEl(loadingEl);
      showEl(promptEl);
      toast("Gagal menghubungi server.", "error");
      console.error(e);
    }
  }

  async function applyMidnightFixes() {
    const selected = Array.from($$("#mwTableBody .mw-row-check:checked")).map(
      function (cb) {
        return cb.value;
      },
    );
    if (!selected.length) return;

    if (
      !confirm(
        "Terapkan koreksi midnight-window untuk " +
          selected.length +
          " log?\nAksi ini akan memperbarui shift_date dan menghapus absent duplikat.",
      )
    )
      return;

    const btn = $("#btnApplyMidnight");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Memproses\u2026";
    }

    try {
      const res = await fetchJson(URL_MIDNIGHT_APPLY, {
        method: "POST",
        body: JSON.stringify({ log_ids: selected }),
      });
      const data = await res.json();

      if (res.ok) {
        toast(data.message || data.corrected + " log dikoreksi.");
        const remaining = midnightScanData.length - (data.corrected || 0);
        const badge = $("#tabMidnightCount");
        if (badge) {
          if (remaining > 0) {
            badge.textContent = remaining;
            showEl(badge);
          } else hideEl(badge);
        }
        setTimeout(function () {
          scanMidnightWindow();
        }, 600);
      } else {
        toast(data.message || "Gagal menerapkan koreksi.", "error");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "\u2713 Terapkan Koreksi Terpilih";
        }
      }
    } catch (e) {
      toast("Gagal menghubungi server.", "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "\u2713 Terapkan Koreksi Terpilih";
      }
      console.error(e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FALSE ABSENT PANEL
  // ═══════════════════════════════════════════════════════════════════════════

  // State scan terakhir
  var falseAbsentData = { conflict: [], window_open: [], window_closed: [] };

  function initFalseAbsentPanel() {
    function toLocalDateStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromEl = $("#faDateFrom"),
      toEl = $("#faDateTo");
    if (fromEl) fromEl.value = toLocalDateStr(firstOfMonth);
    if (toEl) toEl.value = toLocalDateStr(today);

    $("#btnScanFalseAbsent")?.addEventListener("click", scanFalseAbsents);
  }

  async function scanFalseAbsents() {
    const fromEl = $("#faDateFrom");
    const toEl = $("#faDateTo");
    const shiftEl = $("#faShiftFilter");
    const dateFrom = fromEl?.value || "";
    const dateTo = toEl?.value || "";

    if (!dateFrom || !dateTo) {
      toast("Pilih rentang tanggal terlebih dahulu.", "warning");
      return;
    }

    const loadingEl = $("#faLoading");
    const promptEl = $("#faPrompt");
    const emptyEl = $("#faEmpty");
    const resultsEl = $("#faResults");
    const summaryEl = $("#faSummary");
    const alertBanner = $("#faAlertBanner");
    const alertText = $("#faAlertText");

    showEl(loadingEl);
    hideEl(promptEl);
    hideEl(emptyEl);
    hideEl(resultsEl);
    if (summaryEl) summaryEl.textContent = "";
    if (alertBanner) alertBanner.style.display = "none";

    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (shiftEl?.value) params.set("shift_type", shiftEl.value);

      const res = await fetch(URL_FALSE_ABSENTS + "?" + params);
      const data = await res.json();
      hideEl(loadingEl);

      if (!res.ok) {
        toast(data.message || "Gagal memindai.", "error");
        showEl(promptEl);
        return;
      }

      falseAbsentData = data.categories || {
        conflict: [],
        window_open: [],
        window_closed: [],
      };
      const total = data.total || 0;
      const actionable = data.total_actionable || 0;

      // Tab badge — merah, hanya tampil jika ada yang perlu tindakan
      const badge = $("#tabFalseAbsentCount");
      if (badge) {
        if (actionable > 0) {
          badge.textContent = actionable;
          showEl(badge);
        } else {
          hideEl(badge);
        }
      }

      if (summaryEl) {
        summaryEl.textContent =
          total > 0
            ? total +
              " absent sistem ditemukan (" +
              actionable +
              " perlu tindakan)"
            : "Tidak ada absent sistem mencurigakan";
      }

      if (total === 0) {
        showEl(emptyEl);
        return;
      }

      if (alertBanner) alertBanner.style.display = "flex";
      if (alertText) {
        alertText.textContent =
          total + " absent ditulis sistem SEBELUM window check-in dibuka.";
      }

      _renderFalseAbsentSection("conflict", falseAbsentData.conflict || []);
      _renderFalseAbsentSection(
        "window_open",
        falseAbsentData.window_open || [],
      );
      _renderFalseAbsentSection(
        "window_closed",
        falseAbsentData.window_closed || [],
      );

      showEl(resultsEl);
    } catch (e) {
      hideEl(loadingEl);
      showEl(promptEl);
      toast("Gagal menghubungi server.", "error");
      console.error(e);
    }
  }

  function _renderFalseAbsentSection(category, records) {
    const sectionMap = {
      conflict: {
        section: "#faSectionConflict",
        body: "#faBodyConflict",
        count: "#faConflictCount",
        btn: "#btnDeleteConflict",
      },
      window_open: {
        section: "#faSectionWindowOpen",
        body: "#faBodyWindowOpen",
        count: "#faWindowOpenCount",
        btn: "#btnDeleteOpen",
      },
      window_closed: {
        section: "#faSectionWindowClosed",
        body: "#faBodyWindowClosed",
        count: "#faWindowClosedCount",
        btn: null,
      },
    };

    const cfg = sectionMap[category];
    if (!cfg) return;

    const sectionEl = $(cfg.section);
    const bodyEl = $(cfg.body);
    const countEl = $(cfg.count);
    const btnEl = cfg.btn ? $(cfg.btn) : null;

    if (!records.length) {
      if (sectionEl) sectionEl.style.display = "none";
      return;
    }

    if (sectionEl) sectionEl.style.display = "";
    if (countEl) countEl.textContent = "(" + records.length + " record)";
    if (btnEl) btnEl.disabled = true; // reset — user harus centang dulu
    if (!bodyEl) return;

    if (category === "conflict") {
      bodyEl.innerHTML = records
        .map(function (r) {
          return (
            "<tr>" +
            '<td style="text-align:center">' +
            '<input type="checkbox" class="fa-row-check dup-log-checkbox" data-cat="conflict"' +
            ' value="' +
            r.log_id +
            '" onchange="_faUpdateDeleteBtn(\'conflict\')"/>' +
            "</td>" +
            '<td><div class="mgr-employee-cell">' +
            '<div class="mgr-avatar">' +
            r.user_name.slice(0, 2).toUpperCase() +
            "</div>" +
            "<div>" +
            '<span class="mgr-emp-name">' +
            r.user_name +
            "</span>" +
            '<span class="mgr-emp-dept">' +
            (r.dept || "") +
            "</span>" +
            "</div></div></td>" +
            '<td><span class="mw-shift-badge">' +
            r.shift_label +
            "</span></td>" +
            '<td class="mgr-td-mono">' +
            formatDate(r.shift_date) +
            "</td>" +
            '<td class="mgr-td-mono" style="color:#DC2626;font-weight:600">' +
            r.created_at.slice(11, 16) +
            "</td>" +
            '<td class="mgr-td-mono">' +
            r.open_from +
            "</td>" +
            '<td class="mgr-td-mono">' +
            (r.conflict_checkin || "—") +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    } else if (category === "window_open") {
      bodyEl.innerHTML = records
        .map(function (r) {
          return (
            "<tr>" +
            '<td style="text-align:center">' +
            '<input type="checkbox" class="fa-row-check dup-log-checkbox" data-cat="window_open"' +
            ' value="' +
            r.log_id +
            '" onchange="_faUpdateDeleteBtn(\'window_open\')"/>' +
            "</td>" +
            '<td><div class="mgr-employee-cell">' +
            '<div class="mgr-avatar">' +
            r.user_name.slice(0, 2).toUpperCase() +
            "</div>" +
            "<div>" +
            '<span class="mgr-emp-name">' +
            r.user_name +
            "</span>" +
            '<span class="mgr-emp-dept">' +
            (r.dept || "") +
            "</span>" +
            "</div></div></td>" +
            '<td><span class="mw-shift-badge">' +
            r.shift_label +
            "</span></td>" +
            '<td class="mgr-td-mono">' +
            formatDate(r.shift_date) +
            "</td>" +
            '<td class="mgr-td-mono" style="color:#DC2626;font-weight:600">' +
            r.created_at.slice(11, 16) +
            "</td>" +
            '<td class="mgr-td-mono">' +
            r.open_from +
            " – " +
            (r.cutoff || "?") +
            "</td>" +
            '<td class="mgr-td-mono mgr-td-muted">' +
            (r.cutoff || "—") +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    } else {
      // window_closed — informatif, tanpa checkbox
      bodyEl.innerHTML = records
        .map(function (r) {
          return (
            "<tr>" +
            '<td><div class="mgr-employee-cell">' +
            '<div class="mgr-avatar">' +
            r.user_name.slice(0, 2).toUpperCase() +
            "</div>" +
            "<div>" +
            '<span class="mgr-emp-name">' +
            r.user_name +
            "</span>" +
            '<span class="mgr-emp-dept">' +
            (r.dept || "") +
            "</span>" +
            "</div></div></td>" +
            '<td><span class="mw-shift-badge">' +
            r.shift_label +
            "</span></td>" +
            '<td class="mgr-td-mono">' +
            formatDate(r.shift_date) +
            "</td>" +
            '<td class="mgr-td-mono mgr-td-muted">' +
            r.created_at.slice(11, 16) +
            "</td>" +
            '<td class="mgr-td-mono">' +
            (r.cutoff || "—") +
            "</td>" +
            "</tr>"
          );
        })
        .join("");
    }
  }

  // ── Helpers yang dipanggil dari inline onchange / onclick di HTML ──────────

  // Diekspos ke window agar bisa dipanggil dari atribut onchange di <input>
  window._faUpdateDeleteBtn = function (cat) {
    const anyChecked = !!$$(`.fa-row-check[data-cat="${cat}"]:checked`).length;
    const btnMap = {
      conflict: "#btnDeleteConflict",
      window_open: "#btnDeleteOpen",
    };
    const btn = btnMap[cat] ? $(btnMap[cat]) : null;
    if (btn) btn.disabled = !anyChecked;
  };

  // Diekspos ke window agar bisa dipanggil dari atribut onchange di <input type=checkbox>
  window.faToggleAll = function (cat, checked) {
    $$(`.fa-row-check[data-cat="${cat}"]`).forEach(function (cb) {
      cb.checked = checked;
    });
    window._faUpdateDeleteBtn(cat);
  };

  // Diekspos ke window agar bisa dipanggil dari onclick di tombol Hapus Terpilih
  window.faDeleteSelected = async function (cat) {
    const selected = Array.from(
      $$(`.fa-row-check[data-cat="${cat}"]:checked`),
    ).map(function (cb) {
      return cb.value;
    });

    if (!selected.length) return;

    const catLabel =
      cat === "conflict"
        ? "konflik dengan check-in nyata"
        : "window masih buka";

    if (
      !confirm(
        "Hapus " +
          selected.length +
          " absent palsu (" +
          catLabel +
          ")?\n\n" +
          "Data akan di-soft-delete dan dicatat di Riwayat Koreksi.\n" +
          "Aksi ini tidak bisa dibatalkan melalui UI.",
      )
    )
      return;

    const btnMap = {
      conflict: "#btnDeleteConflict",
      window_open: "#btnDeleteOpen",
    };
    const btn = btnMap[cat] ? $(btnMap[cat]) : null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Memproses\u2026";
    }

    try {
      const res = await fetchJson(URL_FALSE_ABSENTS_DELETE, {
        method: "POST",
        body: JSON.stringify({
          log_ids: selected,
          reason:
            "Cleanup absent palsu \u2014 window belum buka saat sistem mencatat",
        }),
      });
      const data = await res.json();

      if (res.ok) {
        toast(data.message || data.deleted + " absent palsu dihapus.");
        // Update tab badge langsung
        const actionable =
          falseAbsentData.conflict.length +
          falseAbsentData.window_open.length -
          selected.length;
        const badge = $("#tabFalseAbsentCount");
        if (badge) {
          if (actionable > 0) {
            badge.textContent = actionable;
            showEl(badge);
          } else {
            hideEl(badge);
          }
        }
        // Re-scan otomatis setelah jeda singkat
        setTimeout(function () {
          scanFalseAbsents();
        }, 500);
      } else {
        toast(data.message || "Gagal menghapus.", "error");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "\uD83D\uDDD1 Hapus Terpilih";
        }
      }
    } catch (e) {
      toast("Gagal menghubungi server.", "error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "\uD83D\uDDD1 Hapus Terpilih";
      }
      console.error(e);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  function init() {
    initTabs();
    initDuplicateScanner();
    initMergeModal();
    initBulkDelete();
    initConfirmDeleteModal();
    initActionFilter();
    initLogDetailModal();
    initEmployeeAutocomplete();
    initCorrModal();
    initMissingDates(); // [BUG-6 FIX]
    initMidnightWindow();
    initFalseAbsentPanel();
    initOvertimeModal(); // [FRONTEND-OVERTIME-MODAL]

    if (location.hash === "#duplikat") switchToTab("duplicates");
    if (location.hash === "#hilang") switchToTab("missing"); // [BUG-6 FIX]
    if (location.hash === "#malam") switchToTab("midnight");
    if (location.hash === "#absent-sistem") switchToTab("false_absent");
    if (location.hash === "#lembur") switchToTab("overtime"); // NEW (overtime)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // ── Expose API publik
  window.CorrDup = {
    openDetail: openDetailModal,
    fetchDuplicates: fetchDuplicates,
    switchToTab: switchToTab,
    openRestoreModal: openRestoreModal,
  };

  // [MIDNIGHT-FIX] updateApplyBtn global — dipanggil dari inline onchange
  window.updateApplyBtn = function () {
    const selected = $$("#mwTableBody .mw-row-check:checked");
    const btn = $("#btnApplyMidnight");
    if (btn) btn.disabled = selected.length === 0;
  };

  // [FIX-4] openLogDetail global — dipanggil dari inline onclick HTML
  window.openLogDetail = function (logId) {
    openDetailModal(logId);
  };

  // [BUG-6 FIX] openCreateManualModal — dipanggil dari tabel Absensi Hilang
  // Pre-fill modal koreksi dengan user_id dan date, lalu trigger lookup otomatis.
  window.openCreateManualModal = function (userId, dateStr) {
    // Buka modal dengan state bersih
    openCorrModal();
    // Override: modal ini dipicu dari panel Absensi Hilang
    corrState.sourcePanel = "missing";

    // Pre-fill employee dari hidden source select
    const sourceSelect = document.getElementById("corrEmployeeSource");
    if (sourceSelect) {
      const opt = [...sourceSelect.options].find((o) => o.value === userId);
      if (opt) {
        const empSearch = document.getElementById("corrEmpSearch");
        const empHidden = document.getElementById("corrEmployee");
        if (empSearch) empSearch.value = opt.text;
        if (empHidden) empHidden.value = userId;
        corrState.empId = userId;
        corrState.empName = opt.text;
        const clearBtn = document.getElementById("corrEmpClear");
        if (clearBtn) clearBtn.style.display = "";
      }
    }

    // Pre-fill tanggal
    if (dateStr) {
      const dateEl = document.getElementById("corrDate");
      if (dateEl) dateEl.value = dateStr;
    }

    // Auto-trigger lookup setelah animasi modal selesai
    if (userId && dateStr) {
      setTimeout(() => doLookup(), 150);
    }
  };
})();