/**
 * departments.js — CRUD + Bulk Assign Departemen
 *
 * Fitur:
 *   • CRUD departemen (tambah / edit / hapus) via REST API
 *   • Modal "Kelola Anggota": tampil semua karyawan, filter, search, checkbox
 *   • Bulk assign  → PUT  /manager/departments/<id>/members  { add: [user_ids] }
 *   • Bulk remove  → PUT  /manager/departments/<id>/members  { remove: [user_ids] }
 *   • Filter: Semua / Belum di-assign / Sudah di dept ini
 *   • Select all (filtered), count badge real-time
 *   • Toast via window.showToast (app.js) atau fallback built-in
 *   • Tidak ada global state yang kotor — semua di-scope dalam closure
 *
 * Depends on: window.DEPT_CONFIG, window.__DEPT_DATA__
 */

"use strict";

/* ── Config & i18n ──────────────────────────────────────────── */
const C = window.DEPT_CONFIG;
const I18N = C.i18n;

/* ── Dept lookup map: id → dept object ──────────────────────── */
const _deptMap = Object.fromEntries(
  (window.__DEPT_DATA__ || []).map((d) => [d.id, d]),
);

/* ── Module-level state ─────────────────────────────────────── */
let _editingId = null;       // null = add mode
let _rotEnabled = false;
let _selectedColor = "#4f6ef7";
let _rotSequence = [];       // array of {type, label} — urutan rotasi N-shift
let _allowedShiftTypes = []; // array of shift_type string yang dicentang
let _swapQuotaMonthly = null; // null = Unlimited; int >= 0 = kuota spesifik

// Members modal state
let _currentDeptId = null;
let _currentDeptName = null;
let _currentDeptColor = null;
let _allEmployees = []; // cache fetch
let _membersFilter = "all"; // "all" | "unassigned" | "this_dept"

/* ────────────────────────────────────────────────────────────
   UTILITIES
───────────────────────────────────────────────────────────── */

/** getElementById shorthand */
const $id = (id) => document.getElementById(id);

/** Simple toast — delegasi ke app.js showToast atau fallback inline */
function _toast(msg, type = "success") {
  if (typeof window.showToast === "function") {
    window.showToast(msg, type);
    return;
  }
  const t = document.createElement("div");
  t.style.cssText = [
    "position:fixed;bottom:5.5rem;left:50%;transform:translateX(-50%)",
    "padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600",
    "z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.15);white-space:nowrap",
    type === "error"
      ? "background:#c0392b;color:#fff"
      : "background:#1a7a4a;color:#fff",
  ].join(";");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/** Fetch wrapper dengan CSRF header dan JSON body */
async function _apiFetch(url, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "X-CSRFToken": C.csrf },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Inisial 2 huruf dari nama */
function _initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name || "--").substring(0, 2).toUpperCase();
}

/** Warna avatar deterministik dari string */
const _AVATAR_COLORS = [
  "#4f6ef7",
  "#22c069",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
  "#ec4899",
  "#14b8a6",
];
function _avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return _AVATAR_COLORS[Math.abs(h) % _AVATAR_COLORS.length];
}

/* ────────────────────────────────────────────────────────────
   MODAL HELPERS (shared)
───────────────────────────────────────────────────────────── */

function openModal(id) {
  const el = $id(id);
  if (!el) return;
  el.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const el = $id(id);
  if (!el) return;
  el.classList.remove("open");
  document.body.style.overflow = "";
}

// Tutup modal saat klik backdrop
document.querySelectorAll(".modal-overlay").forEach((ov) => {
  ov.addEventListener("click", (e) => {
    if (e.target === ov) {
      ov.classList.remove("open");
      document.body.style.overflow = "";
    }
  });
});

/* ────────────────────────────────────────────────────────────
   COLOR PICKER
───────────────────────────────────────────────────────────── */

