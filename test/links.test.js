const test = require('node:test');
const assert = require('node:assert');
const { safeExternal } = require('../src/links');

test('openExternal allowlist: only https YouTube / Spotify / Deezer', () => {
  const q = encodeURIComponent('Sigur Rós Hoppípolla & more');
  for (const ok of [`https://www.youtube.com/results?search_query=${q}`, `https://open.spotify.com/search/${q}`, 'https://www.deezer.com/track/3135556'])
    assert.equal(safeExternal(ok), ok);
  for (const bad of ['http://www.youtube.com/results', 'https://youtube.com/x', 'https://www.youtube.com.evil.com/x', 'https://evil.com/?www.deezer.com',
    'https://user@www.deezer.com/x', 'https://www.deezer.com:8443/x', 'javascript:alert(1)', 'file:///C:/Windows', 'not a url', null, undefined, {}])
    assert.equal(safeExternal(bad), null, String(bad));
});
