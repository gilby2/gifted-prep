// Seeded RNG (mulberry32) with helpers. Generators must use only this.

export function createRng(seed = Date.now()) {
  let s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = () => next();
  rng.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  rng.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  rng.sample = (arr, n) => rng.shuffle(arr).slice(0, n);
  return rng;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Shuffle a correct answer with distractors; returns { choices, answerIndex }.
export function withChoices(rng, correct, distractors) {
  const all = rng.shuffle([{ c: correct, ok: true }, ...distractors.map((d) => ({ c: d, ok: false }))]);
  return { choices: all.map((x) => x.c), answerIndex: all.findIndex((x) => x.ok) };
}
