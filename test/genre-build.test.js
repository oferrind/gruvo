const test = require('node:test');
const assert = require('node:assert');
const B = require('../scripts/build-genre-stamps');

test('slugify: accents and symbols go to [a-z0-9-]; blocked names are dropped; a duplicate slug keeps the first', () => {
  assert.equal(B.slugify('kayōkyoku'), 'kayokyoku');
  assert.equal(B.slugify('Drill and bass'), 'drill-and-bass');
  assert.equal(B.slugify("rock 'n' roll!"), 'rock-n-roll');
  assert.equal(B.slugify('音楽'), '');
  const out = B.dedupe([{ id: 1, name: 'kaseko' }, { name: 'Kaseko' }, { name: 'comedy rock' }, { name: 'spoken word' }, { name: 'ASMR' }, { name: '音楽' }, { name: 'zeuhl' }]);
  assert.deepEqual(out.map(g => [g.name, g.slug]), [['kaseko', 'kaseko'], ['zeuhl', 'zeuhl']]);
});

test('tiers: 999 is Deep, 1000 Common; 99 Obscure, 100 Deep', () => {
  assert.deepEqual([999, 1000, 99, 100, 0].map(B.tierOf), ['D', 'C', 'O', 'D', 'O']);
});

test('familyOf: nearest root wins (metal stays metal), ties go by root order, cycles end, no root is "other"', () => {
  const parents = { zeuhl: ['progressive-rock'], 'progressive-rock': ['rock'], 'black-metal': ['heavy-metal', 'extreme-metal'], 'heavy-metal': ['rock'], a: ['b'], b: ['a'], 'punk-rock': ['rock'],
    tie: ['rock', 'heavy-metal'] };
  assert.equal(B.familyOf('zeuhl', parents), 'rock');
  assert.equal(B.familyOf('black-metal', parents), 'metal');
  assert.equal(B.familyOf('punk-rock', parents), 'punk');
  assert.equal(B.familyOf('tie', parents), 'rock');
  assert.equal(B.familyOf('a', parents), 'other', 'cycle terminates');
  assert.equal(B.familyOf('rock', {}), 'rock');
  // no Wikidata chain: the name decides, whole words only
  assert.deepEqual(['black-metal', 'bossa-nova', 'funk-carioca', 'dubstep', 'detroit-trap', 'highlife', 'acid-jazz', 'beat-poetry', 'person'].map(s => B.familyOf(s, {})),
    ['metal', 'latin', 'latin', 'electronic', 'hip-hop', 'world', 'jazz', 'other', 'other']);
});

test('parentOf skips dropped parents up the chain, and survives a cycle', () => {
  const parents = { z: ['y'], y: ['x'], x: ['y'] };
  assert.equal(B.parentOf('z', parents, new Set(['z', 'x'])), 'x');
  assert.equal(B.parentOf('z', parents, new Set(['z'])), '');
});

test('render: keeps entries with 6+ songs, sorted by name, parent = nearest kept ancestor', () => {
  const state = { genres: [{ name: 'zeuhl', slug: 'zeuhl' }, { name: 'prog', slug: 'prog' }, { name: 'rock', slug: 'rock' }, { name: 'bad', slug: 'bad' }],
    parents: { zeuhl: ['prog'], prog: ['rock'] },
    done: { zeuhl: { n: 10, mb: 50, a: ['Magma', 'A|B'] }, prog: { n: 3, drop: 'thin' }, rock: { n: 10, mb: 5000, a: [] }, bad: { n: 6, mb: 100, a: ['x'] } } };
  const out = B.render(state, '2026-01-01');
  assert.equal(out.total, 3);
  const mod = { exports: {} };
  new Function('module', out.text.replace('})(this);', '})(globalThis);'))(mod);
  assert.deepEqual(mod.exports.map(r => r[0]), ['bad', 'rock', 'zeuhl']);
  assert.deepEqual(mod.exports[2], ['zeuhl', 'zeuhl', 'rock', 'O', 'rock', 10, 'Magma|A B', 1]);
  const withWiki = s => { const m = { exports: {} }; new Function('module', B.render(state, '2026-01-01', s).text.replace('})(this);', '})(globalThis);'))(m); return m.exports.map(r => r[7]); };
  assert.deepEqual(withWiki(new Set()), [0, 0, 0], 'no article'); // the state's genres carry no MB id here, so none match
  assert.deepEqual(out.drops, ['prog (3 songs)']);
});
