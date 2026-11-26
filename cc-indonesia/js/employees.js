/**
 * employees.js — Halaman Data Karyawan (Manager)
 * Letakkan di: static/js/employees.js
 *
 * VALIDASI INPUT (EmpV): semua form memakai validator terpusat; batas panjang
 *   disamakan dengan kolom di models.py. Ini hanya UX — server WAJIB
 *   menegakkan aturan yang sama (browser bisa dilewati dengan curl/Burp).
 * Config dibaca dari <script type="application/json" id="emp-config">
 *   (bukan lagi script inline), jadi halaman siap untuk CSP script-src 'self'.
 *
 * Fix BUG-7: Profile karyawan tidak bisa diubah
 *   - getCsrfToken() membaca dari meta tag ATAU window.EMP_CONFIG
 *   - apiFetch() helper memastikan SEMUA request PUT/POST/DELETE
 *     menyertakan X-CSRFToken dan Content-Type: application/json
 *   - saveAkun() sekarang memeriksa resp.ok sebelum menampilkan
 *     toast sukses — tidak lagi false positive saat server error
 *   - Baris di tabel ikut terupdate nama, email, status tanpa reload
 */

"use strict";

/* ── Config dari Jinja (ditulis di <script> inline di HTML) ─── */
function _loadEmpConfig() {
  const node = document.getElementById("emp-config");
  if (node) {
    try {
      const parsed = JSON.parse(node.textContent);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (_) {
      /* jatuh ke fallback di bawah */
    }
  }
  return window.EMP_CONFIG || {};
}
const _cfg = _loadEmpConfig();
const EMP_I18N = _cfg.i18n || {};
// Data shift & departemen dari JSON island (sebelumnya script inline)
window.__SHIFTS_FLAT__ = _cfg.shifts || window.__SHIFTS_FLAT__ || [];
window.__DEPT_DATA__ = _cfg.departments || window.__DEPT_DATA__ || [];

/* ── BUG-7 FIX: helper CSRF — baca meta tag ATAU EMP_CONFIG ─── */
function getCsrfToken() {
  // 1. Coba meta tag (direkomendasikan panduan)
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.getAttribute("content")) {
    return meta.getAttribute("content");
  }
  // 2. Fallback ke config yang dirender Jinja
  if (_cfg.csrf) return _cfg.csrf;
  // 3. Coba hidden input jika ada
  const inp = document.querySelector('input[name="csrf_token"]');
  if (inp) return inp.value;
  return "";
}

/* ── helper fetch dengan CSRF + JSON otomatis ─────────────────── */
async function apiFetch(url, method, body) {
  const _method = (method || "GET").toUpperCase();
  // GET & HEAD tidak boleh punya body, dan Content-Type tidak diperlukan.
  // Mengirim Content-Type: application/json pada GET bisa menyebabkan
  // Flask-WTF CSRF menolak request karena preflight tidak cocok.
  const headers = { "X-CSRFToken": getCsrfToken() };
  if (_method !== "GET" && _method !== "HEAD") {
    headers["Content-Type"] = "application/json";
  }
  const options = { method: _method, headers };
  if (body !== undefined && _method !== "GET" && _method !== "HEAD") {
    options.body = JSON.stringify(body);
  }
  return fetch(url, options);
}

