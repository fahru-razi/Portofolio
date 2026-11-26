/** Klien API versi demo: tanpa server. Semua data dari demo_data.js (dummy) dan disimpan di memori halaman. */
import * as D from './demo_data.js';

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
const toQuery = (params = {}) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const s = q.toString(); return s ? `?${s}` : ''; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const S = Object.fromEntries(D.statuses.map((s) => [s.id, s]));
const agent = D.role !== 'requester', stamp = () => new Date().toISOString();
const mine = () => (agent ? D.tickets : D.tickets.filter((t) => t.requester_id === D.me.id));
const find = (id) => D.tickets.find((t) => t.id === id) ?? (() => { throw new ApiError('Tiket tidak ditemukan.', 404); })();
const addEvent = (t, kind, extra = {}) => { t.events.push({ id: Date.now() + t.events.length, kind, is_internal: false, from_label: null, from_tone: null, to_label: null, to_tone: null, message: '', created_at: stamp(), edited_at: null, actor_id: D.me.id, actor_name: D.me.full_name, ...extra }); t.updated_at = stamp(); };
const setStatus = (t, sid) => { const from = S[t.status_id], to = S[sid]; Object.assign(t, { status_id: sid, status_label: to.label, status_tone: to.tone, status_kind: to.kind, board_column_id: to.board_column_id }); addEvent(t, 'status', { from_label: from.label, from_tone: from.tone, to_label: to.label, to_tone: to.tone }); };
const listRow = ({ events, attachments, extra, description, ...r }) => r;

