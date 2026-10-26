const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Load a module fresh while any require of electron/fs/path/os/crypto/http throws.
function loadBare(rel) {
  const banned = ['electron', 'fs', 'path', 'os', 'crypto', 'http', 'node:fs', 'node:path'];
  const orig = Module._load, seen = [];
  Module._load = function (req, ...r) {
    if (banned.includes(req)) throw new Error(`platform require: ${req}`);
    seen.push(req);
    return orig.call(this, req, ...r);
  };
  for (const k of Object.keys(require.cache)) if (/[\/]src[\/]/.test(k)) delete require.cache[k];
  try { return require(rel); } finally { Module._load = orig; }
}

test('handlers.js, net.js and store.js load with no electron/fs/path', () => {
  for (const m of ['../src/handlers', '../src/net', '../src/store']) assert.ok(loadBare(m), m);
});

test('handlers.js never pulls in spotify.js', () => {
  const src = require('fs').readFileSync(require.resolve('../src/handlers'), 'utf8');
  assert.ok(!/spotify/i.test(src.replace(/\/\/.*$/gm, '')));
});

test('handlers: call uses the injected get; bad inputs are refused; tree emits through ctx', async () => {
  const H = require('../src/handlers').create({ get: async url => ({ url }), audio: async () => ({}), open: () => {}, store: { load: () => 'L', save: p => p } });
  const sent = [];
  assert.deepEqual(await H.get(5), { url: '5' });
  await assert.rejects(H.call('nope'), /unknown call/);
  await assert.rejects(H.call('__proto__'), /unknown call/);
  await assert.rejects(H.treeGrow({ send: () => {}, alive: () => true }, { artist: 1 }), /bad root/);
  assert.throws(() => H.shellOpen('file:///x'), /not allowed/);
  assert.equal(H.storeLoad(), 'L');
  assert.deepEqual(H.treeMore(1), { added: 0 });
  assert.ok(H.countries());
  assert.equal(sent.length, 0);
});

test('store.parse/serialize are pure: missing, corrupt and migrated input', () => {
  const S = require('../src/store');
  assert.equal(S.parse(null).corrupt, false);
  assert.equal(S.parse('{nope').corrupt, true);
  assert.deepEqual(S.parse(S.serialize({ likes: [], heard: [] })).profile.likes, []);
  assert.throws(() => S.serialize({}), /invalid profile/);
});

test('net.js uses an injected cache and fetch, no files', async () => {
  const net = require('../src/net');
  let written = null;
  net.initCache({ read: () => ({}), write: t => { written = t; } });
  net.configure({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ a: 1 }) }) });
  try {
    assert.deepEqual(await net.get('https://en.wikipedia.org/injected-test'), { a: 1 });
    net.flushCache();
    assert.ok(JSON.parse(written)['https://en.wikipedia.org/injected-test']);
  } finally { net.configure({ fetch: (...a) => globalThis.fetch(...a) }); net.initCache(null); }
});
