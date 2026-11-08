const test = require('node:test');
const assert = require('node:assert');
const M = require('../scripts/eval/metrics');
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} != ${b}`);

test('AUC: perfect, inverted, ties count half, empty class NaN', () => {
  assert.equal(M.auc([3, 4], [1, 2]), 1);
  assert.equal(M.auc([1, 2], [3, 4]), 0);
  assert.equal(M.auc([1, 1], [1, 1]), 0.5);
  // pairs (p,n): (2,1)=1 (2,2)=.5 (2,3)=0 (3,1)=1 (3,2)=1 (3,3)=.5 -> 4/6
  close(M.auc([2, 3], [1, 2, 3]), 4 / 6);
  assert.ok(Number.isNaN(M.auc([], [1])));
});

test('NDCG@k: graded gains 2^rel-1, log2 discount, ties keep given order', () => {
  assert.equal(M.ndcg([{ score: 3, rel: 2 }, { score: 2, rel: 1 }, { score: 1, rel: 0 }], 10), 1);
  // ranked rels [0, 2, 1]: DCG = 0 + 3/log2(3) + 1/2; ideal [2,1,0]: 3 + 1/log2(3)
  close(M.ndcg([{ score: 3, rel: 0 }, { score: 2, rel: 2 }, { score: 1, rel: 1 }], 10), (3 / Math.log2(3) + 0.5) / (3 + 1 / Math.log2(3)));
  // k=1 cuts after the first: ranked [1,...] vs ideal [2] -> 1/3
  close(M.ndcg([{ score: 9, rel: 1 }, { score: 1, rel: 2 }], 1), 1 / 3);
  // equal scores: given order decides, so [rel 0, rel 2] ranks the skip first
  close(M.ndcg([{ score: 1, rel: 0 }, { score: 1, rel: 2 }], 10), (3 / Math.log2(3)) / 3);
  assert.ok(Number.isNaN(M.ndcg([{ score: 1, rel: 0 }], 10)));
});

test('bootstrap: same seed same CI, different seed differs, CI brackets the estimate', () => {
  const xs = Array.from({ length: 40 }, (_, i) => (i * 37) % 11);
  const mean = idx => idx.reduce((s, i) => s + xs[i], 0) / idx.length;
  const a = M.bootstrap(xs.length, mean, { reps: 500, seed: 7 }), b = M.bootstrap(xs.length, mean, { reps: 500, seed: 7 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, M.bootstrap(xs.length, mean, { reps: 500, seed: 8 }));
  assert.ok(a.lo <= a.est && a.est <= a.hi && a.lo < a.hi);
  close(a.est, mean([...xs.keys()]));
  // NaN replicates are dropped, not counted
  assert.equal(M.bootstrap(3, () => NaN, { reps: 10 }).reps, 0);
});

test('time split: oldest 70% train, newest 30% test, order kept', () => {
  const items = [...Array(10).keys()];
  assert.deepEqual(M.timeSplit(items, 0.7), { train: [0, 1, 2, 3, 4, 5, 6], test: [7, 8, 9] });
  assert.deepEqual(M.timeSplit([1, 2, 3], 0.5), { train: [1], test: [2, 3] });
});

test('spearman with ties, ILD and coverage', () => {
  close(M.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  close(M.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  // x ranks [1,2.5,2.5,4], y ranks [1,2,3,4]: rho = 4.5 / sqrt(4.5 * 5)
  close(M.spearman([1, 2, 2, 3], [1, 2, 3, 4]), 4.5 / Math.sqrt(4.5 * 5));
  close(M.ild(['a', 'a', 'b'], (x, y) => (x === y ? 1 : 0)), 2 / 3);
  assert.equal(M.coverage([['a', 'b'], ['b', 'c']], 6), 0.5);
});
