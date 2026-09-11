/**
 * A small local embedding: hashed words and character trigrams into 256 dimensions, L2-normalised.
 * It is not a language model. It is enough for "Rosa's ledger" to find "the ledger Rosa keeps" three days later,
 * and it runs with no key, in the same process, in microseconds. A provider can replace it behind the same two functions.
 */
const DIM = 256;
function h32(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function embed(text: string): Float32Array {
  const v = new Float32Array(DIM);
  const t = text.toLowerCase().replace(/[^a-zà-ž0-9 ]/gi, " ");
  const words = t.split(/\s+/).filter((w) => w.length > 1);
  for (const w of words) {
    const hw = h32("w:" + w); const wi = hw % DIM; v[wi] = (v[wi] ?? 0) + ((hw & 1) ? 1 : -1);
    const padded = ` ${w} `;
    for (let i = 0; i + 3 <= padded.length; i++) { const g = h32("g:" + padded.slice(i, i + 3)); const gi = g % DIM; v[gi] = (v[gi] ?? 0) + (((g >> 1) & 1) ? 0.5 : -0.5); }
  }
  let n = 0; for (let i = 0; i < DIM; i++) n += v[i]! * v[i]!; n = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) v[i] = v[i]! / n;
  return v;
}
export function cosine(a: Float32Array, b: Float32Array): number { let s = 0; for (let i = 0; i < DIM; i++) s += a[i]! * b[i]!; return s; }
