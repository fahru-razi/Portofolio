import { api } from './api_client.js';
import { $, html, mount, initShell, toast, debounce, timeAgo, avatar, badge, icon, confirmAction, emptyState, skeleton } from './ui_kit.js';
import { openForm } from './form_dialog.js';

const state = { q: '', role_id: '', active: '', page: 1, items: [], total: 0, per_page: 25, roles: [], departments: [] };

function renderTable() {
  const { items, total, page, per_page } = state;
  if (!items.length) { mount($('#userTable'), html`<div class="list-card">${emptyState('Tidak ada pengguna', 'Ubah filter atau tambahkan pengguna baru.', 'users')}</div>`); return; }
  const to = (page - 1) * per_page + items.length;
  mount($('#userTable'), html`
    <div class="table-wrap"><table class="table"><caption class="sr-only">Daftar pengguna</caption>
      <thead><tr><th scope="col">Nama</th><th scope="col">Peran</th><th scope="col">Departemen</th><th scope="col">Tiket aktif</th><th scope="col">Akun</th><th scope="col">Terakhir masuk</th><th scope="col"><span class="sr-only">Aksi</span></th></tr></thead>
      <tbody>${items.map((u) => html`<tr>
        <td><div class="btn-row">${avatar(u.full_name)}<div><div class="cell-title">${u.full_name}</div><span class="muted small">${u.email}</span></div></div></td>
        <td>${u.role_name}</td><td>${u.department ?? '-'}</td><td class="num">${u.open_assigned || '-'}</td>
        <td>${badge(u.is_active ? 'Aktif' : 'Nonaktif', u.is_active ? 'success' : 'neutral')}</td>
        <td class="muted">${u.last_login_at ? timeAgo(u.last_login_at) : 'Belum pernah'}</td>
        <td><span class="row-actions">
          <button class="btn btn-ghost btn-icon btn-sm" data-edit="${u.id}" title="Ubah" aria-label="Ubah ${u.full_name}">${icon('edit')}</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-toggle="${u.id}" title="${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}" aria-label="${u.is_active ? 'Nonaktifkan' : 'Aktifkan'} ${u.full_name}">${icon(u.is_active ? 'x' : 'check')}</button>
          <button class="btn btn-ghost btn-icon btn-sm" data-delete="${u.id}" title="Hapus" aria-label="Hapus ${u.full_name}">${icon('trash')}</button></span></td></tr>`)}</tbody>
    </table></div>
    <div class="pager"><span>Menampilkan ${(page - 1) * per_page + 1} sampai ${to} dari ${total}</span><span class="btn-row">
      <button class="btn btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
      <button class="btn btn-sm" data-page="${page + 1}" ${to >= total ? 'disabled' : ''}>Berikutnya</button></span></div>`);
}

async function load() {
  const result = await api.get('/api/admin/users', { q: state.q, role_id: state.role_id, active: state.active, page: state.page, per_page: state.per_page });
  Object.assign(state, { items: result.items, total: result.total });
  renderTable();
}

function userForm(user = null) {
  const fields = [
    { name: 'full_name', label: 'Nama lengkap', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true, disabled: Boolean(user) },
    { name: 'role_id', label: 'Peran', type: 'select', numeric: true, required: true, options: state.roles.map((r) => ({ value: r.id, label: r.name })), hint: 'Peran menentukan fitur yang dapat diakses. Atur di Pengaturan > Peran & izin.' },
    { name: 'department_id', label: 'Departemen', type: 'select', numeric: true, options: [{ value: '', label: 'Tanpa departemen' }, ...state.departments.map((d) => ({ value: d.id, label: d.name }))] },
    { name: 'password', label: user ? 'Kata sandi baru (kosongkan bila tidak diubah)' : 'Kata sandi', type: 'password', required: !user, hint: 'Sesuai kebijakan panjang minimum kata sandi.' },
  ];
  openForm({
    title: user ? 'Ubah pengguna' : 'Tambah pengguna',
    fields: user ? [...fields, { name: 'is_active', label: 'Akun aktif', type: 'checkbox', hint: 'Akun nonaktif tidak dapat masuk.' }] : fields,
    values: user ?? {},
    onSubmit: async (data) => {
      if (user) { delete data.email; if (!data.password) delete data.password; await api.patch(`/api/admin/users/${user.id}`, data); }
      else await api.post('/api/admin/users', data);
      toast('Pengguna disimpan.', 'success');
      await load();
    },
  });
}

async function run(action, success) {
  try { await action(); toast(success, 'success'); await load(); } catch (err) { toast(err.message, 'error'); }
}

async function main() {
  initShell();
  mount($('#userTable'), html`<div class="list-card">${skeleton(4)}</div>`);
  const [roles, departments] = await Promise.all([api.get('/api/roles'), api.get('/api/departments', { per_page: 200 })]);
  state.roles = roles.items;
  state.departments = departments.items.filter((d) => d.is_active);
  mount($('#roleFilter'), html`<option value="">Semua peran</option>${state.roles.map((r) => html`<option value="${r.id}">${r.name}</option>`)}`);

  $('#addUserBtn').addEventListener('click', () => userForm());
  $('#searchInput').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  $('#roleFilter').addEventListener('change', (e) => { state.role_id = e.target.value; state.page = 1; load(); });
  $('#activeFilter').addEventListener('change', (e) => { state.active = e.target.value; state.page = 1; load(); });
  $('#userTable').addEventListener('click', async (event) => {
    const find = (id) => state.items.find((u) => u.id === Number(id));
    const edit = event.target.closest('[data-edit]');
    const toggle = event.target.closest('[data-toggle]');
    const del = event.target.closest('[data-delete]');
    const pager = event.target.closest('[data-page]');
    if (edit) userForm(find(edit.dataset.edit));
    else if (pager) { state.page = Number(pager.dataset.page); load(); }
    else if (toggle) {
      const user = find(toggle.dataset.toggle);
      const ok = await confirmAction({
        title: user.is_active ? `Nonaktifkan ${user.full_name}?` : `Aktifkan ${user.full_name}?`,
        message: user.is_active ? `Pengguna tidak dapat masuk lagi${user.open_assigned ? `, dan ${user.open_assigned} tiket aktif perlu dialihkan ke agen lain` : ''}.` : 'Pengguna dapat masuk kembali.',
        confirmLabel: user.is_active ? 'Nonaktifkan' : 'Aktifkan', danger: user.is_active,
      });
      if (ok) run(() => api.patch(`/api/admin/users/${user.id}`, { is_active: !user.is_active }), user.is_active ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.');
    } else if (del) {
      const user = find(del.dataset.delete);
      if (await confirmAction({ title: `Hapus ${user.full_name}?`, message: 'Akun dihapus permanen. Akun yang sudah punya riwayat tiket tidak dapat dihapus; nonaktifkan saja.', confirmLabel: 'Hapus', danger: true })) {
        run(() => api.delete(`/api/admin/users/${user.id}`), 'Akun dihapus.');
      }
    }
  });
  load().catch(() => {});
}
main();
