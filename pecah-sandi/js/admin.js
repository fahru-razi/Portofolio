/* Admin: grafik ringkasan dan filter otomatis. */
(function () {
  'use strict';
  var S = window.SANDI;
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  // Filter berlaku begitu dipilih; tombol "Terapkan" tetap ada tanpa JavaScript.
  var filters = document.getElementById('filters');
  if (filters) {
    filters.addEventListener('change', function () { filters.submit(); });
    var btn = filters.querySelector('button[type="submit"]');
    if (btn) btn.hidden = true;
  }

  function readJSON(id) {
    var n = document.getElementById(id);
    try { return n ? JSON.parse(n.textContent) : null; } catch (e) { return null; }
  }

  var letters = readJSON('letters-data'), host = document.getElementById('letters-chart');
  if (letters && host && window.Charts) {
    Charts.bars(host, { items: letters, yMax: 100, unit: '%', title: 'akurasi per huruf', minForLabel: 3 });
  }

  var daily = readJSON('daily-data'), dhost = document.getElementById('daily-chart');
  if (daily && daily.length >= 2 && dhost && window.Charts) {
    var pts = daily.map(function (d) {
      var p = d.d.split('-').map(Number);
      return {
        x: Date.UTC(p[0], p[1] - 1, p[2]) / 86400000,
        y: d.avg,
        label: p[2] + ' ' + months[p[1] - 1],
        sub: d.n + ' latihan, akurasi huruf ' + d.acc + '%'
      };
    });
    Charts.line(dhost, { points: pts, yMax: 100, ticks: [0, 50, 100], yLabel: 'Nilai rata-rata' });
  }
})();
