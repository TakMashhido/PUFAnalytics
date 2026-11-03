// Background computation worker: keeps the UI responsive during heavy analysis.
import { analyze } from './core/analyze.js';
import { simulate } from './core/simulators.js';
import { simulatedAttack, modelingAttack } from './core/attacks.js';

self.onmessage = (ev) => {
  const { id, type, payload } = ev.data;
  const progress = (p, label) => self.postMessage({ id, progress: p, label });
  try {
    let result;
    if (type === 'analyze') result = analyze(payload.dataset, payload.options, progress);
    else if (type === 'simulate') result = simulate(payload);
    else if (type === 'attack') {
      result = payload.xors.map((x, i) => simulatedAttack({ ...payload, xor: x }, (p) => progress((i + p) / payload.xors.length, `XOR-${x}`)));
    } else if (type === 'attack-crps') {
      const { challenges, responses, n, k, trainSizes, testSize } = payload;
      result = modelingAttack(challenges, responses, n, k, trainSizes, testSize, 1e-2, (p) => progress(p, 'training'));
    } else throw new Error(`unknown task ${type}`);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
