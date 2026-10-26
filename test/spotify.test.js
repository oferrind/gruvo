const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../src/spotify');
const net = require('../src/net');
const { safeExternal } = require('../src/links');

const CID = '0123456789abcdef0123456789abcdef';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ah-spotify-'));
const crypt = { available: () => true, encrypt: s => Buffer.from('enc:' + s), decrypt: b => String(b).slice(4) };
const res = (status, body, headers = {}) => ({ status, body, headers: new Headers(headers) });

// A client whose `send` is a scripted fake: routes(url, opts) -> res. Records every call.
function client(routes, { dir = tmp(), getJson = async () => ({}) } = {}) {
  const calls = [];
  const send = async (url, opts = {}) => { calls.push({ url, ...opts }); return routes(url, opts, calls); };
  const sleeps = [];
  const c = S.create({ dir, send, getJson, crypt, openUrl: () => {}, sleep: async ms => { sleeps.push(ms); } });
  return { c, calls, sleeps, dir };
}
const connected = dir => { fs.writeFileSync(path.join(dir, 'spotify.json'), JSON.stringify({ clientId: CID, name: 'Ofer', refresh: Buffer.from('enc:RT1').toString('base64') })); return dir; };
const tokenOk = (url, extra = {}) => url.endsWith('/api/token') && res(200, { access_token: 'AT', expires_in: 3600, ...extra });

test('PKCE: verifier 43-128 unreserved chars, challenge = base64url(sha256(verifier))', () => {
  const { verifier, challenge } = S.pkce();
  assert.match(verifier, /^[A-Za-z0-9_.~-]{43,128}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.doesNotMatch(challenge, /[=+/]/);
  assert.notEqual(S.pkce().verifier, verifier);
});

test('authorize URL carries client id, S256 challenge, state, loopback redirect and minimal scopes', () => {
  const u = new URL(S.authUrl(CID, 'CH', 'ST'));
  assert.equal(u.origin + u.pathname, 'https://accounts.spotify.com/authorize');
  const p = Object.fromEntries(u.searchParams);
  assert.deepEqual(p, { client_id: CID, response_type: 'code', redirect_uri: 'http://127.0.0.1:47813/callback', code_challenge_method: 'S256',
    code_challenge: 'CH', state: 'ST', scope: 'user-read-playback-state user-modify-playback-state playlist-modify-private' });
  assert.equal(safeExternal(u.href), u.href, 'the login page must pass the shell:open allowlist');
});

test('state and client id validation', () => {
  assert.ok(S.stateOk('abc', 'abc'));
  for (const bad of ['abd', 'ab', '', null, undefined]) assert.equal(S.stateOk('abc', bad), false, String(bad));
  assert.equal(S.stateOk('', ''), false);
  assert.ok(S.validClientId(CID));
  for (const bad of ['', 'x'.repeat(32), CID + '0', `${CID.slice(0, 31)}&`]) assert.equal(S.validClientId(bad), false);
});

test('chunk: at most 100 URIs per add-items call', () => {
  const parts = S.chunk(Array.from({ length: 250 }, (_, i) => i));
  assert.deepEqual(parts.map(p => p.length), [100, 100, 50]);
  assert.deepEqual(S.chunk([]), []);
});

test('error mapping names the problem and the recovery', () => {
  assert.match(S.errorFor(401), /Connect again/);
  assert.match(S.errorFor(403), /Premium/);
  assert.match(S.errorFor(403), /Users/);
  assert.equal(S.errorFor(404), S.NO_DEVICE);
  assert.match(S.errorFor(429), /Try again/);
  assert.match(S.errorFor(0), /connection/);
});

test('token refresh: PKCE body (client_id, no secret), keeps old refresh token when none returned, stores new one encrypted', async () => {
  const { c, calls, dir } = client(url => tokenOk(url) || res(200, { devices: [] }), { dir: connected(tmp()) });
  assert.equal(await c.token(), 'AT');
  const body = Object.fromEntries(new URLSearchParams(calls[0].body));
  assert.deepEqual(body, { grant_type: 'refresh_token', refresh_token: 'RT1', client_id: CID });
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(await c.token(), 'AT');
  assert.equal(calls.length, 1, 'a fresh access token is reused');
  // rotation
  const r2 = client(url => tokenOk(url, { refresh_token: 'RT2' }), { dir });
  await r2.c.token();
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'spotify.json'), 'utf8'));
  assert.equal(Buffer.from(saved.refresh, 'base64').toString(), 'enc:RT2');
  assert.ok(!JSON.stringify(saved).includes('"RT2"'), 'never stored in clear');
});

test('401 refreshes once and retries; revoked refresh token disconnects', async () => {
  let n = 0;
  const { c, calls } = client(url => tokenOk(url) || (n++ === 0 ? res(401, null) : res(200, { devices: [{ id: 'd1', name: 'PC', type: 'Computer', is_active: true }] })),
    { dir: connected(tmp()) });
  assert.deepEqual(await c.devices(), { devices: [{ id: 'd1', name: 'PC', type: 'Computer', active: true }] });
  assert.equal(calls.filter(x => x.url.endsWith('/api/token')).length, 2);
  const r = client(url => res(400, { error: 'invalid_grant' }), { dir: connected(tmp()) });
  assert.match((await r.c.devices()).error, /Connect again/);
  assert.equal(r.c.status().connected, false);
});