function selectColor(color) {
  _selectedColor = color;
  const inp = $id("dept-color");
  if (inp) inp.value = color;
  document.querySelectorAll(".color-swatch").forEach((sw) => {
    sw.classList.toggle("selected", sw.dataset.color === color);
  });
}

/* ────────────────────────────────────────────────────────────
   ROTATION TOGGLE
───────────────────────────────────────────────────────────── */

function setRotationUI(enabled) {
  _rotEnabled = enabled;
  const row = $id("rotation-toggle-row");
  const track = $id("toggle-track");
  const label = $id("rotation-toggle-label");
  const sub = $id("rotation-toggle-sub");
  const pair = $id("rotation-pair-section");

  row?.classList.toggle("is-active", enabled);
  track?.classList.toggle("is-on", enabled);
  if (label)
    label.textContent = enabled ? I18N.rotActiveLabel : I18N.rotOffLabel;
  if (sub) sub.textContent = enabled ? I18N.rotActiveSub : I18N.rotOffSub;
  if (pair) pair.hidden = !enabled;
}

function toggleRotation() {
  setRotationUI(!_rotEnabled);
}

/* ────────────────────────────────────────────────────────────
   ALLOWED SHIFTS — checkbox grid
───────────────────────────────────────────────────────────── */

/** Reset semua checkbox Shift yang Diizinkan ke tidak tercentang */
function _resetAllowedShifts() {
  _allowedShiftTypes = [];
  document.querySelectorAll(".allowed-shift-cb").forEach((cb) => {
    cb.checked = false;
  });
}

/** Set checkbox Shift yang Diizinkan dari array shift_type */
function _setAllowedShifts(types) {
  _allowedShiftTypes = Array.isArray(types) ? [...types] : [];
  document.querySelectorAll(".allowed-shift-cb").forEach((cb) => {
    cb.checked = _allowedShiftTypes.includes(cb.value);
  });
}

/** Handler on-change setiap checkbox Shift yang Diizinkan */
function onAllowedShiftChange(cb) {
  const type = cb.value;
  if (cb.checked) {
    if (!_allowedShiftTypes.includes(type)) _allowedShiftTypes.push(type);
  } else {
    _allowedShiftTypes = _allowedShiftTypes.filter((t) => t !== type);
    // Jika shift ini ada di rotation sequence, hapus juga dari sana
    const idx = _rotSequence.findIndex((s) => s.type === type);
    if (idx !== -1) {
      _rotSequence.splice(idx, 1);
      _renderRotSequence();
    }
  }
}

/* ────────────────────────────────────────────────────────────
   KUOTA TUKAR SHIFT BULANAN — mode toggle (Unlimited / Angka)
───────────────────────────────────────────────────────────── */

/** Set UI kuota dari nilai: null = Unlimited, angka >= 0 = spesifik */
function setSwapQuotaUI(value) {
  const numWrap = $id("swap-quota-number-wrap");
  const numInput = $id("dept-swap-quota");
  const rUnlimited = $id("swap-quota-mode-unlimited");
  const rLimited = $id("swap-quota-mode-limited");

  if (value === null || value === undefined) {
    _swapQuotaMonthly = null;
    if (rUnlimited) rUnlimited.checked = true;
    if (numWrap) numWrap.hidden = true;
    if (numInput) {
      numInput.disabled = true;
      numInput.value = "";
    }
  } else {
    _swapQuotaMonthly = Math.max(0, parseInt(value, 10) || 0);
    if (rLimited) rLimited.checked = true;
    if (numWrap) numWrap.hidden = false;
    if (numInput) {
      numInput.disabled = false;
      numInput.value = String(_swapQuotaMonthly);
    }
  }
}

