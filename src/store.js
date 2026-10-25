// Profile persistence: userData/profile.json, written atomically (tmp + rename).
const fs = require('fs');
const path = require('path');
const { norm, COUNTRIES } = require('./music');
const { validSettings } = require('./tree');

const DEFAULT = () => ({ likes: [], heard: [], stamps: {}, rarity: {}, adventure: 50, ratings: [], prefs: validPrefs(), last: null, back: validBack() });
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
const SCHEMES = ['shop', 'bluelabel', 'riso', 'tuner', 'soul', 'bleep', 'mixtape', 'acid'];
function validPrefs(p) {
  p = p && typeof p === 'object' ? p : {};
  return {
    genres: list(p.genres, g => g && Number.isInteger(g.id) && name(g.name), 30).map(({ id, name }) => ({ id, name })),
    artists: list(p.artists, a => a && Number.isInteger(a.dzId) && name(a.name), 30).map(({ dzId, name }) => ({ dzId, name })),
    decades: uniq(list(p.decades, d => Number.isInteger(d) && d >= 1900 && d <= 2090 && d % 10 === 0, 20)),
    regions: uniq(list(p.regions, r => typeof r === 'string' && Object.hasOwn(COUNTRIES, r), 10)),
    tree: validSettings(p.tree), // Family Tree grow settings
    bringBack: p.bringBack !== false, // Blind Test: loved artists return with a deep cut (default on)
    scheme: SCHEMES.includes(p.scheme) ? p.scheme : 'shop', // colour scheme (renderer/styles.css [data-scheme])
  };
}
// A stamp key "<decade>-<CC>-<genre>": every part optional, not all empty ("--zeuhl" is a genre-only stamp).
const STAMP_KEY = /^(\d{4})?-([A-Z]{2})?-([a-z0-9-]{0,40})$/;
const validKey = k => { const m = STAMP_KEY.exec(k); return !!m && (!!m[1] || !!m[2] || !!m[3]); };
// What was playing last ("continue where you left off" + the bar's "came from" chip). Anything malformed: null.
function validLast(l) {
  const t = l && l.track, f = l && l.from;
  if (!t || !name(t.title) || !name(t.artist) || !['dz', 'it'].includes(t.source) || !(name(t.id) || Number.isFinite(t.id))) return null;
  const track = { source: t.source, id: t.id, title: t.title, artist: t.artist };
  for (const k of ['artistDzId', 'albumId', 'decade']) if (Number.isInteger(t[k])) track[k] = t[k];
  if (typeof t.cover === 'string' && t.cover.startsWith('https://') && t.cover.length <= 500) track.cover = t.cover;
  if (typeof t.isrc === 'string' && t.isrc.length <= 20) track.isrc = t.isrc;
  if (typeof t.country === 'string' && /^[A-Z]{2}$/.test(t.country)) track.country = t.country;
  const sk = typeof t.stamp === 'string' && STAMP_KEY.exec(t.stamp);
  if (sk && sk[3]) Object.assign(track, { stamp: t.stamp, genre: sk[3] }); // re-loving from Home keeps the stamp
  const from = f && typeof f.tab === 'string' && /^[a-z]{1,16}$/.test(f.tab) ? { tab: f.tab, label: name(f.label) ? f.label.slice(0, 80) : '' } : null;
  return { track, from, ts: Number.isFinite(l.ts) ? l.ts : 0 };
}
// Genre Stamps: {"<decade>-<CC>-<genre>": loves}. An old Passport key "JP-1980" becomes "1980-JP-" (legacy, no genre); idempotent.
function validStamps(s) {
  const out = {};
  for (const [k, v] of Object.entries(s && typeof s === 'object' && !Array.isArray(s) ? s : {})) {
    const m = /^([A-Z]{2})-(\d{4})$/.exec(k), key = m ? `${m[2]}-${m[1]}-` : k;
    if (validKey(key) && Number.isInteger(v) && v > 0 && v < 1e6) out[key] = (out[key] || 0) + v;
  }
  return out;
}
// Genre Stamps: the rarity each stamp last came back with, {"<decade>-<CC>-<genre>": 'Common' | 'Rare' | 'Legendary'}.
function validRarity(r) {
  const out = {};
  for (const [k, v] of Object.entries(r && typeof r === 'object' && !Array.isArray(r) ? r : {}))
    if (validKey(k) && k.split('-').slice(2).join('') && ['Common', 'Rare', 'Legendary'].includes(v)) out[k] = v;
  return out;
}
// Blind Test returns: {n: mysteries shown, last: n at the last return, seen: {dzArtistId: n}, ok: [dzArtistIds rated OK]}. Small by design: seen drops entries past the 20-mystery cooldown.
function validBack(b) {
  b = b && typeof b === 'object' ? b : {};
  const int = x => Number.isInteger(x) && x >= 0 && x < 1e9;
  const n = int(b.n) ? b.n : 0;
  const seen = {};
  for (const [k, v] of Object.entries(b.seen && typeof b.seen === 'object' ? b.seen : {})) if (/^\d{1,12}$/.test(k) && int(v) && n - v < 20) seen[k] = v;
  return { n, last: int(b.last) ? b.last : 0, seen, ok: uniq(list(b.ok, i => Number.isInteger(i) && i > 0, 50)) };
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
    stamps: validStamps(p.stamps),
    rarity: validRarity(p.rarity),
    adventure: Number.isFinite(p.adventure) ? p.adventure : d.adventure,
    ratings: validRatings(p.ratings),
    prefs: validPrefs(p.prefs),
    last: validLast(p.last),
    back: validBack(p.back),
  };
}

function save(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.likes) || !Array.isArray(p.heard)) throw new Error('invalid profile');
  const data = { likes: p.likes, heard: p.heard, stamps: validStamps(p.stamps), rarity: validRarity(p.rarity), adventure: Number(p.adventure) || 0, ratings: validRatings(p.ratings), prefs: validPrefs(p.prefs), last: validLast(p.last), back: validBack(p.back) };
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1));
  fs.renameSync(file + '.tmp', file);
  return true;
}

module.exports = { init, load, save };