function list(q) {
  let items = mine();
  const kind = q.get('kind'), scope = q.get('scope'), s = (q.get('q') || '').toLowerCase();
  if (scope === 'active') items = items.filter((t) => t.status_kind !== 'done');
  if (kind) items = items.filter((t) => t.status_kind === kind);
  if (q.get('status')) items = items.filter((t) => t.status_label === q.get('status'));
  if (q.get('group_id')) items = items.filter((t) => t.group_id === +q.get('group_id'));
  if (q.get('priority_id')) items = items.filter((t) => t.priority_id === +q.get('priority_id'));
  if (q.get('assignee')) items = items.filter((t) => String(t.assignee_id) === (q.get('assignee') === 'me' ? String(D.me.id) : q.get('assignee')));
  if (q.get('tag_id')) items = items.filter((t) => t.tags.some((g) => g.id === +q.get('tag_id')));
  if (s) items = items.filter((t) => t.title.toLowerCase().includes(s) || t.ticket_no.toLowerCase().includes(s));
  items = [...items].sort(q.get('sort') === 'priority' ? (a, b) => b.priority_id - a.priority_id || b.updated_at.localeCompare(a.updated_at) : (a, b) => b.updated_at.localeCompare(a.updated_at));
  const per = +q.get('per_page') || 20, page = +q.get('page') || 1;
  return { items: items.slice((page - 1) * per, page * per).map(listRow), total: items.length, page, per_page: per };
}
function summary() {
  const t = mine(), late = (x) => !['done', 'confirm'].includes(x.status_kind) && new Date(x.sla_due_at) < new Date();
  return { active: t.filter((x) => x.status_kind !== 'done').length, waiting: t.filter((x) => x.status_kind === 'confirm' && !x.is_internal).length, finished: t.filter((x) => x.status_kind === 'done').length, overdue: t.filter(late).length, mine: t.filter((x) => x.assignee_id === D.me.id && x.status_kind !== 'done').length };
}
function history(events, kind) {
  const steps = [];
  events.forEach((e) => { if (['created', 'status', 'assignment'].includes(e.kind) && e.to_label && (!steps.length || steps.at(-1).label !== e.to_label)) steps.push({ label: e.to_label, tone: e.to_tone, entered_at: e.created_at }); });
  steps.forEach((s, i) => { const last = i === steps.length - 1; s.seconds = last && kind === 'done' ? 0 : Math.max(0, Math.round(((last ? Date.now() : new Date(steps[i + 1].entered_at)) - new Date(s.entered_at)) / 1000)); });
  return steps;
}
function detail(id) {
  const t = clone(find(id));
  t.events.forEach((e) => { e.can_modify = e.kind === 'comment' && (agent || e.actor_id === D.me.id); });
  const next = !agent || t.status_kind === 'new' ? [] : (D.transitions[t.status_id] || []).map((i) => S[i]);
  const rated = t.status_kind === 'done' && t.requester_id === D.me.id && t.csat_score === null;
  return { ...t, steps: D.lifecycle, history: history(t.events, t.status_kind), diagram: { statuses: D.statuses, transitions: D.transitions }, allowed_next: next, asset_history: [],
    can_edit: agent, can_delete: false, can_rate: rated, priorities: agent ? D.priorities : [] };
}
function mutate(method, p, json) {
  let m;
  if (p.startsWith('/admin/users')) return userMutate(method, p, json);
  if (p === '/tickets' && method === 'POST') {
    const id = Math.max(...D.tickets.map((t) => t.id)) + 1, g = D.groups.find((x) => x.id === +json.group_id) ?? D.groups[0], pr = D.priorities.find((x) => x.id === +json.priority_id) ?? D.priorities[1];
    const t = { ...clone(D.tickets[0]), id, ticket_no: `ITD-2611-${String(id).padStart(5, '0')}`, title: json.title || 'Tiket baru', description: json.description || '', created_at: stamp(), updated_at: stamp(), sla_due_at: new Date(Date.now() + pr.sla_hours * 36e5).toISOString(), priority_id: pr.id, priority_label: pr.label, priority_tone: pr.tone, group_id: g.id, group_name: g.name, status_id: 1, status_label: 'Baru', status_tone: 'info', status_kind: 'new', board_column_id: 1, requester_id: D.me.id, requester_name: D.me.full_name, assignee_id: null, assignee_name: null, tags: [], events: [], first_response_at: null };
    addEvent(t, 'created', { to_label: 'Baru', to_tone: 'info' }); D.tickets.unshift(t); return { id };
  }
  if ((m = p.match(/^\/tickets\/(\d+)\/(status|events|rating|confirmation|tags)$/))) {
    const t = find(+m[1]);
    if (m[2] === 'status' || m[2] === 'confirmation') setStatus(t, +json.status_id || 5);
    if (m[2] === 'events') addEvent(t, json.kind || 'comment', { message: json.message });
    if (m[2] === 'rating') t.csat_score = json.score;
    if (m[2] === 'tags') t.tags = D.tags.filter((g) => (json.tag_ids || []).includes(g.id));
    return {};
  }
  if ((m = p.match(/^\/tickets\/(\d+)$/)) && method === 'PATCH') {
    const t = find(+m[1]);
    if (json.assignee_id) { const u = D.staff.find((x) => x.id === +json.assignee_id); Object.assign(t, { assignee_id: u.id, assignee_name: u.full_name }); if (t.status_kind === 'new') setStatus(t, 2); else addEvent(t, 'assignment', { message: `Ditugaskan ke ${u.full_name}`, to_label: t.status_label, to_tone: t.status_tone }); }
    if (json.priority_id) { const pr = D.priorities.find((x) => x.id === +json.priority_id); Object.assign(t, { priority_id: pr.id, priority_label: pr.label, priority_tone: pr.tone }); }
    if (json.estimated_due_date) t.estimated_due_date = json.estimated_due_date;
    t.updated_at = stamp(); return {};
  }
  if (p === '/notifications/read') { D.notes.forEach((n) => { n.is_read = true; }); return {}; }
  if ((m = p.match(/^\/notifications\/(\d+)$/))) { D.notes.splice(D.notes.findIndex((n) => n.id === +m[1]), 1); return {}; }
  if (p === '/notifications' && method === 'DELETE') { D.notes.length = 0; return {}; }
  return {};
}
const dept = (id) => D.departments.find((d) => d.id === id)?.name ?? null;
function users(q) {
  let items = D.users.map((u) => ({ ...u, open_assigned: D.tickets.filter((t) => t.assignee_id === u.id && t.status_kind !== 'done').length }));
  if (q.get('role_id')) items = items.filter((u) => u.role_id === +q.get('role_id'));
  if (q.get('active') === '0' || q.get('active') === '1') items = items.filter((u) => u.is_active === (q.get('active') === '1'));
  const s = (q.get('q') || '').toLowerCase();
  if (s) items = items.filter((u) => u.full_name.toLowerCase().includes(s) || u.email.includes(s));
  const per = +q.get('per_page') || 25, page = +q.get('page') || 1;
  return { items: items.slice((page - 1) * per, page * per), total: items.length, page, per_page: per };
}
function userMutate(method, p, json) {
  const m = p.match(/^\/admin\/users\/(\d+)$/);
  if (!m) {
    const r = D.roles.find((x) => x.id === +json.role_id) ?? D.roles[2], id = Math.max(...D.users.map((u) => u.id)) + 1;
    D.users.push({ id, full_name: json.full_name, email: json.email, role_id: r.id, role_name: r.name, department: dept(+json.department_id), is_active: true, last_login_at: null });
    return { id };
  }
  const i = D.users.findIndex((u) => u.id === +m[1]);
  if (method === 'DELETE') { D.users.splice(i, 1); return {}; }
  const u = D.users[i];
  if ('is_active' in json) u.is_active = !!json.is_active;
  if (json.full_name) u.full_name = json.full_name;
  if (json.role_id) { const r = D.roles.find((x) => x.id === +json.role_id); u.role_id = r.id; u.role_name = r.name; }
  if ('department_id' in json) u.department = dept(+json.department_id);
  return {};
}
function analytics(days) {
  const cut = Date.now() - days * 864e5, T = D.tickets.filter((t) => new Date(t.created_at) >= cut), now = new Date();
  const late = (x) => !['done', 'confirm'].includes(x.status_kind) && new Date(x.sla_due_at) < now;
  const end = (t) => new Date(t.events.at(-1).created_at), done = T.filter((t) => t.status_kind === 'done'), met = done.filter((t) => end(t) <= new Date(t.sla_due_at));
  const resp = T.filter((t) => t.first_response_at), rmet = resp.filter((t) => new Date(t.first_response_at) <= new Date(t.response_due_at));
  const rated = T.filter((t) => t.csat_score !== null), r1 = (x) => Math.round(x * 10) / 10;
  const tally = (arr, key) => { const m = new Map(); arr.forEach((t) => m.set(key(t), (m.get(key(t)) || 0) + 1)); return m; };
  const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const weekly = [7, 6, 5, 4, 3, 2, 1, 0].map((i) => { const s = new Date(mon); s.setDate(s.getDate() - 7 * i); const e = new Date(s); e.setDate(e.getDate() + 7); return { week_start: s.toISOString().slice(0, 10), total: D.tickets.filter((t) => new Date(t.created_at) >= s && new Date(t.created_at) < e).length }; });
  const byTitle = [...tally(T, (t) => t.title.toLowerCase())].filter(([, n]) => n >= 2).map(([k, n]) => { const l = T.filter((t) => t.title.toLowerCase() === k); return { title: l[0].title, group_name: l[0].group_name, occurrences: n, last_seen: l.map((t) => t.created_at).sort().at(-1) }; });
  const summary = { total: T.length, open_count: T.filter((t) => t.status_kind !== 'done').length, awaiting_confirmation: T.filter((t) => t.status_kind === 'confirm').length, overdue: T.filter(late).length, handled: done.length, sla_met: met.length, responded: resp.length, response_met: rmet.length,
    csat_avg: rated.length ? r1(rated.reduce((s, t) => s + t.csat_score, 0) / rated.length) : null, csat_count: rated.length, avg_hours: done.length ? r1(done.reduce((s, t) => s + (end(t) - new Date(t.created_at)) / 36e5, 0) / done.length) : null };
  summary.sla_percent = done.length ? r1((met.length * 100) / done.length) : null;
  summary.response_percent = resp.length ? r1((rmet.length * 100) / resp.length) : null;
  return { days, summary, weekly, assets: [], recurring: byTitle,
    by_group: D.groups.map((g) => ({ name: g.name, total: T.filter((t) => t.group_id === g.id).length, open_count: T.filter((t) => t.group_id === g.id && t.status_kind !== 'done').length })),
    by_priority: [...D.priorities].reverse().map((p) => ({ label: p.label, tone: p.tone, total: T.filter((t) => t.priority_id === p.id).length })),
    by_status: D.statuses.map((s) => ({ label: s.label, tone: s.tone, total: T.filter((t) => t.status_id === s.id).length })).filter((s) => s.total).sort((x, y) => y.total - x.total),
    by_department: [...tally(T, (t) => t.requester_department)].map(([name, total]) => ({ name, total })).sort((x, y) => y.total - x.total).slice(0, 8) };
}
function audit(q) {
  const ip = (id) => `10.0.0.${10 + (id % 40)}`, all = [];
  D.tickets.forEach((t) => t.events.forEach((e) => { if (['created', 'assignment', 'status'].includes(e.kind)) all.push({ created_at: e.created_at, actor_name: e.actor_name, action: e.kind === 'created' ? 'create' : 'update', entity: `Tiket ${t.ticket_no}`, detail: e.kind === 'created' ? t.title : e.kind === 'assignment' ? e.message : `Status: ${e.from_label} ke ${e.to_label}`, ip: ip(e.actor_id) }); }));
  D.users.filter((u) => u.last_login_at).forEach((u) => all.push({ created_at: u.last_login_at, actor_name: u.full_name, action: 'login', entity: 'Sesi', detail: 'Berhasil masuk', ip: ip(u.id) }));
  all.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const s = (q.get('q') || '').toLowerCase(), act = q.get('action');
  const items = all.filter((e) => (!act || e.action === act) && (!s || `${e.actor_name} ${e.entity} ${e.detail}`.toLowerCase().includes(s)));
  const per = +q.get('per_page') || 30, page = +q.get('page') || 1;
  return { items: items.slice((page - 1) * per, page * per), total: items.length, page, per_page: per, actions: [...new Set(all.map((e) => e.action))] };
}
function route(method, url, json) {
  const u = new URL(url, 'http://demo'), p = u.pathname.replace(/^\/api/, ''), q = u.searchParams;
  if (method !== 'GET') return mutate(method, p, json ?? {});
  if (p === '/meta') return { me: D.me, app_name: 'IT Desk', csat_enabled: true, groups: D.groups, priorities: D.priorities, statuses: D.statuses, board_columns: D.columns, tags: agent ? D.tags : [], auto_close_days: 3, allowed_extensions: ['png', 'jpg', 'pdf'], max_upload_mb: 5, tones: ['neutral', 'info', 'violet', 'warn', 'danger', 'success'], permission_labels: {} };
  if (p === '/tickets/summary') return summary();
  if (p === '/tickets') return list(q);
  if (/^\/tickets\/\d+$/.test(p)) return detail(+p.split('/')[2]);
  if (p === '/notifications') return { items: D.notes, unread: D.notes.filter((n) => !n.is_read).length };
  if (p === '/people') return q.get('kind') === 'staff' ? D.staff : [...D.staff, ...D.requesters];
  if (p === '/admin/users') return users(q);
  if (p === '/admin/analytics') return analytics(+q.get('days') || 30);
  if (p === '/admin/audit') return audit(q);
  if (p === '/roles') return { items: D.roles };
  if (p === '/departments') return { items: D.departments };
  if (p === '/canned') return { items: D.canned };
  return {};
}
const request = (method, url, json) => new Promise((resolve, reject) => setTimeout(() => { try { resolve(clone(route(method, url, json))); } catch (e) { reject(e); } }, 120));
export const api = {
  get: (url, params) => request('GET', url + toQuery(params)),
  post: (url, json = {}) => request('POST', url, json),
  patch: (url, json = {}) => request('PATCH', url, json),
  put: (url, json = {}) => request('PUT', url, json),
  delete: (url) => request('DELETE', url),
  upload: () => request('POST', '/api/upload', {}),
};
