/**
 * history.js — Riwayat kehadiran karyawan
 *
 * I18N keys yang dibutuhkan (definisikan di template sebelum script ini):
 *   histMonths, histDays, histStatusPresent, histStatusLate,
 *   histStatusAbsent, histStatusDayOff, histStatusExtraOff, histStatusSick,
 *   histStatusRemote, histNoDataTable, histNoData, histNoAttendance,
 *   histSrcGps, histSrcManual, histSrcCorrection, histSrcSystem,
 *   histAllShifts
 *
 * REDESIGN v2 (mengikuti referensi persis — bukan interpretasi bebas):
 *   - Status ditampilkan sebagai DOT + teks kecil (bukan badge pill besar)
 *     di tabel desktop, badge pill solid tetap dipakai di kartu mobile.
 *   - Kolom/baris SHIFT pakai dot warna + teks polos (bukan kotak chip
 *     berbingkai) — warna dot mengikuti token .shift-chip--* yang sudah
 *     ada di theme.css supaya tetap satu sumber warna dengan manager.
 *   - Filter pill sekarang 8: Semua/Hadir/Lembur/Terlambat/Sakit/Izin/
 *     Alpa/Libur — sebelumnya cuma 5 dan "Lembur"+"Sakit"+"Izin"+"Alpa"
 *     digabung jadi satu "Izin/libur". is_overtime tetap independen dari
 *     status (lihat updateSummary), jadi filter Lembur mengecek is_overtime,
 *     bukan status field.
 *   - Tombol "Unduh Laporan" men-generate CSV dari data bulan berjalan yang
 *     SUDAH ter-fetch (tidak ada endpoint baru) — konsisten dengan pola
 *     "Export CSV" yang sudah ada di manager (corrections.py), tapi ini
 *     murni client-side karena datanya sudah di tangan.
 *   - Kartu mobile: ikon panah dibungkus lingkaran berwarna (bukan svg
 *     polos), baris kedua "Hari · Nama Shift" sebagai teks meta (bukan
 *     chip terpisah), badge status pill solid tetap di kanan atas.
 */

