/**
 * dashboard.js — Manager dashboard interactions
 * Depends on: window.I18N, window.CSRF_TOKEN (di-inject oleh dashboard.html)
 *
 * Isi:
 *  - CSRF + apiFetch helper
 *  - Jam live (WIB) di header
 *  - Filter tabel: status + shift + pencarian teks (logika AND)
 *  - Animasi klik (ripple + efek tekan) dan animasi baris saat filter
 *  - Notifikasi (tandai dibaca)
 *  - reviewLeave() — setuju/tolak pengajuan cuti
 *
 * CHANGELOG (redesign):
 *  - DIHAPUS: seluruh logika check-in / check-out manajer
 *    (updateCheckoutButton, updateCheckinButton, init CHECKIN_STATE, GPS).
 *  - BARU: jam live, pencarian, filter shift berdasarkan label shift
 *    (mis. "Shift 1 - Produksi"), counter "Menampilkan X dari Y".
 *  - BARU: reviewLeave() disediakan di sini karena sebelumnya (kemungkinan)
 *    berada di gps.js yang tidak lagi dimuat di halaman ini.
 *    Memakai route asli /manager/leaves/<id>/approve|reject.
 *  - FIX: endpoint notifikasi → /manager/notifications/<id>/read dan /read-all.
 */

"use strict";

/* ── CSRF & API helpers ───────────────────────────────────────────────────── */

function getCsrfToken() {
  if (window.CSRF_TOKEN) return window.CSRF_TOKEN;
  var meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) return meta.getAttribute("content");
  var input = document.querySelector('input[name="csrf_token"]');
  if (input) return input.value;
  return "";
}

async function apiFetch(url, method, body) {
  const options = {
    method: method || "GET",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
  };
  if (body) options.body = JSON.stringify(body);
  return fetch(url, options);
}

/* ── Jam live (WIB) ───────────────────────────────────────────────────────── */

function startClock() {
  const el = document.getElementById("dm-clock");
  if (!el) return;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const tick = () => {
    el.textContent = fmt.format(new Date());
  };
  tick();
  setInterval(tick, 1000);
}

/* ── Table filter + search ────────────────────────────────────────────────── */

const _activeFilter = { status: "all", shift: "all", q: "" };

/**
 * filterTable(btn, value, dimension)
 *   dimension = "status" → value = data-status baris (all|present|late|...)
 *   dimension = "shift"  → value = label shift ("all" atau mis. "Shift 1 - Produksi")
 */
function filterTable(btn, value, dimension) {
  const dim = dimension || "status";
  _activeFilter[dim] = value;

  if (btn && btn.parentElement) {
    btn.parentElement.querySelectorAll("button").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  _applyFilters();
}

function _applyFilters() {
  const rows = document.querySelectorAll(
    "#attendance-table tbody tr[data-status]",
  );
  const q = _activeFilter.q;
  let visible = 0;

  let order = 0;
  rows.forEach((row) => {
    const wasHidden = row.hidden;
    const statusOk =
      _activeFilter.status === "all" ||
      row.dataset.status === _activeFilter.status;
    const shiftOk =
      _activeFilter.shift === "all" || row.dataset.shift === _activeFilter.shift;
    const textOk = !q || (row.dataset.search || "").indexOf(q) !== -1;
    const show = statusOk && shiftOk && textOk;
    row.hidden = !show;
    if (show) visible++;
    // Animasi masuk hanya untuk baris yang baru muncul (maks. 12 baris di-stagger)
    if (show && wasHidden && !_reduceMotion()) {
      row.classList.remove("row-enter");
      void row.offsetWidth; // restart animasi
      row.style.animationDelay = Math.min(order++, 12) * 18 + "ms";
      row.classList.add("row-enter");
      row.addEventListener(
        "animationend",
        () => {
          row.classList.remove("row-enter");
          row.style.animationDelay = "";
        },
        { once: true },
      );
    }
  });

  const counter = document.getElementById("table-visible-count");
  if (counter) {
    if (counter.textContent !== String(visible) && !_reduceMotion()) {
      counter.classList.remove("bump");
      void counter.offsetWidth;
      counter.classList.add("bump");
    }
    counter.textContent = visible;
  }

  const noMatch = document.getElementById("table-no-match");
  if (noMatch) noMatch.hidden = !(rows.length > 0 && visible === 0);
}

function _initSearch() {
  const input = document.getElementById("dm-search");
  if (!input) return;
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      _activeFilter.q = input.value.trim().toLowerCase();
      _applyFilters();
    }, 120); // debounce — tabel bisa 150+ baris
  });
}

