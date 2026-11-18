// A small seeded random number generator (mulberry32) plus the few helpers the game
// uses everywhere: the same seed always builds the same city, traffic and missions,
// which is what makes the screenshot scenes repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return random;
}

/** Turn a short string into a numeric seed, so a named save or scene can seed the city too. */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max] (inclusive). */
export function intIn(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of `list`, picked with the seeded random. */
export function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

/** True with probability `p` (0..1), from the seeded random. */
export function chance(random, p) {
  return random() < p;
}

/** Fisher-Yates shuffle of a copy, driven by the seeded random. */
export function shuffled(random, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
