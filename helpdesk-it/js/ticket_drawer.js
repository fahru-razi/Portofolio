/** Panel detail tiket (portal pemohon & antrean agen). Tampilan dan aksi mengikuti izin pengguna dan izin per-tiket dari server. */
import { api } from './api_client.js';
import { $, html, raw, mount, toast, loadMeta, can, badge, priorityPill, icon, fmtDateTime, fmtDate, timeAgo, confirmAction } from './ui_kit.js';
import { openForm } from './form_dialog.js';
import { renderWorkflowDiagram } from './workflow_diagram.js';

const state = { id: null, onChanged: null, staffList: null, canned: null, ticket: null, meta: null };
const content = () => $('#drawerContent');
const selected = (condition) => raw(condition ? 'selected' : '');
const iconBtn = (name, action, label, extra = '', data = '') =>
  html`<button type="button" class="btn btn-ghost btn-icon ${extra}" data-action="${action}" ${raw(data)} title="${label}" aria-label="${label}">${icon(name)}</button>`;

export function initTicketDrawer({ onChanged }) {
  state.onChanged = onChanged;
  const dialog = $('#ticketDrawer');
  dialog.addEventListener('click', onClick);
  dialog.addEventListener('submit', onSubmit);
  dialog.addEventListener('change', (event) => {
    if (!event.target.matches('[data-canned]')) return;
    const body = state.canned.find((c) => c.id === Number(event.target.value))?.body;
    const field = dialog.querySelector('form[data-form="event"] textarea');
    if (body && field) { field.value = field.value ? `${field.value}\n${body}` : body; field.focus(); }
    event.target.value = '';
  });
  dialog.addEventListener('close', () => { state.id = null; });
}

export async function openTicket(id) {
  state.id = id;
  const dialog = $('#ticketDrawer');
  mount(content(), html`<div class="drawer-loading" aria-busy="true">Memuat tiket...</div>`);
  if (!dialog.open) dialog.showModal();
  await refresh();
}

/** Membuka tiket dari parameter ?open=ID (dipakai tautan notifikasi). */
export function openFromQuery() {
  const id = Number(new URLSearchParams(location.search).get('open'));
  if (id) { history.replaceState(null, '', location.pathname); openTicket(id); }
}

async function refresh() {
  const id = state.id;
  try {
    const [ticket, meta] = await Promise.all([api.get(`/api/tickets/${id}`), loadMeta()]);
    state.meta = meta;
    if (can(meta, 'tickets.manage')) {
      state.staffList ??= await api.get('/api/people', { kind: 'staff' });
      state.canned ??= (await api.get('/api/canned', { per_page: 200 })).items;
    }
    state.ticket = ticket;
    if (state.id === id) mount(content(), view(ticket, meta));
  } catch (err) {
    mount(content(), html`<div class="drawer-loading">${err.message}</div>`);
  }
}

// ---------------------------------------------------------------- tampilan
const kv = (label, value) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`;

function duration(seconds) {
  if (seconds < 90) return 'kurang dari 2 mnt';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} jam${minutes % 60 ? ` ${minutes % 60} mnt` : ''}`;
  return `${Math.floor(hours / 24)} hari ${hours % 24} jam`;
}

