// Profile persistence: userData/profile.json, written atomically (tmp + rename).
const fs = require('fs');
const path = require('path');

const DEFAULT = () => ({ likes: [], heard: [], stamps: {}, adventure: 50 });
let file = null;

function init(dir) { file = path.join(dir, 'profile.json'); }

function load() {
  try { return { ...DEFAULT(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return DEFAULT(); }
}

function save(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.likes) || !Array.isArray(p.heard)) throw new Error('invalid profile');
  const data = { likes: p.likes, heard: p.heard, stamps: p.stamps || {}, adventure: Number(p.adventure) || 0 };
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 1));
  fs.renameSync(file + '.tmp', file);
  return true;
}

module.exports = { init, load, save };
