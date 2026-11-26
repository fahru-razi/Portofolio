import { api } from './api_client.js';
import { $, $$, html, mount, initShell, loadMeta, badge, priorityPill, timeAgo, debounce, skeleton, emptyState } from './ui_kit.js';
import { initTicketForm } from './ticket_form_builder.js';
import { initTicketDrawer, openTicket, openFromQuery } from './ticket_drawer.js';

const PAGE_SIZE = 15;
const FILTERS = { all: {}, active: { scope: 'active' }, waiting: { kind: 'confirm' }, done: { kind: 'done' } };
const state = { filter: 'all', q: '', page: 1, total: 0, items: [] };

const row = (t) => html`<button type="button" class="ticket-row ${t.status_kind === 'confirm' && !t.is_internal ? 'needs-action' : ''}" data-id="${t.id}">
  <span class="tr-main"><strong>${t.title}</strong><span class="tr-sub"><span class="num">${t.ticket_no}</span><span>${t.group_name}</span></span></span>
  <span class="tr-meta">${priorityPill(t.priority_label, t.priority_tone)}${badge(t.status_label, t.status_tone)}</span>
  <span class="tr-time muted">${timeAgo(t.updated_at)}</span>
</button>`;

function renderList() {
  const list = $('#ticketList');
  mount(list, state.items.length ? html`${state.items.map(row)}`
    : emptyState('Belum ada tiket', state.filter === 'all' && !state.q ? 'Buat tiket pertama Anda untuk meminta bantuan tim IT.' : 'Tidak ada tiket yang cocok dengan filter ini.', 'ticket'));
  $('#loadMoreBtn').hidden = state.items.length >= state.total;
}

async function loadStats() {
  const s = await api.get('/api/tickets/summary');
  mount($('#statGrid'), html`
    <div class="stat is-hero"><strong>${s.active}</strong><span>Tiket berjalan</span></div>
    <div class="stat ${s.waiting ? 'is-alert' : ''}"><strong>${s.waiting}</strong><span>Menunggu konfirmasi Anda</span></div>
    <div class="stat"><strong>${s.finished}</strong><span>Selesai</span></div>`);
}

async function load(page) {
  const result = await api.get('/api/tickets', { ...FILTERS[state.filter], q: state.q, page, per_page: PAGE_SIZE });
  Object.assign(state, { page, total: result.total, items: page === 1 ? result.items : [...state.items, ...result.items] });
  renderList();
}
const reload = () => Promise.all([load(1), loadStats()]).catch(() => {});

async function main() {
  initShell();
  mount($('#ticketList'), skeleton(4));
  await loadMeta();
  const form = await initTicketForm({ onCreated: (ticket) => { reload(); openTicket(ticket.id); } });
  initTicketDrawer({ onChanged: reload });

  $('#newTicketBtn').addEventListener('click', () => form.open());
  $('#filterChips').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    $$('#filterChips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    load(1);
  });
  $('#searchInput').addEventListener('input', debounce((event) => { state.q = event.target.value.trim(); load(1); }));
  $('#ticketList').addEventListener('click', (event) => {
    const item = event.target.closest('[data-id]');
    if (item) openTicket(Number(item.dataset.id));
  });
  $('#loadMoreBtn').addEventListener('click', () => load(state.page + 1));
  await reload();
  openFromQuery();
}
main();
