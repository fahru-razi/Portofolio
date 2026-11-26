/** Bagian Pengaturan berbasis panel CRUD generik: departemen, tag, hari libur, template balasan, tim, dan peran & izin. */
import { api } from './api_client.js';
import { html, loadMeta, fmtDate, badge, toast } from './ui_kit.js';
import { crudPanel } from './crud_panel.js';
import { openForm } from './form_dialog.js';

const TONES = [['neutral', 'Abu-abu'], ['info', 'Biru'], ['violet', 'Ungu'], ['warn', 'Kuning'], ['danger', 'Merah'], ['success', 'Hijau']].map(([value, label]) => ({ value, label }));
const inactive = (item) => (item.is_active === false ? badge('Nonaktif', 'neutral') : '');

export const SECTIONS = {
  departments: (root) => crudPanel({
    root, endpoint: '/api/departments', noun: 'departemen', title: 'Departemen', searchable: true,
    intro: 'Unit organisasi pemohon. Dipakai pada profil pengguna dan analitik tiket per departemen.',
    row: (d) => ({ title: d.name, sub: `${d.user_count} pengguna`, badge: inactive(d) }),
    fields: [{ name: 'name', label: 'Nama departemen', required: true }, { name: 'is_active', label: 'Aktif', type: 'checkbox', default: true }],
  }),

  tags: (root) => crudPanel({
    root, endpoint: '/api/tags', noun: 'tag', title: 'Tag tiket', searchable: true,
    intro: 'Label bebas untuk mengelompokkan tiket lintas kelompok (mis. jaringan, vendor, garansi). Dipasang agen pada tiket dan bisa dipakai sebagai filter.',
    row: (g) => ({ title: html`<span class="tag-chip tone-${g.tone}">${g.name}</span>`, sub: `${g.ticket_count} tiket` }),
    fields: [{ name: 'name', label: 'Nama tag', required: true }, { name: 'tone', label: 'Warna', type: 'select', options: TONES, default: 'neutral' }],
  }),

  holidays: (root) => crudPanel({
    root, endpoint: '/api/holidays', noun: 'hari libur', title: 'Hari libur', searchable: true,
    intro: 'Hari libur tidak dihitung dalam target SLA (mode jam kerja) maupun penutupan otomatis tiket.',
    row: (h) => ({ title: html`<span class="num">${fmtDate(h.day)}</span>`, sub: h.name }),
    fields: [{ name: 'day', label: 'Tanggal', type: 'date', required: true }, { name: 'name', label: 'Nama hari libur', required: true }],
  }),

  canned: (root) => crudPanel({
    root, endpoint: '/api/canned', noun: 'template', addLabel: 'Tambah template', title: 'Template balasan', searchable: true,
    intro: 'Jawaban siap pakai yang dapat disisipkan agen saat membalas tiket.',
    row: (c) => ({ title: c.title, sub: c.body.length > 110 ? `${c.body.slice(0, 110)}…` : c.body }),
    fields: [{ name: 'title', label: 'Judul', required: true }, { name: 'body', label: 'Isi balasan', type: 'textarea', rows: 6, required: true }],
  }),

  teams: (root) => crudPanel({
    root, endpoint: '/api/teams', noun: 'tim', title: 'Tim penanganan',
    intro: 'Kelompok agen. Kelompok tiket dapat diarahkan ke satu tim sehingga tiket baru dibagi bergiliran di antara anggotanya.',
    row: (t) => ({ title: t.name, sub: t.members.length ? `Anggota: ${t.members.map((m) => m.full_name).join(', ')}` : 'Belum ada anggota (tiket dibagi ke semua agen)', badge: inactive(t) }),
    fields: [{ name: 'name', label: 'Nama tim', required: true }, { name: 'description', label: 'Deskripsi' }, { name: 'is_active', label: 'Aktif', type: 'checkbox', default: true }],
    extraActions: () => [{ act: 'members', icon: 'users', label: 'Atur anggota' }],
    onAction: async (act, team, reload) => {
      if (act !== 'members') return;
      const staff = await api.get('/api/people', { kind: 'staff' });
      openForm({
        title: `Anggota ${team.name}`, intro: 'Hanya pengguna dengan izin menangani tiket yang dapat menjadi anggota.',
        fields: [{ name: 'user_ids', label: 'Anggota tim', type: 'multicheck', numeric: true, options: staff.map((s) => ({ value: s.id, label: s.full_name })) }],
        values: { user_ids: team.members.map((m) => m.id) },
        onSubmit: async (data) => { await api.put(`/api/teams/${team.id}/members`, data); toast('Anggota tim disimpan.', 'success'); await reload(); },
      });
    },
  }),

  roles: async (root) => {
    const meta = await loadMeta();
    const options = Object.entries(meta.permission_labels).map(([value, label]) => ({ value, label }));
    return crudPanel({
      root, endpoint: '/api/roles', noun: 'peran', title: 'Peran & izin',
      intro: 'Peran adalah kumpulan izin. Buat peran khusus (mis. Supervisor yang hanya melihat analitik) sesuai struktur perusahaan Anda.',
      row: (r) => ({
        title: html`${r.name} ${r.is_system ? html`<span class="tag">Bawaan</span>` : ''}`,
        sub: `${r.user_count} pengguna, ${r.permissions.length} izin${r.description ? `. ${r.description}` : ''}`,
      }),
      fields: (role) => [
        { name: 'name', label: 'Nama peran', required: true }, { name: 'description', label: 'Deskripsi' },
        { name: 'permissions', label: role?.is_locked ? 'Izin (dikunci agar aplikasi selalu punya administrator)' : 'Izin', type: 'multicheck', options, disabled: Boolean(role?.is_locked) },
      ],
      toPayload: (data, role) => { if (role?.is_locked) delete data.permissions; return data; },
    });
  },
};
