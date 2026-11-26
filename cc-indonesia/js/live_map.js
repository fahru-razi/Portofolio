/**
 * live_map.js — Peta lokasi karyawan (eksekutif), Leaflet + OpenStreetMap.
 *
 * Alur data:
 *   1. Halaman dibuka/disegarkan -> GET data (langsung tampil) lalu
 *      POST refresh ("minta update sekarang") ke semua karyawan.
 *   2. 75 detik berikutnya data diambil tiap 10 dtk supaya jawaban dari
 *      perangkat yang aplikasinya terbuka muncul begitu masuk.
 *   3. Setelahnya tiap 60 dtk (hanya agar label "X menit lalu" tetap benar).
 *
 * KEAMANAN: semua teks yang berasal dari data (nama, departemen, kantor)
 * dirender lewat textContent / node DOM — TIDAK pernah lewat innerHTML.
 * Perhatian: Leaflet memperlakukan string di bindPopup/bindTooltip sebagai
 * HTML, jadi yang diberikan ke sana selalu elemen DOM, bukan string.
 *
 * Bergantung pada: window.L (Leaflet), window.Core, window.LM_CFG, window.LM_I18N
 */
(function () {
  "use strict";

  var cfg = window.LM_CFG;
  var T = window.LM_I18N || {};
  var L = window.L;
  if (!cfg || !L || !window.Core) return;

  var COLORS = {
    live: "#15803d",
    office_network: "#2874a6",
    approximate: "#7c3aed",
    gps_off: "#6b7280",
    stale: "#d97706",
    no_data: "#9ca3af",
  };
  var ORDER = ["live", "office_network", "approximate", "gps_off", "stale", "no_data"];

  var state = { data: null, filter: "all", q: "", fitted: false };
  var markers = {}; // userId -> L.circleMarker
  var timer = null;

  // ── Peta ───────────────────────────────────────────────────────────────────
  var map = L.map("lm-map", { zoomControl: true }).setView([-2.5, 118], 5);
  L.tileLayer(cfg.tileUrl, {
    attribution: cfg.tileAttribution,
    maxZoom: 19,
    // Aplikasi mengirim Referrer-Policy: same-origin, yang membuat browser
    // TIDAK mengirim Referer ke server tile. OpenStreetMap menolak request
    // tanpa Referer (HTTP 403). Opsi ini mengirim hanya origin (bukan path).
    referrerPolicy: "strict-origin-when-cross-origin",
  }).addTo(map);
  var officeLayer = L.layerGroup().addTo(map);
  var empLayer = L.layerGroup().addTo(map);

  // ── Helper DOM ─────────────────────────────────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function $(id) { return document.getElementById(id); }

  function ageLabel(sec) {
    if (sec == null) return "";
    if (sec < 60) return T.justNow || "baru saja";
    if (sec < 3600) return Math.round(sec / 60) + " " + (T.minAgo || "menit lalu");
    return Math.floor(sec / 3600) + " " + (T.hourAgo || "jam lalu");
  }

  function gpsReason(st) {
    return {
      denied: T.gpsDenied, unavailable: T.gpsUnavailable,
      timeout: T.gpsTimeout, unsupported: T.gpsUnsupported,
    }[st] || "";
  }

  function sourceLabel(e) {
    if (e.source === "gps") return T.sourceGps;
    if (e.source === "office_ip") return T.sourceOfficeIp;
    if (e.source === "geoip") {
      return T.sourceGeoip + (e.geo_label ? " — " + e.geo_label : "");
    }
    var why = gpsReason(e.gps_status);
    return T.sourceNone + (why ? " (" + why + ")" : "");
  }

  function locationLine(e) {
    if (e.office_name) return T.nowAt + ": " + e.office_name;
    if (e.status === "live") return T.outside;
    return "";
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  function visibleEmployees() {
    var q = state.q;
    return (state.data ? state.data.employees : []).filter(function (e) {
      if (state.filter !== "all" && e.status !== state.filter) return false;
      return !q || (e.name || "").toLowerCase().indexOf(q) !== -1;
    }).sort(function (a, b) {
      // yang punya lokasi di atas, "belum ada data" di bawah; lalu urut nama
      var d = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
      return d || (a.name || "").localeCompare(b.name || "");
    });
  }

  // Beberapa karyawan bisa punya koordinat identik (mis. semua terdeteksi lewat
  // IP kantor = titik pusat kantor). Sebarkan di lingkaran kecil agar tidak
  // saling menutupi. Murni kosmetik; popup tetap menjelaskan sumbernya.
  function displayPositions(list) {
    var groups = {};
    list.forEach(function (e) {
      if (e.lat == null) return;
      var k = e.lat.toFixed(5) + "," + e.lng.toFixed(5);
      (groups[k] = groups[k] || []).push(e);
    });
    var pos = {};
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length === 1) { pos[g[0].id] = [g[0].lat, g[0].lng]; return; }
      var rM = Math.min(15 + g.length * 4, 80);
      g.forEach(function (e, i) {
        var a = (2 * Math.PI * i) / g.length;
        pos[e.id] = [
          e.lat + (rM * Math.cos(a)) / 111320,
          e.lng + (rM * Math.sin(a)) / (111320 * Math.cos((e.lat * Math.PI) / 180)),
        ];
      });
    });
    return pos;
  }

  // ── Popup ──────────────────────────────────────────────────────────────────
  function popupFor(e) {
    var box = el("div", "lm-pop");
    box.appendChild(el("b", null, e.name));
    if (e.department) box.appendChild(el("div", null, e.department));
    box.appendChild(el("div", null, T.statusLabel + ": " + (T[e.status] || e.status)));
    var loc = locationLine(e);
    if (loc) box.appendChild(el("div", null, loc));
    if (e.home_office_name) {
      box.appendChild(el("div", null, T.homeOffice + ": " + e.home_office_name +
        (e.visiting ? " · " + T.visiting : "")));
    }
    box.appendChild(el("div", null, T.source + ": " + sourceLabel(e)));
    if (e.status === "approximate") {
      box.appendChild(el("div", "lm-pop-warn", T.approxNote));
    }
    if (e.status === "gps_off" || e.status === "stale") {
      box.appendChild(el("div", "lm-pop-warn", T.lastKnown));
    }
    if (e.reported_age_s != null) {
      box.appendChild(el("div", null, T.lastSeen + ": " + ageLabel(e.reported_age_s) +
        (e.reported_at ? " (" + e.reported_at + ")" : "")));
    }
    return box;
  }

  // ── Render: kantor ─────────────────────────────────────────────────────────
  var officeSig = "";
  function renderOffices(offices) {
    // Lingkaran kantor hanya digambar ulang bila geometrinya berubah, supaya
    // label permanen tidak berkedip setiap polling.
    var sig = offices.map(function (o) {
      return [o.id, o.name, o.lat, o.lng, o.radius_m].join("|");
    }).join(";");
    if (sig !== officeSig) {
      officeSig = sig;
      officeLayer.clearLayers();
      offices.forEach(function (o) {
        var circle = L.circle([o.lat, o.lng], {
          radius: o.radius_m, color: "#1b4f72", weight: 1.5,
          fillColor: "#1b4f72", fillOpacity: 0.06,
        }).addTo(officeLayer);
        circle.bindTooltip(el("span", null, o.name), {
          permanent: true, direction: "top", offset: [0, -4],
        });
      });
    }

    var box = $("lm-offices");
    box.textContent = "";
    offices.forEach(function (o) {
      var btn = el("button", "lm-office");
      btn.type = "button";
      btn.appendChild(el("span", null, o.name));
      var guests = o.visiting ? " (" + o.visiting + " " + T.guests + ")" : "";
      btn.appendChild(el("small", null, o.present + " " + T.here + guests));
      btn.addEventListener("click", function () {
        map.flyTo([o.lat, o.lng], 16);
      });
      box.appendChild(btn);
    });
  }

  // ── Render: ringkasan ──────────────────────────────────────────────────────
  function renderSummary(data) {
    var box = $("lm-summary");
    box.textContent = "";
    var by = data.summary.by_status || {};

    function chip(key, label, count, dotClass) {
      var c = el("button", "lm-chip" + (state.filter === key ? " active" : ""));
      c.type = "button";
      if (dotClass) c.appendChild(el("span", "lm-dot " + dotClass));
      c.appendChild(el("span", null, label));
      c.appendChild(el("b", null, String(count)));
      c.addEventListener("click", function () {
        state.filter = key;
        render();
      });
      box.appendChild(c);
    }

    chip("all", T.allStatus, data.summary.total, null);
    ORDER.forEach(function (s) {
      if (by[s]) chip(s, T[s], by[s], s);
    });
  }

  // ── Render: daftar ─────────────────────────────────────────────────────────
  function renderList(list, pos) {
    var ul = $("lm-list");
    ul.textContent = "";
    $("lm-count").textContent = "(" + list.length + ")";

    if (!list.length) {
      var msg = state.data && state.data.employees.length ? T.noResult : T.nobody;
      ul.appendChild(el("li", "lm-empty", msg));
      return;
    }
    list.forEach(function (e) {
      var has = !!pos[e.id];
      var li = el("li", "lm-item" + (has ? "" : " nocoords"));
      li.appendChild(el("span", "lm-dot " + e.status));

      var body = el("div");
      body.appendChild(el("div", "lm-item-name", e.name));
      var meta = [e.department, T[e.status]].filter(Boolean).join(" · ");
      body.appendChild(el("div", "lm-item-meta", meta));

      var where = locationLine(e);
      if (where || e.visiting) {
        var line = el("div", "lm-item-meta", where);
        if (e.visiting) line.appendChild(el("span", "lm-tag-visit", " · " + T.visiting));
        body.appendChild(line);
      }
      var tail = e.reported_age_s != null
        ? T.lastSeen + ": " + ageLabel(e.reported_age_s)
        : (has ? "" : T.noCoords);
      if (tail) body.appendChild(el("div", "lm-item-meta", tail));
      li.appendChild(body);

      if (has) {
        li.addEventListener("click", function () {
          map.flyTo(pos[e.id], Math.max(map.getZoom(), 16));
          var m = markers[e.id];
          if (m) m.openPopup();
        });
      }
      ul.appendChild(li);
    });
  }

  // ── Render: marker ─────────────────────────────────────────────────────────
  function renderMarkers(list, pos) {
    empLayer.clearLayers();
    markers = {};
    list.forEach(function (e) {
      var p = pos[e.id];
      if (!p) return;
      var color = COLORS[e.status] || COLORS.no_data;
      var faded = e.status === "stale" || e.status === "gps_off" || e.status === "approximate";

      if (e.accuracy_m && e.status === "approximate") {
        L.circle(p, {
          radius: e.accuracy_m, color: color, weight: 1, dashArray: "6 6",
          fillOpacity: 0.04, interactive: false,
        }).addTo(empLayer);
      } else if (e.accuracy_m && e.status === "live" && e.accuracy_m >= 15 && e.accuracy_m <= 2000) {
        L.circle(p, {
          radius: e.accuracy_m, color: color, weight: 1,
          fillOpacity: 0.08, interactive: false,
        }).addTo(empLayer);
      }

      var m = L.circleMarker(p, {
        radius: 9, color: "#ffffff", weight: 2,
        fillColor: color, fillOpacity: faded ? 0.55 : 0.95,
      }).addTo(empLayer);
      m.bindPopup(popupFor(e));
      markers[e.id] = m;
    });
  }

  function fitOnce(data, pos) {
    if (state.fitted) return;
    var pts = [];
    data.offices.forEach(function (o) { pts.push([o.lat, o.lng]); });
    Object.keys(pos).forEach(function (id) { pts.push(pos[id]); });
    if (!pts.length) return;
    state.fitted = true;
    if (pts.length === 1) { map.setView(pts[0], 15); return; }
    map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 16 });
  }

  function render() {
    var data = state.data;
    if (!data) return;
    var list = visibleEmployees();
    var pos = displayPositions(list);
    renderSummary(data);
    renderOffices(data.offices);
    renderMarkers(list, pos);
    renderList(list, pos);
    fitOnce(data, displayPositions(data.employees));
    $("lm-updated").textContent = (T.updatedAt || "Diperbarui") + " " + data.server_time;
  }

  // ── Banner ─────────────────────────────────────────────────────────────────
  function banner(text) {
    var b = $("lm-banner");
    if (!text) { b.hidden = true; b.textContent = ""; return; }
    b.textContent = text;
    b.hidden = false;
  }

  // ── Jaringan ───────────────────────────────────────────────────────────────
  function load() {
    return window.Core.apiFetch(cfg.dataUrl, "GET")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (d) {
        state.data = d;
        render();
      })
      .catch(function () { banner(T.loadError || "Gagal memuat data lokasi."); });
  }

  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

  function startIdle() {
    stopTimer();
    timer = setInterval(function () { if (!document.hidden) load(); },
      (cfg.idleEverySeconds || 60) * 1000);
  }

  function startBurst() {
    stopTimer();
    var started = Date.now();
    timer = setInterval(function () {
      if (document.hidden) return;
      load();
      if (Date.now() - started > (cfg.burstSeconds || 75) * 1000) {
        banner("");
        startIdle();
      }
    }, (cfg.burstEverySeconds || 10) * 1000);
  }

  function requestRefresh() {
    return window.Core.apiFetch(cfg.refreshUrl, "POST", {})
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.requested && d.employees > 0) {
          banner((T.requesting || "").replace("{n}", d.employees));
        } else if (d.throttled) {
          banner(T.throttled);
        } else {
          banner("");
        }
        startBurst();
      })
      .catch(function () { /* data tetap dimuat tiap interval */ startIdle(); });
  }

  // ── Legenda ────────────────────────────────────────────────────────────────
  (function buildLegend() {
    var box = $("lm-legend");
    ORDER.forEach(function (s) {
      var item = el("span");
      item.appendChild(el("span", "lm-dot " + s));
      item.appendChild(el("span", null, T[s]));
      box.appendChild(item);
    });
  })();

  // ── Event ──────────────────────────────────────────────────────────────────
  $("lm-search").addEventListener("input", function (e) {
    state.q = e.target.value.trim().toLowerCase();
    render();
  });
  $("lm-refresh").addEventListener("click", function () {
    load().then(requestRefresh);
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) load();
  });

  // Membuka/menyegarkan halaman = memperbarui lokasi.
  load().then(requestRefresh);
})();
