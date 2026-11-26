import { api } from './api_client.js';
import { $, html, mount, initShell, loadMeta, can, toast, icon, badge, fmtDate, debounce, confirmAction, emptyState, skeleton } from './ui_kit.js';
import { openForm } from './form_dialog.js';

const state = { q: '', items: [], manage: false };
const articleFields = [
  { name: 'title', label: 'Judul', required: true }, { name: 'category', label: 'Kategori', hint: 'Contoh: Jaringan, Akun, Aplikasi' },
  { name: 'body', label: 'Isi artikel', type: 'textarea', rows: 10, required: true }, { name: 'is_published', label: 'Terbitkan untuk semua pengguna', type: 'checkbox', hint: 'Draf hanya terlihat oleh pengelola artikel.' },
];

function draw() {
  mount($('#kbList'), state.items.length ? html`<div class="kb-grid">${state.items.map((a) => html`<button type="button" class="kb-card" data-id="${a.id}">
      <span class="btn-row">${a.category ? html`<span class="tag">${a.category}</span>` : ''}${a.is_published ? '' : badge('Draf', 'warn')}</span>
      <h3>${a.title}</h3><p>${a.body}</p><small class="muted">Diperbarui ${fmtDate(a.updated_at)}</small></button>`)}</div>`
    : html`<div class="list-card">${emptyState(state.q ? 'Artikel tidak ditemukan' : 'Belum ada artikel', state.q ? 'Coba kata kunci lain, atau buat tiket bila butuh bantuan.' : '', 'inbox')}</div>`);
}

async function load() {
  state.items = (await api.get('/api/kb', { q: state.q, per_page: 60 })).items;
  draw();
}

function showArticle(article) {
  const dialog = $('#articleDialog');
  $('#articleTitle').textContent = article.title;
  $('#articleMeta').textContent = `${article.category ? `${article.category}, ` : ''}diperbarui ${fmtDate(article.updated_at)}${article.is_published ? '' : ' (draf)'}`;
  $('#articleBody').textContent = article.body;
  mount($('#articleFoot'), state.manage ? html`<button type="button" class="btn btn-danger" data-do="delete">${icon('trash')}Hapus</button><button type="button" class="btn" data-do="edit">${icon('edit')}Ubah</button>`
    : html`<a class="btn btn-primary" href="/portal">Tidak terbantu? Buat tiket</a>`);
  dialog.dataset.id = article.id;
  if (!dialog.open) dialog.showModal();
}

const form = (article) => openForm({
  title: article ? 'Ubah artikel' : 'Artikel baru', fields: articleFields, values: article ?? { is_published: true },
  onSubmit: async (data) => {
    if (article) await api.patch(`/api/kb/${article.id}`, data); else await api.post('/api/kb', data);
    toast('Artikel disimpan.', 'success');
    $('#articleDialog').close();
    await load();
  },
});

async function main() {
  initShell();
  const meta = await loadMeta();
  state.manage = can(meta, 'kb.manage');
  mount($('#kbList'), html`<div class="list-card">${skeleton(3)}</div>`);
  if (state.manage) {
    mount($('#kbActions'), html`<button class="btn btn-primary" id="newArticle">${icon('plus')}Artikel baru</button>`);
    $('#newArticle').addEventListener('click', () => form(null));
  }
  $('#kbSearch').addEventListener('input', debounce((event) => { state.q = event.target.value.trim(); load(); }));
  $('#kbList').addEventListener('click', (event) => {
    const card = event.target.closest('[data-id]');
    if (card) showArticle(state.items.find((a) => a.id === Number(card.dataset.id)));
  });
  $('#articleFoot').addEventListener('click', async (event) => {
    const action = event.target.closest('[data-do]')?.dataset.do;
    const article = state.items.find((a) => a.id === Number($('#articleDialog').dataset.id));
    if (action === 'edit') { $('#articleDialog').close(); form(article); }
    if (action === 'delete' && await confirmAction({ title: 'Hapus artikel?', message: `"${article.title}" dihapus permanen.`, confirmLabel: 'Hapus', danger: true })) {
      try { await api.delete(`/api/kb/${article.id}`); $('#articleDialog').close(); toast('Artikel dihapus.', 'success'); await load(); } catch (err) { toast(err.message, 'error'); }
    }
  });
  await load();
  const open = Number(new URLSearchParams(location.search).get('open'));
  const target = state.items.find((a) => a.id === open);
  if (target) showArticle(target);
}
main();
