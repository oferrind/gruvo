const test = require('node:test');
const assert = require('node:assert');
const F = require('../renderer/features');
const make = require('../renderer/colisten');

// 3 artists in 2 dims: a and b point the same way, c the opposite.
const T = { dims: 2, keys: 'a\nb\nc', vec: Buffer.from(Int8Array.from([100, 0, 90, 10, -100, 0]).buffer).toString('base64') };

test('co-listening: lookup by normalised name, cosine, love minus half skip', () => {
  const C = make(T);
  assert.equal(C.find('A!'), 0);
  assert.equal(C.find('zz'), -1);
  assert.ok(C.cos(0, 1) > 0.99 && C.cos(0, 2) < -0.99);
  assert.ok(Math.abs(C.score('b', [0]) - C.cos(1, 0)) < 1e-9);
  assert.ok(C.score('b', [0], [2]) > C.score('b', [0]), 'close to a skip lowers, far from it raises');
  assert.equal(C.score('zz', [0]), null);
  assert.equal(C.score('b', []), null);
  assert.equal(make(null), null);
});

test('LambdaRank: weight moves to the feature that orders the ratings; no signal keeps the prior', () => {
  const prior = { t: 0.8, s: 0.2, c: 0 };
  const rows = Array.from({ length: 30 }, (_, i) => ({ rel: i % 3, x: { t: Math.sin(i * 7), s: Math.cos(i * 5), c: (i % 3) - 1 } }));
  const w = F.learnWeights(rows, prior);
  assert.ok(w.c > 0.5 && w.c > w.t, JSON.stringify(w));
  assert.deepEqual(F.learnWeights(rows.map(r => ({ ...r, rel: 1 })), prior), { ...prior, g: 0 });
  const win = [{ t: 0, s: 0, c: 0 }, { t: 1, s: 1, c: 1 }];
  assert.ok(F.blendW({ t: 1, s: null, c: 1 }, win, { t: 0, s: 0, c: 1 }) > F.blendW({ t: 1, s: null, c: null }, win, { t: 0, s: 0, c: 1 }));
});

test('Thompson sampling: a source that keeps finding loves is picked most; no data still explores every source', () => {
  let s = 1; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const count = stats => { const n = {}; for (let i = 0; i < 2000; i++) { const k = F.thompsonSource(50, false, stats, rand); n[k] = (n[k] || 0) + 1; } return n; };
  const cold = count({});
  assert.deepEqual(Object.keys(cold).sort(), ['explore', 'neighbour', 'trail']);
  const warm = count({ trail: { love: 30, n: 40 }, neighbour: { love: 2, n: 40 }, explore: { love: 2, n: 40 } });
  assert.ok(warm.trail > 1500, JSON.stringify(warm));
  assert.ok(!count({}).genre, 'genre needs chosen genres');
});

test('calibration: pulls a second genre into a list the scores alone fill with one', () => {
  const items = [...Array(6)].map((_, i) => ({ score: 1 - i * 0.01, tags: { rock: 1 } })).concat([{ score: 0.5, tags: { jazz: 1 } }]);
  const mix = { rock: 1, jazz: 1 };
  assert.ok(!F.calibrate(items, mix, 3, 0).includes(6));
  assert.ok(F.calibrate(items, mix, 3, 0.3).includes(6));
  assert.deepEqual(F.calibrate(items, {}, 2), [0, 1]);
});

test('personalised PageRank: mass flows from the seed to its neighbours, not to the unconnected', () => {
  // 4 artists; edges a-b, b-c; d alone.
  const T = { dims: 1, keys: 'a\nb\nc\nd', vec: Buffer.from(Int8Array.from([1, 1, 1, 1]).buffer).toString('base64'),
    edges: Buffer.from(Uint16Array.from([0, 1, 1, 2]).buffer).toString('base64') };
  const C = make(T);
  assert.ok(C.graphScore('b', [0]) > C.graphScore('c', [0]) && C.graphScore('c', [0]) > C.graphScore('d', [0]));
  assert.equal(C.graphScore('zz', [0]), null);
  assert.equal(make({ ...T, edges: undefined }).graphScore('b', [0]), null);
});