function view(t, meta) {
  const staff = can(meta, 'tickets.manage');
  const closed = t.status_kind === 'done';
  return html`
    <header class="drawer-head">
      <div class="grow">
        <span class="muted num small">${t.ticket_no}</span>
        <h2 id="drawerTitle">${t.title}</h2>
        <div class="badge-row">${badge(t.status_label, t.status_tone)} ${priorityPill(t.priority_label, t.priority_tone)}
          <span class="tag">${t.group_name}</span>${t.is_internal ? html`<span class="tag tag-internal">Internal</span>` : ''}</div>
      </div>
      <div class="drawer-actions">
        ${t.can_edit ? iconBtn('edit', 'edit-ticket', 'Ubah judul dan deskripsi') : ''}
        ${t.can_delete ? iconBtn('trash', 'delete-ticket', staff ? 'Hapus tiket' : 'Batalkan tiket') : ''}
        <button type="button" class="btn btn-ghost btn-icon" data-close aria-label="Tutup detail tiket">${icon('x')}</button>
      </div>
    </header>
    <div class="drawer-body">
      <section aria-labelledby="flowTitle"><h3 id="flowTitle">Alur proses</h3>${steps(t)}</section>
      ${!staff && t.status_kind === 'confirm' && !t.is_internal ? confirmPanel(meta) : ''}
      ${t.can_rate ? ratingCard() : t.csat_score ? html`<p class="small muted">Penilaian Anda: <span class="stars-static" aria-label="${t.csat_score} dari 5">${'★'.repeat(t.csat_score)}${'☆'.repeat(5 - t.csat_score)}</span></p>` : ''}
      <details class="wf-details" open><summary>Diagram alur dan posisi tiket</summary>${diagram(t)}</details>
      <section aria-labelledby="timeTitle"><h3 id="timeTitle">Waktu di setiap status</h3>${timebar(t)}</section>
      <section aria-label="Target layanan" class="sla-grid">${sla('Respons pertama', t.response_due_at, t.first_response_at)}${sla('Penyelesaian', t.sla_due_at, t.first_resolved_at)}</section>
      <dl class="kv">
        ${kv('Pemohon', t.requester_department ? `${t.requester_name} (${t.requester_department})` : t.requester_name)}
        ${kv('Penanggung jawab', t.assignee_name ?? 'Belum ditugaskan')}
        ${kv('Tim', t.team_name ?? 'Semua agen')}
        ${kv('Dibuat', fmtDateTime(t.created_at))}
        ${kv('Estimasi selesai', fmtDate(t.estimated_due_date))}
        ${kv('Diperbarui', timeAgo(t.updated_at))}
      </dl>
      ${t.tags.length || staff ? html`<section aria-label="Tag"><div class="tag-row">${t.tags.map((g) => html`<span class="tag-chip tone-${g.tone}">${g.name}</span>`)}
        ${staff ? html`<button type="button" class="btn btn-soft btn-sm" data-action="edit-tags">${icon('plus')}${t.tags.length ? 'Atur tag' : 'Tambah tag'}</button>` : ''}</div></section>` : ''}
      <section><h3>Deskripsi</h3><p class="prose">${t.description}</p></section>
      ${t.extra.length ? html`<section><h3>Detail permintaan</h3><dl class="kv kv-1">${t.extra.map((e) => kv(e.label, e.value))}</dl></section>` : ''}
      ${t.attachments.length ? html`<section><h3>Lampiran</h3><ul class="file-list">${t.attachments.map((a) => html`<li>
        <a href="/api/attachments/${a.id}">${icon('clip')}${a.original_name}</a>
        ${a.can_delete ? iconBtn('x', 'delete-file', `Hapus lampiran ${a.original_name}`, 'btn-sm', `data-id="${a.id}"`) : ''}</li>`)}</ul></section>` : ''}
      ${staff ? manage(t) : ''}
      <section><h3>Riwayat</h3>${timeline(t)}</section>
    </div>
    ${closed && !staff ? '' : composer(staff)}`;
}

function steps(t) {
  const ids = t.steps.map((s) => s.id);
  let index = ids.indexOf(t.status_id);
  if (t.status_kind === 'new') index = -1;
  else if (t.status_kind === 'waiting') index = Math.max(0, ids.indexOf(t.resume_status_id));
  else if (t.status_kind === 'reopen') index = 0;
  else if (t.status_kind === 'done') index = ids.length;
  else if (index < 0) index = 0;
  return html`<ol class="steps">${t.steps.map((s, i) => html`<li class="${i < index ? 'is-done' : i === index ? 'is-current' : ''}" ${raw(i === index ? 'aria-current="step"' : '')}><i></i><span>${s.label}${i < index ? html`<span class="sr-only"> (selesai)</span>` : ''}</span></li>`)}</ol>`;
}

function diagram(t) {
  const { statuses, transitions } = t.diagram;
  const byLabel = new Map(statuses.map((s) => [s.label, s.id]));
  return renderWorkflowDiagram(statuses, transitions, {
    currentId: t.status_id, nextIds: t.allowed_next.map((s) => s.id), visitedIds: t.history.map((h) => byLabel.get(h.label)).filter(Boolean), caption: `Diagram alur ${t.group_name}`,
  });
}