test('429 waits Retry-After then retries; 403 explains Premium/allowlist; 404 on play = no device', async () => {
  let n = 0;
  const a = client(url => tokenOk(url) || (n++ === 0 ? res(429, null, { 'Retry-After': '3' }) : res(200, { devices: [] })), { dir: connected(tmp()) });
  assert.deepEqual(await a.c.devices(), { devices: [] });
  assert.deepEqual(a.sleeps, [3000]);
  const b = client(url => tokenOk(url) || res(403, { error: { status: 403 } }), { dir: connected(tmp()) });
  assert.match((await b.c.devices()).error, /Premium/);
  const d = client(url => tokenOk(url) || (url.includes('/search') ? res(200, { tracks: { items: [{ uri: 'spotify:track:abc', name: 'Creep', artists: [{ name: 'Radiohead' }] }] } })
    : url.includes('/devices') ? res(200, { devices: [{ id: 'd1', is_active: true }] }) : res(404, null)), { dir: connected(tmp()) });
  const r = await d.c.play({ source: 'it', id: '1', artist: 'Radiohead', title: 'Creep' });
  assert.equal(r.error, S.NO_DEVICE);
});

test('play: no device, several devices (ask), one active (plays exact URI there)', async () => {
  const hit = { tracks: { items: [{ uri: 'spotify:track:abc', name: 'Creep', artists: [{ name: 'Radiohead' }] }] } };
  const t = { source: 'it', id: '1', artist: 'Radiohead', title: 'Creep' };
  const mk = devices => client(url => tokenOk(url) || (url.includes('/search') ? res(200, hit) : url.includes('/devices') ? res(200, { devices }) : res(204, null)), { dir: connected(tmp()) });
  assert.deepEqual(await mk([]).c.play(t), { error: S.NO_DEVICE, noDevice: true });
  assert.equal((await mk([{ id: 'a', name: 'PC' }, { id: 'b', name: 'Phone' }]).c.play(t)).devices.length, 2);
  const one = mk([{ id: 'a' }, { id: 'b', is_active: true }]);
  assert.deepEqual(await one.c.play(t), { ok: true, device: 'b' });
  const put = one.calls.find(x => x.method === 'PUT');
  assert.equal(put.url, 'https://api.spotify.com/v1/me/player/play?device_id=b');
  assert.deepEqual(JSON.parse(put.body), { uris: ['spotify:track:abc'] });
  assert.equal(put.headers.Authorization, 'Bearer AT');
});

test('matching: ISRC from Deezer first, strict artist+title fallback, cached by our id', async () => {
  const qs = [];
  const routes = url => {
    if (tokenOk(url)) return tokenOk(url);
    const q = new URL(url).searchParams.get('q');
    qs.push(q);
    if (q === 'isrc:GBAYE9300087') return res(200, { tracks: { items: [{ uri: 'spotify:track:other', name: 'Creep', artists: [{ name: 'Someone' }] }, { uri: 'spotify:track:isrc1', name: 'Creep', artists: [{ name: 'Radiohead' }] }] } });
    return res(200, { tracks: { items: [{ uri: 'spotify:track:live', name: 'Creep - Live', artists: [{ name: 'Radiohead' }] }, { uri: 'spotify:track:cover', name: 'Creep', artists: [{ name: 'Postmodern Jukebox' }] }, { uri: 'spotify:track:ok', name: 'Creep (Remastered)', artists: [{ name: 'Radiohead' }] }] } });
  };
  const dz = [];
  const { c, dir } = client(routes, { dir: connected(tmp()), getJson: async u => { dz.push(u); return { isrc: 'GBAYE9300087' }; } });
  assert.equal(await c.match({ source: 'dz', id: 3135556, artist: 'Radiohead', title: 'Creep' }), 'spotify:track:isrc1');
  assert.deepEqual(dz, ['https://api.deezer.com/track/3135556']);
  assert.equal(await c.match({ source: 'it', id: 9, artist: 'Radiohead', title: 'Creep (Acoustic)' }), 'spotify:track:ok');
  assert.equal(qs.at(-1), 'track:Creep artist:Radiohead');
  assert.equal(await c.match({ source: 'it', id: 10, artist: 'Nobody', title: 'Creep' }), null);
  const n = qs.length;
  const again = client(routes, { dir });
  assert.equal(await again.c.match({ source: 'dz', id: 3135556, artist: 'Radiohead', title: 'Creep' }), 'spotify:track:isrc1');
  assert.equal(qs.length, n, 'cached on disk, no search');
});

