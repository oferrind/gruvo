// Phone adapters (mobile/phone.js) with fake Capacitor plugins, the phone cache cap, and the bundle build.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../mobile/phone');

test('fetchVia: JSON comes back parsed or as text; status maps to ok', async () => {
  const seen = [];
  const http = { request: async o => { seen.push(o); return o.url.endsWith('/t') ? { status: 200, data: '{"a":1}' } : { status: 503, data: { b: 2 } }; } };
  const f = P.fetchVia(http);
  const r = await f('https://api.deezer.com/t', { headers: { 'User-Agent': 'UA' }, signal: {} });
  assert.deepEqual([r.ok, r.status, await r.json()], [true, 200, { a: 1 }]);
  const e = await f('https://musicbrainz.org/x', {});
  assert.deepEqual([e.ok, e.status, await e.json()], [false, 503, { b: 2 }]);
  assert.equal(seen[0].headers['User-Agent'], 'UA');
  assert.equal(seen[0].readTimeout, 15000);
});

test('audioVia: dzcdn only, no redirects, base64 decoded, fresh copies, kept in memory, failures retried', async () => {
  let calls = 0, fail = true;
  const bytes = Buffer.from([1, 2, 3, 250]);
  const http = { request: async o => { calls++; assert.equal(o.responseType, 'arraybuffer'); assert.equal(o.disableRedirects, true);
    if (o.url.includes('fail') && fail) return { status: 404, data: '' };
    return { status: 200, data: bytes.toString('base64').replace(/(.{2})/g, '$1\n') }; } };
  const audio = P.audioVia(http, 2);
  assert.deepEqual(await audio('https://evil.com/a.mp3'), { error: { message: 'host not allowed' } });
  assert.deepEqual(await audio('http://cdnt-preview.dzcdn.net/a.mp3'), { error: { message: 'host not allowed' } });
  const a = await audio('https://cdnt-preview.dzcdn.net/a.mp3');
  assert.deepEqual([...new Uint8Array(a)], [1, 2, 3, 250]);
  structuredClone(a, { transfer: [a] }); // detach, as decodeAudioData does
  const b = await audio('https://cdnt-preview.dzcdn.net/a.mp3');
  assert.equal(b.byteLength, 4);
  assert.equal(calls, 1, 'second ask served from memory');
  assert.deepEqual(await audio('https://cdnt-preview.dzcdn.net/fail.mp3'), { error: { status: 404 } });
  fail = false;
  assert.equal((await audio('https://cdnt-preview.dzcdn.net/fail.mp3')).byteLength, 4, 'a failure is not cached');
  await audio('https://cdnt-preview.dzcdn.net/c.mp3'); // keep = 2 evicts a.mp3
  await audio('https://cdnt-preview.dzcdn.net/a.mp3');
  assert.equal(calls, 5);
});

test('audioVia: over 2 MB is refused', async () => {
  const big = Buffer.alloc(P.MAX_AUDIO + 1).toString('base64');
  const audio = P.audioVia({ request: async () => ({ status: 200, data: big }) });
  assert.deepEqual(await audio('https://e-cdns-preview-1.dzcdn.net/x.mp3'), { error: { message: 'too large' } });
});

// In-memory fake of the Filesystem plugin; renameFails mimics a rename that won't replace an existing file.
function fakeFs({ renameFails = false } = {}) {
  const disk = {};
  return { disk, readFile: async ({ path }) => { if (!(path in disk)) throw new Error('missing'); return { data: disk[path] }; },
    writeFile: async ({ path, data }) => { disk[path] = data; },
    deleteFile: async ({ path }) => { delete disk[path]; },
    rename: async ({ from, to }) => { if (!(from in disk) || (renameFails && to in disk)) throw new Error('rename'); disk[to] = disk[from]; delete disk[from]; } };
}

test('storeVia: new install gets the default profile; saves survive a reload; corrupt file is moved aside', async () => {
  for (const renameFails of [false, true]) {
    const fs = fakeFs({ renameFails }), store = P.storeVia(P.filesVia(fs, 'DATA', 'utf8'));
    const p = await store.load();
    assert.deepEqual(p.likes, []);
    p.likes.push({ source: 'dz', id: '1', artist: 'A', title: 'T' });
    await Promise.all([store.save(p), store.save(p)]); // queued, not interleaved
    await store.save(p);
    assert.equal((await store.load()).likes.length, 1);
    assert.ok(!('profile.json.tmp' in fs.disk));
  }
  const fs = fakeFs();
  fs.disk['profile.json'] = '{nope';
  const p = await P.storeVia(P.filesVia(fs, 'DATA', 'utf8')).load();
  assert.deepEqual(p.likes, []);
  assert.ok(Object.keys(fs.disk).some(k => k.startsWith('profile.json.corrupt-')));
});

test('cacheVia + net: phone cache is read before init and pruned to 2000 entries on flush', async () => {
  const net = require('../src/net');
  const fs = fakeFs(), files = P.filesVia(fs, 'DATA', 'utf8');
  const now = Date.now(), old = {};
  for (let i = 0; i < 2100; i++) old[`https://musicbrainz.org/ws/2/x?${i}`] = { t: now - i, body: {} };
  fs.disk['cache.json'] = JSON.stringify(old);
  const io = await P.cacheVia(files);
  try {
    net.initCache(io);
    net.flushCache();
    await new Promise(r => setTimeout(r, 10));
    assert.equal(Object.keys(JSON.parse(fs.disk['cache.json'])).length, 2000);
  } finally { net.initCache(null); }
});

test('mobile bundle builds for the browser with no node built-ins', () => {
  const esbuild = require('esbuild');
  const r = esbuild.buildSync({ entryPoints: [require.resolve('../mobile/api.js')], bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent' });
  const js = r.outputFiles[0].text;
  assert.ok(!/require\(["'](fs|http|crypto|electron|path)["']\)/.test(js));
  assert.ok(!js.includes('itunes.apple.com') && !js.includes('mzstatic'));
  assert.ok(!/require\(["'](node:[a-z_/]+|net|os|child_process|stream|zlib|https?)["']\)/.test(js));
  assert.ok(!/^\/\/ .*spotify\.js/m.test(js), 'spotify.js must not be bundled');
  assert.ok(js.includes('window.api'));
});
