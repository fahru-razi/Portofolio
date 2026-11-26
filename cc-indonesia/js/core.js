/**
 * core.js — helper front-end bersama (CSRF + fetch).
 *
 * Menggantikan tiga salinan yang sebelumnya hidup terpisah:
 *   dashboard.js     getCsrfToken() + apiFetch()
 *   leave.js         csrfToken() + fetchWithTimeout()
 *   notifications.js csrf()
 *
 * WAJIB dimuat SEBELUM script halaman mana pun (taruh sekali di base.html):
 *   <script src="{{ url_for('static', filename='js/core.js') }}"></script>
 *
 * API (window.Core):
 *   Core.csrfToken()                          -> string
 *   Core.fetchWithTimeout(url, options, ms)   -> Promise<Response>  (default 15 dtk)
 *   Core.apiFetch(url, method, body, ms)      -> Promise<Response>  (JSON + X-CSRFToken)
 */
(function (global) {
  "use strict";

  function csrfToken() {
    if (global.CSRF_TOKEN) return global.CSRF_TOKEN;
    var meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute("content") || "";
    var input = document.querySelector('input[name="csrf_token"]');
    return input ? input.value : "";
  }

  function fetchWithTimeout(url, options, ms) {
    ms = ms || 15000;
    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer;
    if (controller) {
      options = Object.assign({}, options, { signal: controller.signal });
      timer = setTimeout(function () {
        controller.abort();
      }, ms);
    }
    return fetch(url, options).then(
      function (res) {
        if (timer) clearTimeout(timer);
        return res;
      },
      function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      },
    );
  }

  function apiFetch(url, method, body, ms) {
    var options = {
      method: method || "GET",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken(),
      },
    };
    if (body !== undefined && body !== null) options.body = JSON.stringify(body);
    return fetchWithTimeout(url, options, ms);
  }

  global.Core = Object.freeze({
    csrfToken: csrfToken,
    fetchWithTimeout: fetchWithTimeout,
    apiFetch: apiFetch,
  });
})(window);