// Profile persistence: userData/profile.json, written atomically (tmp + rename).
const fs = require('fs');
const path = require('path');
const { norm } = require('./music');

const DEFAULT = () => ({ likes: [], heard: [], stamps: {}, adventure: 50 });
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
  };
}

function save(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.likes) || !Array.isArray(p.heard)) throw new Error('invalid profile');
  const data = { likes: p.likes, heard: p.heard, stamps: p.stamps || {}, adventure: Number(p.adventure) || 0 };
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1));
  fs.renameSync(file + '.tmp', file);
  return true;
}

module.exports = { init, load, save };
