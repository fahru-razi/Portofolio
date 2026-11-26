/* Hasil latihan + tinjauan jawaban. Dipakai di halaman Latihan, Riwayat, dan Admin. */
(function () {
  'use strict';
  var S = window.SANDI, el = S.el;

  var SCORING_LABEL = { huruf: 'per huruf', kata: 'per kata', utuh: 'utuh' };

  function verdict(a) {
    if (a.status === 'expired') return 'Waktu habis sebelum jawaban terkirim, jadi nilainya 0.';
    if (a.status === 'canceled') return 'Latihan ini dibatalkan.';
    var s = a.score;
    if (s >= 100) return 'Sempurna. Semua jawaban benar.';
    if (s >= 90) return 'Hampir sempurna. Tinggal satu dua huruf.';
    if (s >= 70) return 'Bagus. Periksa huruf yang salah di bawah.';
    if (s >= 40) return 'Lumayan. Buka tabel sandi, lalu ulangi.';
    return 'Belum hafal. Pelajari tabelnya, lalu coba lagi.';
  }

  function metric(label, value, total, scored, extra) {
    var dd = el('dd', null, String(value), total !== undefined ? el('small', { text: ' / ' + total }) : null);
    return el('div', { class: 'metric' + (scored ? ' is-scored' : '') },
      el('dt', null, scored ? el('span', { class: 'tag', text: 'Dasar nilai' }) : null, scored ? ' ' + label : label),
      dd, extra || null);
  }

  function reviewQuestion(q, i, cipher) {
    var wrongLetters = q.letters_total - q.letters_correct;
    var badge = q.is_correct
      ? el('span', { class: 'badge ok' }, iconSvg('check'), 'Benar semua')
      : el('span', { class: 'badge bad' }, iconSvg('cross'), wrongLetters + ' huruf salah');
    var head = el('div', { class: 'rv-head' },
      el('span', { text: 'Soal ' + (i + 1) }), badge,
      el('small', { text: q.letters_correct + ' dari ' + q.letters_total + ' huruf' }));

    var answerWords = (q.answer || '').split(' ');
    var cells = el('div', { class: 'rv-cells' });
    var wordCount = q.text.split(' ').length;
    q.text.split(' ').forEach(function (w, wi) {
      var word = el('div', { class: 'rv-word' });
      var given = answerWords[wi] || '';
      w.split('').forEach(function (ch, ci) {
        var got = given.charAt(ci) || '_';
        var ok = got === ch;
        var blank = got === '_';
        var after = ci < w.length - 1 ? cipher.letter_sep : (wi < wordCount - 1 ? cipher.word_sep : '');
        var rvCell = el('div', { class: 'rv-cell ' + (ok ? 'ok' : 'bad') },
          S.glyph(ch),
          el('div', { class: 'rv-ans' + (blank ? ' blank' : ''), text: blank ? '–' : got,
            'aria-label': (blank ? 'Kosong' : 'Jawaban ' + got) + (ok ? ', benar' : ', salah') }),
          el('div', { class: 'rv-key' }, ok ? '' : el('span', { text: 'Benar ' }), ok ? '' : ch));
        word.appendChild(after ? el('span', { class: 'unit' }, rvCell, S.sep(after)) : rvCell);
      });
      cells.appendChild(word);
    });
    return el('article', { class: 'rv c-' + cipher.key }, head, cells);
  }

  function iconSvg(name) {
    var paths = { check: 'M5 12.5l4.5 4.5L19 7.5', cross: 'M6 6l12 12M18 6L6 18' };
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '3');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', paths[name]);
    svg.appendChild(p);
    return svg;
  }

  /**
   * payload: {attempt, questions}
   * opts: {playUrl, historyUrl, viewer: 'owner'|'admin', onAgain, onChange}
   */
  function render(root, payload, opts) {
    opts = opts || {};
    var a = payload.attempt, cipher = S.cipherByKey[a.cipher];
    root.textContent = '';
    root.className = 'c-' + a.cipher;

    var timeText = a.status === 'finished'
      ? S.fmtDur(a.duration) : '–';
    var top = el('div', { class: 'result-top' },
      el('div', { class: 'score-row' },
        el('div', { class: 'score-lcd', role: 'img', 'aria-label': 'Nilai ' + S.fmtScore(a.status === 'finished' ? a.score : 0) + ' dari 100',
          text: S.fmtScore(a.status === 'finished' ? a.score : 0) }),
        el('span', { class: 'score-unit', text: 'dari 100' })),
      el('p', { class: 'score-sub', text: verdict(a) }));

    var metrics = el('dl', { class: 'metrics' },
      metric('Huruf benar', a.letters_correct, a.letters_total, a.scoring === 'huruf'),
      a.mode !== 'random' ? metric('Kata benar', a.words_correct, a.words_total, a.scoring === 'kata') : null,
      metric('Soal benar', a.questions_correct, a.questions_total, a.scoring === 'utuh'),
      metric('Waktu', timeText, undefined, false,
        el('dd', { style: 'font-size:.85rem;font-weight:500;font-stretch:100%;color:var(--ink-3)' },
          'batas ' + S.fmtDur(a.time_limit) + (a.timed_out ? ', waktu habis' : ''))));

    var actions = el('div', { class: 'result-actions' });
    if (opts.onAgain) {
      actions.appendChild(el('button', { class: 'btn btn-primary', type: 'button', onclick: opts.onAgain }, 'Ulangi dengan pengaturan sama'));
      actions.appendChild(el('button', { class: 'btn', type: 'button', onclick: opts.onChange }, 'Ubah pengaturan'));
      actions.appendChild(el('a', { class: 'btn btn-quiet', href: opts.historyUrl }, 'Lihat riwayat'));
    } else {
      if (opts.viewer !== 'admin') actions.appendChild(el('a', { class: 'btn btn-primary', href: opts.playUrl }, 'Latihan lagi'));
      actions.appendChild(el('a', { class: 'btn btn-quiet', href: opts.historyUrl }, 'Kembali'));
    }

    var meta = el('p', { class: 'small muted' },
      'Sandi ' + cipher.name + ' · ' + (a.mode === 'random' ? 'huruf acak, ' + a.length + ' huruf per soal' : a.mode === 'pupk' ? 'dari PUPK' : 'bank soal') +
      ' · dinilai ' + SCORING_LABEL[a.scoring]);

    var review = el('section', { class: 'review' },
      el('h2', { text: 'Tinjau jawaban' }),
      el('p', { class: 'small muted', style: 'margin-bottom:6px', text: 'Di bawah tiap simbol: jawabanmu. Jawaban yang salah menampilkan huruf yang benar.' }));
    payload.questions.forEach(function (q, i) { review.appendChild(reviewQuestion(q, i, cipher)); });

    root.appendChild(top);
    root.appendChild(meta);
    root.appendChild(metrics);
    root.appendChild(actions);
    root.appendChild(review);
  }

  window.Review = { render: render };
})();
