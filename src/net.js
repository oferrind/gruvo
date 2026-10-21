// All network access: host allowlist, per-host pacing, retries, JSON disk cache.
const fs = require('fs');
const path = require('path');
const { isFresh, prune } = require('./cache');

const GAP = { 'musicbrainz.org': 1500, 'api.deezer.com': 125, 'itunes.apple.com': 3000 };
const UA = 'MusicDiscovery/0.1 (you@example.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let cacheFile = null, cache = {}, saveTimer = null;

function initCache(dir) {
  cacheFile = path.join(dir, 'cache.json');
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushCache, 2000);
}

function flushCache() {
  if (!cacheFile) return;
  clearTimeout(saveTimer);
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
async function get(url, { fresh = false } = {}) {
  let u;
  try { u = new URL(url); } catch { return { error: { message: 'bad url' } }; }
  const host = u.hostname;
  if (u.protocol !== 'https:' || !Object.hasOwn(GAP, host)) return { error: { message: 'host not allowed' } };
  if (!fresh && isFresh(cache[url], url)) return cache[url].body;

  for (let attempt = 0; attempt < 3; attempt++) {
    await slot(host);
    let res, body;
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
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

module.exports = { get, initCache, flushCache };
