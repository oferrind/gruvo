// Pure offline-evaluation metrics (docs/20-success.md). No I/O; every random step takes a seed.

// Seeded PRNG (mulberry32): same seed, same stream.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// AUC = P(score of a random positive > score of a random negative), ties count half (Mann-Whitney U / |P||N|). NaN if a class is empty.
function auc(pos, neg) {
  if (!pos.length || !neg.length) return NaN;
  let u = 0;
  for (const p of pos) for (const n of neg) u += p > n ? 1 : p === n ? 0.5 : 0;
  return u / (pos.length * neg.length);
}

// NDCG@k with graded relevance (love 2, ok 1, skip 0) and gain 2^rel - 1. Items: [{score, rel}];
// equal scores keep the given order, so callers pass items in a seeded shuffle. NaN when no item is relevant.
function ndcg(items, k = 10) {
  const dcg = rels => rels.slice(0, k).reduce((s, r, i) => s + (2 ** r - 1) / Math.log2(i + 2), 0);
  const ranked = items.map((x, i) => ({ ...x, i })).sort((a, b) => b.score - a.score || a.i - b.i).map(x => x.rel);
  const ideal = dcg(items.map(x => x.rel).sort((a, b) => b - a));
  return ideal ? dcg(ranked) / ideal : NaN;
}

// Percentile bootstrap over n units: stat(indices) -> number. Returns {est, lo, hi, reps}; NaN replicates are dropped.
function bootstrap(n, stat, { reps = 2000, seed = 1, level = 0.95 } = {}) {
  const r = rng(seed), all = Array.from({ length: n }, (_, i) => i), xs = [];
  for (let b = 0; b < reps; b++) {
    const v = stat(all.map(() => Math.floor(r() * n)));
    if (Number.isFinite(v)) xs.push(v);
  }
  xs.sort((a, b) => a - b);
  const q = p => xs.length ? xs[Math.min(xs.length - 1, Math.max(0, Math.floor(p * xs.length)))] : NaN;
  return { est: stat(all), lo: q((1 - level) / 2), hi: q(1 - (1 - level) / 2), reps: xs.length };
}

// Time-ordered split: the first floor(frac * n) items (oldest) train, the rest test.
function timeSplit(items, frac = 0.7) {
  const cut = Math.floor(items.length * frac);
  return { train: items.slice(0, cut), test: items.slice(cut) };
}

// Average ranks (ties share the mean rank), then Pearson on the ranks.
function ranks(xs) {
  const o = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = Array(xs.length);
  for (let i = 0; i < o.length;) {
    let j = i;
    while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
    for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(x, y) {
  if (x.length < 3) return NaN;
  const a = ranks(x), b = ranks(y), m = (a.length + 1) / 2;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - m) * (b[i] - m); saa += (a[i] - m) ** 2; sbb += (b[i] - m) ** 2; }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : NaN;
}

// Intra-list diversity: mean pairwise (1 - sim) over the list. NaN under two items.
function ild(list, sim) {
  let s = 0, n = 0;
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { s += 1 - sim(list[i], list[j]); n++; }
  return n ? s / n : NaN;
}

// Catalogue coverage: share of the catalogue that appears in at least one list.
const coverage = (lists, catalogueSize) => catalogueSize ? new Set(lists.flat()).size / catalogueSize : NaN;

module.exports = { rng, auc, ndcg, bootstrap, timeSplit, spearman, ild, coverage };
