import { api } from './api_client.js';
import { $, $$, html, mount, initShell, loadMeta, badge, priorityPill, avatar, timeAgo, debounce, skeleton, emptyState } from './ui_kit.js';
import { initTicketForm } from './ticket_form_builder.js';
import { initTicketDrawer, openTicket, openFromQuery } from './ticket_drawer.js';

const PAGE_SIZE = 20;
const state = { view: 'kanban', q: '', group_id: '', priority_id: '', assignee: '', tag_id: '', status: '', page: 1 };
let meta;

const isOverdue = (t) => !['confirm', 'done'].includes(t.status_kind) && new Date(t.sla_due_at) < new Date();

const card = (t) => html`<article class="kcard" data-id="${t.id}" tabindex="0" role="button" aria-label="${t.ticket_no} ${t.title}">
  <div class="kcard-top"><span class="muted num small">${t.ticket_no}</span>${priorityPill(t.priority_label, t.priority_tone)}</div>
  <h4>${t.title}</h4>
  <div class="kcard-meta"><span class="tag">${t.group_name}</span>${t.tags.map((g) => html`<span class="tag-chip tone-${g.tone}">${g.name}</span>`)}${isOverdue(t) ? html`<span class="tag tag-danger">Lewat SLA</span>` : ''}</div>
  <div class="kcard-foot">${badge(t.status_label, t.status_tone)}
    ${t.assignee_name ? avatar(t.assignee_name, true) : html`<span class="assignee-empty" title="Belum ditugaskan">?</span>`}</div>
</article>`;

function renderKanban(items) {
  const columns = meta.board_columns.map((c) => ({ id: c.id, name: c.name }));
  const orphans = items.filter((t) => !columns.some((c) => c.id === t.board_column_id));
  if (orphans.length) columns.push({ id: null, name: 'Tanpa kolom' });
  mount($('#boardView'), html`<div class="kanban">${columns.map((col) => {
    const cards = items.filter((t) => (col.id === null ? !columns.some((c) => c.id === t.board_column_id) : t.board_column_id === col.id));
    return html`<section class="kcol" aria-label="${col.name}"><header class="kcol-head">${col.name}<span>${cards.length}</span></header>
      ${cards.length ? cards.map(card) : html`<p class="muted small kcol-empty">Kosong</p>`}</section>`;
  })}</div>`);
}

function renderTable({ items, total, page, per_page }) {
  if (!items.length) { mount($('#boardView'), html`<div class="list-card">${emptyState('Tidak ada tiket', 'Ubah filter untuk melihat tiket lain.')}</div>`); return; }
  const from = (page - 1) * per_page + 1;
  const to = from + items.length - 1;
  mount($('#boardView'), html`
    <div class="table-wrap"><table class="table">
      <caption class="sr-only">Daftar tiket</caption><thead><tr><th scope="col">Tiket</th><th scope="col">Pemohon</th><th scope="col">Kelompok</th><th scope="col">Prioritas</th><th scope="col">Status</th><th scope="col">Penanggung jawab</th><th scope="col">Diperbarui</th></tr></thead>
      <tbody>${items.map((t) => html`<tr data-id="${t.id}">
        <td><div class="cell-title">${t.title}</div><span class="muted num small">${t.ticket_no}</span></td>
        <td>${t.requester_name}</td><td>${t.group_name}</td><td>${priorityPill(t.priority_label, t.priority_tone)}</td><td>${badge(t.status_label, t.status_tone)}</td>
        <td>${t.assignee_name ?? html`<span class="muted">Belum ditugaskan</span>`}</td><td class="muted">${timeAgo(t.updated_at)}</td></tr>`)}</tbody>
    </table></div>
    <div class="pager"><span>Menampilkan ${from} sampai ${to} dari ${total}</span><span class="btn-row">
      <button class="btn btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
      <button class="btn btn-sm" data-page="${page + 1}" ${to >= total ? 'disabled' : ''}>Berikutnya</button></span></div>`);
}

async function loadStats() {
  const s = await api.get('/api/tickets/summary');
  mount($('#statGrid'), html`
    <div class="stat is-hero"><strong>${s.active}</strong><span>Tiket aktif</span></div>
    <div class="stat"><strong>${s.mine}</strong><span>Ditugaskan ke saya</span></div>
    <div class="stat"><strong>${s.waiting}</strong><span>Menunggu konfirmasi</span></div>
    <div class="stat ${s.overdue ? 'is-alert' : ''}"><strong>${s.overdue}</strong><span>Melewati SLA</span></div>`);
}

async function load() {
  const common = { q: state.q, group_id: state.group_id, priority_id: state.priority_id, assignee: state.assignee, tag_id: state.tag_id };
  const params = state.view === 'kanban'
    ? { ...common, scope: 'active', sort: 'priority', per_page: 200 }
    : { ...common, status: state.status, sort: 'updated', page: state.page, per_page: PAGE_SIZE };
  try {
    const result = await api.get('/api/tickets', params);
    if (state.view === 'kanban') renderKanban(result.items); else renderTable(result);
  } catch { /* galat sudah ditangani api_client */ }
}
const reload = () => { load(); loadStats().catch(() => {}); };

const options = (label, items) => html`<option value="">${label}</option>${items.map(([value, text]) => html`<option value="${value}">${text}</option>`)}`;

async function main() {
  initShell();
  mount($('#boardView'), html`<div class="list-card">${skeleton(4)}</div>`);
  meta = await loadMeta();
  const form = await initTicketForm({ onCreated: reload });
  initTicketDrawer({ onChanged: reload });

  mount($('#groupFilter'), options('Semua kelompok', meta.groups.map((g) => [g.id, g.name])));
  mount($('#priorityFilter'), options('Semua prioritas', meta.priorities.map((p) => [p.id, p.label])));
  mount($('#tagFilter'), options('Semua tag', meta.tags.map((g) => [g.id, g.name])));
  mount($('#statusFilter'), options('Semua status', [...new Set(meta.statuses.map((s) => s.label))].map((l) => [l, l])));
  for (const [selector, key] of [['#groupFilter', 'group_id'], ['#priorityFilter', 'priority_id'], ['#assigneeFilter', 'assignee'], ['#tagFilter', 'tag_id'], ['#statusFilter', 'status']]) {
    $(selector).addEventListener('change', (event) => { state[key] = event.target.value; state.page = 1; load(); });
  }
  $('#searchInput').addEventListener('input', debounce((event) => { state.q = event.target.value.trim(); state.page = 1; load(); }));
  $('#newTicketBtn').addEventListener('click', () => form.open({ asInternal: true }));

  $('#viewToggle').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    state.view = button.dataset.view;
    state.page = 1;
    $$('#viewToggle button').forEach((b) => b.classList.toggle('is-active', b === button));
    $('#statusFilter').hidden = state.view !== 'table';
    load();
  });

  const board = $('#boardView');
  board.addEventListener('click', (event) => {
    const pager = event.target.closest('[data-page]');
    if (pager) { state.page = Number(pager.dataset.page); load(); return; }
    const item = event.target.closest('[data-id]');
    if (item) openTicket(Number(item.dataset.id));
  });
  board.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.kcard')) { event.preventDefault(); openTicket(Number(event.target.dataset.id)); }
  });
  reload();
  openFromQuery();
}
main();
