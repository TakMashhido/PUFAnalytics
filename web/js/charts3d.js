// Dependency-free interactive 3D charts rendered as SVG (so they export as vector graphics).
// Orthographic projection, painter's-algorithm depth sorting, drag to rotate, wheel / buttons to zoom.
import { cssVar, SERIES, fmtNum, colorScale, register, showTip, hideTip } from './charts.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function text(parent, x, y, str, attrs = {}) { const t = el('text', { x, y, ...attrs }, parent); t.textContent = str; return t; }
function niceTicks(lo, hi, count = 4) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag, out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
const finite = (v) => v !== null && v !== undefined && Number.isFinite(v);

/**
 * Shared scene: maps data to the cube [-1,1]^3 and handles rotation, zoom, axes and labels.
 * spec.view = {az, el, zoom} is kept on the container so re-renders preserve the camera.
 */
function scene(container, spec, drawContent) {
  const W = Math.max(container.clientWidth || 600, 260), H = spec.height || Math.min(Math.max(W * 0.72, 300), 460);
  const view = container._view || (container._view = { az: -0.75, el: 0.52, zoom: 1 });
  const ink = cssVar('--ink-2'), muted = cssVar('--ink-3'), grid = cssVar('--grid'), axis = cssVar('--axis'), surface = cssVar('--clay');
  const legendW = spec.legend === false ? 0 : 64;
  const cx = (W - legendW) / 2, cy = H / 2 - 6, S = Math.min(W - legendW, H) * 0.29 * view.zoom;
  const ca = Math.cos(view.az), sa = Math.sin(view.az), ce = Math.cos(view.el), se = Math.sin(view.el);
  // world (x, y, z) in [-1,1]; z is up. Returns screen [sx, sy, depth] (larger depth = closer to viewer).
  const P = (x, y, z) => {
    const xr = x * ca - y * sa, yr = x * sa + y * ca;
    const yv = yr * ce - z * se, zv = yr * se + z * ce;
    return [cx + xr * S, cy - zv * S, -yv];
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': spec.ariaLabel || 'interactive 3D chart', 'font-family': cssVar('--font'), 'font-size': 11, style: 'touch-action:none;cursor:grab' });
  el('rect', { x: 0, y: 0, width: W, height: H, fill: surface }, svg);

  // back walls & floor grid (only the faces facing away from the viewer)
  const back = el('g', {}, svg);
  const wallX = P(-1, 0, 0)[2] < P(1, 0, 0)[2] ? -1 : 1, wallY = P(0, -1, 0)[2] < P(0, 1, 0)[2] ? -1 : 1;
  const line = (a, b, attrs) => { const p = P(...a), q = P(...b); el('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], ...attrs }, back); };
  const tx = spec.xTicks, ty = spec.yTicks, tz = spec.zTicks;
  for (const t of tx) { const u = spec.mapX(t); line([u, -1, -1], [u, 1, -1], { stroke: grid }); line([u, wallY, -1], [u, wallY, 1], { stroke: grid }); }
  for (const t of ty) { const u = spec.mapY(t); line([-1, u, -1], [1, u, -1], { stroke: grid }); line([wallX, u, -1], [wallX, u, 1], { stroke: grid }); }
  for (const t of tz) { const u = spec.mapZ(t); line([-1, wallY, u], [1, wallY, u], { stroke: grid }); line([wallX, -1, u], [wallX, 1, u], { stroke: grid }); }
  for (const [a, b] of [[[-1, -1, -1], [1, -1, -1]], [[1, -1, -1], [1, 1, -1]], [[1, 1, -1], [-1, 1, -1]], [[-1, 1, -1], [-1, -1, -1]]]) line(a, b, { stroke: axis });

  drawContent({ svg, P, S, view, surface });

  // axis tick labels on the front edges
  const lab = el('g', {}, svg);
  const fx = -wallY * 1.13, fy = -wallX * 1.13;
  for (const t of tx) { const p = P(spec.mapX(t), fx, -1); text(lab, p[0], p[1] + 4, (spec.xFormat || fmtNum)(t), { 'text-anchor': 'middle', fill: muted, 'font-size': 10 }); }
  for (const t of ty) { const p = P(fy, spec.mapY(t), -1); text(lab, p[0], p[1] + 4, (spec.yFormat || fmtNum)(t), { 'text-anchor': 'middle', fill: muted, 'font-size': 10 }); }
  for (const t of tz) { const p = P(-wallX, wallY, spec.mapZ(t)); text(lab, p[0] + (p[0] < cx ? -6 : 6), p[1] + 4, (spec.zFormat || fmtNum)(t), { 'text-anchor': p[0] < cx ? 'end' : 'start', fill: muted, 'font-size': 10 }); }
  const lx = P(0, fx * 1.25, -1), ly = P(fy * 1.25, 0, -1), lz = P(-wallX, wallY, 1.22);
  text(lab, lx[0], lx[1] + 8, spec.xLabel || 'x', { 'text-anchor': 'middle', fill: ink, 'font-size': 12, 'font-weight': 700 });
  text(lab, ly[0], ly[1] + 8, spec.yLabel || 'y', { 'text-anchor': 'middle', fill: ink, 'font-size': 12, 'font-weight': 700 });
  text(lab, lz[0], lz[1], spec.zLabel || 'z', { 'text-anchor': 'middle', fill: ink, 'font-size': 12, 'font-weight': 700 });

  // colour legend
  if (legendW && spec.colorDomain) {
    const sc = colorScale(spec.scale || 'sequential'), gx = W - legendW + 14, gy = 36, gh = H - 86;
    const id = 'g3' + Math.random().toString(36).slice(2), grad = el('linearGradient', { id, x1: 0, y1: 1, x2: 0, y2: 0 }, el('defs', {}, svg));
    for (let i = 0; i <= 10; i++) el('stop', { offset: `${i * 10}%`, 'stop-color': `rgb(${sc(i / 10).join(',')})` }, grad);
    el('rect', { x: gx, y: gy, width: 12, height: gh, rx: 4, fill: `url(#${id})` }, svg);
    const [lo, hi] = spec.colorDomain;
    text(svg, gx + 16, gy + 8, (spec.zFormat || fmtNum)(hi), { fill: muted, 'font-size': 10 });
    text(svg, gx + 16, gy + gh, (spec.zFormat || fmtNum)(lo), { fill: muted, 'font-size': 10 });
  }
  text(svg, W - 8, 14, 'drag to rotate · scroll to zoom', { fill: muted, 'font-size': 10, 'text-anchor': 'end' });

  // interaction
  let drag = null, raf = 0;
  const rerender = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; container._render(); }); };
  svg.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, az: view.az, el: view.el }; svg.setPointerCapture(ev.pointerId); svg.style.cursor = 'grabbing'; hideTip(); });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    view.az = drag.az - (ev.clientX - drag.x) * 0.01;
    view.el = Math.max(-0.1, Math.min(1.5, drag.el + (ev.clientY - drag.y) * 0.01));
    rerender();
  });
  svg.addEventListener('pointerup', () => { drag = null; svg.style.cursor = 'grab'; });
  svg.addEventListener('wheel', (ev) => { ev.preventDefault(); view.zoom = Math.max(0.5, Math.min(2.5, view.zoom * (ev.deltaY < 0 ? 1.08 : 0.93))); rerender(); }, { passive: false });
  svg._dragging = () => !!drag;
  return svg;
}