/* ══════════════════════════════════════════════════════════════
   VALIDASI INPUT  (sisi klien — hanya UX, server wajib menegakkan ulang)
   Batas panjang disamakan dengan models.py:
     User.full_name String(150) · employee_code String(50) · phone String(20)
     PicoAccount.call_name String(100) · catatan = Text
   Kebijakan aplikasi: email ≤ 50, password ≤ 20.
   Tiap validator mengembalikan { value } atau { error }.
══════════════════════════════════════════════════════════════ */
const EmpV = (function () {
  const L = Object.freeze({
    NAME_MIN: 2,
    NAME_MAX: 150,
    EMAIL_MAX: 50,
    PASSWORD_MAX: 20,
    EMP_CODE_MAX: 50,
    PHONE_MIN_DIGITS: 8,
    PHONE_MAX_DIGITS: 15, // batas E.164
    CALLNAME_MAX: 100,
    NOTES_MAX: 500,
    REJECT_NOTE_MAX: 300,
    SEARCH_MAX: 50,
    SERVER_MSG_MAX: 300,
    HEIGHT: [100, 250],
    ARM: [30, 120],
    LEG: [40, 150],
  });

  // Karakter kontrol (NUL, CRLF, tab, DEL). Untuk textarea, \t \n \r diizinkan.
  const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;
  const TEXTAREA_CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

  // Whitelist
  const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
  const EMP_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9\-_/]*$/;
  // Sama dengan login.js: local part [A-Za-z0-9._%+-], domain berlabel, TLD ≥ 2 huruf
  const EMAIL_RE =
    /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
  const PHONE_CHARS_RE = /^\+?[\d\s\-().]+$/;
  const PHONE_RE = /^\+?\d{8,15}$/;
  const DECIMAL_RE = /^\d{1,3}(\.\d{1,2})?$/;

  /* Terjemahan dengan placeholder {n}, {min}, {max}, {label} */
  function T(key, fallback, vars) {
    let s = EMP_I18N[key] || fallback;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.split("{" + k + "}").join(String(vars[k]));
      });
    }
    return s;
  }
  function badChars() {
    return {
      error: T(
        "errInvalidChars",
        "Ada karakter yang nggak diizinkan di sini. Hapus dulu, terus ketik ulang ya.",
      ),
    };
  }
  const collapse = (s) => String(s).replace(/\s+/g, " ").trim();

  /* ── Validator per field ───────────────────────────────────── */
  function name(raw) {
    const v = collapse(raw);
    if (!v) return { error: T("errNameEmpty", "Nama lengkapnya belum diisi nih.") };
    if (CONTROL_CHARS_RE.test(v)) return badChars();
    if (v.length < L.NAME_MIN || v.length > L.NAME_MAX) {
      return {
        error: T("errNameLen", "Nama harus {min}–{max} karakter ya.", {
          min: L.NAME_MIN,
          max: L.NAME_MAX,
        }),
      };
    }
    if (!NAME_RE.test(v)) {
      return {
        error: T(
          "errNameInvalid",
          "Nama cuma boleh pakai huruf, spasi, titik, apostrof, dan tanda hubung ya.",
        ),
      };
    }
    return { value: v };
  }

  function email(raw) {
    const v = String(raw).trim().toLowerCase();
    if (!v) return { error: T("errEmailEmpty", "Emailnya belum diisi nih.") };
    if (CONTROL_CHARS_RE.test(v)) return badChars();
    if (v.length > L.EMAIL_MAX) {
      return {
        error: T(
          "errEmailTooLong",
          "Emailnya kepanjangan nih, maksimal {n} karakter ya.",
          { n: L.EMAIL_MAX },
        ),
      };
    }
    const invalid = {
      error: T(
        "errEmailInvalid",
        "Emailnya belum valid nih. Coba format kayak nama@perusahaan.com",
      ),
    };
    if (!EMAIL_RE.test(v) || v.includes("..")) return invalid;
    const local = v.slice(0, v.indexOf("@"));
    if (local.startsWith(".") || local.endsWith(".")) return invalid;
    return { value: v };
  }

  // Password TIDAK di-trim dan tidak dibatasi whitelist karakter.
  function password(pw) {
    const min = Math.max(1, parseInt(_cfg.passwordMinLength, 10) || 8);
    if (!pw)
      return { error: T("errPassEmpty", "Passwordnya belum diisi nih.") };
    if (CONTROL_CHARS_RE.test(pw)) return badChars();
    if (pw.length < min) {
      return {
        error: T(
          "errMinPass",
          "Password minimal {n} karakter ya, sekarang baru {len}.",
          { n: min, len: pw.length },
        ),
      };
    }
    if (pw.length > L.PASSWORD_MAX) {
      return {
        error: T(
          "errMaxPass",
          "Passwordnya kepanjangan nih, maksimal {n} karakter ya.",
          { n: L.PASSWORD_MAX },
        ),
      };
    }
    return { value: pw };
  }

  // Opsional. Pemisah (spasi - ( ) .) dibuang; hasil: "+"? diikuti 8–15 digit.
  function phone(raw) {
    const v = String(raw).trim();
    if (!v) return { value: null };
    if (CONTROL_CHARS_RE.test(v)) return badChars();
    const bad = {
      error: T(
        "errPhone",
        "Nomor teleponnya belum pas nih. Pakai 8–15 digit angka, boleh diawali +. Contoh: 081234567890",
      ),
    };
    if (!PHONE_CHARS_RE.test(v)) return bad;
    const norm = v.replace(/[\s\-().]/g, "");
    if (!PHONE_RE.test(norm)) return bad;
    return { value: norm };
  }

  function empCode(raw) {
    const v = String(raw).trim();
    if (!v) return { value: null };
    if (CONTROL_CHARS_RE.test(v)) return badChars();
    if (v.length > L.EMP_CODE_MAX || !EMP_CODE_RE.test(v)) {
      return {
        error: T(
          "errEmpCode",
          "Kode karyawan cuma boleh huruf, angka, -, _, dan / (maksimal {n} karakter) ya.",
          { n: L.EMP_CODE_MAX },
        ),
      };
    }
    return { value: v };
  }

  function callName(raw) {
    const v = collapse(raw);
    if (!v) return { value: null };
    if (CONTROL_CHARS_RE.test(v)) return badChars();
    if (v.length > L.CALLNAME_MAX || !NAME_RE.test(v)) {
      return {
        error: T(
          "errCallName",
          "Nama panggilan cuma boleh huruf, spasi, titik, apostrof, dan tanda hubung (maksimal {n} karakter) ya.",
          { n: L.CALLNAME_MAX },
        ),
      };
    }
    return { value: v };
  }

  // Input angka (tinggi/lengan/kaki). Opsional. Maks 2 desimal, dalam rentang.
  // el.validity.badInput menangkap teks non-angka yang oleh browser dibaca "".
  function measure(el, labelKey, labelFallback, range) {
    const bad = () => ({
      error: T(
        "errMeasure",
        "{label} harus angka {min}–{max} ya (maksimal 2 desimal).",
        { label: T(labelKey, labelFallback), min: range[0], max: range[1] },
      ),
    });
    if (el.validity && el.validity.badInput) return bad();
    const raw = el.value.trim();
    if (!raw) return { value: null };
    const n = Number(raw);
    if (
      !DECIMAL_RE.test(raw) ||
      !Number.isFinite(n) ||
      n < range[0] ||
      n > range[1]
    ) {
      return bad();
    }
    return { value: raw };
  }

  // Teks bebas (catatan). Opsional; wajib-tidaknya dicek pemanggil.
  function text(raw, max, errKey, errFallback) {
    const v = String(raw).trim();
    if (!v) return { value: null };
    if (TEXTAREA_CTRL_RE.test(v)) return badChars();
    if (v.length > max) return { error: T(errKey, errFallback, { n: max }) };
    return { value: v };
  }

  /* ── Data lama: nilai yang tidak diubah manajer tidak diblokir ─
     Mis. karyawan lama bernama "Budi (HR)" tetap bisa dinonaktifkan tanpa
     harus mengubah nama dulu. Nilai asli dicatat di data-orig saat detail
     dibuka (lihat openDetail). Hanya berlaku untuk nilai tidak kosong. */
  function legacyOk(el) {
    return (
      !!el &&
      el.value.trim() !== "" &&
      el.dataset.orig !== undefined &&
      el.value === el.dataset.orig
    );
  }

  /* ── Helper UI: pesan error tepat di bawah field ───────────── */
  // Pesan ditulis lewat textContent (aman dari XSS, juga untuk pesan server).
  function setFieldError(inputId, msg, host) {
    const el = document.getElementById(inputId);
    if (!el) return;
    const group = host || el.closest(".form-group") || el.parentElement;
    let err = document.getElementById(inputId + "-error");
    if (!err) {
      err = document.createElement("p");
      err.id = inputId + "-error";
      err.className = "field-error";
      err.setAttribute("role", "alert");
      group.appendChild(err);
    }
    err.textContent = msg;
    err.hidden = false;
    el.setAttribute("aria-invalid", "true");
    el.setAttribute("aria-describedby", err.id);
  }
  function clearFieldError(inputId) {
    const el = document.getElementById(inputId);
    if (el) {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    }
    const err = document.getElementById(inputId + "-error");
    if (err) {
      err.textContent = "";
      err.hidden = true;
    }
  }
  function focusField(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  // Kompatibel dengan pemanggil lama: tampilkan error field, fokus. true = ada error.
  function invalid(errId, inputId, res) {
    if (!res || !res.error) return false;
    setFieldError(inputId, res.error);
    focusField(inputId);
    return true;
  }
  function clear(scopeSel) {
    document.querySelectorAll(scopeSel + " [aria-invalid]").forEach((el) => {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
    document.querySelectorAll(scopeSel + " .field-error").forEach((e) => {
      e.textContent = "";
      e.hidden = true;
    });
    document
      .querySelectorAll(scopeSel + " [data-dirty]")
      .forEach((el) => delete el.dataset.dirty);
  }

  // Pesan error dari server: {"error": {"code","message"}} atau {"message"}.
  // Dipotong agar pesan panjang/aneh tidak merusak layout.
  function serverMessage(d) {
    if (!d || typeof d !== "object") return "";
    const raw = (d.error && d.error.message) || d.message;
    return typeof raw === "string" ? raw.slice(0, L.SERVER_MSG_MAX) : "";
  }

  return {
    L,
    name,
    email,
    password,
    phone,
    empCode,
    callName,
    measure,
    text,
    legacyOk,
    invalid,
    clear,
    setFieldError,
    clearFieldError,
    focusField,
    serverMessage,
    stripControl: (s) => String(s).replace(/[\u0000-\u001F\u007F]/g, ""),
  };
})();

/* ══════════════════════════════════════════════════════════════
   ATURAN PER-FIELD  (id input → fungsi validasi)
   Dipakai bersama oleh: validasi saat submit, saat keluar dari field (blur),
   dan saat mengetik ulang. Hasil: { value } atau { error }.
══════════════════════════════════════════════════════════════ */
const FIELD_RULES = (function () {
  const tr = (k, f) => EMP_I18N[k] || f;
  const $ = (id) => document.getElementById(id);
  const required = (key, fb) => (el) =>
    el.value ? { value: el.value } : { error: tr(key, fb) };
  // Data lama yang tidak diubah manajer tidak diblokir (lihat EmpV.legacyOk)
  const keepLegacy = (fn) => (el) =>
    EmpV.legacyOk(el) ? { value: el.value.trim() } : fn(el.value);
  const measure = (key, fb, range) => (el) => EmpV.measure(el, key, fb, range);
  const hasValue = (id) => {
    const o = $(id);
    return !!o && String(o.value).trim() !== "";
  };

  return {
    /* Tambah karyawan */
    "add-name": (el) => EmpV.name(el.value),
    "add-email": (el) => EmpV.email(el.value),
    "add-password": (el) => EmpV.password(el.value),
    "add-dept-id": required("errDeptRequired", "Pilih departemennya dulu ya."),
    "add-phone": (el) => EmpV.phone(el.value),
    "add-office": required("errOfficeRequired", "Pilih kantor utamanya dulu ya."),
    "add-pico-username": (el) => {
      const v = el.value.trim();
      if (v) return { value: v };
      const others = [
        "add-pico-callname",
        "add-pico-gender",
        "add-pico-height",
        "add-pico-arm",
        "add-pico-leg",
      ].some(hasValue);
      return others
        ? {
            error: tr(
              "errPicoUsernameNeeded",
              "Data Pico sudah terisi, tinggal tambah Username Pico-nya ya. Atau kosongin dulu data Pico lainnya.",
            ),
          }
        : { value: null };
    },
    "add-pico-callname": (el) => EmpV.callName(el.value),
    "add-pico-height": measure("lblHeight", "Tinggi badan", EmpV.L.HEIGHT),
    "add-pico-arm": measure("lblArm", "Panjang lengan", EmpV.L.ARM),
    "add-pico-leg": measure("lblLeg", "Panjang kaki", EmpV.L.LEG),

    /* Detail → tab Akun */
    "det-full-name": keepLegacy(EmpV.name),
    "det-emp-code": keepLegacy(EmpV.empCode),
    "det-dept-id": required("errDeptRequired", "Pilih departemennya dulu ya."),
    "det-phone": keepLegacy(EmpV.phone),

    /* Detail → tab Pico */
    "det-pico-username": (el) =>
      el.value.trim()
        ? { value: el.value.trim() }
        : { error: tr("errPicoUsername", "Username Pico-nya belum diisi nih.") },
    "det-pico-callname": keepLegacy(EmpV.callName),
    "det-pico-height": measure("lblHeight", "Tinggi badan", EmpV.L.HEIGHT),
    "det-pico-arm": measure("lblArm", "Panjang lengan", EmpV.L.ARM),
    "det-pico-leg": measure("lblLeg", "Panjang kaki", EmpV.L.LEG),
    "det-pico-notes": (el) =>
      EmpV.text(
        el.value,
        EmpV.L.NOTES_MAX,
        "errNotesLen",
        "Catatannya kepanjangan nih, maksimal {n} karakter ya.",
      ),

    /* Reset password */
    "reset-password": (el) => EmpV.password(el.value),
  };
})();

// Validasi satu field: tampilkan / hapus pesan di bawahnya.
function validateField(id) {
  const el = document.getElementById(id);
  const rule = FIELD_RULES[id];
  if (!el || !rule) return null;
  const res = rule(el);
  if (res.error) EmpV.setFieldError(id, res.error);
  else EmpV.clearFieldError(id);
  return res;
}

// Validasi banyak field sekaligus (urut sesuai tampilan): SEMUA error ditampilkan,
// fokus ke yang pertama. Mengembalikan { ok, count, results }.
function validateFields(ids) {
  const results = {};
  let first = null;
  let count = 0;
  ids.forEach((id) => {
    const r = validateField(id);
    results[id] = r;
    if (r && r.error) {
      count += 1;
      if (!first) first = id;
    }
  });
  if (first) EmpV.focusField(first);
  return { ok: count === 0, count, results };
}

// Error dari server. Jika server menyebut field-nya ({"error": {"field": "email"}}),
// pesan tampil tepat di bawah field itu; jika tidak, tampil di banner form.
function showServerError(d, errId, fieldMap) {
  const msg = EmpV.serverMessage(d) || EMP_I18N.errSave;
  const f = d && d.error && typeof d.error.field === "string" ? d.error.field : "";
  const inputId = fieldMap && Object.prototype.hasOwnProperty.call(fieldMap, f) ? fieldMap[f] : "";
  if (inputId && document.getElementById(inputId)) {
    EmpV.setFieldError(inputId, msg);
    EmpV.focusField(inputId);
  } else {
    showError(errId, msg);
  }
}
const ADD_FIELD_MAP = {
  full_name: "add-name",
  email: "add-email",
  password: "add-password",
  department_id: "add-dept-id",
  phone: "add-phone",
  office_id: "add-office",
  pico_username: "add-pico-username",
  pico_call_name: "add-pico-callname",
};
const AKUN_FIELD_MAP = {
  full_name: "det-full-name",
  employee_code: "det-emp-code",
  department_id: "det-dept-id",
  phone: "det-phone",
};
const PICO_FIELD_MAP = {
  pico_username: "det-pico-username",
  call_name: "det-pico-callname",
  height_cm: "det-pico-height",
  arm_length_cm: "det-pico-arm",
  leg_length_cm: "det-pico-leg",
  notes: "det-pico-notes",
};

// Ringkasan di dekat tombol Simpan (selalu terlihat, tidak ikut ter-scroll).
function formSummary(n) {
  const s =
    EMP_I18N.errFormInvalid ||
    "Dikit lagi! Ada {n} isian yang perlu dibenerin, cek yang bertanda merah ya.";
  return s.split("{n}").join(String(n));
}

/* ── State global modal detail ─────────────────────────────── */
let detUserId = null;
let detHasPico = false;

/* ══════════════════════════════════════════════════════════════
   DEPT → SHIFT AUTO-SELECT (form tambah karyawan)
   Saat departemen dipilih, isi dropdown "Shift Awal" otomatis
   berdasarkan default_shift_type dari __DEPT_DATA__.
══════════════════════════════════════════════════════════════ */
function onAddDeptChange(deptId) {
  const shiftSel = document.getElementById("add-shift");
  const shiftHint = document.getElementById("add-shift-hint");
  if (!shiftSel) return;

  const shifts = window.__SHIFTS_FLAT__ || [];
  const depts = window.__DEPT_DATA__ || [];

  // Reset dropdown
  shiftSel.innerHTML = '<option value="">— Otomatis dari Departemen —</option>';

  if (!deptId) {
    if (shiftHint)
      shiftHint.textContent =
        "Pilih departemen untuk menentukan shift default.";
    return;
  }

  const dept = depts.find((d) => d.id === deptId);
  const defaultType = dept ? dept.default_shift_type : null;

  // Isi semua opsi shift dari SHIFTS_FLAT
  shifts.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.type_label + " · " + s.time_range;
    opt.dataset.type = s.type;
    shiftSel.appendChild(opt);
  });

  // Auto-select shift default sesuai departemen
  if (defaultType) {
    const match = [...shiftSel.options].find(
      (o) => o.dataset.type === defaultType,
    );
    if (match) {
      shiftSel.value = match.value;
      if (shiftHint)
        shiftHint.textContent =
          'Shift "' +
          match.textContent +
          '" dipilih otomatis dari departemen "' +
          (dept ? dept.name : "") +
          '". Dapat diubah jika perlu.';
    }
  } else {
    if (shiftHint)
      shiftHint.textContent = "Pilih shift awal untuk karyawan ini.";
  }
}

