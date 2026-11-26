/* =============================================================================
   shift_master.js — Konfigurasi Shift (Manager)

   Catatan: SHIFT_DATA, SCHEDULER_INFO, CSRF_TOKEN dideklarasikan inline
   di shift_master.html sebelum tag <script src="..."> ini.

   BUG FIXES v2:
   1. parseInt(x) || default diganti _int(x, default) agar nilai 0 tidak
      ter-reset ke default.
   2. openEditModal() sekarang membaca checkin_open_before_minutes &
      checkout_grace_minutes dari shiftData (field sudah ada di dict server).
   3. submitEdit() mengambil checkin_window & checkout_window dari response
      server dan memperbarui kartu UI secara langsung.

   NEW v2:
   4. openAddModal / closeAddModal / submitAdd  → tambah shift baru
   5. deleteShift                               → hapus (soft-delete) shift
============================================================================= */

"use strict";

/* ── Slug generator ──────────────────────────────────────────────────── */
/**
 * Konversi nama shift bebas menjadi kode slug yang valid.
 * Aturan: lowercase, non-[a-z0-9] -> underscore, collapse __, trim edges,
 * prefix shift_ jika diawali angka, potong maks 31 karakter.
 *
 * @param {string} name
 * @returns {string}
 */
function slugify(name) {
  if (!name) return "";
  let s = name.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "_");
  s = s.replace(/_+/g, "_");
  s = s.replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(s)) s = "shift_" + s;
  s = s.slice(0, 31);
  s = s.replace(/_+$/, "");
  return s;
}

const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,30}$/;

/* ── Toggle edit kode shift (Add modal) ────────────────────────────────────── */
/**
 * Tampilkan/sembunyikan input manual kode shift.
 * Saat pertama dibuka, isi dengan nilai slugify saat itu.
 */
function toggleSlugEdit(e) {
  e.preventDefault();
  const preview = document.getElementById("add-type-preview");
  const input = document.getElementById("add-shift-type");
  const hint = document.getElementById("add-type-hint");
  const toggleLink = document.getElementById("add-type-toggle");

  if (input.style.display === "none") {
    // Buka mode edit manual
    const currentSlug = document.getElementById(
      "add-type-preview-text",
    ).textContent;
    input.value = currentSlug === "\u2014" || !currentSlug ? "" : currentSlug;
    preview.style.display = "none";
    input.style.display = "block";
    hint.style.display = "block";
    toggleLink.textContent = "\u2190 Kode otomatis";
    input.focus();
  } else {
    // Kembali ke mode preview otomatis
    preview.style.display = "flex";
    input.style.display = "none";
    hint.style.display = "none";
    input.classList.remove("sm-type-manual-invalid");
    toggleLink.textContent = "Ubah kode";
    const slug = slugify(document.getElementById("add-name").value || "");
    _updateSlugPreview(slug);
  }
}

/** Perbarui teks chip preview */
function _updateSlugPreview(slug) {
  const previewText = document.getElementById("add-type-preview-text");
  if (!previewText) return;
  previewText.textContent = slug || "\u2014";
}

/* ── Safe parseInt helper ─────────────────────────────────────────────────── */
/**
 * Ambil nilai integer dari elemen input. Tidak pakai `|| default` supaya
 * nilai 0 tetap 0 (bukan kembali ke default).
 *
 * @param {string} id       - ID elemen input
 * @param {number} fallback - Nilai jika field kosong / NaN
 */
function _int(id, fallback) {
  const raw = parseInt(document.getElementById(id)?.value ?? "", 10);
  return Number.isNaN(raw) ? fallback : raw;
}

/* ── Pengingat absensi (Fase 3) ───────────────────────────────────────────
   Dipakai bersama oleh modal Edit ("edit") dan modal Tambah ("add").
   Validasi final ada di server (schemas.ShiftNotifySettings); preview di sini
   hanya memberi tahu manager lebih awal bila titik pengingat di luar window. */
