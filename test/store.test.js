const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/store-fs');

const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'md-store-')); store.init(d); return d; };

test('legacy Passport stamps migrate to "<decade>-<CC>-" once; new keys, counts and junk are validated', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify({ likes: [], heard: [],
    stamps: { 'JP-1980': 2, '1990-JP-rock': 3, 'NG-1970': 1, '1970-NG-': 1, 'x': 1, '2000-KR-pop': 0, '1960-US-soul': 1.5, '1960-GB-rock': '2' } }));
  const once = store.load();
  assert.deepEqual(once.stamps, { '1980-JP-': 2, '1990-JP-rock': 3, '1970-NG-': 2 });
  store.save(once);
  assert.deepEqual(store.load().stamps, once.stamps, 'loading twice changes nothing');
});

test('rarity is remembered in the profile, validated', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify({ likes: [], heard: [], rarity: { '1990-JP-rock': 'Rare', '1970-NG-afrobeat': 'Epic', x: 'Common', '1980-JP-': 'Legendary' } }));
  assert.deepEqual(store.load().rarity, { '1990-JP-rock': 'Rare' });
  store.save({ likes: [], heard: [], rarity: { '1960-US-soul': 'Common', '1960-GB-rock': 7 } });
  assert.deepEqual(store.load().rarity, { '1960-US-soul': 'Common' });
});

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
  const p = store.load(), p0 = { ...p.prefs };
  assert.deepEqual(p.prefs, { genres: [], artists: [], decades: [], regions: [], tree: { edges: ['scene', 'member', 'builton', 'roots'], era: 'near', place: 'same', fame: 50, width: 3 }, bringBack: true, scheme: 'shop' });
  p.prefs = { tree: p0.tree,
    genres: [{ id: 152, name: 'Rock', x: 1 }, { id: '1', name: 'bad' }, null],
    artists: [{ dzId: 27, name: 'Daft Punk' }, { dzId: 3, name: '' }, { name: 'no id' }],
    decades: [1970, 1970, 1975, 'x', 2010],
    regions: ['Africa', 'Atlantis', 'Asia'],
    scheme: 'purple-gradient',
  };
  p.ratings = [{ id: 'seed:27:1', rating: 'love', features: [0.5], seed: true }, { id: 'dz:2', rating: 'ok', features: [0.1], seed: 'yes' }];
  store.save(p);
  const q = store.load();
  assert.deepEqual(q.prefs, { genres: [{ id: 152, name: 'Rock' }], artists: [{ dzId: 27, name: 'Daft Punk' }], decades: [1970, 2010], regions: ['Africa', 'Asia'], tree: p0.tree, bringBack: true, scheme: 'shop' });
  assert.deepEqual(q.ratings, [{ id: 'seed:27:1', rating: 'love', features: [0.5], seed: true }, { id: 'dz:2', rating: 'ok', features: [0.1] }]);
});

test('last-played survives save/load, keeps only known fields, and drops malformed entries', () => {
  tmp();
  assert.equal(store.load().last, null);
  const last = { track: { source: 'dz', id: 3135556, title: 'Harder', artist: 'Daft Punk', artistDzId: 27, cover: 'https://cdn-images.dzcdn.net/x.jpg',
    country: 'FR', decade: 2000, previewUrl: 'https://x', junk: 1 }, from: { tab: 'tree', label: 'Family Tree · 1.2' }, ts: 5 };
  store.save({ likes: [], heard: [], last });
  const t = { ...last.track }; delete t.previewUrl; delete t.junk;
  assert.deepEqual(store.load().last, { track: t, from: last.from, ts: 5 });
  for (const bad of [null, { track: { source: 'dz', id: 1, title: '', artist: 'A' } }, { track: { source: 'x', id: 1, title: 'T', artist: 'A' } }]) {
    store.save({ likes: [], heard: [], last: bad });
    assert.equal(store.load().last, null);
  }
  store.save({ likes: [], heard: [], last: { track: { source: 'it', id: 9, title: 'T', artist: 'A', cover: 'http://evil', country: 'xx' }, from: { tab: '<x>' } } });
  assert.deepEqual(store.load().last, { track: { source: 'it', id: 9, title: 'T', artist: 'A' }, from: null, ts: 0 });
});

test('Family Tree grow settings persist in prefs.tree; old profiles get the defaults, junk is clamped', () => {
  tmp();
  assert.deepEqual(store.load().prefs.tree, { edges: ['scene', 'member', 'builton', 'roots'], era: 'near', place: 'same', fame: 50, width: 3 });
  store.save({ likes: [], heard: [], prefs: { tree: { edges: ['related', 'soundtrack', 'nope'], era: 'decade', place: 'any', fame: 130, width: 5 } } });
  assert.deepEqual(store.load().prefs.tree, { edges: ['related', 'soundtrack'], era: 'decade', place: 'any', fame: 100, width: 5 });
  store.save({ likes: [], heard: [], prefs: { tree: { edges: [], era: 7 } } });
  assert.equal(store.load().prefs.tree.edges.length, 4);
});

test('colour scheme persists in prefs.scheme; unknown values fall back to Record shop', () => {
  tmp();
  store.save({ likes: [], heard: [], prefs: { scheme: 'tuner' } });
  assert.equal(store.load().prefs.scheme, 'tuner');
  store.save({ likes: [], heard: [], prefs: { scheme: { x: 1 } } });
  assert.equal(store.load().prefs.scheme, 'shop');
});

test('prefs.bringBack defaults on and only an explicit false turns it off; back state is bounded', () => {
  tmp();
  assert.equal(store.load().prefs.bringBack, true);
  store.save({ likes: [], heard: [], prefs: { bringBack: 'no' } });
  assert.equal(store.load().prefs.bringBack, true);
  store.save({ likes: [], heard: [], prefs: { bringBack: false } });
  assert.equal(store.load().prefs.bringBack, false);
  store.save({ likes: [], heard: [], back: { n: 50, last: 40, seen: { 7: 45, 8: 10, x: 49 }, ok: [3, 3, 'z', -1] } });
  assert.deepEqual(store.load().back, { n: 50, last: 40, seen: { 7: 45 }, ok: [3] });
  store.save({ likes: [], heard: [], back: 'junk' });
  assert.deepEqual(store.load().back, { n: 0, last: 0, seen: {}, ok: [] });
});