/* ══════════════════════════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════════════════════════ */
function openModal(id) {
  document.getElementById(id).classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
  document.body.style.overflow = "";
  const err = document.querySelector("#" + id + " .form-error");
  if (err) {
    err.textContent = "";
    err.hidden = true;
  }
  document
    .querySelectorAll("#" + id + " .det-toast")
    .forEach((t) => t.remove());
  EmpV.clear("#" + id);
}

document.querySelectorAll(".modal-overlay").forEach((el) => {
  el.addEventListener("click", (e) => {
    if (e.target === el) closeModal(el.id);
  });
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    document
      .querySelectorAll(".modal-overlay.open")
      .forEach((el) => closeModal(el.id));
});

/* ── Aksi baris tabel lewat data-attribute ──────────────────
   Menggantikan onclick="openReset('id','{{ nama }}')" yang menyisipkan nama
   karyawan ke dalam string JS. Browser men-decode &#39; kembali menjadi '
   sebelum JS dijalankan, jadi nama seperti  x');alert(1);//  lolos dari
   escape HTML dan menjadi stored XSS. Nilai dataset hanya dibaca sebagai
   string dan tidak pernah dieksekusi. */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-emp-action]");
  if (!btn) return;
  const { empAction, userId, userName } = btn.dataset;
  if (empAction === "detail") openDetail(userId);
  else if (empAction === "reset") openReset(userId, userName || "");
  else if (empAction === "delete") confirmDelete(userId, userName || "");
});

/* ── Validasi langsung saat mengisi ────────────────────────────
   • Keluar dari field (blur): cek, tampilkan alasan jika salah. Field kosong
     yang belum pernah diisi tidak ditegur dulu (baru saat menekan Simpan).
   • Pilihan dropdown (change): cek langsung.
   • Mengetik di field yang sedang error: pesan ikut diperbarui, hilang begitu benar.
   • Mengetik apa pun di form: sembunyikan banner error server yang lama. */
document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t || !t.id) return;
  if (t.id.indexOf("bvnote-") === 0) EmpV.clearFieldError(t.id);
  if (FIELD_RULES[t.id]) t.dataset.dirty = "1";
  if (t.hasAttribute("aria-invalid") && FIELD_RULES[t.id]) validateField(t.id);
  // username Pico bergantung pada kolom Pico lain
  if (t.id.indexOf("add-pico-") === 0 && t.id !== "add-pico-username") {
    const u = document.getElementById("add-pico-username");
    if (u && u.hasAttribute("aria-invalid")) validateField("add-pico-username");
  }
  if (FIELD_RULES[t.id]) {
    const scope = t.closest(".modal-box, .det-tab-panel");
    const banner = scope && scope.querySelector(".form-error");
    if (banner && !banner.hidden) hideError(banner.id);
  }
});
document.addEventListener("focusout", (e) => {
  const t = e.target;
  if (!t || !t.id || !FIELD_RULES[t.id] || t.tagName === "SELECT") return;
  if (t.dataset.dirty || String(t.value).trim() !== "") validateField(t.id);
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t && t.id && FIELD_RULES[t.id] && t.tagName === "SELECT")
    validateField(t.id);
});