function _hhmmToMin(v) {
  const m = /^(\d{2}):(\d{2})$/.exec(v || "");
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function _minToHHMM(n) {
  const t = ((n % 1440) + 1440) % 1440;
  return (
    String(Math.floor(t / 60)).padStart(2, "0") +
    ":" +
    String(t % 60).padStart(2, "0")
  );
}

function notifyBody(prefix) {
  const g = (id) => document.getElementById(`${prefix}-${id}`);
  return {
    notify_checkin_enabled: g("notify-checkin-enabled").checked,
    notify_checkin_offset_min: _int(`${prefix}-notify-checkin-offset`, 15),
    notify_checkout_enabled: g("notify-checkout-enabled").checked,
    notify_checkout_offset_min: _int(`${prefix}-notify-checkout-offset`, 0),
  };
}

function setNotifyInputs(prefix, d) {
  const g = (id) => document.getElementById(`${prefix}-${id}`);
  g("notify-checkin-enabled").checked = !!d.notify_checkin_enabled;
  g("notify-checkin-offset").value = d.notify_checkin_offset_min ?? 15;
  g("notify-checkout-enabled").checked = !!d.notify_checkout_enabled;
  g("notify-checkout-offset").value = d.notify_checkout_offset_min ?? 0;
  syncNotifyUi(prefix);
}

function syncNotifyUi(prefix) {
  const g = (id) => document.getElementById(`${prefix}-${id}`);
  const ws = _hhmmToMin(g("work-start").value);
  const we = _hhmmToMin(g("work-end").value);
  const rows = [
    {
      key: "checkin",
      anchor: ws,
      sign: -1,
      max: _int(`${prefix}-checkin-open-before`, 120),
    },
    {
      key: "checkout",
      anchor: we,
      sign: 1,
      max: _int(`${prefix}-checkout-grace`, 120),
    },
  ];
  for (const r of rows) {
    const on = g(`notify-${r.key}-enabled`).checked;
    const offEl = g(`notify-${r.key}-offset`);
    const prev = g(`notify-${r.key}-preview`);
    offEl.disabled = !on;
    g(`notify-${r.key}-row`).classList.toggle("is-off", !on);
    prev.classList.remove("is-warn");
    if (!on || r.anchor === null) {
      prev.textContent = "";
      continue;
    }
    const off = _int(`${prefix}-notify-${r.key}-offset`, 0);
    const at = _minToHHMM(r.anchor + r.sign * off);
    if (off > r.max) {
      prev.textContent = `Pukul ${at} — di luar window (maks ${r.max} mnt).`;
      prev.classList.add("is-warn");
    } else {
      prev.textContent = `Dikirim pukul ${at}.`;
    }
  }
}

function _setNotifyCard(el, label, enabled) {
  if (!el) return;
  if (label) el.textContent = label;
  el.classList.toggle("is-off", !enabled);
}

/* ── Color picker sync (bersama untuk edit & add) ─────────────────────────── */
function _bindColorPicker(pickerId, hexId) {
  const picker = document.getElementById(pickerId);
  const hex = document.getElementById(hexId);
  if (!picker || !hex) return;
  picker.addEventListener("input", () => {
    hex.value = picker.value;
  });
  hex.addEventListener("input", () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  _bindColorPicker("edit-color", "edit-color-hex");
  _bindColorPicker("add-color", "add-color-hex");

  // Live slug preview: update chip saat nama diketik
  const addNameEl = document.getElementById("add-name");
  if (addNameEl) {
    addNameEl.addEventListener("input", () => {
      const input = document.getElementById("add-shift-type");
      // Hanya update preview jika mode manual belum aktif
      if (input && input.style.display === "none") {
        _updateSlugPreview(slugify(addNameEl.value));
      }
    });
  }

  // Validasi regex on-blur untuk input manual kode shift
  const addTypeEl = document.getElementById("add-shift-type");
  if (addTypeEl) {
    addTypeEl.addEventListener("blur", () => {
      if (addTypeEl.style.display !== "none") {
        const ok = SLUG_PATTERN.test(addTypeEl.value);
        addTypeEl.classList.toggle("sm-type-manual-invalid", !ok);
      }
    });
    addTypeEl.addEventListener("input", () => {
      // Hapus state invalid saat user mulai mengetik ulang
      addTypeEl.classList.remove("sm-type-manual-invalid");
    });
  }

  // Tutup modal saat klik luar
  ["modal-edit-shift", "modal-add-shift"].forEach((id) => {
    const el = document.getElementById(id);
    if (el)
      el.addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          if (id === "modal-edit-shift") closeEditModal();
          else closeAddModal();
        }
      });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   EDIT SHIFT
═══════════════════════════════════════════════════════════════════════════ */

let _editShiftId = null;
let _editShiftType = null;

/**
 * Buka modal edit dan isi semua field dari shiftData.
 * shiftData berasal dari `s | tojson` di template — dict ini kini sudah
 * menyertakan checkin_open_before_minutes & checkout_grace_minutes.
 *
 * @param {string} shiftId
 * @param {Object} shiftData
 */
function openEditModal(shiftId, shiftData) {
  _editShiftId = shiftId;
  _editShiftType = shiftData.shift_type;

  document.getElementById("modal-edit-title").textContent =
    "Edit: " + shiftData.name;

  document.getElementById("edit-name").value = shiftData.name || "";
  document.getElementById("edit-work-start").value = shiftData.work_start || "";
  document.getElementById("edit-work-end").value = shiftData.work_end || "";
  document.getElementById("edit-cutoff").value = shiftData.cutoff_time || "";
  document.getElementById("edit-color").value =
    shiftData.color_hex || "#4f6ef7";
  document.getElementById("edit-color-hex").value =
    shiftData.color_hex || "#4f6ef7";
  document.getElementById("edit-crosses-midnight").checked =
    !!shiftData.crosses_midnight;
  document.getElementById("edit-date-offset").value = String(
    shiftData.attendance_date_offset ?? 0,
  );

  // ── BUGFIX: field ini sebelumnya hilang dari dict → selalu jadi 120 ──────
  document.getElementById("edit-tolerance").value =
    shiftData.late_tolerance_minutes ?? 15;
  document.getElementById("edit-checkin-open-before").value =
    shiftData.checkin_open_before_minutes ?? 120;
  document.getElementById("edit-checkout-grace").value =
    shiftData.checkout_grace_minutes ?? 120;
  // ─────────────────────────────────────────────────────────────────────────

  setNotifyInputs("edit", shiftData);

  document.getElementById("edit-error").style.display = "none";
  document.getElementById("modal-edit-shift").style.display = "flex";
}

function closeEditModal() {
  document.getElementById("modal-edit-shift").style.display = "none";
  _editShiftId = null;
}

async function submitEdit() {
  if (!_editShiftId) return;

  const errEl = document.getElementById("edit-error");
  const spinEl = document.getElementById("edit-spin");
  const btnEl = document.getElementById("btn-edit-submit");

  errEl.style.display = "none";
  spinEl.style.display = "inline";
  btnEl.disabled = true;

  const body = {
    name: (document.getElementById("edit-name").value || "").trim(),
    work_start: document.getElementById("edit-work-start").value,
    work_end: document.getElementById("edit-work-end").value,
    cutoff_time: document.getElementById("edit-cutoff").value,
    color_hex: (
      document.getElementById("edit-color-hex").value || "#4f6ef7"
    ).trim(),
    crosses_midnight: document.getElementById("edit-crosses-midnight").checked,
    attendance_date_offset: _int("edit-date-offset", 0),

    // ── BUGFIX: gunakan _int() bukan parseInt() || default ─────────────────
    late_tolerance_minutes: _int("edit-tolerance", 15),
    checkin_open_before_minutes: _int("edit-checkin-open-before", 120),
    checkout_grace_minutes: _int("edit-checkout-grace", 120),
    ...notifyBody("edit"),
    // ──────────────────────────────────────────────────────────────────────
  };

  try {
    const res = await fetch(`/manager/shifts/${_editShiftId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": CSRF_TOKEN,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.message || "Terjadi kesalahan.";
      errEl.style.display = "block";
      return;
    }

    // ── Update kartu UI tanpa reload halaman ─────────────────────────────
    const sid = _editShiftId;
    const el = (id) => document.getElementById(`${id}-${sid}`);

    if (el("val-range"))
      el("val-range").textContent =
        body.work_start +
        " – " +
        body.work_end +
        (body.crosses_midnight ? " +1" : "");

    if (el("val-cutoff")) el("val-cutoff").textContent = body.cutoff_time;

    if (el("val-offset") && data.date_offset_label)
      el("val-offset").textContent = data.date_offset_label;

    if (el("val-tol"))
      el("val-tol").textContent = body.late_tolerance_minutes + " mnt";

    // ── BUGFIX: update window labels dari response server ─────────────────
    if (el("val-checkin-window") && data.checkin_window)
      el("val-checkin-window").textContent = data.checkin_window;

    if (el("val-checkout-window") && data.checkout_window)
      el("val-checkout-window").textContent = data.checkout_window;
    // ──────────────────────────────────────────────────────────────────────

    _setNotifyCard(
      el("val-notify-checkin"),
      data.notify_checkin_label,
      body.notify_checkin_enabled,
    );
    _setNotifyCard(
      el("val-notify-checkout"),
      data.notify_checkout_label,
      body.notify_checkout_enabled,
    );

    // Perbarui aksen warna kartu
    const card = document.getElementById(`card-${sid}`);
    if (card) {
      const accent = card.querySelector(".sm-shift-card-accent");
      if (accent) accent.style.background = body.color_hex;
    }

    // Perbarui chip scheduler di banner
    if (data.rescheduled && _editShiftType) {
      const chip = document.getElementById(
        `chip-auto_absent_${_editShiftType}`,
      );
      if (chip) chip.querySelector("strong").textContent = data.new_cutoff;
    }

    // Perbarui shiftData internal agar modal berikutnya pre-fill benar
    _syncShiftDataCache(sid, body);

    showToast("✓ " + (data.message || "Shift berhasil diperbarui."), "success");
    closeEditModal();
  } catch {
    errEl.textContent = "Koneksi gagal. Coba lagi.";
    errEl.style.display = "block";
  } finally {
    spinEl.style.display = "none";
    btnEl.disabled = false;
  }
}

/**
 * Perbarui entry SHIFT_DATA di memori sehingga openEditModal() berikutnya
 * mendapat nilai terbaru (tanpa reload halaman).
 */
function _syncShiftDataCache(shiftId, body) {
  for (const s of SHIFT_DATA) {
    if (s.id === shiftId) {
      s.name = body.name;
      s.work_start = body.work_start;
      s.work_end = body.work_end;
      s.cutoff_time = body.cutoff_time;
      s.late_tolerance_minutes = body.late_tolerance_minutes;
      s.checkin_open_before_minutes = body.checkin_open_before_minutes;
      s.checkout_grace_minutes = body.checkout_grace_minutes;
      s.color_hex = body.color_hex;
      s.crosses_midnight = body.crosses_midnight;
      s.attendance_date_offset = body.attendance_date_offset;
      s.notify_checkin_enabled = body.notify_checkin_enabled;
      s.notify_checkin_offset_min = body.notify_checkin_offset_min;
      s.notify_checkout_enabled = body.notify_checkout_enabled;
      s.notify_checkout_offset_min = body.notify_checkout_offset_min;
      break;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAMBAH SHIFT (baru)
═══════════════════════════════════════════════════════════════════════════ */

function openAddModal() {
  // Reset form
  ["add-name", "add-work-start", "add-work-end", "add-cutoff"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  // Reset slug preview & sembunyikan input manual
  document.getElementById("add-shift-type").value = "";
  document.getElementById("add-shift-type").style.display = "none";
  document
    .getElementById("add-shift-type")
    .classList.remove("sm-type-manual-invalid");
  document.getElementById("add-type-preview").style.display = "flex";
  document.getElementById("add-type-hint").style.display = "none";
  const toggleLink = document.getElementById("add-type-toggle");
  if (toggleLink) toggleLink.textContent = "Ubah kode";
  _updateSlugPreview("");
  document.getElementById("add-tolerance").value = "15";
  document.getElementById("add-checkin-open-before").value = "120";
  document.getElementById("add-checkout-grace").value = "120";
  document.getElementById("add-color").value = "#4f6ef7";
  document.getElementById("add-color-hex").value = "#4f6ef7";
  document.getElementById("add-crosses-midnight").checked = false;
  document.getElementById("add-date-offset").value = "0";
  _addOffsetTouched = false;
  setNotifyInputs("add", {
    notify_checkin_enabled: false,
    notify_checkin_offset_min: 15,
    notify_checkout_enabled: false,
    notify_checkout_offset_min: 0,
  });
  document.getElementById("add-error").style.display = "none";

  document.getElementById("modal-add-shift").style.display = "flex";
}

function closeAddModal() {
  document.getElementById("modal-add-shift").style.display = "none";
}

async function submitAdd() {
  const errEl = document.getElementById("add-error");
  const spinEl = document.getElementById("add-spin");
  const btnEl = document.getElementById("btn-add-submit");

  errEl.style.display = "none";
  spinEl.style.display = "inline";
  btnEl.disabled = true;

  // Tentukan shift_type: dari input manual jika aktif, else dari slugify(nama)
  const _addTypeInput = document.getElementById("add-shift-type");
  const _manualMode = _addTypeInput && _addTypeInput.style.display !== "none";
  const _addName = (document.getElementById("add-name").value || "").trim();
  const _resolvedType = _manualMode
    ? (_addTypeInput.value || "").trim()
    : slugify(_addName);

  const body = {
    shift_type: _resolvedType,
    name: (document.getElementById("add-name").value || "").trim(),
    work_start: document.getElementById("add-work-start").value,
    work_end: document.getElementById("add-work-end").value,
    cutoff_time: document.getElementById("add-cutoff").value,
    color_hex: (
      document.getElementById("add-color-hex").value || "#4f6ef7"
    ).trim(),
    crosses_midnight: document.getElementById("add-crosses-midnight").checked,
    attendance_date_offset: _int("add-date-offset", 0),

    // Gunakan _int() agar nilai 0 tidak di-replace fallback
    late_tolerance_minutes: _int("add-tolerance", 15),
    checkin_open_before_minutes: _int("add-checkin-open-before", 120),
    checkout_grace_minutes: _int("add-checkout-grace", 120),
    ...notifyBody("add"),
  };

  // Validasi client-side (server juga validasi sebagai defence-in-depth)
  if (!body.shift_type) {
    errEl.textContent = "Ketik nama shift terlebih dahulu.";
    errEl.style.display = "block";
    spinEl.style.display = "none";
    btnEl.disabled = false;
    return;
  }
  if (!SLUG_PATTERN.test(body.shift_type)) {
    errEl.textContent =
      "Kode shift tidak valid. Gunakan huruf kecil, angka, underscore; awali dengan huruf.";
    errEl.style.display = "block";
    spinEl.style.display = "none";
    btnEl.disabled = false;
    if (_addTypeInput) _addTypeInput.classList.add("sm-type-manual-invalid");
    return;
  }

  try {
    const res = await fetch("/manager/shifts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": CSRF_TOKEN,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.message || "Terjadi kesalahan.";
      errEl.style.display = "block";
      return;
    }

    showToast(
      "✓ " + (data.message || "Shift berhasil ditambahkan."),
      "success",
    );
    closeAddModal();

    // Reload halaman agar kartu baru tampil (lebih aman dari DOM manipulation)
    setTimeout(() => location.reload(), 900);
  } catch {
    errEl.textContent = "Koneksi gagal. Coba lagi.";
    errEl.style.display = "block";
  } finally {
    spinEl.style.display = "none";
    btnEl.disabled = false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   HAPUS SHIFT (baru)
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Soft-delete shift. Semua shift dengan shift_type yang sama di semua kantor
 * akan di-nonaktifkan di server.
 *
 * @param {string} shiftId
 * @param {string} shiftName  - Untuk konfirmasi dialog
 * @param {string} shiftType  - Untuk konfirmasi dialog
 */
async function deleteShift(shiftId, shiftName, shiftType) {
  const confirmed = confirm(
    `Hapus shift "${shiftName}" (${shiftType})?\n\n` +
      `Perubahan ini akan memengaruhi semua kantor. ` +
      `Shift yang sudah dihapus tidak akan tersedia untuk jadwal baru.\n\n` +
      `Lanjutkan?`,
  );
  if (!confirmed) return;

  try {
    const res = await fetch(`/manager/shifts/${shiftId}`, {
      method: "DELETE",
      headers: { "X-CSRFToken": CSRF_TOKEN },
    });
    const data = await res.json();

    if (!res.ok) {
      showToast("✗ " + (data.message || "Gagal menghapus shift."), "error");
      return;
    }

    showToast("✓ " + (data.message || "Shift berhasil dihapus."), "success");

    // Hapus kartu dari DOM
    const card = document.getElementById(`card-${shiftId}`);
    if (card) {
      card.style.transition = "opacity 0.3s, transform 0.3s";
      card.style.opacity = "0";
      card.style.transform = "scale(0.95)";
      setTimeout(() => {
        card.remove();
        // Hapus chip scheduler di banner jika ada
        const chip = document.getElementById(`chip-auto_absent_${shiftType}`);
        if (chip) chip.remove();
      }, 320);
    }
  } catch {
    showToast("✗ Koneksi gagal. Coba lagi.", "error");
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════════════════ */

function showToast(msg, type = "") {
  const t = document.getElementById("sm-toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "sm-toast " + type;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

/* ── Pengingat absensi: sinkronkan preview saat input terkait berubah ───── */
document.addEventListener("DOMContentLoaded", () => {
  for (const prefix of ["edit", "add"]) {
    const ids = [
      "notify-checkin-enabled",
      "notify-checkin-offset",
      "notify-checkout-enabled",
      "notify-checkout-offset",
      "work-start",
      "work-end",
      "checkin-open-before",
      "checkout-grace",
    ];
    for (const id of ids) {
      const el = document.getElementById(`${prefix}-${id}`);
      if (!el) continue;
      el.addEventListener("input", () => syncNotifyUi(prefix));
      el.addEventListener("change", () => syncNotifyUi(prefix));
    }
  }
});

/* ── Tanggal kerja (attendance_date_offset) ──────────────────────────────
   Aturan saran SAMA dengan models.default_attendance_date_offset():
   melewati tengah malam + mulai >= 12:00 → "Hari berikutnya (+1)".
   Server tetap memvalidasi (hanya 0/1; 1 butuh crosses_midnight). */
let _addOffsetTouched = false;

function _suggestDateOffset(workStart, crosses) {
  return crosses && workStart >= "12:00" ? "1" : "0";
}

document.addEventListener("DOMContentLoaded", () => {
  const addOffset = document.getElementById("add-date-offset");
  const addCross = document.getElementById("add-crosses-midnight");
  const addStart = document.getElementById("add-work-start");
  if (addOffset && addCross && addStart) {
    // Saran otomatis di modal Tambah, sampai manajer memilih sendiri.
    addOffset.addEventListener("change", () => (_addOffsetTouched = true));
    const suggest = () => {
      if (_addOffsetTouched) return;
      addOffset.value = _suggestDateOffset(addStart.value, addCross.checked);
    };
    addCross.addEventListener("change", suggest);
    addStart.addEventListener("input", suggest);
  }

  // Tanpa "melewati tengah malam", offset 1 tidak sah → paksa ke 0 (kedua modal).
  for (const prefix of ["add", "edit"]) {
    const cross = document.getElementById(`${prefix}-crosses-midnight`);
    const off = document.getElementById(`${prefix}-date-offset`);
    if (cross && off)
      cross.addEventListener("change", () => {
        if (!cross.checked) off.value = "0";
      });
  }
});