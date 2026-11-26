/**
 * login.js — logika halaman autentikasi
 *
 * Terjemahan dibaca dari <script type="application/json" id="i18n-data">
 * di login.html (bukan lagi window.I18N). Key yang dipakai:
 *   loginEmailRequired, loginEmailInvalid, loginEmailTooLong,
 *   loginPasswordRequired, loginPasswordTooLong, loginInvalidChars,
 *   loginFailed, loginRateLimited, loginConnectionFailed,
 *   loginHidePassword, loginShowPassword
 *
 * CATATAN KEAMANAN: validasi di sini hanya untuk UX dan mengurangi input
 * sampah. Pertahanan sebenarnya (SQLi, dll.) tetap harus ada di server;
 * semua aturan di bawah wajib ditegakkan ulang di /auth/login.
 */

(function () {
  "use strict";

  /* ── Terjemahan (JSON island) ────────────────────────────── */
  function loadI18N() {
    const node = document.getElementById("i18n-data");
    if (!node) return {};
    try {
      const parsed = JSON.parse(node.textContent);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  const I18N = loadI18N();

  /* ── Elemen ──────────────────────────────────────────────── */
  const form = document.getElementById("loginForm");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const rememberEl = document.getElementById("remember");
  const toggleBtn = document.getElementById("togglePw");
  const eyeIcon = document.getElementById("eyeIcon");
  const submitBtn = document.getElementById("loginBtn");
  const alertBox = document.getElementById("loginAlert");
  const alertMsg = document.getElementById("loginAlertMsg");

  if (!form) return;

  /* ── Aturan validasi (samakan dengan server) ─────────────── */
  const EMAIL_MAX = 50; // batas total panjang email (kebijakan aplikasi)
  const EMAIL_LOCAL_MAX = 64; // batas bagian sebelum "@"
  const PASSWORD_MAX = 20;
  const SERVER_MSG_MAX = 300; // batas panjang pesan server yang ditampilkan
  const RATE_LIMIT_LOCK_MS = 5000;

  // Karakter kontrol (NUL, newline, tab, DEL, dst.). Ditolak di semua field
  // karena sering dipakai untuk menyelundupkan payload (NUL, CRLF injection).
  const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/;

  // Whitelist email: local part hanya huruf, angka, . _ % + -
  // domain berupa label huruf/angka/- dipisah titik, TLD minimal 2 huruf.
  // Sengaja lebih ketat dari RFC: tanda kutip, spasi, <, >, ;, dan karakter
  // lain yang biasa dipakai payload injeksi tidak lolos.
  const EMAIL_RE =
    /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

  /* ── SVG ikon mata ───────────────────────────────────────── */
  const SVG_EYE_OPEN =
    '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
    '<circle cx="12" cy="12" r="3"/>';

  const SVG_EYE_CLOSED =
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8' +
    'a18.45 18.45 0 0 1 5.06-5.94"/>' +
    '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8' +
    'a18.5 18.5 0 0 1-2.16 3.19"/>' +
    '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>' +
    '<line x1="1" y1="1" x2="23" y2="23"/>';

  /* ── Helpers ─────────────────────────────────────────────── */
  function showAlert(msg) {
    // textContent (bukan innerHTML): pesan dari server tidak pernah
    // diparse sebagai HTML.
    alertMsg.textContent = msg;
    alertBox.hidden = false;
    alertBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function hideAlert() {
    alertBox.hidden = true;
    alertMsg.textContent = "";
  }

  function setInvalid(el, invalid) {
    if (invalid) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  }

  function clearInvalid() {
    setInvalid(emailEl, false);
    setInvalid(passwordEl, false);
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.classList.toggle("is-loading", on);
    submitBtn.setAttribute("aria-busy", on ? "true" : "false");
  }

  function fail(el, key, fallback) {
    showAlert(I18N[key] || fallback);
    setInvalid(el, true);
    el.focus();
    return false;
  }

  /* ── Toggle show / hide password ─────────────────────────── */
  toggleBtn.addEventListener("click", function () {
    const isHidden = passwordEl.type === "password";
    passwordEl.type = isHidden ? "text" : "password";
    eyeIcon.innerHTML = isHidden ? SVG_EYE_CLOSED : SVG_EYE_OPEN;
    toggleBtn.setAttribute(
      "aria-label",
      isHidden
        ? I18N.loginHidePassword || "Sembunyikan kata sandi"
        : I18N.loginShowPassword || "Tampilkan kata sandi",
    );
  });

  [emailEl, passwordEl].forEach((el) =>
    el.addEventListener("input", function () {
      hideAlert();
      setInvalid(el, false);
    }),
  );

  // Rapikan spasi tak sengaja (mis. hasil paste) saat field kehilangan fokus.
  emailEl.addEventListener("blur", function () {
    emailEl.value = emailEl.value.trim();
  });

  /* ── Validasi ────────────────────────────────────────────── */
  function validate() {
    clearInvalid();

    const email = emailEl.value.trim();
    const password = passwordEl.value; // password TIDAK di-trim / diubah

    // Email
    if (!email) {
      return fail(emailEl, "loginEmailRequired", "Email tidak boleh kosong.");
    }
    if (CONTROL_CHARS_RE.test(email)) {
      return fail(
        emailEl,
        "loginInvalidChars",
        "Input mengandung karakter yang tidak diizinkan.",
      );
    }
    if (email.length > EMAIL_MAX) {
      return fail(
        emailEl,
        "loginEmailTooLong",
        "Email terlalu panjang (maksimal 50 karakter).",
      );
    }
    const atIndex = email.indexOf("@");
    if (
      !EMAIL_RE.test(email) ||
      atIndex > EMAIL_LOCAL_MAX ||
      email.includes("..")
    ) {
      return fail(emailEl, "loginEmailInvalid", "Format email tidak valid.");
    }

    // Password: sengaja TIDAK dibatasi ke whitelist karakter (membatasi
    // karakter justru melemahkan password). Cukup panjang dan karakter
    // kontrol; perlindungan injeksi untuk password ada di server
    // (parameterized query + hash, password tidak pernah masuk query).
    if (!password) {
      return fail(
        passwordEl,
        "loginPasswordRequired",
        "Kata sandi tidak boleh kosong.",
      );
    }
    if (CONTROL_CHARS_RE.test(password)) {
      return fail(
        passwordEl,
        "loginInvalidChars",
        "Input mengandung karakter yang tidak diizinkan.",
      );
    }
    if (password.length > PASSWORD_MAX) {
      return fail(
        passwordEl,
        "loginPasswordTooLong",
        "Kata sandi terlalu panjang (maksimal 20 karakter).",
      );
    }
    return true;
  }

  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") : "";
  }

  /* ── Redirect aman ───────────────────────────────────────── */
  // Hanya path relatif same-origin yang diterima. Menolak: "javascript:",
  // "data:", "//evil.com", "/\evil.com", URL absolut, dan karakter kontrol.
  // Mengembalikan string path aman, atau null jika tidak aman.
  function safeRedirect(target) {
    if (typeof target !== "string" || target.length > 2048) return null;
    if (!target.startsWith("/") || target.startsWith("//")) return null;
    if (target.includes("\\") || CONTROL_CHARS_RE.test(target)) return null;
    try {
      const url = new URL(target, window.location.origin);
      if (url.origin !== window.location.origin) return null;
      return url.pathname + url.search + url.hash;
    } catch {
      return null;
    }
  }

  /* ── Submit ──────────────────────────────────────────────── */
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (submitBtn.disabled) return; // cegah double-submit (Enter berulang)
    hideAlert();

    if (!validate()) return;

    setLoading(true);

    // Tombol dibiarkan terkunci jika true (sukses redirect / rate limit).
    let keepLocked = false;

    const payload = {
      email: emailEl.value.trim(),
      password: passwordEl.value,
      remember: rememberEl.checked,
    };

    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (res.ok && data.redirect) {
        // Jika server mengirim redirect yang tidak aman, jangan diikuti;
        // arahkan ke root aplikasi.
        keepLocked = true;
        window.location.href = safeRedirect(data.redirect) || "/";
        return;
      }

      // Backend mengembalikan {"error": {"code", "message"}} (AppError.to_dict()).
      const rawMessage = data && data.error && data.error.message;
      const serverMessage =
        typeof rawMessage === "string" && rawMessage
          ? rawMessage.slice(0, SERVER_MSG_MAX)
          : "";

      if (res.status === 429) {
        // Rate limiting per IP+email (InMemoryLoginThrottle): kunci tombol
        // sejenak agar pengguna tidak langsung retry dan memperpanjang
        // masa kunci. Kunci dilepas oleh setTimeout, bukan oleh finally.
        keepLocked = true;
        showAlert(
          serverMessage ||
            I18N.loginRateLimited ||
            "Terlalu banyak percobaan. Coba lagi dalam beberapa menit.",
        );
        setTimeout(() => setLoading(false), RATE_LIMIT_LOCK_MS);
        return;
      }

      showAlert(
        serverMessage ||
          I18N.loginFailed ||
          "Email atau kata sandi salah. Silakan coba lagi.",
      );
    } catch {
      showAlert(
        I18N.loginConnectionFailed ||
          "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.",
      );
    } finally {
      // Sebelumnya blok ini ikut berjalan setelah `return` di cabang 429
      // dan langsung membuka kunci tombol, sehingga penguncian 5 detik
      // tidak pernah efektif.
      if (!keepLocked && !document.hidden) setLoading(false);
    }
  });
})();