/* ── Kolom cari: buang karakter kontrol, rapikan spasi, batasi panjang ── */
(function () {
  const form = document.querySelector(".emp-search-form");
  if (!form) return;
  // Ganti filter status -> langsung terapkan (tanpa tombol), nilai q ikut dirapikan oleh handler submit.
  form.addEventListener("change", (e) => {
    if (e.target && e.target.name === "status") form.requestSubmit();
  });
  form.addEventListener("submit", () => {
    const inp = form.querySelector('input[name="q"]');
    if (!inp) return;
    inp.value = EmpV.stripControl(inp.value)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, EmpV.L.SEARCH_MAX);
  });
})();

/* ── Toggle password ────────────────────────────────────────── */
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  const isText = inp.type === "text";
  inp.type = isText ? "password" : "text";
  btn.querySelector(".icon-eye").style.opacity = isText ? "1" : "0.4";
}

/* ── Loading helpers ────────────────────────────────────────── */
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.querySelector(".btn-label").hidden = loading;
  btn.querySelector(".btn-spinner").hidden = !loading;
}
function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest" });
}
function hideError(elId) {
  const el = document.getElementById(elId);
  if (el) {
    el.textContent = "";
    el.hidden = true;
  }
}

/* ── Tab switching ──────────────────────────────────────────── */
function switchTab(btn, tabId) {
  if (!document.getElementById("det-loading").hidden) return;
  document
    .querySelectorAll(".det-tab")
    .forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".det-tab-panel").forEach((p) => (p.hidden = true));
  document.getElementById(tabId).hidden = false;
}

