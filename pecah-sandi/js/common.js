/* Pembantu bersama: DOM, API, penyimpanan lokal, tabel yang bisa diurutkan. */
(function () {
  'use strict';
  var S = window.SANDI = window.SANDI || {};

  S.cipherByKey = {};
  (S.ciphers || []).forEach(function (c) { S.cipherByKey[c.key] = c; });

  /** el('div', {class:'x', text:'..', 'aria-label':'..'}, child, child...) */
  S.el = function (tag, props) {
    var node = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style') node.style.cssText = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var ch = arguments[i];
      if (ch === null || ch === undefined || ch === false) continue;
      node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
    return node;
  };

  /** Satu simbol sandi. Elemen induk harus punya kelas c-<kunci>. */
  S.glyph = function (letter) {
    var inner = document.createElement('span');
    inner.textContent = letter;
    var g = document.createElement('span');
    g.className = 'glyph';
    g.setAttribute('aria-hidden', 'true');
    g.appendChild(inner);
    return g;
  };

  S.sep = function (text) {
    return S.el('span', { class: 'sep', 'aria-hidden': 'true', text: text });
  };

  S.api = function (method, url, body) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': S.csrf },
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  };

  /* localStorage / sessionStorage bisa melempar galat (mode privat, dll). */
  function store(kind) {
    return {
      get: function (key) { try { return JSON.parse(window[kind].getItem(key)); } catch (e) { return null; } },
      set: function (key, val) { try { window[kind].setItem(key, JSON.stringify(val)); } catch (e) { /* abaikan */ } },
      del: function (key) { try { window[kind].removeItem(key); } catch (e) { /* abaikan */ } }
    };
  }
  S.local = store('localStorage');
  S.session = store('sessionStorage');

  S.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

  S.fmtScore = function (v) {
    if (v === null || v === undefined) return '0';
    var r = Math.round(v * 10) / 10;
    return (r === Math.floor(r)) ? String(r) : r.toFixed(1);
  };

  S.fmtClock = function (sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + '.' + (s < 10 ? '0' : '') + s;
  };

  S.fmtDur = function (sec) {
    sec = Math.round(sec || 0);
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  };

  /* Urutkan tabel: <table class="tbl" data-sortable>, <th data-sort="num|text">,
     <td data-v="nilai"> (opsional). */
  function initSortable(table) {
    var heads = table.querySelectorAll('th[data-sort]');
    Array.prototype.forEach.call(heads, function (th) {
      th.tabIndex = 0;
      th.setAttribute('role', 'columnheader');
      function sort() {
        var idx = Array.prototype.indexOf.call(th.parentNode.children, th);
        var dir = th.getAttribute('aria-sort') === 'descending' ? 'ascending' : 'descending';
        if (th.dataset.sort === 'text' && !th.hasAttribute('aria-sort')) dir = 'ascending';
        Array.prototype.forEach.call(heads, function (h) { h.removeAttribute('aria-sort'); });
        th.setAttribute('aria-sort', dir);
        var body = table.tBodies[0];
        var rows = Array.prototype.slice.call(body.rows);
        var num = th.dataset.sort === 'num';
        function val(row) {
          var c = row.cells[idx];
          var v = c.dataset.v !== undefined ? c.dataset.v : c.textContent.trim();
          if (num) { v = parseFloat(v); return isNaN(v) ? -Infinity : v; }
          return String(v).toLowerCase();
        }
        rows.sort(function (a, b) {
          var x = val(a), y = val(b);
          var r = x < y ? -1 : x > y ? 1 : 0;
          return dir === 'ascending' ? r : -r;
        });
        rows.forEach(function (r) { body.appendChild(r); });
      }
      th.addEventListener('click', sort);
      th.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); }
      });
    });
  }
  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('table[data-sortable]'), initSortable);
  });

  /* Form dengan data-confirm="pesan" meminta konfirmasi sebelum dikirim. */
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute && e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });
})();
