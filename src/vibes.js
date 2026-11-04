// Mood Shelf network side (docs/19): editorial playlists for a vibe, and the related-artist map. Platform-free; get is injected like music.js.
const { norm, fromDeezer } = require('./music');
const V = require('../renderer/vibes');

const DZ = 'https://api.deezer.com';
const enc = encodeURIComponent;
const PER_QUERY = 4, PER_VIBE = 4;

// {rows: [{...fromDeezer(t), lists: [{title, genre}]}]} with previews only, one row per song across lists, or {error}.
async function vibePool(get, id) {
  const vibe = V.VIBES.find(x => x.id === id);
  if (!vibe) return { error: { message: 'unknown vibe' } };
  const found = await Promise.all(vibe.q.map(q => get(`${DZ}/search/playlist?q=${enc(q)}&limit=25`)));
  if (found.every(r => !r || r.error)) return { error: (found[0] && found[0].error) || { message: 'search failed' } };
  const lists = new Map();
  for (const r of found) {
    const good = ((r && r.data) || []).filter(p => V.isEditorial(p) && !V.badTitle(p.title)).slice(0, PER_QUERY);
    for (const p of good) if (!lists.has(p.id)) lists.set(p.id, p);
  }
  const chosen = [...lists.values()].slice(0, PER_VIBE);
  const bodies = await Promise.all(chosen.map(p => get(`${DZ}/playlist/${p.id}/tracks?limit=100`)));
  if (chosen.length && bodies.every(b => !b || b.error)) return { error: (bodies[0] && bodies[0].error) || { message: 'no playlists' } };
  const rows = new Map(), songs = new Map();
  chosen.forEach((p, i) => {
    const list = { title: p.title, genre: V.editorGenre(p.user.name) };
    for (const t of (bodies[i] && bodies[i].data) || []) {
      if (!t || !t.readable || !t.preview || !t.artist) continue;
      const made = { ...fromDeezer(t), lists: [list] }, k = `${t.artist.id}|${norm(made.title)}`;
      const same = rows.get(t.id) || songs.get(k); // the same song on two lists counts once
      if (same) { if (!same.lists.includes(list)) same.lists.push(list); continue; }
      rows.set(t.id, made); songs.set(k, made);
    }
  });
  return { rows: [...rows.values()] };
}

// ids [{id, name}] (loved artists) -> {artistId: {k, by}}: k loved artists list that artist as related; by = one of them. Some artists have none.
async function relatedMap(get, ids) {
  const map = {};
  await Promise.all((Array.isArray(ids) ? ids : []).slice(0, 15).filter(a => a && Number.isInteger(Number(a.id))).map(async a => {
    const r = await get(`${DZ}/artist/${Number(a.id)}/related`);
    for (const x of (r && r.data) || []) { const m = map[x.id] ||= { k: 0, by: String(a.name || '').slice(0, 200) }; m.k++; }
  }));
  return map;
}

module.exports = { flows: { vibePool, relatedMap } };
