/**
 * offices.js — Manajemen kantor: peta OSM + geofence, modal tambah/edit,
 * toggle aktif, detail karyawan, animasi klik.
 *
 * Membutuhkan: Leaflet 1.9+ (global `L`) dan window.I18N (lihat offices.html).
 * Keys: officeAddTitle, officeAddBtn, officeEditTitle, officeSaveBtn, officeSaving,
 *   officeNameRequired, officeCoordRequired, officeError, officeConnFailed,
 *   officeConfirmToggle ({action}), officeDeactivate, officeActivate,
 *   officeToggleFailed, officeLoading, officeLoadFailed, officeEmployeesTitle,
 *   officeNoEmployees, officeCopied, officeCopyFailed, officePrimary
 */

(function () {
  "use strict";

  const I18N = window.I18N || {};
  const CSRF = () => {
    const m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.content : "";
  };
  const REDUCED =
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const OSM_ATTR =
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

  // Warna geofence: aktif = hijau, nonaktif = amber (kontras ≥ 3:1 vs tile OSM)
  const GEO = {
    on: { stroke: "#15803d", fill: "#16a34a", fillOpacity: 0.18 },
    off: { stroke: "#b45309", fill: "#d97706", fillOpacity: 0.2 },
  };

  let editingId = null;

  function $(id) {
    return document.getElementById(id);
  }
  function openOverlay(id) {
    $(id).classList.add("open");
  }
  function closeOverlay(id) {
    $(id).classList.remove("open");
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PETA OSM — titik GPS + lingkaran radius
  // ══════════════════════════════════════════════════════════════════════════

  // Bounding box lingkaran (meter → derajat), tanpa perlu layer ditambahkan dulu
  function circleBounds(lat, lng, r) {
    const dLat = r / 111320;
    const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
    return L.latLngBounds([lat - dLat, lng - dLng], [lat + dLat, lng + dLng]);
  }

  function fitCircle(geo) {
    const p = geo.pos;
    geo.map.invalidateSize({ animate: false });
    geo.map.setView([p.lat, p.lng], 16, { animate: false });
    // zoom terbesar (integer) yang masih memuat seluruh lingkaran + padding
    const z = geo.map.getBoundsZoom(
      circleBounds(p.lat, p.lng, p.r),
      false,
      L.point(16, 14),
    );
    const zoom = isFinite(z) ? Math.max(12, Math.min(18, z)) : 17;
    geo.map.setView([p.lat, p.lng], zoom, { animate: false });
  }

  function initCardMap(card) {
    if (card._geo || typeof L === "undefined") return;
    const el = card.querySelector(".ofc-map");
    const lat = parseFloat(card.dataset.lat);
    const lng = parseFloat(card.dataset.lng);
    const r = parseFloat(card.dataset.radius) || 100;
    if (!el || isNaN(lat) || isNaN(lng)) return;

    const active = card.dataset.active === "true";
    const cfg = active ? GEO.on : GEO.off;

    const map = L.map(el, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      zoomSnap: 1,
    });

    L.tileLayer(OSM_TILES, {
      maxZoom: 19,
      attribution: OSM_ATTR,
      // Tile OSM menolak (403) request tanpa Referer; paksa kirim origin saja
      // walau halaman memakai Referrer-Policy: no-referrer.
      referrerPolicy: "strict-origin-when-cross-origin",
    }).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);
    L.control
      .attribution({ position: "bottomright", prefix: false })
      .addTo(map);

    const circle = L.circle([lat, lng], {
      radius: r,
      color: cfg.stroke,
      weight: 2,
      dashArray: "6 5",
      fillColor: cfg.fill,
      fillOpacity: cfg.fillOpacity,
      interactive: false,
    }).addTo(map);

    const pin = L.marker([lat, lng], {
      icon: L.divIcon({
        className: "ofc-pin",
        html: '<span class="ofc-pin-pulse"></span><span class="ofc-pin-dot"></span>',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
      interactive: false,
      keyboard: false,
    }).addTo(map);

    const geo = { map: map, circle: circle, pin: pin, cfg: cfg, pos: { lat: lat, lng: lng, r: r } };
    card._geo = geo;
    fitCircle(geo);

    // Re-fit saat lebar kartu berubah (resize / rotasi layar)
    if ("ResizeObserver" in window) {
      let raf = 0;
      new ResizeObserver(function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          fitCircle(geo);
        });
      }).observe(el);
    }
  }

  // Inisialisasi lazy: peta dibuat saat kartu mendekati viewport
  function initMaps() {
    const cards = document.querySelectorAll(".ofc-card");
    if (!("IntersectionObserver" in window)) {
      cards.forEach(initCardMap);
      return;
    }
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            initCardMap(en.target);
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "120px" },
    );
    cards.forEach(function (c) {
      io.observe(c);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  ANIMASI KLIK
  // ══════════════════════════════════════════════════════════════════════════

  // Ripple pada tombol / chip
  function createRipple(e) {
    const btn = e.currentTarget;
    const old = btn.querySelector(".ofc-ripple");
    if (old) old.remove();
    if (REDUCED) return;

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.8;
    const ripple = document.createElement("span");
    ripple.className = "ofc-ripple";
    ripple.style.width = ripple.style.height = size + "px";
    ripple.style.left = e.clientX - rect.left - size / 2 + "px";
    ripple.style.top = e.clientY - rect.top - size / 2 + "px";
    btn.appendChild(ripple);
    ripple.addEventListener("animationend", function () {
      ripple.remove();
    });
  }

  function attachRipples() {
    document
      .querySelectorAll(
        ".ofc-grid .btn, .ofc-emp-count, .ofc-map-link, .ofc-add-card, .ofc-meta--coord, .btn-modal-submit, .btn-modal-cancel",
      )
      .forEach(function (btn) {
        btn.classList.add("ofc-ripple-host");
        btn.addEventListener("click", createRipple);
      });
  }

  // Kartu "pop" (pakai Web Animations API agar animasi entrance CSS tidak terulang)
  function popCard(card) {
    if (REDUCED || !card.animate) return;
    card.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(0.975)", offset: 0.35 },
        { transform: "scale(1.012)", offset: 0.7 },
        { transform: "scale(1)" },
      ],
      { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }

  // Radar ping: cincin melebar dari titik kantor sampai batas radius geofence
  function pingGeofence(card) {
    const geo = card._geo;
    if (!geo) return;

    const pinEl = geo.pin.getElement();
    if (pinEl) {
      pinEl.classList.remove("is-bounce");
      void pinEl.offsetWidth; // restart animasi
      pinEl.classList.add("is-bounce");
    }
    if (REDUCED) return;

    const ring = L.circle([geo.pos.lat, geo.pos.lng], {
      radius: 0,
      color: geo.cfg.stroke,
      weight: 2,
      fillColor: geo.cfg.fill,
      fillOpacity: 0.35,
      interactive: false,
    }).addTo(geo.map);

    const dur = 950;
    const t0 = performance.now();
    requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      ring.setRadius(Math.max(0.1, geo.pos.r * ease));
      ring.setStyle({ opacity: 1 - t, fillOpacity: 0.35 * (1 - t) });
      if (t < 1) requestAnimationFrame(step);
      else geo.map.removeLayer(ring);
    });
  }

  // Klik pada kartu (bukan tombol/link/kontrol zoom) → pilih + pop + ping
  function selectCard(card) {
    document.querySelectorAll(".ofc-card.is-selected").forEach(function (c) {
      if (c !== card) c.classList.remove("is-selected");
    });
    card.classList.add("is-selected");
    popCard(card);
    pingGeofence(card);
  }
  function clearSelection() {
    document.querySelectorAll(".ofc-card.is-selected").forEach(function (c) {
      c.classList.remove("is-selected");
    });
  }
  function onDocClick(e) {
    const card = e.target.closest(".ofc-card");
    if (!card) {
      if (!e.target.closest(".ofc-modal-overlay, .ofc-add-card")) clearSelection();
      return;
    }
    if (e.target.closest("button, a, .leaflet-control")) return;
    selectCard(card);
  }

  // Toast
  function showToast(msg) {
    document.querySelectorAll(".ofc-toast").forEach(function (t) {
      t.remove();
    });
    const t = document.createElement("div");
    t.className = "ofc-toast";
    t.setAttribute("role", "status");
    t.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
      esc(msg);
    document.body.appendChild(t);
    setTimeout(function () {
      t.classList.add("out");
    }, 1700);
    setTimeout(function () {
      t.remove();
    }, 2000);
  }

  // Salin koordinat (fallback execCommand untuk http non-localhost / intranet)
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }
  window.copyCoord = function (btn) {
    copyText(btn.dataset.copy || "").then(
      function () {
        btn.classList.remove("copied");
        void btn.offsetWidth;
        btn.classList.add("copied");
        setTimeout(function () {
          btn.classList.remove("copied");
        }, 800);
        showToast(I18N.officeCopied || "Koordinat disalin");
      },
      function () {
        showToast(I18N.officeCopyFailed || "Gagal menyalin koordinat");
      },
    );
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  MODAL TAMBAH / EDIT
  // ══════════════════════════════════════════════════════════════════════════
  window.openAdd = function () {
    editingId = null;
    $("ofc-modal-title").textContent = I18N.officeAddTitle || "Tambah Kantor";
    $("ofc-save-label").textContent = I18N.officeAddBtn || "Tambah";
    clearForm();
    openOverlay("ofc-modal-overlay");
    $("f-name").focus();
  };

  window.openEdit = function (card) {
    editingId = card.dataset.id;
    $("ofc-modal-title").textContent = I18N.officeEditTitle || "Edit Kantor";
    $("ofc-save-label").textContent = I18N.officeSaveBtn || "Simpan Perubahan";
    $("f-name").value = card.dataset.name || "";
    $("f-address").value = card.dataset.address || "";
    $("f-lat").value = card.dataset.lat || "";
    $("f-lng").value = card.dataset.lng || "";
    $("f-radius").value = card.dataset.radius || 100;
    $("f-wstart").value = card.dataset.wstart || "08:00";
    $("f-wend").value = card.dataset.wend || "17:00";
    $("f-tol").value = card.dataset.tol || 15;
    openOverlay("ofc-modal-overlay");
    $("f-name").focus();
  };

  function clearForm() {
    ["f-name", "f-address"].forEach(function (id) {
      $(id).value = "";
    });
    $("f-lat").value = "";
    $("f-lng").value = "";
    $("f-radius").value = "100";
    $("f-wstart").value = "08:00";
    $("f-wend").value = "17:00";
    $("f-tol").value = "15";
  }

  window.closeModal = function (e) {
    if (e.target === $("ofc-modal-overlay")) closeOverlay("ofc-modal-overlay");
  };
  window.closeModalDirect = function () {
    closeOverlay("ofc-modal-overlay");
  };
  window.closeDetailModal = function (e) {
    if (e.target === $("ofc-detail-overlay"))
      closeOverlay("ofc-detail-overlay");
  };

  // ── Simpan (tambah / edit) ─────────────────────────────────────────────────
  window.saveOffice = async function () {
    const name = $("f-name").value.trim();
    const address = $("f-address").value.trim();
    const lat = parseFloat($("f-lat").value);
    const lng = parseFloat($("f-lng").value);
    const radius = parseInt($("f-radius").value, 10);
    const wstart = $("f-wstart").value;
    const wend = $("f-wend").value;
    const tol = parseInt($("f-tol").value, 10);

    if (!name) {
      alert(I18N.officeNameRequired || "Nama kantor wajib diisi.");
      return;
    }
    if (isNaN(lat) || isNaN(lng)) {
      alert(
        I18N.officeCoordRequired || "Koordinat latitude/longitude wajib diisi.",
      );
      return;
    }

    const btn = $("ofc-save-btn");
    btn.disabled = true;
    $("ofc-save-label").textContent = I18N.officeSaving || "Menyimpan…";

    const url = editingId
      ? "/manager/offices/" + editingId
      : "/manager/offices";
    const method = editingId ? "PUT" : "POST";
    const body = JSON.stringify({
      name: name,
      address: address,
      latitude: lat,
      longitude: lng,
      radius_meters: radius,
      work_start: wstart,
      work_end: wend,
      late_tolerance_minutes: tol,
    });

    try {
      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json", "X-CSRFToken": CSRF() },
        body: body,
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || I18N.officeError || "Terjadi kesalahan.");
        return;
      }
      closeOverlay("ofc-modal-overlay");
      window.location.reload();
    } catch (err) {
      alert(I18N.officeConnFailed || "Koneksi gagal. Coba lagi.");
    } finally {
      btn.disabled = false;
      $("ofc-save-label").textContent = editingId
        ? I18N.officeSaveBtn || "Simpan Perubahan"
        : I18N.officeAddBtn || "Tambah";
    }
  };

  // ── Toggle aktif / nonaktif ────────────────────────────────────────────────
  window.toggleOffice = async function (id, isActive, btn) {
    const action = isActive
      ? I18N.officeDeactivate || "nonaktifkan"
      : I18N.officeActivate || "aktifkan";
    const confirmMsg = (
      I18N.officeConfirmToggle || "Yakin ingin {action} kantor ini?"
    ).replace("{action}", action);

    if (!confirm(confirmMsg)) return;
    btn.disabled = true;

    const card = btn.closest(".ofc-card");
    const canAnim = card && !REDUCED && card.animate;
    if (canAnim) popCard(card);

    let fade = null;
    try {
      const res = await fetch("/manager/offices/" + id + "/toggle", {
        method: "POST",
        headers: { "X-CSRFToken": CSRF() },
      });
      const data = await res.json();
      if (data.ok) {
        if (canAnim) {
          fade = card.animate(
            [
              { opacity: 1, transform: "scale(1)" },
              { opacity: 0, transform: "scale(0.96) translateY(4px)" },
            ],
            { duration: 250, easing: "ease", fill: "forwards" },
          );
          await new Promise(function (r) {
            setTimeout(r, 230);
          });
        }
        window.location.reload();
      } else {
        alert(
          data.error ||
            I18N.officeToggleFailed ||
            "Gagal mengubah status kantor.",
        );
      }
    } catch (err) {
      if (fade) fade.cancel();
      alert(I18N.officeConnFailed || "Koneksi gagal.");
    } finally {
      btn.disabled = false;
    }
  };

  // ── Detail karyawan (modal) ────────────────────────────────────────────────
  window.showDetail = async function (officeId) {
    const list = $("ofc-detail-emp-list");
    list.innerHTML =
      '<div class="ofc-empty-emp">' +
      esc(I18N.officeLoading || "Memuat…") +
      "</div>";
    openOverlay("ofc-detail-overlay");

    try {
      const res = await fetch("/manager/offices/" + officeId + "/detail");
      const data = await res.json();

      if (!data.ok) {
        list.innerHTML =
          '<div class="ofc-empty-emp">' +
          esc(I18N.officeLoadFailed || "Gagal memuat data.") +
          "</div>";
        return;
      }

      $("ofc-detail-title").textContent =
        (I18N.officeEmployeesTitle || "Karyawan — ") + data.office.name;

      if (!data.employees.length) {
        list.innerHTML =
          '<div class="ofc-empty-emp">' +
          esc(
            I18N.officeNoEmployees ||
              "Belum ada karyawan yang di-assign ke kantor ini.",
          ) +
          "</div>";
        return;
      }

      list.innerHTML = data.employees
        .map(function (emp, i) {
          return (
            '<div class="ofc-detail-emp-row' +
            (emp.is_active ? "" : " inactive") +
            '" style="animation: cardEntrance 0.3s cubic-bezier(0.22,1,0.36,1) ' +
            i * 0.045 +
            's both">' +
            '<div class="ofc-det-avatar">' +
            esc(emp.initials) +
            "</div>" +
            "<div>" +
            '<div class="ofc-det-name">' +
            esc(emp.full_name) +
            "</div>" +
            '<div class="ofc-det-meta">' +
            esc(emp.department) +
            " · " +
            esc(emp.code) +
            "</div>" +
            "</div>" +
            (emp.is_primary
              ? '<span class="ofc-det-primary">' +
                esc(I18N.officePrimary || "Utama") +
                "</span>"
              : "") +
            "</div>"
          );
        })
        .join("");
    } catch (err) {
      list.innerHTML =
        '<div class="ofc-empty-emp">' +
        esc(I18N.officeLoadFailed || "Gagal memuat data.") +
        "</div>";
    }
  };

  // ── Keyboard ESC ──────────────────────────────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeOverlay("ofc-modal-overlay");
      closeOverlay("ofc-detail-overlay");
      clearSelection();
    }
  });

  // ── Init ───────────────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", function () {
    initMaps();
    attachRipples();
    document.addEventListener("click", onDocClick);
  });
})();