function timebar(t) {
  const weights = t.history.map((h) => Math.max(h.seconds, 60));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  return html`<div class="timebar" role="img" aria-label="Proporsi waktu di setiap status">${t.history.map((h, i) =>
    html`<i class="tone-${h.tone}" data-w="${(weights[i] / total) * 100}" title="${h.label}: ${duration(h.seconds)}"></i>`)}</div>
    <ul class="time-legend">${t.history.map((h) => html`<li class="tone-${h.tone}"><b>${h.label}</b><span>${h.seconds === 0 && t.status_kind === 'done' ? 'akhir' : duration(h.seconds)}</span></li>`)}</ul>`;
}

function sla(label, due, doneAt) {
  const dueAt = new Date(due);
  let tone; let text; let note;
  if (doneAt) {
    const met = new Date(doneAt) <= dueAt;
    [tone, text, note] = [met ? 'success' : 'danger', met ? 'Tercapai' : 'Terlambat', `Tercatat ${fmtDateTime(doneAt)}`];
  } else {
    const diff = dueAt - Date.now();
    tone = diff < 0 ? 'danger' : diff < 2 * 3600e3 ? 'warn' : 'info';
    text = diff < 0 ? `Terlambat ${duration(-diff / 1000)}` : `Sisa ${duration(diff / 1000)}`;
    note = `Target ${fmtDateTime(due)}`;
  }
  return html`<div class="sla"><small>${label}</small>${badge(text, tone)}<strong>${note}</strong></div>`;
}

function confirmPanel(meta) {
  return html`<section class="callout" aria-labelledby="confirmTitle">
    <strong id="confirmTitle">Mohon konfirmasi hasil pekerjaan</strong>
    <p>Tim IT menandai tiket ini selesai. Silakan uji hasilnya. Tiket ditutup otomatis bila tidak ada respons dalam ${meta.auto_close_days} hari kerja.</p>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-action="accept">${icon('check')}Setuju &amp; selesaikan</button>
      <button type="button" class="btn" data-action="reject-open">Masih ada kendala</button></div>
    <div id="rejectBox" hidden><label class="sr-only" for="rejectNote">Kendala yang masih terjadi</label>
      <textarea id="rejectNote" class="control" rows="3" maxlength="2000" placeholder="Jelaskan kendala yang masih terjadi"></textarea>
      <button type="button" class="btn btn-danger btn-sm" data-action="reject-send">Kirim kendala</button></div></section>`;
}

function ratingCard() {
  return html`<form class="rating-card" data-form="rating"><div><h3>Bagaimana layanan kami?</h3><p class="small muted">Penilaian Anda membantu tim IT meningkatkan layanan.</p></div>
    <fieldset class="stars"><legend class="sr-only">Nilai kepuasan</legend>${[1, 2, 3, 4, 5].map((n) =>
      html`<label><input type="radio" name="score" value="${n}" required><span aria-hidden="true">★</span><span class="sr-only">${n} dari 5</span></label>`)}</fieldset>
    <textarea name="comment" class="control" rows="2" maxlength="1000" aria-label="Komentar (opsional)" placeholder="Komentar (opsional)"></textarea>
    <div><button class="btn btn-primary btn-sm">Kirim penilaian</button></div></form>`;
}

function manage(t) {
  const hint = t.status_kind === 'new' ? 'Tetapkan penanggung jawab terlebih dahulu untuk memulai penanganan.' : 'Tidak ada perpindahan status dari status ini. Atur di Pengaturan > Alur status.';
  return html`<section class="manage" aria-labelledby="manageTitle"><h3 id="manageTitle">Kelola tiket</h3>
    ${t.allowed_next.length ? html`<form data-form="status" class="inline-form"><label class="sr-only" for="nextStatus">Status berikutnya</label>
      <select id="nextStatus" name="status_id" class="control" required>${t.allowed_next.map((s) => html`<option value="${s.id}">${s.label}</option>`)}</select>
      <input name="note" class="control grow" maxlength="500" placeholder="Catatan (opsional)" aria-label="Catatan perubahan status"><button class="btn btn-primary">Perbarui status</button></form>` : html`<p class="muted small">${hint}</p>`}
    <form data-form="fields" class="grid-3">
      <label class="field"><span>Prioritas</span><select name="priority_id">${t.priorities.map((p) => html`<option value="${p.id}" ${selected(p.id === t.priority_id)}>${p.label}</option>`)}</select></label>
      <label class="field"><span>Estimasi selesai</span><input type="date" name="estimated_due_date" value="${t.estimated_due_date ?? ''}"></label>
      <label class="field"><span>Penanggung jawab</span><select name="assignee_id">${t.assignee_id ? '' : html`<option value="">Pilih agen</option>`}
        ${state.staffList.map((s) => html`<option value="${s.id}" ${selected(s.id === t.assignee_id)}>${s.full_name}</option>`)}</select></label>
      <button class="btn btn-soft">Simpan</button></form>
    ${t.asset_history.length ? html`<div class="asset-history"><h4>Riwayat perangkat ini</h4><ul>${t.asset_history.map((h) => html`<li>
      <button type="button" class="link num" data-open="${h.id}">${h.ticket_no}</button><span>${h.title}</span>${badge(h.status_label, h.status_tone)}<span class="muted">${fmtDate(h.created_at)}</span></li>`)}</ul></div>` : ''}
  </section>`;
}

