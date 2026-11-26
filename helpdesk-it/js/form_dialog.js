/** Dialog formulir generik: dipakai semua CRUD (pengguna, kelompok, field, status, prioritas, dst.). */
import { $, html, raw, mount, setBusy } from './ui_kit.js';

const normalize = (options = []) => options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
const hint = (f) => (f.hint ? html`<small>${f.hint}</small>` : '');

function fieldHtml(f, value) {
  const current = value ?? f.default ?? '';
  const attrs = raw(`name="${f.name}"${f.required ? ' required' : ''}${f.disabled ? ' disabled' : ''}`);
  switch (f.type) {
    case 'textarea':
      return html`<label class="field"><span>${f.label}</span><textarea ${attrs} rows="${f.rows ?? 3}" placeholder="${f.placeholder ?? ''}">${current}</textarea>${hint(f)}</label>`;
    case 'select':
      return html`<label class="field"><span>${f.label}</span><select ${attrs}>${normalize(f.options).map((o) =>
        html`<option value="${o.value ?? ''}" ${raw(String(o.value ?? '') === String(current) ? 'selected' : '')} ${raw(o.disabled ? 'disabled' : '')}>${o.label}</option>`)}</select>${hint(f)}</label>`;
    case 'checkbox':
      return html`<label class="switch-row"><span><b>${f.label}</b>${f.hint ? html`<small>${f.hint}</small>` : ''}</span>
        <span class="switch"><input type="checkbox" ${attrs} ${raw(current ? 'checked' : '')}><i></i></span></label>`;
    case 'multicheck': {
      const selected = new Set((value ?? []).map(String));
      return html`<fieldset class="field"><legend>${f.label}</legend><div class="check-grid">${normalize(f.options).map((o) =>
        html`<label class="check-chip"><input type="checkbox" name="${f.name}" value="${o.value}" ${raw(selected.has(String(o.value)) ? 'checked' : '')} ${raw(f.disabled ? 'disabled' : '')}><span>${o.label}</span></label>`)}</div>${hint(f)}</fieldset>`;
    }
    default:
      return html`<label class="field"><span>${f.label}</span><input type="${f.type ?? 'text'}" ${attrs} value="${current}" placeholder="${f.placeholder ?? ''}"
        ${raw(f.min !== undefined ? `min="${f.min}"` : '')} ${raw(f.type === 'password' ? 'autocomplete="new-password"' : '')}>${hint(f)}</label>`;
  }
}

function collect(form, fields) {
  const data = {};
  for (const f of fields) {
    if (f.type === 'checkbox') data[f.name] = form.elements[f.name].checked;
    else if (f.type === 'multicheck') data[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map((i) => (f.numeric ? Number(i.value) : i.value));
    else {
      let val = form.elements[f.name].value;
      if (f.type === 'number' || f.numeric) val = val === '' ? null : Number(val);
      data[f.name] = val;
    }
  }
  return data;
}

/**
 * openForm({ title, submitLabel, intro, fields:[{name,label,type,required,options,hint,...}], values, onSubmit(data) })
 * onSubmit boleh melempar Error: pesannya ditampilkan di dalam dialog.
 */
export function openForm({ title, submitLabel = 'Simpan', intro = '', fields, values = {}, onSubmit }) {
  const dialog = $('#formDialog');
  const form = $('#formDialogForm');
  const errorBox = $('#formDialogError');
  const submit = $('#formDialogSubmit');
  $('#formDialogTitle').textContent = title;
  submit.textContent = submitLabel;
  errorBox.hidden = true;
  errorBox.tabIndex = -1;
  mount($('#formDialogBody'), html`${intro ? html`<p class="muted small">${intro}</p>` : ''}${fields.map((f) => fieldHtml(f, values[f.name]))}`);

  form.onsubmit = async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    if (!form.reportValidity()) return;
    setBusy(submit, true, 'Menyimpan...');
    try {
      await onSubmit(collect(form, fields));
      dialog.close();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      errorBox.focus();
    } finally {
      setBusy(submit, false);
    }
  };
  dialog.showModal();
  form.querySelector('input:not([type=checkbox]), select, textarea')?.focus();
}