(function () {
  "use strict";

  const I18N = window.I18N || {};

  // ── State ─────────────────────────────────────────────────
  const state = {
    year: parseInt(
      document.getElementById("hist-year")?.value || new Date().getFullYear(),
    ),
    month: parseInt(
      document.getElementById("hist-month")?.value || new Date().getMonth() + 1,
    ),
    filter: "all",
    shiftFilter: "all",
    query: "",
    data: [],
    loading: false,
  };

  // ── Element refs ──────────────────────────────────────────
  const monthLabel = document.getElementById("hist-month-label");
  const listEl = document.getElementById("hist-list");
  const tableBody = document.getElementById("hist-table-body");
  const searchInput = document.getElementById("hist-search");
  const shiftDropdown = document.getElementById("hist-shift-dropdown");
  const shiftBtn = document.getElementById("hist-shift-filter-btn");
  const shiftLabel = document.getElementById("hist-shift-filter-label");
  const shiftMenu = document.getElementById("hist-shift-menu");
  const downloadBtn = document.getElementById("hist-download-btn");
  const summaryEls = {
    present: document.getElementById("hist-sum-present"),
    overtime: document.getElementById("hist-sum-overtime"),
    late: document.getElementById("hist-sum-late"),
    sick: document.getElementById("hist-sum-sick"),
    extoff: document.getElementById("hist-sum-extoff"),
    absent: document.getElementById("hist-sum-absent"),
    dayoff: document.getElementById("hist-sum-dayoff"),
  };
  const noteEls = {
    present: document.getElementById("hist-note-present"),
    overtime: document.getElementById("hist-note-overtime"),
    late: document.getElementById("hist-note-late"),
    sick: document.getElementById("hist-note-sick"),
    extoff: document.getElementById("hist-note-extoff"),
    absent: document.getElementById("hist-note-absent"),
    dayoff: document.getElementById("hist-note-dayoff"),
  };
  const filterBtns = document.querySelectorAll(".hsf-btn");

  const MONTHS = I18N.histMonths || [
    "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  ];
  const DAYS = I18N.histDays || [
    "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu",
  ];

  // ── Status config ─────────────────────────────────────────
  const STATUS = {
    present: { label: I18N.histStatusPresent || "Hadir", dot: "hdot-present", badge: "hbadge-present", card: "s-present" },
    late: { label: I18N.histStatusLate || "Terlambat", dot: "hdot-late", badge: "hbadge-late", card: "s-late" },
    absent: { label: I18N.histStatusAbsent || "Alpa", dot: "hdot-absent", badge: "hbadge-absent", card: "s-absent" },
    day_off: { label: I18N.histStatusDayOff || "Libur", dot: "hdot-dayoff", badge: "hbadge-day-off", card: "s-day-off" },
    extra_off: { label: I18N.histStatusExtraOff || "Izin", dot: "hdot-extoff", badge: "hbadge-extra-off", card: "s-extra-off" },
    sick: { label: I18N.histStatusSick || "Sakit", dot: "hdot-sick", badge: "hbadge-sick", card: "s-sick" },
    remote: { label: I18N.histStatusRemote || "Remote", dot: "hdot-dayoff", badge: "hbadge-day-off", card: "s-day-off" },
  };

  // ── Format helpers ────────────────────────────────────────
  function fmtDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return {
      day: d.getDate(),
      month: MONTHS[d.getMonth() + 1],
      dayName: DAYS[d.getDay()],
      full: DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth() + 1],
    };
  }

  function fmtDuration(minutes) {
    if (!minutes) return "—";
    return Math.floor(minutes / 60) + "j " + (minutes % 60) + "m";
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  // ── Update summary cards ──────────────────────────────────
  // [HISTORY-CARD-SPLIT] 7 card terpisah: Hadir, Lembur, Terlambat, Sakit,
  // Izin, Alpa, Libur. Lembur dihitung dari is_overtime (independen dari
  // status — baris lembur bisa berstatus present ATAU remote), BUKAN
  // exclusive dengan Hadir: satu hari dengan baris lembur tetap dihitung
  // Hadir (dari baris reguler, jika ada) DAN Lembur (dari baris overtime).
  function updateSummary(data) {
    const counts = { present: 0, overtime: 0, late: 0, sick: 0, extoff: 0, absent: 0, dayoff: 0 };
    let lateMinutes = 0;
    data.forEach((r) => {
      if (r.is_overtime) {
        counts.overtime++;
      } else {
        if (r.status === "present") counts.present++;
        else if (r.status === "late") counts.late++;
        else if (r.status === "absent") counts.absent++;
        else if (r.status === "sick") counts.sick++;
        else if (r.status === "extra_off") counts.extoff++;
        else if (r.status === "day_off" || r.status === "remote") counts.dayoff++;
      }
      if (r.late_minutes > 0) lateMinutes += r.late_minutes;
    });
    if (summaryEls.present) summaryEls.present.textContent = counts.present;
    if (summaryEls.overtime) summaryEls.overtime.textContent = counts.overtime;
    if (summaryEls.late) summaryEls.late.textContent = counts.late;
    if (summaryEls.sick) summaryEls.sick.textContent = counts.sick;
    if (summaryEls.extoff) summaryEls.extoff.textContent = counts.extoff;
    if (summaryEls.absent) summaryEls.absent.textContent = counts.absent;
    if (summaryEls.dayoff) summaryEls.dayoff.textContent = counts.dayoff;

    // Sublabel kosmetik — turunan dari angka yang sudah dihitung di atas,
    // tidak ada logika baru.
    setNote(noteEls.present, counts.late === 0 && counts.present > 0 ? "Prima" : "");
    setNote(noteEls.overtime, counts.overtime > 0 ? counts.overtime + " hari tercatat" : "0 hari tercatat");
    setNote(noteEls.late, lateMinutes > 0 ? "Total +" + lateMinutes + " mnt" : "Nihil");
    setNote(noteEls.sick, counts.sick === 0 ? "Nihil" : "");
    setNote(noteEls.extoff, counts.extoff === 0 ? "Nihil" : "");
    setNote(noteEls.absent, counts.absent > 0 ? "Perhatian" : "Nihil");
    setNote(noteEls.dayoff, "Weekend / Libur");
  }

  function setNote(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  // ── Populate dropdown filter shift dari data bulan berjalan ──
  function populateShiftOptions(data) {
    if (!shiftMenu) return;
    const seen = new Map();
    data.forEach((r) => {
      if (r.shift_type && !seen.has(r.shift_type)) {
        seen.set(r.shift_type, r.shift_label || r.shift_type);
      }
    });
    const current = seen.has(state.shiftFilter) ? state.shiftFilter : "all";
    state.shiftFilter = current;

    const allLabel = I18N.histAllShifts || "Semua Shift";
    const items = [{ value: "all", label: allLabel }].concat(
      Array.from(seen.entries()).map(([value, label]) => ({ value, label })),
    );
    shiftMenu.innerHTML = items
      .map(
        (it) =>
          '<li role="option" data-value="' + escapeHtml(it.value) + '" class="' +
          (it.value === current ? "active" : "") + '">' + escapeHtml(it.label) + "</li>",
      )
      .join("");
    if (shiftLabel) {
      const activeItem = items.find((it) => it.value === current);
      shiftLabel.textContent = activeItem ? activeItem.label : allLabel;
    }
  }

  // ── Filter data ───────────────────────────────────────────
  function filteredData() {
    let rows = state.data;

    if (state.filter === "overtime") {
      rows = rows.filter((r) => r.is_overtime);
    } else if (state.filter !== "all") {
      const map = { present: ["present"], late: ["late"], absent: ["absent"], sick: ["sick"], extoff: ["extra_off"], dayoff: ["day_off", "remote"] };
      const allowed = map[state.filter] || [];
      rows = rows.filter((r) => allowed.includes(r.status));
    }

    if (state.shiftFilter !== "all") {
      rows = rows.filter((r) => r.shift_type === state.shiftFilter);
    }

    if (state.query) {
      const q = state.query.toLowerCase();
      rows = rows.filter((r) => {
        const dt = fmtDate(r.work_date);
        const haystack = [dt.full, r.shift_label, r.note, r.office, STATUS[r.status] ? STATUS[r.status].label : r.status]
          .filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }

    return rows;
  }

  // ── Render mobile card list ───────────────────────────────
  function renderCards(data) {
    if (!listEl) return;
    if (data.length === 0) {
      listEl.innerHTML = emptyHTML();
      return;
    }

    listEl.innerHTML = data
      .map((r) => {
        const s = STATUS[r.status] || STATUS.absent;
        const dt = fmtDate(r.work_date);
        const hasDetail = r.office || r.note || r.source;

        const lateHTML = r.late_minutes > 0
          ? '<span class="hist-late-inline">+' + r.late_minutes + "m</span>"
          : "";

        const metaLine = dt.dayName + (r.shift_label ? " • " + escapeHtml(r.shift_label) : "");

        const detailHTML = hasDetail
          ? '<div class="hist-card-detail" id="det-' + r.id + '">' +
            (r.source ? '<div class="hcd-row"><span>Sumber</span><span>' + fmtSource(r.source) + "</span></div>" : "") +
            (r.note ? '<div class="hcd-note">' + escapeHtml(r.note) + "</div>" : "") +
            "</div>"
          : "";

        const inLateCls = r.late_minutes > 0 ? " hist-time-box-val--late" : "";
        return (
          '<div class="hist-card ' + s.card + '" onclick="toggleDetail(\'' + r.id + "')\">" +
          '<div class="hist-card-top">' +
            '<div class="hist-card-date-block">' +
              '<span class="hcd-cal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>' +
              '<div class="hist-card-date">' + dt.day + " " + dt.month + " " + new Date(r.work_date + "T00:00:00").getFullYear() + "</div>" +
              '<div class="hist-card-meta">' + metaLine + "</div>" +
            "</div>" +
            '<span class="hbadge ' + s.badge + '">' + s.label + lateHTML + "</span>" +
          "</div>" +
          '<div class="hist-card-times">' +
            '<div class="hist-time-box hist-time-box--in">' +
              '<span class="hist-time-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></span>' +
              '<div class="hist-time-box-meta"><span class="hist-time-box-lbl">Jam Masuk</span><span class="hist-time-box-val' + inLateCls + '">' + (r.check_in_at || "—") + "</span></div>" +
            "</div>" +
            '<div class="hist-time-box hist-time-box--out">' +
              '<span class="hist-time-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></span>' +
              '<div class="hist-time-box-meta"><span class="hist-time-box-lbl">Jam Keluar</span><span class="hist-time-box-val">' + (r.check_out_at || "—") + "</span></div>" +
            "</div>" +
          "</div>" +
          '<div class="hist-card-foot">' +
            '<span class="hist-card-foot-item hist-card-foot-dur"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/></svg>' + fmtDuration(r.working_minutes) + "</span>" +
            (r.office ? '<span class="hist-card-foot-item hist-card-foot-office"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="1.5"/><line x1="9" y1="7" x2="9" y2="7.01"/><line x1="15" y1="7" x2="15" y2="7.01"/><line x1="9" y1="11" x2="9" y2="11.01"/><line x1="15" y1="11" x2="15" y2="11.01"/><path d="M10 22v-4h4v4"/></svg><span>' + escapeHtml(r.office) + '</span></span><svg class="hist-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' : "") +
          "</div>" +
          detailHTML +
          "</div>"
        );
      })
      .join("");
  }

  // ── Render desktop table ──────────────────────────────────
  function renderTable(data) {
    if (!tableBody) return;
    if (data.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-faint);font-size:.85rem">' +
        (I18N.histNoDataTable || "Tidak ada data untuk ditampilkan") + "</td></tr>";
      return;
    }
    tableBody.innerHTML = data
      .map((r) => {
        const s = STATUS[r.status] || STATUS.absent;
        const dt = fmtDate(r.work_date);
        const lateHTML = r.late_minutes > 0
          ? ' <span class="hist-late-badge">+' + r.late_minutes + " mnt</span>"
          : "";
        const shiftHTML = r.shift_label
          ? '<span class="htd-shift"><span class="hdot shift-chip--' + escapeHtml(r.shift_type || "") + '"></span>' + escapeHtml(r.shift_label) + "</span>"
          : '<span class="htd-mono empty">—</span>';
        return (
          "<tr>" +
          '<td class="htd-date">' + dt.day + " " + dt.month + '<span class="htd-day">' + dt.dayName + "</span></td>" +
          '<td><span class="htd-status ' + s.badge + '"><span class="hdot ' + s.dot + '"></span>' + s.label + "</span></td>" +
          "<td>" + shiftHTML + "</td>" +
          '<td class="htd-mono ' + (r.check_in_at ? "" : "empty") + '">' + (r.check_in_at || "—") + lateHTML + "</td>" +
          '<td class="htd-mono ' + (r.check_out_at ? "" : "empty") + '">' + (r.check_out_at || "—") + "</td>" +
          '<td class="htd-dur"><span class="htd-dur-inner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>' + fmtDuration(r.working_minutes) + "</span></span></td>" +
          '<td class="htd-office">' + (r.office ? '<span class="htd-office-inner"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg><span>' + escapeHtml(r.office) + "</span></span>" : "—") + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  // ── Empty & skeleton HTML ─────────────────────────────────
  function emptyHTML() {
    return (
      '<div class="hist-empty">' +
      '<svg class="hist-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' +
      '<div class="hist-empty-title">' + (I18N.histNoData || "Tidak ada data") + "</div>" +
      '<div class="hist-empty-sub">' + (I18N.histNoAttendance || "Belum ada catatan kehadiran untuk bulan ini") + "</div>" +
      "</div>"
    );
  }

  function showSkeleton() {
    if (!listEl) return;
    listEl.innerHTML = '<div class="hist-skeleton">' + Array(5).fill('<div class="skel-row"></div>').join("") + "</div>";
    if (tableBody) {
      tableBody.innerHTML = Array(5)
        .fill("<tr>" + Array(7).fill('<td><div class="skel-row" style="height:14px;border-radius:4px"></div></td>').join("") + "</tr>")
        .join("");
    }
  }

  // ── Fetch data dari server ────────────────────────────────
  function loadData() {
    if (state.loading) return;
    state.loading = true;
    showSkeleton();

    fetch("/employee/history/data?year=" + state.year + "&month=" + state.month, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((data) => {
        state.data = data.records || [];
        state.loading = false;
        updateSummary(state.data);
        populateShiftOptions(state.data);
        renderView();
      })
      .catch((err) => {
        console.error("History fetch error:", err);
        state.loading = false;
        state.data = [];
        if (listEl) listEl.innerHTML = emptyHTML();
        if (tableBody) tableBody.innerHTML = "";
      });
  }

  function renderView() {
    const data = filteredData();
    renderCards(data);
    renderTable(data);
  }

  function updateMonthLabel() {
    if (monthLabel) monthLabel.textContent = MONTHS[state.month] + " " + state.year;
  }

  // ── Month navigation ──────────────────────────────────────
  window.prevMonth = function () {
    state.month--;
    if (state.month < 1) { state.month = 12; state.year--; }
    updateMonthLabel();
    loadData();
  };

  window.nextMonth = function () {
    const now = new Date();
    if (state.year === now.getFullYear() && state.month >= now.getMonth() + 1) return;
    state.month++;
    if (state.month > 12) { state.month = 1; state.year++; }
    updateMonthLabel();
    loadData();
  };

  window.setFilter = function (btn, filter) {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.filter = filter;
    renderView();
  };

  window.toggleDetail = function (id) {
    const el = document.getElementById("det-" + id);
    if (el) el.classList.toggle("open");
  };

  function fmtSource(src) {
    const map = {
      gps: I18N.histSrcGps || "GPS",
      manual: I18N.histSrcManual || "Manual",
      correction: I18N.histSrcCorrection || "Dikoreksi",
      system: I18N.histSrcSystem || "Sistem",
    };
    return map[src] || src;
  }

  // ── Unduh laporan (CSV client-side dari data yang sudah difilter) ──
  function downloadCsv() {
    const rows = filteredData();
    const header = ["Tanggal", "Hari", "Status", "Shift", "Jam Masuk", "Jam Keluar", "Durasi (menit)", "Kantor"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
      const dt = fmtDate(r.work_date);
      const s = STATUS[r.status] || STATUS.absent;
      const cells = [
        r.work_date,
        dt.dayName,
        s.label,
        r.shift_label || "",
        r.check_in_at || "",
        r.check_out_at || "",
        r.working_minutes || 0,
        r.office || "",
      ].map((v) => '"' + String(v).replace(/"/g, '""') + '"');
      lines.push(cells.join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "riwayat-kehadiran-" + state.year + "-" + String(state.month).padStart(2, "0") + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  if (downloadBtn) downloadBtn.addEventListener("click", downloadCsv);

  // ── Search & shift filter wiring ──────────────────────────
  let searchDebounce = null;
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.query = searchInput.value.trim();
        renderView();
      }, 150);
    });
  }
  if (shiftBtn && shiftMenu && shiftDropdown) {
    shiftBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = shiftDropdown.classList.toggle("open");
      shiftBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    shiftMenu.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-value]");
      if (!li) return;
      state.shiftFilter = li.dataset.value;
      shiftMenu.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
      li.classList.add("active");
      if (shiftLabel) shiftLabel.textContent = li.textContent;
      shiftDropdown.classList.remove("open");
      shiftBtn.setAttribute("aria-expanded", "false");
      renderView();
    });
    document.addEventListener("click", (e) => {
      if (!shiftDropdown.contains(e.target)) {
        shiftDropdown.classList.remove("open");
        shiftBtn.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        shiftDropdown.classList.remove("open");
        shiftBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  updateMonthLabel();
  loadData();
})();