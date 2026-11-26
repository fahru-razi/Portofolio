/* =============================================================================
   production.js — halaman Produksi (manajer)

   Alur:
     • Filter (tanggal, departemen, nama) -> GET /manager/production-summary
     • Modal "Verifikasi akun" (3 tab: Cocok / Hanya di Excel / Hanya di Absensi)
         - Cocok            -> POST /pico-accounts/verify-bulk | /<id>/verify
         - Hanya di Excel   -> POST /pico-mapping/link  (boleh >1 username/karyawan)
         - Hanya di Absensi -> POST /pico-accounts/<id>/verify  (manual, dengan konfirmasi)
     • Modal "Unggah data"      -> POST /production/upload  (multipart)

   Keamanan: semua teks dinamis diisi lewat textContent (tanpa innerHTML).
   Validasi di sini hanya kenyamanan; server tetap memvalidasi ulang semuanya.
   URL dan tanggal bawaan dibaca dari atribut data-* pada #pds-root.
   ============================================================================= */
(function () {
  'use strict';

  var root = document.getElementById('pds-root');
  if (!root) return;

  var D = root.dataset;
  var URLS = {
    summary: D.summaryUrl, mapping: D.mappingUrl, link: D.linkUrl,
    verify: D.verifyUrl, bulk: D.bulkUrl, employees: D.employeesUrl, upload: D.uploadUrl
  };
  var MAX_BYTES = 5 * 1024 * 1024;
  var BULK_CHUNK = 500;                       // batas server pada verify-bulk
  var csrf = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

  // ── Helper umum ────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function fmt(v) { return v === null || v === undefined ? '—' : String(v).replace('.', ','); }
  function norm(s) { return String(s || '').toLowerCase().trim(); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Notifikasi: pola .flash yang sama dengan halaman lain (leave.js, manager_leave.js).
  var FLASH_MS = 8000;
  var FLASH_MAX = 3;                          // notifikasi lama dibuang agar tidak menumpuk
  function say(msg, bad) {
    if (!msg) return;
    var wrap = document.querySelector('.flash-wrap');
    if (!wrap) {
      wrap = el('div', null, 'flash-wrap');
      var main = $('main-content') || document.body;
      main.insertBefore(wrap, main.firstChild);
    }
    wrap.classList.add('pds-flash');
    var flash = el('div', null, 'flash ' + (bad ? 'flash-danger' : 'flash-success'));
    flash.setAttribute('role', 'alert');
    flash.setAttribute('aria-live', 'polite');
    var close = el('button', '\u00d7', 'flash-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Tutup');
    close.addEventListener('click', function () { flash.remove(); });
    flash.appendChild(el('span', String(msg).slice(0, 500)));
    flash.appendChild(close);
    wrap.appendChild(flash);
    while (wrap.querySelectorAll('.flash').length > FLASH_MAX) wrap.removeChild(wrap.querySelector('.flash'));
    setTimeout(function () { if (flash.parentNode) flash.remove(); }, FLASH_MS);
  }

  function request(url, opts) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opts)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        return { ok: r.ok, status: r.status, data: j };
      });
    });
  }
  function getJSON(url) { return request(url, { headers: { 'Accept': 'application/json' } }); }
  function postJSON(url, body) {
    return request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRFToken': csrf },
      body: JSON.stringify(body || {})
    });
  }

  // ── Modal (satu per waktu) ─────────────────────────────────────────────────
  var active = null;      // { el, opener }
  var busy = false;       // true saat unggah berjalan: modal tidak bisa ditutup

  function openModal(id) {
    if (active) closeModal(true);
    var m = $(id);
    m.hidden = false;
    document.body.classList.add('pds-noscroll');
    active = { el: m, opener: document.activeElement };
    var f = m.querySelector('[data-autofocus]');
    if (f) f.focus();
  }
  function closeModal(force) {
    if (!active || (busy && !force)) return;
    active.el.hidden = true;
    document.body.classList.remove('pds-noscroll');
    hideCombo();
    var o = active.opener;
    active = null;
    if (o && typeof o.focus === 'function') { try { o.focus(); } catch (e) { /* elemen sudah hilang */ } }
  }

  ['pds-modal-verify', 'pds-modal-upload'].forEach(function (id) {
    var overlay = $(id);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) closeModal(); });
    Array.prototype.forEach.call(overlay.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', function () { closeModal(); });
    });
  });

  document.addEventListener('keydown', function (e) {
    if (!active) return;
    if (e.key === 'Escape') {
      if (combo.open) { hideCombo(); e.preventDefault(); return; }
      closeModal();
      return;
    }
    if (e.key === 'Tab') {                    // fokus tetap di dalam modal
      var items = Array.prototype.filter.call(
        active.el.querySelectorAll('button, input, select, a[href]'),
        function (n) { return !n.disabled && !n.closest('[hidden]'); });
      if (!items.length) return;
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  // ── Filter ─────────────────────────────────────────────────────────────────
  function readFilters() {
    return { from: $('pds-from').value, to: $('pds-to').value,
             dept: $('pds-dept').value, q: $('pds-q').value.trim() };
  }
  function validateFilters(f) {
    if (!f.from || !f.to) return "Isi tanggal 'Dari' dan 'Sampai'.";
    if (f.from > f.to) return "Tanggal 'Dari' tidak boleh setelah 'Sampai'.";
    return '';
  }
  function qs(f, extra) {
    var p = new URLSearchParams();
    p.set('date_from', f.from); p.set('date_to', f.to);
    if (f.dept) p.set('department_id', f.dept);
    if (f.q) p.set('q', f.q);
    if (extra) Object.keys(extra).forEach(function (k) { p.set(k, extra[k]); });
    return p.toString();
  }

  function presetRange(name) {
    var t = new Date();
    var y = t.getFullYear(), m = t.getMonth();
    if (name === 'month') return [new Date(y, m, 1), t];
    if (name === 'prev') return [new Date(y, m - 1, 1), new Date(y, m, 0)];
    var days = parseInt(name, 10);
    return [new Date(y, m, t.getDate() - (days - 1)), t];
  }
  function syncPresetState() {
    var f = readFilters();
    Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
      var r = presetRange(b.dataset.preset);
      b.classList.toggle('is-active', isoDate(r[0]) === f.from && isoDate(r[1]) === f.to);
    });
  }
  function updateExportLinks(f, valid) {
    [['pds-xlsx', 'xlsx'], ['pds-csv', 'csv']].forEach(function (p) {
      var a = $(p[0]);
      a.setAttribute('aria-disabled', valid ? 'false' : 'true');
      a.href = valid ? URLS.summary + '?' + qs(f, { format: p[1] }) : '#';
    });
  }

  // ── Tabel ringkasan ────────────────────────────────────────────────────────
  var seq = 0;

  function setState(text, retry) {
    var s = $('pds-state');
    clear(s);
    s.hidden = !text;
    if (!text) return;
    s.appendChild(document.createTextNode(text));
    if (retry) {
      var b = el('button', 'Coba lagi', 'btn btn-secondary btn-sm');
      b.type = 'button';
      b.addEventListener('click', loadSummary);
      s.appendChild(b);
    }
  }

  function loadSummary() {
    var f = readFilters();
    var err = validateFilters(f);
    $('pds-range-err').textContent = err;
    syncPresetState();
    updateExportLinks(f, !err);
    if (err) return;
    var mine = ++seq;
    setState('Memuat data…');
    getJSON(URLS.summary + '?' + qs(f)).then(function (res) {
      if (mine !== seq) return;               // respons basi (filter sudah berubah lagi)
      if (!res.ok) { setState(res.data.message || 'Gagal memuat data.', true); return; }
      renderSummary(res.data);
    }).catch(function () {
      if (mine === seq) setState('Koneksi bermasalah.', true);
    });
  }

  function renderSummary(d) {
    var body = $('pds-body');
    clear(body);
    setState(d.rows.length ? '' : 'Tidak ada data untuk filter ini.');
    d.rows.forEach(function (r) {
      var tr = el('tr');
      if (r.extra_shifts > 0) tr.className = 'pds-flag';

      var who = el('td');
      var person = el('div', null, 'pds-person');
      person.appendChild(el('span', r.full_name, 'pds-person-name'));
      var sub = [r.department, r.employee_code].filter(Boolean).join(' · ');
      var meta = el('div', null, 'pds-person-meta');
      if (sub) meta.appendChild(el('span', sub, 'pds-person-sub'));
      if (r.active === false) meta.appendChild(el('span', 'Nonaktif', 'pds-tag is-off'));
      if (r.unverified_count > 0) {
        var pendText = r.unverified_count + ' belum verifikasi';
        var pend = el('button', pendText, 'pds-tag');
        pend.type = 'button';
        pend.title = 'Buka verifikasi untuk ' + r.full_name;
        pend.setAttribute('aria-label', pendText + ', buka verifikasi untuk ' + r.full_name);
        pend.addEventListener('click', function () { openVerify(r.full_name); });
        meta.appendChild(pend);
      }
      if (r.extra_shifts > 0) meta.appendChild(el('span', '+' + r.extra_shifts + ' shift', 'pds-tag'));
      if (meta.firstChild) person.appendChild(meta);
      who.appendChild(person);
      tr.appendChild(who);

      var names = el('td');
      var chips = el('div', null, 'pds-chips');
      r.accounts.forEach(function (a) {
        var c = el('span', a.username, 'pds-chip' + (a.verified ? '' : ' is-pending'));
        if (!a.verified) c.title = 'Belum diverifikasi';
        chips.appendChild(c);
      });
      names.appendChild(chips);
      tr.appendChild(names);

      [fmt(r.total_hours), r.sheet_days, r.att_days, r.att_shifts,
       fmt(r.avg_sheet), fmt(r.avg_att_days), fmt(r.avg_att_shifts)]
        .forEach(function (v) { tr.appendChild(el('td', v)); });
      body.appendChild(tr);
    });
    $('pds-meta').textContent = d.rows.length + ' karyawan · data terakhir: ' + (d.last_work_date || '—') +
      ' · terakhir diunggah: ' + (d.last_synced_at || '—');
  }

  // ── Pemetaan: username Absensi dibandingkan dengan username di data Excel ──
  //   matched         : ada di Absensi (terhubung ke karyawan) DAN di Excel -> direkomendasikan
  //   excel_only      : ada di Excel, belum terhubung ke karyawan          -> manajer menautkan
  //   attendance_only : ada di Absensi, tidak ada di Excel                 -> manajer menilai
  var mapping = { matched: [], excel_only: [], attendance_only: [] };
  var TABS = ['matched', 'excel', 'att'];
  var tab = 'matched';
  var sel = {};          // account_id -> true (hanya tab "Cocok")

  var DESC = {
    matched: 'Username akun di Absensi sama dengan username di Excel, jadi sistem merekomendasikan keduanya sebagai orang yang sama. Periksa lalu verifikasi.',
    excel: 'Username ini ada di Excel tetapi belum terhubung ke karyawan mana pun di Absensi. Sistem tidak menebak: pilih karyawannya, lalu tautkan. Bila karyawan itu punya akun di Absensi yang belum ada di Excel, pilih Ganti (akun yang sama, ejaan berbeda) atau Tambah (akun kedua).',
    att: 'Akun ini terhubung ke karyawan di Absensi, tetapi username-nya tidak ada di Excel (belum ada data, atau karyawan memakai username lain). Bila itu akun yang sama dengan username di tab "Hanya di Excel", tautkan di sana dan pilih Ganti; akun ini otomatis hilang dari daftar ini. Bila memang benar, verifikasi manual.'
  };

  function loadMapping() {
    return getJSON(URLS.mapping).then(function (res) {
      if (!res.ok) return;
      mapping = {
        matched: res.data.matched || [],
        excel_only: res.data.excel_only || [],
        attendance_only: res.data.attendance_only || []
      };
      updateCounts();
    }).catch(function () { /* badge tetap kosong; modal menampilkan data terakhir */ });
  }
  function updateCounts() {
    var m = mapping.matched.length, e = mapping.excel_only.length, a = mapping.attendance_only.length;
    var total = m + e + a;
    var badge = $('pds-verify-count');
    badge.textContent = total;
    badge.hidden = total === 0;
    var btn = $('pds-btn-verify');
    if (total) btn.setAttribute('aria-label', 'Verifikasi akun, ' + total + ' perlu dicek');
    else btn.removeAttribute('aria-label');
    $('pds-n-matched').textContent = m;
    $('pds-n-excel').textContent = e;
    $('pds-n-att').textContent = a;
  }

  function modalErr(msg) { $('pds-v-err').textContent = msg || ''; if (msg) $('pds-v-ok').textContent = ''; }
  function modalOk(msg) { $('pds-v-ok').textContent = msg || ''; if (msg) $('pds-v-err').textContent = ''; }

  function has(q, parts) { return !q || norm(parts.join(' ')).indexOf(q) >= 0; }
  function visible(name) {
    var q = norm($('pds-v-q').value);
    if (name === 'matched') {
      return mapping.matched.filter(function (a) {
        return has(q, [a.full_name, a.pico_username, a.excel_username, a.department]);
      });
    }
    if (name === 'excel') {
      return mapping.excel_only.filter(function (u) { return has(q, [u.pico_username]); });
    }
    return mapping.attendance_only.filter(function (a) {
      return has(q, [a.full_name, a.pico_username, a.department]);
    });
  }
  function selCount() { return Object.keys(sel).length; }

  function personCell(name, dept) {
    var td = el('td', null, 'pds-left');
    var p = el('div', null, 'pds-person');
    p.appendChild(el('span', name, 'pds-person-name'));
    if (dept) p.appendChild(el('span', dept, 'pds-person-sub'));
    td.appendChild(p);
    return td;
  }
  function showEmpty(id, text) {
    var e = $(id);
    e.hidden = !text;
    e.textContent = text || '';
  }

  // ── Tab ─────────────────────────────────────────────────────────────────────
  function setTab(name, focusTab) {
    tab = name;
    TABS.forEach(function (t) {
      var on = t === name;
      var b = $('pds-tab-' + t);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      $('pds-panel-' + t).hidden = !on;
    });
    if (focusTab) $('pds-tab-' + name).focus();
    hideCombo();
    modalErr('');
    modalOk('');
    renderTab();
  }
  function renderTab() {
    $('pds-v-desc').textContent = DESC[tab];
    if (tab === 'matched') renderMatched();
    else if (tab === 'excel') renderExcel();
    else renderAtt();
    syncFooter();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.pds-tab'), function (b) {
    b.addEventListener('click', function () { setTab(b.dataset.tab, false); });
    b.addEventListener('keydown', function (e) {
      var i = TABS.indexOf(b.dataset.tab), n = TABS.length, to = -1;
      if (e.key === 'ArrowRight') to = (i + 1) % n;
      else if (e.key === 'ArrowLeft') to = (i - 1 + n) % n;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = n - 1;
      if (to < 0) return;
      e.preventDefault();
      setTab(TABS[to], true);
    });
  });

  function openVerify(prefill) {
    $('pds-v-q').value = prefill || '';
    sel = {};
    ensureEmployees();
    openModal('pds-modal-verify');
    var first = TABS.filter(function (t) { return visible(t).length > 0; })[0] || 'matched';
    setTab(first, false);
  }

  // ── Tab 1: Cocok ────────────────────────────────────────────────────────────
  function renderMatched() {
    var rows = visible('matched');
    var body = $('pds-m-body');
    clear(body);
    showEmpty('pds-m-empty', rows.length ? '' : (mapping.matched.length
      ? 'Tidak ada akun yang cocok dengan pencarian.'
      : 'Tidak ada akun yang cocok di Absensi dan Excel yang menunggu verifikasi.'));
    rows.forEach(function (a) {
      var tr = el('tr');

      var c0 = el('td', null, 'pds-check');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!sel[a.account_id];
      cb.setAttribute('aria-label', 'Pilih ' + a.pico_username);
      cb.addEventListener('change', function () {
        if (cb.checked) sel[a.account_id] = true; else delete sel[a.account_id];
        syncFooter();
      });
      c0.appendChild(cb);
      tr.appendChild(c0);

      tr.appendChild(personCell(a.full_name, a.department));
      tr.appendChild(el('td', a.pico_username, 'pds-left'));
      tr.appendChild(el('td', a.excel_username, 'pds-left'));
      tr.appendChild(el('td', fmt(a.total_hours)));
      tr.appendChild(el('td', a.last_date || '—', 'pds-left'));

      var act = el('td');
      var btn = el('button', 'Verifikasi', 'btn btn-secondary');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Verifikasi ' + a.pico_username);
      btn.addEventListener('click', function () { verifyOne(a, btn, false); });
      act.appendChild(btn);
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  function syncFooter() {
    var rows = visible(tab);
    var submit = $('pds-v-submit');
    submit.hidden = tab !== 'matched';
    if (tab === 'matched') {
      var n = selCount();
      var chosen = rows.filter(function (a) { return sel[a.account_id]; }).length;
      var all = $('pds-v-all');
      all.checked = rows.length > 0 && chosen === rows.length;
      all.indeterminate = chosen > 0 && chosen < rows.length;
      $('pds-v-count').textContent = n ? n + ' akun dipilih' : rows.length + ' akun ditampilkan';
      submit.disabled = n === 0;
      submit.textContent = n ? 'Verifikasi terpilih (' + n + ')' : 'Verifikasi terpilih';
    } else if (tab === 'excel') {
      $('pds-v-count').textContent = rows.length + ' username ditampilkan · satu karyawan boleh punya lebih dari satu username';
    } else {
      $('pds-v-count').textContent = rows.length + ' akun ditampilkan';
    }
  }

  function dropAccount(id) {
    mapping.matched = mapping.matched.filter(function (x) { return x.account_id !== id; });
    mapping.attendance_only = mapping.attendance_only.filter(function (x) { return x.account_id !== id; });
    delete sel[id];
    updateCounts();
  }

  function verifyOne(a, btn, manual) {
    if (manual && !window.confirm('Username "' + a.pico_username + '" tidak ada di data Excel, jadi tidak ada yang bisa dicocokkan. Tetap verifikasi manual untuk ' + a.full_name + '?')) return;
    modalErr('');
    btn.disabled = true;
    postJSON(URLS.verify.replace('__ID__', encodeURIComponent(a.account_id)))
      .then(function (res) {
        if (!res.ok) {
          modalErr(res.data.message || 'Gagal memverifikasi akun ' + a.pico_username + '.');
          btn.disabled = false;
          return;
        }
        dropAccount(a.account_id);
        renderTab();
        say('Akun ' + a.pico_username + ' diverifikasi.');
        loadSummary();
      }).catch(function () {
        modalErr('Koneksi bermasalah. Coba lagi.');
        btn.disabled = false;
      });
  }

  function verifySelected() {
    var ids = Object.keys(sel);
    if (!ids.length) return;
    $('pds-v-submit').disabled = true;
    modalErr('');
    var done = 0, skipped = 0;
    var chunks = [];
    for (var i = 0; i < ids.length; i += BULK_CHUNK) chunks.push(ids.slice(i, i + BULK_CHUNK));

    chunks.reduce(function (chain, chunk) {
      return chain.then(function () {
        return postJSON(URLS.bulk, { ids: chunk }).then(function (res) {
          if (!res.ok) throw new Error(res.data.message || 'Gagal memverifikasi akun terpilih.');
          done += res.data.verified || 0;
          skipped += res.data.skipped || 0;
        });
      });
    }, Promise.resolve()).then(function () {
      sel = {};
      say(done + ' akun diverifikasi.' + (skipped ? ' ' + skipped + ' dilewati karena username tidak ada di Excel.' : ''));
      return loadMapping();
    }).then(function () {
      renderTab();
      loadSummary();
    }).catch(function (e) {
      modalErr(e && e.message ? e.message : 'Koneksi bermasalah. Coba lagi.');
      return loadMapping().then(renderTab);
    });
  }

  $('pds-v-q').addEventListener('input', renderTab);
  $('pds-v-submit').addEventListener('click', verifySelected);
  $('pds-v-all').addEventListener('change', function () {
    var on = this.checked;
    visible('matched').forEach(function (a) { if (on) sel[a.account_id] = true; else delete sel[a.account_id]; });
    renderMatched();
    syncFooter();
  });
  $('pds-btn-verify').addEventListener('click', function () { openVerify(''); });

  // ── Tab 3: Hanya di Absensi (verifikasi manual oleh manajer) ───────────────
  function renderAtt() {
    var rows = visible('att');
    var body = $('pds-a-body');
    clear(body);
    showEmpty('pds-a-empty', rows.length ? '' : (mapping.attendance_only.length
      ? 'Tidak ada akun yang cocok dengan pencarian.'
      : 'Tidak ada akun Absensi tanpa data Excel yang menunggu verifikasi.'));
    rows.forEach(function (a) {
      var tr = el('tr');
      tr.appendChild(personCell(a.full_name, a.department));
      tr.appendChild(el('td', a.pico_username, 'pds-left'));
      var act = el('td');
      var btn = el('button', 'Verifikasi manual', 'btn btn-secondary');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Verifikasi manual ' + a.pico_username);
      btn.addEventListener('click', function () { verifyOne(a, btn, true); });
      act.appendChild(btn);
      tr.appendChild(act);
      body.appendChild(tr);
    });
  }

  // ── Tab 2: Hanya di Excel (tautkan ke karyawan) + combobox karyawan ────────
  var employees = null;          // null = belum dimuat
  var employeesLoading = false;
  var combo = { open: false, input: null, items: [], idx: -1, pick: null };
  var comboEl = $('pds-combo');

  function ensureEmployees() {
    if (employees || employeesLoading) return;
    employeesLoading = true;
    getJSON(URLS.employees).then(function (res) {
      employeesLoading = false;
      if (!res.ok) { modalErr('Daftar karyawan gagal dimuat. Tutup lalu buka lagi jendela ini.'); return; }
      employees = res.data.employees || [];
      if (combo.open) showCombo(combo.input, combo.pick);
    }).catch(function () {
      employeesLoading = false;
      modalErr('Daftar karyawan gagal dimuat. Periksa koneksi.');
    });
  }

  function renderExcel() {
    var rows = visible('excel');
    var body = $('pds-l-body');
    clear(body);
    showEmpty('pds-l-empty', rows.length ? '' : (mapping.excel_only.length
      ? 'Tidak ada username yang cocok dengan pencarian.'
      : 'Semua username di Excel sudah terhubung ke karyawan.'));
    rows.forEach(function (u) {
      var tr = el('tr');
      tr.appendChild(el('td', u.pico_username, 'pds-left pds-person-name'));
      tr.appendChild(el('td', fmt(u.total_hours)));
      tr.appendChild(el('td', u.last_date || '—', 'pds-left'));

      var cell = el('td', null, 'pds-left pds-combo-cell');
      var input = el('input', null, 'pds-combo-input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.placeholder = 'Ketik nama karyawan…';
      input.setAttribute('aria-label', 'Karyawan untuk ' + u.pico_username);
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-autocomplete', 'list');
      input.setAttribute('aria-expanded', 'false');
      input.dataset.uid = '';
      cell.appendChild(input);

      // Bila karyawan punya akun Absensi yang belum ada di Excel, manajer memilih: Ganti atau Tambah.
      var mode = el('select', null, 'pds-link-mode');
      mode.setAttribute('aria-label', 'Tindakan untuk ' + u.pico_username);
      mode.hidden = true;
      cell.appendChild(mode);
      tr.appendChild(cell);

      var act = el('td');
      var btn = el('button', 'Tautkan', 'btn btn-secondary');
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Tautkan ' + u.pico_username);
      btn.disabled = true;
      act.appendChild(btn);
      tr.appendChild(act);

      function fillMode(uid) {
        clear(mode);
        var pend = mapping.attendance_only.filter(function (a) { return a.user_id === uid; });
        mode.hidden = !pend.length;
        if (!pend.length) return;
        var opts = [['', 'Pilih tindakan…'], ['add', 'Tambah sebagai akun baru']];
        pend.forEach(function (a) { opts.push(['replace:' + a.account_id, 'Ganti akun \u201c' + a.pico_username + '\u201d']); });
        opts.forEach(function (o) { var op = el('option', o[1]); op.value = o[0]; mode.appendChild(op); });
        mode.value = '';
      }
      function ready() { return !!input.dataset.uid && (mode.hidden || !!mode.value); }
      function pick(emp) {
        input.value = emp.full_name + (emp.department && emp.department !== '—' ? ' · ' + emp.department : '');
        input.dataset.uid = emp.id;
        fillMode(emp.id);
        btn.disabled = !ready();
        hideCombo();
      }
      mode.addEventListener('change', function () { btn.disabled = !ready(); });
      input.addEventListener('input', function () {
        input.dataset.uid = '';
        fillMode('');
        btn.disabled = true;
        showCombo(input, pick);
      });
      input.addEventListener('focus', function () { showCombo(input, pick); });
      input.addEventListener('blur', function () { setTimeout(function () { if (combo.input === input) hideCombo(); }, 150); });
      input.addEventListener('keydown', function (e) { comboKey(e, pick); });

      btn.addEventListener('click', function () {
        var uid = input.dataset.uid;
        if (!uid) { modalErr('Pilih karyawan dari daftar yang muncul.'); return; }
        modalErr('');
        btn.disabled = true;
        var body = { pico_username: u.pico_username, user_id: uid };
        if (mode.value.indexOf('replace:') === 0) body.replace_account_id = mode.value.slice(8);
        postJSON(URLS.link, body).then(function (res) {
          if (!res.ok) {
            modalErr(res.data.message || 'Gagal menautkan ' + u.pico_username + '.');
            btn.disabled = false;
            return;
          }
          mapping.excel_only = mapping.excel_only.filter(function (x) { return x.pico_username !== u.pico_username; });
          if (body.replace_account_id) {            // akun pending yang diganti otomatis hilang dari "Hanya di Absensi"
            mapping.attendance_only = mapping.attendance_only.filter(function (a) { return a.account_id !== body.replace_account_id; });
          }
          tr.parentNode.removeChild(tr);              // baris lain tetap utuh (pilihan karyawannya tidak hilang)
          updateCounts();
          if (!$('pds-l-body').firstChild) renderExcel();
          syncFooter();
          modalOk(res.data.message || 'Username ditautkan.');
          loadSummary();
        }).catch(function () {
          modalErr('Koneksi bermasalah. Coba lagi.');
          btn.disabled = false;
        });
      });
      body.appendChild(tr);
    });
  }

  function attOnlyUserIds() {
    var o = {};
    mapping.attendance_only.forEach(function (a) { o[a.user_id] = true; });
    return o;
  }

  function showCombo(input, pick) {
    combo.input = input; combo.pick = pick; combo.open = true;
    input.setAttribute('aria-expanded', 'true');
    clear(comboEl);
    combo.items = [];
    combo.idx = -1;
    if (employees === null) {
      comboEl.appendChild(el('li', 'Memuat daftar karyawan…', 'is-empty'));
    } else {
      var q = norm(input.value);
      var hint = attOnlyUserIds();      // karyawan yang akun Absensinya belum ada di Excel: ditaruh di atas
      var list = employees.filter(function (e) {
        return !q || norm(e.full_name + ' ' + e.employee_code + ' ' + e.department).indexOf(q) >= 0;
      }).sort(function (x, y) {
        return ((hint[y.id] ? 2 : 0) + (y.active === false ? 0 : 1)) - ((hint[x.id] ? 2 : 0) + (x.active === false ? 0 : 1));
      }).slice(0, 8);                   // urutan: akun Absensi belum ada di Excel, lalu aktif, lalu nonaktif
      if (!list.length) comboEl.appendChild(el('li', 'Karyawan tidak ditemukan', 'is-empty'));
      list.forEach(function (emp, i) {
        var li = el('li');
        li.setAttribute('role', 'option');
        var top = el('span', null, 'pds-combo-name');
        top.appendChild(el('span', emp.full_name));
        if (emp.active === false) top.appendChild(el('span', 'Nonaktif', 'pds-tag is-off'));
        li.appendChild(top);
        var sub = [emp.department && emp.department !== '—' ? emp.department : '', emp.employee_code,
                   hint[emp.id] ? 'akun Absensi belum ada di Excel' : ''].filter(Boolean).join(' · ');
        if (sub) li.appendChild(el('small', sub));
        li.addEventListener('mousedown', function (ev) { ev.preventDefault(); pick(emp); });
        li.addEventListener('mousemove', function () { setComboIdx(i); });
        comboEl.appendChild(li);
        combo.items.push({ li: li, emp: emp });
      });
    }
    var r = input.getBoundingClientRect();
    comboEl.style.left = r.left + 'px';
    comboEl.style.width = r.width + 'px';
    comboEl.hidden = false;
    var h = comboEl.offsetHeight;
    var below = window.innerHeight - r.bottom;
    comboEl.style.top = (below < h + 8 && r.top > h + 8 ? r.top - h - 2 : r.bottom + 2) + 'px';
  }
  function hideCombo() {
    if (combo.input) combo.input.setAttribute('aria-expanded', 'false');
    combo.open = false; combo.idx = -1; combo.items = [];
    comboEl.hidden = true;
  }
  function setComboIdx(i) {
    combo.idx = i;
    combo.items.forEach(function (it, n) { it.li.classList.toggle('is-active', n === i); });
  }
  function comboKey(e, pick) {
    if (!combo.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { showCombo(e.target, pick); }
    if (!combo.items.length) return;
    if (e.key === 'ArrowDown') { setComboIdx((combo.idx + 1) % combo.items.length); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setComboIdx((combo.idx - 1 + combo.items.length) % combo.items.length); e.preventDefault(); }
    else if (e.key === 'Enter' && combo.idx >= 0) { pick(combo.items[combo.idx].emp); e.preventDefault(); }
  }
  window.addEventListener('resize', hideCombo);
  $('pds-modal-verify').querySelector('.pds-modal-body').addEventListener('scroll', hideCombo);

  // ── Modal: Unggah data ─────────────────────────────────────────────────────
  function upReset() {
    $('pds-up-file').value = '';
    $('pds-up-err').textContent = '';
    upDetail([]);
    $('pds-up-submit').disabled = true;
  }
  function upDetail(rows) {
    var body = $('pds-up-detail-body');
    clear(body);
    (rows || []).forEach(function (e) {
      var tr = el('tr');
      tr.appendChild(el('td', e.row, 'pds-left'));
      tr.appendChild(el('td', e.column, 'pds-left'));
      tr.appendChild(el('td', e.reason, 'pds-left'));
      body.appendChild(tr);
    });
    $('pds-up-detail').hidden = !(rows && rows.length);
  }

  $('pds-up-open').addEventListener('click', function () { upReset(); openModal('pds-modal-upload'); });

  $('pds-up-file').addEventListener('change', function () {
    var f = this.files && this.files[0];
    $('pds-up-err').textContent = '';
    upDetail([]);
    $('pds-up-submit').disabled = true;
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { $('pds-up-err').textContent = 'Hanya berkas .xlsx yang diterima.'; return; }
    if (f.size === 0) { $('pds-up-err').textContent = 'Berkas kosong.'; return; }
    if (f.size > MAX_BYTES) { $('pds-up-err').textContent = 'Ukuran berkas melebihi 5 MB.'; return; }
    $('pds-up-submit').disabled = false;
  });

  $('pds-up-submit').addEventListener('click', function () {
    var f = $('pds-up-file').files && $('pds-up-file').files[0];
    if (!f || busy) return;
    if (!window.confirm('Data produksi pada tanggal yang ada di berkas ini akan diganti. Data pada tanggal lain tetap dipakai. Lanjutkan?')) return;
    var btn = this;
    var fd = new FormData();
    fd.append('file', f);
    busy = true;
    btn.disabled = true;
    btn.textContent = 'Mengunggah…';
    $('pds-up-err').textContent = '';
    upDetail([]);

    request(URLS.upload, {
      method: 'POST', body: fd,
      headers: { 'X-CSRFToken': csrf, 'Accept': 'application/json' }
    }).then(function (res) {
      if (res.ok) {
        busy = false;
        closeModal(true);
        var d = res.data;
        say('Berhasil: ' + d.rows + ' baris dari ' + d.producers + ' producer (' + d.dates + ' tanggal, ' +
            d.date_from + ' s/d ' + d.date_to + '). ' + d.replaced_rows + ' baris lama pada tanggal itu diganti; ' +
            d.kept_rows + ' baris pada tanggal lain tetap dipakai.');
        loadSummary();
        loadMapping();
      } else {
        var msg = res.data.message ||
          (res.status === 413 ? 'Ukuran berkas melebihi 5 MB.' : 'Gagal mengunggah berkas.');
        $('pds-up-err').textContent = msg;
        upDetail(res.data.errors);
      }
    }).catch(function () {
      $('pds-up-err').textContent = 'Koneksi bermasalah. Coba lagi.';
    }).then(function () {
      busy = false;
      btn.textContent = 'Unggah Data';
      btn.disabled = !($('pds-up-file').files && $('pds-up-file').files[0]);
    });
  });

  // ── Menu Ekspor (tombol -> pilihan Excel / CSV) ────────────────────────────
  var expWrap = $('pds-export'), expBtn = $('pds-export-btn'), expList = $('pds-export-list');
  function setExport(open) {
    expList.hidden = !open;
    expBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  expBtn.addEventListener('click', function () { setExport(expList.hidden); });
  expList.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (a && a.getAttribute('aria-disabled') !== 'true') setTimeout(function () { setExport(false); }, 0);
  });
  document.addEventListener('click', function (e) {
    if (!expList.hidden && !expWrap.contains(e.target)) setExport(false);
  });
  expWrap.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !expList.hidden) { setExport(false); expBtn.focus(); e.stopPropagation(); }
  });
  expWrap.addEventListener('focusout', function (e) {
    if (e.relatedTarget && !expWrap.contains(e.relatedTarget)) setExport(false);
  });

  // ── Tooltip kolom: tampil saat kursor diarahkan atau elemen difokus (keyboard/sentuh) ──
  var tipEl = document.createElement('div');
  tipEl.id = 'pds-tip';
  tipEl.className = 'pds-tip';
  tipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(tipEl);
  var tipTarget = null, tipTimer = null;

  function placeTip(t) {
    var r = t.getBoundingClientRect();
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight, gap = 10, pad = 8;
    var left = Math.min(Math.max(pad, r.left + r.width / 2 - 24), window.innerWidth - w - pad);
    var below = r.bottom + gap + h <= window.innerHeight - pad;
    var top = below ? r.bottom + gap : Math.max(pad, r.top - gap - h);
    tipEl.setAttribute('data-side', below ? 'bottom' : 'top');
    tipEl.style.setProperty('--pds-tip-arrow', Math.min(Math.max(14, r.left + r.width / 2 - left), w - 14) + 'px');
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function showTip(t) {
    clearTimeout(tipTimer);
    if (tipTarget && tipTarget !== t) tipTarget.removeAttribute('aria-describedby');
    tipTarget = t;
    tipEl.textContent = t.getAttribute('data-tip');
    t.setAttribute('aria-describedby', 'pds-tip');
    placeTip(t);
    tipEl.classList.add('is-on');
  }
  function hideTip() {
    clearTimeout(tipTimer);
    tipEl.classList.remove('is-on');
    if (tipTarget) tipTarget.removeAttribute('aria-describedby');
    tipTarget = null;
  }
  function tipOf(node) { return node && node.closest ? node.closest('[data-tip]') : null; }

  document.addEventListener('mouseover', function (e) {
    var t = tipOf(e.target);
    if (!t || t === tipTarget) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { showTip(t); }, tipTarget ? 0 : 140);   // jeda singkat anti-kedip
  });
  document.addEventListener('mouseout', function (e) {
    var t = tipOf(e.target);
    if (!t || t.contains(e.relatedTarget)) return;
    hideTip();
  });
  document.addEventListener('focusin', function (e) { var t = tipOf(e.target); if (t) showTip(t); });
  document.addEventListener('focusout', function (e) { if (tipOf(e.target)) hideTip(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && tipEl.classList.contains('is-on')) { hideTip(); e.stopPropagation(); }
  }, true);
  window.addEventListener('scroll', hideTip, true);
  window.addEventListener('resize', hideTip);

  // ── Pasang filter & mulai ──────────────────────────────────────────────────
  var qTimer = null;
  $('pds-from').addEventListener('change', loadSummary);
  $('pds-to').addEventListener('change', loadSummary);
  $('pds-dept').addEventListener('change', loadSummary);
  $('pds-q').addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(loadSummary, 300);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-preset]'), function (b) {
    b.addEventListener('click', function () {
      var r = presetRange(b.dataset.preset);
      $('pds-from').value = isoDate(r[0]);
      $('pds-to').value = isoDate(r[1]);
      loadSummary();
    });
  });
  ['pds-xlsx', 'pds-csv'].forEach(function (id) {
    $(id).addEventListener('click', function (e) {
      if (this.getAttribute('aria-disabled') === 'true') e.preventDefault();
    });
  });

  loadSummary();
  loadMapping().then(function () {
    if (/[?&]verifikasi=1(&|$)/.test(window.location.search)) {
      openVerify('');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);   // refresh tidak membuka ulang
      }
    }
  });
})();