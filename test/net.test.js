const test = require('node:test');
const assert = require('node:assert');
const net = require('../src/net');

// Swaps global fetch for the duration of fn; records requested URLs.
async function withFetch(impl, fn) {
  const orig = global.fetch, calls = [];
  global.fetch = (url, opts) => { calls.push(url); return impl(url, opts); };
  try { await fn(calls); } finally { global.fetch = orig; }
}

test('host allowlist rejects Object.prototype names', () =>
  withFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }), async calls => {
    for (const h of ['constructor', '__proto__', 'tostring', 'hasownproperty'])
      assert.deepEqual(await net.get(`https://${h}/x`), { error: { message: 'host not allowed' } }, h);
    assert.deepEqual(calls, []);
  }));

test('every request carries a timeout signal so a hung server cannot stall the UI', () => {
  let signal;
  return withFetch(async (url, opts) => {
    signal = opts && opts.signal;
    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
  }, async () => {
    const r = await net.get('https://api.deezer.com/track/1', { fresh: true });
    assert.ok(signal instanceof AbortSignal);
    assert.match(r.error.message, /aborted due to timeout/);
  });
});

const audioRes = (chunks, headers = {}) => ({ ok: true, status: 200, headers: new Headers(headers), body: chunks });

test('audio only downloads https previews from the preview CDNs, with a timeout and no redirects', () => {
  let opts;
  return withFetch(async (url, o) => { opts = o; return audioRes([new Uint8Array([1, 2, 3])]); }, async calls => {
    for (const u of ['http://cdnt-preview.dzcdn.net/a.mp3', 'https://api.deezer.com/track/1', 'https://audio-ssl.itunes.apple.com/a.m4a', 'https://a1.mzstatic.com/a.m4a',
      'https://evil.com/?x=.dzcdn.net', 'https://dzcdn.net.evil.com/a.mp3', 'file:///c:/x.mp3', 'nope'])
      assert.ok((await net.audio(u)).error, u);
    assert.deepEqual(calls, []);
    for (const u of ['https://cdnt-preview.dzcdn.net/a.mp3', ])
      assert.deepEqual([...new Uint8Array(await net.audio(u))], [1, 2, 3], u);
    assert.ok(opts.signal instanceof AbortSignal);
    assert.equal(opts.redirect, 'error');
  });
});

test('audio refuses previews over 2 MB, by header or while streaming', () =>
  withFetch(async url => url.includes('hdr') ? audioRes([], { 'content-length': String(3e6) })
    : audioRes([new Uint8Array(1.5e6), new Uint8Array(1e6)]), async () => {
    assert.deepEqual(await net.audio('https://x.dzcdn.net/hdr.mp3'), { error: { message: 'too large' } });
    assert.deepEqual(await net.audio('https://x.dzcdn.net/stream.mp3'), { error: { message: 'too large' } });
  }));

test('two concurrent requests for one url share a single fetch (the tree asks for an artist twice at once)', () =>
  withFetch(async () => ({ ok: true, status: 200, json: async () => ({ n: 1 }) }), async calls => {
    const u = 'https://en.wikipedia.org/inflight-test';
    const [a, b] = await Promise.all([net.get(u), net.get(u)]);
    assert.deepEqual([a, b], [{ n: 1 }, { n: 1 }]);
    assert.equal(calls.length, 1);
  }));