function eventLabel(e) {
  switch (e.kind) {
    case 'created': return 'membuat tiket';
    case 'status': return html`mengubah status dari ${badge(e.from_label, e.from_tone)} ke ${badge(e.to_label, e.to_tone)}`;
    case 'assignment': return 'menugaskan tiket';
    case 'update': return 'memperbarui tiket';
    case 'worklog': return 'menulis worklog';
    case 'changelog': return 'mencatat changelog';
    default: return 'berkomentar';
  }
}

function timeline(t) {
  return html`<ol class="timeline">${t.events.map((e) => html`<li class="tl-${e.kind}"><i class="tl-dot" aria-hidden="true"></i>
    <div class="grow"><p class="tl-head"><strong>${e.actor_name ?? 'Sistem'}</strong> ${eventLabel(e)}${e.is_internal ? html`<span class="tag tag-internal">Internal</span>` : ''}
      <time class="muted" datetime="${e.created_at}">${fmtDateTime(e.created_at)}${e.edited_at ? ' (diedit)' : ''}</time>
      ${e.can_modify ? html`<span class="tl-tools">${iconBtn('edit', 'edit-event', 'Ubah catatan', 'btn-sm', `data-id="${e.id}"`)}${iconBtn('trash', 'delete-event', 'Hapus catatan', 'btn-sm', `data-id="${e.id}"`)}</span>` : ''}</p>
      ${e.message ? html`<p class="tl-msg">${e.message}</p>` : ''}</div></li>`)}</ol>`;
}

function composer(staff) {
  return html`<form class="composer" data-form="event"><label class="sr-only" for="composerText">Pesan</label>
    <textarea id="composerText" name="message" class="control" rows="2" maxlength="4000" required placeholder="${staff ? 'Tulis balasan atau catatan teknis' : 'Tulis pesan untuk tim IT'}"></textarea>
    <div class="composer-row">
      ${staff ? html`<select name="kind" class="control" aria-label="Jenis catatan"><option value="comment">Balasan ke pemohon</option><option value="worklog">Worklog internal</option><option value="changelog">Changelog teknis (internal)</option></select>
        ${state.canned?.length ? html`<select class="control canned-select" data-canned aria-label="Sisipkan template balasan"><option value="">Template balasan</option>${state.canned.map((c) => html`<option value="${c.id}">${c.title}</option>`)}</select>` : ''}` : ''}
      <span class="spacer"></span><button class="btn btn-primary">${icon('send')}Kirim</button></div></form>`;
}

// ---------------------------------------------------------------- aksi
async function mutate(trigger, action, success) {
  trigger?.setAttribute('disabled', '');
  try {
    await action();
    if (success) toast(success, 'success');
    await refresh();
    state.onChanged?.();
  } catch (err) {
    toast(err.message, 'error');
    trigger?.removeAttribute('disabled');
  }
}

const sendConfirmation = (button, accept, note) =>
  mutate(button, () => api.post(`/api/tickets/${state.id}/confirmation`, { accept, note }), accept ? 'Terima kasih, tiket ditutup.' : 'Kendala telah dikirim ke tim IT.');