/* ── Animasi klik (ripple) ────────────────────────────────────────────────── */

function _reduceMotion() {
  return (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const _RIPPLE_SELECTOR =
  ".mgr-filter-tab, .mgr-shift-chip, .btn-approve, .btn-reject, " +
  ".dash-notif-read-all-btn, .dash-notif-close";

function _initRipple() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(_RIPPLE_SELECTOR);
    if (!btn || btn.disabled || _reduceMotion()) return;

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    // Klik via keyboard (clientX = 0) → ripple dari tengah tombol
    const hasPointer = e.clientX || e.clientY;
    const x = (hasPointer ? e.clientX - rect.left : rect.width / 2) - size / 2;
    const y = (hasPointer ? e.clientY - rect.top : rect.height / 2) - size / 2;

    const ripple = document.createElement("span");
    ripple.className = "dm-ripple";
    ripple.style.cssText =
      "width:" + size + "px;height:" + size + "px;left:" + x + "px;top:" + y + "px";
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), {
      once: true,
    });
  });
}

/* ── Notifications ────────────────────────────────────────────────────────── */

function markNotifRead(id) {
  apiFetch("/manager/notifications/" + encodeURIComponent(id) + "/read", "POST").catch(
    () => {},
  );
  const el = document.getElementById("notif-" + id);
  if (!el) return;
  el.style.transition = "opacity .25s";
  el.style.opacity = "0";
  setTimeout(() => {
    el.remove();
    _syncNotifBadge();
  }, 270);
}

function markAllNotifRead() {
  apiFetch("/manager/notifications/read-all", "POST", {}).catch(() => {});
  ["dash-notif-panel", "notif-panel"].forEach((panelId) => {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    panel.style.transition = "opacity .3s";
    panel.style.opacity = "0";
    setTimeout(() => panel.remove(), 320);
  });
}

function _syncNotifBadge() {
  const remaining = document.querySelectorAll(".dash-notif-item").length;
  document.querySelectorAll(".dash-notif-badge").forEach((badge) => {
    badge.textContent = remaining;
  });

  if (remaining === 0) {
    ["dash-notif-panel", "notif-panel"].forEach((panelId) => {
      const panel = document.getElementById(panelId);
      if (panel) {
        panel.style.transition = "opacity .25s";
        panel.style.opacity = "0";
        setTimeout(() => panel.remove(), 270);
      }
    });
  }
}

/* ── Pending leave review ─────────────────────────────────────────────────── */

/**
 * reviewLeave(id, decision)  decision = "approved" | "rejected"
 *
 * Route backend (views/manager/leaves.py):
 *   POST /manager/leaves/<id>/approve   body {note?}
 *   POST /manager/leaves/<id>/reject    body {note}  ← alasan WAJIB
 */
async function reviewLeave(id, decision) {
  const I18N = window.I18N || {};
  const approving = decision === "approved";
  let note = "";

  if (approving) {
    if (I18N.confirmApprove && !window.confirm(I18N.confirmApprove)) return;
  } else {
    const reason = window.prompt(
      I18N.rejectReasonPrompt || "Alasan penolakan (wajib diisi):",
    );
    if (reason === null) return; // dibatalkan
    note = reason.trim();
    if (!note) {
      window.alert(I18N.rejectReasonRequired || "Alasan penolakan wajib diisi.");
      return;
    }
  }

  const url =
    "/manager/leaves/" +
    encodeURIComponent(id) +
    (approving ? "/approve" : "/reject");
  const item = document.getElementById("leave-" + id);
  const buttons = item ? item.querySelectorAll("button") : [];
  buttons.forEach((b) => (b.disabled = true));

  try {
    const res = await apiFetch(url, "POST", approving ? {} : { note });
    if (!res.ok) {
      let msg = I18N.requestError || "Terjadi kesalahan. Coba lagi.";
      try {
        const data = await res.json();
        if (data && data.message) msg = data.message;
      } catch (_) {}
      throw new Error(msg);
    }
    if (item) {
      item.style.transition = "opacity .25s";
      item.style.opacity = "0";
      setTimeout(() => {
        const list = item.parentElement;
        item.remove();
        if (list && !list.querySelector(".mgr-pending-item")) {
          const label = list.previousElementSibling;
          if (label && label.classList.contains("mgr-section-label"))
            label.remove();
          list.remove();
        }
      }, 270);
    }
  } catch (err) {
    buttons.forEach((b) => (b.disabled = false));
    window.alert(err.message || I18N.requestError || "Terjadi kesalahan.");
  }
}

/* ── Init ─────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", function () {
  startClock();
  _initSearch();
  _initRipple();
});

/* eof */