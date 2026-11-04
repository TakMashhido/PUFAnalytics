// Background computation worker: keeps the UI responsive during heavy analysis.
import { analyze } from './core/analyze.js';
import { simulate } from './core/simulators.js';
import { simulatedAttack, modelingAttack } from './core/attacks.js';
import { sweep } from './core/sweep.js';

self.onmessage = (ev) => {
  const { id, type, payload } = ev.data;
  const progress = (p, label) => self.postMessage({ id, progress: p, label });
  try {
    let result;
    if (type === 'analyze') result = analyze(payload.dataset, payload.options, progress);
    else if (type === 'simulate') result = simulate(payload);
    else if (type === 'attack') {
      const key = { arbiter: 'xor', ff_arbiter: 'loops', interpose: 'y' }[payload.model || 'arbiter'];
      result = payload.xors.map((x, i) => {
        const params = payload.model === 'interpose' ? { x: 1, y: x } : payload.model === 'ff_arbiter' ? { loops: x } : {};
        const r = simulatedAttack({ ...payload, xor: x, params }, (p) => progress((i + p) / payload.xors.length, `${key}=${x}`));
        return { ...r, xor: x, label: { xor: `${x}-XOR`, loops: `${x} loop${x === 1 ? '' : 's'}`, y: `(1,${x})-iPUF` }[key] };
      });
    } else if (type === 'landscape') {
      const { model, variant, stagesList, sizes, test_size, noise, seed } = payload;
      const params = model === 'interpose' ? { x: 1, y: variant } : model === 'ff_arbiter' ? { loops: variant } : {};
      const acc = stagesList.map((k, j) => {
        const r = simulatedAttack({ model, stages: k, xor: model === 'arbiter' ? variant : 1, noise, train_sizes: sizes, test_size, seed, params }, (p) => progress((j + p) / stagesList.length, `k=${k}`));
        return r.test_accuracy;
      });
      result = { stagesList, sizes, acc };
    } else if (type === 'sweep') {
      result = sweep(payload, (p) => progress(p, 'sweep'));
    } else if (type === 'attack-crps') {
      const { challenges, responses, n, k, trainSizes, testSize } = payload;
      result = modelingAttack(challenges, responses, n, k, trainSizes, testSize, 1e-2, (p) => progress(p, 'training'));
    } else throw new Error(`unknown task ${type}`);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
