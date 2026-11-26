/** Formulir tiket dinamis: field mengikuti konfigurasi kelompok yang dipilih (Pengaturan > Kelompok & formulir). */
import { api } from './api_client.js';
import { $, $$, html, raw, mount, toast, loadMeta, setBusy, debounce } from './ui_kit.js';

function fieldControl(field, meta) {
  const name = `x_${field.key}`;
  const required = raw(field.is_required ? 'required' : '');
  switch (field.field_type) {
    case 'textarea': return html`<textarea name="${name}" rows="3" maxlength="2000" placeholder="${field.placeholder}" ${required}></textarea>`;
    case 'select': return html`<select name="${name}" ${required}><option value="">Pilih...</option>${field.options.map((o) => html`<option>${o}</option>`)}</select>`;
    case 'date': return html`<input type="date" name="${name}" ${required}>`;
    case 'number': return html`<input type="number" step="any" name="${name}" placeholder="${field.placeholder}" ${required}>`;
    case 'file': return html`<input type="file" name="f_${field.key}" accept="${meta.allowed_extensions.map((e) => `.${e}`).join(',')}" multiple><small>Maksimal ${meta.max_upload_mb} MB per berkas.</small>`;
    default: return html`<input name="${name}" maxlength="255" placeholder="${field.placeholder}" ${required}>`;
  }
}

export async function initTicketForm({ onCreated }) {
  const meta = await loadMeta();
  const dialog = $('#ticketFormDialog');
  const form = $('#ticketForm');
  const errorBox = $('#formError');
  let group = null;
  let internal = false;

  mount($('#groupPicker'), meta.groups.length ? html`${meta.groups.map((g) => html`
    <label class="group-option"><input type="radio" name="group" value="${g.id}">
      <span class="group-option-body"><strong>${g.name}</strong><small>${g.description}</small></span></label>`)}`
    : html`<p class="muted small">Belum ada kelompok permintaan aktif. Hubungi tim IT.</p>`);
  const middle = Math.floor(meta.priorities.length / 2);
  mount($('#priorityPicker'), html`${meta.priorities.map((p, i) => html`
    <label class="pill-radio tone-${p.tone}"><input type="radio" name="priority_id" value="${p.id}" ${raw(i === middle ? 'checked' : '')}><span>${p.label}</span></label>`)}`);

  const showError = (message) => { errorBox.textContent = message; errorBox.hidden = !message; };

  $('#groupPicker').addEventListener('change', (event) => {
    group = meta.groups.find((g) => g.id === Number(event.target.value));
    mount($('#dynamicFields'), html`${group.fields.map((f) => html`
      <label class="field"><span>${f.label}${f.is_required ? ' *' : ''}</span>${fieldControl(f, meta)}</label>`)}`);
  });

  async function loadRequesters() {
    const select = $('#requesterSelect');
    if (select.dataset.loaded) return;
    const items = await api.get('/api/people');
    mount(select, html`<option value="">Diri sendiri (tim IT)</option>${items.map((u) => html`<option value="${u.id}">${u.full_name}${u.department ? ` (${u.department})` : ''}</option>`)}`);
    select.dataset.loaded = '1';
  }

  // Saran artikel bantuan saat mengetik judul (mengurangi tiket yang sebenarnya bisa dijawab mandiri)
  const suggest = $('#kbSuggest');
  $('input[name="title"]', form).addEventListener('input', debounce(async (event) => {
    const word = event.target.value.split(/\s+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0];
    if (!word) { suggest.hidden = true; return; }
    try {
      const { items } = await api.get('/api/kb', { q: word, per_page: 3 });
      suggest.hidden = !items.length;
      if (items.length) mount(suggest, html`<strong>Mungkin artikel ini membantu:</strong><ul>${items.map((a) => html`<li><a href="/bantuan?open=${a.id}" target="_blank" rel="noopener">${a.title}</a></li>`)}</ul>`);
    } catch { suggest.hidden = true; }
  }, 450));

  async function uploadFiles(ticketId) {
    let failed = 0;
    for (const input of $$('input[type="file"]', form)) {
      for (const file of input.files) {
        try { await api.upload(`/api/tickets/${ticketId}/attachments`, file); } catch (err) { failed += 1; toast(`${file.name}: ${err.message}`, 'error'); }
      }
    }
    return failed;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showError('');
    if (!group) return showError('Pilih kelompok permintaan terlebih dahulu.');
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const extra = {};
    for (const f of group.fields) if (f.field_type !== 'file') extra[f.key] = data.get(`x_${f.key}`);
    const payload = { group_id: group.id, title: data.get('title'), description: data.get('description'), priority_id: Number(data.get('priority_id')), extra_fields: extra };
    if (internal) {
      payload.is_internal = true;
      if (data.get('requester_id')) payload.requester_id = Number(data.get('requester_id'));
    }

    const submit = $('#ticketSubmitBtn');
    setBusy(submit, true, 'Mengirim...');
    try {
      const created = await api.post('/api/tickets', payload);
      const failed = await uploadFiles(created.id);
      dialog.close();
      toast(failed ? `Tiket ${created.ticket_no} dibuat, ${failed} lampiran gagal.` : `Tiket ${created.ticket_no} berhasil dibuat.`, failed ? 'info' : 'success');
      onCreated?.(created);
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(submit, false);
    }
  });

  return {
    async open({ asInternal = false } = {}) {
      internal = asInternal;
      form.reset();
      group = null;
      showError('');
      suggest.hidden = true;
      mount($('#dynamicFields'), html``);
      $('#ticketFormTitle').textContent = internal ? 'Tiket internal' : 'Buat tiket baru';
      $('#requesterBox').hidden = !internal;
      if (internal) await loadRequesters();
      dialog.showModal();
    },
  };
}
