// Portable seeded RNG — identical stream to pufanalytics/rng.py.
// SplitMix32 seeding + xoshiro128** (Blackman & Vigna), Box–Muller normals.

const rotl = (x, k) => ((x << k) | (x >>> (32 - k))) >>> 0;
const TWO32 = 4294967296;

export class PortableRNG {
  constructor(seed = 0) {
    let sm = Number(BigInt.asUintN(32, BigInt(Math.trunc(seed)))) >>> 0;
    this.seed = sm;
    const s = new Uint32Array(4);
    for (let i = 0; i < 4; i++) {
      sm = (sm + 0x9e3779b9) >>> 0;
      let z = sm;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      z = (z ^ (z >>> 15)) >>> 0;
      s[i] = z;
    }
    if (!(s[0] | s[1] | s[2] | s[3])) s[0] = 1;
    this.s = s;
  }
  nextU32() {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }
  random() { return this.nextU32() / TWO32; }
  bit() { return this.nextU32() >>> 31; }
  normal() {
    const u1 = 1.0 - this.random();
    const u2 = this.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }
  randint(n) { return Math.floor(this.random() * n); }
  bits(count) { const o = new Uint8Array(count); for (let i = 0; i < count; i++) o[i] = this.nextU32() >>> 31; return o; }
  normals(count) { const o = new Float64Array(count); for (let i = 0; i < count; i++) o[i] = this.normal(); return o; }
  randoms(count) { const o = new Float64Array(count); for (let i = 0; i < count; i++) o[i] = this.random(); return o; }
}