/** Handler saat mode radio (Unlimited / Angka spesifik) berubah */
function onSwapQuotaModeChange() {
  const rLimited = $id("swap-quota-mode-limited");
  const numWrap = $id("swap-quota-number-wrap");
  const numInput = $id("dept-swap-quota");

  if (rLimited && rLimited.checked) {
    if (numWrap) numWrap.hidden = false;
    if (numInput) numInput.disabled = false;
    // Default ke 0 kalau input masih kosong, biar tidak invalid saat submit
    const current = numInput ? parseInt(numInput.value, 10) : NaN;
    _swapQuotaMonthly = Number.isFinite(current) && current >= 0 ? current : 0;
    if (numInput && numInput.value === "") numInput.value = "0";
    numInput?.focus();
  } else {
    if (numWrap) numWrap.hidden = true;
    if (numInput) {
      numInput.disabled = true;
      numInput.value = "";
    }
    _swapQuotaMonthly = null;
  }
}

/** Handler saat angka kuota diketik manual */
function onSwapQuotaNumberInput() {
  const numInput = $id("dept-swap-quota");
  const raw = numInput ? parseInt(numInput.value, 10) : NaN;
  _swapQuotaMonthly = Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

/* ────────────────────────────────────────────────────────────
   ROTATION SEQUENCE — chip list N-shift
───────────────────────────────────────────────────────────── */

/** Re-render seluruh chip list #rotation-sequence-list */
function _renderRotSequence() {
  const container = $id("rotation-sequence-list");
  if (!container) return;
  container.innerHTML = "";

  if (_rotSequence.length === 0) {
    container.innerHTML = `<p class="rot-seq-empty">${I18N.rotSeqEmpty}</p>`;
    _updateRotPreview();
    return;
  }

  _rotSequence.forEach((item, i) => {
    const chip = document.createElement("div");
    chip.className = "rot-seq-chip";
    chip.innerHTML = `
      <span class="rot-seq-num">${i + 1}</span>
      <span class="rot-seq-label">${item.label}</span>
      <div class="rot-seq-actions">
        <button type="button" class="rot-seq-btn" title="${I18N.rotSeqMoveUp}"
          onclick="rotSeqMove(${i}, -1)"
          ${i === 0 ? "disabled" : ""}>▲</button>
        <button type="button" class="rot-seq-btn" title="${I18N.rotSeqMoveDown}"
          onclick="rotSeqMove(${i}, 1)"
          ${i === _rotSequence.length - 1 ? "disabled" : ""}>▼</button>
        <button type="button" class="rot-seq-btn rot-seq-btn-del" title="${I18N.rotSeqRemoveBtn}"
          onclick="rotSeqRemove(${i})">✕</button>
      </div>
    `;
    container.appendChild(chip);
  });

  _updateRotPreview();
}

/** Pindah item di urutan (dir = -1 naik, +1 turun) */
function rotSeqMove(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= _rotSequence.length) return;
  [_rotSequence[idx], _rotSequence[target]] = [_rotSequence[target], _rotSequence[idx]];
  _renderRotSequence();
}

/** Hapus item dari urutan */
function rotSeqRemove(idx) {
  _rotSequence.splice(idx, 1);
  _renderRotSequence();
}

/** Tambah shift ke urutan dari dropdown #rot-seq-picker */
function rotSeqAddFromPicker() {
  const picker = $id("rot-seq-picker");
  if (!picker || !picker.value) return;
  const type = picker.value;
  const label = picker.options[picker.selectedIndex].dataset.label || type;

  // Tolak duplikat
  if (_rotSequence.some((s) => s.type === type)) {
    const errEl = $id("dept-error");
    if (errEl) {
      errEl.textContent = I18N.errRotDuplicate;
      errEl.hidden = false;
    }
    return;
  }

  _rotSequence.push({ type, label });
  picker.value = "";
  _renderRotSequence();

  // Sembunyikan error jika sebelumnya ada
  const errEl = $id("dept-error");
  if (errEl) errEl.hidden = true;
}

/** Update teks preview rantai rotasi */
function _updateRotPreview() {
  const el = $id("rotation-chain-preview");
  if (!el) return;
  if (_rotSequence.length < 2) {
    el.classList.add("hidden");
    return;
  }
  const chain = _rotSequence.map((s) => s.label).join(" → ");
  el.textContent = `${chain} → ${_rotSequence[0].label} → …`;
  el.classList.remove("hidden");
}

