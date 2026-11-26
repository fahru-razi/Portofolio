/* ════════════════════════════════════════════════════════════════════
   KALENDER PERUSAHAAN — company_calendar.js
   Kalender bulanan + CRUD hari libur perusahaan + modal "Libur Karyawan"
   (penetapan libur individual untuk kasus efisiensi produksi).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var I18N = window.KAL_I18N || {};
  var CSRF_TOKEN = (function () {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : "";
  })();

  function fmt(str) {
    // fmt("Terpilih %(n)s dari %(total)s", {n:1, total:5})
    var args = arguments;
    return str.replace(/%\((\w+)\)s/g, function (_, key) {
      return args[1] && args[1][key] !== undefined ? args[1][key] : "";
    });
  }

  function jsonFetch(url, opts) {
    opts = opts || {};
    var headers = Object.assign(
      { "Content-Type": "application/json", "X-CSRFToken": CSRF_TOKEN },
      opts.headers || {},
    );
    return fetch(url, Object.assign({}, opts, { headers: headers })).then(
      function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            // Error domain server berbentuk {error:{code,message}}.
            if (data && data.error && data.error.message && !data.message)
              data.message = data.error.message;
            return { ok: res.ok, status: res.status, data: data };
          });
      },
    );
  }

  /* ════════════════════════════════════════════════════════════════
     TOAST
     ════════════════════════════════════════════════════════════════ */
  var flashWrap = document.querySelector(".flash-wrap");
  if (!flashWrap) {
    flashWrap = document.createElement("div");
    flashWrap.className = "flash-wrap";
    document.body.appendChild(flashWrap);
  }

  function toast(message, type) {
    type = type || "success";
    var el = document.createElement("div");
    el.className = "flash flash-" + type;
    var span = document.createElement("span");
    span.textContent = message;
    el.appendChild(span);
    var close = document.createElement("button");
    close.className = "flash-close";
    close.innerHTML = "&times;";
    close.setAttribute("aria-label", I18N.closeLabel || "Tutup");
    close.addEventListener("click", function () {
      el.remove();
    });
    el.appendChild(close);
    flashWrap.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 4500);
  }

  /* ════════════════════════════════════════════════════════════════
     STATE
     ════════════════════════════════════════════════════════════════ */
  var today = new Date(window.KAL_TODAY || Date.now());
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth(); // 0-indexed

  var dayoffs = Array.isArray(window.KAL_DAYOFFS)
    ? window.KAL_DAYOFFS.slice()
    : [];

  var monthSelect = document.getElementById("kalMonthSelect");
  var yearSelect = document.getElementById("kalYearSelect");
  var grid = document.getElementById("kalGrid");
  var upcomingList = document.getElementById("upcomingList");
  var popover = document.getElementById("kalPopover");
  var popoverAnchorCell = null;

  if (monthSelect) monthSelect.value = String(viewMonth);
  if (yearSelect) yearSelect.value = String(viewYear);

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }
  function isoDate(y, m, d) {
    return y + "-" + pad2(m + 1) + "-" + pad2(d);
  }
  function parseISO(s) {
    var parts = s.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function dayoffsByDate() {
    var map = {};
    dayoffs.forEach(function (d) {
      if (!map[d.date]) map[d.date] = [];
      map[d.date].push(d);
    });
    return map;
  }

  /* ════════════════════════════════════════════════════════════════
     BADGE: jumlah batch "Libur Karyawan" yang akan datang
     ════════════════════════════════════════════════════════════════ */
  var lkCountBadge = document.getElementById("lkCountBadge");
  function updateLkCountBadge() {
    if (!lkCountBadge) return;
    var todayIso = isoDate(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    var batchIds = {};
    dayoffs.forEach(function (d) {
      if (d.dayoff_type === "efisiensi" && d.date >= todayIso) {
        batchIds[d.batch_id] = true;
      }
    });
    var n = Object.keys(batchIds).length;
    lkCountBadge.textContent = String(n);
    lkCountBadge.hidden = n === 0;
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER: MONTH GRID
     ════════════════════════════════════════════════════════════════ */
  function renderCalendar() {
    if (!grid) return;
    grid.innerHTML = "";

    var byDate = dayoffsByDate();
    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startWeekday = firstOfMonth.getDay(); // 0=Min
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    var totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    var todayIso = isoDate(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    for (var i = 0; i < totalCells; i++) {
      let cell = document.createElement("div");
      let cellDate,
        isOutside = false;

      if (i < startWeekday) {
        var d1 = prevMonthDays - startWeekday + i + 1;
        var pm = viewMonth === 0 ? 11 : viewMonth - 1;
        var py = viewMonth === 0 ? viewYear - 1 : viewYear;
        cellDate = isoDate(py, pm, d1);
        isOutside = true;
        cell.className = "kal-day kal-day--outside";
        cell.innerHTML = '<span class="kal-day-num">' + d1 + "</span>";
      } else if (i < startWeekday + daysInMonth) {
        var dNum = i - startWeekday + 1;
        cellDate = isoDate(viewYear, viewMonth, dNum);
        cell.className = "kal-day";
        if (cellDate === todayIso) cell.className += " kal-day--today";

        var numSpan = document.createElement("span");
        numSpan.className = "kal-day-num";
        numSpan.textContent = dNum;
        cell.appendChild(numSpan);

        let events = byDate[cellDate] || [];
        if (events.length) {
          cell.classList.add("kal-day--clickable");
          var eventsWrap = document.createElement("div");
          eventsWrap.className = "kal-day-events";

          var maxShow = 2;
          events.slice(0, maxShow).forEach(function (ev) {
            var chip = document.createElement("div");
            var expired = parseISO(ev.date) < parseISO(todayIso);
            chip.className =
              "kal-event kal-event--" +
              (ev.dayoff_type || "perusahaan") +
              (expired ? " kal-event--expired" : "");
            chip.textContent = ev.name;
            chip.addEventListener("click", function (e) {
              e.stopPropagation();
              if (
                popover.classList.contains("is-visible") &&
                popoverAnchorCell === cell
              ) {
                hidePopover();
                return;
              }
              popoverAnchorCell = cell;
              showPopover(cellDate, events, chip);
            });
            eventsWrap.appendChild(chip);
          });

          if (events.length > maxShow) {
            var more = document.createElement("div");
            more.className = "kal-event kal-event--more";
            more.textContent = "+" + (events.length - maxShow) + " lainnya";
            more.addEventListener("click", function (e) {
              e.stopPropagation();
              if (
                popover.classList.contains("is-visible") &&
                popoverAnchorCell === cell
              ) {
                hidePopover();
                return;
              }
              popoverAnchorCell = cell;
              showPopover(cellDate, events, more);
            });
            eventsWrap.appendChild(more);
          }

          cell.appendChild(eventsWrap);
          cell.dataset.iso = cellDate;
          cell.addEventListener("click", function () {
            if (
              popover.classList.contains("is-visible") &&
              popoverAnchorCell === cell
            ) {
              hidePopover();
              return;
            }
            popoverAnchorCell = cell;
            showPopover(cellDate, events, cell);
          });
        }
      } else {
        var d2 = i - (startWeekday + daysInMonth) + 1;
        cell.className = "kal-day kal-day--outside";
        cell.innerHTML = '<span class="kal-day-num">' + d2 + "</span>";
      }

      grid.appendChild(cell);
    }

    renderUpcoming();
    updateLkCountBadge();
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER: UPCOMING PANEL
     ════════════════════════════════════════════════════════════════ */
  function renderUpcoming() {
    if (!upcomingList) return;
    upcomingList.innerHTML = "";

    var todayIso = isoDate(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    var monthPrefix =
      viewYear + "-" + (viewMonth + 1 < 10 ? "0" : "") + (viewMonth + 1);
    var upcoming = dayoffs
      .filter(function (d) {
        return d.date.substring(0, 7) === monthPrefix && d.date >= todayIso;
      })
      .sort(function (a, b) {
        return a.date < b.date ? -1 : 1;
      })
      .slice(0, 8);

    if (!upcoming.length) {
      var empty = document.createElement("div");
      empty.className = "kal-upcoming-empty";
      empty.textContent =
        I18N.noUpcomingMonth ||
        I18N.noUpcoming ||
        "Tidak ada libur pada bulan ini.";
      upcomingList.appendChild(empty);
      return;
    }

    upcoming.forEach(function (ev) {
      var type = ev.dayoff_type || "perusahaan";
      var evDate = parseISO(ev.date);
      var monthAbbr = (I18N.months[evDate.getMonth()] || "")
        .slice(0, 3)
        .toUpperCase();

      var item = document.createElement("div");
      item.className = "kal-upcoming-item";

      var datebox = document.createElement("div");
      datebox.className = "kal-upcoming-datebox datebox--" + type;
      var boxMonth = document.createElement("span");
      boxMonth.textContent = monthAbbr;
      var boxDay = document.createElement("span");
      boxDay.className = "kal-upcoming-datebox-day";
      boxDay.textContent = String(evDate.getDate());
      datebox.appendChild(boxMonth);
      datebox.appendChild(boxDay);

      var info = document.createElement("div");
      info.className = "kal-upcoming-info";
      var name = document.createElement("div");
      name.className = "kal-upcoming-name";
      name.textContent = ev.name;
      var sub = document.createElement("div");
      sub.className = "kal-upcoming-sub";
      sub.textContent = ev.date + " · " + ev.scope_label;
      info.appendChild(name);
      info.appendChild(sub);

      item.appendChild(datebox);
      item.appendChild(info);

      var isEfisiensi = type === "efisiensi";
      var canEdit = ev.editable !== false;

      if (isEfisiensi) {
        item.classList.add("kal-upcoming-item--clickable");
        item.addEventListener("click", function () {
          openLiburKaryawanDetail(ev);
        });
      }

      if (canEdit) {
        var actions = document.createElement("div");
        actions.className = "kal-upcoming-item-actions";

        var editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "kal-upcoming-item-btn";
        editBtn.setAttribute("aria-label", I18N.editLabel || "Edit");
        editBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        editBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openEditModal(ev);
        });

        var delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "kal-upcoming-item-btn is-danger";
        delBtn.setAttribute("aria-label", I18N.deleteLabel || "Hapus");
        delBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openDeleteModal(ev);
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        item.appendChild(actions);
      }

      upcomingList.appendChild(item);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     POPOVER
     ════════════════════════════════════════════════════════════════ */
  function formatPopoverDate(dateIso) {
    var p = dateIso.split("-");
    var months = I18N.months || [];
    var monthName = months[parseInt(p[1], 10) - 1] || "";
    return parseInt(p[2], 10) + " " + monthName + " " + p[0];
  }

  function showPopover(dateIso, events, anchorEl) {
    if (!popover) return;
    popover.innerHTML = "";
    popover.setAttribute("aria-hidden", "false");

    var dateEl = document.createElement("div");
    dateEl.className = "kal-popover-date";
    dateEl.textContent = formatPopoverDate(dateIso);
    popover.appendChild(dateEl);

    events.forEach(function (ev) {
      var row = document.createElement("div");
      row.className = "kal-popover-event";
      var dot = document.createElement("span");
      dot.className = "kal-popover-dot dot-" + (ev.dayoff_type || "perusahaan");
      var info = document.createElement("div");
      info.className = "kal-popover-info";
      var name = document.createElement("div");
      name.className = "kal-popover-name";
      name.textContent = ev.name;
      var sub = document.createElement("div");
      sub.className = "kal-popover-sub";
      sub.textContent = ev.scope_label + (ev.note ? " · " + ev.note : "");
      info.appendChild(name);
      info.appendChild(sub);
      row.appendChild(dot);
      row.appendChild(info);

      var expired =
        parseISO(ev.date) <
        parseISO(
          isoDate(today.getFullYear(), today.getMonth(), today.getDate()),
        );
      var canEdit = ev.editable !== false; // default true untuk CompanyDayOff biasa
      var isEfisiensi = ev.dayoff_type === "efisiensi";

      if (isEfisiensi) {
        // Klik baris (di luar tombol aksi) selalu membuka detail karyawan.
        row.classList.add("kal-popover-event--clickable");
        row.addEventListener("click", function () {
          openLiburKaryawanDetail(ev);
          hidePopover();
        });
      }

      if (!expired && canEdit) {
        // Belum lewat & bisa diedit → tampilkan aksi Edit/Hapus.
        // Berlaku sama untuk Libur Perusahaan maupun Libur Karyawan.
        var actions = document.createElement("div");
        actions.className = "kal-popover-actions";
        var editBtn = document.createElement("button");
        editBtn.className = "btn-edit-pop";
        editBtn.textContent = I18N.editLabel || "Edit";
        editBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openEditModal(ev);
          hidePopover();
        });
        var delBtn = document.createElement("button");
        delBtn.className = "btn-del-pop";
        delBtn.textContent = I18N.deleteLabel || "Hapus";
        delBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          openDeleteModal(ev);
          hidePopover();
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        row.appendChild(actions);
      } else {
        // Sudah lewat tanggal (atau memang tidak bisa diedit) → kunci,
        // tidak ada tombol Edit/Hapus, hanya notice.
        var lock = document.createElement("div");
        lock.className = "kal-popover-lock";
        lock.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>' +
          (I18N.expiredMsg ||
            "Tidak dapat diedit/dihapus — tanggal sudah lewat.") +
          "</span>";
        row.appendChild(lock);
      }

      popover.appendChild(row);
    });

    /* Ukur dimensi aktual popover (bukan angka tebakan) agar posisi presisi
       terhadap konten yang benar-benar dirender — jumlah event & panjang
       teks bisa berubah-ubah ukurannya. */
    popover.style.visibility = "hidden";
    popover.style.display = "block";
    var popW = popover.offsetWidth || 268;
    var popH = popover.offsetHeight || 160;
    popover.style.visibility = "";
    popover.style.display = "";

    var rect = anchorEl.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var left = rect.left;
    if (left + popW > vw - 8) left = vw - popW - 8;
    if (left < 8) left = 8;

    var topBelow = rect.bottom + 6;
    var topAbove = rect.top - popH - 6;
    var top = topBelow + popH > vh - 8 && topAbove > 8 ? topAbove : topBelow;
    if (top < 8) top = topBelow;

    popover.style.top = top + "px";
    popover.style.left = left + "px";
    popover.classList.add("is-visible");
  }

  function hidePopover() {
    if (!popover) return;
    popover.classList.remove("is-visible");
    popover.setAttribute("aria-hidden", "true");
    popoverAnchorCell = null;
  }

  document.addEventListener("click", function (e) {
    if (
      popover &&
      !popover.contains(e.target) &&
      !e.target.closest(".kal-day")
    ) {
      hidePopover();
    }
  });

  /* ════════════════════════════════════════════════════════════════
     NAV: month/year controls
     ════════════════════════════════════════════════════════════════ */
  var btnPrevMonth = document.getElementById("btnPrevMonth");
  var btnNextMonth = document.getElementById("btnNextMonth");

  /* Animasi masuk — hanya dijalankan oleh aksi user (ganti bulan, buka detail),
     bukan setiap render ulang (mis. setelah simpan data). Hanya transform &
     opacity; class dilepas lagi setelah selesai supaya tidak memutar ulang. */
  function playEnter(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // paksa reflow sekali agar animasi bisa diulang
    el.classList.add(cls);
    setTimeout(function () {
      el.classList.remove(cls);
    }, 600);
  }
  function goToMonth(y, m) {
    var dir = y * 12 + m - (viewYear * 12 + viewMonth);
    viewYear = y;
    viewMonth = m;
    syncNavSelects();
    renderCalendar();
    if (dir !== 0) {
      playEnter(grid, dir > 0 ? "kal-grid--next" : "kal-grid--prev");
      playEnter(upcomingList, "is-entering");
    }
  }

  if (btnPrevMonth) {
    btnPrevMonth.addEventListener("click", function () {
      goToMonth(viewMonth === 0 ? viewYear - 1 : viewYear, (viewMonth + 11) % 12);
    });
  }
  if (btnNextMonth) {
    btnNextMonth.addEventListener("click", function () {
      goToMonth(viewMonth === 11 ? viewYear + 1 : viewYear, (viewMonth + 1) % 12);
    });
  }
  function syncNavSelects() {
    if (monthSelect) monthSelect.value = String(viewMonth);
    if (yearSelect) yearSelect.value = String(viewYear);
  }
  if (monthSelect) {
    monthSelect.addEventListener("change", function () {
      goToMonth(viewYear, parseInt(monthSelect.value, 10));
    });
  }
  if (yearSelect) {
    yearSelect.addEventListener("change", function () {
      goToMonth(parseInt(yearSelect.value, 10), viewMonth);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     MODAL: Tambah Libur
     ════════════════════════════════════════════════════════════════ */
  var modalTambah = document.getElementById("modalTambah");
  var btnTambahLibur = document.getElementById("btnTambahLibur");
  var btnCloseTambah = document.getElementById("btnCloseTambah");
  var btnCancelTambah = document.getElementById("btnCancelTambah");
  var btnSubmitTambah = document.getElementById("btnSubmitTambah");
  var addDateInput = document.getElementById("addDateInput");
  var btnAddDate = document.getElementById("btnAddDate");
  var addDateTags = document.getElementById("addDateTags");
  var addDateCount = document.getElementById("addDateCount");
  var addDateEmpty = document.getElementById("addDateEmpty");
  var btnClearDates = document.getElementById("btnClearDates");
  var addOfficeWrap = document.getElementById("addOfficeWrap");

  var selectedDates = [];

  function openModal(overlay) {
    if (!overlay) return;
    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
  }
  function closeModal(overlay) {
    if (!overlay) return;
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
  }

  function resetTambahForm() {
    selectedDates = [];
    renderDateTags();
    var nameInput = document.getElementById("addName");
    var noteInput = document.getElementById("addNote");
    if (nameInput) nameInput.value = "";
    if (noteInput) noteInput.value = "";
    document
      .querySelectorAll('input[name="dayoff_type"]')
      .forEach(function (r) {
        r.checked = r.value === "perusahaan";
      });
    document.querySelectorAll('input[name="add_scope"]').forEach(function (r) {
      r.checked = r.value === "all";
    });
    if (addOfficeWrap) addOfficeWrap.hidden = true;
    document
      .querySelectorAll("#modalTambah .field-error")
      .forEach(function (e) {
        e.hidden = true;
      });
  }

  if (btnTambahLibur) {
    btnTambahLibur.addEventListener("click", function () {
      resetTambahForm();
      openModal(modalTambah);
    });
  }
  if (btnCloseTambah)
    btnCloseTambah.addEventListener("click", function () {
      closeModal(modalTambah);
    });
  if (btnCancelTambah)
    btnCancelTambah.addEventListener("click", function () {
      closeModal(modalTambah);
    });

  document
    .querySelectorAll('input[name="add_scope"]')
    .forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (addOfficeWrap)
          addOfficeWrap.hidden = radio.value !== "office" || !radio.checked;
      });
    });

  function renderDateTags() {
    if (!addDateTags) return;
    addDateTags.innerHTML = "";
    selectedDates.forEach(function (d) {
      var tag = document.createElement("span");
      tag.className = "dayoff-tag";
      tag.textContent = d;
      var rm = document.createElement("button");
      rm.type = "button";
      rm.className = "dayoff-tag-remove";
      rm.innerHTML = "&times;";
      rm.addEventListener("click", function () {
        selectedDates = selectedDates.filter(function (x) {
          return x !== d;
        });
        renderDateTags();
      });
      tag.appendChild(rm);
      addDateTags.appendChild(tag);
    });
    if (addDateCount) addDateCount.textContent = String(selectedDates.length);
    if (addDateEmpty) addDateEmpty.hidden = selectedDates.length > 0;
    if (btnClearDates) btnClearDates.hidden = selectedDates.length === 0;
  }

  if (btnAddDate) {
    btnAddDate.addEventListener("click", function () {
      var val = addDateInput ? addDateInput.value : "";
      if (!val) return;
      if (selectedDates.indexOf(val) !== -1) {
        toast(I18N.toastDateDup || "Tanggal sudah ditambahkan.", "warning");
        return;
      }
      selectedDates.push(val);
      selectedDates.sort();
      renderDateTags();
      addDateInput.value = "";
    });
  }
  if (btnClearDates) {
    btnClearDates.addEventListener("click", function () {
      selectedDates = [];
      renderDateTags();
    });
  }

  if (btnSubmitTambah) {
    btnSubmitTambah.addEventListener("click", function () {
      var name = document.getElementById("addName").value.trim();
      var nameErr = document.getElementById("addNameErr");
      var dateErr = document.getElementById("addDateErr");
      var dayoffType = document.querySelector(
        'input[name="dayoff_type"]:checked',
      );
      var scope = document.querySelector('input[name="add_scope"]:checked');
      var officeSel = document.getElementById("addOffice");
      var officeErr = document.getElementById("addOfficeErr");

      var valid = true;
      if (!name) {
        nameErr.hidden = false;
        valid = false;
      } else if (nameErr) {
        nameErr.hidden = true;
      }
      if (!selectedDates.length) {
        dateErr.hidden = false;
        valid = false;
      } else if (dateErr) {
        dateErr.hidden = true;
      }
      if (
        scope &&
        scope.value === "office" &&
        (!officeSel || !officeSel.value)
      ) {
        if (officeErr) officeErr.hidden = false;
        valid = false;
      } else if (officeErr) {
        officeErr.hidden = true;
      }
      if (!valid) return;

      var spinner = document.getElementById("tambahSpinner");
      var textEl = document.getElementById("tambahText");
      btnSubmitTambah.disabled = true;
      if (spinner) spinner.hidden = false;
      if (textEl) textEl.style.opacity = "0.6";

      jsonFetch("/manager/company-dayoffs", {
        method: "POST",
        body: JSON.stringify({
          name: name,
          dates: selectedDates,
          applies_to: scope ? scope.value : "all",
          office_id: officeSel ? officeSel.value : null,
          note: document.getElementById("addNote").value.trim(),
          dayoff_type: dayoffType ? dayoffType.value : "perusahaan",
        }),
      })
        .then(function (res) {
          btnSubmitTambah.disabled = false;
          if (spinner) spinner.hidden = true;
          if (textEl) textEl.style.opacity = "";
          if (res.ok) {
            (res.data.dayoffs || []).forEach(function (d) {
              dayoffs.push(d);
            });
            renderCalendar();
            closeModal(modalTambah);
            toast(res.data.message || I18N.toastAdded, "success");
          } else {
            toast(res.data.message || I18N.toastError, "danger");
          }
        })
        .catch(function () {
          btnSubmitTambah.disabled = false;
          if (spinner) spinner.hidden = true;
          if (textEl) textEl.style.opacity = "";
          toast(I18N.toastConnFail || "Gagal terhubung.", "danger");
        });
    });
  }

  /* ════════════════════════════════════════════════════════════════
     MODAL: Edit Libur
     ════════════════════════════════════════════════════════════════ */
  var modalEdit = document.getElementById("modalEdit");
  var btnCloseEdit = document.getElementById("btnCloseEdit");
  var btnCancelEdit = document.getElementById("btnCancelEdit");
  var btnSubmitEdit = document.getElementById("btnSubmitEdit");
  var editingDayoff = null;

  function openEditModal(ev) {
    editingDayoff = ev;
    document.getElementById("editName").value = ev.name;
    document.getElementById("editNote").value = ev.note || "";
    document.getElementById("editNameErr").hidden = true;
    openModal(modalEdit);
  }
  if (btnCloseEdit)
    btnCloseEdit.addEventListener("click", function () {
      closeModal(modalEdit);
    });
  if (btnCancelEdit)
    btnCancelEdit.addEventListener("click", function () {
      closeModal(modalEdit);
    });

  if (btnSubmitEdit) {
    btnSubmitEdit.addEventListener("click", function () {
      if (!editingDayoff) return;
      var name = document.getElementById("editName").value.trim();
      var errEl = document.getElementById("editNameErr");
      if (!name) {
        errEl.hidden = false;
        return;
      }
      errEl.hidden = true;

      var note = document.getElementById("editNote").value.trim();
      var isEfisiensi = editingDayoff.dayoff_type === "efisiensi";
      var url = isEfisiensi
        ? "/manager/efficiency-off/" + editingDayoff.batch_id
        : "/manager/company-dayoffs/" + editingDayoff.id;

      var spinner = document.getElementById("editSpinner");
      var textEl = document.getElementById("editText");
      btnSubmitEdit.disabled = true;
      if (spinner) spinner.hidden = false;

      jsonFetch(url, {
        method: "PUT",
        body: JSON.stringify({ name: name, note: note }),
      })
        .then(function (res) {
          btnSubmitEdit.disabled = false;
          if (spinner) spinner.hidden = true;
          if (res.ok) {
            if (isEfisiensi) {
              // Satu batch efisiensi = beberapa entri (satu per tanggal
              // dalam rentangnya) — semuanya berbagi batch_id yang sama.
              dayoffs.forEach(function (d) {
                if (d.batch_id === editingDayoff.batch_id) {
                  d.name = name;
                  d.note = note;
                }
              });
            } else {
              var idx = dayoffs.findIndex(function (d) {
                return d.id === editingDayoff.id;
              });
              if (idx !== -1) dayoffs[idx] = res.data.dayoff;
            }
            renderCalendar();
            closeModal(modalEdit);
            toast(res.data.message || I18N.toastUpdated, "success");
          } else {
            toast(res.data.message || I18N.toastUpdateFail, "danger");
          }
        })
        .catch(function () {
          btnSubmitEdit.disabled = false;
          if (spinner) spinner.hidden = true;
          toast(I18N.toastConnFail || "Gagal terhubung.", "danger");
        });
    });
  }

  /* ════════════════════════════════════════════════════════════════
     MODAL: Hapus Libur
     ════════════════════════════════════════════════════════════════ */
  var modalHapus = document.getElementById("modalHapus");
  var btnCloseHapus = document.getElementById("btnCloseHapus");
  var btnCancelHapus = document.getElementById("btnCancelHapus");
  var btnSubmitHapus = document.getElementById("btnSubmitHapus");
  var deletingDayoff = null;

  function openDeleteModal(ev) {
    deletingDayoff = ev;
    document.getElementById("hapusName").textContent = ev.name;
    document.getElementById("hapusDate").textContent = ev.date;
    openModal(modalHapus);
  }
  if (btnCloseHapus)
    btnCloseHapus.addEventListener("click", function () {
      closeModal(modalHapus);
    });
  if (btnCancelHapus)
    btnCancelHapus.addEventListener("click", function () {
      closeModal(modalHapus);
    });

  if (btnSubmitHapus) {
    btnSubmitHapus.addEventListener("click", function () {
      if (!deletingDayoff) return;
      var isEfisiensi = deletingDayoff.dayoff_type === "efisiensi";
      var url = isEfisiensi
        ? "/manager/efficiency-off/" + deletingDayoff.batch_id
        : "/manager/company-dayoffs/" + deletingDayoff.id;

      var spinner = document.getElementById("hapusSpinner");
      btnSubmitHapus.disabled = true;
      if (spinner) spinner.hidden = false;

      jsonFetch(url, {
        method: "DELETE",
      })
        .then(function (res) {
          btnSubmitHapus.disabled = false;
          if (spinner) spinner.hidden = true;
          if (res.ok) {
            closeModal(modalHapus);
            toast(res.data.message || I18N.toastDeleted, "success");
            if (isEfisiensi) {
              // Hanya sisa hari (>= hari ini) yang dibatalkan; hari lewat tetap
              // sebagai riwayat, jadi ambil ulang dari server.
              setTimeout(function () { window.location.reload(); }, 600);
              return;
            }
            dayoffs = dayoffs.filter(function (d) {
              return d.id !== deletingDayoff.id;
            });
            renderCalendar();
          } else {
            toast(res.data.message || I18N.toastDeleteFail, "danger");
          }
        })
        .catch(function () {
          btnSubmitHapus.disabled = false;
          if (spinner) spinner.hidden = true;
          toast(I18N.toastConnFail || "Gagal terhubung.", "danger");
        });
    });
  }

  /* ════════════════════════════════════════════════════════════════
     MODAL: Libur Karyawan (efisiensi produksi)
     ════════════════════════════════════════════════════════════════ */
  var modalLK = document.getElementById("modalLiburKaryawan");
  var btnLiburKaryawan = document.getElementById("btnLiburKaryawan");
  var btnCloseLK = document.getElementById("btnCloseLiburKaryawan");
  var btnCancelLK = document.getElementById("btnCancelLiburKaryawan");
  var btnSubmitLK = document.getElementById("btnSubmitLiburKaryawan");

  var lkSearchInput = document.getElementById("lkSearchInput");
  var lkDeptFilter = document.getElementById("lkDeptFilter");
  var lkEmployeeList = document.getElementById("lkEmployeeList");
  var lkListLoading = document.getElementById("lkListLoading");
  var lkSelectAll = document.getElementById("lkSelectAll");
  var lkSelectedBadge = document.getElementById("lkSelectedBadge");
  var lkSelectedCount = document.getElementById("lkSelectedCount");
  var lkSelectedTags = document.getElementById("lkSelectedTags");
  var lkSelectedEmpty = document.getElementById("lkSelectedEmpty");
  var lkClearAll = document.getElementById("lkClearAll");
  var lkStartDate = document.getElementById("lkStartDate");
  var lkEndDate = document.getElementById("lkEndDate");
  var lkDateErr = document.getElementById("lkDateErr");
  var lkBody = document.querySelector(".lk-body");
  var lkSteps = document.getElementById("lkSteps");
  var btnLkStepBack = document.getElementById("btnLkStepBack");
  var btnLkStepNext = document.getElementById("btnLkStepNext");

  var lkEmployees = []; // hasil fetch saat ini (sudah difilter server-side)
  var lkSelectedMap = {}; // id -> {id, full_name, department, initials, avatar_url}
  var lkSearchTimer = null;
  var lkActiveStep = 1;
  var lkLoaded = false;

  /* ── Validasi rentang tanggal — langsung saat diedit, bukan hanya
     saat submit. Juga membatasi date-picker "Tanggal Selesai" secara
     native lewat atribut min agar tidak bisa memilih tanggal sebelum
     tanggal mulai sama sekali. ─────────────────────────────────── */
  function lkValidateDateRange() {
    var start = lkStartDate ? lkStartDate.value : "";
    var end = lkEndDate ? lkEndDate.value : "";
    if (!lkDateErr) return true;

    if (start && end && end < start) {
      lkDateErr.textContent =
        I18N.lkDateRangeInvalid ||
        "Tanggal selesai harus setelah tanggal mulai.";
      lkDateErr.hidden = false;
      return false;
    }
    lkDateErr.hidden = true;
    return true;
  }

  if (lkStartDate) {
    lkStartDate.addEventListener("change", function () {
      if (lkEndDate) {
        lkEndDate.min = lkStartDate.value || "";
        // Jika tanggal selesai yang sudah dipilih kini lebih awal dari
        // tanggal mulai baru, ikutkan maju ke tanggal mulai agar tetap valid.
        if (
          lkEndDate.value &&
          lkStartDate.value &&
          lkEndDate.value < lkStartDate.value
        ) {
          lkEndDate.value = lkStartDate.value;
        }
      }
      lkValidateDateRange();
    });
  }
  if (lkEndDate) {
    lkEndDate.addEventListener("change", lkValidateDateRange);
  }

  function lkFetchEmployees() {
    if (lkListLoading) {
      lkListLoading.hidden = false;
      lkListLoading.textContent = "Memuat karyawan...";
    }
    var params = new URLSearchParams();
    var q = lkSearchInput ? lkSearchInput.value.trim() : "";
    var dept = lkDeptFilter ? lkDeptFilter.value : "";
    if (q) params.set("q", q);
    if (dept) params.set("department_id", dept);

    jsonFetch("/manager/employees/picker?" + params.toString(), {
      method: "GET",
    })
      .then(function (res) {
        if (res.ok) {
          lkEmployees = res.data.employees || [];
          lkRenderEmployeeList();
        } else {
          if (lkEmployeeList) {
            lkEmployeeList.innerHTML =
              '<p class="lk-list-empty">' +
              (I18N.lkLoadFail || "Gagal memuat daftar karyawan.") +
              "</p>";
          }
        }
      })
      .catch(function () {
        if (lkEmployeeList) {
          lkEmployeeList.innerHTML =
            '<p class="lk-list-empty">' +
            (I18N.lkLoadFail || "Gagal memuat daftar karyawan.") +
            "</p>";
        }
      });
  }

  // Avatar dibangun lewat DOM dan hanya menerima URL http(s)/relatif — nilai
  // avatar_url sebelumnya disuntik mentah ke innerHTML (XSS tersimpan).
  function lkSetAvatar(el, emp) {
    var url = emp.avatar_url;
    if (url && /^(https?:\/\/|\/(?!\/))/i.test(url)) {
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      el.appendChild(img);
    } else {
      el.textContent = emp.initials || "?";
    }
  }

  function lkRenderEmployeeList() {
    if (!lkEmployeeList) return;
    lkEmployeeList.innerHTML = "";

    if (!lkEmployees.length) {
      var empty = document.createElement("p");
      empty.className = "lk-list-empty";
      empty.textContent = I18N.lkNoResults || "Tidak ada karyawan yang cocok.";
      lkEmployeeList.appendChild(empty);
      lkUpdateSelectAllState();
      return;
    }

    lkEmployees.forEach(function (emp) {
      var row = document.createElement("label");
      row.className = "lk-checkbox-row";
      var checked = !!lkSelectedMap[emp.id];
      if (checked) row.classList.add("is-checked");

      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      checkbox.addEventListener("change", function () {
        if (checkbox.checked) {
          lkSelectedMap[emp.id] = emp;
        } else {
          delete lkSelectedMap[emp.id];
        }
        row.classList.toggle("is-checked", checkbox.checked);
        lkRenderSelected();
        lkUpdateSelectAllState();
      });

      var avatar = document.createElement("span");
      avatar.className = "lk-avatar";
      lkSetAvatar(avatar, emp);

      var info = document.createElement("span");
      info.className = "lk-emp-info";
      var name = document.createElement("span");
      name.className = "lk-emp-name";
      name.textContent = emp.full_name;
      var dept = document.createElement("span");
      dept.className = "lk-emp-dept";
      dept.textContent = emp.department;
      info.appendChild(name);
      info.appendChild(dept);

      row.appendChild(checkbox);
      row.appendChild(avatar);
      row.appendChild(info);
      lkEmployeeList.appendChild(row);
    });

    lkUpdateSelectAllState();
  }

  function lkUpdateSelectAllState() {
    if (!lkSelectAll) return;
    if (!lkEmployees.length) {
      lkSelectAll.checked = false;
      lkSelectAll.indeterminate = false;
      lkSelectAll.disabled = true;
      return;
    }
    lkSelectAll.disabled = false;
    var selectedInView = lkEmployees.filter(function (e) {
      return !!lkSelectedMap[e.id];
    }).length;
    lkSelectAll.checked = selectedInView === lkEmployees.length;
    lkSelectAll.indeterminate =
      selectedInView > 0 && selectedInView < lkEmployees.length;
  }

  function lkSetStepBadges(step) {
    if (!lkSteps) return;
    lkSteps.querySelectorAll(".lk-step").forEach(function (el) {
      var s = parseInt(el.getAttribute("data-step"), 10);
      el.classList.toggle("is-active", s === step);
      el.classList.toggle("is-done", s < step);
    });
  }

  function lkIsMobileLayout() {
    return window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  }

  /* Di desktop, ketiga kolom (pilih karyawan, terpilih, detail) tampil
     bersamaan — tidak ada klik "Lanjut" eksplisit yang memicu perpindahan
     step seperti di mobile. Tanpa ini, indikator step di desktop diam
     selamanya di langkah 1 walau karyawan sudah dipilih & form detail
     sudah diisi ("progress bar tidak jalan"). Jadi di desktop, badge step
     disinkronkan langsung dari kondisi nyata: apakah karyawan sudah
     dipilih atau belum. ── */
  function lkSyncStepBadgesFromState() {
    if (lkIsMobileLayout()) return; // mobile: dikendalikan lkGoToStep()
    var hasSelection = Object.keys(lkSelectedMap).length > 0;
    lkSetStepBadges(hasSelection ? 2 : 1);
  }

  function lkRenderSelected() {
    var ids = Object.keys(lkSelectedMap);
    if (lkSelectedCount) lkSelectedCount.textContent = String(ids.length);
    if (lkSelectedEmpty) lkSelectedEmpty.hidden = ids.length > 0;
    if (lkClearAll) lkClearAll.hidden = ids.length === 0;
    if (lkSelectedBadge) {
      lkSelectedBadge.textContent = fmt(
        I18N.lkSelectedOf || "Terpilih %(n)s dari %(total)s",
        { n: ids.length, total: lkEmployees.length },
      );
    }

    if (lkSelectedTags) {
      lkSelectedTags.innerHTML = "";
      ids.forEach(function (id) {
        var emp = lkSelectedMap[id];
        var tag = document.createElement("span");
        tag.className = "dayoff-tag";
        tag.textContent = emp.full_name;
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "dayoff-tag-remove";
        rm.innerHTML = "&times;";
        rm.addEventListener("click", function () {
          delete lkSelectedMap[id];
          lkRenderSelected();
          lkRenderEmployeeList();
        });
        tag.appendChild(rm);
        lkSelectedTags.appendChild(tag);
      });
    }

    lkSyncStepBadgesFromState();
  }

  if (lkSearchInput) {
    lkSearchInput.addEventListener("input", function () {
      clearTimeout(lkSearchTimer);
      lkSearchTimer = setTimeout(lkFetchEmployees, 300);
    });
  }
  if (lkDeptFilter) {
    lkDeptFilter.addEventListener("change", lkFetchEmployees);
  }
  if (lkSelectAll) {
    lkSelectAll.addEventListener("change", function () {
      if (lkSelectAll.checked) {
        lkEmployees.forEach(function (emp) {
          lkSelectedMap[emp.id] = emp;
        });
      } else {
        lkEmployees.forEach(function (emp) {
          delete lkSelectedMap[emp.id];
        });
      }
      lkRenderEmployeeList();
      lkRenderSelected();
    });
  }
  if (lkClearAll) {
    lkClearAll.addEventListener("click", function () {
      lkSelectedMap = {};
      lkRenderEmployeeList();
      lkRenderSelected();
    });
  }

  function lkResetForm() {
    lkSelectedMap = {};
    lkEmployees = [];
    if (lkSearchInput) lkSearchInput.value = "";
    if (lkDeptFilter) lkDeptFilter.value = "";
    if (lkStartDate) lkStartDate.value = "";
    if (lkEndDate) {
      lkEndDate.value = "";
      lkEndDate.removeAttribute("min");
    }
    if (document.getElementById("lkName"))
      document.getElementById("lkName").value = "";
    if (document.getElementById("lkNote"))
      document.getElementById("lkNote").value = "";
    if (lkDateErr) lkDateErr.hidden = true;
    lkRenderSelected();
    lkGoToStep(1);
  }

  function lkGoToStep(step) {
    lkActiveStep = step;
    if (lkBody) lkBody.setAttribute("data-active-step", String(step));
    lkSetStepBadges(step);
    if (btnLkStepBack) btnLkStepBack.hidden = step === 1;
    if (btnLkStepNext) {
      btnLkStepNext.textContent =
        step === 1
          ? I18N.lkStepNext || "Lanjut"
          : I18N.lkStepSave || "Simpan Libur";
    }
  }

  if (btnLkStepNext) {
    btnLkStepNext.addEventListener("click", function () {
      if (lkActiveStep === 1) {
        if (!Object.keys(lkSelectedMap).length) {
          toast(
            I18N.lkPickAtLeastOne || "Pilih minimal satu karyawan.",
            "warning",
          );
          return;
        }
        lkGoToStep(2);
      } else {
        lkSubmit();
      }
    });
  }
  if (btnLkStepBack) {
    btnLkStepBack.addEventListener("click", function () {
      lkGoToStep(1);
    });
  }

  if (btnLiburKaryawan) {
    btnLiburKaryawan.addEventListener("click", function () {
      lkResetForm();
      openModal(modalLK);
      if (!lkLoaded) {
        lkLoaded = true;
      }
      lkFetchEmployees();
    });
  }
  if (btnCloseLK)
    btnCloseLK.addEventListener("click", function () {
      closeModal(modalLK);
    });
  if (btnCancelLK)
    btnCancelLK.addEventListener("click", function () {
      closeModal(modalLK);
    });

  function lkSubmit() {
    var ids = Object.keys(lkSelectedMap);
    if (!ids.length) {
      toast(I18N.lkPickAtLeastOne || "Pilih minimal satu karyawan.", "warning");
      lkGoToStep(1);
      return;
    }

    var start = lkStartDate ? lkStartDate.value : "";
    var end = lkEndDate ? lkEndDate.value : "";
    if (!start || !end) {
      if (lkDateErr) {
        lkDateErr.textContent =
          I18N.lkDateRequired || "Tanggal mulai dan selesai wajib diisi.";
        lkDateErr.hidden = false;
      }
      lkGoToStep(2);
      return;
    }
    if (!lkValidateDateRange()) {
      lkGoToStep(2);
      return;
    }

    var spinner = document.getElementById("lkSubmitSpinner");
    var textEl = document.getElementById("lkSubmitText");
    if (btnSubmitLK) btnSubmitLK.disabled = true;
    if (btnLkStepNext) btnLkStepNext.disabled = true;
    if (spinner) spinner.hidden = false;
    if (textEl) textEl.style.opacity = "0.6";

    jsonFetch("/manager/efficiency-off", {
      method: "POST",
      body: JSON.stringify({
        user_ids: ids,
        start_date: start,
        end_date: end,
        name: document.getElementById("lkName").value.trim(),
        reason: document.getElementById("lkNote").value.trim(),
      }),
    })
      .then(function (res) {
        if (btnSubmitLK) btnSubmitLK.disabled = false;
        if (btnLkStepNext) btnLkStepNext.disabled = false;
        if (spinner) spinner.hidden = true;
        if (textEl) textEl.style.opacity = "";

        if (res.ok) {
          closeModal(modalLK);
          toast(
            res.data.message ||
              I18N.lkSubmitSuccess ||
              "Libur efisiensi berhasil disimpan.",
            "success",
          );
          // Muat ulang agar batch libur karyawan baru langsung tampil
          // di grid kalender & panel "Libur Mendatang" (data digabung &
          // dikelompokkan di server saat render halaman).
          setTimeout(function () {
            window.location.reload();
          }, 600);
        } else {
          toast(
            res.data.message ||
              I18N.lkSubmitFail ||
              "Gagal menyimpan libur efisiensi.",
            "danger",
          );
        }
      })
      .catch(function () {
        if (btnSubmitLK) btnSubmitLK.disabled = false;
        if (btnLkStepNext) btnLkStepNext.disabled = false;
        if (spinner) spinner.hidden = true;
        if (textEl) textEl.style.opacity = "";
        toast(I18N.toastConnFail || "Gagal terhubung.", "danger");
      });
  }

  if (btnSubmitLK) {
    btnSubmitLK.addEventListener("click", lkSubmit);
  }

  /* ════════════════════════════════════════════════════════════════
     MODAL: Detail Libur Karyawan (daftar karyawan yang diliburkan)
     ════════════════════════════════════════════════════════════════ */
  var modalLKDetail = document.getElementById("modalLiburKaryawanDetail");
  var btnCloseLKDetail = document.getElementById("btnCloseLiburKaryawanDetail");
  var lkDetailTitle = document.getElementById("lkDetailTitle");
  var lkDetailDate = document.getElementById("lkDetailDate");
  var lkDetailNote = document.getElementById("lkDetailNote");
  var lkDetailCount = document.getElementById("lkDetailCount");
  var lkDetailList = document.getElementById("lkDetailList");
  var lkDetailLoading = document.getElementById("lkDetailLoading");

  var lkDetailCtx = null; // { batchId, date, editable, selected: {id: true} }
  var lkDetailActions = document.getElementById("lkDetailActions");
  var lkDetailLock = document.getElementById("lkDetailLock");
  var lkDetailSelectAll = document.getElementById("lkDetailSelectAll");
  var lkDetailSelectAllRow = document.getElementById("lkDetailSelectAllRow");
  var lkDetailSelCount = document.getElementById("lkDetailSelCount");
  var lkReleaseScope = document.getElementById("lkReleaseScope");
  var lkExtendUntil = document.getElementById("lkExtendUntil");
  var btnLkRelease = document.getElementById("btnLkRelease");
  var btnLkExtend = document.getElementById("btnLkExtend");

  function lkDetailIds() {
    return lkDetailCtx ? Object.keys(lkDetailCtx.selected) : [];
  }

  function lkDetailRefresh() {
    var n = lkDetailIds().length;
    if (lkDetailSelCount) lkDetailSelCount.textContent = n ? "(" + n + ")" : "";
    if (btnLkRelease) btnLkRelease.disabled = n === 0;
    if (btnLkExtend)
      btnLkExtend.disabled = n === 0 || !(lkExtendUntil && lkExtendUntil.value);
  }

  function openLiburKaryawanDetail(ev) {
    if (!modalLKDetail || !ev.batch_id) return;
    lkDetailCtx = {
      batchId: ev.batch_id,
      date: ev.date,
      editable: false,
      selected: {},
    };
    openModal(modalLKDetail);
    if (lkDetailTitle)
      lkDetailTitle.textContent = ev.name || I18N.typeLabels.efisiensi;
    if (lkDetailDate) lkDetailDate.textContent = formatPopoverDate(ev.date);
    if (lkDetailNote) {
      lkDetailNote.textContent = ev.note || "";
      lkDetailNote.hidden = !ev.note;
    }
    if (lkDetailList) lkDetailList.innerHTML = "";
    if (lkDetailCount) lkDetailCount.textContent = "";
    if (lkDetailLoading) lkDetailLoading.hidden = false;
    if (lkDetailActions) lkDetailActions.hidden = true;
    if (lkDetailSelectAllRow) lkDetailSelectAllRow.hidden = true;
    if (lkDetailLock) lkDetailLock.hidden = true;
    if (lkExtendUntil) lkExtendUntil.value = "";
    if (lkDetailSelectAll) lkDetailSelectAll.checked = false;
    if (lkReleaseScope) lkReleaseScope.value = "onwards";

    // Daftar karyawan SELALU diambil dari server (per tanggal), tidak di-embed
    // di KAL_DAYOFFS — supaya akurat dan halaman tidak membengkak.
    var ctx = lkDetailCtx;
    jsonFetch(
      "/manager/efficiency-off/" +
        encodeURIComponent(ev.batch_id) +
        "?date=" +
        encodeURIComponent(ev.date),
      { method: "GET" },
    )
      .then(function (res) {
        if (ctx !== lkDetailCtx) return; // modal sudah dibuka untuk entri lain
        if (lkDetailLoading) lkDetailLoading.hidden = true;
        if (!res.ok) {
          lkDetailList.innerHTML =
            '<p class="lk-list-empty">' +
            (res.data.message || I18N.lkDetailLoadFail || "Gagal memuat detail karyawan.") +
            "</p>";
          return;
        }
        ctx.editable = !!res.data.editable;
        lkRenderDetailEmployees(res.data.employees || [], res.data.scope_label);
        playEnter(lkDetailList, "is-entering");
        if (lkExtendUntil) lkExtendUntil.min = ev.date;
        if (lkDetailActions) lkDetailActions.hidden = !ctx.editable;
        if (lkDetailSelectAllRow) lkDetailSelectAllRow.hidden = !ctx.editable;
        if (lkDetailLock) lkDetailLock.hidden = ctx.editable;
        lkDetailRefresh();
      })
      .catch(function () {
        if (lkDetailLoading) lkDetailLoading.hidden = true;
        lkDetailList.innerHTML =
          '<p class="lk-list-empty">' + (I18N.toastConnFail || "Gagal terhubung.") + "</p>";
      });
  }

  function lkRenderDetailEmployees(employees, scopeLabel) {
    if (!lkDetailList) return;
    lkDetailList.innerHTML = "";
    if (lkDetailCount) {
      lkDetailCount.textContent =
        scopeLabel ||
        fmt(I18N.lkSelectedOf || "%(n)s karyawan", { n: employees.length });
    }
    if (!employees.length) {
      var empty = document.createElement("p");
      empty.className = "lk-list-empty";
      empty.textContent = I18N.lkNoResults || "Tidak ada karyawan.";
      lkDetailList.appendChild(empty);
      return;
    }
    employees.forEach(function (emp) {
      var row = document.createElement("label");
      row.className = "lk-checkbox-row lk-detail-row";
      var checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.id = emp.id;
      checkbox.addEventListener("change", function () {
        if (checkbox.checked) lkDetailCtx.selected[emp.id] = true;
        else delete lkDetailCtx.selected[emp.id];
        row.classList.toggle("is-checked", checkbox.checked);
        lkDetailRefresh();
      });
      var avatar = document.createElement("span");
      avatar.className = "lk-avatar";
      lkSetAvatar(avatar, emp);
      var info = document.createElement("span");
      info.className = "lk-emp-info";
      var name = document.createElement("span");
      name.className = "lk-emp-name";
      name.textContent = emp.full_name;
      var dept = document.createElement("span");
      dept.className = "lk-emp-dept";
      dept.textContent =
        emp.department +
        " · " +
        fmt(I18N.lkOffUntil || "libur s.d. %(d)s", { d: emp.end_date });
      info.appendChild(name);
      info.appendChild(dept);
      row.appendChild(checkbox);
      row.appendChild(avatar);
      row.appendChild(info);
      lkDetailList.appendChild(row);
    });
  }

  if (lkDetailSelectAll) {
    lkDetailSelectAll.addEventListener("change", function () {
      lkDetailList.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        cb.checked = lkDetailSelectAll.checked;
        cb.dispatchEvent(new Event("change"));
      });
    });
  }
  if (lkExtendUntil) lkExtendUntil.addEventListener("input", lkDetailRefresh);

  function lkDetailAdjust(btn, payload) {
    var ctx = lkDetailCtx;
    if (!ctx || !ctx.editable || !payload.user_ids.length) return;
    btn.disabled = true;
    jsonFetch(
      "/manager/efficiency-off/" + encodeURIComponent(ctx.batchId) + "/adjust",
      { method: "POST", body: JSON.stringify(payload) },
    )
      .then(function (res) {
        if (res.ok) {
          closeModal(modalLKDetail);
          toast(res.data.message || "OK", "success");
          setTimeout(function () { window.location.reload(); }, 600);
        } else {
          toast(res.data.message || I18N.lkSubmitFail || "Gagal menyimpan.", "danger");
          lkDetailRefresh();
        }
      })
      .catch(function () {
        toast(I18N.toastConnFail || "Gagal terhubung.", "danger");
        lkDetailRefresh();
      });
  }

  if (btnLkRelease) {
    btnLkRelease.addEventListener("click", function () {
      var p = { action: "release", user_ids: lkDetailIds(), from_date: lkDetailCtx.date };
      if (lkReleaseScope && lkReleaseScope.value === "single") p.to_date = lkDetailCtx.date;
      lkDetailAdjust(btnLkRelease, p);
    });
  }
  if (btnLkExtend) {
    btnLkExtend.addEventListener("click", function () {
      lkDetailAdjust(btnLkExtend, {
        action: "extend",
        user_ids: lkDetailIds(),
        until: lkExtendUntil.value,
      });
    });
  }

  if (btnCloseLKDetail) {
    btnCloseLKDetail.addEventListener("click", function () {
      closeModal(modalLKDetail);
    });
  }

  /* ── Escape key ── */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    [modalTambah, modalEdit, modalHapus, modalLK, modalLKDetail].forEach(
      function (overlay) {
        if (overlay && overlay.classList.contains("is-open"))
          closeModal(overlay);
      },
    );
    hidePopover();
  });

  document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  /* ════════════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════════════ */
  renderCalendar();
})();