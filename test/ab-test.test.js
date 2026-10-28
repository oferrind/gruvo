const test = require('node:test');
const assert = require('node:assert');
const F = require('../renderer/features');
const store = require('../src/store');
const music = require('../src/music');

test('tag cosine: identical 1, disjoint 0, partial in between', () => {
  assert.ok(Math.abs(F.tagCos({ rock: 3, pop: 1 }, { rock: 6, pop: 2 }) - 1) < 1e-9);
  assert.equal(F.tagCos({ rock: 1 }, { jazz: 1 }), 0);
  assert.equal(F.tagCos({}, { jazz: 1 }), 0);
  assert.ok(Math.abs(F.tagCos({ rock: 1, pop: 1 }, { rock: 1 }) - Math.SQRT1_2) < 1e-9);
});

test('blend: 80/20 weights, unknown tags penalised, missing sound neutral', () => {
  assert.equal(F.W_TAG + F.W_SOUND, 1);
  assert.equal(F.W_TAG, 0.8);
  const win = Array.from({ length: 20 }, (_, i) => ({ t: i / 20, s: -i / 20 }));
  const best = { t: 0.95, s: -0.5 }, tagsOnly = { t: 0.95, s: null };
  assert.ok(F.blend(best, win) > F.blend({ t: 0.1, s: -0.5 }, win));
  assert.ok(F.blend({ t: 0.5, s: -0.1 }, win) > F.blend({ t: 0.5, s: -0.9 }, win), 'closer sound wins on equal tags');
  assert.ok(F.blend({ t: null, s: null }, win) < F.blend({ t: 0.5, s: null }, win), 'unknown tags score below the mean');
  assert.ok(Math.abs(F.blend(tagsOnly, win) - F.W_TAG * (0.95 - 0.475) / Math.sqrt(399 / 4800)) < 1e-9);
});

test('blend cut: Adventure widens the passing share; few samples reject nothing', () => {
  const win = Array.from({ length: 40 }, (_, i) => ({ t: i / 40, s: -i }));
  const pass = a => win.filter(c => F.blend(c, win) >= F.blendCut(win, a)).length;
  assert.equal(F.blendCut(win.slice(0, 5), 0), -Infinity);
  assert.ok(pass(0) < pass(50) && pass(50) < pass(100));
  assert.equal(pass(0), Math.round(F.passShare(0) * 40));
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