function controls(container) {
  if (container._controls) return;
  const bar = document.createElement('div'); bar.className = 'chart3d-tools no-print';
  const mk = (label, fn, aria) => { const b = document.createElement('button'); b.className = 'btn small ghost'; b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', aria); b.onclick = fn; bar.appendChild(b); return b; };
  const v = () => container._view || (container._view = { az: -0.75, el: 0.52, zoom: 1 });
  mk('⟲ Reset', () => { Object.assign(v(), { az: -0.75, el: 0.52, zoom: 1 }); container._render(); }, 'Reset view');
  mk('Top', () => { Object.assign(v(), { az: 0, el: 1.5 }); container._render(); }, 'Top view');
  mk('Front', () => { Object.assign(v(), { az: 0, el: 0.02 }); container._render(); }, 'Front view');
  mk('＋', () => { v().zoom = Math.min(2.5, v().zoom * 1.15); container._render(); }, 'Zoom in');
  mk('－', () => { v().zoom = Math.max(0.5, v().zoom / 1.15); container._render(); }, 'Zoom out');
  const spin = mk('▶ Spin', () => {
    if (container._spin) { cancelAnimationFrame(container._spin); container._spin = 0; spin.textContent = '▶ Spin'; return; }
    spin.textContent = '■ Stop';
    const step = () => { if (!container.isConnected) return; v().az += 0.012; container._render(); container._spin = requestAnimationFrame(step); };
    container._spin = requestAnimationFrame(step);
  }, 'Toggle auto-rotation');
  container._controls = bar;
}
function mount(container, svg) {
  controls(container);
  container.innerHTML = '';
  container.appendChild(container._controls);
  container.appendChild(svg);
}

/**
 * Surface plot. spec: {x[], y[], z[][] (z[j][i] at y[j], x[i]; null = gap), xLabel, yLabel, zLabel,
 * zFormat, xFormat, yFormat, scale, zDomain, height, tip(i,j,v)}
 */
export function surface3d(container, spec) {
  register(container, () => surface3d(container, spec), spec);
  const nx = spec.x.length, ny = spec.y.length, vals = spec.z.flat().filter(finite);
  const [zlo, zhi] = spec.zDomain || [Math.min(...vals), Math.max(...vals)];
  const zr = zhi - zlo || 1, xr = [Math.min(...spec.x), Math.max(...spec.x)], yr = [Math.min(...spec.y), Math.max(...spec.y)];
  const mapX = (v) => -1 + (2 * (v - xr[0])) / (xr[1] - xr[0] || 1), mapY = (v) => -1 + (2 * (v - yr[0])) / (yr[1] - yr[0] || 1), mapZ = (v) => -1 + (2 * (v - zlo)) / zr;
  const sc = colorScale(spec.scale || 'sequential');
  const full = { ...spec, mapX, mapY, mapZ, colorDomain: [zlo, zhi], xTicks: spec.xTicks || niceTicks(xr[0], xr[1]), yTicks: spec.yTicks || niceTicks(yr[0], yr[1]), zTicks: niceTicks(zlo, zhi) };
  const svg = scene(container, full, ({ svg: root, P, surface }) => {
    const quads = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], zs = c.map(([a, b]) => spec.z[b][a]);
      if (!zs.every(finite)) continue;
      const pts = c.map(([a, b], k) => P(mapX(spec.x[a]), mapY(spec.y[b]), mapZ(Math.max(zlo, Math.min(zhi, zs[k])))));
      const zm = zs.reduce((s, v) => s + v, 0) / 4;
      quads.push({ pts, depth: pts.reduce((s, p) => s + p[2], 0) / 4, zm, i, j });
    }
    quads.sort((a, b) => a.depth - b.depth);
    const g = el('g', {}, root), dense = quads.length > 1600;
    for (const q of quads) {
      const t = Math.max(0, Math.min(1, (q.zm - zlo) / zr)), rgb = sc(t);
      const p = el('path', { d: `M${q.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`, fill: `rgb(${rgb.join(',')})`, stroke: dense ? `rgb(${rgb.join(',')})` : surface, 'stroke-width': dense ? 0.4 : 0.6, 'stroke-opacity': dense ? 1 : 0.55, 'data-i': q.i, 'data-j': q.j }, g);
      p.dataset.v = q.zm;
    }
    g.addEventListener('pointermove', (ev) => {
      if (root._dragging && root._dragging()) return;
      const t = ev.target; if (!t.dataset || t.dataset.i === undefined) return;
      const i = +t.dataset.i, j = +t.dataset.j, v = spec.z[j][i];
      showTip(spec.tip ? spec.tip(i, j, v) : `<div class="tip-head">${spec.xLabel} ${fmtNum(spec.x[i], 4)} · ${spec.yLabel} ${fmtNum(spec.y[j], 4)}</div>${spec.zLabel}<b style="margin-left:8px">${(spec.zFormat || fmtNum)(v)}</b>`, ev);
    });
    g.addEventListener('pointerleave', hideTip);
  });
  mount(container, svg);
  container._csv = () => [[`${spec.yLabel}\\${spec.xLabel}`, ...spec.x].join(','), ...spec.y.map((yv, j) => [yv, ...spec.z[j].map((v) => (finite(v) ? v : ''))].join(','))].join('\n');
  container._table = null;
  return svg;
}

