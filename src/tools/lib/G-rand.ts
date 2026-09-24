/** Seeded randomness shared by the group-G generators. */

/** mulberry32 — fast, good-enough PRNG with a 32-bit state. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash any string (or number) to a 32-bit seed. Empty → a random seed. */
export function seedFrom(s: string | number | undefined): number {
  const t = s == null ? "" : String(s).trim();
  if (!t) return (Math.random() * 2 ** 32) >>> 0;
  if (/^\d+$/.test(t) && Number(t) < 2 ** 32) return Number(t) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type Rng = () => number;

export const rint = (r: Rng, min: number, max: number) => Math.floor(r() * (max - min + 1)) + min;
export const rpick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
export function rshuffle<T>(r: Rng, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Random bytes: crypto when unseeded, the PRNG when seeded. */
export function rbytes(n: number, r?: Rng): Uint8Array {
  const b = new Uint8Array(n);
  if (r) for (let i = 0; i < n; i++) b[i] = Math.floor(r() * 256);
  else globalThis.crypto.getRandomValues(b);
  return b;
}
