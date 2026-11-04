// Minimal IndexedDB persistence for session datasets (falls back to memory).
const DB = 'pufanalytics', STORE = 'datasets';
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await open(); if (!db) return null;
  return new Promise((resolve) => {
    try { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => resolve(r && r.result); t.onerror = () => resolve(null); }
    catch { resolve(null); }
  });
}
export const saveEntry = (e) => tx('readwrite', (s) => s.put(e));
export const deleteEntry = (id) => tx('readwrite', (s) => s.delete(id));
export const loadAll = async () => (await tx('readonly', (s) => s.getAll())) || [];
export const prefs = {
  get(k, d) { try { const v = localStorage.getItem('pufa.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pufa.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
