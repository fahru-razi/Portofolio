/** Halaman Pengaturan: navigasi bagian + CRUD kelompok & field, alur status (dengan diagram), prioritas, dan pengaturan umum. */
import { api } from './api_client.js';
import { $, $$, html, raw, mount, initShell, toast, badge, icon, confirmAction, resetMeta, skeleton, emptyState } from './ui_kit.js';
import { openForm } from './form_dialog.js';
import { renderWorkflowDiagram } from './workflow_diagram.js';
import { SECTIONS } from './settings_sections.js';

const TONES = [['neutral', 'Abu-abu'], ['info', 'Biru'], ['violet', 'Ungu'], ['warn', 'Kuning'], ['danger', 'Merah'], ['success', 'Hijau']].map(([value, label]) => ({ value, label }));
const FIELD_TYPES = [['text', 'Teks singkat'], ['textarea', 'Teks panjang'], ['select', 'Pilihan (dropdown)'], ['number', 'Angka'], ['date', 'Tanggal'], ['file', 'Lampiran berkas']].map(([value, label]) => ({ value, label }));
const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label]));
const NAV = [
  { heading: 'Umum', items: [['general', 'Pengaturan umum', 'gear']] },
  { heading: 'Layanan', items: [['groups', 'Kelompok & formulir', 'layers'], ['workflows', 'Alur status', 'flow'], ['priorities', 'Prioritas & SLA', 'flag'], ['holidays', 'Hari libur', 'calendar'], ['canned', 'Template balasan', 'file'], ['tags', 'Tag', 'tag']] },
  { heading: 'Organisasi & akses', items: [['teams', 'Tim', 'users'], ['departments', 'Departemen', 'building'], ['roles', 'Peran & izin', 'shield']] },
];
const root = () => $('#settingsRoot');
const state = { section: 'general', sel: null, data: null };

