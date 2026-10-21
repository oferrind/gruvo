// Profile persistence: userData/profile.json, written atomically (tmp + rename).
const fs = require('fs');
const path = require('path');

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
  return {
    likes: Array.isArray(p.likes) ? p.likes : d.likes,
    heard: Array.isArray(p.heard) ? p.heard : d.heard,
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
