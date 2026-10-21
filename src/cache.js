// Pure cache rules: TTL per host, freshness check, size cap.
const DAY = 86400000;
const TTL = { 'musicbrainz.org': 30 * DAY, 'itunes.apple.com': DAY, 'api.deezer.com': 10 * 60000 }; // Deezer preview tokens die after ~15 min

const ttlFor = url => TTL[new URL(url).hostname] ?? 0;
const isFresh = (entry, url, now = Date.now()) => !!entry && now - entry.t < ttlFor(url);

// Drops expired entries (never served again), then the oldest until within `cap` entries and ~`maxBytes`.
// MB artist/work bodies run 30-100 KB each, so an entry cap alone let the file reach tens of MB.
function prune(cache, cap = 5000, maxBytes = 20e6, now = Date.now()) {
  for (const k of Object.keys(cache)) if (!isFresh(cache[k], k, now)) delete cache[k];
  let bytes = 0;
  Object.keys(cache).sort((a, b) => cache[b].t - cache[a].t).forEach((k, i) => {
    bytes += k.length + JSON.stringify(cache[k]).length;
    if (i >= cap || bytes > maxBytes) delete cache[k];
  });
  return cache;
}

module.exports = { ttlFor, isFresh, prune };
