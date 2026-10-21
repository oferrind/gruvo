// Pure cache rules: TTL per host, freshness check, size cap.
const DAY = 86400000;
const TTL = { 'musicbrainz.org': 30 * DAY, 'itunes.apple.com': DAY, 'api.deezer.com': 10 * 60000 }; // Deezer preview tokens die after ~15 min

const ttlFor = url => TTL[new URL(url).hostname] ?? 0;
const isFresh = (entry, url, now = Date.now()) => !!entry && now - entry.t < ttlFor(url);

// Drops the oldest entries until the cache holds at most `cap`.
function prune(cache, cap = 5000) {
  const keys = Object.keys(cache);
  if (keys.length <= cap) return cache;
  keys.sort((a, b) => cache[a].t - cache[b].t).slice(0, keys.length - cap).forEach(k => delete cache[k]);
  return cache;
}

module.exports = { ttlFor, isFresh, prune };
