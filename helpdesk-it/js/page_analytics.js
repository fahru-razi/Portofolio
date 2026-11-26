import { api } from './api_client.js';
import { $, html, mount, initShell, fmtDate, skeleton } from './ui_kit.js';

const pct = (part, whole) => (whole ? Math.round((part * 100) / whole) : 0);

const bars = (rows, labelOf, valueOf, max, toneOf = () => '') => html`<ul class="bars">${rows.map((row) => html`
  <li class="tone-${toneOf(row)}"><div class="bar-label"><span>${labelOf(row)}</span><span>${valueOf(row)}</span></div>
  <div class="bar"><i data-w="${pct(valueOf(row), max)}"></i></div></li>`)}</ul>`;

function render(d) {
  const s = d.summary;
  const max = (rows, key = 'total') => Math.max(1, ...rows.map((r) => r[key]));
  mount($('#analyticsRoot'), html`
    <section class="stat-grid">
      <div class="stat is-hero"><strong>${s.total}</strong><span>Tiket masuk (${d.days} hari)</span></div>
      <div class="stat"><strong>${s.open_count}</strong><span>Masih aktif</span></div>
      <div class="stat ${s.sla_percent !== null && s.sla_percent < 80 ? 'is-alert' : ''}"><strong>${s.sla_percent === null ? '-' : `${s.sla_percent}%`}</strong><span>Pemenuhan SLA</span></div>
      <div class="stat ${s.response_percent !== null && s.response_percent < 80 ? 'is-alert' : ''}"><strong>${s.response_percent === null ? '-' : `${s.response_percent}%`}</strong><span>Respons pertama tepat waktu</span></div>
      <div class="stat"><strong>${s.avg_hours === null ? '-' : `${s.avg_hours} jam`}</strong><span>Rata-rata penyelesaian</span></div>
      <div class="stat"><strong>${s.csat_avg === null ? '-' : `${s.csat_avg}/5`}</strong><span>Kepuasan (${s.csat_count} penilaian)</span></div>
      <div class="stat ${s.overdue ? 'is-alert' : ''}"><strong>${s.overdue}</strong><span>Melewati SLA</span></div>
    </section>
    <div class="panel-grid">
      <section class="panel"><h3>Tiket per kelompok</h3>${bars(d.by_group, (g) => g.name, (g) => g.total, max(d.by_group))}</section>
      <section class="panel"><h3>Tiket per minggu</h3><div class="columns-chart">${d.weekly.map((w) => html`<div><b>${w.total}</b><i data-h="${pct(w.total, max(d.weekly))}"></i><span>${fmtDate(w.week_start).slice(0, 6)}</span></div>`)}</div></section>
      <section class="panel"><h3>Distribusi status</h3>${d.by_status.length ? bars(d.by_status, (x) => x.label, (x) => x.total, max(d.by_status), (x) => x.tone) : html`<p class="muted">Belum ada data.</p>`}</section>
      <section class="panel"><h3>Berdasarkan prioritas</h3>${bars(d.by_priority, (x) => x.label, (x) => x.total, max(d.by_priority), (x) => x.tone)}</section>
      <section class="panel"><h3>Tiket per departemen pemohon</h3>${d.by_department.length ? bars(d.by_department, (x) => x.name, (x) => x.total, max(d.by_department)) : html`<p class="muted">Belum ada data.</p>`}</section>
      <section class="panel"><h3>Isu yang berulang</h3>${d.recurring.length ? html`<ul class="rank">${d.recurring.map((r) => html`<li><div>${r.title}<small>${r.group_name}</small></div><strong>${r.occurrences}x</strong></li>`)}</ul>` : html`<p class="muted">Belum ada judul tiket yang berulang pada periode ini.</p>`}</section>
      <section class="panel"><h3>Perangkat paling sering bermasalah</h3>${d.assets.length ? html`<ul class="rank">${d.assets.map((a) => html`<li><span class="num">${a.asset_tag}</span><strong>${a.occurrences}x</strong></li>`)}</ul>` : html`<p class="muted">Belum ada perangkat dengan lebih dari satu gangguan.</p>`}</section>
    </div>`);
}

async function load() {
  try { render(await api.get('/api/admin/analytics', { days: $('#rangeSelect').value })); } catch { /* ditangani api_client */ }
}

initShell();
mount($('#analyticsRoot'), html`<div class="list-card">${skeleton(3)}</div>`);
$('#rangeSelect').addEventListener('change', load);
load();
