/** Diagram alur status (SVG). Dipakai di Pengaturan (dapat diklik) dan di detail tiket (posisi tiket disorot). */
import { esc, html, raw } from './ui_kit.js';

const W = 168, H = 56, GAP_X = 72, GAP_Y = 28, PAD = 16, LOOP = 20;
const KIND_CAPTION = { new: 'awal tiket', progress: 'pengerjaan', waiting: 'jeda, tunggu pemohon', confirm: 'tunggu konfirmasi', reopen: 'dibuka kembali', done: 'selesai' };
const bySort = (a, b) => a.sort_order - b.sort_order || a.id - b.id;

/** Menyusun posisi simpul & garis. Murni (tanpa DOM) agar dapat diuji. */
export function layoutWorkflow(statuses, transitions = {}) {
  const sorted = [...statuses].sort(bySort);
  const ofKind = (kind) => sorted.filter((s) => s.kind === kind);
  const start = ofKind('new')[0];
  const firstProgress = ofKind('progress')[0];
  const firstDone = ofKind('done')[0];
  const reopen = ofKind('reopen')[0] ?? firstProgress;
  const ids = new Set(sorted.map((s) => s.id));

  const edges = [];
  const add = (from, to, extra = {}) => { if (from && to && from !== to && ids.has(from) && ids.has(to)) edges.push({ from, to, system: false, ...extra }); };
  for (const [from, targets] of Object.entries(transitions)) targets.forEach((to) => add(Number(from), to));
  if (start && firstProgress) add(start.id, firstProgress.id, { system: true, label: 'ditugaskan' });
  for (const c of ofKind('confirm')) {
    add(c.id, firstDone?.id, { system: true, label: 'setuju / otomatis' });
    add(c.id, reopen?.id, { system: true, label: 'ditolak' });
  }
  for (const w of ofKind('waiting')) {
    const sources = edges.filter((e) => e.to === w.id && !e.system).map((e) => e.from);
    sources.forEach((src, i) => add(w.id, src, { system: true, resume: true, label: i === 0 ? 'pemohon membalas' : '' }));
  }

  // kedalaman kolom: BFS dari status awal lewat jalur maju (tanpa jalur "kembali")
  const depth = new Map(start ? [[start.id, 0]] : []);
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.shift();
    for (const e of edges) if (e.from === id && !e.resume && !depth.has(e.to)) { depth.set(e.to, depth.get(id) + 1); queue.push(e.to); }
  }
  const maxDepth = Math.max(0, ...depth.values());
  for (const s of sorted) if (!depth.has(s.id)) depth.set(s.id, maxDepth + 1);

  const rows = new Map();
  const nodes = sorted.map((s) => {
    const col = depth.get(s.id);
    const row = rows.get(col) ?? 0;
    rows.set(col, row + 1);
    return { ...s, col, row, x: PAD + col * (W + GAP_X), y: PAD + row * (H + GAP_Y) };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const maxRows = Math.max(1, ...rows.values());
  const cols = Math.max(1, ...nodes.map((n) => n.col + 1));
  const baseBottom = PAD + maxRows * (H + GAP_Y) - GAP_Y;

  let loops = 0;
  const laidOut = edges.map((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const forward = b.x > a.x;
    if (forward) {
      const x1 = a.x + W; const y1 = a.y + H / 2; const x2 = b.x; const y2 = b.y + H / 2;
      const dx = Math.max(36, (x2 - x1) / 2);
      return { ...e, back: false, path: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, lx: (x1 + x2) / 2, ly: (y1 + y2) / 2 - 7 };
    }
    const depthY = baseBottom + 34 + loops * LOOP;
    loops += 1;
    const x1 = a.x + W / 2; const y1 = a.y + H; const x2 = b.x + W / 2; const y2 = b.y + H;
    return { ...e, back: true, path: `M${x1},${y1} C${x1},${depthY} ${x2},${depthY} ${x2},${y2}`, lx: (x1 + x2) / 2, ly: (y1 + y2 + 6 * depthY) / 8 - 4 };
  });
  return { nodes, edges: laidOut, width: PAD * 2 + cols * W + (cols - 1) * GAP_X, height: baseBottom + PAD + (loops ? 34 + loops * LOOP : 0) };
}

let counter = 0;
const clip = (text, max = 22) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * renderWorkflowDiagram(statuses, transitions, { currentId, nextIds, visitedIds, interactive, workflowId, caption })
 * visitedIds berurutan sesuai riwayat tiket sehingga jalur yang sudah dilalui ikut disorot.
 */
export function renderWorkflowDiagram(statuses, transitions, { currentId = null, nextIds = [], visitedIds = [], interactive = false, workflowId = null, caption = 'Diagram alur status' } = {}) {
  const layout = layoutWorkflow(statuses, transitions);
  const uid = `wf${(counter += 1)}`;
  const next = new Set(nextIds);
  const visited = new Set(visitedIds);
  const path = new Set(visitedIds.slice(1).map((id, i) => `${visitedIds[i]}-${id}`));
  const focusMode = currentId !== null;
  const nameOf = new Map(layout.nodes.map((n) => [n.id, n.label]));

  const edgesSvg = layout.edges.map((e) => {
    const isVisited = path.has(`${e.from}-${e.to}`);
    const isNext = focusMode && e.from === currentId && next.has(e.to);
    const state = isVisited ? 'is-visited' : isNext ? 'is-next' : focusMode ? 'is-dim' : '';
    const marker = isVisited ? 'visited' : isNext ? 'next' : 'base';
    return `<path class="wf-edge ${e.system ? 'is-system' : ''} ${state}" d="${e.path}" marker-end="url(#${uid}-${marker})"/>`
      + (e.label ? `<text class="wf-label" x="${e.lx}" y="${e.ly}" text-anchor="middle">${esc(e.label)}</text>` : '');
  }).join('');

  const nodesSvg = layout.nodes.map((n) => {
    const state = [n.id === currentId && 'is-current', visited.has(n.id) && 'is-visited', focusMode && next.has(n.id) && 'is-next',
      focusMode && !visited.has(n.id) && !next.has(n.id) && n.id !== currentId && 'is-dim'].filter(Boolean).join(' ');
    const a11y = interactive ? ` role="button" tabindex="0" data-act="status-edit" data-id="${n.id}" data-wf="${workflowId}" aria-label="Ubah status ${esc(n.label)}"` : '';
    const caption_ = n.id === currentId ? `${KIND_CAPTION[n.kind]}, posisi saat ini` : KIND_CAPTION[n.kind];
    return `<g class="wf-node tone-${n.tone} ${state}"${a11y}><title>${esc(n.label)}, ${esc(caption_)}</title>`
      + `<rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="14"/>`
      + `<text x="${n.x + 14}" y="${n.y + 24}">${esc(clip(n.label))}</text>`
      + `<text class="wf-kind" x="${n.x + 14}" y="${n.y + 42}">${esc(caption_)}</text>`
      + (visited.has(n.id) && n.id !== currentId ? `<text class="wf-check" x="${n.x + W - 24}" y="${n.y + 24}" aria-hidden="true">✓</text>` : '')
      + '</g>';
  }).join('');

  const marker = (kind) => `<marker id="${uid}-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="wf-arrow${kind === 'base' ? '' : `-${kind}`}"/></marker>`;
  const outline = layout.nodes.map((n) => {
    const outs = layout.edges.filter((e) => e.from === n.id).map((e) => `${nameOf.get(e.to)}${e.system ? ' (otomatis)' : ''}`);
    return `<li>${esc(n.label)}: ${outs.length ? `dapat berpindah ke ${esc(outs.join(', '))}` : 'akhir alur'}</li>`;
  }).join('');

  return html`<figure class="wf-figure">
    <div class="wf-scroll" tabindex="0" role="region" aria-label="${caption}, dapat digulir">
      <svg class="wf-diagram" role="img" aria-labelledby="${uid}-t" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
        <title id="${uid}-t">${caption}</title><defs>${raw(marker('base') + marker('visited') + marker('next'))}</defs>${raw(edgesSvg + nodesSvg)}
      </svg>
    </div>
    <figcaption class="wf-legend" aria-hidden="true">
      <span><i></i>Dipindah oleh agen</span><span><i class="k-system"></i>Otomatis oleh sistem</span>
      ${focusMode ? html`<span><i class="k-visited"></i>Sudah dilalui</span><span><i class="k-next"></i>Langkah berikutnya</span>` : ''}
    </figcaption>
    <ul class="sr-only">${raw(outline)}</ul>
  </figure>`;
}
