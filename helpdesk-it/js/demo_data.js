/** Data dummy Helpdesk IT: semua nama dan tiket fiktif, saling terhubung (pemohon, agen, status, SLA, riwayat). */
const H = 36e5, now = Date.now(), iso = (ms) => new Date(ms).toISOString(), ago = (h) => iso(now - h * H);
export const role = document.documentElement.dataset.demoRole || 'agent';
export const statuses = [
  { id: 1, workflow_id: 1, label: 'Baru', tone: 'info', kind: 'new', board_column_id: 1, sort_order: 1 },
  { id: 2, workflow_id: 1, label: 'Dikerjakan', tone: 'warn', kind: 'progress', board_column_id: 2, sort_order: 2 },
  { id: 3, workflow_id: 1, label: 'Menunggu pemohon', tone: 'neutral', kind: 'waiting', board_column_id: 2, sort_order: 3 },
  { id: 4, workflow_id: 1, label: 'Menunggu konfirmasi', tone: 'violet', kind: 'confirm', board_column_id: 3, sort_order: 4 },
  { id: 5, workflow_id: 1, label: 'Selesai', tone: 'success', kind: 'done', board_column_id: null, sort_order: 5 },
];
export const transitions = { 1: [2], 2: [3, 4], 3: [2], 4: [5, 2], 5: [] };
export const columns = [{ id: 1, name: 'Baru', sort_order: 1 }, { id: 2, name: 'Dikerjakan', sort_order: 2 }, { id: 3, name: 'Konfirmasi', sort_order: 3 }];
export const groups = ['Perangkat & Hardware', 'Jaringan & Internet', 'Akun & Akses', 'Aplikasi Internal', 'Permintaan Lainnya']
  .map((name, i) => ({ id: i + 1, name, description: '', workflow_id: 1, team_id: 1, fields: [] }));
export const priorities = [['low', 'Rendah', 'neutral', 8, 72], ['mid', 'Sedang', 'info', 4, 24], ['high', 'Tinggi', 'warn', 2, 8], ['urgent', 'Mendesak', 'danger', 1, 4]]
  .map(([key, label, tone, r, s], i) => ({ id: i + 1, key, label, tone, response_hours: r, sla_hours: s, sort_order: i + 1, is_active: true }));
export const tags = [['Hardware', 'warn'], ['Jaringan', 'info'], ['VPN', 'violet'], ['Printer', 'neutral']].map(([name, tone], i) => ({ id: i + 1, name, tone }));
export const staff = [[1, 'Dimas Prakoso'], [2, 'Sinta Maharani'], [3, 'Rudi Hartono']].map(([id, full_name]) => ({ id, full_name, department: 'IT' }));
export const requesters = [[11, 'Andra Wijaya', 'Keuangan'], [12, 'Bella Kusuma', 'HRD'], [13, 'Candra Setiawan', 'Marketing'], [14, 'Dian Permata', 'Produksi'], [15, 'Eka Nugroho', 'Gudang'], [16, 'Farah Lestari', 'Desain'], [17, 'Galih Firmansyah', 'Produksi'], [18, 'Hesti Handayani', 'Administrasi']]
  .map(([id, full_name, department]) => ({ id, full_name, department }));
