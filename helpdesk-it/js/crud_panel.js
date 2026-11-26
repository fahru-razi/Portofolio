/** Panel CRUD generik (daftar + tambah/ubah/hapus) untuk entitas sederhana. Satu implementasi, banyak entitas. */
import { api } from './api_client.js';
import { $, html, mount, toast, icon, confirmAction, emptyState, debounce, skeleton } from './ui_kit.js';
import { openForm } from './form_dialog.js';

let counter = 0;

/**
 * crudPanel({ root, endpoint, noun, title, intro, row(item)->{title,sub,badge}, fields(item)->[...], values(item), toPayload(data, item),
 *             canWrite, searchable, perPage, extraActions(item)->[{act,icon,label}], onAction(act,item,reload), afterChange })
 */
export function crudPanel(cfg) {
  const { root, endpoint, noun, title, intro = '', row, canWrite = true, searchable = false, perPage = 50, addLabel = `Tambah ${noun}` } = cfg;
  const id = `crud${(counter += 1)}`;
  const state = { items: [], total: 0, page: 1, q: '' };

  mount(root, html`<section class="panel" aria-labelledby="${id}-t">
    <div class="panel-head"><div><h3 id="${id}-t">${title}</h3>${intro ? html`<p class="muted small">${intro}</p>` : ''}</div>
      <div class="btn-row">${searchable ? html`<input type="search" class="control control-search" data-crud-search placeholder="Cari ${noun}" aria-label="Cari ${noun}">` : ''}
      ${canWrite ? html`<button type="button" class="btn btn-primary btn-sm" data-crud="new">${icon('plus')}${addLabel}</button>` : ''}</div></div>
    <div data-region aria-live="polite">${skeleton(2)}</div></section>`);
  const region = $('[data-region]', root);

  function draw() {
    const pages = Math.ceil(state.total / perPage);
    mount(region, state.items.length ? html`<ul class="plain-list">${state.items.map((item) => {
      const r = row(item);
      const extra = (cfg.extraActions?.(item) ?? []).map((a) => html`<button type="button" class="btn btn-ghost btn-icon btn-sm" data-crud="${a.act}" data-id="${item.id}" title="${a.label}" aria-label="${a.label}">${icon(a.icon)}</button>`);
      return html`<li class="item-row"><div class="grow"><strong>${r.title}</strong>${r.sub ? html`<small>${r.sub}</small>` : ''}</div>${r.badge ?? ''}
        <div class="row-actions">${extra}${canWrite ? html`<button type="button" class="btn btn-ghost btn-icon btn-sm" data-crud="edit" data-id="${item.id}" aria-label="Ubah ${noun}" title="Ubah">${icon('edit')}</button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-crud="delete" data-id="${item.id}" aria-label="Hapus ${noun}" title="Hapus">${icon('trash')}</button>` : ''}</div></li>`;
    })}</ul>${pages > 1 ? html`<div class="pager"><span>Halaman ${state.page} dari ${pages}</span><span class="btn-row">
      <button type="button" class="btn btn-sm" data-crud="page" data-to="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>Sebelumnya</button>
      <button type="button" class="btn btn-sm" data-crud="page" data-to="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>Berikutnya</button></span></div>` : ''}`
      : emptyState(state.q ? 'Tidak ditemukan' : `Belum ada ${noun}`, canWrite && !state.q ? `Tambahkan ${noun} pertama dengan tombol di atas.` : '', 'inbox'));
  }

  async function load() {
    try {
      const result = await api.get(endpoint, { q: state.q, page: state.page, per_page: perPage });
      Object.assign(state, { items: result.items, total: result.total });
      draw();
    } catch (err) { mount(region, emptyState('Gagal memuat', err.message, 'alert')); }
  }

  async function form(item) {
    const fields = typeof cfg.fields === 'function' ? await cfg.fields(item) : cfg.fields;
    openForm({
      title: item ? `Ubah ${noun}` : addLabel, fields, values: item ? (cfg.values?.(item) ?? item) : {},
      onSubmit: async (data) => {
        const body = cfg.toPayload ? cfg.toPayload(data, item) : data;
        if (item) await api.patch(`${endpoint}/${item.id}`, body); else await api.post(endpoint, body);
        toast(`${noun[0].toUpperCase()}${noun.slice(1)} disimpan.`, 'success');
        await load();
        cfg.afterChange?.();
      },
    });
  }

  root.addEventListener('click', async (event) => {
    const el = event.target.closest('[data-crud]');
    if (!el) return;
    const item = state.items.find((i) => i.id === Number(el.dataset.id));
    switch (el.dataset.crud) {
      case 'new': form(null); break;
      case 'edit': form(item); break;
      case 'page': state.page = Number(el.dataset.to); load(); break;
      case 'delete':
        if (await confirmAction({ title: `Hapus ${noun}?`, message: `"${row(item).title?.value ?? row(item).title}" akan dihapus permanen.`.replace(/<[^>]+>/g, ''), confirmLabel: 'Hapus', danger: true })) {
          try { await api.delete(`${endpoint}/${item.id}`); toast(`${noun[0].toUpperCase()}${noun.slice(1)} dihapus.`, 'success'); await load(); cfg.afterChange?.(); } catch (err) { toast(err.message, 'error'); }
        }
        break;
      default: cfg.onAction?.(el.dataset.crud, item, load);
    }
  });
  $('[data-crud-search]', root)?.addEventListener('input', debounce((event) => { state.q = event.target.value.trim(); state.page = 1; load(); }));
  load();
  return { reload: load };
}