/** 3D bar chart on a grid (e.g. a distance matrix). Same spec as surface3d. */
export function bars3d(container, spec) {
  register(container, () => bars3d(container, spec), spec);
  const nx = spec.x.length, ny = spec.y.length, vals = spec.z.flat().filter(finite);
  const [zlo, zhi] = spec.zDomain || [Math.min(0, ...vals), Math.max(...vals)];
  const zr = zhi - zlo || 1, mapX = (v) => -1 + (2 * (v + 0.5)) / nx, mapY = (v) => -1 + (2 * (v + 0.5)) / ny, mapZ = (v) => -1 + (2 * (v - zlo)) / zr;
  const sc = colorScale(spec.scale || 'sequential');
  const full = { ...spec, mapX, mapY, mapZ, colorDomain: [zlo, zhi], xTicks: niceTicks(0, nx - 1).filter(Number.isInteger), yTicks: niceTicks(0, ny - 1).filter(Number.isInteger), zTicks: niceTicks(zlo, zhi) };
  const svg = scene(container, full, ({ svg: root, P, surface }) => {
    const hw = 0.42 * (2 / nx), hd = 0.42 * (2 / ny), boxes = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = spec.z[j][i]; if (!finite(v)) continue;
      const x0 = mapX(i) - hw, x1 = mapX(i) + hw, y0 = mapY(j) - hd, y1 = mapY(j) + hd, z0 = -1, z1 = mapZ(Math.max(zlo, Math.min(zhi, v)));
      boxes.push({ i, j, v, x0, x1, y0, y1, z0, z1, depth: P(mapX(i), mapY(j), (z0 + z1) / 2)[2] });
    }
    boxes.sort((a, b) => a.depth - b.depth);
    const g = el('g', {}, root);
    for (const b of boxes) {
      const rgb = sc(Math.max(0, Math.min(1, (b.v - zlo) / zr)));
      const faces = [
        [[b.x0, b.y0, b.z1], [b.x1, b.y0, b.z1], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1], 1],
        [[b.x0, b.y0, b.z0], [b.x1, b.y0, b.z0], [b.x1, b.y0, b.z1], [b.x0, b.y0, b.z1], 0.78],
        [[b.x0, b.y1, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x0, b.y1, b.z1], 0.78],
        [[b.x0, b.y0, b.z0], [b.x0, b.y1, b.z0], [b.x0, b.y1, b.z1], [b.x0, b.y0, b.z1], 0.66],
        [[b.x1, b.y0, b.z0], [b.x1, b.y1, b.z0], [b.x1, b.y1, b.z1], [b.x1, b.y0, b.z1], 0.66],
      ].map((f) => ({ pts: f.slice(0, 4).map((p) => P(...p)), shade: f[4] })).map((f) => ({ ...f, depth: f.pts.reduce((s, p) => s + p[2], 0) / 4 })).sort((a, c) => a.depth - c.depth);
      for (const f of faces) el('path', { d: `M${f.pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z`, fill: `rgb(${rgb.map((c) => Math.round(c * f.shade)).join(',')})`, stroke: surface, 'stroke-width': 0.5, 'stroke-opacity': 0.5, 'data-i': b.i, 'data-j': b.j }, g);
    }
    g.addEventListener('pointermove', (ev) => {
      if (root._dragging && root._dragging()) return;
      const t = ev.target; if (!t.dataset || t.dataset.i === undefined) return;
      const i = +t.dataset.i, j = +t.dataset.j;
      showTip(spec.tip ? spec.tip(i, j, spec.z[j][i]) : `<div class="tip-head">(${i}, ${j})</div><b>${fmtNum(spec.z[j][i], 4)}</b>`, ev);
    });
    g.addEventListener('pointerleave', hideTip);
  });
  mount(container, svg);
  container._csv = () => spec.z.map((r) => r.map((v) => (finite(v) ? v : '')).join(',')).join('\n');
  container._table = null;
  return svg;
}