/* ── Toast di dalam modal ───────────────────────────────────── */
function showToast(msg, isError) {
  document.querySelectorAll(".det-toast").forEach((t) => t.remove());
  const box = document.querySelector("#modal-detail .modal-box");
  const toast = document.createElement("div");
  toast.className = "det-toast" + (isError ? " det-toast-error" : "");
  const icon = isError
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>`;
  toast.innerHTML = icon; // icon = SVG konstan di atas, aman
  // msg bisa berasal dari server (d.message, d.new_shift_label) → text node,
  // bukan innerHTML, supaya tidak pernah diparse sebagai HTML.
  toast.appendChild(document.createTextNode(" " + msg));
  box.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

/* ── Status toggle label ────────────────────────────────────── */
document.getElementById("det-active").addEventListener("change", function () {
  document.getElementById("det-toggle-text").textContent = this.checked
    ? EMP_I18N.activeLabel
    : EMP_I18N.inactiveLabel;
});

/* ══════════════════════════════════════════════════════════════
   OPEN DETAIL
══════════════════════════════════════════════════════════════ */
function openDetail(userId) {
  detUserId = userId;
  detHasPico = false;

  // Reset UI
  document.getElementById("det-loading").hidden = false;
  document.querySelectorAll(".det-tab-panel").forEach((p) => (p.hidden = true));
  document
    .querySelectorAll(".det-tab")
    .forEach((t) => t.classList.remove("active"));
  const firstTab = document.querySelector(".det-tab[data-tab='tab-akun']");
  if (firstTab) firstTab.classList.add("active");

  document.getElementById("det-avatar-text").textContent = "--";
  document.querySelector("#modal-detail-title").textContent = "…";
  document.getElementById("det-email-sub").textContent = "";

  openModal("modal-detail");

  // BUG-1 FIX: gunakan apiFetch() agar X-CSRFToken selalu disertakan,
  // sehingga Flask tidak menolak request dengan 400/403 CSRF error.
  apiFetch("/manager/employees/" + userId + "/detail", "GET")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((data) => {
      document.getElementById("det-loading").hidden = true;
      document.getElementById("tab-akun").hidden = false;

      try {
        const u = data.user;
        const pa = data.pico_account;
        const ba = data.bank_accounts;

        // Header
        const initials =
          (u.full_name || "")
            .trim()
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "--";
        document.getElementById("det-avatar-text").textContent = initials;
        document.querySelector("#modal-detail-title").textContent =
          u.full_name || "—";
        document.getElementById("det-email-sub").textContent = u.email || "";

        // Read-only
        document.getElementById("det-user-id").textContent = u.id || "—";
        document.getElementById("det-last-login").textContent =
          u.last_login_at || "—";
        document.getElementById("det-created-at").textContent =
          u.created_at || "—";
        document.getElementById("det-office").textContent = u.primary_office
          ? u.primary_office.name
          : "—";

        // Editable
        document.getElementById("det-full-name").value = u.full_name || "";
        // Email read-only — tampilkan sebagai teks, tidak dikirim saat save
        const emailEl = document.getElementById("det-email");
        if (emailEl) {
          if (emailEl.tagName === "INPUT") emailEl.value = u.email || "";
          else emailEl.textContent = u.email || "—";
        }
        document.getElementById("det-emp-code").value = u.employee_code || "";
        // Set dropdown departemen — pakai department_id dari response
        const deptSelect = document.getElementById("det-dept-id");
        if (deptSelect) deptSelect.value = u.department_id || "";
        document.getElementById("det-phone").value = u.phone || "";

        const cb = document.getElementById("det-active");
        cb.checked = !!u.is_active;
        document.getElementById("det-toggle-text").textContent = u.is_active
          ? EMP_I18N.activeLabel
          : EMP_I18N.inactiveLabel;

        _fillPicoTab(pa);
        _fillRekeningTab(ba);

        // Catat nilai asli untuk validasi "data lama" (lihat EmpV.legacyOk)
        [
          "det-full-name",
          "det-emp-code",
          "det-phone",
          "det-pico-callname",
        ].forEach((id) => {
          const el = document.getElementById(id);
          if (el) el.dataset.orig = el.value;
        });
      } catch (e) {
        console.error("[openDetail] JS error saat mengisi form:", e);
        // BUG-4 FIX: tampilkan nama error di header agar tidak stuck di '--'/'...'
        document.getElementById("det-avatar-text").textContent = "!";
        document.querySelector("#modal-detail-title").textContent =
          EMP_I18N.errConn || "Gagal memuat data";
        document.getElementById("det-loading").hidden = true;
        document.getElementById("tab-akun").hidden = false;
        showError("det-akun-error", EMP_I18N.errConn);
      }
    })
    .catch((err) => {
      console.error("[openDetail] Fetch error:", err);
      // BUG-4 FIX: reset header agar tidak stuck di '--'/'...'
      document.getElementById("det-avatar-text").textContent = "!";
      document.querySelector("#modal-detail-title").textContent =
        EMP_I18N.errConn || "Koneksi bermasalah";
      document.getElementById("det-loading").hidden = true;
      document.getElementById("tab-akun").hidden = false;
      showError("det-akun-error", EMP_I18N.errConn);
    });
}

/* ══════════════════════════════════════════════════════════════
   SAVE AKUN  ← BUG-7 FIXED
   - apiFetch memastikan X-CSRFToken selalu disertakan
   - resp.ok WAJIB true sebelum tampilkan toast sukses
   - Baris tabel ikut diupdate nama/status tanpa page reload
══════════════════════════════════════════════════════════════ */
async function saveAkun() {
  hideError("det-akun-error");
  EmpV.clear("#tab-akun");

  const v = validateFields([
    "det-full-name",
    "det-emp-code",
    "det-dept-id",
    "det-phone",
  ]);
  if (!v.ok) {
    showError("det-akun-error", formSummary(v.count));
    return;
  }
  const r = v.results;
  const deptId = r["det-dept-id"].value;
  const name = r["det-full-name"].value;
  const empCode = r["det-emp-code"].value;
  const phone = r["det-phone"].value;
  const isActive = document.getElementById("det-active").checked;

  setLoading("btn-det-akun-save", true);

  try {
    const resp = await apiFetch("/manager/employees/" + detUserId, "PUT", {
      full_name: name,
      employee_code: empCode,
      department_id: deptId,
      phone,
      is_active: isActive,
    });

    const d = await resp.json();
    setLoading("btn-det-akun-save", false);

    if (resp.ok && d.status === "ok") {
      // Jika dept berubah dan shift ikut diupdate, tampilkan di toast
      const toastMsg = d.shift_updated
        ? EMP_I18N.savedOk + " Shift diperbarui ke " + d.new_shift_label + "."
        : EMP_I18N.savedOk;
      showToast(toastMsg);

      // Update header modal
      document.querySelector("#modal-detail-title").textContent = name;
      const initials = name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      document.getElementById("det-avatar-text").textContent = initials;

      // Update baris di tabel langsung (tanpa reload)
      _updateTableRow(detUserId, {
        full_name: name,
        is_active: isActive,
        department_id: deptId,
      });
    } else {
      // Server menolak — tampilkan pesan error dari backend
      showServerError(d, "det-akun-error", AKUN_FIELD_MAP);
      console.warn("[saveAkun] Server error:", d);
    }
  } catch (err) {
    setLoading("btn-det-akun-save", false);
    showError("det-akun-error", EMP_I18N.errConn);
    console.error("[saveAkun] Network error:", err);
  }
}

/* Helper: update baris tabel setelah simpan berhasil */
function _updateTableRow(userId, data) {
  const row = document.querySelector(`tr[data-user-id="${userId}"]`);
  if (!row) return;

  const nameEl = row.querySelector(".emp-fullname");
  if (nameEl) nameEl.textContent = data.full_name;

  // Update kolom departemen di tabel — cari nama dari __DEPT_DATA__
  const deptCell = row.querySelector(".td-dept");
  if (deptCell && data.department_id) {
    const deptMap = {};
    (window.__DEPT_DATA__ || []).forEach((d) => {
      deptMap[d.id] = d.name;
    });
    deptCell.textContent = deptMap[data.department_id] || "—";
  }

  // Update avatar inisial
  const avatarEl = row.querySelector(".emp-avatar");
  if (avatarEl) {
    const initials = data.full_name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    avatarEl.textContent = initials;
  }

  // Update status pill
  const pillEl = row.querySelector(".status-pill");
  if (pillEl) {
    if (data.is_active) {
      pillEl.className = "status-pill pill-present";
      pillEl.textContent = EMP_I18N.activeLabel;
      row.classList.remove("row-inactive");
    } else {
      pillEl.className = "status-pill pill-absent";
      pillEl.textContent = EMP_I18N.inactiveLabel;
      row.classList.add("row-inactive");
    }
  }

  // Update avatar class
  if (avatarEl) {
    if (data.is_active) avatarEl.classList.remove("avatar-inactive");
    else avatarEl.classList.add("avatar-inactive");
  }
}

/* ══════════════════════════════════════════════════════════════
   SAVE PICO
══════════════════════════════════════════════════════════════ */
async function savePico() {
  hideError("det-pico-error");
  EmpV.clear("#tab-pico");

  const v = validateFields([
    "det-pico-username",
    "det-pico-callname",
    "det-pico-height",
    "det-pico-arm",
    "det-pico-leg",
    "det-pico-notes",
  ]);
  if (!v.ok) {
    showError("det-pico-error", formSummary(v.count));
    return;
  }
  const r = v.results;
  const payload = {
    pico_username: r["det-pico-username"].value,
    call_name: r["det-pico-callname"].value,
    gender: document.getElementById("det-pico-gender").value || null,
    height_cm: r["det-pico-height"].value,
    arm_length_cm: r["det-pico-arm"].value,
    leg_length_cm: r["det-pico-leg"].value,
    status: document.getElementById("det-pico-status").value,
    notes: r["det-pico-notes"].value,
  };

  setLoading("btn-det-pico-save", true);

  try {
    const resp = await apiFetch(
      "/manager/employees/" + detUserId + "/pico",
      "PUT",
      payload,
    );
    const d = await resp.json();
    setLoading("btn-det-pico-save", false);

    if (resp.ok && d.status === "ok") {
      showToast(detHasPico ? EMP_I18N.savedOk : EMP_I18N.picoCreated);
      if (!detHasPico) {
        detHasPico = true;
        document.getElementById("pico-empty-banner").hidden = true;
        document.getElementById("pico-username-hint").hidden = false;
        document.getElementById("btn-pico-label").textContent =
          EMP_I18N.savePicoLabel;
      }
    } else {
      showServerError(d, "det-pico-error", PICO_FIELD_MAP);
    }
  } catch (err) {
    setLoading("btn-det-pico-save", false);
    showError("det-pico-error", EMP_I18N.errConn);
    console.error("[savePico] Network error:", err);
  }
}

/* ══════════════════════════════════════════════════════════════
   TAMBAH KARYAWAN  (BUG-4: sertakan shift_id)
══════════════════════════════════════════════════════════════ */
async function submitAdd() {
  hideError("add-error");
  EmpV.clear("#modal-add");

  const v = validateFields([
    "add-name",
    "add-email",
    "add-password",
    "add-dept-id",
    "add-phone",
    "add-office",
    "add-pico-username",
    "add-pico-callname",
    "add-pico-height",
    "add-pico-arm",
    "add-pico-leg",
  ]);
  if (!v.ok) {
    showError("add-error", formSummary(v.count));
    return;
  }
  const r = v.results;
  const shift = document.getElementById("add-shift")?.value || null; // BUG-4

  const body = {
    full_name: r["add-name"].value,
    email: r["add-email"].value,
    password: r["add-password"].value,
    department_id: r["add-dept-id"].value,
    phone: r["add-phone"].value,
    office_id: r["add-office"].value,
    shift_id: shift || null,
  };
  if (r["add-pico-username"].value) {
    body.pico_username = r["add-pico-username"].value;
    body.pico_call_name = r["add-pico-callname"].value;
    body.pico_gender = document.getElementById("add-pico-gender").value || null;
    body.pico_height_cm = r["add-pico-height"].value;
    body.pico_arm_length_cm = r["add-pico-arm"].value;
    body.pico_leg_length_cm = r["add-pico-leg"].value;
  }

  setLoading("btn-add-submit", true);

  try {
    const resp = await apiFetch("/manager/employees", "POST", body);
    const d = await resp.json();
    setLoading("btn-add-submit", false);

    if (resp.ok && d.status === "ok") {
      // BUG-5 FIX: langsung reload, info shift sudah ada di toast setelah reload
      location.reload();
    } else {
      showServerError(d, "add-error", ADD_FIELD_MAP);
    }
  } catch (err) {
    setLoading("btn-add-submit", false);
    showError("add-error", EMP_I18N.errConn);
    console.error("[submitAdd] Network error:", err);
  }
}

/* ══════════════════════════════════════════════════════════════
   RESET PASSWORD
══════════════════════════════════════════════════════════════ */
function openReset(id, name) {
  document.getElementById("reset-id").value = id;
  document.getElementById("reset-name").textContent = name;
  document.getElementById("reset-password").value = "";
  hideError("reset-error");
  EmpV.clear("#modal-reset");
  openModal("modal-reset");
}

async function submitReset() {
  const id = document.getElementById("reset-id").value;
  const pw = document.getElementById("reset-password").value;

  // Panjang minimal dibaca dari _cfg.passwordMinLength (default 8, sama dengan
  // AccountService.reset_password_as). Batas atas 20 mengikuti kebijakan login:
  // password > 20 karakter tidak akan bisa dipakai masuk.
  hideError("reset-error");
  EmpV.clear("#modal-reset");
  if (!validateFields(["reset-password"]).ok) return;

  setLoading("btn-reset-submit", true);

  try {
    const resp = await apiFetch(
      "/manager/employees/" + id + "/reset-password",
      "POST",
      { new_password: pw },
    );
    const d = await resp.json();
    setLoading("btn-reset-submit", false);

    if (resp.ok && d.status === "ok") {
      closeModal("modal-reset");
      // BUG-7 FIX: ganti alert() dengan toast di halaman (tidak blocking)
      // Toast di luar modal — gunakan banner sementara di halaman
      const banner = document.createElement("div");
      banner.className = "page-success-toast";
      banner.textContent = EMP_I18N.resetOk || d.message;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 4000);
    } else {
      // PERBAIKAN: error sekarang berbentuk {"error": {"code","message"}}
      // (handler global AppError di core.py), bukan lagi {"message": "..."}
      // di top level. d.message akan selalu undefined tanpa baris ini —
      // pesan asli dari server (mis. "target di luar cakupan") tidak
      // pernah tampil, selalu jatuh ke fallback generik.
      showServerError(d, "reset-error", { new_password: "reset-password" });
    }
  } catch (err) {
    setLoading("btn-reset-submit", false);
    showError("reset-error", EMP_I18N.errConn);
    console.error("[submitReset] Network error:", err);
  }
}

/* ══════════════════════════════════════════════════════════════
   NONAKTIFKAN
══════════════════════════════════════════════════════════════ */
function confirmDelete(id, name) {
  document.getElementById("delete-id").value = id;
  document.getElementById("delete-name").textContent = name;
  openModal("modal-delete");
}

async function submitDelete() {
  const id = document.getElementById("delete-id").value;
  setLoading("btn-delete-submit", true);

  try {
    // BUG-6 FIX: gunakan apiFetch agar CSRF disertakan, dan tampilkan error jika gagal
    const resp = await apiFetch("/manager/employees/" + id, "DELETE");
    setLoading("btn-delete-submit", false);
    if (resp.ok) {
      location.reload();
    } else {
      let msg = EMP_I18N.errSave || "Gagal menonaktifkan karyawan.";
      try {
        const d = await resp.json();
        const sm = EmpV.serverMessage(d);
        if (sm) msg = sm;
      } catch (_) {}
      closeModal("modal-delete");
      // Tampilkan error di halaman jika modal sudah ditutup
      const pageErr = document.getElementById("emp-page-error");
      if (pageErr) {
        pageErr.textContent = msg;
        pageErr.hidden = false;
        setTimeout(() => {
          pageErr.hidden = true;
        }, 5000);
      } else {
        // Fallback: buka kembali modal dan tunjukkan error
        openModal("modal-delete");
        showError("delete-error", msg);
      }
    }
  } catch (err) {
    setLoading("btn-delete-submit", false);
    showError("delete-error", EMP_I18N.errConn || "Koneksimu lagi bermasalah nih. Cek internet dulu, terus coba lagi ya.");
    console.error("[submitDelete] Network error:", err);
  }
}

/* ══════════════════════════════════════════════════════════════
   FILL HELPERS
══════════════════════════════════════════════════════════════ */
function _fillPicoTab(pa) {
  if (pa) {
    detHasPico = true;
    document.getElementById("pico-empty-banner").hidden = true;
    document.getElementById("det-pico-id").textContent = pa.id;
    document.getElementById("det-pico-device").textContent =
      pa.current_pico || "—";
    document.getElementById("det-pico-username").value = pa.pico_username;
    document.getElementById("pico-username-hint").hidden = false;
    document.getElementById("btn-pico-label").textContent =
      EMP_I18N.savePicoLabel;
    document.getElementById("det-pico-callname").value = pa.call_name || "";
    document.getElementById("det-pico-gender").value = pa.gender || "";
    document.getElementById("det-pico-height").value = pa.height_cm || "";
    document.getElementById("det-pico-arm").value = pa.arm_length_cm || "";
    document.getElementById("det-pico-leg").value = pa.leg_length_cm || "";
    document.getElementById("det-pico-status").value = pa.status;
    document.getElementById("det-pico-notes").value = pa.notes || "";
  } else {
    detHasPico = false;
    document.getElementById("pico-empty-banner").hidden = false;
    document.getElementById("det-pico-id").textContent = "—";
    document.getElementById("det-pico-device").textContent = "—";
    document.getElementById("det-pico-username").value = "";
    document.getElementById("pico-username-hint").hidden = true;
    document.getElementById("btn-pico-label").textContent =
      EMP_I18N.createPicoLabel;
    [
      "det-pico-callname",
      "det-pico-height",
      "det-pico-arm",
      "det-pico-leg",
      "det-pico-notes",
    ].forEach((id) => {
      document.getElementById(id).value = "";
    });
    document.getElementById("det-pico-gender").value = "";
    document.getElementById("det-pico-status").value = "active";
  }
}

function _fillRekeningTab(accounts) {
  const wrap = document.getElementById("bank-list-wrap");
  const empty = document.getElementById("bank-empty-banner");
  wrap.innerHTML = "";

  if (!accounts || accounts.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  /* Icon per tipe rekening */
  const typeIcons = {
    bank: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
    gopay: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`,
    ovo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`,
    dana: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`,
    default: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>`,
  };

  /* Status badge config */
  const statusCfg = {
    verified: { label: EMP_I18N.verifiedLabel, cls: "bank-badge-verified" },
    rejected: { label: EMP_I18N.rejectedLabel, cls: "bank-badge-rejected" },
    needs_reverify: {
      label: EMP_I18N.needsReverifyLabel,
      cls: "bank-badge-reverify",
    },
    pending: { label: EMP_I18N.pendingLabel, cls: "bank-badge-pending" },
  };

  accounts.forEach((ba) => {
    const icon = typeIcons[ba.account_type] || typeIcons.default;
    const badges = [];

    if (ba.is_primary)
      badges.push(
        `<span class="bank-badge bank-badge-primary">${EMP_I18N.primaryLabel}</span>`,
      );

    const scfg = statusCfg[ba.verification_status] || statusCfg.pending;
    badges.push(`<span class="bank-badge ${scfg.cls}">${scfg.label}</span>`);

    /* Rejection note display */
    const rejNoteHtml = ba.rejection_note
      ? `<div class="bank-reject-note">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           ${_esc(ba.rejection_note)}
         </div>`
      : "";

    /* Verify / Tolak button area (hanya untuk rekening yang belum/perlu/ditolak) */
    let actionHtml = "";
    if (ba.verification_status !== "verified") {
      actionHtml = `
      <div class="bank-action-row" id="bank-actions-${ba.id}">
        <button class="btn-bank-verify" onclick="verifyAccount('${ba.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
          ${EMP_I18N.verifyLabel}
        </button>
        <button class="btn-bank-reject" onclick="openRejectForm('${ba.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ${EMP_I18N.rejectLabel}
        </button>
      </div>
      <!-- Form catatan penolakan — expand inline di dalam card -->
      <div class="bank-reject-form" id="bank-reject-form-${ba.id}" hidden>
        <textarea
          class="bank-reject-textarea"
          id="bank-reject-note-${ba.id}"
          rows="2"
          maxlength="${EmpV.L.REJECT_NOTE_MAX}"
          placeholder="${_esc(EMP_I18N.rejectNotePlaceholder)}"
        ></textarea>
        <div class="bank-reject-form-btns">
          <button class="btn-bank-cancel-reject" onclick="closeRejectForm('${ba.id}')">
            ${EMP_I18N.cancelLabel}
          </button>
          <button class="btn-bank-submit-reject" onclick="submitReject('${ba.id}')">
            <span class="btn-label">${EMP_I18N.submitRejectLabel}</span>
            <span class="btn-spinner" hidden>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            </span>
          </button>
        </div>
      </div>`;
    }

    wrap.innerHTML += `
    <div class="bank-item" id="bank-item-${ba.id}">
      <div class="bank-item-icon" style="color:var(--brand)">${icon}</div>
      <div class="bank-item-body">
        <div class="bank-item-name">${_esc(ba.account_name)}
          ${ba.bank_name ? `<span style="font-weight:400;color:var(--text-muted)"> · ${_esc(ba.bank_name)}</span>` : ""}
        </div>
        <div class="bank-item-sub">${_esc(ba.type_label)} · ${_esc(ba.masked_number)}</div>
        ${badges.length ? `<div class="bank-item-badges">${badges.join("")}</div>` : ""}
        ${rejNoteHtml}
        ${actionHtml}
      </div>
    </div>`;
  });
}

/* ── Escape HTML helper ──────────────────────────────────────── */
function _esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ══════════════════════════════════════════════════════════════
   VERIFY / REJECT REKENING (inline, di tab Rekening modal detail)
══════════════════════════════════════════════════════════════ */

async function verifyAccount(accountId) {
  const errEl = document.getElementById("bank-action-error");
  if (errEl) errEl.hidden = true;

  try {
    const resp = await apiFetch(
      `/manager/bank-accounts/${accountId}/verify`,
      "POST",
    );
    const d = await resp.json();
    if (resp.ok && d.status === "ok") {
      showToast(EMP_I18N.verifyOk || d.message);
      // Reload rekening tab
      _reloadRekeningTab();
    } else {
      showToast(EmpV.serverMessage(d) || EMP_I18N.errSave, true);
    }
  } catch (err) {
    showToast(EMP_I18N.errConn, true);
    console.error("[verifyAccount] Network error:", err);
  }
}

function openRejectForm(accountId) {
  // Sembunyikan tombol aksi, tampilkan form inline
  const actions = document.getElementById(`bank-actions-${accountId}`);
  const form = document.getElementById(`bank-reject-form-${accountId}`);
  if (actions) actions.hidden = true;
  if (form) form.hidden = false;
  // Fokus ke textarea
  const ta = document.getElementById(`bank-reject-note-${accountId}`);
  if (ta) setTimeout(() => ta.focus(), 50);
}

function closeRejectForm(accountId) {
  const actions = document.getElementById(`bank-actions-${accountId}`);
  const form = document.getElementById(`bank-reject-form-${accountId}`);
  if (actions) actions.hidden = false;
  if (form) form.hidden = true;
  const ta = document.getElementById(`bank-reject-note-${accountId}`);
  if (ta) ta.value = "";
}

async function submitReject(accountId) {
  const ta = document.getElementById(`bank-reject-note-${accountId}`);
  const note = ta ? ta.value.trim() : "";

  if (!note) {
    showToast(EMP_I18N.errRejectNote || "Tulis alasan penolakannya dulu ya, biar jelas buat karyawan.", true);
    if (ta) ta.focus();
    return;
  }
  const rNote = EmpV.text(
    note,
    EmpV.L.REJECT_NOTE_MAX,
    "errRejectNoteLen",
    "Catatan penolakannya kepanjangan nih, maksimal {n} karakter ya.",
  );
  if (rNote.error) {
    showToast(rNote.error, true);
    if (ta) ta.focus();
    return;
  }

  // Loading state
  const submitBtn = document.querySelector(
    `#bank-reject-form-${accountId} .btn-bank-submit-reject`,
  );
  if (submitBtn) {
    submitBtn.disabled = true;
    const lbl = submitBtn.querySelector(".btn-label");
    const spn = submitBtn.querySelector(".btn-spinner");
    if (lbl) lbl.hidden = true;
    if (spn) spn.hidden = false;
  }

  try {
    const resp = await apiFetch(
      `/manager/bank-accounts/${accountId}/reject`,
      "POST",
      { note },
    );
    const d = await resp.json();

    if (resp.ok && d.status === "ok") {
      showToast(EMP_I18N.rejectOk || d.message);
      _reloadRekeningTab();
    } else {
      showToast(EmpV.serverMessage(d) || EMP_I18N.errSave, true);
      // Kembalikan tombol ke state normal
      if (submitBtn) {
        submitBtn.disabled = false;
        const lbl = submitBtn.querySelector(".btn-label");
        const spn = submitBtn.querySelector(".btn-spinner");
        if (lbl) lbl.hidden = false;
        if (spn) spn.hidden = true;
      }
    }
  } catch (err) {
    showToast(EMP_I18N.errConn, true);
    if (submitBtn) {
      submitBtn.disabled = false;
      const lbl = submitBtn.querySelector(".btn-label");
      const spn = submitBtn.querySelector(".btn-spinner");
      if (lbl) lbl.hidden = false;
      if (spn) spn.hidden = true;
    }
    console.error("[submitReject] Network error:", err);
  }
}

