/* Halaman Latihan: pengaturan, lembar jawaban, timer, kirim, hasil. */
(function () {
  'use strict';
  var S = window.SANDI, el = S.el, cfg = S.config;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var setupSec = $('#setup'), gameSec = $('#game'), resultSec = $('#result');
  var form = $('#setup-form'), errBox = $('#setup-error'), startBtn = $('#start-btn');
  var dlg = $('#confirm');

  var HINT_MODE = {
    random: 'Deretan huruf acak. Cocok untuk melatih hafalan simbol.',
    database: 'Kata dari bank soal yang dikelola admin. Bisa berupa satu kata atau dua kata.',
    pupk: 'Jawaban dari soal PUPK (pengetahuan umum dan kepramukaan). Terjemahkan sandinya, lalu kamu juga bisa menghafal jawabannya.'
  };
  var HINT_SCORING = {
    huruf: 'Setiap huruf yang benar dihitung. Nilai = huruf benar dibagi semua huruf.',
    kata: 'Satu kata benar hanya jika semua hurufnya benar. Nilai = kata benar dibagi semua kata.',
    utuh: 'Satu soal benar hanya jika semua huruf di soal itu benar. Nilai = soal benar dibagi semua soal.'
  };

  /* ---------------------------------------------------------------- setup */
  var PREF_KEY = 'sandi.prefs.v1';
  var prefs = S.local.get(PREF_KEY) || {};
  prefs.nq = prefs.nq || {};

  function val(name) { return form.elements[name].value; }
  function radio(name) { return (form.querySelector('input[name="' + name + '"]:checked') || {}).value; }
  function setRadio(name, v) {
    var r = form.querySelector('input[name="' + name + '"][value="' + v + '"]');
    if (r && !r.disabled) r.checked = true;
  }
  function num(input) {
    var n = parseInt(input.value, 10);
    return isNaN(n) ? null : n;
  }
  function limits(input) { return [parseInt(input.min, 10), parseInt(input.max, 10)]; }
  function clampInput(input) {
    var l = limits(input), n = num(input);
    input.value = n === null ? input.defaultValue : S.clamp(n, l[0], l[1]);
  }

  function describeTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60, out = [];
    if (m) out.push(m + ' menit');
    if (s || !m) out.push(s + ' detik');
    return out.join(' ');
  }
  function syncTime() {
    var t = form.elements.time_limit, n = num(t);
    $('#time-readout').textContent = n === null ? '' : describeTime(n);
    $$('#time-chips .chip').forEach(function (c) {
      c.setAttribute('aria-pressed', String(parseInt(c.dataset.sec, 10) === n));
    });
  }

  function currentMode() { return radio('mode'); }

  function syncMode() {
    var mode = currentMode(), random = mode === 'random';
    $('#f-length').hidden = !random;
    $('#f-group').hidden = mode !== 'pupk';
    $('#mode-hint').textContent = HINT_MODE[mode];
    var kata = form.querySelector('input[name="scoring"][value="kata"]');
    kata.disabled = random;
    if (random && kata.checked) setRadio('scoring', 'huruf');
    syncScoring();
  }
  function syncScoring() {
    var s = radio('scoring'), hint = HINT_SCORING[s];
    if (s === 'utuh' && currentMode() === 'random') {
      hint = 'Satu soal benar hanya jika seluruh ' + (num(form.elements.letters) || '') + ' huruf benar. Nilai = soal benar dibagi semua soal.';
    }
    if (currentMode() === 'random') hint += ' Per kata hanya tersedia untuk bank soal.';
    $('#scoring-hint').textContent = hint;
  }

  var lastMode = null;
  function applyModeDefaults() {
    var mode = currentMode();
    if (mode === lastMode) return;
    var nq = form.elements.num_questions;
    var saved = prefs.nq[mode];
    nq.value = S.clamp(saved || (mode === 'random' ? cfg.default_questions_random : cfg.default_questions_db), 1, cfg.max_questions);
    lastMode = mode;
  }

  function savePrefs() {
    prefs.cipher = radio('cipher');
    prefs.mode = currentMode();
    prefs.scoring = radio('scoring');
    prefs.group = val('group_id');
    prefs.length = num(form.elements.letters);
    prefs.time_limit = num(form.elements.time_limit);
    prefs.nq[prefs.mode] = num(form.elements.num_questions);
    S.local.set(PREF_KEY, prefs);
  }

  function restorePrefs() {
    if (prefs.cipher && S.cipherByKey[prefs.cipher]) setRadio('cipher', prefs.cipher);
    if (prefs.mode) setRadio('mode', prefs.mode);
    if (prefs.scoring) setRadio('scoring', prefs.scoring);
    if (prefs.group && form.querySelector('#group_id option[value="' + prefs.group + '"]')) form.elements.group_id.value = prefs.group;
    if (prefs.length) form.elements.letters.value = prefs.length;
    if (prefs.time_limit) form.elements.time_limit.value = prefs.time_limit;
    ['letters', 'num_questions', 'time_limit'].forEach(function (n) { clampInput(form.elements[n]); });
  }

  /* tabel sandi */
  function buildRef() {
    var key = radio('cipher'), c = S.cipherByKey[key];
    var grid = $('#ref-grid');
    grid.textContent = '';
    grid.className = 'ref-grid c-' + key;
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(function (ch) {
      grid.appendChild(el('div', { class: 'ref-row' }, el('b', { text: ch }), S.glyph(ch)));
    });
    $('#ref-name').textContent = '· ' + c.name;
  }
  var mq = window.matchMedia('(min-width: 900px)');
  function syncRefOpen() { if (mq.matches) $('#ref').open = true; }
  if (mq.addEventListener) mq.addEventListener('change', syncRefOpen);

  function initSetup() {
    restorePrefs();
    lastMode = null;
    applyModeDefaults();
    if (prefs.nq[currentMode()]) form.elements.num_questions.value = S.clamp(prefs.nq[currentMode()], 1, cfg.max_questions);
    syncMode(); syncTime(); buildRef(); syncRefOpen();

    $$('input[name="cipher"]').forEach(function (r) { r.addEventListener('change', function () { buildRef(); savePrefs(); }); });
    $$('input[name="mode"]').forEach(function (r) { r.addEventListener('change', function () { savePrefs(); applyModeDefaults(); syncMode(); savePrefs(); }); });
    $$('input[name="scoring"]').forEach(function (r) { r.addEventListener('change', function () { syncScoring(); savePrefs(); }); });

    $$('.stepper').forEach(function (st) {
      var input = st.querySelector('input');
      $$('button', st).forEach(function (b) {
        b.addEventListener('click', function () {
          var l = limits(input), n = num(input);
          if (n === null) n = parseInt(input.defaultValue, 10);
          input.value = S.clamp(n + parseInt(b.dataset.step, 10), l[0], l[1]);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          savePrefs();
        });
      });
      input.addEventListener('input', function () { syncTime(); syncScoring(); });
      input.addEventListener('blur', function () { clampInput(input); syncTime(); syncScoring(); savePrefs(); });
    });
    $$('#time-chips .chip').forEach(function (c) {
      c.addEventListener('click', function () {
        form.elements.time_limit.value = c.dataset.sec; syncTime(); savePrefs();
      });
    });
  }

  function collectRequest() {
    ['letters', 'num_questions', 'time_limit'].forEach(function (n) { clampInput(form.elements[n]); });
    var mode = currentMode();
    var req = {
      cipher: radio('cipher'), mode: mode, scoring: radio('scoring'),
      num_questions: num(form.elements.num_questions), time_limit: num(form.elements.time_limit)
    };
    if (mode === 'random') req.length = num(form.elements.letters);
    if (mode === 'pupk') req.group_id = val('group_id') || null;
    return req;
  }

  /* ----------------------------------------------------------------- game */
  var game = null; // {id, cipher, questions, qInputs, inputs, endAt, limit, timer, submitting, req}
  var lastReq = null;

  function showOnly(which) {
    setupSec.hidden = which !== 'setup';
    gameSec.hidden = which !== 'game';
    resultSec.hidden = which !== 'result';
    document.body.classList.toggle('is-playing', which === 'game');
    window.scrollTo(0, 0);
  }

  function startAttempt(req) {
    errBox.textContent = '';
    startBtn.disabled = true;
    S.api('POST', '/api/attempts', req).then(function (r) {
      startBtn.disabled = false;
      if (!r.ok) {
        showOnly('setup');
        errBox.textContent = r.data.error || 'Latihan belum bisa dimulai. Coba lagi.';
        return;
      }
      lastReq = req;
      beginGame(r.data, false);
      if (r.data.note) toast(r.data.note);
    }).catch(function () {
      startBtn.disabled = false;
      showOnly('setup');
      errBox.textContent = 'Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.';
    });
  }

  function toast(text) {
    var t = el('div', { class: 'flash', role: 'status', style: 'position:fixed;left:var(--gutter);right:var(--gutter);top:calc(var(--appbar-h) + 12px);z-index:60;max-width:520px;margin:0 auto' }, text);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 5000);
  }

  function beginGame(data, resumed) {
    var a = data.attempt, cipher = S.cipherByKey[a.cipher];
    var total = data.questions.reduce(function (n, q) { return n + q.text.replace(/ /g, '').length; }, 0);
    game = {
      id: a.id, cipher: cipher, scoring: a.scoring, questions: data.questions, limit: a.time_limit,
      endAt: Date.now() + data.remaining * 1000, qInputs: [], inputs: [], submitting: false, total: total
    };

    gameSec.textContent = '';
    var lcd = el('div', { class: 'lcd', id: 'lcd', 'aria-hidden': 'true', text: S.fmtClock(data.remaining) });
    var filled = el('b', { id: 'filled', text: '0 / ' + total });
    var hud = el('div', { class: 'hud' },
      el('div', { class: 'hud-row' }, lcd,
        el('div', { class: 'hud-meta' }, filled, 'huruf terisi · ' + cipher.name)),
      el('div', { class: 'rope', id: 'rope' }, el('div', { class: 'rope-fill', id: 'rope-fill' })),
      el('p', { class: 'sr-only', id: 'timer-live', role: 'timer', 'aria-live': 'polite' }));

    var sheet = el('div', { class: 'sheet c-' + a.cipher, id: 'sheet' });
    data.questions.forEach(function (q, qi) { sheet.appendChild(buildQuestion(q, qi, data.questions.length, cipher)); });

    var submit = el('button', { class: 'btn btn-primary btn-lg', type: 'button', id: 'submit-btn' }, 'Kirim jawaban');
    var cancel = el('button', { class: 'btn btn-quiet', type: 'button', id: 'cancel-btn' }, 'Batal');
    var bar = el('div', { class: 'actionbar' }, cancel, submit);

    gameSec.appendChild(hud);
    gameSec.appendChild(sheet);
    gameSec.appendChild(el('div', { class: 'game-pad' }));
    gameSec.appendChild(bar);

    submit.addEventListener('click', function () { requestSubmit(); });
    cancel.addEventListener('click', requestCancel);

    var draft = S.session.get('sandi.draft.' + a.id);
    if (draft) restoreDraft(draft);
    updateFilled();

    showOnly('game');
    tick();
    game.timer = setInterval(tick, 250);
    var first = game.inputs.find(function (i) { return !i.value; }) || game.inputs[0];
    if (first && window.innerWidth >= 900) first.focus();
  }

  function buildQuestion(q, qi, count, cipher) {
    var words = q.text.split(' ');
    var nLetters = q.text.replace(/ /g, '').length;
    var wrap = el('div', { class: 'q-cells' });
    var perWord = [];
    words.forEach(function (w, wi) {
      var word = el('div', { class: 'word', role: 'group', 'aria-label': 'Soal ' + (qi + 1) + ', kata ' + (wi + 1) });
      var list = [];
      w.split('').forEach(function (ch, ci) {
        var input = el('input', {
          class: 'cell-in', type: 'text', maxlength: '2', inputmode: 'text', autocomplete: 'off',
          autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'next',
          'aria-label': 'Soal ' + (qi + 1) + ', huruf ke-' + (ci + 1) + (words.length > 1 ? ' dari kata ' + (wi + 1) : '')
        });
        wireInput(input);
        game.inputs.push(input);
        list.push(input);
        var cellNode = el('div', { class: 'cell' }, S.glyph(ch), input);
        var after = ci < w.length - 1 ? cipher.letter_sep : (wi < words.length - 1 ? cipher.word_sep : '');
        word.appendChild(after ? el('span', { class: 'unit' }, cellNode, S.sep(after)) : cellNode);
      });
      perWord.push(list);
      wrap.appendChild(word);
    });
    game.qInputs.push(perWord);
    return el('section', { class: 'q', 'aria-label': 'Soal ' + (qi + 1) },
      el('div', { class: 'q-head' }, count > 1 ? 'Soal ' + (qi + 1) : 'Tulis hurufnya',
        el('small', { text: nLetters + ' huruf' + (words.length > 1 ? ', ' + words.length + ' kata' : '') })),
      wrap);
  }

  function wireInput(input) {
    // Pilih isi kotak saat fokus agar huruf baru menggantikan yang lama.
    // Pakai setSelectionRange (bukan select()) dan hanya jika kotak masih terfokus:
    // select() bisa memindahkan fokus balik dan membuat fokus melompat-lompat.
    input.addEventListener('focus', function () {
      setTimeout(function () {
        if (document.activeElement !== input) return;
        try { input.setSelectionRange(0, input.value.length); } catch (e) { /* abaikan */ }
      }, 0);
    });
    input.addEventListener('input', function () {
      var letters = input.value.replace(/[^A-Za-z]/g, '');
      if (!letters) { input.value = ''; mark(input); updateFilled(); return; }
      input.value = letters.slice(-1).toUpperCase();
      mark(input); updateFilled(); saveDraft();
      focusAt(game.inputs.indexOf(input) + 1);
    });
    input.addEventListener('keydown', function (e) {
      var i = game.inputs.indexOf(input);
      if (e.key === 'Backspace' && !input.value) { e.preventDefault(); if (i > 0) { var p = game.inputs[i - 1]; p.value = ''; mark(p); updateFilled(); saveDraft(); p.focus(); } }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(i - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(i + 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (i === game.inputs.length - 1) requestSubmit(); else focusAt(i + 1); }
    });
    input.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^A-Za-z]/g, '').toUpperCase();
      if (!text) return;
      e.preventDefault();
      var i = game.inputs.indexOf(input);
      for (var k = 0; k < text.length && i + k < game.inputs.length; k++) { game.inputs[i + k].value = text[k]; mark(game.inputs[i + k]); }
      updateFilled(); saveDraft();
      focusAt(Math.min(game.inputs.length - 1, i + text.length));
    });
  }
  function mark(input) { input.classList.toggle('has-value', !!input.value); }
  function focusAt(i) { if (game.inputs[i]) game.inputs[i].focus(); else if (i >= game.inputs.length) { $('#submit-btn').focus(); } }

  function updateFilled() {
    var n = game.inputs.filter(function (i) { return i.value; }).length;
    $('#filled').textContent = n + ' / ' + game.total;
    return n;
  }

  function collectAnswers() {
    return game.qInputs.map(function (words) {
      return words.map(function (list) {
        return list.map(function (i) { return i.value || '_'; }).join('');
      }).join(' ');
    });
  }
  function saveDraft() { if (game) S.session.set('sandi.draft.' + game.id, collectAnswers()); }
  function restoreDraft(answers) {
    game.qInputs.forEach(function (words, qi) {
      var ans = (answers[qi] || '').split(' ');
      words.forEach(function (list, wi) {
        list.forEach(function (input, ci) {
          var ch = (ans[wi] || '').charAt(ci);
          if (ch && ch !== '_') { input.value = ch; mark(input); }
        });
      });
    });
  }

  /* timer: jam server menentukan sisa waktu, klien hanya menampilkan */
  var announced = {};
  function tick() {
    if (!game) return;
    var remaining = (game.endAt - Date.now()) / 1000;
    var lcd = $('#lcd'), rope = $('#rope');
    lcd.textContent = S.fmtClock(remaining);
    var low = remaining <= Math.max(10, game.limit * 0.2);
    lcd.classList.toggle('is-low', low);
    rope.classList.toggle('is-low', low);
    $('#rope-fill').style.transform = 'scaleX(' + S.clamp(remaining / game.limit, 0, 1) + ')';
    [60, 30, 10].forEach(function (t) {
      if (remaining <= t && remaining > t - 1 && !announced[t] && game.limit > t) {
        announced[t] = true; $('#timer-live').textContent = 'Sisa ' + t + ' detik';
      }
    });
    if (remaining <= 0 && !game.submitting) submit(true);
  }

  function requestSubmit() {
    if (game.submitting) return;
    var blank = game.total - updateFilled();
    if (!blank) return submit(false);
    var body = $('#confirm-body');
    body.textContent = 'Masih ada ' + blank + ' huruf yang kosong. Huruf kosong dihitung salah.';
    openDialog(dlg, function () { submit(false); });
    $('#confirm-title').textContent = 'Kirim jawaban?';
    $('#confirm-yes').textContent = 'Kirim';
    $('#confirm-no').textContent = 'Lanjut mengisi';
  }

  var dialogAction = null;
  function openDialog(d, onYes) {
    dialogAction = onYes;
    if (d.showModal) d.showModal();
    else if (window.confirm($('#confirm-body').textContent)) onYes();
  }
  $('#confirm-yes').addEventListener('click', function () { dlg.close(); var f = dialogAction; dialogAction = null; if (f) f(); });
  $('#confirm-no').addEventListener('click', function () { dlg.close(); dialogAction = null; });

  function requestCancel() {
    $('#confirm-title').textContent = 'Batalkan latihan?';
    $('#confirm-body').textContent = 'Latihan ini tidak masuk riwayat nilai.';
    $('#confirm-yes').textContent = 'Batalkan';
    $('#confirm-no').textContent = 'Kembali';
    openDialog(dlg, function () {
      var id = game.id; stopGame();
      S.session.del('sandi.draft.' + id);
      S.api('POST', '/api/attempts/' + id + '/cancel');
      showOnly('setup');
    });
  }

  function stopGame() { if (game && game.timer) clearInterval(game.timer); if (game) game.timer = null; }

  function submit(auto, tries) {
    if (game.submitting && !tries) return;
    game.submitting = true;
    tries = tries || 0;
    var btn = $('#submit-btn'); btn.disabled = true; btn.textContent = 'Mengirim…';
    var answers = collectAnswers();
    S.api('POST', '/api/attempts/' + game.id + '/submit', { answers: answers }).then(function (r) {
      if (r.ok) {
        stopGame();
        S.session.del('sandi.draft.' + game.id);
        showResult(r.data);
      } else if (r.status === 409) {
        stopGame();
        S.session.del('sandi.draft.' + game.id);
        showClosed(r.data);
      } else {
        retryOrFail(r.data.error || 'Gagal mengirim jawaban.', auto, tries);
      }
    }).catch(function () { retryOrFail('Koneksi terputus.', auto, tries); });
  }
  function retryOrFail(msg, auto, tries) {
    if (tries < 6) {          // tenggat server memberi toleransi beberapa detik
      setTimeout(function () { submit(auto, tries + 1); }, 1200);
      return;
    }
    game.submitting = false;
    var btn = $('#submit-btn'); btn.disabled = false; btn.textContent = 'Kirim jawaban';
    toast(msg + ' Coba kirim lagi.');
  }

  function showResult(data) {
    showOnly('result');
    Review.render(resultSec, data, {
      historyUrl: '/riwayat', playUrl: '/play',
      onAgain: function () { startAttempt(lastReq || reqFromAttempt(data.attempt)); },
      onChange: function () { showOnly('setup'); }
    });
  }
  function reqFromAttempt(a) {
    var r = { cipher: a.cipher, mode: a.mode, scoring: a.scoring, num_questions: a.num_questions, time_limit: a.time_limit };
    if (a.mode === 'random') r.length = a.length;
    if (a.mode === 'pupk') r.group_id = a.group_id;
    return r;
  }
  function showClosed(data) {
    showOnly('result');
    resultSec.textContent = '';
    resultSec.appendChild(el('div', { class: 'result-top' },
      el('h1', { text: 'Waktu habis' }),
      el('p', { class: 'score-sub', text: data.error || 'Latihan ini sudah ditutup. Jawaban tidak tersimpan.' })));
    resultSec.appendChild(el('div', { class: 'result-actions' },
      el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { showOnly('setup'); } }, 'Atur latihan baru'),
      el('a', { class: 'btn btn-quiet', href: '/riwayat' }, 'Lihat riwayat')));
  }

  /* ----------------------------------------------------------------- boot */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    savePrefs();
    startAttempt(collectRequest());
  });

  initSetup();

  // Lanjutkan latihan yang masih berjalan (mis. halaman dimuat ulang).
  S.api('GET', '/api/attempts/active').then(function (r) {
    if (r.ok && r.data.attempt) {
      lastReq = reqFromAttempt(Object.assign({ num_questions: r.data.questions.length }, r.data.attempt));
      beginGame(r.data, true);
      toast('Melanjutkan latihan yang belum selesai.');
    }
  });
})();
