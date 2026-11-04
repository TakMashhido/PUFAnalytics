// PUFAnalytics web application — state, routing, background tasks and persistence.
import { $, esc, ICONS, toast } from './ui.js';
import { rerenderAll } from './charts.js';
import { loadAll, saveEntry, deleteEntry, prefs } from './store.js';
import { datasetSummary } from './core/dataset.js';
import { VIEWS } from './views.js';

const DEFAULT_SETTINGS = { reference: 'first', bootstrap: 1000, alpha: 0.05, nistAlpha: 0.01, seed: 12345 };
const ROUTES = [
  ['overview', 'Overview', 'home'], ['data', 'Data & simulation', 'data'], ['metrics', 'Quality metrics', 'metrics'],
  ['identify', 'Identification', 'id'], ['randomness', 'Randomness & entropy', 'random'], ['figures', 'Figure studio', 'image'], ['sweep', 'Simulation studio', 'dice'], ['attack', 'Attack lab', 'attack'],
  ['keys', 'Key generation', 'key'], ['compare', 'Compare', 'compare'], ['report', 'Report & export', 'report'], ['docs', 'Methods & docs', 'docs'],
];

const state = { entries: [], activeId: prefs.get('active', null), settings: { ...DEFAULT_SETTINGS, ...prefs.get('settings', {}) }, ui: {} };

// ------------------------------------------------------------- worker RPC
let worker = null, seq = 0; const pending = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const { id, ok, result, error, progress, label } = ev.data; const p = pending.get(id); if (!p) return;
    if (progress !== undefined) { p.onProgress?.(progress, label); setProgress(progress); return; }
    pending.delete(id); if (!pending.size) setProgress(null);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Worker failed')); pending.clear(); setProgress(null); };
  return worker;
}
function runTask(type, payload, onProgress) {
  return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, onProgress }); setProgress(0.02); getWorker().postMessage({ id, type, payload }); });
}
function setProgress(p) {
  const bar = $('#progress'); if (!bar) return;
  if (p === null) { bar.classList.remove('on'); bar.firstElementChild.style.width = '0'; return; }
  bar.classList.add('on'); bar.firstElementChild.style.width = `${Math.round(Math.max(p, 0.04) * 100)}%`;
}

// ------------------------------------------------------------- dataset entries
const active = () => state.entries.find((e) => e.id === state.activeId) || null;
const settingsKey = () => JSON.stringify(state.settings);
async function analyzeEntry(entry, quiet = false) {
  try {
    entry.result = await runTask('analyze', { dataset: entry.ds, options: state.settings });
    entry.settingsKey = settingsKey();
    await saveEntry(entry);
    if (!quiet) toast(`Analysis of “${entry.ds.name}” complete`, 'success');
  } catch (err) { toast(`Analysis failed: ${err.message}`, 'error'); throw err; }
}
async function addDataset(ds, { activate = true, go = null } = {}) {
  const entry = { id: `ds-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, ds, result: null, created: Date.now() };
  state.entries.push(entry);
  if (activate) setActive(entry.id, false);
  renderChrome();
  await analyzeEntry(entry);
  if (go) location.hash = `#/${go}`; else render();
  return entry;
}
function setActive(id, rerender = true) { state.activeId = id; prefs.set('active', id); renderChrome(); if (rerender) render(); }
async function removeEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id); await deleteEntry(id);
  if (state.activeId === id) setActive(state.entries.at(-1)?.id || null, false);
  renderChrome(); render();
}
async function renameEntry(id, name) { const e = state.entries.find((x) => x.id === id); if (!e) return; e.ds.name = name; if (e.result) e.result.meta.name = name; await saveEntry(e); renderChrome(); render(); }
async function applySettings(s) {
  state.settings = { ...state.settings, ...s }; prefs.set('settings', state.settings);
  const e = active(); if (e) { await analyzeEntry(e, true); toast('Metrics recomputed with new settings', 'success'); }
  render();
}

// ------------------------------------------------------------- routing / chrome
function route() { const r = (location.hash.match(/^#\/(\w+)/) || [])[1]; return ROUTES.some((x) => x[0] === r) ? r : 'overview'; }
function renderNav() {
  const cur = route();
  $('#nav').innerHTML = ROUTES.map(([k, label, ic], i) => `${k === 'docs' ? '<div class="nav-sep"></div>' : ''}<a href="#/${k}" ${k === cur ? 'aria-current="page"' : ''}>${ICONS[ic]}<span>${label}</span></a>`).join('');
}
function renderChrome() {
  renderNav();
  const sel = $('#ds-select');
  sel.innerHTML = state.entries.length ? state.entries.map((e) => `<option value="${e.id}" ${e.id === state.activeId ? 'selected' : ''}>${esc(e.ds.name)}</option>`).join('') : '<option>No dataset loaded</option>';
  sel.disabled = !state.entries.length;
  const e = active(), side = $('#side-dataset');
  if (e) { const s = datasetSummary(e.ds); side.innerHTML = `<div class="muted small" style="font-weight:800">ACTIVE DATASET</div><b style="overflow-wrap:anywhere">${esc(e.ds.name)}</b><div>${s.devices} devices · ${s.bits} bits<br>${s.measurements} measurements · ${s.conditions.length} condition${s.conditions.length > 1 ? 's' : ''}</div>`; }
  else side.innerHTML = '<div class="muted small" style="font-weight:800">NO DATASET</div>Simulate or import data to begin.';
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#theme-btn').innerHTML = dark ? ICONS.sun : ICONS.moon;
}
let lastRoute = null;
function render() {
  const r = route(), [, title] = ROUTES.find((x) => x[0] === r);
  document.title = `${title} · PUFAnalytics`;
  $('#view-title').textContent = title;
  renderNav();
  const view = $('#view');
  if (lastRoute !== r) { view.classList.remove('view'); void view.offsetWidth; view.classList.add('view'); }
  VIEWS[r](ctx, view);
  if (lastRoute !== r) window.scrollTo({ top: 0 });
  lastRoute = r;
  closeMenu();
}
function closeMenu() { $('#sidebar').classList.remove('open'); $('#overlay').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); }

const ctx = { state, active, runTask, addDataset, analyzeEntry, setActive, removeEntry, renameEntry, applySettings, render, renderChrome, saveEntry };

// ------------------------------------------------------------- boot
async function boot() {
  $('#menu-btn').innerHTML = ICONS.menu; $('#gh-link').innerHTML = ICONS.github;
  $('#menu-btn').addEventListener('click', () => { const o = !$('#sidebar').classList.contains('open'); $('#sidebar').classList.toggle('open', o); $('#overlay').classList.toggle('open', o); $('#menu-btn').setAttribute('aria-expanded', String(o)); });
  $('#overlay').addEventListener('click', closeMenu);
  $('#theme-btn').addEventListener('click', () => {
    const root = document.documentElement, dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark'; prefs.set('theme', root.dataset.theme); renderChrome(); rerenderAll();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { renderChrome(); rerenderAll(); });
  $('#ds-select').addEventListener('change', (ev) => setActive(ev.target.value));
  window.addEventListener('hashchange', render);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenu(); });

  try { state.entries = (await loadAll()).sort((a, b) => a.created - b.created); } catch { state.entries = []; }
  if (!state.entries.some((e) => e.id === state.activeId)) state.activeId = state.entries.at(-1)?.id || null;
  renderChrome(); render();
  const e = active();
  if (e && (!e.result || e.settingsKey !== settingsKey())) { await analyzeEntry(e, true); render(); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
