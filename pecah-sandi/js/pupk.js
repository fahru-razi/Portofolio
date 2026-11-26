/* Halaman pengerjaan PUPK dan Kombinasi: satu soal per layar, dinilai server, bisa dilanjutkan. */
(function () {
  'use strict';
  var S = window.SANDI, el = S.el;
  var $ = function (sel) { return document.querySelector(sel); };

  var data = JSON.parse($('#run-data').textContent);
  var run = data.run, items = data.items;
  var card = $('#qcard'), nav = $('#qnav'), errBox = $('#run-error');
  var dlg = $('#confirm');
  var cur = 0, navButtons = [], refOpen = false, busy = false;

  /* ------------------------------------------------------------ bantuan */
  function open(i) { return !items[i].done; }
  // Soal pertama yang belum dijawab mulai dari `from`, berputar ke awal. -1 jika semua sudah dijawab.
  function nextOpen(from) {
    for (var k = 0; k < items.length; k++) {
      var i = (from + k) % items.length;
      if (open(i)) return i;
    }
    return -1;
  }
  function openCount() { return items.filter(function (it) { return !it.done; }).length; }
  function pct(v) { return Math.round(v * 100); }

  /* ------------------------------------------------------- kemajuan, nomor */
  function paintProgress() {
    $('#run-count').textContent = run.answered;
    $('#run-total').textContent = ' / ' + run.total + ' soal dijawab';
    $('#run-fill').style.transform = 'scaleX(' + (run.total ? run.answered / run.total : 0) + ')';
  }

  function buildNav() {
    nav.textContent = '';
    navButtons = items.map(function (it, i) {
      var b = el('button', { class: 'qn', type: 'button', text: String(i + 1) });
      b.addEventListener('click', function () { show(i); });
      nav.appendChild(b);
      return b;
    });
  }
  function paintNav() {
    navButtons.forEach(function (b, i) {
      var it = items[i];
      b.className = 'qn' + (it.done ? (it.is_correct ? ' is-ok' : ' is-bad') : '') + (i === cur ? ' is-cur' : '');
      b.setAttribute('aria-label', 'Soal ' + (i + 1) + ', ' + (it.done ? (it.is_correct ? 'benar' : 'belum tepat') : 'belum dijawab'));
      if (i === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    var c = navButtons[cur];
    if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ---------------------------------------------------------- soal sandi */
  function refTable(c) {
    var grid = el('div', { class: 'ref-grid c-' + c.key });
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (ch) {
      grid.appendChild(el('div', { class: 'ref-row' }, el('b', { text: ch }), S.glyph(ch)));
    });
    var d = el('details', { class: 'kref' }, el('summary', { text: 'Tabel sandi ' + c.name }), grid);
    d.open = refOpen;
    d.addEventListener('toggle', function () { refOpen = d.open; });
    return d;
  }

  // Satu simbol di soal: lebar alami font, dipangkas lewat variabel --q* di CSS dan dibungkus satu kotak.
  function qGlyph(ch) {
    return el('span', { class: 'glyph-run kq-g', 'aria-hidden': 'true' }, el('span', { text: ch }));
  }

  // Tiap kata satu kelompok baris (.kq-word), satu kotak (.kq-unit) per huruf. Kata yang tidak muat satu baris
  // menyambung ke baris di bawahnya; kata berbeda dipisah jarak. Tanpa tanda + atau / (itu hanya untuk mode Sandi).
  function cipherBlock(it) {
    var c = S.cipherByKey[it.cipher], words = it.cipher_text.split(' ').filter(Boolean);
    var cells = el('div', { class: 'kq-cells', role: 'img', 'aria-label': 'Soal dalam sandi ' + c.name });
    words.forEach(function (w) {
      var word = el('div', { class: 'kq-word' });
      w.split('').forEach(function (ch) { word.appendChild(el('span', { class: 'kq-unit' }, qGlyph(ch))); });
      cells.appendChild(word);
    });
    return el('div', { class: 'kq c-' + c.key },
      el('p', { class: 'kq-label', text: 'Sandi ' + c.name }), cells, refTable(c));
  }

  /* Kata terpanjang dijaga muat satu baris: ukuran simbol diperkecil secukupnya (paling kecil 70%).
     Semua jarak memakai em, jadi lebar kata ikut mengecil dengan skala yang sama. Jika masih tidak muat
     pada 70%, barulah kata itu dipecah antarhuruf. */
  var FIT_MIN = 0.7;
  function widestWord(cells) {
    var widest = 0;
    Array.prototype.forEach.call(cells.children, function (word) {
      var units = word.children, sum = 0;
      for (var i = 0; i < units.length; i++) sum += unitWidth(units[i]);
      if (sum > widest) widest = sum;
    });
    return widest;
  }
  function unitWidth(u) {                 // lebar efektif kotak, termasuk margin negatif (garis dipakai bersama)
    var m = getComputedStyle(u);
    return u.getBoundingClientRect().width + (parseFloat(m.marginLeft) || 0) + (parseFloat(m.marginRight) || 0);
  }
  // Kata yang harus menyambung ke baris bawah dibagi rata (misalnya 3+3, bukan 5+1) supaya tidak ada huruf yatim.
  function balanceWords(cells, avail) {
    Array.prototype.forEach.call(cells.children, function (word) {
      word.style.maxWidth = '';
      var units = word.children, widths = [], total = 0, i;
      for (i = 0; i < units.length; i++) { widths.push(unitWidth(units[i])); total += widths[i]; }
      if (total <= avail + 0.5) return;
      // Cari jumlah baris paling sedikit yang membuat semua pecahan muat (perkiraan awal bisa terlalu kecil
      // karena kotak tidak bisa dipotong), lalu bagi rata. Lebar baris = pecahan `per` kotak terlebar.
      var widest = 0, per = units.length;
      for (var rows = Math.ceil(total / avail); rows <= units.length; rows++) {
        per = Math.ceil(units.length / rows); widest = 0;
        for (i = 0; i < units.length; i += per) {
          var chunk = 0;
          for (var j = i; j < Math.min(i + per, units.length); j++) chunk += widths[j];
          if (chunk > widest) widest = chunk;
        }
        if (widest <= avail + 0.5) break;
      }
      word.style.maxWidth = Math.min(widest + 0.5, avail) + 'px';
    });
  }
  function fitCells(cells) {
    if (!cells || !cells.isConnected) return;
    cells.style.removeProperty('--qfit');
    Array.prototype.forEach.call(cells.children, function (w) { w.style.maxWidth = ''; });
    var cs = getComputedStyle(cells);
    var avail = cells.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) return;
    var scale = 1;
    // Browser membulatkan lebar glyph, jadi lebar tidak persis linear terhadap ukuran: ukur ulang dan koreksi.
    for (var pass = 0; pass < 4; pass++) {
      var widest = widestWord(cells);
      if (widest <= avail) break;
      scale *= avail / widest * 0.985;
      if (scale < FIT_MIN) { cells.style.removeProperty('--qfit'); break; }   // tak mungkin muat: jangan kecilkan sia-sia
      cells.style.setProperty('--qfit', String(scale));
    }
    balanceWords(cells, avail);
  }
  function fitCurrent() {
    var cells = card.querySelector('.kq-cells');
    if (!cells) return;
    fitCells(cells);
    // Font sandi dimuat malas: ukur ulang setelah font siap agar lebar simbol sudah benar.
    var fam = cells.parentNode.className.match(/c-(\w+)/);
    var c = fam && S.cipherByKey[fam[1]];
    if (c && document.fonts && document.fonts.load) {
      document.fonts.load('1em "' + c.family + '"').then(function () { fitCells(cells); }, function () {});
    }
  }
  var fitTimer = 0;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(fitTimer);
    fitTimer = requestAnimationFrame(fitCurrent);
  });

  /* ------------------------------------------------------- satu kartu soal */
  function feedback(it) {
    var p = pct(it.similarity);
    var label = it.is_correct ? (p === 100 ? 'Benar' : 'Benar, ejaan sedikit berbeda') : 'Belum tepat';
    var cls = it.is_correct ? (p === 100 ? 'ok' : 'warn') : 'bad';
    var key = it.key + (it.alts && it.alts.length ? ' (atau: ' + it.alts.join(', ') + ')' : '');
    return el('div', { class: 'fb-box', role: 'status' },
      el('span', { class: 'badge ' + cls, text: label }),
      el('dl', { class: 'fb' },
        el('div', null, el('dt', { text: 'Jawabanmu' }), el('dd', { text: it.answer })),
        el('div', null, el('dt', { text: 'Kunci' }), el('dd', { text: key })),
        el('div', null, el('dt', { text: 'Kemiripan' }),
          el('dd', { text: p + '%, ' + it.letters_correct + ' dari ' + it.letters_total + ' huruf' }))));
  }

  function render() {
    var it = items[cur];
    card.textContent = '';
    card.appendChild(el('div', { class: 'q-head' }, 'Soal ' + (cur + 1), el('small', { text: 'dari ' + items.length })));
    if (it.cipher) { card.appendChild(cipherBlock(it)); fitCurrent(); }
    if (it.cipher && it.done) card.appendChild(el('p', { class: 'qtext qtext-plain', text: it.question }));
    if (!it.cipher) card.appendChild(el('p', { class: 'qtext', text: it.question }));

    if (it.done) {
      card.appendChild(feedback(it));
      var n = nextOpen(cur + 1);
      var go = el('button', { class: 'btn btn-primary btn-lg', type: 'button', id: 'next-btn',
        text: n === -1 ? 'Selesai, lihat hasil' : 'Soal berikutnya' });
      go.addEventListener('click', function () { if (n === -1) finish(); else show(n); });
      card.appendChild(go);
      go.focus({ preventScroll: true });
    } else {
      card.appendChild(form());
    }
    paintNav();
  }

  function form() {
    var input = el('input', {
      class: 'text-in qans', id: 'ans', type: 'text', maxlength: '400', autocomplete: 'off',
      autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'send',
      placeholder: 'Tulis jawabanmu', 'aria-label': 'Jawaban soal ' + (cur + 1)
    });
    var skip = el('button', { class: 'btn btn-quiet', type: 'button', text: 'Lewati' });
    var send = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Jawab' });
    var f = el('form', { class: 'qform', novalidate: true }, input, el('div', { class: 'qform-actions' }, skip, send));

    skip.addEventListener('click', function () {
      var n = nextOpen(cur + 1);
      if (n === -1 || n === cur) say('Tidak ada soal lain yang belum dijawab.');
      else show(n);
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) { input.focus(); return; }
      answer(v, send);
    });
    if (window.innerWidth >= 900 || cur > 0 || run.answered > 0) setTimeout(function () { input.focus({ preventScroll: true }); }, 0);
    return f;
  }

  function show(i) {
    cur = i;
    say('');
    render();
    window.scrollTo({ top: 0 });
  }

  function say(text) { errBox.textContent = text; }

  /* ------------------------------------------------------------ ke server */
  function answer(text, btn) {
    if (busy) return;
    busy = true; btn.disabled = true; say('');
    S.api('POST', '/api/pupk/runs/' + run.id + '/answer', { idx: cur, answer: text }).then(function (r) {
      busy = false;
      if (r.ok) {
        items[cur] = r.data.item;
        run = r.data.run;
        paintProgress();
        render();
      } else if (r.status === 409) {
        window.location.reload();          // soal sudah dijawab atau pengerjaan sudah ditutup di tempat lain
      } else {
        btn.disabled = false;
        say(r.data.error || 'Jawaban belum terkirim. Coba lagi.');
      }
    }).catch(function () {
      busy = false; btn.disabled = false;
      say('Tidak bisa terhubung ke server. Jawabanmu belum terkirim, coba lagi.');
    });
  }

  function finish() {
    if (busy) return;
    busy = true;
    S.api('POST', '/api/pupk/runs/' + run.id + '/finish').then(function (r) {
      if (r.ok) { window.location.href = r.data.url; return; }
      busy = false; say(r.data.error || 'Belum bisa menyelesaikan. Coba lagi.');
    }).catch(function () { busy = false; say('Tidak bisa terhubung ke server. Coba lagi.'); });
  }

  /* --------------------------------------------------------- tombol Selesai */
  var yes = null;
  $('#finish-btn').addEventListener('click', function () {
    var left = openCount();
    if (!left) { finish(); return; }
    $('#confirm-body').textContent = 'Masih ada ' + left + ' soal yang belum dijawab. Soal itu dihitung salah.';
    yes = finish;
    if (dlg.showModal) dlg.showModal();
    else if (window.confirm($('#confirm-body').textContent)) finish();
  });
  $('#confirm-yes').addEventListener('click', function () { dlg.close(); if (yes) yes(); yes = null; });
  $('#confirm-no').addEventListener('click', function () { dlg.close(); yes = null; });

  /* ------------------------------------------------------------------ mulai */
  buildNav();
  paintProgress();
  var first = nextOpen(0);
  cur = first === -1 ? items.length - 1 : first;      // lanjutkan dari soal pertama yang belum dijawab
  render();
})();