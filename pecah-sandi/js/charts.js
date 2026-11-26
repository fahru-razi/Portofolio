/* Grafik SVG kecil tanpa pustaka. Satu warna, garis tipis, grid hairline,
   tooltip di hover/fokus, dan pembaruan saat ukuran berubah.
   Semua teks dari data dimasukkan dengan textContent. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function htmlEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function makeTip(host) {
    var tip = htmlEl('div', 'tip');
    tip.hidden = true;
    tip.setAttribute('role', 'status');
    host.appendChild(tip);
    return {
      show: function (x, y, rows) {
        tip.textContent = '';
        rows.forEach(function (r) {
          if (r.kind === 'value') tip.appendChild(htmlEl('strong', '', r.text));
          else if (r.kind === 'key') {
            var d = htmlEl('div', 'tl'); d.appendChild(htmlEl('i')); d.appendChild(document.createTextNode(r.text)); tip.appendChild(d);
          } else tip.appendChild(htmlEl('div', '', r.text));
        });
        tip.hidden = false;
        var w = tip.offsetWidth, hostW = host.clientWidth;
        var left = x + 14 + w > hostW ? x - 14 - w : x + 14;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, y) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  /* Gambar ulang ketika lebar wadah berubah. */
  function responsive(host, draw) {
    var last = 0;
    function run() {
      var w = Math.floor(host.clientWidth);
      if (!w || w === last) return;
      last = w;
      draw(w);
    }
    run();
    if (window.ResizeObserver) new ResizeObserver(run).observe(host);
    else window.addEventListener('resize', run);
  }

  /* ------------------------------------------------------------ garis */
  /* opts: {points:[{x,y,label,sub}], yMax, ticks:[...], unit, height} */
  function line(host, opts) {
    var pts = opts.points, H = opts.height || 220;
    var M = { l: 34, r: 18, t: 18, b: 26 };
    var yMax = opts.yMax || 100, ticks = opts.ticks || [0, yMax / 2, yMax];
    var unit = opts.unit || '';
    var state = { idx: null, svg: null, W: 0 };

    function draw(W) {
      host.textContent = '';
      var tip = makeTip(host);
      var pw = W - M.l - M.r, ph = H - M.t - M.b;
      var svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
      var xs = pts.map(function (p) { return p.x; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      function X(v) { return M.l + (x1 === x0 ? pw / 2 : (v - x0) / (x1 - x0) * pw); }
      function Y(v) { return M.t + ph - (v / yMax) * ph; }

      ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { class: t === 0 ? 'axis' : 'grid', x1: M.l, x2: W - M.r, y1: Y(t), y2: Y(t) }));
        var tx = svgEl('text', { x: M.l - 8, y: Y(t) + 4, 'text-anchor': 'end' });
        tx.textContent = t + unit;
        svg.appendChild(tx);
      });

      // label sumbu x: ujung kiri dan kanan saja
      [0, pts.length - 1].forEach(function (i, k) {
        if (k === 1 && pts.length === 1) return;
        var t = svgEl('text', { x: X(pts[i].x), y: H - 6, 'text-anchor': k === 0 ? 'start' : 'end' });
        t.textContent = pts[i].label;
        svg.appendChild(t);
      });

      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); }).join(' ');
      var area = d + ' L' + X(pts[pts.length - 1].x).toFixed(1) + ' ' + Y(0) + ' L' + X(pts[0].x).toFixed(1) + ' ' + Y(0) + ' Z';
      svg.appendChild(svgEl('path', { class: 'area', d: area }));
      svg.appendChild(svgEl('path', { class: 'line', d: d }));

      var showAll = pts.length <= 14;
      if (showAll) pts.forEach(function (p) { svg.appendChild(svgEl('circle', { class: 'dot', cx: X(p.x), cy: Y(p.y), r: 4.5 })); });
      var last = pts[pts.length - 1];
      if (!showAll) svg.appendChild(svgEl('circle', { class: 'dot', cx: X(last.x), cy: Y(last.y), r: 4.5 }));
      var el = svgEl('text', { class: 'endlabel', x: X(last.x), y: Y(last.y) - 11, 'text-anchor': 'end' });
      el.textContent = Math.round(last.y * 10) / 10 + unit;
      svg.appendChild(el);

      var cross = svgEl('line', { class: 'cross', y1: M.t, y2: Y(0), x1: 0, x2: 0, visibility: 'hidden' });
      var hot = svgEl('circle', { class: 'dot', r: 5.5, visibility: 'hidden' });
      svg.appendChild(cross); svg.appendChild(hot);
      host.appendChild(svg);
      state.svg = svg; state.W = W;

      function focusIdx(i) {
        var p = pts[i], px = X(p.x), py = Y(p.y);
        state.idx = i;
        cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
        hot.setAttribute('cx', px); hot.setAttribute('cy', py); hot.setAttribute('visibility', 'visible');
        tip.show(px, Math.max(0, py - 70), [
          { kind: 'value', text: Math.round(p.y * 10) / 10 + unit },
          { kind: 'key', text: opts.yLabel || 'Nilai' },
          { text: p.label }, p.sub ? { text: p.sub } : { text: '' }
        ]);
      }
      function clear() { state.idx = null; cross.setAttribute('visibility', 'hidden'); hot.setAttribute('visibility', 'hidden'); tip.hide(); }
      function nearest(clientX) {
        var r = svg.getBoundingClientRect(), x = clientX - r.left, best = 0, bd = Infinity;
        pts.forEach(function (p, i) { var dd = Math.abs(X(p.x) - x); if (dd < bd) { bd = dd; best = i; } });
        return best;
      }
      svg.addEventListener('pointermove', function (e) { focusIdx(nearest(e.clientX)); });
      svg.addEventListener('pointerdown', function (e) { focusIdx(nearest(e.clientX)); });
      svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') clear(); });
      host.onkeydown = function (e) {
        var i = state.idx === null ? pts.length - 1 : state.idx;
        if (e.key === 'ArrowLeft') { focusIdx(Math.max(0, i - 1)); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { focusIdx(Math.min(pts.length - 1, i + 1)); e.preventDefault(); }
        else if (e.key === 'Home') { focusIdx(0); e.preventDefault(); }
        else if (e.key === 'End') { focusIdx(pts.length - 1); e.preventDefault(); }
        else if (e.key === 'Escape') clear();
      };
      host.onfocus = function () { if (state.idx === null) focusIdx(pts.length - 1); };
      host.onblur = clear;
    }
    var avg = pts.reduce(function (n, p) { return n + p.y; }, 0) / pts.length;
    host.setAttribute('aria-label', (opts.yLabel || 'Nilai') + ': ' + pts.length + ' titik, terakhir ' +
      Math.round(pts[pts.length - 1].y * 10) / 10 + unit + ', rata-rata ' + Math.round(avg * 10) / 10 + unit +
      '. Gunakan panah kiri dan kanan untuk menjelajah.');
    responsive(host, draw);
  }

  /* ------------------------------------------------------------ batang */
  /* opts: {items:[{label, pct, ok, total, wrong:[[huruf,n]]}], yMax, unit, height, labelLowest} */
  function bars(host, opts) {
    var items = opts.items, H = opts.height || 220;
    var M = { l: 38, r: 6, t: 22, b: 26 };
    var yMax = opts.yMax || 100, unit = opts.unit || '%';
    var ticks = [0, 50, 100];

    // tiga huruf dengan akurasi terendah (min. beberapa jawaban) diberi label nilai
    var cand = items.map(function (it, i) { return { i: i, it: it }; })
      .filter(function (o) { return o.it.pct !== null && o.it.total >= (opts.minForLabel || 3); })
      .sort(function (a, b) { return a.it.pct - b.it.pct; }).slice(0, 3).map(function (o) { return o.i; });

    function draw(W) {
      host.textContent = '';
      var tip = makeTip(host);
      var pw = W - M.l - M.r, ph = H - M.t - M.b, slot = pw / items.length;
      var minGap = Math.ceil(32 / slot), ranked = [];
      cand.forEach(function (i) { if (ranked.length < 3 && ranked.every(function (j) { return Math.abs(i - j) >= minGap; })) ranked.push(i); });
      var bw = Math.min(24, Math.max(6, slot * 0.62));
      var svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
      function Y(v) { return M.t + ph - (v / yMax) * ph; }
      ticks.forEach(function (t) {
        svg.appendChild(svgEl('line', { class: t === 0 ? 'axis' : 'grid', x1: M.l, x2: W - M.r, y1: Y(t), y2: Y(t) }));
        var tx = svgEl('text', { x: M.l - 8, y: Y(t) + 4, 'text-anchor': 'end' });
        tx.textContent = t + unit; svg.appendChild(tx);
      });
      var barEls = [];
      items.forEach(function (it, i) {
        var cx = M.l + slot * i + slot / 2;
        var lt = svgEl('text', { x: cx, y: H - 8, 'text-anchor': 'middle' });
        lt.textContent = it.label; svg.appendChild(lt);
        if (it.pct === null) { barEls.push(null); return; }
        var h = Math.max(0, (it.pct / yMax) * ph), r = Math.min(4, h / 2), x = cx - bw / 2, y = Y(0) - h;
        var path = h <= 0 ? null : svgEl('path', {
          class: 'bar',
          d: 'M' + x + ' ' + Y(0) + 'V' + (y + r) + 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
             'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + y + ' ' + (x + bw) + ' ' + (y + r) + 'V' + Y(0) + 'Z'
        });
        if (path) svg.appendChild(path);
        barEls.push(path);
        if (ranked.indexOf(i) !== -1) {
          var v = svgEl('text', { class: 'endlabel', x: cx, y: Math.min(Y(0) - 4, y - 5), 'text-anchor': 'middle' });
          v.textContent = Math.round(it.pct) + unit; svg.appendChild(v);
        }
      });
      host.appendChild(svg);
      var cur = null;
      function show(i) {
        if (cur !== null && barEls[cur]) barEls[cur].classList.remove('is-hot');
        cur = i;
        var it = items[i];
        if (barEls[i]) barEls[i].classList.add('is-hot');
        var cx = M.l + slot * i + slot / 2;
        var rows = [{ kind: 'value', text: it.pct === null ? 'Belum ada data' : Math.round(it.pct * 10) / 10 + unit },
          { kind: 'key', text: 'Huruf ' + it.label }];
        if (it.pct !== null) {
          rows.push({ text: it.ok + ' benar dari ' + it.total + ' jawaban' });
          if (it.wrong && it.wrong.length) rows.push({ text: 'Sering dijawab: ' + it.wrong.map(function (w) { return w[0] + ' (' + w[1] + '×)'; }).join(', ') });
        }
        tip.show(cx, 0, rows);
      }
      function hide() { if (cur !== null && barEls[cur]) barEls[cur].classList.remove('is-hot'); cur = null; tip.hide(); }
      function idxAt(clientX) {
        var r = svg.getBoundingClientRect();
        return S_clamp(Math.floor((clientX - r.left - M.l) / slot), 0, items.length - 1);
      }
      svg.addEventListener('pointermove', function (e) { show(idxAt(e.clientX)); });
      svg.addEventListener('pointerdown', function (e) { show(idxAt(e.clientX)); });
      svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hide(); });
      host.onkeydown = function (e) {
        var i = cur === null ? 0 : cur;
        if (e.key === 'ArrowRight') { show(Math.min(items.length - 1, i + 1)); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { show(Math.max(0, i - 1)); e.preventDefault(); }
        else if (e.key === 'Escape') hide();
      };
      host.onfocus = function () { if (cur === null) show(0); };
      host.onblur = hide;
    }
    host.setAttribute('aria-label', 'Diagram batang: ' + opts.title + '. Gunakan panah kiri dan kanan untuk menjelajah; tabel tersedia di bawah.');
    responsive(host, draw);
  }

  function S_clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  window.Charts = { line: line, bars: bars };
})();
