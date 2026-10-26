const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../src/store-fs');

test('genre-only stamp keys (--slug) load next to legacy keys; junk keys are dropped; loading twice is idempotent', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'md-store-'));
  store.init(d);
  fs.writeFileSync(path.join(d, 'profile.json'), JSON.stringify({ likes: [], heard: [],
    stamps: { '--zeuhl': 2, '1980-JP-': 1, 'JP-1970': 1, '--': 5, '--BAD': 1, '1990--drill-and-bass': 1 }, rarity: { '--zeuhl': 'Rare', '1980-JP-': 'Common' } }));
  const once = store.load();
  assert.deepEqual(once.stamps, { '--zeuhl': 2, '1980-JP-': 1, '1970-JP-': 1, '1990--drill-and-bass': 1 });
  assert.deepEqual(once.rarity, { '--zeuhl': 'Rare' });
  store.save(once);
  assert.deepEqual(store.load().stamps, once.stamps);
  const track = { source: 'dz', id: 5, title: 'T', artist: 'A' };
  store.save({ ...once, last: { track: { ...track, stamp: '--zeuhl' }, ts: 1 } });
  assert.deepEqual([store.load().last.track.stamp, store.load().last.track.genre], ['--zeuhl', 'zeuhl']);
  store.save({ ...once, last: { track: { ...track, stamp: '1990-JP-rock' }, ts: 1 } });
  assert.equal(store.load().last.track.genre, 'rock');
});