// ------------------------------------------------------------------ util
const btn = (name, act, label, data = {}) => html`<button type="button" class="btn btn-ghost btn-icon btn-sm" data-act="${act}" title="${label}" aria-label="${label}"
  ${raw(Object.entries(data).map(([k, v]) => `data-${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' '))}>${icon(name)}</button>`;
const moveButtons = (kind, id, what) => html`${btn('up', 'move', `Naikkan ${what}`, { kind, id, dir: -1 })}${btn('down', 'move', `Turunkan ${what}`, { kind, id, dir: 1 })}`;
const header = (title, text, actions = '') => html`<div class="panel-head"><div><h3>${title}</h3>${text ? html`<p class="muted small">${text}</p>` : ''}</div><div class="btn-row">${actions}</div></div>`;
const find = (list, id) => list.find((x) => x.id === Number(id));

async function perform(action, success) {
  try { await action(); if (success) toast(success, 'success'); resetMeta(); await render(); } catch (err) { toast(err.message, 'error'); }
}
const submitter = (action, success) => async (data) => { await action(data); toast(success, 'success'); resetMeta(); await render(); };
async function reorder(kind, ids, id, dir) {
  const index = ids.indexOf(id);
  const target = index + dir;
  if (target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target], ids[index]];
  await perform(() => api.post('/api/settings/reorder', { kind, ids }));
}
const confirmDelete = (title, message) => confirmAction({ title, message, confirmLabel: 'Hapus', danger: true });

// ------------------------------------------------------------------ Umum
async function renderGeneral() {
  const { spec, days } = await api.get('/api/settings/general');
  const control = (s) => {
    const name = raw(`name="${s.key}" id="s-${s.key}"`);
    if (s.type === 'bool') return html`<label class="switch-row"><span><b>${s.label}</b></span><span class="switch"><input type="checkbox" ${name} ${raw(s.value ? 'checked' : '')}><i></i></span></label>`;
    if (s.type === 'weekdays') return html`<fieldset class="field"><legend>${s.label}</legend><div class="day-chips">${days.map((d) => html`<label class="check-chip"><input type="checkbox" name="${s.key}" value="${d.value}" ${raw(s.value.includes(d.value) ? 'checked' : '')}><span>${d.label}</span></label>`)}</div></fieldset>`;
    const input = s.type === 'choice' ? html`<select ${name}>${s.choices.map((c) => html`<option value="${c.value}" ${raw(c.value === s.value ? 'selected' : '')}>${c.label}</option>`)}</select>`
      : s.type === 'int' ? html`<input type="number" ${name} value="${s.value}" min="${s.min ?? 0}" max="${s.max ?? ''}" required>`
      : html`<input type="${s.type === 'time' ? 'time' : 'text'}" ${name} value="${s.value}" required>`;
    return html`<div class="field"><label for="s-${s.key}"><span>${s.label}</span></label>${input}${s.hint ? html`<small>${s.hint}</small>` : ''}</div>`;
  };
  const groups = [...new Set(spec.map((s) => s.group))];
  mount(root(), html`<form id="generalForm" class="panel">${header('Pengaturan umum', 'Perubahan berlaku segera tanpa restart aplikasi.')}
    ${groups.map((g) => html`<div class="settings-group"><h3>${g}</h3><div class="grid-2">${spec.filter((s) => s.group === g).map(control)}</div></div>`)}
    <div class="btn-row"><button class="btn btn-primary">Simpan pengaturan</button></div></form>`);
  $('#generalForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {};
    for (const s of spec) {
      if (s.type === 'bool') body[s.key] = form.elements[s.key].checked;
      else if (s.type === 'weekdays') body[s.key] = $$(`input[name="${s.key}"]:checked`, form).map((i) => Number(i.value));
      else body[s.key] = s.type === 'int' ? Number(form.elements[s.key].value) : form.elements[s.key].value;
    }
    try { await api.put('/api/settings/general', body); toast('Pengaturan disimpan.', 'success'); resetMeta(); document.documentElement.dataset.brand = body.brand; await render(); } catch (err) { toast(err.message, 'error'); }
  });
}

// ------------------------------------------------------------------ Prioritas
const priorityFields = [
  { name: 'label', label: 'Nama prioritas', required: true },
  { name: 'response_hours', label: 'Target respons pertama (jam)', type: 'number', required: true, min: 1, hint: 'Batas waktu agen pertama kali menanggapi tiket.' },
  { name: 'sla_hours', label: 'Target penyelesaian (jam)', type: 'number', required: true, min: 1, hint: 'Dihitung dalam jam kerja atau jam kalender sesuai Pengaturan umum.' },
  { name: 'tone', label: 'Warna', type: 'select', options: TONES, default: 'neutral' },
];
async function renderPriorities() {
  const items = await api.get('/api/settings/priorities');
  state.data = items;
  mount(root(), html`<section class="panel">${header('Prioritas & target SLA', 'Urutan dari prioritas terendah (atas) ke tertinggi (bawah). Mengubah target ikut memperbarui tiket yang masih berjalan.',
      html`<button class="btn btn-primary btn-sm" data-act="priority-new">${icon('plus')}Tambah prioritas</button>`)}
    <ul class="plain-list">${items.map((p) => html`<li class="item-row"><div class="grow"><strong>${badge(p.label, p.tone)} ${p.is_active ? '' : html`<span class="tag">Nonaktif</span>`}</strong>
      <small>Respons ${p.response_hours} jam, selesai ${p.sla_hours} jam, dipakai ${p.ticket_count} tiket</small></div>
      <div class="row-actions">${moveButtons('priorities', p.id, p.label)}${btn('edit', 'priority-edit', `Ubah ${p.label}`, { id: p.id })}${btn('trash', 'priority-delete', `Hapus ${p.label}`, { id: p.id })}</div></li>`)}</ul></section>`);
}

// ------------------------------------------------------------------ Kelompok & formulir
async function renderGroups() {
  const data = await api.get('/api/settings/groups');
  state.data = data;
  const groups = data.groups;
  if (!groups.some((g) => g.id === state.sel)) state.sel = groups[0]?.id ?? null;
  const group = groups.find((g) => g.id === state.sel);
  mount(root(), html`<div class="split">
    <aside class="card side-list" aria-label="Daftar kelompok"><div class="panel-head"><h3>Kelompok</h3><button class="btn btn-soft btn-sm" data-act="group-new">${icon('plus')}Baru</button></div>
      ${groups.length ? groups.map((g) => html`<div class="btn-row"><button class="side-item grow ${g.id === state.sel ? 'is-active' : ''}" data-act="group-select" data-id="${g.id}" ${raw(g.id === state.sel ? 'aria-current="true"' : '')}>
        <span class="grow"><strong>${g.name}</strong><small>${g.workflow_name}, ${g.fields.length} field${g.is_active ? '' : ', nonaktif'}</small></span></button>
        <span class="row-actions">${moveButtons('groups', g.id, g.name)}</span></div>`) : html`<p class="muted small">Belum ada kelompok.</p>`}</aside>
    <section class="panel">${group ? groupDetail(group) : emptyState('Belum ada kelompok', 'Buat kelompok pertama untuk membuka formulir permintaan.', 'layers')}</section></div>`);
}
function groupDetail(g) {
  return html`${header(g.name, g.description || 'Tanpa deskripsi', html`<button class="btn btn-sm" data-act="group-edit" data-id="${g.id}">${icon('edit')}Ubah</button>
      <button class="btn btn-sm btn-danger" data-act="group-delete" data-id="${g.id}">${icon('trash')}Hapus</button>`)}
    <p class="small muted">Alur status: <b>${g.workflow_name}</b>. Tim: <b>${g.team_name ?? 'semua agen'}</b>. ${g.ticket_count} tiket. ${g.is_active ? '' : 'Nonaktif.'}</p>
    <div class="panel-head"><h3>Isi formulir</h3><button class="btn btn-primary btn-sm" data-act="field-new" data-group="${g.id}">${icon('plus')}Tambah field</button></div>
    ${g.fields.length ? html`<ul class="plain-list">${g.fields.map((f) => html`<li class="item-row"><div class="grow"><strong>${f.label} ${f.is_required ? html`<span class="tag tag-danger">Wajib</span>` : ''}${f.links_asset ? html`<span class="tag">Tautkan aset</span>` : ''}${f.is_active ? '' : html`<span class="tag">Nonaktif</span>`}</strong>
        <small>${TYPE_LABEL[f.field_type]}${f.field_type === 'select' ? `: ${f.options.join(', ')}` : ''}</small></div>
      <div class="row-actions">${moveButtons('fields', f.id, f.label)}${btn('edit', 'field-edit', `Ubah ${f.label}`, { id: f.id, group: g.id })}${btn('trash', 'field-delete', `Hapus ${f.label}`, { id: f.id })}</div></li>`)}</ul>`
      : html`<p class="muted">Belum ada field. Pemohon hanya mengisi judul, deskripsi, dan prioritas.</p>`}`;
}
const groupFields = (workflows, teams) => [
  { name: 'name', label: 'Nama kelompok', required: true },
  { name: 'description', label: 'Deskripsi singkat', hint: 'Tampil pada pilihan kelompok saat membuat tiket.' },
  { name: 'workflow_id', label: 'Alur status', type: 'select', numeric: true, required: true,
    options: workflows.map((w) => ({ value: w.id, label: w.problems.length ? `${w.name} (belum lengkap)` : w.name, disabled: w.problems.length > 0 })), hint: 'Mengatur tahapan tiket. Dikelola di bagian Alur status.' },
  { name: 'team_id', label: 'Tim penanggung jawab', type: 'select', numeric: true, options: [{ value: '', label: 'Semua agen' }, ...teams.map((t) => ({ value: t.id, label: t.name }))], hint: 'Tiket baru dibagi di antara anggota tim ini.' },
  { name: 'is_active', label: 'Tampilkan di formulir', type: 'checkbox', default: true },
];
const fieldFields = [
  { name: 'label', label: 'Label field', required: true },
  { name: 'field_type', label: 'Tipe', type: 'select', options: FIELD_TYPES, default: 'text' },
  { name: 'options', label: 'Pilihan (satu per baris)', type: 'textarea', hint: 'Hanya untuk tipe Pilihan. Pilihan dapat diubah kapan saja.' },
  { name: 'placeholder', label: 'Teks petunjuk (opsional)' },
  { name: 'is_required', label: 'Wajib diisi', type: 'checkbox' },
  { name: 'links_asset', label: 'Tautkan ke inventaris aset', type: 'checkbox', hint: 'Untuk tipe Teks singkat: nilai dipakai sebagai ID aset sehingga riwayat perbaikan perangkat tercatat.' },
];

// ------------------------------------------------------------------ Alur status
async function renderWorkflows() {
  const data = await api.get('/api/settings/workflows');
  state.data = data;
  const { workflows, board_columns: columns, kinds } = data;
  const columnName = Object.fromEntries(columns.map((c) => [c.id, c.name]));
  mount(root(), html`
    <div class="hint-box">Perilaku sistem ditentukan oleh <b>jenis</b> status, bukan namanya: <b>Baru</b> saat tiket dibuat, <b>Tahap pengerjaan</b> setelah ditugaskan, <b>Jeda</b> saat menunggu pemohon, <b>Menunggu konfirmasi</b> bagi pemohon menyetujui atau menolak, <b>Dibuka kembali</b> bila ditolak, dan <b>Selesai</b>. Klik kotak pada diagram untuk mengubah status.</div>
    <div class="btn-row"><button class="btn btn-primary" data-act="workflow-new">${icon('plus')}Alur baru</button></div>
    ${workflows.map((w) => {
      const label = Object.fromEntries(w.statuses.map((s) => [s.id, s.label]));
      const transitions = Object.fromEntries(w.statuses.map((s) => [s.id, s.next_ids]));
      return html`<section class="panel" aria-label="Alur ${w.name}">
        ${header(w.name, `${w.description || 'Tanpa deskripsi'} Dipakai ${w.group_count} kelompok.`, html`
          <button class="btn btn-sm" data-act="status-new" data-id="${w.id}">${icon('plus')}Status</button>${btn('edit', 'workflow-edit', `Ubah alur ${w.name}`, { id: w.id })}${btn('trash', 'workflow-delete', `Hapus alur ${w.name}`, { id: w.id })}`)}
        ${w.problems.length ? html`<div class="problem" role="alert">${icon('alert')}<span>${w.problems.join(' ')}</span></div>` : ''}
        ${renderWorkflowDiagram(w.statuses, transitions, { interactive: true, workflowId: w.id, caption: `Diagram alur ${w.name}` })}
        <ul class="plain-list">${w.statuses.map((s) => html`<li class="item-row"><div class="grow"><strong>${badge(s.label, s.tone)}</strong>
          <small>${kinds[s.kind]}. Kolom: ${columnName[s.board_column_id] ?? 'tidak di papan'}. ${s.ticket_count} tiket.</small>
          ${s.next_ids.length ? html`<small>Dapat dipindah ke: ${s.next_ids.map((i) => label[i]).join(', ')}</small>` : ''}</div>
          <div class="row-actions">${btn('up', 'move-status', `Naikkan ${s.label}`, { id: s.id, wf: w.id, dir: -1 })}${btn('down', 'move-status', `Turunkan ${s.label}`, { id: s.id, wf: w.id, dir: 1 })}
            ${btn('flow', 'status-flow', `Atur perpindahan dari ${s.label}`, { id: s.id, wf: w.id })}${btn('edit', 'status-edit', `Ubah ${s.label}`, { id: s.id, wf: w.id })}${btn('trash', 'status-delete', `Hapus ${s.label}`, { id: s.id })}</div></li>`)}</ul>
      </section>`;
    })}
    <section class="panel">${header('Kolom papan', 'Kolom pada tampilan Kanban. Setiap status dihubungkan ke satu kolom (atau tidak ditampilkan).', html`<button class="btn btn-sm" data-act="column-new">${icon('plus')}Kolom</button>`)}
      <ul class="plain-list">${columns.map((c) => html`<li class="item-row"><div class="grow"><strong>${c.name}</strong><small>${c.status_count} status</small></div>
        <div class="row-actions">${moveButtons('board_columns', c.id, c.name)}${btn('edit', 'column-edit', `Ubah ${c.name}`, { id: c.id })}${btn('trash', 'column-delete', `Hapus ${c.name}`, { id: c.id })}</div></li>`)}</ul></section>`);
}
const statusFields = (kinds, columns) => [
  { name: 'label', label: 'Nama status', required: true },
  { name: 'kind', label: 'Jenis (menentukan perilaku sistem)', type: 'select', options: Object.entries(kinds).map(([value, label]) => ({ value, label })), default: 'progress' },
  { name: 'tone', label: 'Warna', type: 'select', options: TONES, default: 'neutral' },
  { name: 'board_column_id', label: 'Kolom di papan Kanban', type: 'select', numeric: true, options: [{ value: '', label: 'Tidak ditampilkan di papan' }, ...columns.map((c) => ({ value: c.id, label: c.name }))] },
];

// ------------------------------------------------------------------ aksi
const actions = {
  'priority-new': () => openForm({ title: 'Prioritas baru', fields: priorityFields, onSubmit: submitter((d) => api.post('/api/settings/priorities', d), 'Prioritas ditambahkan.') }),
  'priority-edit': ({ id }) => openForm({ title: 'Ubah prioritas', fields: [...priorityFields, { name: 'is_active', label: 'Aktif', type: 'checkbox', hint: 'Prioritas nonaktif tidak dapat dipilih pada tiket baru.' }],
    values: find(state.data, id), onSubmit: submitter((d) => api.patch(`/api/settings/priorities/${id}`, d), 'Prioritas diperbarui.') }),
  'priority-delete': async ({ id }) => { if (await confirmDelete('Hapus prioritas?', 'Prioritas yang sudah dipakai tiket tidak dapat dihapus; nonaktifkan saja.')) perform(() => api.delete(`/api/settings/priorities/${id}`), 'Prioritas dihapus.'); },

  'group-select': ({ id }) => { state.sel = Number(id); render(); },
  'group-new': () => openForm({ title: 'Kelompok baru', fields: groupFields(state.data.workflows, state.data.teams), onSubmit: async (d) => { const row = await api.post('/api/settings/groups', d); state.sel = row.id; toast('Kelompok ditambahkan.', 'success'); resetMeta(); await render(); } }),
  'group-edit': ({ id }) => openForm({ title: 'Ubah kelompok', fields: groupFields(state.data.workflows, state.data.teams), values: find(state.data.groups, id), onSubmit: submitter((d) => api.patch(`/api/settings/groups/${id}`, d), 'Kelompok diperbarui.') }),
  'group-delete': async ({ id }) => { if (await confirmDelete('Hapus kelompok?', 'Kelompok beserta field-nya dihapus. Kelompok yang sudah punya tiket tidak dapat dihapus; nonaktifkan saja.')) perform(() => api.delete(`/api/settings/groups/${id}`), 'Kelompok dihapus.'); },
  'field-new': ({ group }) => openForm({ title: 'Field baru', fields: fieldFields, onSubmit: submitter((d) => api.post(`/api/settings/groups/${group}/fields`, d), 'Field ditambahkan.') }),
  'field-edit': ({ id, group }) => {
    const field = find(find(state.data.groups, group).fields, id);
    openForm({ title: 'Ubah field', fields: [...fieldFields, { name: 'is_active', label: 'Tampilkan di formulir', type: 'checkbox' }],
      values: { ...field, options: field.options.join('\n') }, onSubmit: submitter((d) => api.patch(`/api/settings/fields/${id}`, d), 'Field diperbarui.') });
  },
  'field-delete': async ({ id }) => { if (await confirmDelete('Hapus field?', 'Isian lama pada tiket yang sudah ada tetap tersimpan dan terbaca.')) perform(() => api.delete(`/api/settings/fields/${id}`), 'Field dihapus.'); },

  'workflow-new': () => openForm({ title: 'Alur baru', intro: 'Alur baru dibuat dengan status awal Baru, Dikerjakan, dan Selesai. Tambah atau ubah sesuai kebutuhan.',
    fields: [{ name: 'name', label: 'Nama alur', required: true }, { name: 'description', label: 'Deskripsi' }], onSubmit: submitter((d) => api.post('/api/settings/workflows', d), 'Alur dibuat.') }),
  'workflow-edit': ({ id }) => openForm({ title: 'Ubah alur', fields: [{ name: 'name', label: 'Nama alur', required: true }, { name: 'description', label: 'Deskripsi' }],
    values: find(state.data.workflows, id), onSubmit: submitter((d) => api.patch(`/api/settings/workflows/${id}`, d), 'Alur diperbarui.') }),
  'workflow-delete': async ({ id }) => { if (await confirmDelete('Hapus alur?', 'Alur beserta statusnya dihapus. Alur yang masih dipakai kelompok tidak dapat dihapus.')) perform(() => api.delete(`/api/settings/workflows/${id}`), 'Alur dihapus.'); },
  'status-new': ({ id }) => openForm({ title: 'Status baru', fields: statusFields(state.data.kinds, state.data.board_columns), onSubmit: submitter((d) => api.post(`/api/settings/workflows/${id}/statuses`, d), 'Status ditambahkan.') }),
  'status-edit': ({ id, wf }) => openForm({ title: 'Ubah status', fields: statusFields(state.data.kinds, state.data.board_columns),
    values: find(find(state.data.workflows, wf).statuses, id), onSubmit: submitter((d) => api.patch(`/api/settings/statuses/${id}`, d), 'Status diperbarui.') }),
  'status-delete': async ({ id }) => { if (await confirmDelete('Hapus status?', 'Status yang sedang dipakai tiket tidak dapat dihapus.')) perform(() => api.delete(`/api/settings/statuses/${id}`), 'Status dihapus.'); },
  'status-flow': ({ id, wf }) => {
    const workflow = find(state.data.workflows, wf);
    const status = find(workflow.statuses, id);
    openForm({ title: `Perpindahan dari "${status.label}"`, intro: 'Pilih status tujuan yang boleh dipilih agen dari status ini. Perpindahan lain (penugasan, balasan pemohon, konfirmasi, tutup otomatis) dijalankan sistem dan tampil sebagai garis putus-putus pada diagram.',
      fields: [{ name: 'to', label: 'Dapat dipindah ke', type: 'multicheck', numeric: true, options: workflow.statuses.filter((s) => s.kind !== 'new' && s.id !== status.id).map((s) => ({ value: s.id, label: s.label })) }],
      values: { to: status.next_ids }, onSubmit: submitter((d) => api.put(`/api/settings/statuses/${id}/transitions`, d), 'Perpindahan disimpan.') });
  },
  'column-new': () => openForm({ title: 'Kolom baru', fields: [{ name: 'name', label: 'Nama kolom', required: true }], onSubmit: submitter((d) => api.post('/api/settings/board-columns', d), 'Kolom ditambahkan.') }),
  'column-edit': ({ id }) => openForm({ title: 'Ubah kolom', fields: [{ name: 'name', label: 'Nama kolom', required: true }], values: find(state.data.board_columns, id), onSubmit: submitter((d) => api.patch(`/api/settings/board-columns/${id}`, d), 'Kolom diperbarui.') }),
  'column-delete': async ({ id }) => { if (await confirmDelete('Hapus kolom?', 'Status yang memakai kolom ini tidak akan tampil di papan sampai dihubungkan ke kolom lain.')) perform(() => api.delete(`/api/settings/board-columns/${id}`), 'Kolom dihapus.'); },

  move: ({ kind, id, dir }) => {
    if (kind === 'fields') {
      const group = state.data.groups.find((g) => g.fields.some((f) => f.id === Number(id)));
      return reorder(kind, group.fields.map((f) => f.id), Number(id), Number(dir));
    }
    const lists = { priorities: state.data, groups: state.data?.groups, board_columns: state.data?.board_columns };
    return reorder(kind, lists[kind].map((x) => x.id), Number(id), Number(dir));
  },
  'move-status': ({ id, wf, dir }) => reorder('statuses', find(state.data.workflows, wf).statuses.map((s) => s.id), Number(id), Number(dir)),
};

// ------------------------------------------------------------------ router bagian
const CUSTOM = { general: renderGeneral, priorities: renderPriorities, groups: renderGroups, workflows: renderWorkflows };
const ALL = [...NAV.flatMap((g) => g.items)];

function drawNav() {
  mount($('#settingsNav'), html`${NAV.map((g) => html`<h2>${g.heading}</h2>${g.items.map(([key, label, ic]) =>
    html`<button type="button" data-section="${key}" ${raw(key === state.section ? 'aria-current="page"' : '')}>${icon(ic)}${label}</button>`)}`)}`);
}

async function render() {
  drawNav();
  try {
    if (CUSTOM[state.section]) await CUSTOM[state.section]();
    else { root().replaceChildren(); await SECTIONS[state.section](root()); }
  } catch (err) { mount(root(), html`<div class="panel">${emptyState('Gagal memuat', err.message, 'alert')}</div>`); }
}

initShell();
state.section = ALL.some(([k]) => k === location.hash.slice(1)) ? location.hash.slice(1) : 'general';
mount(root(), html`<div class="list-card">${skeleton(3)}</div>`);
$('#settingsNav').addEventListener('click', (event) => {
  const item = event.target.closest('[data-section]');
  if (!item) return;
  state.section = item.dataset.section;
  history.replaceState(null, '', `#${state.section}`);
  render();
  $('#main').focus({ preventScroll: true });
});
root().addEventListener('click', (event) => {
  const el = event.target.closest('[data-act]');
  if (el) actions[el.dataset.act]?.(el.dataset);
});
root().addEventListener('keydown', (event) => {  // simpul diagram (role=button) dapat dioperasikan dengan keyboard
  const node = event.target.closest('g[role="button"]');
  if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); node.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
render();