test('export: private playlist via POST /me/playlists, items in ≤100 chunks, unmatched listed', async () => {
  const tracks = Array.from({ length: 205 }, (_, i) => ({ source: 'it', id: String(i), artist: 'A' + i, title: 'T' + i }));
  const { c, calls } = client((url, o) => {
    if (tokenOk(url)) return tokenOk(url);
    if (url.includes('/search')) {
      const m = /artist:A(\d+)/.exec(new URL(url).searchParams.get('q')), i = Number(m[1]);
      return res(200, { tracks: { items: i % 50 === 7 ? [] : [{ uri: `spotify:track:t${i}`, name: 'T' + i, artists: [{ name: 'A' + i }] }] } });
    }
    if (url.endsWith('/me/playlists')) return res(201, { id: 'PL1', external_urls: { spotify: 'https://open.spotify.com/playlist/PL1' } });
    return res(201, { snapshot_id: 's' });
  }, { dir: connected(tmp()) });
  const r = await c.exportPlaylist('Loved', tracks);
  assert.equal(r.added, 201);
  assert.equal(r.total, 205);
  assert.deepEqual(r.unmatched.map(u => u.title), ['T7', 'T57', 'T107', 'T157']);
  const create = calls.find(x => x.url.endsWith('/me/playlists'));
  assert.deepEqual(JSON.parse(create.body), { name: 'Loved', public: false, description: 'Made with Gruvo' });
  const adds = calls.filter(x => x.url.endsWith('/playlists/PL1/items')).map(x => JSON.parse(x.body).uris);
  assert.deepEqual(adds.map(a => a.length), [100, 100, 1]);
  assert.equal(adds[0][0], 'spotify:track:t0');
  assert.equal(r.url, 'https://open.spotify.com/playlist/PL1');
});

test('loopback login: listens on 127.0.0.1 only, ignores bad state, exchanges the code, closes the port', async () => {
  const dir = tmp();
  let opened;
  const send = async (url, o) => url.endsWith('/api/token') ? res(200, { access_token: 'AT', expires_in: 3600, refresh_token: 'RT' })
    : res(200, { id: 'u1', display_name: 'Ofer' });
  const c = S.create({ dir, send, getJson: async () => ({}), crypt, openUrl: u => { opened = new URL(u); } });
  const p = c.connect(CID);
  while (!opened) await new Promise(r => setTimeout(r, 10));
  assert.equal((await fetch(`http://127.0.0.1:${S.PORT}/callback?code=x&state=wrong`)).status, 404);
  const ok = await fetch(`http://127.0.0.1:${S.PORT}/callback?code=CODE&state=${opened.searchParams.get('state')}`);
  assert.equal(ok.status, 200);
  const st = await p;
  assert.deepEqual(st, { clientId: CID, connected: true, name: 'Ofer', redirectUri: S.REDIRECT, pending: false });
  await assert.rejects(fetch(`http://127.0.0.1:${S.PORT}/callback`), 'port closed after the callback');
  assert.deepEqual(await c.connect('nope'), { error: 'That is not a Client ID. Copy the 32-character Client ID from your Spotify app.' });
});

test('net.send: Spotify hosts only (the Authorization header can never reach another host), never cached', async () => {
  const orig = global.fetch, seen = [];
  global.fetch = async (url, o) => { seen.push([url, o]); return new Response('{"a":1}', { status: 200 }); };
  try {
    for (const bad of ['https://api.deezer.com/x', 'http://api.spotify.com/v1/me', 'https://api.spotify.com.evil.com/v1', 'https://api.spotify.com:444/v1', 'https://u@api.spotify.com/v1'])
      assert.deepEqual(await net.send(bad, { headers: { Authorization: 'Bearer X' } }), { error: { message: 'host not allowed' } }, bad);
    assert.equal(seen.length, 0);
    assert.deepEqual((await net.send('https://api.spotify.com/v1/me')).body, { a: 1 });
    await net.send('https://api.spotify.com/v1/me');
    assert.equal(seen.length, 2, 'no cache: each call hits the network');
    assert.equal(seen[0][1].redirect, 'error');
  } finally { global.fetch = orig; }
});

test('pickDevice: this PC beats the active phone; then the last used; several unknown -> ask', () => {
  const S = require('../src/spotify');
  const phone = { id: 'p', name: 'OnePlus 13', type: 'Smartphone', active: true }, pc = { id: 'c', name: 'OFER-PC', type: 'Computer', active: false };
  const tv = { id: 't', name: 'Living room', type: 'TV', active: false };
  assert.equal(S.pickDevice([phone, pc], undefined, 'Ofer-PC'), 'c');
  assert.equal(S.pickDevice([phone, tv], 't', 'Ofer-PC'), 't');
  assert.equal(S.pickDevice([phone], undefined, 'Ofer-PC'), 'p');
  assert.equal(S.pickDevice([phone, tv], undefined, 'Ofer-PC'), 'p'); // no PC, no last: the active one
  assert.equal(S.pickDevice([{ ...phone, active: false }, tv], undefined, 'Ofer-PC'), null);
});
