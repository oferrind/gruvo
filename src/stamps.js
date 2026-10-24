// Genre Stamps (docs/06): decade x place x genre. Catalogue, builder genres, Roll, and the strict playlist query.
const COUNTRIES = require('./countries');
const { norm, shuffle, fromDeezer, fromItunes } = require('./music');
const data = require('../renderer/stamp-data')(COUNTRIES);

const MB = 'https://musicbrainz.org/ws/2';
const DZ = 'https://api.deezer.com';
const IT = 'https://itunes.apple.com';
const enc = encodeURIComponent;

// ---------- strict playlist query (docs/06 §5) ----------
const mbUrl = (kind, q) => `${MB}/${kind}?limit=100&query=${enc(q)}&fmt=json`;
const tagQ = tags => `(${tags.map(t => `tag:"${t.replace(/["\\]/g, ' ')}"`).join(' OR ')})`;
const dateQ = d => `firstreleasedate:[${d} TO ${d + 9}] AND status:official`;
const BAD = /\b(live|remix|mix|demo|instrumental|karaoke|version|edit|interview|intro|outro|skit)\b/i;
const latin = s => /\p{Script=Latin}/u.test(s) && !/[^\p{Script=Latin}\p{Script=Common}\p{M}]/u.test(s);
const creditArtist = r => ((r['artist-credit'] || [])[0] || {}).artist;

// MB artists -> guard map id -> {name (Latin, for search), names (normalised name, sort-name, aliases)}, only those from cc.
function addGuard(guard, artists, cc) {
  for (const a of artists || []) {
    if (!a || a.country !== cc || guard.has(a.id)) continue;
    const all = [a.name, ...(a.aliases || []).map(x => x.name), a['sort-name']].filter(Boolean); // sort-name last: "Yoshida, Takuro" searches badly
    guard.set(a.id, { name: latin(a.name) ? a.name : all.find(latin) || a.name, names: new Set(all.map(norm).filter(Boolean)) });
  }
  return guard;
}

// Recordings -> songs that pass the client guards: era by the recording's own first release, guarded artist, no live/remix/video.
function songsFrom(recs, guard, d) {
  const seen = new Set(), out = [];
  for (const r of recs || []) {
    const a = creditArtist(r), year = Number(String(r['first-release-date'] || '').slice(0, 4));
    if (!a || !guard.has(a.id) || !(year >= d && year <= d + 9) || r.video || r.disambiguation || BAD.test(r.title || '')) continue;
    const k = `${a.id}|${norm(r.title)}`;
    if (!norm(r.title) || seen.has(k)) continue;
    seen.add(k);
    out.push({ artistId: a.id, title: r.title, year, recId: r.id });
  }
  return out;
}

// Shuffle, then round-robin across artists: [{song, round}] where round is that song's rank for its artist (0, 1, 2...).
function order(songs, rand = Math.random) {
  const by = new Map();
  for (const s of shuffle(songs, rand)) by.set(s.artistId, [...(by.get(s.artistId) || []), s]);
  const lists = [...by.values()], out = [];
  for (let round = 0; lists.some(l => l[round]); round++) for (const l of lists) if (l[round]) out.push({ song: l[round], round });
  return out;
}

// Strict: a preview, an artist name in the MB name/alias set, and one title starting with the other.
function strictPick(rows, names, title, artistOf, titleOf, previewOf) {
  const t = norm(title);
  return (rows || []).find(r => {
    const rt = norm(titleOf(r));
    return previewOf(r) && names.has(norm(artistOf(r))) && rt && t && (rt.startsWith(t) || t.startsWith(rt));
  }) || null;
}

