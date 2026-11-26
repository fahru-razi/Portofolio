/* =============================================================================
   profile.js — Halaman Profil Karyawan
   CC Indonesia
   Handles: edit field modal, password change modal, AJAX save
   ============================================================================= */

(function () {
  "use strict";

  /* ── Helpers ──────────────────────────────────────────────────────────────── */

  function getCsrf() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.content : "";
  }

  /* POST JSON ke server. Selalu mengembalikan objek { ok, error?, field?, ... }.
     Jawaban yang BUKAN JSON (halaman login setelah sesi habis, error 4xx/5xx dari
     proxy/CSRF) tidak pernah dianggap sukses dan tidak membuat res.json() meledak. */
  async function apiFetch(url, body) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    try {
      const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrf(),
        },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined,
      });
      const ct = res.headers.get("content-type") || "";
      if (ct.indexOf("application/json") === -1) {
        let error = "Servernya lagi bermasalah nih. Coba lagi sebentar ya.";
        if (res.status === 401 || res.redirected)
          error = "Sesi kamu sudah habis nih. Muat ulang halaman, terus masuk lagi ya.";
        else if (res.status === 400 || res.status === 403)
          error = "Sesi keamanannya kedaluwarsa nih. Muat ulang halaman, terus coba lagi ya.";
        else if (res.status === 429)
          error = "Kebanyakan percobaan nih. Tunggu sebentar, terus coba lagi ya.";
        return { ok: false, error: error };
      }
      const data = await res.json();
      return data && typeof data === "object"
        ? data
        : { ok: false, error: "Jawaban servernya nggak terbaca. Coba lagi ya." };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function showError(el, msg) {
    if (el) {
      el.textContent = msg;
    }
  }

  function clearError(el) {
    if (el) {
      el.textContent = "";
    }
  }

  function setInputError(input, errEl, msg) {
    input.classList.add("is-error");
    showError(errEl, msg);
  }

  function clearInputError(input, errEl) {
    input.classList.remove("is-error");
    clearError(errEl);
  }

  function setSpinner(btn, spinner, active) {
    btn.disabled = active;
    if (spinner) spinner.classList.toggle("is-visible", active);
  }

  /* Tampilkan teks nilai di halaman TANPA innerHTML: teks selalu lewat textContent,
     "—" dibuat sebagai elemen. */
  function setValueDisplay(id, text, emptyText) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = "";
    if (text) {
      el.textContent = String(text);
    } else {
      const dash = document.createElement("span");
      dash.className = "text-faint";
      dash.textContent = emptyText || "—";
      el.appendChild(dash);
    }
  }

  /* Elemen pesan error di bawah input; dibuat bila belum ada di HTML. */
  function ensureErrEl(input, id) {
    let el = document.getElementById(id);
    if (!el && input && input.parentNode) {
      el = document.createElement("span");
      el.className = "profile-modal-error";
      el.id = id;
      el.setAttribute("role", "alert");
      input.insertAdjacentElement("afterend", el);
    }
    return el;
  }

  /* Pesan langsung di bawah field:
     • keluar dari field (blur) → cek, tampilkan alasannya bila salah (field kosong dibiarkan);
     • sedang diperbaiki (field sudah merah) → pesan ikut diperbarui, hilang begitu benar.
     errEl boleh elemen atau fungsi yang mengembalikan elemen (untuk yang dibuat belakangan). */
  function attachLiveCheck(input, errEl, checker) {
    if (!input) return;
    const el = () => (typeof errEl === "function" ? errEl() : errEl);
    const show = () => {
      const r = checker(input.value);
      if (r.error) setInputError(input, el(), r.error);
      else clearInputError(input, el());
    };
    input.addEventListener("blur", () => {
      if (String(input.value).trim() !== "" || (input.validity && input.validity.badInput)) show();
    });
    input.addEventListener("input", () => {
      if (input.classList.contains("is-error")) show();
    });
  }

  /* Kolom <input type="number">: ketikan setengah jadi (mis. "1e", "1..2") membuat value jadi ""
     sehingga akan tersimpan KOSONG tanpa pesan. validity.badInput menangkapnya. */
  const numberCheck = (input, label, lo, hi) => (raw) =>
    input && input.validity && input.validity.badInput
      ? { error: `${label} harus angka ya. Contoh: 170.5` }
      : checkDecimal(raw, label, lo, hi);

  /* ── Validator bersama ───────────────────────────────────────────────────
     Validasi di browser hanya UX (bisa dilewati lewat DevTools/curl); aturan
     yang sama diperiksa ULANG di server (views/employee.py). Nilai yang sudah
     tersimpan dan tidak diubah pengguna tidak diblokir: data lama bisa saja
     tidak memenuhi aturan baru. Aturan nama sama dengan form manajer. ── */
  const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F]/;
  const INVISIBLE_RE = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/; // zero-width & bidi
  const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
  const LABEL_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,'’&()\/-]*$/u; // nama pemilik rekening, bank, kota
  const PICO_USER_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._@+-]*$/u;
  const DECIMAL_RE = /^\d{1,3}(\.\d{1,2})?$/;
  const PHONE_RE = /^(\+62|08)[0-9]{7,12}$/;
  const PHONE_SEPARATORS_RE = /[\s\-().]/g;

  const cpLen = (s) => Array.from(String(s == null ? "" : s)).length; // hitung code point, sama dengan len() Python
  const collapse = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  const NAME_MSG = (label) =>
    `${label} cuma boleh pakai huruf, spasi, titik, apostrof, dan tanda hubung ya.`;
  const LABEL_MSG = (label) =>
    `${label} harus diawali huruf atau angka, dan cuma boleh pakai huruf, angka, spasi, serta tanda . , ' & ( ) / - ya.`;

  /* Teks satu baris. o = { label, min, max, re, reMsg, required, legacy } */
  function checkText(raw, o) {
    const v = collapse(raw);
    if (!v) return o.required ? { error: `${o.label} belum diisi nih.` } : { value: "" };
    if (CONTROL_RE.test(v) || INVISIBLE_RE.test(v))
      return { error: "Ada karakter tersembunyi di sini nih. Hapus dulu, terus ketik ulang ya." };
    const n = cpLen(v);
    if (n > o.max)
      return { error: `${o.label} kepanjangan nih, maksimal ${o.max} karakter ya (sekarang ${n}).` };
    if (o.legacy != null && v === collapse(o.legacy)) return { value: v }; // nilai lama, tidak diubah
    if (n < (o.min || 1)) return { error: `${o.label} minimal ${o.min} karakter ya.` };
    if (!o.re.test(v)) return { error: o.reMsg };
    return { value: v };
  }

  /* Teks banyak baris (catatan): buang karakter kontrol/zero-width/bidi, rapikan baris kosong */
  function checkNote(raw, label, max) {
    let s = String(raw == null ? "" : raw);
    try { s = s.normalize("NFC"); } catch (_) { /* browser lama */ }
    s = s
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
      .replace(/[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const n = cpLen(s);
    if (n > max)
      return { error: `${label} kepanjangan nih, maksimal ${max} karakter ya (sekarang ${n}).` };
    return { value: s };
  }

  /* No. telepon: pemisah umum (spasi, -, ., kurung) dibuang diam-diam saat tempel */
  function checkPhone(raw, original) {
    const v = String(raw == null ? "" : raw).replace(PHONE_SEPARATORS_RE, "");
    if (!v) return { value: "" }; // kosong = hapus nomor (boleh)
    if (original != null && v === String(original).replace(PHONE_SEPARATORS_RE, ""))
      return { value: v }; // nomor lama yang tidak diubah
    if (!PHONE_RE.test(v))
      return {
        error: "Nomornya belum pas nih. Pakai 08xx atau +628xx (9–14 digit angka). Contoh: 081234567890",
      };
    return { value: v };
  }

  /* Angka desimal (cm): hanya digit dan satu titik, maks 2 angka di belakang titik */
  function checkDecimal(raw, label, lo, hi) {
    const s = String(raw == null ? "" : raw).trim().replace(",", ".");
    if (!s) return { value: null }; // opsional
    if (!DECIMAL_RE.test(s))
      return { error: `${label} harus angka ya, maksimal 2 angka di belakang titik. Contoh: 170.5` };
    const n = Number(s);
    if (n < lo || n > hi) return { error: `${label} harus antara ${lo}–${hi} cm ya.` };
    return { value: n };
  }

  /* ── Eye icon SVG ─────────────────────────────────────────────────────────── */
  const EYE_OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_CLOSED = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

  /* ── Eye toggle: unified handler for .pwdm-eye inside .pwdm-input-wrap ──
     .profile-pwd-toggle is dead code (not present in HTML); removed.
     All password fields use .pwdm-eye — do not add the old class again. ── */
  document.querySelectorAll(".pwdm-eye").forEach((btn) => {
    btn.innerHTML = EYE_OPEN;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isPass = input.type === "password";
      input.type = isPass ? "text" : "password";
      btn.innerHTML = isPass ? EYE_CLOSED : EYE_OPEN;
      btn.setAttribute("aria-pressed", String(isPass));
    });
  });

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL — Edit field (nama, telepon, rekening, bank, kota)
  ══════════════════════════════════════════════════════════════════════════ */

  const editModal = document.getElementById("edit-modal");
  const modalTitle = document.getElementById("modal-title");
  const modalDesc = document.getElementById("modal-desc");
  const modalLabel = document.getElementById("modal-input-label");
  const modalInput = document.getElementById("modal-input");
  const modalError = document.getElementById("modal-error");
  const modalClose = document.getElementById("modal-close");
  const modalCancel = document.getElementById("modal-cancel");
  const modalSave = document.getElementById("modal-save");
  const modalSpinner = document.getElementById("modal-spinner");

  let activeField = null;

  const FIELD_META = {
    fullname: {
      label: "Nama Lengkap",
      desc: "Masukkan nama lengkap Anda.",
      type: "text",
      max: 150,
      placeholder: "",
    },
    phone: {
      label: "No. Telepon",
      desc: "Format: 08xx atau +628xx.",
      type: "tel",
      max: 20,
      placeholder: "08xx / +628xx",
    },
    account_number: {
      label: "No. Rekening",
      desc: "Nomor rekening bank Anda.",
      type: "text",
      max: 25,
      placeholder: "",
    },
    bank_name: {
      label: "Nama Bank",
      desc: "Contoh: BCA, Mandiri, BNI.",
      type: "text",
      max: 100,
      placeholder: "",
    },
    bank_branch: {
      label: "Kota Pembukaan Rekening",
      desc: "Kota/cabang tempat rekening dibuka.",
      type: "text",
      max: 100,
      placeholder: "",
    },
  };

  /* Validasi per field untuk modal generik → { value } atau { error } */
  function validateEditField(field, raw, original) {
    switch (field) {
      case "fullname":
        return checkText(raw, {
          label: "Nama lengkap",
          min: 2,
          max: 150,
          re: NAME_RE,
          reMsg: NAME_MSG("Nama lengkap"),
          required: true,
          legacy: original,
        });
      case "phone":
        return checkPhone(raw, original);
      case "account_number": {
        const v = String(raw == null ? "" : raw).replace(/\s+/g, "");
        if (!v) return { error: "Nomor rekeningnya belum diisi nih." };
        if (!/^[0-9]{6,20}$/.test(v))
          return { error: "Nomor rekening harus 6–20 digit angka ya." };
        return { value: v };
      }
      case "bank_name":
        return checkText(raw, {
          label: "Nama bank",
          min: 2,
          max: 100,
          re: LABEL_RE,
          reMsg: LABEL_MSG("Nama bank"),
          required: false,
          legacy: original,
        });
      case "bank_branch":
        return checkText(raw, {
          label: "Kota/cabang",
          min: 2,
          max: 100,
          re: LABEL_RE,
          reMsg: LABEL_MSG("Kota/cabang"),
          required: false,
          legacy: original,
        });
    }
    return { error: "Kolom ini nggak bisa diubah. Muat ulang halamannya ya." };
  }

  function openEditModal(btn) {
    const field = btn.dataset.field;
    /* Hanya field yang dikenal; tombol lain / data-field hasil utak-atik DevTools diabaikan */
    if (!Object.prototype.hasOwnProperty.call(FIELD_META, field)) return;
    const meta = FIELD_META[field];
    /* Tombol telepon menyimpan nilainya di data-value; yang lain di data-current */
    const current = "current" in btn.dataset ? btn.dataset.current : btn.dataset.value || "";

    activeField = field;

    modalTitle.textContent = "Edit " + meta.label;
    modalDesc.textContent = meta.desc;
    modalLabel.textContent = meta.label;
    modalInput.type = meta.type;
    modalInput.maxLength = meta.max;
    modalInput.placeholder = meta.placeholder || "";
    modalInput.value = current;
    modalInput.dataset.original = current; /* untuk "nilai lama yang tidak diubah" */
    clearInputError(modalInput, modalError);
    modalSave.disabled = false;

    editModal.classList.add("is-open");
    setTimeout(() => modalInput.focus(), 80);
  }

  /* ── Smooth close helper — animasikan sebelum benar-benar ditutup ─────────── */
  function smoothClose(overlayEl, afterFn) {
    overlayEl.classList.add("is-closing");
    setTimeout(() => {
      overlayEl.classList.remove("is-open", "is-closing");
      if (afterFn) afterFn();
    }, 200);
  }

  function closeEditModal() {
    smoothClose(editModal, () => {
      activeField = null;
      clearInputError(modalInput, modalError);
    });
  }

  /* Buka modal dari semua tombol edit
     (kecuali password, bank terintegrasi, pico — masing-masing punya modal sendiri —
     dan "Perbarui Profil", yang punya handler sendiri di bawah) */
  document
    .querySelectorAll(
      ".profile-edit-btn:not(#btn-change-password):not(#btn-edit-bank):not(#btn-edit-pico):not(#btn-perbarui-profil)",
    )
    .forEach((btn) => {
      btn.addEventListener("click", () => openEditModal(btn));
    });

  modalClose.addEventListener("click", closeEditModal);
  modalCancel.addEventListener("click", closeEditModal);
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });

  /* Nama lengkap berubah → sinkronkan data-* di tombol yang memakainya */
  function syncFullName(name) {
    const perbarui = document.getElementById("btn-perbarui-profil");
    if (perbarui) perbarui.dataset.fullname = name;
    const bankBtn = document.getElementById("btn-edit-bank");
    if (bankBtn) bankBtn.dataset.employeeName = name;
  }

  /* Simpan field */
  modalSave.addEventListener("click", async () => {
    if (modalSave.disabled) return; /* cegah kirim ganda (Enter lalu klik) */
    clearInputError(modalInput, modalError);

    const field = activeField;
    const result = validateEditField(field, modalInput.value, modalInput.dataset.original);
    if (result.error) {
      setInputError(modalInput, modalError, result.error);
      return;
    }
    const value = result.value;

    setSpinner(modalSave, modalSpinner, true);

    try {
      const data = await apiFetch("/employee/profile/update", {
        field: field,
        value: value,
      });

      if (data.ok) {
        /* Tampilkan nilai yang BENAR-BENAR tersimpan (server menormalkan) */
        const shown = typeof data.value === "string" ? data.value : value;
        setValueDisplay("val-" + field, shown);
        /* Update data-* pada semua tombol edit field ini */
        document
          .querySelectorAll(`.profile-edit-btn[data-field="${field}"]`)
          .forEach((b) => {
            b.dataset.current = shown;
            b.dataset.value = shown;
          });
        if (field === "fullname") syncFullName(shown);
        closeEditModal();
      } else {
        setInputError(modalInput, modalError, data.error || "Gagal menyimpan.");
      }
    } catch (err) {
      setInputError(modalInput, modalError, "Koneksinya lagi bermasalah nih. Coba lagi ya.");
    } finally {
      setSpinner(modalSave, modalSpinner, false);
    }
  });

  /* Enter di input → klik simpan */
  modalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && !modalSave.disabled) {
      e.preventDefault();
      modalSave.click();
    }
  });

  /* ── Validasi real-time ── */
  const NUMERIC_FIELDS = new Set(["account_number"]);

  modalInput.addEventListener("input", () => {
    if (!activeField) return;

    /* No. Telepon: pemisah umum (spasi - . kurung) dibuang diam-diam; hanya angka
       dan "+" di awal yang boleh. Karakter lain dibuang dan diberi tahu. */
    if (activeField === "phone") {
      const v = modalInput.value;
      const noSep = v.replace(PHONE_SEPARATORS_RE, "");
      const onlyDigits = noSep.replace(/[^0-9+]/g, "").replace(/(?!^)\+/g, "");
      if (onlyDigits !== v) modalInput.value = onlyDigits;
      if (onlyDigits !== noSep) {
        setInputError(
          modalInput,
          modalError,
          "Nomor telepon cuma boleh angka (boleh diawali +) ya.",
        );
      } else {
        clearInputError(modalInput, modalError);
      }
      return;
    }

    /* No. Rekening (jika masih via modal generik): hanya angka */
    if (NUMERIC_FIELDS.has(activeField)) {
      const cleaned = modalInput.value.replace(/[^0-9]/g, "");
      if (cleaned !== modalInput.value) {
        modalInput.value = cleaned;
        setInputError(
          modalInput,
          modalError,
          "Nomor rekening cuma boleh angka ya.",
        );
      } else {
        clearInputError(modalInput, modalError);
      }
      return;
    }

    clearInputError(modalInput, modalError);
  });

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL — Ganti Kata Sandi v2
     Supports: step progress, per-field errors, requirements checklist,
     strength bar, match indicator, thumb-zone CTA.
  ══════════════════════════════════════════════════════════════════════════ */

  const pwdModal = document.getElementById("password-modal");
  const pwdClose = document.getElementById("pwd-modal-close");
  const pwdCancel = document.getElementById("pwd-modal-cancel");
  const pwdSave = document.getElementById("pwd-modal-save");
  const pwdSpinner = document.getElementById("pwd-spinner");
  const pwdError = document.getElementById("pwd-error"); /* general */
  const pwdCurrent = document.getElementById("pwd-current");
  const pwdNew = document.getElementById("pwd-new");
  const pwdConfirm = document.getElementById("pwd-confirm");
  const pwdStrength = document.getElementById("pwd-strength"); /* label */
  const btnChangePwd = document.getElementById("btn-change-password");

  if (pwdCurrent) pwdCurrent.maxLength = 256;
  if (pwdNew) pwdNew.maxLength = 128;
  if (pwdConfirm) pwdConfirm.maxLength = 128;

  /* Aturan kata sandi BARU → pesan error atau "" (sama dengan server).
     Tidak di-trim: spasi di tepi ditolak jelas, bukan dibuang diam-diam. */
  function checkNewPassword(nw) {
    const n = cpLen(nw);
    if (n < 8) return `Kata sandi barunya minimal 8 karakter ya (sekarang baru ${n}).`;
    if (n > 128) return `Kata sandi barunya kepanjangan nih, maksimal 128 karakter ya (sekarang ${n}).`;
    if (nw !== nw.trim()) return "Kata sandi nggak boleh diawali atau diakhiri spasi ya.";
    if (CONTROL_RE.test(nw))
      return "Ada karakter kontrol di kata sandi barunya. Hapus dulu, terus ketik ulang ya.";
    return "";
  }

  /* Per-field error elements (new in v2) */
  const pwdErrCurrent = document.getElementById("pwdm-error-current");
  const pwdErrNew = document.getElementById("pwdm-error-new");
  const pwdErrConfirm = document.getElementById("pwdm-error-confirm");

  /* Step indicators */
  const step1 = document.getElementById("step-1-indicator");
  const step2 = document.getElementById("step-2-indicator");
  const step3 = document.getElementById("step-3-indicator");

  /* Strength bars + requirements */
  const strengthWrap = document.getElementById("pwdm-strength-wrap");
  const matchEl = document.getElementById("pwdm-match");

  /* ── Per-field error helpers ── */
  function setPwdFieldError(input, errEl, msg) {
    if (input) input.classList.add("is-error");
    if (input) input.classList.remove("is-ok");
    if (errEl) errEl.textContent = msg;
  }
  function clearPwdFieldError(input, errEl) {
    if (input) input.classList.remove("is-error");
    if (errEl) errEl.textContent = "";
  }
  function setPwdFieldOk(input, errEl) {
    if (input) {
      input.classList.remove("is-error");
      input.classList.add("is-ok");
    }
    if (errEl) errEl.textContent = "";
  }

  /* ── Update step progress ── */
  function updateSteps() {
    const hasCurrent = pwdCurrent && pwdCurrent.value.length > 0;
    const hasNew = pwdNew && cpLen(pwdNew.value) >= 8;
    const hasMatch =
      pwdConfirm &&
      pwdConfirm.value === pwdNew.value &&
      pwdConfirm.value.length > 0;

    /* step 1 */
    if (step1) {
      step1.classList.toggle("pwdm-step--active", !hasCurrent);
      step1.classList.toggle("pwdm-step--done", hasCurrent);
    }
    /* step 2 */
    if (step2) {
      step2.classList.toggle("pwdm-step--active", hasCurrent && !hasNew);
      step2.classList.toggle("pwdm-step--done", hasCurrent && hasNew);
    }
    /* step 3 */
    if (step3) {
      step3.classList.toggle(
        "pwdm-step--active",
        hasCurrent && hasNew && !hasMatch,
      );
      step3.classList.toggle(
        "pwdm-step--done",
        hasCurrent && hasNew && hasMatch,
      );
    }
    /* line between step 1-2 */
    const line1 = step1 && step1.nextElementSibling;
    if (line1) line1.classList.toggle("pwdm-step-line--done", hasCurrent);
    /* line between step 2-3 */
    const line2 = step2 && step2.nextElementSibling;
    if (line2)
      line2.classList.toggle("pwdm-step-line--done", hasCurrent && hasNew);
  }

  /* ── Open / close ── */
  function openPwdModal() {
    [pwdCurrent, pwdNew, pwdConfirm].forEach((i) => {
      if (!i) return;
      i.value = "";
      i.classList.remove("is-error", "is-ok");
      i.type = "password"; /* reset visibility state */
    });
    /* Re-inject eye icons — ensures SVG is present even if DOMContentLoaded
       ran before all pwdm buttons were queryable (e.g. lazy-render scenarios) */
    pwdModal.querySelectorAll(".pwdm-eye").forEach((btn) => {
      btn.innerHTML = EYE_OPEN;
      btn.setAttribute("aria-pressed", "false");
    });
    [pwdErrCurrent, pwdErrNew, pwdErrConfirm, pwdError].forEach((e) => {
      if (e) e.textContent = "";
    });
    if (pwdStrength) {
      pwdStrength.textContent = "";
      pwdStrength.className = "pwdm-strength-label";
    }
    if (strengthWrap) {
      strengthWrap.classList.remove("is-visible");
      strengthWrap.removeAttribute("data-strength");
    }
    if (matchEl) {
      matchEl.textContent = "";
      matchEl.className = "pwdm-match";
    }
    /* Reset requirements */
    document.querySelectorAll(".pwdm-req").forEach((r) => {
      r.classList.remove("is-met", "is-fail");
    });
    if (pwdSave) pwdSave.disabled = false;
    /* Reset steps */
    [step1, step2, step3].forEach((s, i) => {
      if (!s) return;
      s.className = "pwdm-step" + (i === 0 ? " pwdm-step--active" : "");
    });
    document
      .querySelectorAll(".pwdm-step-line")
      .forEach((l) => l.classList.remove("pwdm-step-line--done"));
    pwdModal.classList.add("is-open");
    setTimeout(() => pwdCurrent && pwdCurrent.focus(), 80);
  }

  function closePwdModal() {
    smoothClose(pwdModal);
  }

  if (btnChangePwd) btnChangePwd.addEventListener("click", openPwdModal);
  if (pwdClose) pwdClose.addEventListener("click", closePwdModal);
  if (pwdCancel) pwdCancel.addEventListener("click", closePwdModal);
  if (pwdModal) {
    pwdModal.addEventListener("click", (e) => {
      if (e.target === pwdModal) closePwdModal();
    });
  }

  /* ── Step update on current field ── */
  if (pwdCurrent) {
    pwdCurrent.addEventListener("input", () => {
      clearPwdFieldError(pwdCurrent, pwdErrCurrent);
      updateSteps();
    });
    pwdCurrent.addEventListener("blur", () => {
      if (!pwdCurrent.value) {
        setPwdFieldError(
          pwdCurrent,
          pwdErrCurrent,
          "Kata sandi kamu sekarang belum diisi nih.",
        );
      }
      updateSteps();
    });
  }

  /* ── Strength meter + requirements ── */
  const STRENGTH_LEVELS = [
    { label: "Sangat Lemah", cls: "strength-very-weak", score: 0, bars: 1 },
    { label: "Lemah", cls: "strength-weak", score: 1, bars: 2 },
    { label: "Cukup", cls: "strength-fair", score: 3, bars: 3 },
    { label: "Kuat", cls: "strength-strong", score: 4, bars: 4 },
    { label: "Sangat Kuat", cls: "strength-very-strong", score: 5, bars: 4 },
  ];

  const RULES = {
    length: (p) => cpLen(p) >= 8,
    upper: (p) => /[A-Z]/.test(p),
    number: (p) => /[0-9]/.test(p),
    special: (p) => /[^A-Za-z0-9]/.test(p),
  };

  function measureStrength(pwd) {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    /* Map raw score (0-6) to 5 levels */
    if (score <= 1) return 0;
    if (score === 2) return 1;
    if (score === 3) return 2;
    if (score === 4) return 3;
    return 4;
  }

  if (pwdNew) {
    pwdNew.addEventListener("input", () => {
      const val = pwdNew.value;
      clearPwdFieldError(pwdNew, pwdErrNew);

      /* Requirements checklist */
      document.querySelectorAll(".pwdm-req[data-rule]").forEach((el) => {
        const rule = el.dataset.rule;
        if (RULES[rule]) {
          const met = RULES[rule](val);
          el.classList.toggle("is-met", met && val.length > 0);
          el.classList.toggle("is-fail", !met && val.length > 0);
        }
      });

      if (!val) {
        if (strengthWrap) {
          strengthWrap.classList.remove("is-visible");
          strengthWrap.removeAttribute("data-strength");
        }
        if (pwdStrength) {
          pwdStrength.textContent = "";
          pwdStrength.className = "pwdm-strength-label";
        }
        updateSteps();
        return;
      }

      /* Strength bars */
      const idx = measureStrength(val);
      const level = STRENGTH_LEVELS[idx];
      if (strengthWrap) {
        strengthWrap.classList.add("is-visible");
        strengthWrap.dataset.strength = String(idx + 1);
      }
      if (pwdStrength) {
        pwdStrength.textContent = level.label;
        pwdStrength.className = "pwdm-strength-label " + level.cls;
      }

      /* Re-check confirm live */
      if (pwdConfirm && pwdConfirm.value.length > 0) {
        updateMatchIndicator();
      }
      updateSteps();
    });

    pwdNew.addEventListener("blur", () => {
      if (pwdNew.value.length > 0) {
        const err = checkNewPassword(pwdNew.value);
        if (err) setPwdFieldError(pwdNew, pwdErrNew, err);
      }
    });
  }

  /* ── Match indicator ── */
  function updateMatchIndicator() {
    if (!pwdConfirm || !matchEl) return;
    const conf = pwdConfirm.value;
    const nw = pwdNew ? pwdNew.value : "";
    if (!conf) {
      matchEl.textContent = "";
      matchEl.className = "pwdm-match";
      clearPwdFieldError(pwdConfirm, pwdErrConfirm);
      return;
    }
    if (conf === nw) {
      matchEl.textContent = "✓ Kata sandi cocok";
      matchEl.className = "pwdm-match pwdm-match--ok";
      setPwdFieldOk(pwdConfirm, pwdErrConfirm);
    } else {
      matchEl.textContent = "✗ Kata sandi tidak cocok";
      matchEl.className = "pwdm-match pwdm-match--fail";
      pwdConfirm.classList.add("is-error");
      pwdConfirm.classList.remove("is-ok");
    }
  }

  if (pwdConfirm) {
    pwdConfirm.addEventListener("input", () => {
      clearPwdFieldError(pwdConfirm, pwdErrConfirm);
      updateMatchIndicator();
      updateSteps();
    });
  }

  /* ── Save password ── */
  if (pwdSave) {
    pwdSave.addEventListener("click", async () => {
      if (pwdSave.disabled) return; /* cegah kirim ganda */

      /* Kata sandi TIDAK di-trim: spasi di tepi adalah bagian dari kata sandi
         (form manajer juga tidak men-trim). Untuk kata sandi BARU, spasi di tepi
         ditolak dengan pesan jelas supaya tidak ada yang diubah diam-diam. */
      const cur = pwdCurrent ? pwdCurrent.value : "";
      const nw = pwdNew ? pwdNew.value : "";
      const conf = pwdConfirm ? pwdConfirm.value : "";

      /* Clear all per-field errors */
      [pwdCurrent, pwdNew, pwdConfirm].forEach((i) => {
        if (i) {
          i.classList.remove("is-error");
          i.classList.remove("is-ok");
        }
      });
      [pwdErrCurrent, pwdErrNew, pwdErrConfirm, pwdError].forEach((e) => {
        if (e) e.textContent = "";
      });

      /* Validate each field → show per-field error */
      let valid = true;
      let firstBad = null;
      const bad = (input, errEl, msg) => {
        setPwdFieldError(input, errEl, msg);
        valid = false;
        if (!firstBad) firstBad = input;
      };

      if (!cur) {
        bad(pwdCurrent, pwdErrCurrent, "Kata sandi kamu sekarang belum diisi nih.");
      } else if (cpLen(cur) > 256) {
        bad(pwdCurrent, pwdErrCurrent, "Kata sandi sekarang kepanjangan nih, maksimal 256 karakter ya.");
      }

      const nwErr = checkNewPassword(nw);
      if (nwErr) {
        bad(pwdNew, pwdErrNew, nwErr);
      } else if (nw === cur) {
        bad(pwdNew, pwdErrNew, "Kata sandi barunya nggak boleh sama dengan yang lama ya.");
      }

      if (nw !== conf) {
        bad(pwdConfirm, pwdErrConfirm, "Konfirmasinya belum cocok sama kata sandi baru nih.");
        if (matchEl) {
          matchEl.textContent = "✗ Kata sandi tidak cocok";
          matchEl.className = "pwdm-match pwdm-match--fail";
        }
      }
      if (!valid) {
        if (firstBad && firstBad.focus) firstBad.focus();
        return;
      }

      setSpinner(pwdSave, pwdSpinner, true);

      try {
        const data = await apiFetch("/employee/profile/change-password", {
          current_password: cur,
          new_password: nw,
          confirm_password: conf,
        });

        if (data.ok) {
          /* Jangan biarkan kata sandi menggantung di DOM setelah berhasil */
          [pwdCurrent, pwdNew, pwdConfirm].forEach((i) => {
            if (i) i.value = "";
          });
          closePwdModal();
          const changedEl = document.querySelector(
            ".profile-password-changed-at",
          );
          if (changedEl) {
            const now = new Date();
            const fmt = now.toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
            });
            changedEl.textContent = "Diubah " + fmt;
          }
        } else {
          const msg =
            typeof data.error === "string" && data.error
              ? data.error
              : "Gagal menyimpan kata sandi.";
          /* Arahkan ke field yang tepat; server mengirim `field`, teks hanya cadangan */
          if (data.field === "current_password") {
            setPwdFieldError(pwdCurrent, pwdErrCurrent, msg);
          } else if (data.field === "new_password") {
            setPwdFieldError(pwdNew, pwdErrNew, msg);
          } else if (data.field === "confirm_password") {
            setPwdFieldError(pwdConfirm, pwdErrConfirm, msg);
          } else if (msg.toLowerCase().includes("saat ini")) {
            setPwdFieldError(pwdCurrent, pwdErrCurrent, msg);
          } else {
            showError(pwdError, msg);
          }
        }
      } catch (err) {
        showError(pwdError, "Koneksinya lagi bermasalah nih. Coba lagi ya.");
      } finally {
        setSpinner(pwdSave, pwdSpinner, false);
      }
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL — Edit Rekening Bank (Terintegrasi)
     Semua field (bank, nomor rekening, konfirmasi, kota) dalam satu modal.
  ══════════════════════════════════════════════════════════════════════════ */

  const bankModal = document.getElementById("bank-modal");
  const bankModalClose = document.getElementById("bank-modal-close");
  const bankModalCancel = document.getElementById("bank-modal-cancel");
  const bankModalSave = document.getElementById("bank-modal-save");
  const bankSpinner = document.getElementById("bank-spinner");
  const bankGeneralError = document.getElementById("bank-general-error");

  const bankSelect = document.getElementById("bank-select");
  const bankNameCustom = document.getElementById("bank-name-custom");
  const bankSelectError = document.getElementById("bank-select-error");
  const bankDigitHint = document.getElementById("bank-digit-hint");

  const bankTrigger = document.getElementById("bank-select-trigger");
  let bankTriggerBadge = document.getElementById("bank-trigger-badge");
  const bankTriggerText = document.getElementById("bank-trigger-text");
  const bankDropdownPanel = document.getElementById("bank-dropdown-panel");

  const bankAccountInput = document.getElementById("bank-account-number");
  const bankAccountError = document.getElementById("bank-account-error");
  const bankConfirmInput = document.getElementById("bank-account-confirm");
  const bankConfirmError = document.getElementById("bank-confirm-error");
  const bankAccountNameInput = document.getElementById("bank-account-name");
  const bankAccountNameError = document.getElementById(
    "bank-account-name-error",
  );
  const bankNameMismatchWarning = document.getElementById(
    "bank-name-mismatch-warning",
  );
  const bankBranchInput = document.getElementById("bank-branch");
  const bankBranchError = document.getElementById("bank-branch-error");
  const bankBranchGroup = document.getElementById("bank-branch-group");
  const bankBranchLabel = document.getElementById("bank-branch-label");
  const bankKcpInput = document.getElementById("bank-kcp");
  const bankKcpGroup = document.getElementById("bank-kcp-group");
  const btnEditBank = document.getElementById("btn-edit-bank");

  function checkCustomBankName(raw) {
    return checkText(raw, {
      label: "Nama bank",
      min: 2,
      max: 100,
      re: LABEL_RE,
      reMsg: LABEL_MSG("Nama bank"),
      required: true,
      legacy: btnEditBank ? btnEditBank.dataset.bank : undefined,
    });
  }
  function checkBankBranch(raw) {
    return checkText(raw, {
      label: "Kota/cabang",
      min: 2,
      max: 100,
      re: LABEL_RE,
      reMsg: LABEL_MSG("Kota/cabang"),
      required: false,
      legacy: btnEditBank ? btnEditBank.dataset.branch : undefined,
    });
  }

  /* Nama pemilik rekening: huruf/angka + tanda baca umum di buku tabungan
     (mis. "PT. ABC & Rekan", "BUDI S., S.E."). Nilai lama yang tidak diubah lolos. */
  function checkAccountName(raw) {
    return checkText(raw, {
      label: "Nama pemilik rekening",
      min: 2,
      max: 150,
      re: LABEL_RE,
      reMsg: LABEL_MSG("Nama pemilik rekening"),
      required: true,
      legacy: btnEditBank ? btnEditBank.dataset.accountName : undefined,
    });
  }

  /* ── Konfigurasi bank ────────────────────────────────────────────────
     Aturan digit per bank TIDAK didefinisikan di sini: dibaca dari atribut
     data-digits pada <option> (dirender dari _BANK_DIGITS_MAP di
     services/accounts.py). Ubah aturan di backend saja. */
  const EWALLET_BANKS = new Set([
    "GoPay",
    "OVO",
    "DANA",
    "ShopeePay",
    "LinkAja",
  ]);
  const EWALLET_REGEX = /^(\+62|08)[0-9]{8,11}$/;

  /* Resolve config dari pilihan select yang aktif */
  function getSelectedBankConfig() {
    const opt = bankSelect.options[bankSelect.selectedIndex];
    if (!opt || !opt.value) return null;
    return {
      value: opt.value,
      digits: opt.dataset.digits, // "10" | "12-13" | "ewallet" | "other"
      type: opt.dataset.type || "bank",
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     CUSTOM BANK DROPDOWN — logo badge + name, grouped, click-to-open
     Native <select> stays as the source of truth; this UI mirrors it.
  ══════════════════════════════════════════════════════════════════════ */

  /* Bangun panel dropdown sekali dari isi <select> asli (logo + nama,
     dikelompokkan sesuai <optgroup>) */
  function buildBankDropdown() {
    if (!bankDropdownPanel) return;
    bankDropdownPanel.innerHTML = "";

    Array.from(bankSelect.children).forEach((node) => {
      if (node.tagName === "OPTGROUP") {
        const header = document.createElement("div");
        header.className = "bank-group-header";
        header.textContent = node.label;
        bankDropdownPanel.appendChild(header);

        Array.from(node.children).forEach((opt) =>
          appendBankOption(opt, opt.value === bankSelect.value),
        );
      } else if (node.tagName === "OPTION" && node.value) {
        /* options tanpa optgroup (jarang dipakai, tapi aman) */
        appendBankOption(node, node.value === bankSelect.value);
      }
    });
  }

  /* Path dasar untuk file logo bank. profile.js adalah file statis
     (tidak melalui Jinja), jadi pakai path /static/ langsung — sesuai
     konvensi default Flask. Sesuaikan jika static folder di-mount di
     path lain. */
  function bankLogoUrl(filename) {
    /* Nama file logo bisa berisi spasi (mis. "Bank Central Asia.svg") —
       encode tiap segmen path agar valid sebagai URL. */
    return "/static/img/banks/" + encodeURIComponent(filename);
  }

  /* Bangun elemen badge (logo asli ATAU monogram fallback) dari satu
     <option>. Dipakai bersama oleh appendBankOption & syncBankTrigger
     agar tampilan trigger dan item dropdown selalu konsisten. ────────
     Konfigurasi per-logo dibaca dari data attribute pada <option>:
       data-logo       → nama file di static/img/banks/ (opsional)
       data-logo-bg     → "white" | "none"  (default: "white")
       data-logo-pad    → "none" | "sm" | "md" | "lg"  (default: "md")
     Jika data-logo tidak ada, atau file gagal dimuat, badge otomatis
     fallback ke monogram warna (data-color + data-initials). ────────── */
  function buildBankBadge(opt) {
    const badge = document.createElement("span");
    badge.setAttribute("aria-hidden", "true");

    const logoFile = opt.dataset.logo || "";

    if (logoFile) {
      /* nilai masuk ke className → hanya yang dikenal */
      const bg = ["white", "none"].includes(opt.dataset.logoBg) ? opt.dataset.logoBg : "white";
      const pad = ["none", "sm", "md", "lg"].includes(opt.dataset.logoPad) ? opt.dataset.logoPad : "md";
      badge.className = `bank-badge has-logo bank-logo-bg-${bg} bank-logo-pad-${pad}`;

      const img = document.createElement("img");
      img.className = "bank-logo";
      img.src = bankLogoUrl(logoFile);
      img.alt =
        ""; /* nama bank sudah ditampilkan sebagai teks di sebelah badge */
      img.loading = "lazy";
      /* Fallback ke monogram jika file logo gagal dimuat */
      img.addEventListener("error", () => {
        applyMonogram(badge, opt);
      });
      badge.appendChild(img);
    } else {
      applyMonogram(badge, opt);
    }

    return badge;
  }

  /* Terapkan tampilan monogram (warna brand + inisial) ke elemen badge —
     dipakai sebagai default jika tidak ada data-logo, atau sebagai
     fallback otomatis saat file logo gagal dimuat. */
  function applyMonogram(badge, opt) {
    badge.className = "bank-badge";
    badge.innerHTML = "";
    /* nilai masuk ke style → hanya warna hex */
    badge.style.background = /^#[0-9a-fA-F]{3,8}$/.test(opt.dataset.color || "")
      ? opt.dataset.color
      : "#8dabbe";
    badge.textContent = opt.dataset.initials || "?";
  }

  function appendBankOption(opt, isSelected) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bank-option" + (isSelected ? " is-selected" : "");
    btn.setAttribute("role", "option");
    btn.dataset.value = opt.value;
    if (isSelected) btn.setAttribute("aria-selected", "true");

    const badge = buildBankBadge(opt);

    const name = document.createElement("span");
    name.className = "bank-option-name";
    name.textContent = opt.textContent.trim();

    btn.appendChild(badge);
    btn.appendChild(name);

    btn.addEventListener("click", () => {
      selectBankOption(opt.value);
      closeBankDropdown();
    });

    bankDropdownPanel.appendChild(btn);
  }

  /* Set nilai pada <select> asli + trigger UI + jalankan onChange yang ada */
  function selectBankOption(value) {
    for (let i = 0; i < bankSelect.options.length; i++) {
      if (bankSelect.options[i].value === value) {
        bankSelect.selectedIndex = i;
        break;
      }
    }
    syncBankTrigger();
    onBankSelectChange();
  }

  /* Update tampilan trigger (badge + nama) sesuai opsi terpilih saat ini */
  function syncBankTrigger() {
    if (!bankTrigger) return;
    const opt = bankSelect.options[bankSelect.selectedIndex];
    /* Teks placeholder diambil dari <option value=""> asli (sudah
       di-translate oleh Jinja saat render HTML) — hindari hardcode
       string di file JS statis yang tidak melalui i18n. */
    const placeholderText = bankSelect.options[0]
      ? bankSelect.options[0].textContent.trim()
      : "— Pilih Bank —";

    let newBadge;

    if (!opt || !opt.value) {
      newBadge = document.createElement("span");
      newBadge.className = "bank-badge bank-badge--empty";
      newBadge.textContent = "?";
      newBadge.setAttribute("aria-hidden", "true");
      bankTriggerText.textContent = placeholderText;
      bankTrigger.classList.add("is-empty");
    } else {
      bankTrigger.classList.remove("is-empty");
      newBadge = buildBankBadge(opt);
      bankTriggerText.textContent = opt.textContent.trim();
    }

    newBadge.id = "bank-trigger-badge";
    bankTriggerBadge.replaceWith(newBadge);
    bankTriggerBadge = newBadge;

    if (!opt || !opt.value) return;

    /* Update tanda terpilih di panel */
    bankDropdownPanel.querySelectorAll(".bank-option").forEach((el) => {
      const match = el.dataset.value === opt.value;
      el.classList.toggle("is-selected", match);
      if (match) el.setAttribute("aria-selected", "true");
      else el.removeAttribute("aria-selected");
    });
  }

  function openBankDropdown() {
    if (!bankDropdownPanel) return;
    bankDropdownPanel.classList.add("is-open");
    bankTrigger.setAttribute("aria-expanded", "true");
    /* Scroll opsi terpilih ke tengah panel */
    const selected = bankDropdownPanel.querySelector(
      ".bank-option.is-selected",
    );
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  function closeBankDropdown() {
    if (!bankDropdownPanel) return;
    bankDropdownPanel.classList.remove("is-open");
    bankTrigger.setAttribute("aria-expanded", "false");
  }

  if (bankTrigger) {
    bankTrigger.addEventListener("click", () => {
      const isOpen = bankDropdownPanel.classList.contains("is-open");
      if (isOpen) closeBankDropdown();
      else openBankDropdown();
    });
  }

  /* Tutup dropdown saat klik di luar panel/trigger */
  document.addEventListener("click", (e) => {
    if (!bankDropdownPanel || !bankTrigger) return;
    if (
      !bankDropdownPanel.contains(e.target) &&
      !bankTrigger.contains(e.target)
    ) {
      closeBankDropdown();
    }
  });

  /* Tutup dropdown dengan Escape */
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      bankDropdownPanel?.classList.contains("is-open")
    ) {
      closeBankDropdown();
    }
  });

  if (bankSelect) buildBankDropdown();

  /* Tampilkan/sembunyikan input bank lainnya & update hint + label dinamis */
  function onBankSelectChange() {
    const cfg = getSelectedBankConfig();
    clearInputError(bankSelect, bankSelectError);
    clearInputError(bankAccountInput, bankAccountError);
    clearInputError(bankConfirmInput, bankConfirmError);

    if (!cfg) {
      bankNameCustom.style.display = "none";
      bankDigitHint.textContent = "";
      validateBankForm();
      return;
    }

    const isEwallet = cfg.type === "ewallet";

    if (cfg.value === "__other__") {
      bankNameCustom.style.display = "block";
      bankDigitHint.textContent = "6–20 digit";
    } else {
      bankNameCustom.style.display = "none";
      if (isEwallet) {
        bankDigitHint.textContent = "Format no. HP";
      } else if (cfg.digits && cfg.digits !== "other") {
        bankDigitHint.textContent = `${cfg.digits} digit`;
      } else {
        bankDigitHint.textContent = "6–20 digit";
      }
    }

    /* ── Label dinamis berdasarkan tipe e-wallet / bank ── */
    const lblAccNumber = document.querySelector(
      'label[for="bank-account-number"]',
    );
    const lblAccConfirm = document.querySelector(
      'label[for="bank-account-confirm"]',
    );

    if (isEwallet) {
      if (lblAccNumber) lblAccNumber.firstChild.textContent = "No. HP / Akun";
      if (lblAccConfirm) lblAccConfirm.textContent = "Konfirmasi No. HP / Akun";
      if (bankAccountInput)
        bankAccountInput.placeholder = "Contoh: 08xxxxxxxxxx";
      if (bankConfirmInput)
        bankConfirmInput.placeholder = "Ulangi no. HP / akun";
      /* Sembunyikan kota pembukaan & KCP */
      if (bankBranchGroup) bankBranchGroup.style.display = "none";
      if (bankKcpGroup) bankKcpGroup.style.display = "none";
    } else {
      if (lblAccNumber) lblAccNumber.firstChild.textContent = "No. Rekening";
      if (lblAccConfirm) lblAccConfirm.textContent = "Konfirmasi No. Rekening";
      if (bankAccountInput)
        bankAccountInput.placeholder = "Masukkan nomor rekening";
      if (bankConfirmInput)
        bankConfirmInput.placeholder = "Ulangi nomor rekening";
      /* Tampilkan kembali kota & KCP */
      if (bankBranchGroup) bankBranchGroup.style.display = "";
      if (bankKcpGroup) bankKcpGroup.style.display = "";
    }

    validateBankForm();
  }

  /* Validasi nomor rekening sesuai bank — return error string atau "" */
  function validateAccountNumber(value, cfg) {
    if (!value) return "Nomor rekeningnya belum diisi nih.";

    if (!cfg) return "";

    if (cfg.digits === "ewallet") {
      if (!EWALLET_REGEX.test(value)) {
        return "Nomor e-walletnya belum pas nih. Pakai 08xx atau +628xx (10–13 digit).";
      }
      return "";
    }

    if (!/^[0-9]+$/.test(value)) {
      return "Nomor rekening cuma boleh angka ya.";
    }

    if (cfg.digits === "other" || cfg.value === "__other__") {
      if (value.length < 6 || value.length > 20) {
        return "Nomor rekening harus 6–20 digit angka ya.";
      }
      return "";
    }

    /* data-digits bisa "13" (tunggal) atau "12-13" (beberapa panjang valid) */
    const allowed = String(cfg.digits || "")
      .split("-")
      .map((n) => parseInt(n, 10))
      .filter((n) => !isNaN(n));
    if (allowed.length && !allowed.includes(value.length)) {
      return allowed.length === 1
        ? `Nomor rekening ${cfg.value} harus tepat ${allowed[0]} digit ya.`
        : `Nomor rekening ${cfg.value} harus ${allowed.join(" atau ")} digit ya.`;
    }

    return "";
  }

  /* Validasi keseluruhan form bank; enable/disable submit */
  function validateBankForm() {
    const cfg = getSelectedBankConfig();
    const accVal = (bankAccountInput.value || "").trim();
    const confVal = (bankConfirmInput.value || "").trim();
    const accNameVal = bankAccountNameInput
      ? (bankAccountNameInput.value || "").trim()
      : "";

    /* Kondisi minimal untuk enable tombol simpan */
    const bankChosen = cfg && cfg.value && cfg.value !== "";
    const customFilled =
      cfg && cfg.value === "__other__"
        ? (bankNameCustom.value || "").trim().length >= 2
        : true;
    const accOk =
      bankChosen && validateAccountNumber(accVal, cfg) === "" && accVal !== "";
    const confirmMatch = accOk && confVal === accVal && confVal !== "";
    const accNameOk = accNameVal.length >= 2;

    bankModalSave.disabled = !(
      bankChosen &&
      customFilled &&
      accOk &&
      confirmMatch &&
      accNameOk
    );

    /* Visual match indicator pada confirm field */
    if (confVal && accVal) {
      if (confVal === accVal) {
        bankConfirmInput.classList.add("is-match");
        bankConfirmInput.classList.remove("is-error");
        clearError(bankConfirmError);
      } else {
        bankConfirmInput.classList.remove("is-match");
      }
    } else {
      bankConfirmInput.classList.remove("is-match");
    }
  }

  /* ── Buka modal bank ─────────────────────────────────────────────────── */
  function openBankModal() {
    if (!btnEditBank) return;

    /* Pre-fill dari data atribut tombol */
    const currentAccount = btnEditBank.dataset.account || "";
    const currentAccountName = btnEditBank.dataset.accountName || "";
    const currentBank = btnEditBank.dataset.bank || "";
    const currentBranch = btnEditBank.dataset.branch || "";

    /* Reset semua field */
    bankAccountInput.value = currentAccount;
    bankConfirmInput.value = "";
    if (bankAccountNameInput) bankAccountNameInput.value = currentAccountName;
    bankBranchInput.value = currentBranch;
    if (bankKcpInput) bankKcpInput.value = "";
    bankNameCustom.value = "";
    bankNameCustom.style.display = "none";
    bankDigitHint.textContent = "";
    if (bankNameMismatchWarning)
      bankNameMismatchWarning.classList.remove("is-visible");

    /* Reset errors */
    [bankSelect, bankAccountInput, bankConfirmInput, bankBranchInput]
      .filter(Boolean)
      .forEach((el) => {
        el.classList.remove("is-error", "is-match");
      });
    if (bankKcpInput) bankKcpInput.classList.remove("is-error");
    if (bankAccountNameInput) bankAccountNameInput.classList.remove("is-error");
    [
      bankSelectError,
      bankAccountError,
      bankConfirmError,
      bankBranchError,
      bankGeneralError,
    ]
      .filter(Boolean)
      .forEach(clearError);
    const bankKcpError = document.getElementById("bank-kcp-error");
    if (bankKcpError) clearError(bankKcpError);
    if (bankAccountNameError) clearError(bankAccountNameError);

    /* Pilih bank di dropdown */
    let found = false;
    for (let i = 0; i < bankSelect.options.length; i++) {
      if (bankSelect.options[i].value === currentBank) {
        bankSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found && currentBank) {
      /* Bank ada tapi tidak di list — pilih "Bank Lainnya" dan isi manual */
      for (let i = 0; i < bankSelect.options.length; i++) {
        if (bankSelect.options[i].value === "__other__") {
          bankSelect.selectedIndex = i;
          break;
        }
      }
      bankNameCustom.value = currentBank;
      bankNameCustom.style.display = "block";
    } else if (!found) {
      bankSelect.selectedIndex = 0;
    }

    onBankSelectChange(); /* update hint & button state */
    syncBankTrigger(); /* sync custom dropdown badge + label */
    closeBankDropdown();
    checkBankNameMismatch(); /* cek nama pemilik vs nama karyawan */
    bankModalSave.disabled = true; /* selalu require konfirmasi ulang */

    bankModal.classList.add("is-open");
    setTimeout(() => bankTrigger && bankTrigger.focus(), 80);
  }

  function closeBankModal() {
    closeBankDropdown();
    smoothClose(bankModal);
  }

  if (btnEditBank) btnEditBank.addEventListener("click", openBankModal);
  if (bankModalClose) bankModalClose.addEventListener("click", closeBankModal);
  if (bankModalCancel)
    bankModalCancel.addEventListener("click", closeBankModal);
  if (bankModal)
    bankModal.addEventListener("click", (e) => {
      if (e.target === bankModal) closeBankModal();
    });

  /* ── Event listeners untuk validasi live ─────────────────────────────── */
  if (bankSelect) bankSelect.addEventListener("change", onBankSelectChange);
  if (bankNameCustom)
    bankNameCustom.addEventListener("input", validateBankForm);

  if (bankAccountInput) {
    bankAccountInput.addEventListener("input", () => {
      const cfg = getSelectedBankConfig();
      /* E-wallet: biarkan + dan angka. Bank biasa: angka only */
      if (cfg && cfg.digits === "ewallet") {
        const cleaned = bankAccountInput.value.replace(/[^0-9+]/g, "");
        if (cleaned !== bankAccountInput.value)
          bankAccountInput.value = cleaned;
      } else {
        const cleaned = bankAccountInput.value.replace(/[^0-9]/g, "");
        if (cleaned !== bankAccountInput.value) {
          bankAccountInput.value = cleaned;
          setInputError(
            bankAccountInput,
            bankAccountError,
            "Nomor rekening cuma boleh angka ya.",
          );
        } else {
          clearInputError(bankAccountInput, bankAccountError);
        }
      }
      bankConfirmInput.classList.remove("is-match", "is-error");
      clearError(bankConfirmError);
      validateBankForm();
    });
  }

  if (bankConfirmInput) {
    bankConfirmInput.addEventListener("input", () => {
      const cfg = getSelectedBankConfig();
      /* Sama enforcement dengan input utama */
      if (!cfg || cfg.digits !== "ewallet") {
        const cleaned = bankConfirmInput.value.replace(/[^0-9]/g, "");
        if (cleaned !== bankConfirmInput.value)
          bankConfirmInput.value = cleaned;
      }
      clearInputError(bankConfirmInput, bankConfirmError);
      validateBankForm();
    });
  }

  attachLiveCheck(bankBranchInput, bankBranchError, checkBankBranch);
  attachLiveCheck(bankNameCustom, bankSelectError, checkCustomBankName);

  if (bankAccountNameInput) {
    bankAccountNameInput.addEventListener("input", () => {
      checkBankNameMismatch();
      validateBankForm();
    });
  }
  attachLiveCheck(bankAccountNameInput, bankAccountNameError, checkAccountName);

  /* ── Peringatan jika nama pemilik rekening ≠ nama karyawan ─────────────
     Non-blocking: hanya peringatan visual, tidak mencegah submit. ────── */
  function normalizeNameForCompare(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") /* hilangkan diakritik */
      .replace(/[^a-z0-9\s]/g, "") /* hilangkan tanda baca */
      .replace(/\s+/g, " ")
      .trim();
  }

  function checkBankNameMismatch() {
    if (!bankNameMismatchWarning || !bankAccountNameInput || !btnEditBank)
      return;

    const employeeName = btnEditBank.dataset.employeeName || "";
    const inputName = bankAccountNameInput.value || "";

    const normEmployee = normalizeNameForCompare(employeeName);
    const normInput = normalizeNameForCompare(inputName);

    const showWarning =
      normInput.length >= 2 &&
      normEmployee.length > 0 &&
      normInput !== normEmployee;

    bankNameMismatchWarning.classList.toggle("is-visible", showWarning);
  }

  /* ── Simpan rekening bank ────────────────────────────────────────────── */
  if (bankModalSave) {
    bankModalSave.addEventListener("click", async () => {
      /* Ambil nilai */
      const cfg = getSelectedBankConfig();
      const accVal = (bankAccountInput.value || "").trim();
      const confVal = (bankConfirmInput.value || "").trim();
      let branchVal = (bankBranchInput.value || "").trim();
      const kcpVal = bankKcpInput ? (bankKcpInput.value || "").trim() : "";
      let accNameVal = bankAccountNameInput
        ? (bankAccountNameInput.value || "").trim()
        : "";

      let bankName = "";
      if (cfg && cfg.value === "__other__") {
        bankName = (bankNameCustom.value || "").trim();
      } else if (cfg) {
        bankName = cfg.value;
      }

      /* Reset errors */
      [bankSelect, bankAccountInput, bankConfirmInput, bankBranchInput].forEach(
        (el) => {
          el.classList.remove("is-error");
        },
      );
      if (bankAccountNameInput)
        bankAccountNameInput.classList.remove("is-error");
      [
        bankSelectError,
        bankAccountError,
        bankConfirmError,
        bankBranchError,
        bankGeneralError,
      ].forEach(clearError);
      if (bankAccountNameError) clearError(bankAccountNameError);

      /* Validasi frontend — semua kolom diperiksa sekaligus supaya semua pesan tampil */
      let hasError = false;

      if (!cfg || !cfg.value) {
        setInputError(bankSelect, bankSelectError, "Pilih bank atau e-wallet dulu ya.");
        hasError = true;
      } else if (cfg.value === "__other__") {
        const r = checkCustomBankName(bankName);
        if (r.error) {
          setInputError(bankNameCustom, bankSelectError, r.error);
          hasError = true;
        } else {
          bankName = r.value;
        }
      }

      if (!hasError) {
        const accErr = validateAccountNumber(accVal, cfg);
        if (accErr) {
          setInputError(bankAccountInput, bankAccountError, accErr);
          hasError = true;
        }
      }

      if (!hasError && accVal !== confVal) {
        setInputError(
          bankConfirmInput,
          bankConfirmError,
          "Konfirmasinya belum cocok sama nomor rekening di atas nih.",
        );
        hasError = true;
      }

      const nameRes = checkAccountName(accNameVal);
      if (nameRes.error) {
        if (bankAccountNameInput)
          setInputError(bankAccountNameInput, bankAccountNameError, nameRes.error);
        hasError = true;
      } else {
        accNameVal = nameRes.value;
      }

      if (cfg && cfg.type === "ewallet") {
        branchVal = ""; /* kota/KCP disembunyikan untuk e-wallet: jangan kirim sisa isian lama */
      } else {
        const br = checkBankBranch(branchVal);
        if (br.error) {
          setInputError(bankBranchInput, bankBranchError, br.error);
          hasError = true;
        } else {
          branchVal = br.value;
        }
      }

      if (hasError) return;

      /* Kirim ke endpoint baru */
      setSpinner(bankModalSave, bankSpinner, true);
      try {
        const data = await apiFetch("/employee/profile/update-bank", {
          account_number: accVal,
          account_name: accNameVal,
          bank_name: bankName,
          bank_branch: branchVal,
        });

        if (data.ok) {
          /* Update tampilan di halaman tanpa reload */
          /* Card-within-card: bank name (pbc-bank-name) */
          const valBank = document.getElementById("val-bank_name");
          /* Card-within-card: account number (pbc-account-num) */
          const valAcc = document.getElementById("val-account_number");
          /* Standalone fields below the card */
          const valAccName = document.getElementById("val-account_name");
          const valBranch = document.getElementById("val-bank_branch");

          if (valBank) {
            valBank.textContent = bankName || "";
            if (!bankName)
              valBank.innerHTML = '<span class="text-faint">—</span>';
          }
          if (valAcc) {
            /* After save, mark as unverified — show number + badge */
            valAcc.textContent = accVal || "—";
          }
          /* Also update the badge in pbc-bank-right */
          const pbcRight = document.querySelector(".pbc-bank-right");
          if (pbcRight && accVal) {
            pbcRight.innerHTML = `<span class="profile-unverified-badge">Belum diverifikasi</span>`;
          }
          if (valAccName) {
            valAccName.textContent = accNameVal || "";
            if (!accNameVal)
              valAccName.innerHTML = '<span class="text-faint">—</span>';
          }
          if (valBranch) {
            valBranch.textContent = branchVal || "";
            if (!branchVal)
              valBranch.innerHTML =
                '<span class="text-faint">— Belum diisi</span>';
          }

          /* Update data atribut tombol edit untuk next open */
          if (btnEditBank) {
            btnEditBank.dataset.account = accVal;
            btnEditBank.dataset.accountName = accNameVal;
            btnEditBank.dataset.bank = bankName;
            btnEditBank.dataset.branch = branchVal;
          }

          closeBankModal();
        } else {
          /* Highlight field yang salah jika backend memberikan field info */
          const errField = data.field || "";
          if (errField === "account_number") {
            setInputError(
              bankAccountInput,
              bankAccountError,
              data.error || "Nomor rekening tidak valid.",
            );
          } else if (errField === "account_name") {
            if (bankAccountNameInput) {
              setInputError(
                bankAccountNameInput,
                bankAccountNameError,
                data.error || "Nama pemilik tidak valid.",
              );
            }
          } else if (errField === "bank_name") {
            setInputError(
              bankNameCustom || bankSelect,
              bankSelectError,
              data.error || "Nama bank tidak valid.",
            );
          } else {
            showError(
              bankGeneralError,
              data.error || "Gagal menyimpan. Coba lagi.",
            );
          }
        }
      } catch (err) {
        showError(bankGeneralError, "Koneksinya lagi bermasalah nih. Coba lagi ya.");
      } finally {
        setSpinner(bankModalSave, bankSpinner, false);
      }
    });
  }

  /* Escape key sudah ditangani di event listener sebelumnya —
     tambahkan bank-modal ke pengecekan yang sama */
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (bankModal && bankModal.classList.contains("is-open"))
        closeBankModal();
    },
    { capture: false },
  );

  /* ══════════════════════════════════════════════════════════════════════════
     MODAL — Akun Pico
  ══════════════════════════════════════════════════════════════════════════ */

  const picoModal = document.getElementById("pico-modal");
  const picoModalClose = document.getElementById("pico-modal-close");
  const picoModalCancel = document.getElementById("pico-modal-cancel");
  const picoModalSave = document.getElementById("pico-modal-save");
  const picoSpinner = document.getElementById("pico-spinner");
  const btnEditPico = document.getElementById("btn-edit-pico");

  const picoUsername = document.getElementById("pico-username");
  const picoCallname = document.getElementById("pico-callname");
  const picoGender = document.getElementById("pico-gender");
  const picoHeight = document.getElementById("pico-height");
  const picoArm = document.getElementById("pico-arm");
  const picoLeg = document.getElementById("pico-leg");
  const picoNotes = document.getElementById("pico-notes");

  const picoUsernameErr = document.getElementById("pico-username-error");
  const picoHeightErr = document.getElementById("pico-height-error");
  const picoArmErr = document.getElementById("pico-arm-error");
  const picoLegErr = document.getElementById("pico-leg-error");
  const picoGenErr = document.getElementById("pico-general-error");

  function openPicoModal() {
    if (!picoModal || !btnEditPico) return;
    const d = btnEditPico.dataset;

    picoUsername.value = d.username || "";
    picoCallname.value = d.callname || "";
    picoGender.value = d.gender || "";
    picoHeight.value = d.height || "";
    picoArm.value = d.arm || "";
    picoLeg.value = d.leg || "";
    picoNotes.value = d.notes || "";

    [
      picoUsernameErr,
      picoHeightErr,
      picoArmErr,
      picoLegErr,
      picoGenErr,
    ].forEach((el) => {
      if (el) el.textContent = "";
    });
    [picoUsername, picoHeight, picoArm, picoLeg].forEach((el) => {
      if (el) el.classList.remove("is-error");
    });

    /* Username yang sudah diverifikasi manajer dikunci (server juga menolak). */
    const picoLocked = d.verified === "1";
    picoUsername.readOnly = picoLocked;
    picoUsername.setAttribute("aria-readonly", picoLocked ? "true" : "false");
    if (picoLocked && picoUsernameErr) {
      picoUsernameErr.textContent =
        "Username sudah diverifikasi manajer. Hubungi manajer kalau perlu diganti.";
    }

    picoModal.classList.add("is-open");
    setTimeout(() => picoUsername.focus(), 80);
  }

  function closePicoModal() {
    if (!picoModal) return;
    smoothClose(picoModal, null);
  }

  if (btnEditPico) btnEditPico.addEventListener("click", openPicoModal);
  if (picoModalClose) picoModalClose.addEventListener("click", closePicoModal);
  if (picoModalCancel)
    picoModalCancel.addEventListener("click", closePicoModal);
  if (picoModal) {
    picoModal.addEventListener("click", (e) => {
      if (e.target === picoModal) closePicoModal();
    });
  }

  /* Aturan kolom Pico (dipakai saat blur dan saat simpan). Nilai lama yang tidak diubah lolos. */
  const checkPicoUsername = (raw) =>
    checkText(raw, {
      label: "Username Pico",
      min: 1,
      max: 100,
      re: PICO_USER_RE,
      reMsg:
        "Username Pico harus diawali huruf atau angka, dan cuma boleh pakai huruf, angka, spasi, serta . _ @ + - ya.",
      required: true,
      legacy: btnEditPico ? btnEditPico.dataset.username : undefined,
    });
  const checkPicoCallName = (raw) =>
    checkText(raw, {
      label: "Nama panggilan",
      min: 1,
      max: 100,
      re: NAME_RE,
      reMsg: NAME_MSG("Nama panggilan"),
      required: false,
      legacy: btnEditPico ? btnEditPico.dataset.callname : undefined,
    });
  const checkPicoNotes = (raw) => checkNote(raw, "Catatannya", 500);

  attachLiveCheck(picoUsername, picoUsernameErr, checkPicoUsername);
  attachLiveCheck(picoCallname, () => ensureErrEl(picoCallname, "pico-callname-error"), checkPicoCallName);
  const checkPicoHeight = numberCheck(picoHeight, "Tinggi badan", 50, 250);
  const checkPicoArm = numberCheck(picoArm, "Panjang lengan", 30, 150);
  const checkPicoLeg = numberCheck(picoLeg, "Panjang kaki", 30, 150);
  attachLiveCheck(picoHeight, picoHeightErr, checkPicoHeight);
  attachLiveCheck(picoArm, picoArmErr, checkPicoArm);
  attachLiveCheck(picoLeg, picoLegErr, checkPicoLeg);
  attachLiveCheck(picoNotes, () => ensureErrEl(picoNotes, "pico-notes-error"), checkPicoNotes);

  if (picoModalSave) {
    picoModalSave.addEventListener("click", async () => {
      if (picoModalSave.disabled) return; /* cegah kirim ganda */

      /* Elemen error untuk kolom yang belum punya di HTML — dibuat sekali */
      const picoCallErr = ensureErrEl(picoCallname, "pico-callname-error");
      const picoNotesErr = ensureErrEl(picoNotes, "pico-notes-error");

      // Reset errors
      [
        picoUsernameErr,
        picoHeightErr,
        picoArmErr,
        picoLegErr,
        picoGenErr,
        picoCallErr,
        picoNotesErr,
      ].forEach((el) => {
        if (el) el.textContent = "";
      });
      [picoUsername, picoCallname, picoHeight, picoArm, picoLeg, picoNotes].forEach(
        (el) => {
          if (el) el.classList.remove("is-error");
        },
      );

      /* Validasi semua kolom sekaligus; nilai lama yang tidak diubah tidak diblokir */
      const rU = checkPicoUsername(picoUsername.value);
      const rC = checkPicoCallName(picoCallname.value);
      const rH = checkPicoHeight(picoHeight.value);
      const rA = checkPicoArm(picoArm.value);
      const rL = checkPicoLeg(picoLeg.value);
      const rN = checkPicoNotes(picoNotes.value);

      let firstBad = null;
      [
        [rU, picoUsername, picoUsernameErr],
        [rC, picoCallname, picoCallErr],
        [rH, picoHeight, picoHeightErr],
        [rA, picoArm, picoArmErr],
        [rL, picoLeg, picoLegErr],
        [rN, picoNotes, picoNotesErr],
      ].forEach(([r, input, errEl]) => {
        if (r.error) {
          setInputError(input, errEl, r.error);
          if (!firstBad) firstBad = input;
        }
      });
      if (firstBad) {
        firstBad.focus();
        return;
      }

      const gender = ["male", "female", "other"].includes(picoGender.value)
        ? picoGender.value
        : null;

      setSpinner(picoModalSave, picoSpinner, true);

      try {
        const res = await apiFetch("/employee/profile/update-pico", {
          pico_username: rU.value,
          call_name: rC.value || null,
          gender: gender,
          height_cm: rH.value,
          arm_length_cm: rA.value,
          leg_length_cm: rL.value,
          notes: rN.value || null,
        });

        if (res.ok) {
          /* Akun baru: bagian "Akun Pico" belum punya baris nilai (markup-nya
             beda dari akun yang sudah ada), jadi muat ulang agar tampil lengkap
             beserta status verifikasinya. */
          if (!document.getElementById("val-pico-username")) {
            window.location.reload();
            return;
          }
          /* Update tampilan di halaman — selalu lewat textContent, tidak pernah innerHTML */
          const upd = (id, val, suffix) =>
            setValueDisplay(id, val === null || val === "" ? "" : suffix ? val + " " + suffix : String(val));
          upd("val-pico-username", rU.value, "");
          upd("val-pico-callname", rC.value, "");
          const gMap = {
            male: "Laki-laki",
            female: "Perempuan",
            other: "Lainnya",
          };
          upd("val-pico-gender", gMap[gender] || "", "");
          upd("val-pico-height", rH.value, "cm");
          upd("val-pico-arm", rA.value, "cm");
          upd("val-pico-leg", rL.value, "cm");
          const notesEl = document.getElementById("val-pico-notes");
          if (notesEl) notesEl.textContent = rN.value;

          /* Update data-* pada tombol supaya re-open terisi benar */
          if (btnEditPico) {
            btnEditPico.dataset.username = rU.value;
            btnEditPico.dataset.callname = rC.value;
            btnEditPico.dataset.gender = gender || "";
            btnEditPico.dataset.height = rH.value === null ? "" : String(rH.value);
            btnEditPico.dataset.arm = rA.value === null ? "" : String(rA.value);
            btnEditPico.dataset.leg = rL.value === null ? "" : String(rL.value);
            btnEditPico.dataset.notes = rN.value;
          }

          /* Status verifikasi: server menandai akun baru/yang diganti usernamenya
             sebagai menunggu verifikasi dan sudah memberi tahu manajer (lonceng
             + halaman Produksi). Badge dan kunci username ikut diperbarui. */
          const pending = res.pending_verification !== false;
          const verifyBadge = document.getElementById("pico-verify-badge");
          if (verifyBadge) {
            verifyBadge.textContent = pending ? "Menunggu verifikasi manajer" : "Terverifikasi";
            verifyBadge.style.color = pending ? "var(--warning, #8c5e00)" : "var(--success, #1a5c35)";
          }
          if (btnEditPico) btnEditPico.dataset.verified = pending ? "" : "1";

          closePicoModal();
        } else {
          const field = res.field || "";
          const msg = typeof res.error === "string" ? res.error : "";
          if (field === "pico_username") {
            setInputError(picoUsername, picoUsernameErr, msg || "Username-nya nggak valid nih.");
          } else if (field === "call_name") {
            setInputError(picoCallname, picoCallErr, msg || "Nama panggilannya nggak valid nih.");
          } else if (field === "height_cm") {
            setInputError(picoHeight, picoHeightErr, msg || "Tinggi badannya nggak valid nih.");
          } else if (field === "arm_length_cm") {
            setInputError(picoArm, picoArmErr, msg || "Panjang lengannya nggak valid nih.");
          } else if (field === "leg_length_cm") {
            setInputError(picoLeg, picoLegErr, msg || "Panjang kakinya nggak valid nih.");
          } else if (field === "notes") {
            setInputError(picoNotes, picoNotesErr, msg || "Catatannya nggak valid nih.");
          } else {
            showError(picoGenErr, msg || "Gagal menyimpan. Coba lagi ya.");
          }
        }
      } catch (err) {
        showError(picoGenErr, "Koneksinya lagi bermasalah nih. Coba lagi ya.");
      } finally {
        setSpinner(picoModalSave, picoSpinner, false);
      }
    });
  }

  /* Escape menutup pico modal */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (picoModal && picoModal.classList.contains("is-open")) closePicoModal();
  });

  /* ══════════════════════════════════════════════════════════════════════════
     BODY VISUALIZER v4 — Model anatomis proporsional
     ─────────────────────────────────────────────────
     Referensi anatomi:
       Kepala + leher  ≈ 14.5% dari tinggi badan
       Torso (bahu→pinggul) + Kaki (pinggul→lantai) = 85.5% sisa
       Kaki sebagai RASIO terhadap (tinggi − kepala):
         leg_ratio = leg_cm / (h_cm × 0.855)
         torso_px  = body_px × (1 − leg_ratio)
       Lengan: rasio langsung terhadap tinggi (arm_cm / h_cm)
               tidak ada cap — 110cm tetap lebih panjang dari 65cm

     Constraint utama:
       Tinggi sama → footCY selalu sama, berapapun panjang kaki.
       Kaki lebih panjang → torso lebih pendek (saling mengimbangi).
  ══════════════════════════════════════════════════════════════════════════ */

  (function initBodyVisualizer() {
    const svg = document.getElementById("pico-body-svg");
    if (!svg) return;

    /* ── Elemen SVG ── */
    const torsoEl = document.getElementById("pico-torso");
    const armLeftRect = document.getElementById("pico-arm-left-rect");
    const armRightRect = document.getElementById("pico-arm-right-rect");
    const legLeftRect = document.getElementById("pico-leg-left-rect");
    const legRightRect = document.getElementById("pico-leg-right-rect");
    const footLeft = document.getElementById("pico-foot-left");
    const footRight = document.getElementById("pico-foot-right");

    const armDimLine = document.getElementById("pico-arm-dim-line");
    const armTickTop = document.getElementById("pico-arm-dim-tick-top");
    const armTickBot = document.getElementById("pico-arm-dim-tick-bot");
    const legDimLine = document.getElementById("pico-leg-dim-line");
    const legTickTop = document.getElementById("pico-leg-dim-tick-top");
    const legTickBot = document.getElementById("pico-leg-dim-tick-bot");
    const heightDimLine = document.getElementById("pico-dim-line-h");
    const heightTickBot = document.getElementById("pico-dim-tick-h-bot");
    const dimHeight = document.getElementById("pico-dim-height");
    const dimArm = document.getElementById("pico-dim-arm");
    const dimLeg = document.getElementById("pico-dim-leg");

    /* ── Konstanta layout (viewBox units) ──
       viewBox = 0 0 100 220
       Kepala (ellipse cy=16, ry=12): top=4
       Leher  (rect y=27, h=6):       bottom=33
       TORSO_TOP = 33 (fixed, tidak pernah bergerak)

       Skala: 170cm → total_px = 140  (px/cm = 140/170 ≈ 0.8235)
       Kepala+leher = 14.5% × total_px
    */
    const HEAD_TOP = 4;
    const TORSO_TOP = 33;
    const FOOT_RY = 4;

    const REF_CM = 170; // tinggi referensi kalibrasi
    const REF_PX = 140; // px viewBox untuk REF_CM
    const SCALE = REF_PX / REF_CM; // ~0.8235 px/cm

    const HEAD_RATIO = 0.145; // kepala+leher = 14.5% tinggi
    const BODY_RATIO = 1 - HEAD_RATIO; // 85.5%

    // Default proporsi kaki jika tidak diisi: 48% dari tinggi
    // (rata-rata inseam manusia dewasa asia ~47-50% tinggi)
    const DEFAULT_LEG_RATIO = 0.48;
    // Default lengan jika tidak diisi: 44% dari tinggi
    const DEFAULT_ARM_RATIO = 0.44;

    const DEFAULT_H_CM = 170;

    function setAttrs(el, attrs) {
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    }

    function updateSilhouette() {
      const hVal = parseFloat(picoHeight.value);
      const aVal = parseFloat(picoArm.value);
      const lVal = parseFloat(picoLeg.value);

      const hasH = !isNaN(hVal) && hVal > 0;
      const hasA = !isNaN(aVal) && aVal > 0;
      const hasL = !isNaN(lVal) && lVal > 0;

      /* ── 1. Total px tubuh berdasarkan tinggi ── */
      const h_cm = hasH ? hVal : DEFAULT_H_CM;
      const total_px = Math.round(h_cm * SCALE); // skala proporsional

      /* ── 2. Kepala+leher selalu 14.5% dari total_px ── */
      const head_px = Math.round(total_px * HEAD_RATIO);
      const body_px = total_px - head_px; // torso + kaki

      /* ── 3. Rasio kaki terhadap body (bukan terhadap total) ──
              leg_ratio = (leg_cm / h_cm) / BODY_RATIO
              Artinya: jika seseorang 170cm dan kakinya 79cm,
              leg/h = 79/170 = 0.465, body_ratio = 0.855
              leg_body_ratio = 0.465/0.855 = 0.544
              Kaki mengisi 54.4% dari body_px, torso 45.6%.
              Ini tepat proporsional ke gambar referensi. */
      let leg_ratio;
      if (hasL) {
        leg_ratio = lVal / h_cm / BODY_RATIO;
      } else {
        leg_ratio = DEFAULT_LEG_RATIO / BODY_RATIO;
      }
      // Batasi agar torso minimal 10% body_px (tidak hilang)
      leg_ratio = Math.min(leg_ratio, 0.9);

      const leg_px = Math.round(body_px * leg_ratio);
      const torso_px = Math.max(Math.round(body_px * 0.1), body_px - leg_px);

      /* ── 4. Posisi Y ── */
      const torso_bottom = TORSO_TOP + torso_px;
      const legTop = torso_bottom;
      const legBottom = legTop + leg_px;
      const footCY = legBottom + FOOT_RY;

      /* ── 5. Apply torso ── */
      torsoEl.setAttribute("height", String(torso_px));

      /* ── 6. Apply kaki ── */
      [legLeftRect, legRightRect].forEach((el) =>
        setAttrs(el, { y: legTop, height: leg_px }),
      );
      [footLeft, footRight].forEach((el) =>
        el.setAttribute("cy", String(footCY)),
      );

      /* ── 7. Leg bracket ── */
      const legMid = legTop + leg_px / 2;
      setAttrs(legDimLine, { y1: legTop, y2: legBottom });
      setAttrs(legTickTop, { y1: legTop, y2: legTop });
      setAttrs(legTickBot, { y1: legBottom, y2: legBottom });
      setAttrs(dimLeg, { y: legMid, transform: `rotate(-90,2,${legMid})` });
      dimLeg.textContent = hasL ? lVal + " cm" : "—";
      dimLeg.style.opacity = hasL ? "1" : "0.4";

      /* ── 8. Height bracket (kepala atas → bawah kaki) ── */
      const bracketBot = footCY + FOOT_RY;
      setAttrs(heightDimLine, { y1: HEAD_TOP, y2: bracketBot });
      setAttrs(heightTickBot, { y1: bracketBot, y2: bracketBot });
      const hMid = (HEAD_TOP + bracketBot) / 2;
      setAttrs(dimHeight, { y: hMid, transform: `rotate(90,90,${hMid})` });
      dimHeight.textContent = hasH ? hVal + " cm" : "—";
      dimHeight.style.opacity = hasH ? "1" : "0.4";

      /* ── 9. Lengan — rasio langsung terhadap tinggi, tidak ada cap ──
              arm_px = (arm_cm / h_cm) × total_px
              Lengan 110cm pada orang 170cm: (110/170) × 140 = 90.6px
              Lengan 65cm pada orang 170cm:  (65/170) × 140 = 53.5px
              Perbedaan visual jelas dan proporsional. */
      let arm_px;
      if (hasA) {
        arm_px = Math.max(6, Math.round((aVal / h_cm) * total_px));
      } else {
        arm_px = Math.round(total_px * DEFAULT_ARM_RATIO);
      }
      const armBottom = TORSO_TOP + arm_px;

      [armLeftRect, armRightRect].forEach((el) =>
        setAttrs(el, { y: TORSO_TOP, height: arm_px }),
      );

      /* Arm bracket */
      const armMid = TORSO_TOP + arm_px / 2;
      setAttrs(armDimLine, { y1: TORSO_TOP, y2: armBottom });
      setAttrs(armTickTop, { y1: TORSO_TOP, y2: TORSO_TOP });
      setAttrs(armTickBot, { y1: armBottom, y2: armBottom });
      setAttrs(dimArm, { y: armMid, transform: `rotate(-90,2,${armMid})` });
      dimArm.textContent = hasA ? aVal + " cm" : "—";
      dimArm.style.opacity = hasA ? "1" : "0.4";
    }

    /* ── Focus highlight ── */
    function setActiveClass(measure) {
      svg.classList.remove(
        "pico-active--height",
        "pico-active--arm",
        "pico-active--leg",
      );
      if (measure) svg.classList.add("pico-active--" + measure);
    }

    picoHeight.addEventListener("input", updateSilhouette);
    picoArm.addEventListener("input", updateSilhouette);
    picoLeg.addEventListener("input", updateSilhouette);

    picoHeight.addEventListener("focus", () => setActiveClass("height"));
    picoArm.addEventListener("focus", () => setActiveClass("arm"));
    picoLeg.addEventListener("focus", () => setActiveClass("leg"));

    [picoHeight, picoArm, picoLeg].forEach((el) =>
      el.addEventListener("blur", () => setActiveClass(null)),
    );

    if (btnEditPico) {
      btnEditPico.addEventListener("click", () =>
        requestAnimationFrame(updateSilhouette),
      );
    }

    updateSilhouette();
  })();

  /* ══════════════════════════════════════════════════════════════════════════
     TOMBOL "PERBARUI PROFIL" — membuka modal edit nama lengkap.
     Lewat openEditModal() yang sama dengan tombol edit lain, sehingga `activeField`,
     validasi, dan penyimpanan memakai satu jalur. (Versi lama membangun modal sendiri
     dan tidak pernah mengisi activeField → simpan mengirim field kosong dan gagal.)
  ══════════════════════════════════════════════════════════════════════════ */
  (function () {
    const btnPerbarui = document.getElementById("btn-perbarui-profil");
    if (!btnPerbarui) return;

    btnPerbarui.addEventListener("click", () => {
      openEditModal({
        dataset: { field: "fullname", current: btnPerbarui.dataset.fullname || "" },
      });
    });
  })();

  /* ══════════════════════════════════════════════════════════════════════════
     DATE CHIPS FALLBACK — inject current week date numbers into .psc-chip-date
     spans that are empty (Jinja didn't have week_dates context var).
  ══════════════════════════════════════════════════════════════════════════ */
  (function () {
    const chips = document.querySelectorAll(".psc-chip");
    if (!chips.length) return;

    /* Find Monday of the current week */
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);

    chips.forEach((chip, i) => {
      const dateSpan = chip.querySelector(".psc-chip-date");
      if (dateSpan && !dateSpan.textContent.trim()) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        dateSpan.textContent = d.getDate();
      }
      /* Highlight today's chip with a stronger background */
      const isoDay = i + 1; // Mon=1 … Sun=7
      const todayIso = today.getDay() === 0 ? 7 : today.getDay();
      if (isoDay === todayIso && chip.classList.contains("active")) {
        chip.style.background = "var(--brand, #1b4f72)";
        chip.style.color = "#fff";
        chip.style.borderRadius = "8px";
      }
    });
  })();
})();