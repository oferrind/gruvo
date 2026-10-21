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