/* ────────────────────────────────────────────────────────────
   DEPT CRUD MODAL — ADD
───────────────────────────────────────────────────────────── */

function openAddModal() {
  _editingId = null;
  $id("modal-dept-title").textContent = I18N.addTitle;
  $id("btn-dept-label").textContent = I18N.saveBtn;
  $id("dept-id").value = "";
  $id("dept-name").value = "";
  $id("dept-desc").value = "";
  $id("dept-default-shift").value = "";
  $id("dept-error").hidden = true;
  const _addWarn = $id("dept-legacy-warn");
  if (_addWarn) _addWarn.hidden = true;
  selectColor("#4f6ef7");
  _resetAllowedShifts();
  _rotSequence = [];
  _renderRotSequence();
  setRotationUI(false);
  setSwapQuotaUI(null);
  openModal("modal-dept");
  $id("dept-name").focus();
}

/* ────────────────────────────────────────────────────────────
   DEPT CRUD MODAL — EDIT
───────────────────────────────────────────────────────────── */

function openEditModal(dept) {
  _editingId = dept.id;
  $id("modal-dept-title").textContent = I18N.editTitle;
  $id("btn-dept-label").textContent = I18N.saveBtn;
  $id("dept-id").value = dept.id;
  $id("dept-name").value = dept.name || "";
  $id("dept-desc").value = dept.description || "";
  $id("dept-error").hidden = true;
  selectColor(dept.color || "#4f6ef7");

  // ── Cek default_shift_type: reset jika slug sudah tidak ada di dropdown ──
  const _defSel = $id("dept-default-shift");
  const _defSlug = dept.default_shift_type || "";
  const _defExists = _defSlug &&
    [..._defSel.options].some((o) => o.value === _defSlug);
  _defSel.value = _defExists ? _defSlug : "";

  // Populate allowed_shift_types
  _setAllowedShifts(dept.allowed_shift_types || []);

  // ── Kumpulkan slug lama yang bermasalah untuk banner ──
  const _staleSlugs = [];
  if (!_defExists && _defSlug) _staleSlugs.push("default: " + _defSlug);

  // Populate rotation_sequence
  const _legacyWarn = $id("dept-legacy-warn");
  if (Array.isArray(dept.rotation_sequence) && dept.rotation_sequence.length >= 2) {
    // Data baru — bangun array {type, label} dari sequence
    const picker = $id("rot-seq-picker");
    _rotSequence = dept.rotation_sequence.map((type) => {
      let label = type;
      if (picker) {
        const opt = [...picker.options].find((o) => o.value === type);
        if (opt) label = opt.dataset.label || opt.text || type;
      }
      return { type, label };
    });
  } else {
    _rotSequence = [];
  }

  // Tampilkan atau sembunyikan banner legacy
  if (_legacyWarn) {
    if (_staleSlugs.length > 0) {
      _legacyWarn.hidden = false;
      const slugEl = _legacyWarn.querySelector(".legacy-warn-slugs");
      if (slugEl) slugEl.textContent = _staleSlugs.join(" · ");
    } else {
      _legacyWarn.hidden = true;
    }
  }

  _renderRotSequence();
  setRotationUI(!!dept.rotation_enabled);
  setSwapQuotaUI(
    dept.swap_quota_monthly === undefined ? null : dept.swap_quota_monthly,
  );
  openModal("modal-dept");
  $id("dept-name").focus();
}

function closeDeptModal() {
  closeModal("modal-dept");
}

/* ────────────────────────────────────────────────────────────
   DEPT CRUD — SUBMIT (create / update)
───────────────────────────────────────────────────────────── */

