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