// Streams rows through emit(row) as each preview resolves. Returns {count, artists, rarity, short} or {thin}/{error}.
async function stampSongs(get, stamp, { emit = () => {}, live = () => true, rand = Math.random } = {}) {
  const { decade: d, cc, tags } = stamp;
  const first = await get(mbUrl('recording', `${tagQ(tags)} AND country:${cc} AND ${dateQ(d)}`));
  if (first.error) return { error: true };
  let recs = first.recordings || [];
  const ids = [...new Set(recs.map(r => (creditArtist(r) || {}).id).filter(Boolean))].slice(0, 80);
  const guard = new Map();
  if (ids.length) addGuard(guard, (await get(mbUrl('artist', ids.map(i => `arid:${i}`).join(' OR ')))).artists, cc);
  if (!live()) return null;
  if (guard.size < 8) { // artist-first top-up: tagged artists from cc, then their in-era recordings
    const want = new Set(tags.map(norm));
    const res = await get(mbUrl('artist', `${tagQ(tags)} AND country:${cc}`));
    const extra = (res.artists || []).filter(a => a.country === cc && !guard.has(a.id) && (a.tags || []).some(t => want.has(norm(t.name)))).slice(0, 30);
    addGuard(guard, extra, cc);
    for (let i = 0; i < extra.length && live(); i += 10) {
      const r = await get(mbUrl('recording', `(${extra.slice(i, i + 10).map(a => `arid:${a.id}`).join(' OR ')}) AND ${dateQ(d)}`));
      recs = recs.concat(r.recordings || []);
    }
  }
  const songs = songsFrom(recs, guard, d);
  const artists = new Set(songs.map(s => s.artistId)).size;
  const per = {};
  let count = 0, dz = 0, it = 0;
  for (const { song, round } of order(songs, rand)) {
    if (count >= 10 || !live()) break;
    const n = per[song.artistId] || 0;
    if (!(round < 2 ? n < 2 : round === 2 && n < 3 && count < 8)) continue; // max 2 per artist; a 3rd only to reach 8
    const g = guard.get(song.artistId), q = enc(`${g.name} ${song.title}`);
    let t = null;
    if (dz < 40) {
      dz++;
      const r = strictPick((await get(`${DZ}/search?q=${q}&limit=10`)).data, g.names, song.title, r => r.artist && r.artist.name, r => r.title, r => r.preview);
      t = r && fromDeezer(r);
    }
    if (!t && it < 4) {
      it++;
      const r = strictPick((await get(`${IT}/search?entity=song&limit=10&country=${cc}&term=${q}`)).results, g.names, song.title, r => r.artistName, r => r.trackName, r => r.previewUrl);
      t = r && fromItunes(r);
    }
    if (!t || !live()) continue;
    per[song.artistId] = n + 1;
    count++;
    emit({ ...t, year: song.year, country: cc, decade: d, genre: stamp.genre, stamp: stamp.id });
  }
  if (count < 5) return { thin: true, count };
  return { count, artists, short: count < 8, rarity: count < 8 || artists < 8 ? 'Legendary' : artists < 15 ? 'Rare' : 'Common' };
}

// Open/prefetch bookkeeping for main.js. One open is live at a time; the prefetch (the next Roll) runs silently,
// is replayed at once when opened, and is stopped when another stamp is opened or prefetched.
function stampRunner(get) {
  let seq = 0, pre = null;
  const start = (id, opts) => { const s = data.makeStamp(String(id)); if (!s || s.legacy) throw new Error('bad stamp'); return stampSongs(get, s, opts); };
  const drop = () => { if (pre) pre.alive = false; pre = null; };
  return {
    async open(id, send, alive = () => true) {
      const mine = ++seq, live = () => mine === seq && alive();
      const emit = row => live() && send(row);
      if (pre && pre.id === id) {
        const p = pre; pre = null;
        p.rows.forEach(emit); p.on = emit; p.live = live; // still resolving: the rest streams in, and stops if this open goes stale
        const res = await p.res;
        if (!live()) return null;
        if (res && !res.error && !res.thin) return res;
      } else drop();
      const res = await start(id, { emit, live });
      return live() ? res : null;
    },
    prefetch(id) {
      if (pre && pre.id === id) return pre.res;
      drop();
      const p = { id, rows: [], on: null, alive: true, live: () => p.alive };
      p.res = Promise.resolve().then(() => start(id, { emit: r => (p.on ? p.on(r) : p.rows.push(r)), live: () => p.live() })).catch(() => ({ error: true }))
        .then(res => { if (pre === p && res && (res.thin || res.error)) pre = null; return res; }); // never keep a thin/failed prefetch to open on
      pre = p;
      return p.res; // the caller learns a thin result and prefetches another combo
    },
  };
}

module.exports = { ...data, addGuard, songsFrom, order, strictPick, stampSongs, stampRunner };