async function submitDept() {
  const errEl = $id("dept-error");
  errEl.hidden = true;

  const name = ($id("dept-name").value || "").trim();
  const shift = $id("dept-default-shift").value;

  // ── Validasi client-side ──────────────────────────────────
  if (!name) {
    errEl.textContent = I18N.errNameEmpty;
    errEl.hidden = false;
    $id("dept-name").focus();
    return;
  }
  if (!shift) {
    errEl.textContent = I18N.errShiftEmpty;
    errEl.hidden = false;
    return;
  }

  // Validasi: default shift harus ∈ allowed_shift_types (jika ada pembatasan)
  if (_allowedShiftTypes.length > 0 && !_allowedShiftTypes.includes(shift)) {
    errEl.textContent = I18N.errDefaultNotAllowed;
    errEl.hidden = false;
    return;
  }

  // Validasi sequence jika rotasi aktif
  if (_rotEnabled) {
    if (_rotSequence.length < 2) {
      errEl.textContent = I18N.errRotMin2;
      errEl.hidden = false;
      return;
    }
    const seqTypes = _rotSequence.map((s) => s.type);
    const hasDup = seqTypes.length !== new Set(seqTypes).size;
    if (hasDup) {
      errEl.textContent = I18N.errRotDuplicate;
      errEl.hidden = false;
      return;
    }
    if (_allowedShiftTypes.length > 0) {
      const badItem = seqTypes.find((t) => !_allowedShiftTypes.includes(t));
      if (badItem) {
        errEl.textContent = I18N.errRotNotAllowed;
        errEl.hidden = false;
        return;
      }
    }
  }

  // Validasi kuota tukar shift: jika mode "Angka spesifik", wajib angka >= 0
  const _quotaModeLimited = $id("swap-quota-mode-limited")?.checked;
  if (_quotaModeLimited) {
    const _quotaVal = parseInt($id("dept-swap-quota")?.value, 10);
    if (!Number.isFinite(_quotaVal) || _quotaVal < 0) {
      errEl.textContent =
        I18N.errSwapQuotaInvalid ||
        "Kuota tukar shift harus berupa angka 0 atau lebih.";
      errEl.hidden = false;
      $id("dept-swap-quota")?.focus();
      return;
    }
    _swapQuotaMonthly = _quotaVal;
  } else {
    _swapQuotaMonthly = null;
  }

  const payload = {
    name,
    description: ($id("dept-desc").value || "").trim() || null,
    color: _selectedColor,
    default_shift_type: shift,
    rotation_enabled: _rotEnabled,
    allowed_shift_types: _allowedShiftTypes.length > 0 ? _allowedShiftTypes : null,
    rotation_sequence: _rotEnabled && _rotSequence.length >= 2
      ? _rotSequence.map((s) => s.type)
      : null,
    swap_quota_monthly: _swapQuotaMonthly,
  };

  console.log("[submitDept] payload →", JSON.stringify(payload, null, 2));

  // ── Loading state ─────────────────────────────────────────
  const btn = $id("btn-dept-submit");
  const spinner = btn.querySelector(".btn-spinner");
  const lbl = $id("btn-dept-label");
  btn.disabled = true;
  spinner.hidden = false;
  lbl.hidden = true;

  try {
    const isEdit = !!_editingId;
    const url = isEdit ? `${C.urls.update}${_editingId}` : C.urls.create;
    await _apiFetch(url, isEdit ? "PUT" : "POST", payload);

    closeDeptModal();
    _toast(I18N.savedOk);
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    errEl.textContent = err.message || I18N.errSave;
    errEl.hidden = false;
  } finally {
    spinner.hidden = true;
    lbl.hidden = false;
    btn.disabled = false;
  }
}

/* ────────────────────────────────────────────────────────────
   DEPT CRUD — DELETE
───────────────────────────────────────────────────────────── */

function confirmDeleteDept(id, name, empCount) {
  $id("ddel-id").value = id;
  if (empCount > 0) {
    $id("ddel-desc").innerHTML = I18N.deleteHasEmp.replace(
      "{n}",
      `<strong>${empCount}</strong>`,
    );
    $id("btn-ddel-submit").hidden = true;
  } else {
    $id("ddel-desc").innerHTML = I18N.deleteConfirm.replace("{name}", name);
    $id("btn-ddel-submit").hidden = false;
  }
  openModal("modal-dept-delete");
}

