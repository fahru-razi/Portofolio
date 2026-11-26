/** Pusat notifikasi (lonceng): hitung belum dibaca, daftar, tandai dibaca, dan hapus. */
import { api } from './api_client.js';
import { $, html, mount, timeAgo, icon, emptyState, loadMeta, can, toast } from './ui_kit.js';

export function initNotifications() {
  const button = $('#notifBtn');
  const count = $('#notifCount');
  const dialog = $('#notifDialog');
  let latest = { items: [], unread: 0 };

  const draw = () => mount($('#notifBody'), latest.items.length
    ? html`<ul class="notif-list">${latest.items.map((n) => html`<li class="notif-item ${n.is_read ? '' : 'is-unread'}">
        <button type="button" class="grow link-reset" data-open="${n.ticket_id ?? ''}" data-id="${n.id}">${n.message}<small>${timeAgo(n.created_at)}${n.is_read ? '' : ', belum dibaca'}</small></button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-delete="${n.id}" aria-label="Hapus notifikasi">${icon('x')}</button></li>`)}</ul>`
    : emptyState('Tidak ada notifikasi', 'Pembaruan tiket Anda akan muncul di sini.', 'inbox'));

  async function refresh(render = false) {
    try { latest = await api.get('/api/notifications'); } catch { return; }
    count.textContent = latest.unread > 99 ? '99+' : latest.unread;
    count.hidden = latest.unread === 0;
    button.setAttribute('aria-label', `Notifikasi, ${latest.unread} belum dibaca`);
    if (render) draw();
  }

  button.addEventListener('click', () => { dialog.showModal(); refresh(true); });
  $('#notifReadAll').addEventListener('click', async () => { await api.post('/api/notifications/read', {}); refresh(true); });
  $('#notifClear').addEventListener('click', async () => { await api.delete('/api/notifications'); refresh(true); toast('Notifikasi dibersihkan.', 'success'); });
  dialog.addEventListener('click', async (event) => {
    const del = event.target.closest('[data-delete]');
    if (del) { await api.delete(`/api/notifications/${del.dataset.delete}`); refresh(true); return; }
    const open = event.target.closest('[data-open]');
    if (!open) return;
    await api.post('/api/notifications/read', { ids: [Number(open.dataset.id)] });
    if (open.dataset.open) {
      const meta = await loadMeta();
      location.assign(`${can(meta, 'tickets.view_all') ? '/admin/antrean' : '/portal'}?open=${open.dataset.open}`);
    }
  });
  refresh();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 90000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}
