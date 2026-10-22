// Profile persistence: userData/profile.json, written atomically (tmp + rename).
const fs = require('fs');
const path = require('path');
const { norm, COUNTRIES } = require('./music');

const DEFAULT = () => ({ likes: [], heard: [], stamps: {}, adventure: 50, ratings: [], prefs: validPrefs() });
const MAX_RATINGS = 500;

// Sound Fingerprint ratings: {id, rating, features}; anything malformed is dropped, newest MAX_RATINGS kept.
const RATING = { love: 1, ok: 1, skip: 1 };
const validRatings = r => (Array.isArray(r) ? r : []).filter(x => x && typeof x.id === 'string' && Object.hasOwn(RATING, x.rating)
  && Array.isArray(x.features) && x.features.length > 0 && x.features.length <= 64 && x.features.every(Number.isFinite))
  .slice(-MAX_RATINGS).map(({ id, rating, features, seed }) => (seed === true ? { id, rating, features, seed } : { id, rating, features }));

// Taste preferences from the first-launch step: anything malformed is dropped, lists capped.
const name = s => typeof s === 'string' && s.trim() !== '' && s.length <= 200;
const list = (a, ok, max) => (Array.isArray(a) ? a : []).filter(ok).slice(0, max);
const uniq = a => [...new Set(a)];
function validPrefs(p) {
  p = p && typeof p === 'object' ? p : {};
  return {
    genres: list(p.genres, g => g && Number.isInteger(g.id) && name(g.name), 30).map(({ id, name }) => ({ id, name })),
    artists: list(p.artists, a => a && Number.isInteger(a.dzId) && name(a.name), 30).map(({ dzId, name }) => ({ dzId, name })),
    decades: uniq(list(p.decades, d => Number.isInteger(d) && d >= 1900 && d <= 2090 && d % 10 === 0, 20)),
    regions: uniq(list(p.regions, r => typeof r === 'string' && Object.hasOwn(COUNTRIES, r), 10)),
  };
}
let file = null;

function init(dir) { file = path.join(dir, 'profile.json'); }

function load() {
  let raw, p;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return DEFAULT(); }
  try { p = JSON.parse(raw); } catch {}
  if (!p || typeof p !== 'object') {
    // Move it aside so the next save can't destroy the user's likes for good.
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch (e) { console.error('profile backup failed', e.message); }
    return DEFAULT();
  }
  const d = DEFAULT();
  const likes = Array.isArray(p.likes) ? p.likes : d.likes;
  // R4 migration: a name-only heard entry of a loved Deezer artist becomes its id(s), so same-name strangers aren't hidden.
  const ids = h => likes.filter(l => l && l.artistDzId != null && norm(l.artist) === h).map(l => `dz:${l.artistDzId}`);
  return {
    likes,
    heard: Array.isArray(p.heard) ? [...new Set(p.heard.flatMap(h => { const x = ids(h); return x.length ? x : [h]; }))] : d.heard,
    stamps: p.stamps && typeof p.stamps === 'object' ? p.stamps : d.stamps,
    adventure: Number.isFinite(p.adventure) ? p.adventure : d.adventure,
    ratings: validRatings(p.ratings),
    prefs: validPrefs(p.prefs),
  };
}

function save(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.likes) || !Array.isArray(p.heard)) throw new Error('invalid profile');
  const data = { likes: p.likes, heard: p.heard, stamps: p.stamps || {}, adventure: Number(p.adventure) || 0, ratings: validRatings(p.ratings), prefs: validPrefs(p.prefs) };
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1));
  fs.renameSync(file + '.tmp', file);
  return true;
}

module.exports = { init, load, save };