async function submitDeleteDept() {
  const id = $id("ddel-id").value;
  const btn = $id("btn-ddel-submit");
  const sp = btn.querySelector(".btn-spinner");
  const lbl = btn.querySelector(".btn-label");
  btn.disabled = true;
  sp.hidden = false;
  lbl.hidden = true;

  try {
    await _apiFetch(`${C.urls.delete}${id}`, "DELETE");
    closeModal("modal-dept-delete");
    _toast(I18N.deletedOk);
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    closeModal("modal-dept-delete");
    _toast(err.message || I18N.errConn, "error");
  }
}

/* ────────────────────────────────────────────────────────────
   MEMBERS MODAL — BUKA
───────────────────────────────────────────────────────────── */

async function openMembersModal(deptId, deptName, deptColor) {
  _currentDeptId = deptId;
  _currentDeptName = deptName;
  _currentDeptColor = deptColor || "#4f6ef7";
  _membersFilter = "all";

  // Reset UI
  $id("modal-members-title").textContent = deptName;
  $id("members-dept-name-sub").textContent = `${I18N.memberIdLabel}: ${deptId.substring(0, 8)}...`;

  const avatar = $id("members-dept-avatar");
  avatar.textContent = deptName.substring(0, 2).toUpperCase();
  avatar.style.background = _currentDeptColor;

  // Reset search & filter tabs
  $id("members-search").value = "";
  document.querySelectorAll(".members-filter-tab").forEach((t, i) => {
    t.classList.toggle("active", i === 0);
  });

  // Reset selection
  _clearSelection();

  // Mostrar skeleton, ocultar list
  $id("members-loading").style.display = "flex";
  $id("members-list").hidden = true;
  $id("members-empty").hidden = true;
  $id("members-footer-info").textContent = "—";

  openModal("modal-members");

  // Fetch semua karyawan (cache per session; re-fetch saat open berikutnya untuk freshness)
  try {
    _allEmployees = await _apiFetch(C.urls.allEmployees);
    _renderMembersList();
  } catch (err) {
    _toast(err.message || I18N.errConn, "error");
    closeModal("modal-members");
  }
}

function closeMembersModal() {
  closeModal("modal-members");
  _allEmployees = []; // clear cache supaya selalu fresh saat dibuka lagi
}

/* ────────────────────────────────────────────────────────────
   MEMBERS MODAL — RENDER
───────────────────────────────────────────────────────────── */

