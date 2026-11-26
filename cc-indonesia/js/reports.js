/**
 * reports.js — Laporan Kehadiran (Redesign)
 *
 * Perubahan utama:
 *   - Unified section: 4 tab (Heatmap, Log, Harian, Rekap)
 *   - Heatmap: search/filter terintegrasi (filter row .hm-row)
 *   - Log: accordion per karyawan dengan pagination
 *   - Harian: pivot table — baris=karyawan, kolom=tanggal
 *   - Rekap: sudah di HTML, filter JS + export CSV (include bank)
 *   - Export: context-aware ke tab aktif
 */

(function () {
  "use strict";

  const I18N = window.I18N || {};

  // ─── Konstanta ──────────────────────────────────────────────────────────────
  var PAGE_SIZE = 10;
  var DAY_FULL = I18N.rptDays || [
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
    "Minggu",
  ];

  var STATUS_LABEL = {
    present: I18N.rptStatusPresent || "Hadir",
    late: I18N.rptStatusLate || "Terlambat",
    absent: I18N.rptStatusAbsent || "Tidak Hadir",
    day_off: I18N.rptStatusDayOff || "Libur",
    extra_off: I18N.rptStatusExtraOff || "Izin",
    sick: I18N.rptStatusSick || "Sakit",
    remote: I18N.rptStatusRemote || "Remote",
  };
  var STATUS_CLS = {
    present: "s-present",
    late: "s-late",
    absent: "s-absent",
    day_off: "s-dayoff",
    extra_off: "s-extoff",
    sick: "s-sick",
    remote: "s-remote",
  };
  var SOURCE_LABEL = {
    gps: I18N.rptSrcGps || "GPS",
    correction: I18N.rptSrcCorrection || "Koreksi",
    manual: I18N.rptSrcManual || "Manual",
  };
  // [REPORT-OVERTIME FIX] Label kategori lembur — sinkron dengan
  // AttendanceLog.overtime_reason_label di models.py.
  var OT_REASON_LABEL = {
    extra_shift: I18N.rptOtExtraShift || "Shift Tambahan",
    day_off_work: I18N.rptOtDayOffWork || "Kerja Hari Libur Mingguan",
    holiday_work: I18N.rptOtHolidayWork || "Kerja di Hari Libur",
  };

  // [REPORT-SHIFT-FILTER FIX] Nilai filter shift sekarang bisa berupa:
  //   ""                     → semua
  //   "grp_..."              → group_key dari SHIFT_GROUP_MAP (dropdown
  //                            sekarang menampilkan grup shift generik,
  //                            mis. "Shift 2", bukan per shift_type mentah
  //                            per departemen — lihat _build_shift_group_map()
  //                            di services/shifts.py) — cocok jika lg.shift_type ada
  //                            di daftar shift_types anggota grup tsb.
  //   "__overtime__"         → semua log is_overtime=true, apa pun kategorinya
  //   "__ot_<reason>__"      → log is_overtime=true DENGAN overtime_reason tsb
  // Satu fungsi dipakai di semua tempat (applyFilters/updateCount/
  // filterHeatmap/filterRekap/buildLogTable/renderDailyPanel) supaya
  // definisinya konsisten di seluruh view.
  var SHIFT_GROUP_MAP = window.SHIFT_GROUP_MAP || {};
  function logMatchesShiftFilter(lg, filterVal) {
    if (!filterVal) return true;
    if (filterVal === "__overtime__") return !!lg.is_overtime;
    if (filterVal.indexOf("__ot_") === 0) {
      var reason = filterVal.slice(5, -2); // strip "__ot_" prefix dan "__" suffix
      return !!lg.is_overtime && lg.overtime_reason === reason;
    }
    var group = SHIFT_GROUP_MAP[filterVal];
    if (group) return group.indexOf(lg.shift_type) !== -1;
    // Fallback: filterVal bukan grup dikenal (data lama/edge-case) — cocokkan
    // langsung sebagai shift_type persis, perilaku sebelumnya.
    return lg.shift_type === filterVal;
  }

  // ─── State ──────────────────────────────────────────────────────────────────
  var allData = [],
    filtered = [],
    currentPage = 0,
    openCards = {};
  var searchQ = "",
    filterSt = "",
    filterShift = "";
  var activeTab = "heatmap"; // heatmap | log | daily | rekap

  // ─── DOM refs ───────────────────────────────────────────────────────────────
  var elLogRoot = document.getElementById("log-list-root");
  var elDailyRoot = document.getElementById("daily-list-root");
  var elLoading = document.getElementById("log-loading");
  var elCount = document.getElementById("log-count");
  var elPagination = document.getElementById("log-pagination");
  var elPageInfo = document.getElementById("log-page-info");
  var elPrev = document.getElementById("log-prev");
  var elNext = document.getElementById("log-next");
  var elSearch = document.getElementById("log-search");
  var elFilterSt = document.getElementById("log-filter-status");
  var elFilterShift = document.getElementById("log-filter-shift");
  var dateFrom = document.getElementById("dateFrom");
  var dateTo = document.getElementById("dateTo");

  // Tab buttons
  var tabBtns = {
    heatmap: document.getElementById("tab-heatmap"),
    log: document.getElementById("tab-log"),
    daily: document.getElementById("tab-daily"),
    rekap: document.getElementById("tab-rekap"),
  };
  // Panels
  var panels = {
    heatmap: document.getElementById("panel-heatmap"),
    log: document.getElementById("panel-log"),
    daily: document.getElementById("panel-daily"),
    rekap: document.getElementById("panel-rekap"),
  };

  var elTitleText = document.getElementById("unified-title-text");
  var elSubtitleText = document.getElementById("unified-subtitle-text");

  var btnExportTrigger = document.getElementById("btn-export-trigger");
  var elExportMenu = document.getElementById("export-menu");
  var btnExportLog = document.getElementById("btn-export-log");
  var btnExportDaily = document.getElementById("btn-export-daily");
  var btnExportRekap = document.getElementById("btn-export-rekap");

  // ─── Tab navigation ─────────────────────────────────────────────────────────
  var TAB_META = {
    heatmap: {
      title: function () {
        return I18N.tabTitleHeatmap || "Heatmap Kehadiran";
      },
      subtitle: function () {
        return (
          I18N.tabSubHeatmap ||
          "Pola kehadiran per orang per hari — hover untuk detail"
        );
      },
    },
    log: {
      title: function () {
        return I18N.tabTitleLog || "Log Absensi Per Karyawan";
      },
      subtitle: function () {
        return (
          I18N.tabSubLog ||
          "Rincian harian: jam masuk, keluar, durasi, sumber data"
        );
      },
    },
    daily: {
      title: function () {
        return I18N.tabTitleDaily || "Absensi Harian";
      },
      subtitle: function () {
        return I18N.tabSubDaily || "Tampilan pivot: setiap baris satu karyawan";
      },
    },
    rekap: {
      title: function () {
        return I18N.tabTitleRekap || "Rekap Kehadiran";
      },
      subtitle: function () {
        return I18N.tabSubRekap || "Ringkasan total + rekening bank karyawan";
      },
    },
  };

  function switchTab(name) {
    if (activeTab === name) return;
    activeTab = name;

    // Toggle tab buttons
    Object.keys(tabBtns).forEach(function (k) {
      var btn = tabBtns[k];
      if (!btn) return;
      var active = k === name;
      btn.classList.toggle("utab-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    // Toggle panels
    Object.keys(panels).forEach(function (k) {
      var p = panels[k];
      if (!p) return;
      p.hidden = k !== name;
    });

    // Update title/subtitle
    var meta = TAB_META[name];
    if (meta) {
      if (elTitleText) elTitleText.textContent = meta.title();
      if (elSubtitleText) elSubtitleText.textContent = meta.subtitle();
    }

    // Lazy-render log and daily
    if (name === "log") {
      if (elLoading && !allData.length) elLoading.hidden = false;
      applyFilters();
    }
    if (name === "daily") {
      renderDailyPanel();
    }

    // Apply per-tab filter
    if (name === "heatmap") filterHeatmap();
    if (name === "rekap") filterRekap();

    updateCount();
  }

  // Bind tab buttons
  Object.keys(tabBtns).forEach(function (k) {
    var btn = tabBtns[k];
    if (btn)
      btn.addEventListener("click", function () {
        switchTab(k);
      });
  });

  // ─── Load data ──────────────────────────────────────────────────────────────
  function loadData() {
    var tag = document.getElementById("rpt-log-data");
    if (!tag) {
      if (elLoading) elLoading.hidden = true;
      return;
    }
    try {
      allData = JSON.parse(tag.textContent);
    } catch (e) {
      allData = [];
      console.error("reports.js: gagal parse data log", e);
    }
    if (elLoading) elLoading.hidden = true;
    applyFilters();
  }

  // ─── Filter & search ────────────────────────────────────────────────────────
  function applyFilters() {
    var q = searchQ.toLowerCase().trim();
    filtered = allData.filter(function (emp) {
      if (
        q &&
        !emp.name.toLowerCase().includes(q) &&
        !emp.dept.toLowerCase().includes(q)
      )
        return false;
      if (filterSt) {
        var hasStatus = emp.logs.some(function (lg) {
          return lg.status === filterSt;
        });
        if (!hasStatus) return false;
      }
      if (filterShift) {
        var hasShift = emp.logs.some(function (lg) {
          return logMatchesShiftFilter(lg, filterShift);
        });
        if (!hasShift) return false;
      }
      return true;
    });
    currentPage = 0;

    // Apply to current panel
    if (activeTab === "log") renderLogView();
    if (activeTab === "daily") renderDailyPanel();
    if (activeTab === "heatmap") filterHeatmap();
    if (activeTab === "rekap") filterRekap();

    updateCount();
  }

  function updateCount() {
    if (!elCount) return;
    var total = filtered.reduce(function (acc, emp) {
      var logs = emp.logs;
      if (filterSt)
        logs = logs.filter(function (lg) {
          return lg.status === filterSt;
        });
      if (filterShift)
        logs = logs.filter(function (lg) {
          return logMatchesShiftFilter(lg, filterShift);
        });
      return acc + logs.length;
    }, 0);
    elCount.textContent = (I18N.rptCount || "{emp} karyawan · {total} log")
      .replace("{emp}", filtered.length)
      .replace("{total}", total);
  }

  // ─── HEATMAP FILTER ─────────────────────────────────────────────────────────
  function filterHeatmap() {
    var q = searchQ.toLowerCase().trim();
    // Build a set of visible emp ids from allData filtered by status/shift
    var visibleNames = null;
    if (filterSt || filterShift || q) {
      visibleNames = {};
      allData.forEach(function (emp) {
        var nameMatch =
          !q ||
          emp.name.toLowerCase().includes(q) ||
          emp.dept.toLowerCase().includes(q);
        if (!nameMatch) return;
        var hasStatus =
          !filterSt ||
          emp.logs.some(function (lg) {
            return lg.status === filterSt;
          });
        if (!hasStatus) return;
        var hasShift =
          !filterShift ||
          emp.logs.some(function (lg) {
            return logMatchesShiftFilter(lg, filterShift);
          });
        if (!hasShift) return;
        visibleNames[emp.name.toLowerCase()] = true;
      });
    }
    var rows = document.querySelectorAll(".hm-row");
    rows.forEach(function (tr) {
      var name = (tr.dataset.name || "").toLowerCase();
      var match = !visibleNames || visibleNames[name];
      tr.style.display = match ? "" : "none";
    });
  }

  // ─── VIEW: Log ──────────────────────────────────────────────────────────────
  function renderLogView() {
    if (!elLogRoot) return;
    // Hide loading indicator
    if (elLoading) elLoading.hidden = true;
    // Clear
    var old = elLogRoot.querySelectorAll(".log-emp-card");
    old.forEach(function (c) {
      c.parentNode.removeChild(c);
    });
    // Remove empty state
    var es = document.getElementById("log-empty-state");
    if (es) es.parentNode.removeChild(es);

    if (filtered.length === 0) {
      showEmpty(true, elLogRoot);
      updatePagination();
      return;
    }
    var start = currentPage * PAGE_SIZE;
    var slice = filtered.slice(start, start + PAGE_SIZE);
    var frag = document.createDocumentFragment();
    slice.forEach(function (emp) {
      frag.appendChild(buildCard(emp));
    });
    elLogRoot.appendChild(frag);
    updatePagination();
  }

  function buildCard(emp) {
    var isOpen = !!openCards[emp.id];
    var card = el("div", {
      className: "log-emp-card" + (isOpen ? " is-open" : ""),
    });
    var header = el("button", {
      type: "button",
      className: "log-emp-header",
      "aria-expanded": isOpen ? "true" : "false",
    });
    var avatar = el("div", { className: "log-avatar" });
    avatar.textContent = emp.initials;
    var info = el("div", { className: "log-emp-info" });
    var name = el("div", { className: "log-emp-name" });
    name.textContent = emp.name;
    var dept = el("div", { className: "log-emp-dept" });
    dept.textContent = emp.dept;
    info.appendChild(name);
    info.appendChild(dept);

    var badges = el("div", { className: "log-stat-badges" });
    // [REPORT-OT-PRESENT-BADGE] emp.stats.present hanya menghitung status
    // "present" dari log reguler (_summarize_logs() sengaja mengecualikan
    // log lembur dari tally harian, supaya "1 hari kerja + 1 lembur" tidak
    // terhitung 2 hari hadir untuk kebutuhan payroll/rate). Badge "H" di
    // kartu ini murni indikator ringkasan visual, jadi digabung dengan log
    // lembur yang statusnya present/remote — dihitung di sini saja dari
    // emp.logs, tanpa menyentuh emp.stats atau backend.
    var otPresentCount = emp.logs.filter(function (l) {
      return l.is_overtime && (l.status === "present" || l.status === "remote");
    }).length;
    var statValues = {
      present: (emp.stats.present || 0) + otPresentCount,
      late: emp.stats.late || 0,
      absent: emp.stats.absent || 0,
      sick: emp.stats.sick || 0,
      day_off: emp.stats.day_off || 0,
      extra_off: emp.stats.extra_off || 0,
      remote: emp.stats.remote || 0,
    };
    [
      { key: "present", label: "H", cls: "sb-present" },
      { key: "late", label: "TL", cls: "sb-late" },
      { key: "absent", label: "AB", cls: "sb-absent" },
      { key: "sick", label: "SK", cls: "sb-sick" },
      { key: "day_off", label: "LB", cls: "sb-dayoff" },
      { key: "extra_off", label: "IZ", cls: "sb-extoff" },
      { key: "remote", label: "RM", cls: "sb-remote" },
    ].forEach(function (def) {
      var v = statValues[def.key] || 0;
      if (!v) return;
      var b = el("span", { className: "log-stat-badge " + def.cls });
      b.textContent = def.label + " " + v;
      badges.appendChild(b);
    });

    // [REPORT-SHIFT-FILTER FIX] Hitung sinkron dengan logs yang benar2
    // dirender buildLogTable() — dulu hanya filterSt yang dipertimbangkan.
    var logLenSource = emp.logs;
    if (filterSt) {
      logLenSource = logLenSource.filter(function (l) {
        return l.status === filterSt;
      });
    }
    if (filterShift) {
      logLenSource = logLenSource.filter(function (l) {
        return logMatchesShiftFilter(l, filterShift);
      });
    }
    var logLen = logLenSource.length;
    var logCount = el("span", { className: "log-entry-count" });
    logCount.textContent = logLen + " log";
    var chevron = el("span", {
      className: "log-chevron",
      "aria-hidden": "true",
    });
    chevron.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M6 9l6 6 6-6"/></svg>';

    header.appendChild(avatar);
    header.appendChild(info);
    header.appendChild(badges);
    header.appendChild(logCount);
    header.appendChild(chevron);

    var body = el("div", { className: "log-emp-body" });
    body.hidden = !isOpen;
    body.appendChild(buildLogTable(emp));

    header.addEventListener("click", function () {
      var nowOpen = !openCards[emp.id];
      openCards[emp.id] = nowOpen;
      card.classList.toggle("is-open", nowOpen);
      body.hidden = !nowOpen;
      header.setAttribute("aria-expanded", nowOpen ? "true" : "false");
    });

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  function buildLogTable(emp) {
    // [REPORT-SHIFT-FILTER FIX] Sebelumnya filterShift hanya dipakai sebagai
    // gate "tampilkan karyawan ini atau tidak" di applyFilters() lalu SEMUA
    // log karyawan itu dirender di sini tanpa disaring lagi — akibatnya
    // memilih "Shift 2" tetap menampilkan histori Shift 1 minggu lalu untuk
    // karyawan yang minggu ini sudah pindah ke Shift 2. Filter shift
    // sekarang diterapkan juga di level log (sama seperti filterSt di atas),
    // konsisten dengan logMatchesShiftFilter() yang dipakai di semua tempat
    // lain (heatmap, panel Harian, CSV export).
    var logs = emp.logs;
    if (filterSt) {
      logs = logs.filter(function (l) {
        return l.status === filterSt;
      });
    }
    if (filterShift) {
      logs = logs.filter(function (l) {
        return logMatchesShiftFilter(l, filterShift);
      });
    }
    // [REPORT-OVERTIME FIX] Urutkan supaya log lembur muncul tepat setelah
    // log reguler di tanggal yang sama (bukan tercampur menurut urutan
    // asli dari server) — memudahkan pembacaan "ini reguler, ini
    // tambahannya", bukan terlihat sebagai 2 baris acak bertanggal sama.
    logs = logs.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.is_overtime ? 1 : 0) - (b.is_overtime ? 1 : 0);
    });
    var wrap = el("div", { className: "log-table-wrap" });
    var table = el("table", { className: "log-table" });
    var thead = el("thead");
    var htr = el("tr");
    [
      I18N.rptColDate || "Tanggal",
      I18N.rptColDay || "Hari",
      I18N.rptColDept || "Departemen",
      I18N.rptColShift || "Shift",
      I18N.rptColCheckIn || "Jam Masuk",
      I18N.rptColStatus || "Status",
      I18N.rptColCheckOut || "Jam Keluar",
      I18N.rptColDuration || "Durasi",
      I18N.rptColSource || "Sumber",
    ].forEach(function (h) {
      var th = el("th", { scope: "col" });
      th.textContent = h;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    var tbody = el("tbody");
    if (!logs.length) {
      var noRow = el("tr");
      var noTd = el("td", { colSpan: "9", className: "log-table-empty" });
      noTd.textContent = I18N.rptNoLog || "Tidak ada log.";
      noRow.appendChild(noTd);
      tbody.appendChild(noRow);
    } else {
      logs.forEach(function (lg) {
        // [REPORT-OVERTIME FIX] Baris lembur diberi kelas + badge kategori
        // terpisah dari badge status — dua log di tanggal yang sama kini
        // jelas dibedakan (reguler vs lembur + alasannya), bukan terlihat
        // seperti duplikat data.
        var tr = el("tr", {
          className: lg.is_overtime ? "log-tr-overtime" : "",
        });
        var d = new Date(lg.date + "T00:00:00");
        tr.appendChild(
          td(
            zeroPad(d.getDate()) +
              "/" +
              zeroPad(d.getMonth() + 1) +
              "/" +
              d.getFullYear(),
            "log-td-date",
          ),
        );
        tr.appendChild(td(DAY_FULL[lg.dow] || "", "log-td-day"));
        tr.appendChild(td(lg.dept || "—", lg.dept ? "log-td-dept" : "log-td-dash"));
        tr.appendChild(td(lg.shift_label || "—", lg.shift_label ? "log-td-shift" : "log-td-dash"));
        var ciTd = el("td", {
          className: lg.check_in ? "log-td-mono" : "log-td-dash",
        });
        ciTd.textContent = lg.check_in || "—";
        tr.appendChild(ciTd);
        var stTd = el("td");
        var badge = el("span", {
          className: "log-status-badge " + (STATUS_CLS[lg.status] || ""),
        });
        badge.textContent = STATUS_LABEL[lg.status] || lg.status;
        stTd.appendChild(badge);
        if (lg.is_overtime) {
          var otBadge = el("span", { className: "log-ot-badge" });
          otBadge.textContent =
            "🕒 " + (OT_REASON_LABEL[lg.overtime_reason] || "Lembur");
          stTd.appendChild(otBadge);
        }
        tr.appendChild(stTd);
        var coTd = el("td", {
          className: lg.check_out ? "log-td-mono" : "log-td-dash",
        });
        coTd.textContent = lg.check_out || "—";
        tr.appendChild(coTd);
        var durTd = el("td", { className: "log-td-mono" });
        if (lg.duration > 0) {
          var h2 = Math.floor(lg.duration / 60),
            m2 = lg.duration % 60;
          durTd.textContent = h2 + "j " + zeroPad(m2) + "m";
        } else {
          durTd.textContent = "—";
          durTd.className += " log-td-dash";
        }
        tr.appendChild(durTd);
        var srcTd = el("td", { className: "log-td-source" });
        if (lg.corrector) {
          var sw = el("span", { className: "log-src-correction" });
          sw.textContent = SOURCE_LABEL.correction;
          var sb = el("span", { className: "log-src-by" });
          sb.textContent = lg.corrector;
          srcTd.appendChild(sw);
          srcTd.appendChild(sb);
        } else {
          var ss = el("span", { className: "log-src-" + (lg.source || "gps") });
          ss.textContent =
            SOURCE_LABEL[lg.source] || lg.source || SOURCE_LABEL.gps;
          srcTd.appendChild(ss);
        }
        tr.appendChild(srcTd);
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  // ─── VIEW: Daily (pivot) ────────────────────────────────────────────────────
  function renderDailyPanel() {
    if (!elDailyRoot) return;
    elDailyRoot.innerHTML = "";

    if (!filtered.length) {
      showEmpty(true, elDailyRoot);
      return;
    }

    var dfVal = dateFrom ? dateFrom.value : "";
    var dtVal = dateTo ? dateTo.value : "";
    var allDates = [];

    if (dfVal && dtVal) {
      var cur = new Date(dfVal + "T00:00:00");
      var end = new Date(dtVal + "T00:00:00");
      while (cur <= end) {
        allDates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      var ds = {};
      filtered.forEach(function (e) {
        e.logs.forEach(function (lg) {
          ds[lg.date] = lg.dow;
        });
      });
      allDates = Object.keys(ds).sort();
    }

    // [REPORT-OVERTIME FIX] logIdx SEKARANG menyimpan ARRAY per (emp,tanggal),
    // bukan satu log tunggal — sebelumnya log kedua (mis. lembur) di tanggal
    // yang sama diam-diam MENIMPA log pertama di objek ini. Konsumen di bawah
    // (render awal + switchMode) memisahkan log reguler dari lembur saat
    // membaca array ini, alih-alih memilih satu log secara implisit.
    //
    // [REPORT-SHIFT-FILTER FIX] filterSt/filterShift sekarang diterapkan
    // di sini juga (per-log), bukan hanya sebagai gate employee-level di
    // applyFilters() — sebelumnya memilih "Shift 2" tetap menampilkan sel
    // Shift 1 minggu lalu untuk karyawan yang minggu ini sudah pindah shift.
    var logIdx = {};
    filtered.forEach(function (emp) {
      emp.logs.forEach(function (lg) {
        if (filterSt && lg.status !== filterSt) return;
        if (filterShift && !logMatchesShiftFilter(lg, filterShift)) return;
        var key = emp.id + "|" + lg.date;
        if (!logIdx[key]) logIdx[key] = [];
        logIdx[key].push(lg);
      });
    });

    // Pisahkan array [log, ...] jadi { regular: log|null, overtime: [log,...] }
    function splitDailyLogs(arr) {
      var regular = null;
      var overtime = [];
      (arr || []).forEach(function (lg) {
        if (lg.is_overtime) overtime.push(lg);
        else regular = lg;
      });
      return { regular: regular, overtime: overtime };
    }

    var showTime = true;
    var wrap = el("div", { className: "daily-view-wrap" });

    // Toggle time vs status
    var dHeader = el("div", { className: "daily-view-header" });
    var tWrap = el("div", { className: "daily-mode-toggle" });
    var btnTime = el("button", {
      type: "button",
      className: "dmt-btn dmt-active",
      "aria-pressed": "true",
    });
    btnTime.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> ' +
      (I18N.rptColCheckIn || "Jam Masuk");
    var btnSt = el("button", {
      type: "button",
      className: "dmt-btn",
      "aria-pressed": "false",
    });
    btnSt.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ' +
      (I18N.rptColStatus || "Status");
    tWrap.appendChild(btnTime);
    tWrap.appendChild(btnSt);
    dHeader.appendChild(tWrap);
    wrap.appendChild(dHeader);

    var tableWrap = el("div", { className: "daily-table-wrap" });
    var table = el("table", {
      className: "daily-table daily-table-transposed",
    });

    // Header
    var thead = el("thead"),
      htr = el("tr");
    var thName = el("th", { className: "dt-th-fixed", scope: "col" });
    thName.textContent = "Nama";
    htr.appendChild(thName);
    allDates.forEach(function (ds2) {
      var d = new Date(ds2 + "T00:00:00"),
        dow = (d.getDay() + 6) % 7,
        isWk = dow >= 5;
      var th = el("th", {
        className: "dt-th-emp" + (isWk ? " dt-th-weekend" : ""),
        scope: "col",
      });
      var dn = el("div", { className: "dt-date-num" });
      dn.textContent = zeroPad(d.getDate()) + "/" + zeroPad(d.getMonth() + 1);
      var dd2 = el("div", {
        className: "dt-date-day" + (isWk ? " dt-wkend-lbl" : ""),
      });
      dd2.textContent = (DAY_FULL[dow] || "").slice(0, 3);
      th.appendChild(dn);
      th.appendChild(dd2);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = el("tbody");
    filtered.forEach(function (emp) {
      var tr = el("tr");
      var ntd = el("td", { className: "dt-td-date" });
      var nd = el("div", { className: "dt-emp-name" });
      nd.textContent = emp.name;
      var dd3 = el("div", { className: "dt-emp-dept" });
      dd3.textContent = emp.dept;
      ntd.appendChild(nd);
      ntd.appendChild(dd3);
      tr.appendChild(ntd);
      allDates.forEach(function (ds3) {
        var d = new Date(ds3 + "T00:00:00"),
          dow = (d.getDay() + 6) % 7,
          isWk = dow >= 5;
        var tdCell = el("td", {
          className: "dt-td-emp" + (isWk ? " dt-td-weekend" : ""),
          "data-emp-id": emp.id,
          "data-date": ds3,
        });
        var lgArr = logIdx[emp.id + "|" + ds3] || null;
        if (lgArr && lgArr.length) {
          renderDailyCell(tdCell, splitDailyLogs(lgArr), showTime);
        } else {
          // No log → show neutral dot (scheduler would have added absent if it was a work day)
          var dot = el("span", { className: "dt-cell-wkend" });
          dot.textContent = "·";
          tdCell.appendChild(dot);
        }
        tr.appendChild(tdCell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);
    elDailyRoot.appendChild(wrap);

    function switchMode(toTime) {
      showTime = toTime;
      btnTime.classList.toggle("dmt-active", toTime);
      btnSt.classList.toggle("dmt-active", !toTime);
      btnTime.setAttribute("aria-pressed", toTime ? "true" : "false");
      btnSt.setAttribute("aria-pressed", toTime ? "false" : "true");
      var cells = table.querySelectorAll("td.dt-td-emp");
      cells.forEach(function (tc) {
        var empId = tc.dataset.empId;
        var ds4 = tc.dataset.date;
        var lgArr2 = empId && ds4 ? logIdx[empId + "|" + ds4] || null : null;
        tc.innerHTML = "";
        if (lgArr2 && lgArr2.length) {
          renderDailyCell(tc, splitDailyLogs(lgArr2), toTime);
        } else {
          var dot2 = el("span", { className: "dt-cell-wkend" });
          dot2.textContent = "·";
          tc.appendChild(dot2);
        }
      });
    }
    btnTime.addEventListener("click", function () {
      if (!showTime) switchMode(true);
    });
    btnSt.addEventListener("click", function () {
      if (showTime) switchMode(false);
    });
  }

  function renderDailyCellTime(tdCell, lg) {
    var cls = STATUS_CLS[lg.status] || "";
    if (lg.check_in) {
      var t = el("div", { className: "dt-cell-time " + cls });
      t.textContent = lg.check_in;
      tdCell.appendChild(t);
      if (lg.late_min > 0) {
        var lb = el("div", { className: "dt-cell-late" });
        lb.textContent = "+" + lg.late_min + "m";
        tdCell.appendChild(lb);
      }
    } else {
      var s = el("span", { className: "dt-cell-status " + cls });
      s.textContent = STATUS_LABEL[lg.status] || lg.status;
      tdCell.appendChild(s);
    }
  }
  function renderDailyCellStatus(tdCell, lg) {
    var cls = STATUS_CLS[lg.status] || "";
    var s = el("span", { className: "dt-cell-status " + cls });
    s.textContent = STATUS_LABEL[lg.status] || lg.status;
    tdCell.appendChild(s);
  }

  // [REPORT-OVERTIME FIX] Render satu sel pivot Harian dari HASIL SPLIT
  // (bukan satu log tunggal) — log reguler dirender seperti perilaku lama
  // persis (renderDailyCellTime/Status tidak diubah), lalu badge kecil
  // ditambahkan di bawahnya untuk tiap log lembur di tanggal yang sama.
  // Jika tidak ada log reguler tapi ADA lembur (mis. lembur di hari libur),
  // sel menampilkan badge lembur saja sebagai konten utamanya.
  function renderDailyCell(tdCell, group, showTimeMode) {
    if (group.regular) {
      if (showTimeMode) renderDailyCellTime(tdCell, group.regular);
      else renderDailyCellStatus(tdCell, group.regular);
    }
    if (group.overtime.length) {
      tdCell.classList.add("dt-td-has-ot");
      var otWrap = el("div", { className: "dt-cell-ot-wrap" });
      group.overtime.forEach(function (otlg) {
        var badge = el("span", {
          className: "dt-cell-ot-badge",
          title:
            "🕒 " +
            (OT_REASON_LABEL[otlg.overtime_reason] || "Lembur") +
            (otlg.check_in ? " · " + otlg.check_in : ""),
        });
        badge.textContent = showTimeMode && otlg.check_in ? otlg.check_in : "🕒";
        otWrap.appendChild(badge);
      });
      tdCell.appendChild(otWrap);
    }
    if (!group.regular && !group.overtime.length) {
      var dot = el("span", { className: "dt-cell-wkend" });
      dot.textContent = "·";
      tdCell.appendChild(dot);
    }
  }

  // ─── REKAP FILTER ───────────────────────────────────────────────────────────
  function filterRekap() {
    var q = searchQ.toLowerCase().trim();
    var hasFilter = !!(q || filterSt || filterShift);
    var visibleNames = null;
    if (hasFilter) {
      visibleNames = {};
      allData.forEach(function (emp) {
        var nMatch =
          !q ||
          emp.name.toLowerCase().includes(q) ||
          emp.dept.toLowerCase().includes(q);
        if (!nMatch) return;
        var sMatch =
          !filterSt ||
          emp.logs.some(function (lg) {
            return lg.status === filterSt;
          });
        if (!sMatch) return;
        var shMatch =
          !filterShift ||
          emp.logs.some(function (lg) {
            return logMatchesShiftFilter(lg, filterShift);
          });
        if (!shMatch) return;
        visibleNames[emp.name.toLowerCase()] = true;
      });
    }
    var rows = document.querySelectorAll(".rekap-tr[data-rekap-name]");
    rows.forEach(function (tr) {
      var name = (tr.dataset.rekapName || "").toLowerCase();
      tr.style.display = !visibleNames || visibleNames[name] ? "" : "none";
    });
    var tfoot = document.querySelector(".rekap-table tfoot");
    if (tfoot) tfoot.style.display = hasFilter ? "none" : "";
  }

  // ─── Pagination ─────────────────────────────────────────────────────────────
  function updatePagination() {
    if (!elPagination) return;
    var pages = Math.ceil(filtered.length / PAGE_SIZE);
    if (pages <= 1 || activeTab !== "log") {
      elPagination.hidden = true;
      return;
    }
    elPagination.hidden = false;
    var start = currentPage * PAGE_SIZE + 1;
    var end = Math.min((currentPage + 1) * PAGE_SIZE, filtered.length);
    if (elPageInfo)
      elPageInfo.textContent = (
        I18N.rptPagination || "{start}–{end} dari {total} karyawan"
      )
        .replace("{start}", start)
        .replace("{end}", end)
        .replace("{total}", filtered.length);
    if (elPrev) elPrev.disabled = currentPage === 0;
    if (elNext) elNext.disabled = currentPage >= pages - 1;
  }

  function showEmpty(show, root) {
    var existing = (root || document).getElementById("log-empty-state");
    if (show) {
      if (!existing) {
        var e = el("p", {
          id: "log-empty-state",
          className: "log-empty-state",
        });
        e.textContent = I18N.rptNoMatch || "Tidak ada karyawan yang cocok.";
        (root || document.body).appendChild(e);
      }
    } else {
      if (existing) existing.parentNode.removeChild(existing);
    }
  }

  // ─── CSV Exports ─────────────────────────────────────────────────────────────
  function exportCSVLog() {
    var headers = I18N.rptCsvHeadersLog || [
      "Nama",
      "Departemen",
      "Tanggal",
      "Hari",
      "Jam Masuk",
      "Menit Terlambat",
      "Status",
      "Jam Keluar",
      "Durasi (menit)",
      "Sumber",
      "Dikoreksi Oleh",
      "Lembur",
      "Kategori Lembur",
      "Departemen Saat Absen",
      "Shift",
    ];
    var rows = [headers];
    filtered.forEach(function (emp) {
      // [REPORT-SHIFT-FILTER FIX] filterShift ikut diterapkan di sini juga —
      // sebelumnya ekspor CSV Log membawa serta histori shift lain yang
      // seharusnya sudah tersaring saat filter shift dipilih.
      var logs = emp.logs;
      if (filterSt) {
        logs = logs.filter(function (l) {
          return l.status === filterSt;
        });
      }
      if (filterShift) {
        logs = logs.filter(function (l) {
          return logMatchesShiftFilter(l, filterShift);
        });
      }
      // [REPORT-OVERTIME FIX] Urutkan sama seperti buildLogTable() — log
      // lembur tepat setelah log reguler di tanggal yang sama.
      logs = logs.slice().sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.is_overtime ? 1 : 0) - (b.is_overtime ? 1 : 0);
      });
      logs.forEach(function (lg) {
        var d = new Date(lg.date + "T00:00:00");
        var date =
          zeroPad(d.getDate()) +
          "/" +
          zeroPad(d.getMonth() + 1) +
          "/" +
          d.getFullYear();
        rows.push([
          emp.name,
          emp.dept,
          date,
          DAY_FULL[lg.dow] || "",
          lg.check_in || "",
          lg.late_min || "",
          STATUS_LABEL[lg.status] || lg.status,
          lg.check_out || "",
          lg.duration || "",
          SOURCE_LABEL[lg.source] || lg.source || SOURCE_LABEL.gps,
          lg.corrector || "",
          // [REPORT-OVERTIME FIX] Kolom baru — supaya baris kedua di
          // tanggal yang sama tidak terlihat seperti duplikat data mentah.
          lg.is_overtime ? "Ya" : "",
          lg.is_overtime ? OT_REASON_LABEL[lg.overtime_reason] || "" : "",
          lg.dept || "",
          lg.shift_label || "",
        ]);
      });
    });
    downloadCSV(
      rows,
      (I18N.rptCsvFileLog || "log_absensi") + "_" + today() + ".csv",
    );
  }

  function exportCSVDaily() {
    // [REPORT-SHIFT-FILTER FIX] Sama seperti renderDailyPanel() — filterSt
    // dan filterShift diterapkan per-log di sini, bukan hanya sebagai gate
    // employee-level, supaya ekspor CSV Harian konsisten dengan apa yang
    // terlihat di pivot table saat filter aktif.
    function logMatchesActiveFilters(lg) {
      if (filterSt && lg.status !== filterSt) return false;
      if (filterShift && !logMatchesShiftFilter(lg, filterShift)) return false;
      return true;
    }
    var ds = {};
    filtered.forEach(function (e) {
      e.logs.forEach(function (lg) {
        if (!logMatchesActiveFilters(lg)) return;
        ds[lg.date] = lg.dow;
      });
    });
    var allDates = Object.keys(ds).sort();
    var headers = [
      I18N.rptColDate || "Tanggal",
      I18N.rptColDay || "Hari",
    ].concat(
      filtered.map(function (e) {
        return e.name;
      }),
    );
    var rows = [headers];
    allDates.forEach(function (ds2) {
      var d = new Date(ds2 + "T00:00:00");
      var row = [
        zeroPad(d.getDate()) +
          "/" +
          zeroPad(d.getMonth() + 1) +
          "/" +
          d.getFullYear(),
        DAY_FULL[ds[ds2]] || "",
      ];
      filtered.forEach(function (emp) {
        // [REPORT-OVERTIME FIX] Kumpulkan SEMUA log di tanggal ini (bukan
        // ambil yang pertama ketemu lalu berhenti) — log kedua (lembur)
        // dulu diam-diam hilang dari export karena loop break di log
        // pertama yang cocok tanggalnya.
        var regular = null;
        var otCount = 0;
        for (var i = 0; i < emp.logs.length; i++) {
          if (emp.logs[i].date === ds2 && logMatchesActiveFilters(emp.logs[i])) {
            if (emp.logs[i].is_overtime) otCount++;
            else regular = emp.logs[i];
          }
        }
        var cell = regular
          ? regular.check_in || STATUS_LABEL[regular.status] || regular.status
          : "";
        if (otCount > 0) {
          cell = (cell ? cell + " " : "") + "+" + otCount + " lembur";
        }
        row.push(cell);
      });
      rows.push(row);
    });
    rows.push([]);
    var sumRow = [I18N.rptCsvSummaryLabel || "RINGKASAN", ""];
    filtered.forEach(function (emp) {
      var s = emp.stats;
      var otHours = ((s.total_overtime_minutes || 0) / 60).toFixed(1);
      sumRow.push(
        "H:" +
          (s.present || 0) +
          " TL:" +
          (s.late || 0) +
          " AB:" +
          (s.absent || 0) +
          (s.total_overtime_shifts
            ? " LBR:" + s.total_overtime_shifts + "x/" + otHours + "j"
            : ""),
      );
    });
    rows.push(sumRow);
    downloadCSV(
      rows,
      (I18N.rptCsvFileDaily || "absensi_harian") + "_" + today() + ".csv",
    );
  }

  function exportCSVRekap() {
    /* Reads from DOM so visible-only rows are exported (respects search filter) */
    var headers = I18N.rptCsvHeadersRekap || [
      "Nama",
      "Departemen",
      "Hadir",
      "TL 1-10m",
      "TL 11-20m",
      "TL 21-30m",
      "TL >30m",
      "Terlambat Total",
      "Sakit",
      "Izin",
      "Alpha",
      "Libur Nasional",
      "Libur Bersama",
      "Libur Perusahaan",
      // [REPORT-OVERTIME FIX] 4 kolom baru — DOM index di bawah disesuaikan
      // (bergeser +4 mulai dari kolom % dan seterusnya).
      "Lembur Shift Tambahan",
      "Lembur Hari Libur Mingguan",
      "Lembur Hari Libur",
      "Lembur Total Jam",
      "%",
      "Bank",
      "No. Rekening",
      "Atas Nama",
    ];
    var csvRows = [headers];
    var rekapRows = document.querySelectorAll(".rekap-tr[data-rekap-name]");
    rekapRows.forEach(function (tr) {
      if (tr.style.display === "none") return;
      var cells = tr.querySelectorAll("td");
      if (cells.length < 16) return;
      var name = tr.dataset.rekapName || "";
      var dept = tr.dataset.rekapDept || "";
      /* Column indices in table (setelah kolom lembur ditambahkan):
         0=name, 1=hadir, 2=t1, 3=t2, 4=t3, 5=t4, 6=total_late,
         7=sakit, 8=izin, 9=alpha, 10=lib_nas, 11=lib_bers, 12=lib_perush,
         13=ot_extra, 14=ot_dayoff, 15=ot_holiday, 16=ot_hours,
         17=pct, 18=bank */
      function cellText(idx) {
        return cells[idx]
          ? cells[idx].textContent.trim().replace("–", "0")
          : "0";
      }
      var hadir = cellText(1);
      var tl1 = cellText(2);
      var tl2 = cellText(3);
      var tl3 = cellText(4);
      var tl4 = cellText(5);
      var tltot = cellText(6);
      var sakit = cellText(7);
      var izin = cellText(8);
      var alpha = cellText(9);
      var libN = cellText(10);
      var libB = cellText(11);
      var libP = cellText(12);
      var otExtra = cellText(13);
      var otDayoff = cellText(14);
      var otHoliday = cellText(15);
      var otHours = cellText(16);
      var pctEl = cells[17] ? cells[17].querySelector(".rekap-pct-val") : null;
      var pct = pctEl ? pctEl.textContent.trim() : cellText(17);
      /* Bank info */
      var bankCell = cells[18] || null;
      var bankEntries = bankCell
        ? bankCell.querySelectorAll(".bank-entry")
        : [];
      if (bankEntries.length > 0) {
        bankEntries.forEach(function (be, i) {
          var bankName =
            (be.querySelector(".bank-name") || {}).textContent || "";
          var bankNum =
            (be.querySelector(".bank-number") || {}).textContent || "";
          var bankHolder =
            (be.querySelector(".bank-holder") || {}).textContent || "";
          if (i === 0) {
            csvRows.push([
              name,
              dept,
              hadir,
              tl1,
              tl2,
              tl3,
              tl4,
              tltot,
              sakit,
              izin,
              alpha,
              libN,
              libB,
              libP,
              otExtra,
              otDayoff,
              otHoliday,
              otHours,
              pct,
              bankName,
              bankNum,
              bankHolder,
            ]);
          } else {
            csvRows.push([
              name,
              dept,
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              bankName,
              bankNum,
              bankHolder,
            ]);
          }
        });
      } else {
        csvRows.push([
          name,
          dept,
          hadir,
          tl1,
          tl2,
          tl3,
          tl4,
          tltot,
          sakit,
          izin,
          alpha,
          libN,
          libB,
          libP,
          otExtra,
          otDayoff,
          otHoliday,
          otHours,
          pct,
          "",
          "",
          "",
        ]);
      }
    });
    downloadCSV(
      csvRows,
      (I18N.rptCsvFileRekap || "rekap_kehadiran") + "_" + today() + ".csv",
    );
  }

  function downloadCSV(rows, filename) {
    var csv = rows
      .map(function (r) {
        return r
          .map(function (v) {
            return '"' + String(v).replace(/"/g, '""') + '"';
          })
          .join(",");
      })
      .join("\n");
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // ─── Toast notification ─────────────────────────────────────────────────────
  function showToast(message, type) {
    var toast = document.createElement("div");
    toast.className = "rp-toast rp-toast-" + (type || "success");
    toast.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      (type === "error"
        ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
        : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>') +
      "</svg><span>" +
      message +
      "</span>";
    document.body.appendChild(toast);
    // Animate in
    requestAnimationFrame(function () {
      toast.classList.add("rp-toast-show");
    });
    setTimeout(function () {
      toast.classList.remove("rp-toast-show");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2800);
  }

  // ─── Export dropdown ─────────────────────────────────────────────────────────
  if (btnExportTrigger) {
    btnExportTrigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = !elExportMenu.hidden;
      elExportMenu.hidden = isOpen;
      btnExportTrigger.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
  }
  document.addEventListener("click", function () {
    if (elExportMenu && !elExportMenu.hidden) {
      elExportMenu.hidden = true;
      if (btnExportTrigger)
        btnExportTrigger.setAttribute("aria-expanded", "false");
    }
  });
  if (btnExportLog)
    btnExportLog.addEventListener("click", function () {
      elExportMenu.hidden = true;
      btnExportTrigger &&
        btnExportTrigger.setAttribute("aria-expanded", "false");
      exportCSVLog();
      showToast("Log absensi berhasil diunduh", "success");
    });
  if (btnExportDaily)
    btnExportDaily.addEventListener("click", function () {
      elExportMenu.hidden = true;
      btnExportTrigger &&
        btnExportTrigger.setAttribute("aria-expanded", "false");
      exportCSVDaily();
      showToast("Format harian berhasil diunduh", "success");
    });
  if (btnExportRekap)
    btnExportRekap.addEventListener("click", function () {
      elExportMenu.hidden = true;
      btnExportTrigger &&
        btnExportTrigger.setAttribute("aria-expanded", "false");
      exportCSVRekap();
      showToast("Rekap + bank berhasil diunduh", "success");
    });

  // ─── Pagination buttons ──────────────────────────────────────────────────────
  if (elPrev)
    elPrev.addEventListener("click", function () {
      if (currentPage > 0) {
        currentPage--;
        renderLogView();
        scrollToSection();
      }
    });
  if (elNext)
    elNext.addEventListener("click", function () {
      var pages = Math.ceil(filtered.length / PAGE_SIZE);
      if (currentPage < pages - 1) {
        currentPage++;
        renderLogView();
        scrollToSection();
      }
    });
  function scrollToSection() {
    var sec = document.getElementById("section-unified");
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ─── Search & filter events ──────────────────────────────────────────────────
  if (elSearch) {
    var st;
    elSearch.addEventListener("input", function () {
      clearTimeout(st);
      var val = elSearch.value;
      st = setTimeout(function () {
        searchQ = val;
        applyFilters();
      }, 200);
    });
  }
  if (elFilterSt)
    elFilterSt.addEventListener("change", function () {
      filterSt = elFilterSt.value;
      applyFilters();
    });
  if (elFilterShift)
    elFilterShift.addEventListener("change", function () {
      filterShift = elFilterShift.value;
      applyFilters();
    });

  // ─── Quick-range pills ──────────────────────────────────────────────────────
  function toISO(dt) {
    var y = dt.getFullYear(),
      m = String(dt.getMonth() + 1).padStart(2, "0"),
      d = String(dt.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }
  function calcRange(range) {
    var now = new Date(),
      y = now.getFullYear(),
      mo = now.getMonth(),
      d = now.getDate();
    var dow = (now.getDay() + 6) % 7;
    var from, to;
    switch (range) {
      case "thisweek":
        from = new Date(y, mo, d - dow);
        to = new Date(y, mo, d - dow + 6);
        break;
      case "lastweek":
        from = new Date(y, mo, d - dow - 7);
        to = new Date(y, mo, d - dow - 1);
        break;
      case "thismonth":
        from = new Date(y, mo, 1);
        to = new Date(y, mo + 1, 0);
        break;
      case "lastmonth":
        from = new Date(y, mo - 1, 1);
        to = new Date(y, mo, 0);
        break;
      default:
        return null;
    }
    return { from: from, to: to };
  }
  document.querySelectorAll(".rp-qpill, .qr-pill").forEach(function (pill) {
    pill.addEventListener("click", function () {
      var r = calcRange(this.dataset.range);
      if (!r || !dateFrom || !dateTo) return;
      document.querySelectorAll(".rp-qpill, .qr-pill").forEach(function (p) {
        p.classList.remove("active");
      });
      this.classList.add("active");
      dateFrom.value = toISO(r.from);
      dateTo.value = toISO(r.to);
      dateTo.min = dateFrom.value;
      var mi = document.querySelector('input[name="month"]');
      if (mi) {
        mi.value =
          r.from.getFullYear() +
          "-" +
          String(r.from.getMonth() + 1).padStart(2, "0");
      }
      var form = dateFrom.closest("form");
      if (form) form.submit();
    });
  });
  if (dateFrom)
    dateFrom.addEventListener("change", function () {
      if (dateTo && dateTo.value && dateTo.value < dateFrom.value)
        dateTo.value = dateFrom.value;
      if (dateTo) dateTo.min = dateFrom.value;
    });

  // ─── DOM helpers ────────────────────────────────────────────────────────────
  function el(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs)
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") e.className = attrs[k];
        else if (k === "colSpan") e.colSpan = attrs[k];
        else e.setAttribute(k, attrs[k]);
      });
    return e;
  }
  function td(text, cls) {
    var e = document.createElement("td");
    if (cls) e.className = cls;
    e.textContent = text;
    return e;
  }
  function zeroPad(n) {
    return n < 10 ? "0" + n : String(n);
  }

  // ─── Heatmap JS Tooltip (fixed-position — tidak ter-clip overflow) ──────────
  (function () {
    var tip = document.createElement("div");
    tip.id = "hm-js-tip";
    tip.style.cssText = [
      "position:fixed",
      "z-index:9999",
      "pointer-events:none",
      "background:#1b2d3e",
      "color:#fff",
      "font-size:0.63rem",
      "font-family:'IBM Plex Sans',sans-serif",
      "line-height:1.7",
      "padding:8px 12px",
      "border-radius:6px",
      "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
      "white-space:pre",
      "min-width:120px",
      "display:none",
      "letter-spacing:0.01em",
    ].join(";");
    document.body.appendChild(tip);

    var GAP = 12; // jarak antara tip dan sel

    function showTip(e) {
      var cell = e.currentTarget;
      var text = cell.getAttribute("data-tip");
      if (!text) return;
      tip.textContent = text;
      tip.style.display = "block";
      positionTip(e);
    }
    function moveTip(e) {
      positionTip(e);
    }
    function hideTip() {
      tip.style.display = "none";
    }
    function positionTip(e) {
      var tw = tip.offsetWidth;
      var th = tip.offsetHeight;
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      // Coba tampilkan di atas kursor
      var x = e.clientX - tw / 2;
      var y = e.clientY - th - GAP;
      // Jika keluar atas → tampilkan di bawah
      if (y < 4) y = e.clientY + GAP;
      // Clamp horizontal
      if (x < 4) x = 4;
      if (x + tw > vw - 4) x = vw - tw - 4;
      // Clamp vertical bawah
      if (y + th > vh - 4) y = vh - th - 4;
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    }

    function bindTooltips() {
      document.querySelectorAll(".hm-cell[data-tip]").forEach(function (cell) {
        cell.addEventListener("mouseenter", showTip);
        cell.addEventListener("mousemove", moveTip);
        cell.addEventListener("mouseleave", hideTip);
      });
    }

    // Bind setelah DOM siap; re-bind jika heatmap di-filter/re-render
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bindTooltips);
    } else {
      bindTooltips();
    }
    // Expose untuk re-bind setelah filter
    window._hmBindTooltips = bindTooltips;
  })();

  // ─── Boot ───────────────────────────────────────────────────────────────────
  if (window.requestIdleCallback) requestIdleCallback(loadData);
  else setTimeout(loadData, 0);
})();