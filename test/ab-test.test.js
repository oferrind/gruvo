const test = require('node:test');
const assert = require('node:assert');
const F = require('../renderer/features');
const store = require('../src/store');
const { report, fisher } = require('../scripts/ab-report');
const music = require('../src/music');

test('tag cosine: identical 1, disjoint 0, partial in between', () => {
  assert.ok(Math.abs(F.tagCos({ rock: 3, pop: 1 }, { rock: 6, pop: 2 }) - 1) < 1e-9);
  assert.equal(F.tagCos({ rock: 1 }, { jazz: 1 }), 0);
  assert.equal(F.tagCos({}, { jazz: 1 }), 0);
  assert.ok(Math.abs(F.tagCos({ rock: 1, pop: 1 }, { rock: 1 }) - Math.SQRT1_2) < 1e-9);
});

test('tag cut passes the requested share and falls back with few samples', () => {
  const sims = Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
  const cut = F.tagCut(sims, 0.25, 50);
  assert.equal(sims.filter(s => F.tagFits(s, cut)).length, 5);
  assert.equal(F.tagCut([0.9], 0.25, 0), F.tagReach(0));
  assert.ok(F.tagReach(100) < F.tagReach(0));
  assert.ok(F.tagCut(new Array(20).fill(0), 0.5, 50) > 0, 'zero similarity never passes');
});

test('store: abTest validated (default off) and ab kept only as fp|tags', () => {
  assert.deepEqual(store.parse(null).profile.prefs.abTest, { on: false, started: 0 });
  const raw = JSON.stringify({ likes: [], heard: [], prefs: { abTest: { on: true, started: 5 } }, ratings: [
    { id: 'a', rating: 'love', features: [1], ab: 'tags' }, { id: 'b', rating: 'skip', features: [1], ab: 'zzz' }, { id: 'c', rating: 'ok', features: [1], seed: true }] });
  const p = JSON.parse(store.serialize(store.parse(raw).profile));
  assert.deepEqual(p.prefs.abTest, { on: true, started: 5 });
  assert.deepEqual(p.ratings.map(r => r.ab), ['tags', undefined, undefined]);
  assert.equal(p.ratings[2].seed, true);
  assert.deepEqual(store.parse(JSON.stringify({ likes: [], heard: [], prefs: { abTest: { on: 'yes', started: 'x' } } })).profile.prefs.abTest, { on: false, started: 0 });
});

test('ab-report counts per method and runs Fisher', () => {
  const R = (rating, ab) => ({ id: String(Math.random()), rating, features: [1], ab });
  const ratings = [...Array(2).fill(0).map(() => R('love', 'fp')), ...Array(8).fill(0).map(() => R('skip', 'fp')),
    ...Array(8).fill(0).map(() => R('love', 'tags')), R('ok', 'tags'), R('skip', 'tags'), R('love')];
  const r = report({ ratings });
  assert.deepEqual([r.fp.n, r.fp.love, r.fp.skip], [10, 2, 8]);
  assert.deepEqual([r.tags.n, r.tags.love, r.tags.ok, r.tags.skip], [10, 8, 1, 1]);
  assert.ok(Math.abs(r.p - fisher(2, 8, 8, 2)) < 1e-12 && r.p < 0.05);
  assert.ok(Math.abs(fisher(1, 1, 1, 1) - 1) < 1e-9);
});

test('artistTags: one unambiguous artist gives lowercase tag counts, cached; same-name twins give null', async () => {
  let calls = 0;
  const row = (id, tags) => ({ id, name: 'Xx Band', score: 100, tags });
  const get = async () => { calls++; return { artists: [row('1', [{ name: 'Rock', count: 4 }])] }; };
  assert.deepEqual(await music.flows.artistTags(get, 'Xx Band'), { rock: 4 });
  await music.flows.artistTags(get, 'xx band');
  assert.equal(calls, 1);
  const twins = async () => ({ artists: [{ id: '1', name: 'Yy', score: 100, tags: [] }, { id: '2', name: 'Yy', score: 100, tags: [] }] });
  assert.equal(await music.flows.artistTags(twins, 'Yy'), null);
});
