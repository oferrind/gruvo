// Spotify (main process only): PKCE login over a loopback redirect, play a track on the user's device, export playlists.
// Tokens never leave this module; the refresh token is stored encrypted (safeStorage). Spotify audio is never analysed:
// the Sound Fingerprint keeps using Deezer/iTunes previews (Spotify's terms forbid analysing their audio).
// Docs (checked 2026-10): developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow, .../concepts/redirect_uri,
// .../tutorials/february-2026-migration-guide (POST /me/playlists, /playlists/{id}/items, search limit max 10).
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { artistMatch, baseTitle } = require('./music');

const PORT = 47813; // fixed so the redirect URI registered in the dashboard never changes
const REDIRECT = `http://127.0.0.1:${PORT}/callback`; // Spotify: 'localhost' is not allowed, http only for loopback IP literals
const SCOPES = 'user-read-playback-state user-modify-playback-state playlist-modify-private';
const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';
const LOGIN_TIMEOUT = 5 * 60000;
const NO_DEVICE = 'Open Spotify on this PC or your phone, then try again.';

// ---------- pure helpers ----------
const b64url = buf => buf.toString('base64url');
function pkce() {
  const verifier = b64url(crypto.randomBytes(48)); // 64 chars of [A-Za-z0-9_-]: inside the 43-128 rule
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) };
}
const authUrl = (clientId, challenge, state) => `${ACCOUNTS}/authorize?${new URLSearchParams({ client_id: clientId, response_type: 'code',
  redirect_uri: REDIRECT, code_challenge_method: 'S256', code_challenge: challenge, state, scope: SCOPES })}`;