function _reloadRekeningTab() {
  if (!detUserId) return;
  apiFetch(`/manager/employees/${detUserId}/detail`, "GET")
    .then((r) => r.json())
    .then((data) => {
      _fillRekeningTab(data.bank_accounts || []);
      // Update badge dot di baris tabel
      _updatePendingBadge(detUserId, data.bank_accounts || []);
    })
    .catch(() => {});
}

function _updatePendingBadge(userId, accounts) {
  const row = document.querySelector(`tr[data-user-id="${userId}"]`);
  if (!row) return;
  const badge = row.querySelector(".emp-bank-pending-dot");
  const hasPending = accounts.some((a) => a.verification_status !== "verified");
  if (hasPending && !badge) {
    const nameCell = row.querySelector(".emp-name-cell");
    if (nameCell) {
      const dot = document.createElement("span");
      dot.className = "emp-bank-pending-dot";
      dot.title = "Ada rekening menunggu verifikasi";
      dot.textContent = "●";
      nameCell.appendChild(dot);
    }
  } else if (!hasPending && badge) {
    badge.remove();
  }
}

/* ══════════════════════════════════════════════════════════════
   MAIN VIEW SWITCHER — Karyawan | Verifikasi Rekening
══════════════════════════════════════════════════════════════ */

let _bvLoaded = false;
let _bvAllData = []; // semua rekening dari API
let _bvFilter = "pending"; // filter aktif

