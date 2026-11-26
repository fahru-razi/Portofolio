import { api } from './api_client.js';
import { $, html, mount, initShell, fmtDateTime, debounce, emptyState, skeleton } from './ui_kit.js';

const state = { q: '', action: '', page: 1, per_page: 30 };
const ACTION_LABEL = { create: 'Membuat', update: 'Mengubah', delete: 'Menghapus', login: 'Masuk', login_failed: 'Gagal masuk', password_change: 'Ganti kata sandi', reorder: 'Mengurutkan' };

async function load() {
  const result = await api.get('/api/admin/audit', { q: state.q, action: state.action, page: state.page, per_page: state.per_page });
  const select = $('#auditAction');
  if (select.options.length === 1) mount(select, html`<option value="">Semua aksi</option>${result.actions.map((a) => html`<option value="${a}">${ACTION_LABEL[a] ?? a}</option>`)}`);
  const { items, total, page, per_page } = result;
  if (!items.length) { mount($('#auditTable'), html`<div class="list-card">${emptyState('Tidak ada catatan', 'Belum ada aktivitas yang cocok dengan filter.', 'key')}</div>`); return; }
  const to = (page - 1) * per_page + items.length;
  mount($('#auditTable'), html`<div class="table-wrap"><table class="table"><caption class="sr-only">Log audit</caption>
    <thead><tr><th scope="col">Waktu</th><th scope="col">Pelaku</th><th scope="col">Aksi</th><th scope="col">Objek</th><th scope="col">Detail</th><th scope="col">IP</th></tr></thead>
    <tbody>${items.map((e) => html`<tr><td class="num muted">${fmtDateTime(e.created_at)}</td><td>${e.actor_name ?? html`<span class="muted">Sistem</span>`}</td>
      <td>${ACTION_LABEL[e.action] ?? e.action}</td><td>${e.entity ?? '-'}</td><td class="audit-detail">${e.detail ?? ''}</td><td class="num muted">${e.ip ?? '-'}</td></tr>`)}</tbody></table></div>
    <div class="pager"><span>Menampilkan ${(page - 1) * per_page + 1} sampai ${to} dari ${total}</span><span class="btn-row">
      <button class="btn btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button><button class="btn btn-sm" data-page="${page + 1}" ${to >= total ? 'disabled' : ''}>Berikutnya</button></span></div>`);
}

initShell();
mount($('#auditTable'), html`<div class="list-card">${skeleton(5)}</div>`);
$('#auditSearch').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
$('#auditAction').addEventListener('change', (e) => { state.action = e.target.value; state.page = 1; load(); });
$('#auditTable').addEventListener('click', (event) => { const b = event.target.closest('[data-page]'); if (b) { state.page = Number(b.dataset.page); load(); } });
load().catch(() => {});