const validClientId = id => /^[0-9a-f]{32}$/i.test(String(id));
function stateOk(expected, got) {
  const a = Buffer.from(String(expected)), b = Buffer.from(String(got ?? ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
// The user is sitting at this PC: its Spotify app wins over whichever device was last active (often the phone).
// Then the device they last played on, then the active one, then the only one; otherwise null = ask.
function pickDevice(list, last, host) {
  const here = list.find(d => d.type === 'Computer' && String(d.name).toLowerCase() === String(host).toLowerCase());
  const pick = here || list.find(d => d.id === last) || list.find(d => d.active) || (list.length === 1 ? list[0] : null);
  return pick ? pick.id : null;
}
const chunk = (arr, n = 100) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n)); // add-items max 100

function errorFor(status) {
  if (status === 401) return 'Your Spotify sign-in expired. Connect again in Preferences → Spotify.';
  if (status === 403) return 'Spotify refused this. Playback needs Spotify Premium, and your account must be listed under Users in your Spotify app dashboard.';
  if (status === 404) return NO_DEVICE;
  if (status === 429) return 'Spotify is busy (rate limit). Try again in a minute.';
  return status ? `Spotify error ${status}. Try again.` : "Couldn't reach Spotify. Check your connection.";
}
class SpotifyError extends Error { constructor(status) { super(errorFor(status)); this.status = status; } }

const plainTitle = t => String(t).replace(/\s*[([].*$/, '').replace(/"/g, '') || String(t);
const hasArtist = (it, t) => (it.artists || []).some(a => artistMatch(a.name, t.artist));
// ISRC hits: the same recording; prefer the one credited to our artist. Text hits: artist AND base title must agree.
const pickIsrc = (items, t) => ((items || []).find(it => hasArtist(it, t)) || (items || [])[0] || {}).uri || null;
const pickStrict = (items, t) => ((items || []).find(it => hasArtist(it, t) && baseTitle(it.name) === baseTitle(t.title)) || {}).uri || null;

// ---------- the client ----------
// deps: dir (userData), send (net.send), getJson (net.get, for Deezer ISRC), crypt {available, encrypt, decrypt}, openUrl, sleep, now.
function create({ dir, send, getJson, crypt, openUrl, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, host = require('os').hostname() }) {
  const file = path.join(dir, 'spotify.json'), matchFile = path.join(dir, 'spotify-matches.json');
  const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch { return {}; } };
  const write = (f, o) => { try { fs.writeFileSync(f + '.tmp', JSON.stringify(o)); fs.renameSync(f + '.tmp', f); } catch (e) { console.error('spotify save failed', e.message); } };
  let st = read(file), matches = read(matchFile), refreshMem = null, acc = null, refreshing = null, login = null;

  async function refreshToken() {
    if (refreshMem) return refreshMem;
    if (!st.refresh || !(await crypt.available())) return null;
    try { return (refreshMem = await crypt.decrypt(Buffer.from(st.refresh, 'base64'))); } catch { return null; }
  }
  async function setRefresh(rt) {
    refreshMem = rt;
    // shortcut: without OS encryption the token stays in memory only (reconnect each launch).
    st.refresh = (await crypt.available()) ? (await crypt.encrypt(rt)).toString('base64') : undefined;
    write(file, st);
  }

  async function tokenReq(params) {
    const r = await send(`${ACCOUNTS}/api/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString() });
    if (r.error || r.status !== 200 || !r.body || !r.body.access_token) return { status: r.status || 0, oauth: r.body && r.body.error };
    acc = { token: r.body.access_token, exp: now() + (Number(r.body.expires_in) || 3600) * 1000 };
    if (r.body.refresh_token) await setRefresh(r.body.refresh_token); // refresh may omit it: keep the old one
    return {};
  }

  async function token(force) {
    if (!force && acc && acc.exp - 60000 > now()) return acc.token;
    const rt = await refreshToken();
    if (!rt || !st.clientId) return null;
    refreshing ??= tokenReq({ grant_type: 'refresh_token', refresh_token: rt, client_id: st.clientId }).finally(() => { refreshing = null; });
    const r = await refreshing;
    if (r.oauth === 'invalid_grant') forget(); // revoked in Spotify's account page
    return r.status === undefined && acc ? acc.token : null;
  }

  // JSON body or {} (204). Throws SpotifyError. 401: refresh once; 429: honour Retry-After up to 30 s, twice.
  async function api(method, p, body, tries = 0) {
    const t = await token();
    if (!t) throw new SpotifyError(401);
    const r = await send(API + p, { method, headers: { Authorization: `Bearer ${t}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    if (r.error) throw new SpotifyError(0);
    if (r.status === 401 && tries === 0) { acc = null; return api(method, p, body, 1); }
    if (r.status === 429 && tries < 2) {
      const s = Number(r.headers && r.headers.get('retry-after')) || 1;
      if (s <= 30) { await sleep(s * 1000); return api(method, p, body, tries + 1); }
    }
    if (r.status >= 400) throw new SpotifyError(r.status);
    return r.body || {};
  }
  const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (!(e instanceof SpotifyError)) console.error('spotify', e); return { error: e instanceof SpotifyError ? e.message : 'Spotify failed. Try again.', status: e.status }; } };

  async function search(q, limit) {
    const r = await api('GET', `/search?${new URLSearchParams({ q, type: 'track', limit: String(limit) })}`);
    return (r.tracks && r.tracks.items) || [];
  }
  // Our track -> spotify:track URI or null. ISRC first (Deezer's /track/{id} has it), then strict artist+title.
  async function match(t) {
    const key = `${t.source}:${t.id}`;
    if (t.id && matches[key]) return matches[key];
    let isrc = t.isrc;
    if (!isrc && t.source === 'dz' && t.id) { const d = await getJson(`https://api.deezer.com/track/${encodeURIComponent(t.id)}`); isrc = d && d.isrc; }
    let uri = isrc && /^[A-Z0-9]{12}$/i.test(isrc) ? pickIsrc(await search(`isrc:${isrc}`, 5), t) : null;
    uri ||= pickStrict(await search(`track:${plainTitle(t.title)} artist:${t.artist}`, 10), t);
    if (uri && !/^spotify:track:[A-Za-z0-9]+$/.test(uri)) uri = null;
    if (uri && t.id) { matches[key] = uri; write(matchFile, matches); }
    return uri;
  }

  function forget() { refreshMem = null; acc = null; st = { clientId: st.clientId }; write(file, st); }
  const status = () => ({ clientId: st.clientId || '', connected: !!(refreshMem || st.refresh), name: st.name || '', redirectUri: REDIRECT, pending: !!login });

  function connect(clientId) {
    clientId = String(clientId || '').trim();
    if (!validClientId(clientId)) return Promise.resolve({ error: 'That is not a Client ID. Copy the 32-character Client ID from your Spotify app.' });
    if (login) login.cancel();
    if (st.clientId !== clientId) { refreshMem = null; acc = null; st = { clientId }; write(file, st); } // remember the ID even if this login fails
    const { verifier, challenge } = pkce(), state = b64url(crypto.randomBytes(16));
    return new Promise(resolve => {
      let over = false;
      const server = http.createServer(async (req, res) => {
        const u = new URL(req.url, REDIRECT);
        // A request without our state (a stray tab, another site) is ignored; the login keeps waiting until its timeout.
        if (u.pathname !== '/callback' || !stateOk(state, u.searchParams.get('state'))) { res.writeHead(404).end(); return; }
        const code = u.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
          .end(code ? 'Connected to Spotify. You can close this tab and go back to Stumble.' : 'Spotify login was cancelled. You can close this tab.');
        if (!code) return done({ error: 'Spotify login was cancelled.' });
        st = { clientId };
        const r = await tokenReq({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier });
        if (r.status !== undefined) return done({ error: r.status === 400 ? 'Spotify rejected the login. Check the Client ID and the redirect URI in your app.' : errorFor(r.status) });
        const me = await wrap(() => api('GET', '/me'))(); // no scope needed for id/display_name
        st.name = me.display_name || me.id || '';
        write(file, st);
        done(); // status() after the login slot is freed
      });
      const timer = setTimeout(() => done({ error: 'Spotify login timed out. Try again.' }), LOGIN_TIMEOUT);
      const self = { cancel: () => done({ error: 'Login cancelled.' }) };
      function done(r) {
        if (over) return;
        over = true;
        clearTimeout(timer);
        server.close();
        server.closeAllConnections();
        if (login === self) login = null;
        resolve(r || status());
      }
      login = self;
      server.on('error', e => done({ error: e.code === 'EADDRINUSE' ? `Port ${PORT} is in use, so the Spotify login can't come back. Close the program using it and try again.` : e.message }));
      server.listen(PORT, '127.0.0.1', () => Promise.resolve(openUrl(authUrl(clientId, challenge, state))).catch(() => done({ error: 'Could not open the browser.' })));
    });
  }

  function disconnect() { if (login) login.cancel(); forget(); return status(); }

  async function devices() {
    const r = await api('GET', '/me/player/devices');
    return { devices: (r.devices || []).filter(d => d.id && !d.is_restricted).map(d => ({ id: d.id, name: d.name, type: d.type, active: !!d.is_active })) };
  }

  // {ok} | {devices} (several, none active: ask which) | {error, noDevice?}
  async function play(t, deviceId) {
    const uri = await match(t);
    if (!uri) return { error: `Spotify doesn't seem to have "${t.title}".` };
    let id = deviceId, name;
    if (!id) {
      const list = (await devices()).devices;
      if (!list.length) return { error: NO_DEVICE, noDevice: true };
      id = pickDevice(list, st.device, host);
      if (!id) return { devices: list };
      name = list.find(d => d.id === id).name;
    }
    try { await api('PUT', `/me/player/play?device_id=${encodeURIComponent(id)}`, { uris: [uri] }); }
    catch (e) { if (e.status === 404) return { error: NO_DEVICE, noDevice: true }; throw e; }
    if (st.device !== id) { st.device = id; write(file, st); }
    return { ok: true, device: id, ...(name ? { name } : {}) };
  }

  // Private playlist in the given order. {url, added, total, unmatched: [{artist, title}]}
  async function exportPlaylist(name, tracks) {
    const uris = [], unmatched = [];
    for (const t of tracks) { const u = await match(t); if (u) uris.push(u); else unmatched.push({ artist: t.artist, title: t.title }); }
    if (!uris.length) return { error: 'None of these songs were found on Spotify.', unmatched };
    const pl = await api('POST', '/me/playlists', { name, public: false, description: 'Made with Stumble' });
    if (!/^[A-Za-z0-9]+$/.test(pl.id || '')) throw new SpotifyError(0);
    for (const part of chunk(uris)) await api('POST', `/playlists/${pl.id}/items`, { uris: part });
    return { url: (pl.external_urls && pl.external_urls.spotify) || `https://open.spotify.com/playlist/${pl.id}`, added: uris.length, total: tracks.length, unmatched };
  }

  return { status, connect, disconnect, devices: wrap(devices), play: wrap(play), exportPlaylist: wrap(exportPlaylist), match, token };
}

module.exports = { create, pkce, authUrl, validClientId, stateOk, chunk, pickDevice, errorFor, pickIsrc, pickStrict, REDIRECT, SCOPES, PORT, NO_DEVICE };
