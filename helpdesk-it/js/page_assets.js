import { $, html, initShell, loadMeta, can, badge } from './ui_kit.js';
import { crudPanel } from './crud_panel.js';

async function main() {
  initShell();
  const meta = await loadMeta();
  crudPanel({
    root: $('#assetRoot'), endpoint: '/api/assets', noun: 'aset', title: 'Daftar aset', searchable: true, perPage: 25, canWrite: can(meta, 'assets.manage'),
    row: (a) => ({
      title: html`<span class="num">${a.asset_tag}</span>${a.name ? html` ${a.name}` : ''}`,
      sub: [a.category, a.location, `${a.ticket_count} tiket`].filter(Boolean).join(', '),
      badge: a.is_active ? '' : badge('Nonaktif', 'neutral'),
    }),
    fields: (item) => [
      { name: 'asset_tag', label: 'ID aset / serial number', required: true, disabled: Boolean(item), hint: item ? 'ID aset tidak dapat diubah.' : 'Contoh: LTP-0231' },
      { name: 'name', label: 'Nama aset' }, { name: 'category', label: 'Kategori', hint: 'Contoh: Laptop, Printer, Router' }, { name: 'location', label: 'Lokasi' },
      { name: 'notes', label: 'Catatan', type: 'textarea' }, { name: 'is_active', label: 'Aset aktif', type: 'checkbox', default: true },
    ],
    toPayload: (data, item) => { if (item) delete data.asset_tag; return data; },
  });
}
main();
