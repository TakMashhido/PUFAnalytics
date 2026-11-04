// PUF dataset model & parsing — mirrors pufanalytics/dataset.py.
// A dataset is a plain (structured-cloneable) object:
// { name, deviceIds[], conditions[][], nBits, nMeas[], devices: Uint8Array(R*N)[], challenges, stages, metadata }

const BIN_RE = /^[01]+$/;
const HEX_RE = /^(0x)?[0-9a-fA-F]+$/;
const HEADER = {
  device: ['device', 'device_id', 'puf', 'puf_id', 'chip', 'instance', 'id'],
  measurement: ['measurement', 'sample', 'repeat', 'repetition', 'readout', 'trial', 'index'],
  condition: ['condition', 'env', 'environment', 'corner', 'temperature', 'temp', 'voltage'],
  response: ['response', 'bits', 'value', 'data', 'hex', 'bitstring'],
};

export function parseResponse(token, fmt = 'auto') {
  let t = String(token).trim().replace(/[ _]/g, '');
  if (fmt === 'bin' || (fmt === 'auto' && BIN_RE.test(t) && !t.toLowerCase().startsWith('0x'))) {
    if (!BIN_RE.test(t)) throw new Error(`Invalid binary response: "${token}"`);
    const o = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t.charCodeAt(i) - 48; return o;
  }
  if (!HEX_RE.test(t)) throw new Error(`Invalid response token: "${token}"`);
  if (t.toLowerCase().startsWith('0x')) t = t.slice(2);
  const o = new Uint8Array(t.length * 4);
  for (let i = 0; i < t.length; i++) { const v = parseInt(t[i], 16); for (let b = 0; b < 4; b++) o[i * 4 + b] = (v >> (3 - b)) & 1; }
  return o;
}

function split(line) {
  for (const sep of [',', ';', '\t']) if (line.includes(sep)) return line.split(sep).map((c) => c.trim());
  return line.trim().split(/\s+/);
}
function matchHeader(cells) {
  const map = {};
  cells.forEach((c, i) => {
    const k = c.trim().toLowerCase();
    for (const [f, al] of Object.entries(HEADER)) if (al.includes(k) && !(f in map)) map[f] = i;
  });
  return 'response' in map ? map : null;
}

export function parseText(text, fmt = 'auto', name = 'dataset') {
  let lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (!lines.length) throw new Error('No data found');
  const header = matchHeader(split(lines[0]));
  if (header) lines = lines.slice(1);
  const recs = [];
  lines.forEach((line, row) => {
    const cells = split(line).filter((c) => c !== '');
    let dev, meas = null, cond = null, resp;
    if (header) {
      dev = 'device' in header ? cells[header.device] : String(row);
      meas = 'measurement' in header ? cells[header.measurement] : null;
      cond = 'condition' in header ? cells[header.condition] : null;
      resp = cells[header.response];
      if (resp === undefined) throw new Error(`Missing response on line ${row + 2}`);
    } else if (cells.length > 4 && cells.every((c) => c === '0' || c === '1')) { dev = String(row); resp = cells.join(''); }
    else if (cells.length === 1) { dev = String(row); resp = cells[0]; }
    else if (cells.length === 2) { [dev, resp] = cells; }
    else if (cells.length === 3) { [dev, meas, resp] = cells; }
    else if (cells.length === 4) { [dev, meas, cond, resp] = cells; }
    else throw new Error(`Cannot interpret line ${row + 1}: "${line.slice(0, 60)}"`);
    recs.push([dev, meas, cond, resp]);
  });
  if (fmt === 'auto') fmt = recs.every((r) => BIN_RE.test(r[3].replace(/[ _]/g, ''))) ? 'bin' : 'hex';
  const order = [], grouped = new Map();
  for (const [dev, meas, cond, resp] of recs) {
    if (!grouped.has(dev)) { grouped.set(dev, []); order.push(dev); }
    grouped.get(dev).push([meas, cond, parseResponse(resp, fmt)]);
  }
  const responses = [], conditions = [];
  for (const dev of order) {
    let items = grouped.get(dev);
    if (items.every((it) => it[0] !== null)) {
      const key = (it) => { const v = Number(it[0]); return Number.isNaN(v) ? [1, it[0]] : [0, v]; };
      items = items.map((it, i) => [it, i]).sort((a, b) => {
        const ka = key(a[0]), kb = key(b[0]);
        if (ka[0] !== kb[0]) return ka[0] - kb[0];
        if (ka[1] < kb[1]) return -1; if (ka[1] > kb[1]) return 1; return a[1] - b[1];
      }).map((x) => x[0]);
    }
    responses.push(items.map((it) => it[2]));
    conditions.push(items.map((it) => (it[1] === null ? 'nominal' : it[1])));
  }
  return makeDataset(responses, { deviceIds: order, conditions, name });
}

