/** Utilitas UI bersama: templating aman XSS, format, komponen kecil, toast, konfirmasi, dan kerangka halaman. */
import { api } from './api_client.js';

// ---- Templating: nilai yang disisipkan otomatis di-escape kecuali hasil html``
class Safe {
  constructor(value) { this.value = value; }
}
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
export const raw = (value) => new Safe(value);

function stringify(value) {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  if (value === null || value === undefined || value === false) return '';
  return esc(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => { out += stringify(value) + strings[i + 1]; });
  return new Safe(out);
}

/** Dimensi/warna dinamis diterapkan lewat CSSOM agar sesuai CSP tanpa atribut style inline. */
function applyDynamicStyles(root) {
  root.querySelectorAll('[data-w]').forEach((node) => { node.style.width = `${node.dataset.w}%`; });
  root.querySelectorAll('[data-h]').forEach((node) => { node.style.height = `${node.dataset.h}%`; });
  root.querySelectorAll('[data-hue]').forEach((node) => { node.style.setProperty('--hue', node.dataset.hue); });
}

export function mount(element, safe) {
  element.innerHTML = safe.value;
  applyDynamicStyles(element);
  return element;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export function debounce(fn, wait = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); };
}

// ---- Format
const dateTimeFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const relativeFmt = new Intl.RelativeTimeFormat('id', { numeric: 'auto' });
export const fmtDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '-');
export const fmtDate = (iso) => (iso ? dateFmt.format(new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)) : '-');
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const hueOf = (text = '') => [...text].reduce((sum, ch) => sum + ch.charCodeAt(0) * 7, 0) % 360;

export function timeAgo(iso) {
  const seconds = Math.round((new Date(iso) - Date.now()) / 1000);
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]]) {
    if (Math.abs(seconds) >= size) return relativeFmt.format(Math.round(seconds / size), unit);
  }
  return 'baru saja';
}

// ---- Data referensi (satu request per halaman)
let metaPromise;
export const loadMeta = () => (metaPromise ??= api.get('/api/meta'));
export const resetMeta = () => { metaPromise = undefined; };
export const can = (meta, permission) => meta.me.permissions.includes(permission);

// ---- Komponen kecil
export const icon = (name, extra = '') => html`<svg class="ic ${extra}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
export const badge = (label, tone = 'neutral') => html`<span class="badge tone-${tone}">${label}</span>`;
export const priorityPill = (label, tone = 'neutral') => html`<span class="pri tone-${tone}">${label}</span>`;
export const avatar = (name, small = false) => html`<span class="avatar ${small ? 'avatar-sm' : ''}" data-hue="${hueOf(name)}" title="${name}">${initials(name)}</span>`;
export const skeleton = (rows = 4) => html`${Array.from({ length: rows }, () => html`<div class="skeleton-row"><span class="skeleton"></span><span class="skeleton"></span></div>`)}`;
export const emptyState = (title, text = '', iconName = 'inbox') => html`<div class="empty">${icon(iconName)}<strong>${title}</strong><span>${text}</span></div>`;

export function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast is-${type}`;
  node.textContent = message;
  $('#toastHost').append(node);
  setTimeout(() => node.remove(), type === 'error' ? 5200 : 3200);
}

export function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (busy && label !== undefined) { button.dataset.label = button.textContent; button.textContent = label; }
  else if (!busy && button.dataset.label) { button.textContent = button.dataset.label; delete button.dataset.label; }
}

/** Konfirmasi modal bergaya aplikasi (pengganti confirm()). Mengembalikan Promise<boolean>. */
export function confirmAction({ title, message, confirmLabel = 'Lanjutkan', danger = false }) {
  const dialog = $('#confirmDialog');
  $('#confirmTitle').textContent = title;
  $('#confirmMessage').textContent = message;
  const ok = $('#confirmOk');
  ok.textContent = confirmLabel;
  ok.className = danger ? 'btn btn-danger is-solid' : 'btn btn-primary';
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), { once: true });
    dialog.showModal();
  });
}

// ---- Kerangka halaman (tema, keluar, ubah kata sandi, tutup dialog)
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const effectiveTheme = () => document.documentElement.dataset.theme ?? (systemDark() ? 'dark' : 'light');

export function initShell() {
  applyDynamicStyles(document);
  if ($('#notifBtn')) import('./notif_center.js').then((m) => m.initNotifications());
  const refreshThemeIcon = () => $('#themeIcon')?.querySelector('use')?.setAttribute('href', effectiveTheme() === 'dark' ? '#i-sun' : '#i-moon');
  refreshThemeIcon();

  $('#themeBtn')?.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* abaikan */ }
    refreshThemeIcon();
  });
  $('#logoutBtn')?.addEventListener('click', async () => {
    try { await api.post('/api/auth/logout'); } finally { location.assign('/masuk'); }
  });
  $('#accountBtn')?.addEventListener('click', async () => {
    const { openForm } = await import('./form_dialog.js');
    openForm({
      title: 'Ubah kata sandi', submitLabel: 'Simpan kata sandi',
      fields: [
        { name: 'current', label: 'Kata sandi saat ini', type: 'password', required: true },
        { name: 'new', label: 'Kata sandi baru', type: 'password', required: true, hint: 'Minimal 8 karakter.' },
      ],
      onSubmit: async (data) => { await api.post('/api/auth/password', data); toast('Kata sandi diperbarui.', 'success'); },
    });
  });
  document.addEventListener('click', (event) => {
    event.target.closest('[data-close]')?.closest('dialog')?.close();
    if (event.target instanceof HTMLDialogElement && event.target.classList.contains('drawer')) event.target.close();
  });
}
