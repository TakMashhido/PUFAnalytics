// Minimal NumPy .npy reader (C-order bool/uint8/int/float arrays of rank 2 or 3).
export function parseNpy(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x93 || String.fromCharCode(...bytes.slice(1, 6)) !== 'NUMPY') throw new Error('Not a .npy file');
  const major = bytes[6], dv = new DataView(buffer);
  const hlen = major >= 2 ? dv.getUint32(8, true) : dv.getUint16(8, true), off = major >= 2 ? 12 : 10;
  const header = new TextDecoder().decode(bytes.slice(off, off + hlen));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const fortran = /'fortran_order':\s*True/.test(header);
  const shape = (/'shape':\s*\(([^)]*)\)/.exec(header)?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  if (fortran) throw new Error('Fortran-ordered arrays are not supported; save with np.ascontiguousarray');
  if (shape.length < 2 || shape.length > 3) throw new Error('Expected an array of shape (devices, bits) or (devices, measurements, bits)');
  const data = buffer.slice(off + hlen);
  const types = { '|u1': Uint8Array, '|b1': Uint8Array, '|i1': Int8Array, '<u2': Uint16Array, '<i2': Int16Array, '<i4': Int32Array, '<u4': Uint32Array, '<f4': Float32Array, '<f8': Float64Array };
  let arr;
  if (descr === '<i8' || descr === '<u8') arr = Array.from(new BigInt64Array(data), Number);
  else if (types[descr]) arr = new types[descr](data);
  else throw new Error(`Unsupported dtype ${descr}`);
  const [D, R, N] = shape.length === 2 ? [shape[0], 1, shape[1]] : shape;
  const responses = [];
  for (let d = 0; d < D; d++) {
    const dev = [];
    for (let m = 0; m < R; m++) { const r = new Uint8Array(N); for (let i = 0; i < N; i++) r[i] = arr[(d * R + m) * N + i] > 0.5 ? 1 : 0; dev.push(r); }
    responses.push(dev);
  }
  return responses;
}