function switchMainView(view) {
  const panels = { karyawan: "panel-karyawan", rekening: "panel-rekening" };
  const tabs = { karyawan: "tab-karyawan-btn", rekening: "tab-rekening-btn" };

  Object.keys(panels).forEach((k) => {
    const panel = document.getElementById(panels[k]);
    const tab = document.getElementById(tabs[k]);
    if (!panel || !tab) return;
    if (k === view) {
      panel.classList.add("active");
      tab.classList.add("active");
    } else {
      panel.classList.remove("active");
      tab.classList.remove("active");
    }
  });

  if (view === "rekening" && !_bvLoaded) {
    _bvLoaded = true;
    _bvLoadAll();
  }
}

/* ── Load semua rekening via /manager/bank-accounts/all-json ── */
async function _bvLoadAll() {
  try {
    const resp = await apiFetch("/manager/bank-accounts/all-json", "GET");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    _bvAllData = data.accounts || [];
    _bvRender();
  } catch (err) {
    document.getElementById("bv-tbody").innerHTML =
      `<tr><td colspan="8" style="text-align:center;padding:2.5rem;color:var(--danger);font-size:0.82rem;">Gagal memuat data. Coba refresh halaman.</td></tr>`;
    console.error("[bvLoadAll]", err);
  }
}

/* ── Filter setter ─────────────────────────────────────────── */
function bvSetFilter(filter, btn) {
  _bvFilter = filter;
  document.querySelectorAll(".bv-filter-btn").forEach((b) => {
    b.classList.remove("active", "active-warning");
  });
  if (filter === "pending") {
    btn.classList.add("active-warning");
  } else {
    btn.classList.add("active");
  }
  _bvRender();
}

