/**
 * push.js — Web Push di sisi browser.
 * Butuh: core.js (window.Core). Dimuat setelah notifications.js di base.html.
 *
 * Perilaku:
 *  - Mendaftarkan /sw.js. Bila izin sudah "granted" dan user belum menolak
 *    lewat tombol matikan, langganan dibuat/diselaraskan otomatis tiap
 *    halaman dimuat (server hanya menulis ke DB bila ada perubahan).
 *  - Izin TIDAK diminta saat halaman dibuka: kartu ajakan dulu, izin baru
 *    diminta setelah user mengetuk "Nyalain notif" (aturan browser & iOS).
 *  - Elemen [data-push-toggle] di halaman mana pun dirender jadi saklar +
 *    tombol tes (cocok ditaruh di Profil).
 *  - Push.forgetDevice() dipanggil saat logout agar perangkat bersama tidak
 *    terus menerima notifikasi pemilik sebelumnya.
 */
(function (global) {
  "use strict";

  var Core = global.Core;
  if (!Core) {
    console.warn("[push] core.js belum dimuat");
    return;
  }

  var OPTOUT_KEY = "push:optout";
  var DISMISS_KEY = "push:dismissedAt";
  var DISMISS_MS = 7 * 24 * 3600 * 1000;

  var hasApi =
    "serviceWorker" in navigator &&
    "PushManager" in global &&
    "Notification" in global;
  var isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isStandalone =
    navigator.standalone === true ||
    (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches);

  var configPromise = null;
  var readyPromise = null;

  /* ── util ─────────────────────────────────────────────────────────────── */
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key);
      else localStorage.setItem(key, val);
    } catch (e) {
      return null;
    }
  }

  function toKeyBytes(b64) {
    var pad = "=".repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function sameKey(buf, bytes) {
    if (!buf) return false;
    var a = new Uint8Array(buf);
    if (a.length !== bytes.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== bytes[i]) return false;
    return true;
  }

  function getConfig() {
    if (!configPromise) {
      configPromise = Core.apiFetch("/push/config", "GET", null, 8000)
        .then(function (r) {
          return r.ok ? r.json() : { enabled: false };
        })
        .catch(function () {
          return { enabled: false };
        });
    }
    return configPromise;
  }

  function getRegistration() {
    if (!readyPromise) {
      readyPromise = navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then(function () {
          return navigator.serviceWorker.ready;
        });
    }
    return readyPromise;
  }

  function sync(sub) {
    return Core.apiFetch("/push/subscribe", "POST", sub.toJSON());
  }

  /* ── state ────────────────────────────────────────────────────────────── */
  // "unsupported" | "ios-install" | "disabled" | "denied" | "prompt" | "off" | "on"
  async function getState() {
    if (!hasApi) return isIOS && !isStandalone ? "ios-install" : "unsupported";
    var cfg = await getConfig();
    if (!cfg.enabled) return "disabled";
    if (Notification.permission === "denied") return "denied";
    var reg = await getRegistration();
    var sub = await reg.pushManager.getSubscription();
    if (sub) return "on";
    if (Notification.permission === "granted") return "off";
    return "prompt";
  }

  function announce(state) {
    global.dispatchEvent(new CustomEvent("push:changed", { detail: { state: state } }));
  }

  /* ── aksi ─────────────────────────────────────────────────────────────── */
  async function subscribeAndSync() {
    var cfg = await getConfig();
    var reg = await getRegistration();
    var keyBytes = toKeyBytes(cfg.publicKey);
    var sub = await reg.pushManager.getSubscription();
    // Kunci VAPID server diganti -> langganan lama tak berlaku lagi.
    if (sub && !sameKey(sub.options && sub.options.applicationServerKey, keyBytes)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes,
      });
    }
    var res = await sync(sub);
    if (!res.ok) throw new Error("subscribe " + res.status);
    return sub;
  }

  async function enable() {
    var perm = await Notification.requestPermission(); // harus dari klik user
    if (perm !== "granted") {
      announce(await getState());
      return perm;
    }
    await subscribeAndSync();
    store(OPTOUT_KEY, null);
    announce("on");
    return "granted";
  }

  async function disable() {
    var reg = await getRegistration();
    var sub = await reg.pushManager.getSubscription();
    if (sub) {
      var endpoint = sub.endpoint;
      await sub.unsubscribe();
      Core.apiFetch("/push/unsubscribe", "POST", { endpoint: endpoint }).catch(function () {});
    }
    store(OPTOUT_KEY, "1");
    announce("off");
  }

  // Saat logout: lepas perangkat ini dari akun yang keluar (best effort, cepat).
  async function forgetDevice() {
    if (!hasApi) return;
    try {
      var reg = await getRegistration();
      var sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await Core.apiFetch("/push/unsubscribe", "POST", { endpoint: sub.endpoint }, 3000);
      await sub.unsubscribe();
    } catch (e) {
      /* abaikan: logout tidak boleh tertahan */
    }
  }

  async function sendTest() {
    var r = await Core.apiFetch("/push/test", "POST", {});
    var d = {};
    try {
      d = await r.json();
    } catch (e) {}
    return { ok: r.ok, message: d.message || "" };
  }

  /* ── UI: kartu ajakan ─────────────────────────────────────────────────── */
  function dismissedRecently() {
    var at = parseInt(store(DISMISS_KEY), 10);
    return at && Date.now() - at < DISMISS_MS;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function showCard(kind) {
    var host = document.getElementById("main-content");
    if (!host || document.getElementById("push-card")) return;

    var card = el("section", "push-card");
    card.id = "push-card";
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "Notifikasi");

    var icon = el("div", "push-card__icon", kind === "ios" ? "📲" : "🔔");
    var body = el("div", "push-card__body");
    var title = el(
      "div",
      "push-card__title",
      kind === "ios" ? "Mau notif di iPhone?" : "Biar nggak kelewat absen",
    );
    var text = el(
      "div",
      "push-card__text",
      kind === "ios"
        ? "Ketuk tombol Bagikan (kotak dengan panah ke atas), pilih “Tambahkan ke Layar Utama”, lalu buka aplikasinya dari sana. Setelah itu notif bisa dinyalain."
        : "Nyalain notif, nanti kamu diingetin pas waktunya check-in & check-out. Tenang, nggak bakal spam kok.",
    );
    body.appendChild(title);
    body.appendChild(text);

    var actions = el("div", "push-card__actions");
    var later = el("button", "push-btn push-btn--ghost", kind === "ios" ? "Oke, paham" : "Nanti aja");
    later.type = "button";
    later.addEventListener("click", function () {
      store(DISMISS_KEY, String(Date.now()));
      card.remove();
    });
    actions.appendChild(later);

    if (kind !== "ios") {
      var go = el("button", "push-btn push-btn--primary", "Nyalain notif");
      go.type = "button";
      go.addEventListener("click", async function () {
        go.disabled = true;
        try {
          var result = await enable();
          if (result === "granted") {
            title.textContent = "Siap! Notif udah nyala ✨";
            text.textContent = "Kamu bakal diingetin pas waktunya check-in & check-out.";
            actions.remove();
            setTimeout(function () {
              card.remove();
            }, 4000);
          } else {
            text.textContent =
              "Notif nggak jadi nyala. Kalau berubah pikiran, izinkan notifikasi di pengaturan situs ya.";
            go.remove();
          }
        } catch (e) {
          console.error("[push]", e);
          text.textContent = "Waduh, gagal nyalain notif. Coba lagi ya.";
          go.disabled = false;
        }
      });
      actions.appendChild(go);
    }

    card.appendChild(icon);
    card.appendChild(body);
    card.appendChild(actions);
    host.insertBefore(card, host.firstChild);
  }

  /* ── UI: saklar [data-push-toggle] ────────────────────────────────────── */
  var MESSAGES = {
    unsupported: "Browser ini belum mendukung notif push.",
    "ios-install":
      "Di iPhone, tambahkan dulu ke Layar Utama (Bagikan → Tambahkan ke Layar Utama), lalu buka dari sana.",
    disabled: "Notif push belum diaktifkan di server.",
    denied:
      "Notif lagi diblokir di browser. Buka pengaturan situs → Notifikasi → Izinkan, terus refresh ya.",
    prompt: "Notif belum nyala di perangkat ini.",
    off: "Notif mati di perangkat ini.",
    on: "Notif nyala di perangkat ini ✅",
  };

  async function renderToggle(root) {
    var state = await getState();
    root.textContent = "";
    var wrap = el("div", "push-toggle");
    var msg = el("div", "push-toggle__msg", MESSAGES[state] || "");
    wrap.appendChild(msg);

    var row = el("div", "push-toggle__row");
    if (state === "prompt" || state === "off") {
      var on = el("button", "push-btn push-btn--primary", "Nyalain notif");
      on.type = "button";
      on.addEventListener("click", async function () {
        on.disabled = true;
        try {
          await enable();
        } catch (e) {
          msg.textContent = "Waduh, gagal nyalain notif. Coba lagi ya.";
          on.disabled = false;
        }
      });
      row.appendChild(on);
    } else if (state === "on") {
      var test = el("button", "push-btn push-btn--ghost", "Kirim notif tes");
      test.type = "button";
      test.addEventListener("click", async function () {
        test.disabled = true;
        var r = await sendTest();
        msg.textContent = r.ok ? "Tes terkirim! Cek notifikasimu 👀" : r.message || "Tes gagal, coba lagi.";
        setTimeout(function () {
          test.disabled = false;
        }, 3000);
      });
      var off = el("button", "push-btn push-btn--ghost", "Matikan");
      off.type = "button";
      off.addEventListener("click", function () {
        off.disabled = true;
        disable().catch(function () {
          off.disabled = false;
        });
      });
      row.appendChild(test);
      row.appendChild(off);
    }
    wrap.appendChild(row);
    root.appendChild(wrap);
  }

  function mountToggles() {
    document.querySelectorAll("[data-push-toggle]").forEach(renderToggle);
  }

  /* ── init ─────────────────────────────────────────────────────────────── */
  async function init() {
    try {
      var state = await getState();

      if (state === "on") {
        var reg = await getRegistration();
        var sub = await reg.pushManager.getSubscription();
        if (sub) sync(sub).catch(function () {}); // menjaga kepemilikan perangkat
      } else if (state === "off" && !store(OPTOUT_KEY)) {
        await subscribeAndSync(); // izin sudah ada (mis. login ulang): senyap
        announce("on");
      } else if (state === "prompt" && !dismissedRecently()) {
        showCard("prompt");
      } else if (state === "ios-install" && !dismissedRecently()) {
        showCard("ios");
      }
      mountToggles();
    } catch (e) {
      console.warn("[push] init:", e);
    }
  }

  global.addEventListener("push:changed", function () {
    var card = document.getElementById("push-card");
    if (card && !card.querySelector(".push-btn--primary")) return;
    mountToggles();
  });

  global.Push = Object.freeze({
    state: getState,
    enable: enable,
    disable: disable,
    forgetDevice: forgetDevice,
    sendTest: sendTest,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