function _renderMembersList() {
  const list = $id("members-list");
  const loading = $id("members-loading");
  const empty = $id("members-empty");

  loading.style.display = "none";
  list.hidden = false;
  list.innerHTML = "";

  const filtered = _getFilteredEmployees();

  if (filtered.length === 0) {
    list.hidden = true;
    empty.hidden = false;
    $id("members-footer-info").textContent = I18N.membersFooterEmpty;
    return;
  }

  empty.hidden = true;

  filtered.forEach((emp) => {
    const inThisDept = emp.department_id === _currentDeptId;
    const hasOtherDept =
      emp.department_id && emp.department_id !== _currentDeptId;
    const color = _avatarColor(emp.full_name);

    const row = document.createElement("label");
    row.className = "member-item";
    row.dataset.userId = emp.id;
    row.dataset.deptId = emp.department_id || "";
    row.dataset.deptName = emp.department_name || "";
    row.dataset.name = (emp.full_name || "").toLowerCase();
    row.dataset.code = (emp.employee_code || "").toLowerCase();

    // Badge dept
    let deptBadge = "";
    if (inThisDept) {
      deptBadge = `<span class="member-dept-badge">${I18N.memberInThisDept}</span>`;
    } else if (hasOtherDept) {
      deptBadge = `<span class="member-dept-badge member-dept-badge-other">${emp.department_name || I18N.memberOtherDept}</span>`;
    } else {
      deptBadge = `<span class="member-dept-badge member-dept-badge-none">${I18N.memberUnassigned}</span>`;
    }

    row.innerHTML = `
      <input type="checkbox" class="member-cb" value="${emp.id}"
        onchange="onMemberCheck(this)" />
      <div class="member-avatar-sm" style="background:${color}">
        ${_initials(emp.full_name)}
      </div>
      <div class="member-info">
        <div class="member-name">${emp.full_name}</div>
        <div class="member-sub">${emp.employee_code ? `#${emp.employee_code} · ` : ""}${emp.email || ""}</div>
      </div>
      ${deptBadge}
    `;
    list.appendChild(row);
  });

  $id("members-footer-info").textContent =
    I18N.membersFooterInfo.replace("{n}", filtered.length);

  _syncBulkButtons();
}

/* ────────────────────────────────────────────────────────────
   MEMBERS MODAL — FILTER & SEARCH
───────────────────────────────────────────────────────────── */

function _getFilteredEmployees() {
  return _allEmployees.filter((emp) => {
    if (_membersFilter === "unassigned") return !emp.department_id;
    if (_membersFilter === "this_dept")
      return emp.department_id === _currentDeptId;
    return true;
  });
}

function setMembersFilter(filter, btn) {
  _membersFilter = filter;
  document
    .querySelectorAll(".members-filter-tab")
    .forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  $id("members-search").value = "";
  _clearSelection();
  _renderMembersList();
}

function filterMembers(q) {
  const v = q.toLowerCase().trim();
  const items = document.querySelectorAll(".member-item");
  items.forEach((row) => {
    const match =
      !v || row.dataset.name.includes(v) || row.dataset.code.includes(v);
    row.classList.toggle("is-hidden", !match);
  });
  _syncBulkButtons();
}

/* ────────────────────────────────────────────────────────────
   MEMBERS MODAL — SELECTION
───────────────────────────────────────────────────────────── */

function onMemberCheck(cb) {
  const row = cb.closest(".member-item");
  row?.classList.toggle("is-selected", cb.checked);
  _syncBulkButtons();
}

function toggleSelectAll(checked) {
  // Hanya select yang visible (tidak is-hidden)
  document
    .querySelectorAll(".member-item:not(.is-hidden) .member-cb")
    .forEach((cb) => {
      cb.checked = checked;
      cb.closest(".member-item")?.classList.toggle("is-selected", checked);
    });
  _syncBulkButtons();
}

function _clearSelection() {
  document.querySelectorAll(".member-cb").forEach((cb) => {
    cb.checked = false;
    cb.closest(".member-item")?.classList.remove("is-selected");
  });
  const saBtn = $id("cb-select-all");
  if (saBtn) saBtn.checked = false;
  _syncBulkButtons();
}

function _getSelectedIds() {
  return [...document.querySelectorAll(".member-cb:checked")].map(
    (cb) => cb.value,
  );
}

function _syncBulkButtons() {
  const ids = _getSelectedIds();
  const count = ids.length;
  const counter = $id("members-selected-count");
  if (counter) counter.textContent = I18N.nSelected.replace("{n}", count);

  const btnAssign = $id("btn-bulk-assign");
  const btnRemove = $id("btn-bulk-remove");
  if (btnAssign) btnAssign.disabled = count === 0;
  if (btnRemove) btnRemove.disabled = count === 0;
}

/* ────────────────────────────────────────────────────────────
   MEMBERS MODAL — BULK ASSIGN / REMOVE
───────────────────────────────────────────────────────────── */

async function bulkAssignToDept() {
  const ids = _getSelectedIds();
  if (ids.length === 0) return;

  const btn = $id("btn-bulk-assign");
  btn.disabled = true;
  btn.textContent = I18N.savingLabel;

  try {
    await _apiFetch(`${C.urls.members}${_currentDeptId}/members`, "PUT", {
      add: ids,
    });
    _toast(I18N.assignedOk);

    // Update _allEmployees cache secara lokal tanpa reload
    ids.forEach((id) => {
      const emp = _allEmployees.find((e) => e.id === id);
      if (emp) {
        emp.department_id = _currentDeptId;
        emp.department_name = _currentDeptName;
      }
    });
    _clearSelection();
    _renderMembersList();
  } catch (err) {
    _toast(err.message || I18N.errConn, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "";
    // Re-render button content (icon + text)
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ${I18N.assignBtnLabel}`;
  }
}

async function bulkRemoveFromDept() {
  const ids = _getSelectedIds();
  if (ids.length === 0) return;

  const btn = $id("btn-bulk-remove");
  btn.disabled = true;

  try {
    await _apiFetch(`${C.urls.members}${_currentDeptId}/members`, "PUT", {
      remove: ids,
    });
    _toast(I18N.removedOk);

    // Update cache lokal
    ids.forEach((id) => {
      const emp = _allEmployees.find((e) => e.id === id);
      if (emp) {
        emp.department_id = null;
        emp.department_name = null;
      }
    });
    _clearSelection();
    _renderMembersList();
  } catch (err) {
    _toast(err.message || I18N.errConn, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ────────────────────────────────────────────────────────────
   DEPARTMENT GRID — SEARCH & FILTER
   Client-side murni: jumlah departemen selalu kecil, jadi tidak
   perlu request ke server. Menggabungkan search teks + filter
   status rotasi sekaligus per kartu.
───────────────────────────────────────────────────────────── */

let _deptFilter = "all"; // "all" | "rotating" | "static"

function _applyDeptFilter() {
  const cards = document.querySelectorAll("#dept-grid .dept-card");
  const q = ($id("dept-search")?.value || "").toLowerCase().trim();
  let visibleCount = 0;

  cards.forEach((card) => {
    const nameMatch = !q || (card.dataset.deptName || "").includes(q);
    const isRotating = card.dataset.deptRotating === "true";
    const statusMatch =
      _deptFilter === "all" ||
      (_deptFilter === "rotating" && isRotating) ||
      (_deptFilter === "static" && !isRotating);
    const show = nameMatch && statusMatch;
    card.style.display = show ? "" : "none";
    if (show) visibleCount++;
  });

  const emptyState = $id("dept-search-empty");
  if (emptyState) emptyState.classList.toggle("show", visibleCount === 0);
}

function filterDeptCards() {
  _applyDeptFilter();
}

function setDeptFilter(filter, btn) {
  _deptFilter = filter;
  document
    .querySelectorAll(".dept-filter-chip")
    .forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  _applyDeptFilter();
}

function resetDeptFilter() {
  _deptFilter = "all";
  const search = $id("dept-search");
  if (search) search.value = "";
  document
    .querySelectorAll(".dept-filter-chip")
    .forEach((c) => c.classList.remove("active"));
  document.querySelector('.dept-filter-chip[data-dept-filter="all"]')
    ?.classList.add("active");
  _applyDeptFilter();
}

/* ────────────────────────────────────────────────────────────
   INIT — pasang event listener ke card buttons
───────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  // Init color picker
  selectColor(_selectedColor);

  // Tombol Edit
  document.querySelectorAll(".btn-dept-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.closest(".dept-card")?.dataset.deptId;
      const dept = id ? _deptMap[id] : null;
      if (dept) openEditModal(dept);
    });
  });

  // Tombol Anggota
  document.querySelectorAll(".btn-dept-members").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.deptId;
      const name = btn.dataset.deptName;
      const color = btn.dataset.deptColor;
      if (id) openMembersModal(id, name, color);
    });
  });

  // Tombol Hapus
  document.querySelectorAll(".btn-dept-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.closest(".dept-card")?.dataset.deptId;
      const dept = id ? _deptMap[id] : null;
      if (dept) confirmDeleteDept(dept.id, dept.name, dept.employee_count);
    });
  });
});