/* ── Render rows based on current filter ──────────────────── */
function _bvRender() {
  const counts = { all: 0, pending: 0, verified: 0, rejected: 0, reverify: 0 };
  _bvAllData.forEach((a) => {
    counts.all++;
    const s = a.verification_status;
    if (s === "verified") counts.verified++;
    else if (s === "rejected") counts.rejected++;
    else if (s === "needs_reverify") {
      counts.reverify++;
      counts.pending++;
    } else counts.pending++;
  });

  // Update filter counts
  const fc = document.getElementById("bvfc-all");
  if (fc) fc.textContent = counts.all;
  const fp = document.getElementById("bvfc-pending");
  if (fp) fp.textContent = counts.pending;
  const fv = document.getElementById("bvfc-verified");
  if (fv) fv.textContent = counts.verified;
  const fr = document.getElementById("bvfc-rejected");
  if (fr) fr.textContent = counts.rejected;

  // Update global pending badge on tab
  const globBadge = document.getElementById("bv-pending-count-badge");
  if (globBadge) {
    globBadge.textContent = counts.pending;
    globBadge.style.display = counts.pending > 0 ? "" : "none";
  }

  // Filter rows
  const filtered =
    _bvFilter === "all"
      ? _bvAllData
      : _bvFilter === "pending"
        ? _bvAllData.filter((a) => a.verification_status !== "verified")
        : _bvAllData.filter((a) => a.verification_status === _bvFilter);

  // Update count bar
  const ct = document.getElementById("bv-count-text");
  if (ct) {
    if (_bvFilter === "pending")
      ct.textContent = `${counts.pending} rekening menunggu verifikasi`;
    else if (_bvFilter === "verified")
      ct.textContent = `${counts.verified} rekening terverifikasi`;
    else if (_bvFilter === "rejected")
      ct.textContent = `${counts.rejected} rekening ditolak`;
    else
      ct.textContent = `${counts.all} total rekening dari ${new Set(_bvAllData.map((a) => a.user_id)).size} karyawan`;
  }

  const tbody = document.getElementById("bv-tbody");
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="bv-empty">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      <p>Tidak ada rekening di filter ini.</p>
    </div></td></tr>`;
    return;
  }

  const statusCfg = {
    verified: { cls: "bv-status-verified", label: "Terverifikasi" },
    rejected: { cls: "bv-status-rejected", label: "Ditolak" },
    needs_reverify: { cls: "bv-status-reverify", label: "Perlu Reverifikasi" },
    pending: { cls: "bv-status-pending", label: "Menunggu" },
  };

  let html = "";
  filtered.forEach((a) => {
    const scfg = statusCfg[a.verification_status] || statusCfg.pending;
    const isPending = a.verification_status !== "verified";
    const rowCls = isPending ? "bv-row-pending" : "";
    const primaryBadge = a.is_primary
      ? `<span class="bv-primary-badge">Utama</span>`
      : "";
    const noteCell = a.rejection_note
      ? `<span class="bv-note-cell" title="${_esc(a.rejection_note)}">${_esc(a.rejection_note)}</span>`
      : `<span class="bv-note-empty">—</span>`;

    let actionHtml = "";
    if (isPending) {
      actionHtml = `
        <div class="bv-action-row" id="bvact-${a.id}">
          <button class="bv-btn-verify" onclick="bvVerify('${a.id}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
            Verifikasi
          </button>
          <button class="bv-btn-reject" onclick="bvOpenReject('${a.id}')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Tolak
          </button>
        </div>`;
    } else {
      actionHtml = `<span class="bv-btn-verified-tag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        Verified
      </span>`;
    }

    html += `
    <tr class="${rowCls}" data-bv-id="${a.id}">
      <td>
        <div class="bv-emp-cell">
          <div class="bv-avatar">${_esc(a.full_name ? a.full_name.slice(0, 2).toUpperCase() : "??")}</div>
          <div>
            <span class="bv-emp-name">${_esc(a.full_name)}</span>
            <span class="bv-emp-dept">${_esc(a.department || "—")}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="bv-bank-name">${_esc(a.bank_name || "—")}</span>
      </td>
      <td>
        <span class="bv-account-name">${_esc(a.account_name)}${primaryBadge}</span>
      </td>
      <td>
        <span class="bv-account-number">${_esc(a.account_number)}</span>
      </td>
      <td>
        <span class="bv-bank-type">${_esc(a.type_label || a.account_type)}</span>
      </td>
      <td>${noteCell}</td>
      <td><span class="bv-status ${scfg.cls}">${scfg.label}</span></td>
      <td class="bv-td-action">${actionHtml}</td>
    </tr>
    <tr class="bv-reject-row" id="bvrejrow-${a.id}">
      <td colspan="8">
        <div class="bv-reject-inner">
          <textarea id="bvnote-${a.id}" rows="2" maxlength="${EmpV.L.REJECT_NOTE_MAX}" placeholder="Tuliskan alasan penolakan..."></textarea>
          <div class="bv-reject-inner-btns">
            <button class="bv-btn-submit-reject" onclick="bvSubmitReject('${a.id}')">
              <span class="btn-label">Konfirmasi Tolak</span>
              <span class="btn-spinner" hidden><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></span>
            </button>
            <button class="bv-btn-cancel-reject" onclick="bvCloseReject('${a.id}')">Batal</button>
          </div>
        </div>
      </td>
    </tr>`;
  });

  tbody.innerHTML = html;
}

/* ── Verify single account from BV table ──────────────────── */
async function bvVerify(accountId) {
  const actRow = document.getElementById("bvact-" + accountId);
  if (actRow) {
    actRow.innerHTML = `<span style="font-size:0.73rem;color:var(--text-faint);font-family:IBM Plex Mono,monospace;">Memverifikasi...</span>`;
  }
  try {
    const resp = await apiFetch(
      `/manager/bank-accounts/${accountId}/verify`,
      "POST",
    );
    const d = await resp.json();
    if (resp.ok && d.status === "ok") {
      // Update local data
      const acc = _bvAllData.find((a) => a.id === accountId);
      if (acc) acc.verification_status = "verified";
      _bvRender();
      _showBvToast("Rekening berhasil diverifikasi.");
    } else {
      _showBvToast(EmpV.serverMessage(d) || "Yah, rekeningnya gagal diverifikasi. Coba lagi ya.", true);
      _bvRender();
    }
  } catch (err) {
    _showBvToast("Koneksimu lagi bermasalah nih. Cek internet dulu, terus coba lagi ya.", true);
    _bvRender();
    console.error("[bvVerify]", err);
  }
}

/* ── Open / close inline reject form ──────────────────────── */
function bvOpenReject(accountId) {
  const rejRow = document.getElementById("bvrejrow-" + accountId);
  if (rejRow) {
    rejRow.classList.add("open");
    const ta = document.getElementById("bvnote-" + accountId);
    if (ta) setTimeout(() => ta.focus(), 50);
  }
}
function bvCloseReject(accountId) {
  const rejRow = document.getElementById("bvrejrow-" + accountId);
  if (rejRow) rejRow.classList.remove("open");
  const ta = document.getElementById("bvnote-" + accountId);
  if (ta) ta.value = "";
  EmpV.clearFieldError("bvnote-" + accountId);
}

/* ── Submit reject from BV table ──────────────────────────── */
async function bvSubmitReject(accountId) {
  const ta = document.getElementById("bvnote-" + accountId);
  const note = ta ? ta.value.trim() : "";
  if (!note) {
    if (ta) {
      EmpV.setFieldError(
        ta.id,
        EMP_I18N.errRejectNote || "Tulis alasan penolakannya dulu ya, biar jelas buat karyawan.",
        ta.closest("td"),
      );
      ta.focus();
    }
    ta.style.borderColor = "var(--danger)";
    setTimeout(() => {
      ta.style.borderColor = "";
    }, 1500);
    return;
  }
  const rNote = EmpV.text(
    note,
    EmpV.L.REJECT_NOTE_MAX,
    "errRejectNoteLen",
    "Catatan penolakannya kepanjangan nih, maksimal {n} karakter ya.",
  );
  if (rNote.error) {
    _showBvToast(rNote.error, true);
    if (ta) ta.focus();
    return;
  }

  const rejRow = document.getElementById("bvrejrow-" + accountId);
  const btn = rejRow ? rejRow.querySelector(".bv-btn-submit-reject") : null;
  if (btn) {
    btn.disabled = true;
    const lbl = btn.querySelector(".btn-label");
    const spn = btn.querySelector(".btn-spinner");
    if (lbl) lbl.hidden = true;
    if (spn) spn.hidden = false;
  }

  try {
    const resp = await apiFetch(
      `/manager/bank-accounts/${accountId}/reject`,
      "POST",
      { note },
    );
    const d = await resp.json();
    if (resp.ok && d.status === "ok") {
      const acc = _bvAllData.find((a) => a.id === accountId);
      if (acc) {
        acc.verification_status = "rejected";
        acc.rejection_note = note;
      }
      _bvRender();
      _showBvToast("Rekening berhasil ditolak.");
    } else {
      _showBvToast(EmpV.serverMessage(d) || "Yah, rekeningnya gagal ditolak. Coba lagi ya.", true);
      if (btn) {
        btn.disabled = false;
        const lbl = btn.querySelector(".btn-label");
        const spn = btn.querySelector(".btn-spinner");
        if (lbl) lbl.hidden = false;
        if (spn) spn.hidden = true;
      }
    }
  } catch (err) {
    _showBvToast("Koneksimu lagi bermasalah nih. Cek internet dulu, terus coba lagi ya.", true);
    if (btn) {
      btn.disabled = false;
      const lbl = btn.querySelector(".btn-label");
      const spn = btn.querySelector(".btn-spinner");
      if (lbl) lbl.hidden = false;
      if (spn) spn.hidden = true;
    }
    console.error("[bvSubmitReject]", err);
  }
}

/* ── Toast for BV panel ────────────────────────────────────── */
function _showBvToast(msg, isError) {
  let t = document.getElementById("bv-toast-el");
  if (!t) {
    t = document.createElement("div");
    t.id = "bv-toast-el";
    t.className = "page-success-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.background = isError ? "#991b1b" : "#166534";
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.display = "none";
  }, 3000);
}