async function onClick(event) {
  const target = event.target.closest('[data-action], [data-open]');
  if (!target) return;
  if (target.dataset.open) { openTicket(Number(target.dataset.open)); return; }
  const t = state.ticket;
  const id = state.id;
  switch (target.dataset.action) {
    case 'accept': sendConfirmation(target, true); break;
    case 'reject-open': $('#rejectBox').hidden = false; $('#rejectNote').focus(); break;
    case 'reject-send': {
      const note = $('#rejectNote').value.trim();
      if (!note) { toast('Jelaskan kendala yang masih terjadi.', 'error'); break; }
      sendConfirmation(target, false, note);
      break;
    }
    case 'edit-ticket':
      openForm({
        title: 'Ubah tiket', fields: [{ name: 'title', label: 'Judul', required: true }, { name: 'description', label: 'Deskripsi', type: 'textarea', rows: 5, required: true }],
        values: { title: t.title, description: t.description },
        onSubmit: async (data) => { await api.patch(`/api/tickets/${id}`, data); toast('Tiket diperbarui.', 'success'); await refresh(); state.onChanged?.(); },
      });
      break;
    case 'edit-tags':
      openForm({
        title: 'Atur tag', intro: state.meta.tags.length ? '' : 'Belum ada tag. Buat tag di Pengaturan > Tag.',
        fields: [{ name: 'tag_ids', label: 'Tag tiket', type: 'multicheck', numeric: true, options: state.meta.tags.map((g) => ({ value: g.id, label: g.name })) }],
        values: { tag_ids: t.tags.map((g) => g.id) },
        onSubmit: async (data) => { await api.put(`/api/tickets/${id}/tags`, data); toast('Tag disimpan.', 'success'); await refresh(); state.onChanged?.(); },
      });
      break;
    case 'delete-ticket':
      if (await confirmAction({ title: can(state.meta, 'tickets.manage') ? 'Hapus tiket ini?' : 'Batalkan tiket ini?', message: 'Tiket beserta riwayat dan lampirannya akan dihapus permanen.', confirmLabel: 'Hapus', danger: true })) {
        try { await api.delete(`/api/tickets/${id}`); $('#ticketDrawer').close(); toast('Tiket dihapus.', 'success'); state.onChanged?.(); } catch (err) { toast(err.message, 'error'); }
      }
      break;
    case 'delete-file':
      if (await confirmAction({ title: 'Hapus lampiran?', message: 'Berkas akan dihapus permanen.', confirmLabel: 'Hapus', danger: true })) {
        mutate(null, () => api.delete(`/api/attachments/${target.dataset.id}`), 'Lampiran dihapus.');
      }
      break;
    case 'edit-event': {
      const item = t.events.find((e) => e.id === Number(target.dataset.id));
      openForm({
        title: 'Ubah catatan', fields: [{ name: 'message', label: 'Pesan', type: 'textarea', rows: 5, required: true }], values: { message: item.message },
        onSubmit: async (data) => { await api.patch(`/api/tickets/${id}/events/${item.id}`, data); await refresh(); state.onChanged?.(); },
      });
      break;
    }
    case 'delete-event':
      if (await confirmAction({ title: 'Hapus catatan?', message: 'Catatan ini akan dihapus dari riwayat tiket.', confirmLabel: 'Hapus', danger: true })) {
        mutate(null, () => api.delete(`/api/tickets/${id}/events/${target.dataset.id}`), 'Catatan dihapus.');
      }
      break;
    default:
  }
}

function onSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('button:not([type="button"])');
  const id = state.id;
  if (form.dataset.form === 'status') {
    mutate(submit, () => api.post(`/api/tickets/${id}/status`, { status_id: Number(data.status_id), note: data.note }), 'Status diperbarui.');
  } else if (form.dataset.form === 'fields') {
    const body = { priority_id: Number(data.priority_id), estimated_due_date: data.estimated_due_date || null };
    if (data.assignee_id) body.assignee_id = Number(data.assignee_id);
    mutate(submit, () => api.patch(`/api/tickets/${id}`, body), 'Perubahan disimpan.');
  } else if (form.dataset.form === 'rating') {
    mutate(submit, () => api.post(`/api/tickets/${id}/rating`, { score: Number(data.score), comment: data.comment }), 'Terima kasih atas penilaian Anda.');
  } else if (form.dataset.form === 'event' && data.message?.trim()) {
    mutate(submit, () => api.post(`/api/tickets/${id}/events`, { kind: data.kind ?? 'comment', message: data.message }), 'Pesan terkirim.');
  }
}
