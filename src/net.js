// All network access: host allowlist, per-host pacing, retries, JSON disk cache.
const fs = require('fs');
const path = require('path');
const { isFresh, prune } = require('./cache');

const GAP = { 'musicbrainz.org': 1500, 'api.deezer.com': 125, 'itunes.apple.com': 3000, 'en.wikipedia.org': 200, 'www.wikidata.org': 200 };
const UA = 'MusicDiscovery/0.1 (you@example.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let cacheFile = null, cache = {}, saveTimer = null;

function initCache(dir) {
  cacheFile = path.join(dir, 'cache.json');
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
}

function scheduleSave() {
  saveTimer ??= setTimeout(flushCache, 2000); // don't restart: steady traffic would postpone the save forever
}

function flushCache() {
  if (!cacheFile) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  prune(cache);
  try { fs.writeFileSync(cacheFile + '.tmp', JSON.stringify(cache)); fs.renameSync(cacheFile + '.tmp', cacheFile); }
  catch (e) { console.error('cache save failed', e.message); }
}

// Serial slot per host so requests start at least GAP ms apart.
const chains = {}, last = {};
function slot(host) {
  const p = (chains[host] || Promise.resolve()).then(async () => {
    const wait = (last[host] || 0) + GAP[host] - Date.now();
    if (wait > 0) await sleep(wait);
    last[host] = Date.now();
  });
  chains[host] = p;
  return p;
}

// Returns parsed JSON, or {error} on any failure. Never throws.
// The same url asked for again while the first request is still out shares it (each extra MB call costs 1.5 s).
const inflight = new Map();
function get(url, { fresh = false } = {}) {
  if (fresh) return load(url, true);
  if (!inflight.has(url)) inflight.set(url, load(url, false).finally(() => inflight.delete(url)));
  return inflight.get(url);
}

async function load(url, fresh) {
  let u;
  try { u = new URL(url); } catch { return { error: { message: 'bad url' } }; }
  const host = u.hostname;
  if (u.protocol !== 'https:' || !Object.hasOwn(GAP, host)) return { error: { message: 'host not allowed' } };
  if (!fresh && isFresh(cache[url], url)) return cache[url].body;

  for (let attempt = 0; attempt < 3; attempt++) {
    await slot(host);
    let res, body;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      if (host === 'musicbrainz.org' && res.status === 503 && attempt < 2) { await sleep(2000 * 2 ** attempt); continue; }
      if (!res.ok) return { error: { status: res.status } };
      body = await res.json();
    } catch (e) {
      return { error: { message: e.message } };
    }
    // Deezer reports errors with HTTP 200; code 4 = quota.
    if (body && body.error) {
      if (host === 'api.deezer.com' && body.error.code === 4 && attempt === 0) { await sleep(5000); continue; }
      return body;
    }
    cache[url] = { t: Date.now(), body };
    scheduleSave();
    return body;
  }
  return { error: { message: 'retries exhausted' } };
}

// Preview audio for the Sound Fingerprint: only the preview CDNs, https, no redirects, at most MAX_AUDIO bytes.
const MAX_AUDIO = 2 * 1024 * 1024;
const isAudioHost = h => h.endsWith('.dzcdn.net') || h.endsWith('.mzstatic.com') || h === 'audio-ssl.itunes.apple.com';

// Returns an ArrayBuffer, or {error}. Never throws.
async function audio(url) {
  let u;
  try { u = new URL(url); } catch { return { error: { message: 'bad url' } }; }
  if (u.protocol !== 'https:' || !isAudioHost(u.hostname)) return { error: { message: 'host not allowed' } };
  try {
    const res = await fetch(u.href, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { error: { status: res.status } };
    if (Number(res.headers.get('content-length')) > MAX_AUDIO) return { error: { message: 'too large' } };
    const chunks = [];
    let size = 0;
    for await (const c of res.body) {
      if ((size += c.length) > MAX_AUDIO) return { error: { message: 'too large' } };
      chunks.push(c);
    }
    const b = Buffer.concat(chunks);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
  } catch (e) {
    return { error: { message: e.message } };
  }
}

module.exports = { get, audio, initCache, flushCache };
