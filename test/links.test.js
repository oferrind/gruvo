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

test('search links: YouTube / Spotify results for "artist title", allowlisted', () => {
  const Links = require('../renderer/links');
  const t = { artist: 'Oasis', title: 'Sad Song & more' };
  assert.equal(Links.youtube(t), 'https://www.youtube.com/results?search_query=Oasis%20Sad%20Song%20%26%20more');
  assert.equal(Links.spotify(t), 'https://open.spotify.com/search/Oasis%20Sad%20Song%20%26%20more');
  for (const u of [Links.youtube(t), Links.spotify(t)]) assert.equal(safeExternal(u), u);
});

test('no iTunes host is left in the net layer, caches, CSP or flows', () => {
  const fs = require('node:fs'), path = require('node:path');
  for (const f of ['src/net.js', 'src/cache.js', 'src/music.js', 'src/stamps.js', 'renderer/app.js'])
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), /itunes\.apple|mzstatic|\.apple\.com/i, f);
  // old saved likes keep their Apple cover art: images only, never audio
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer/index.html'), 'utf8');
  assert.doesNotMatch(html.match(/media-src[^;"]*/)[0], /mzstatic|apple/i);
  assert.doesNotMatch(html.replace(/img-src[^;"]*/, ''), /itunes\.apple|mzstatic|\.apple\.com/i);
});
