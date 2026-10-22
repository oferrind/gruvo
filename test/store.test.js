const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/store');

const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'md-store-')); store.init(d); return d; };

test('a corrupt profile is kept aside, not silently overwritten by the next save', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), '{"likes":[{"id":1');
  assert.deepEqual(store.load().likes, []);
  store.save(store.load());
  const backups = fs.readdirSync(d).filter(f => f.startsWith('profile.json.corrupt'));
  assert.equal(backups.length, 1);
  assert.equal(fs.readFileSync(path.join(d, backups[0]), 'utf8'), '{"likes":[{"id":1');
});

test('load repairs fields of the wrong type', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), '{"likes":null,"heard":"x","stamps":null,"adventure":70}');
  const p = store.load();
  assert.deepEqual([p.likes, p.heard, p.stamps, p.adventure], [[], [], {}, 70]);
});

test('missing profile loads defaults without a backup', () => {
  const d = tmp();
  assert.equal(store.load().adventure, 50);
  assert.deepEqual(fs.readdirSync(d), []);
});

test('load migrates name-only heard entries of loved Deezer artists to ids (R4)', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify({ likes: [{ artist: 'Nirvana', artistDzId: 7 }, { artist: 'Nirvana', artistDzId: 9 }, { artist: 'Fela', source: 'it' }],
    heard: ['nirvana', 'fela', 'dz:7', 'low'] }));
  assert.deepEqual(store.load().heard, ['dz:7', 'dz:9', 'fela', 'low']);
});

test('sound ratings survive save/load; malformed ones are dropped; capped at the newest 500', () => {
  tmp();
  const good = { id: 'dz:1', rating: 'love', features: [0.1, 0.5], extra: 'x' };
  const bad = [null, { id: 1, rating: 'love', features: [1] }, { id: 'a', rating: 'meh', features: [1] },
    { id: 'a', rating: 'ok', features: [NaN] }, { id: 'a', rating: 'ok', features: 'x' }, { id: 'a', rating: 'skip', features: [] }];
  store.save({ likes: [], heard: [], ratings: [good, ...bad] });
  assert.deepEqual(store.load().ratings, [{ id: 'dz:1', rating: 'love', features: [0.1, 0.5] }]);
  const many = Array.from({ length: 520 }, (_, i) => ({ id: `dz:${i}`, rating: 'skip', features: [0] }));
  store.save({ likes: [], heard: [], ratings: many });
  const r = store.load().ratings;
  assert.equal(r.length, 500);
  assert.equal(r[0].id, 'dz:20');
  tmp();
  assert.deepEqual(store.load().ratings, []); // old profiles load with none
});

test('prefs survive save/load; malformed entries are dropped; seed ratings keep their flag', () => {
  tmp();
  const p = store.load();
  assert.deepEqual(p.prefs, { genres: [], artists: [], decades: [], regions: [] });
  p.prefs = {
    genres: [{ id: 152, name: 'Rock', x: 1 }, { id: '1', name: 'bad' }, null],
    artists: [{ dzId: 27, name: 'Daft Punk' }, { dzId: 3, name: '' }, { name: 'no id' }],
    decades: [1970, 1970, 1975, 'x', 2010],
    regions: ['Africa', 'Atlantis', 'Asia'],
  };
  p.ratings = [{ id: 'seed:27:1', rating: 'love', features: [0.5], seed: true }, { id: 'dz:2', rating: 'ok', features: [0.1], seed: 'yes' }];
  store.save(p);
  const q = store.load();
  assert.deepEqual(q.prefs, { genres: [{ id: 152, name: 'Rock' }], artists: [{ dzId: 27, name: 'Daft Punk' }], decades: [1970, 2010], regions: ['Africa', 'Asia'] });
  assert.deepEqual(q.ratings, [{ id: 'seed:27:1', rating: 'love', features: [0.5], seed: true }, { id: 'dz:2', rating: 'ok', features: [0.1] }]);
});