export const canned = [{ id: 1, title: 'Sedang ditangani', name: 'Sedang ditangani', body: 'Terima kasih, tiket Anda sedang kami tangani.' }, { id: 2, title: 'Mohon info tambahan', name: 'Mohon info tambahan', body: 'Mohon kirim detail tambahan agar kami bisa melanjutkan.' }];
const U = Object.fromEntries([...staff, ...requesters].map((u) => [u.id, u]));
const S = Object.fromEntries(statuses.map((s) => [s.id, s]));
const ME = {
  admin: { id: 4, full_name: 'Maya Anggraini', role_name: 'Administrator', permissions: ['tickets.create', 'tickets.view_all', 'tickets.manage', 'tickets.delete', 'analytics.view', 'users.manage', 'audit.view'] },
  agent: { id: 1, full_name: 'Dimas Prakoso', role_name: 'Agen', permissions: ['tickets.create', 'tickets.view_all', 'tickets.manage'] },
  requester: { id: 11, full_name: 'Andra Wijaya', role_name: 'Pemohon', permissions: ['tickets.create'] },
};
export const me = ME[role] ?? ME.agent;
const PATH = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 4], 5: [1, 2, 4, 5] };
// judul, kelompok, prioritas, status, agen, pemohon, jam lalu, tag
const specs = [
  ['Laptop tidak bisa menyala setelah update', 1, 3, 2, 1, 11, 5, [1]], ['Wi-Fi lantai 2 sering terputus', 2, 3, 2, 2, 12, 22, [2]],
  ['Reset kata sandi email', 3, 2, 5, 3, 13, 50, []], ['Printer ruang admin tidak mencetak', 1, 2, 4, 1, 11, 30, [4]],
  ['Akses VPN untuk kerja dari rumah', 3, 2, 3, 2, 14, 40, [3]], ['Aplikasi absensi gagal login', 4, 4, 2, 1, 15, 3, []],
  ['Permintaan monitor tambahan', 5, 1, 1, null, 16, 2, []], ['Koneksi internet lambat di ruang produksi', 2, 3, 1, null, 17, 1, [2]],
  ['Instal software desain', 5, 1, 5, 3, 11, 100, []], ['Mouse dan keyboard rusak', 1, 1, 5, 2, 18, 120, [1]],
  ['Email tidak terkirim ke klien', 4, 3, 2, 3, 12, 7, []], ['Akun baru karyawan magang', 3, 2, 4, 2, 13, 26, []],
  ['Server file tidak bisa diakses', 2, 4, 2, 1, 14, 1.5, [2]], ['Ganti baterai UPS', 1, 2, 1, null, 15, 6, [1]],
  ['Permintaan akses folder bersama', 3, 1, 2, 2, 11, 12, []], ['Wi-Fi lantai 2 sering terputus', 2, 2, 5, 3, 18, 130, [2]],
];
export const tickets = specs.map(([title, g, p, sid, a, req, h, tg], i) => {
  const id = i + 1, c = now - h * H, pr = priorities[p - 1], path = PATH[sid], an = a ? U[a].full_name : null;
  const ev = (k, kind, extra) => ({ id: id * 100 + k, kind, is_internal: false, from_label: null, from_tone: null, to_label: null, to_tone: null, message: '', created_at: iso(c + (k * Math.min(h / (path.length + 3), 2)) * H), edited_at: null, ...extra });
  const events = [ev(0, 'created', { actor_id: req, actor_name: U[req].full_name, to_label: 'Baru', to_tone: 'info' })];
  path.slice(1).forEach((s, k) => {
    const from = S[path[k]], to = S[s];
    events.push(k === 0 ? ev(k + 1, 'assignment', { actor_id: 1, actor_name: 'Dimas Prakoso', message: `Ditugaskan ke ${an}`, to_label: to.label, to_tone: to.tone })
      : ev(k + 1, 'status', { actor_id: a, actor_name: an, from_label: from.label, from_tone: from.tone, to_label: to.label, to_tone: to.tone }));
    if (k === 0) events.push(ev(k + 1.5, 'comment', { actor_id: a, actor_name: an, message: 'Terima kasih, sudah kami terima dan sedang dicek.' }));
  });
  if (sid === 3) events.push(ev(4, 'comment', { actor_id: a, actor_name: an, message: 'Mohon kirim detail tambahan agar bisa kami lanjutkan.' }));
  return { id, ticket_no: `ITD-2611-${String(id).padStart(5, '0')}`, title, description: `${title}. Mohon bantuan tim IT untuk penanganan secepatnya.`, is_internal: false,
    created_at: ago(h), updated_at: events[events.length - 1].created_at, sla_due_at: iso(c + pr.sla_hours * H), response_due_at: iso(c + pr.response_hours * H), first_response_at: a ? iso(c + 0.7 * H) : null,
    estimated_due_date: sid >= 2 && sid < 5 ? iso(now + 24 * H).slice(0, 10) : null, priority_id: p, priority_label: pr.label, priority_tone: pr.tone,
    status_id: sid, status_label: S[sid].label, status_tone: S[sid].tone, status_kind: S[sid].kind, board_column_id: S[sid].board_column_id, resume_status_id: sid === 3 ? 2 : null,
    group_id: g, group_name: groups[g - 1].name, team_name: 'Tim IT Support', requester_id: req, requester_name: U[req].full_name, requester_department: U[req].department,
    assignee_id: a, assignee_name: an, tags: tg.map((x) => tags[x - 1]), events, attachments: [], extra: [], asset_id: null, csat_score: sid === 5 && id === 3 ? 5 : null };
});
export const roles = [{ id: 1, name: 'Administrator' }, { id: 2, name: 'Agen' }, { id: 3, name: 'Pemohon' }];
export const departments = ['IT', 'Keuangan', 'HRD', 'Marketing', 'Produksi', 'Gudang', 'Desain', 'Administrasi'].map((name, i) => ({ id: i + 1, name, is_active: true }));
const mail = (n) => `${n.toLowerCase().replace(/\s+/g, '.')}@contoh.id`;
export const users = [
  { id: 4, full_name: 'Maya Anggraini', role_id: 1, role_name: 'Administrator', department: 'IT', h: 0.3 },
  ...staff.map((s, i) => ({ id: s.id, full_name: s.full_name, role_id: 2, role_name: 'Agen', department: 'IT', h: [0.5, 1, 2][i] })),
  ...requesters.map((q, i) => ({ id: q.id, full_name: q.full_name, role_id: 3, role_name: 'Pemohon', department: q.department, h: 2 + i * 3 })),
  { id: 19, full_name: 'Indra Gunawan', role_id: 3, role_name: 'Pemohon', department: 'Gudang', h: null },
].map(({ h, ...u }) => ({ ...u, email: mail(u.full_name), is_active: u.id !== 19, last_login_at: h === null ? null : ago(h) }));
const note = (id, ticket_id, message, h, is_read) => ({ id, ticket_id, message, created_at: ago(h), is_read });
export const notes = role === 'agent'
  ? [note(1, 8, 'ITD-2611-00008: tiket baru dari Galih Firmansyah', 1, false), note(2, 13, 'ITD-2611-00013: tiket baru dari Dian Permata', 1.5, false), note(3, 1, 'ITD-2611-00001 ditugaskan kepada Anda', 5, true)]
  : [note(1, 4, 'ITD-2611-00004: tim IT meminta konfirmasi hasil pekerjaan', 4, false), note(2, 15, 'ITD-2611-00015: balasan baru dari tim IT', 10, true)];
export const lifecycle = statuses.filter((s) => ['progress', 'confirm', 'done'].includes(s.kind)).map(({ id, label, kind }) => ({ id, label, kind }));
