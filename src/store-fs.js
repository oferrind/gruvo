// Desktop profile file: userData/profile.json, written atomically (tmp + rename). Validation lives in store.js.
const fs = require('fs');
const path = require('path');
const { parse, serialize } = require('./store');

let file = null;

function init(dir) { file = path.join(dir, 'profile.json'); }

function load() {
  let raw = null;
  try { raw = fs.readFileSync(file, 'utf8'); } catch {}
  const { profile, corrupt } = parse(raw);
  if (corrupt) {
    // Move it aside so the next save can't destroy the user's likes for good.
    try { fs.renameSync(file, `${file}.corrupt-${Date.now()}`); } catch (e) { console.error('profile backup failed', e.message); }
  }
  return profile;
}

function save(p) {
  const text = serialize(p);
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
  return true;
}

module.exports = { init, load, save };