/** responses: Array(devices) of Array(measurements) of Uint8Array(bits). */
export function makeDataset(responses, { deviceIds, conditions, challenges = null, stages = 0, name = 'dataset', metadata = {} } = {}) {
  if (!responses.length) throw new Error('At least one device is required');
  const nBits = responses[0][0]?.length || 0;
  if (!nBits) throw new Error('Responses must contain at least one bit');
  const devices = [], nMeas = [];
  responses.forEach((dev, d) => {
    if (!dev.length) throw new Error(`Device ${d} has no measurements`);
    const arr = new Uint8Array(dev.length * nBits);
    dev.forEach((r, m) => {
      if (r.length !== nBits) throw new Error(`All responses must have the same length (device ${deviceIds ? deviceIds[d] : d} has ${r.length} bits, expected ${nBits})`);
      arr.set(r, m * nBits);
    });
    devices.push(arr); nMeas.push(dev.length);
  });
  return {
    name,
    deviceIds: deviceIds ? deviceIds.map(String) : devices.map((_, i) => `D${i}`),
    conditions: conditions || nMeas.map((m) => new Array(m).fill('nominal')),
    nBits, nMeas, devices, challenges, stages, metadata,
  };
}

export const nDevices = (ds) => ds.devices.length;
export const measurement = (ds, d, m) => ds.devices[d].subarray(m * ds.nBits, (m + 1) * ds.nBits);
export const hasRepeats = (ds) => ds.nMeas.some((m) => m > 1);
export function conditionLabels(ds) { const s = []; for (const c of ds.conditions) for (const x of c) if (!s.includes(x)) s.push(x); return s; }

/** Reference responses as Uint8Array(D*N). method: 'first' | 'majority' */
export function reference(ds, method = 'first') {
  const N = ds.nBits, D = ds.devices.length, out = new Uint8Array(D * N);
  for (let d = 0; d < D; d++) {
    if (method === 'first') out.set(measurement(ds, d, 0), d * N);
    else {
      const R = ds.nMeas[d], arr = ds.devices[d];
      for (let i = 0; i < N; i++) { let s = 0; for (let m = 0; m < R; m++) s += arr[m * N + i]; out[d * N + i] = 2 * s >= R ? 1 : 0; }
    }
  }
  return out;
}

export const bitsToString = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += b[i]; return s; };
export function bitsToHex(b) {
  let s = '0x'; const pad = (4 - (b.length % 4)) % 4;
  const full = new Uint8Array(b.length + pad); full.set(b);
  for (let i = 0; i < full.length; i += 4) s += ((full[i] << 3) | (full[i + 1] << 2) | (full[i + 2] << 1) | full[i + 3]).toString(16);
  return s;
}

export function toCSV(ds, fmt = 'bin') {
  const rows = ['device,measurement,condition,response'];
  ds.devices.forEach((_, d) => {
    for (let m = 0; m < ds.nMeas[d]; m++) {
      const b = measurement(ds, d, m);
      rows.push(`${ds.deviceIds[d]},${m},${ds.conditions[d][m]},${fmt === 'hex' ? bitsToHex(b) : bitsToString(b)}`);
    }
  });
  return rows.join('\n') + '\n';
}

/** JSON layout identical to PUFDataset.to_dict() in Python. */
export function toDict(ds) {
  const ch = [];
  if (ds.challenges) for (let i = 0; i < ds.nBits; i++) ch.push(bitsToString(ds.challenges.subarray(i * ds.stages, (i + 1) * ds.stages)));
  return {
    name: ds.name, device_ids: ds.deviceIds, conditions: ds.conditions,
    responses: ds.devices.map((_, d) => Array.from({ length: ds.nMeas[d] }, (_, m) => bitsToString(measurement(ds, d, m)))),
    challenges: ds.challenges ? ch : null, metadata: ds.metadata,
  };
}
export function fromDict(obj) {
  const responses = obj.responses.map((dev) => (typeof dev === 'string' ? [dev] : dev).map((r) => parseResponse(r, 'bin')));
  let challenges = null, stages = 0;
  if (obj.challenges) {
    stages = obj.challenges[0].length; challenges = new Uint8Array(obj.challenges.length * stages);
    obj.challenges.forEach((c, i) => challenges.set(parseResponse(c, 'bin'), i * stages));
  }
  return makeDataset(responses, { deviceIds: obj.device_ids, conditions: obj.conditions, challenges, stages, name: obj.name || 'dataset', metadata: obj.metadata || {} });
}

export function subsetDevices(ds, idx) {
  return { ...ds, deviceIds: idx.map((i) => ds.deviceIds[i]), conditions: idx.map((i) => ds.conditions[i]), nMeas: idx.map((i) => ds.nMeas[i]), devices: idx.map((i) => ds.devices[i]) };
}
export function datasetSummary(ds) {
  const total = ds.nMeas.reduce((a, b) => a + b, 0);
  return { devices: ds.devices.length, bits: ds.nBits, measurements: total, minMeas: Math.min(...ds.nMeas), maxMeas: Math.max(...ds.nMeas), conditions: conditionLabels(ds), hasChallenges: !!ds.challenges };
}