/** 3D scatter. spec: {series:[{name, points:[[x,y,z,label?]], slot}], xLabel, yLabel, zLabel, dropLines, height} */
export function scatter3d(container, spec) {
  register(container, () => scatter3d(container, spec), spec);
  const all = spec.series.flatMap((s) => s.points), ext = (k) => { const v = all.map((p) => p[k]).filter(finite); let lo = Math.min(...v), hi = Math.max(...v); if (lo === hi) { lo -= 1; hi += 1; } const pad = (hi - lo) * 0.05; return [lo - pad, hi + pad]; };
  const [xr, yr, zr] = [ext(0), ext(1), ext(2)];
  const m = (r) => (v) => -1 + (2 * (v - r[0])) / (r[1] - r[0]);
  const full = { ...spec, legend: false, mapX: m(xr), mapY: m(yr), mapZ: m(zr), xTicks: niceTicks(xr[0], xr[1], 3), yTicks: niceTicks(yr[0], yr[1], 3), zTicks: niceTicks(zr[0], zr[1], 3) };
  const colors = SERIES();
  const svg = scene(container, full, ({ svg: root, P, surface }) => {
    const pts = [];
    spec.series.forEach((s, k) => s.points.forEach((p) => { if (p.slice(0, 3).every(finite)) pts.push({ p, s, c: colors[(s.slot ?? k) % 8], scr: P(full.mapX(p[0]), full.mapY(p[1]), full.mapZ(p[2])), floor: P(full.mapX(p[0]), full.mapY(p[1]), -1) }); }));
    pts.sort((a, b) => a.scr[2] - b.scr[2]);
    const g = el('g', {}, root);
    if (spec.dropLines !== false) for (const q of pts) { el('line', { x1: q.scr[0], y1: q.scr[1], x2: q.floor[0], y2: q.floor[1], stroke: q.c, 'stroke-opacity': 0.35 }, g); el('circle', { cx: q.floor[0], cy: q.floor[1], r: 2, fill: q.c, 'fill-opacity': 0.35 }, g); }
    for (const q of pts) {
      const c = el('circle', { cx: q.scr[0], cy: q.scr[1], r: 5.5, fill: q.c, stroke: surface, 'stroke-width': 1.8 }, g);
      c.addEventListener('pointermove', (ev) => { if (!(root._dragging && root._dragging())) showTip(`<div class="tip-head">${q.p[3] ?? q.s.name}</div>${spec.xLabel}<b style="margin-left:8px">${fmtNum(q.p[0], 4)}</b><br>${spec.yLabel}<b style="margin-left:8px">${fmtNum(q.p[1], 4)}</b><br>${spec.zLabel}<b style="margin-left:8px">${fmtNum(q.p[2], 4)}</b>`, ev); });
      c.addEventListener('pointerleave', hideTip);
    }
    if (spec.series.length > 1) { let lx = 12; spec.series.forEach((s, k) => { el('rect', { x: lx, y: 8, width: 11, height: 11, rx: 3, fill: colors[(s.slot ?? k) % 8] }, root); const t = el('text', { x: lx + 16, y: 17, fill: cssVar('--ink-2') }, root); t.textContent = s.name; lx += 30 + s.name.length * 6.6; }); }
  });
  mount(container, svg);
  container._csv = () => ['series,label,x,y,z', ...spec.series.flatMap((s) => s.points.map((p) => [s.name, p[3] ?? '', p[0], p[1], p[2]].join(',')))].join('\n');
  container._table = null;
  return svg;
}
