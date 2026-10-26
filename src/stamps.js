// Genre Stamps (docs/06): decade x place x genre. Catalogue, builder genres, Roll, and the strict playlist query.
const COUNTRIES = require('./countries');
const { norm, shuffle, fromDeezer } = require('./music');
const data = require('../renderer/stamp-data')(COUNTRIES, require('../renderer/genre-data'));

const MB = 'https://musicbrainz.org/ws/2';
const DZ = 'https://api.deezer.com';
const enc = encodeURIComponent;

// ---------- strict playlist query (docs/06 §5) ----------
const mbUrl = (kind, q) => `${MB}/${kind}?limit=100&query=${enc(q)}&fmt=json`;
const tagQ = tags => `(${tags.map(t => `tag:"${t.replace(/["\\]/g, ' ')}"`).join(' OR ')})`;
const dateQ = d => `firstreleasedate:[${d} TO ${d + 9}] AND status:official`;
const eraQ = d => (d ? dateQ(d) : 'status:official'); // a genre-only stamp has no decade
const SPECIAL = new Set(['125ec42a-7229-4250-afc5-e057484327fe', '89ad4ac3-39f7-470e-963a-56509c546377']); // [unknown], Various Artists
const BAD = /\b(live|remix|mix|demo|instrumental|karaoke|version|edit|interview|intro|outro|skit)\b/i;
const latin = s => /\p{Script=Latin}/u.test(s) && !/[^\p{Script=Latin}\p{Script=Common}\p{M}]/u.test(s);
const creditArtist = r => ((r['artist-credit'] || [])[0] || {}).artist;

// MB artists -> guard map id -> {name (Latin, for search), names (normalised name, sort-name, aliases), tagged}, only those from cc
// (any country when cc is empty, minus the special-purpose artists). tagged = the artist record itself carries the exact tag.
function addGuard(guard, artists, cc, tags = []) {
  const want = new Set(tags.map(norm));
  for (const a of artists || []) {
    if (!a || (cc && a.country !== cc) || SPECIAL.has(a.id) || guard.has(a.id)) continue;
    const all = [a.name, ...(a.aliases || []).map(x => x.name), a['sort-name']].filter(Boolean); // sort-name last: "Yoshida, Takuro" searches badly
    guard.set(a.id, { name: latin(a.name) ? a.name : all.find(latin) || a.name, names: new Set(all.map(norm).filter(Boolean)), tagged: (a.tags || []).some(t => want.has(norm(t.name))) });
  }
  return guard;
}

// Recordings -> songs that pass the client guards: era by the recording's own first release, guarded artist, no live/remix/video.
function songsFrom(recs, guard, d) {
  const seen = new Set(), out = [];
  for (const r of recs || []) {
    const a = creditArtist(r), year = Number(String(r['first-release-date'] || '').slice(0, 4));
    if (!a || !guard.has(a.id) || (d && !(year >= d && year <= d + 9)) || r.video || r.disambiguation || BAD.test(r.title || '') || /^\s*\[/.test(r.title || '')) continue;
    const k = `${a.id}|${norm(r.title)}`;
    if (!norm(r.title) || seen.has(k)) continue;
    seen.add(k);
    out.push({ artistId: a.id, title: r.title, year, recId: r.id, tagged: guard.get(a.id).tagged });
  }
  return out;
}

// Shuffle, then round-robin across artists: [{song, round}] where round is that song's rank for its artist (0, 1, 2...).
// Songs of artists tagged with the genre come first (tagged is only set for genre-only stamps).
function order(songs, rand = Math.random) {
  const out = [];
  for (const group of [songs.filter(s => s.tagged), songs.filter(s => !s.tagged)]) {
    const by = new Map();
    for (const s of shuffle(group, rand)) by.set(s.artistId, [...(by.get(s.artistId) || []), s]);
    const lists = [...by.values()];
    for (let round = 0; lists.some(l => l[round]); round++) for (const l of lists) if (l[round]) out.push({ song: l[round], round });
  }
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
const songKey = s => `${s.artistId}|${norm(s.title)}`;
// One strict preview lookup (Deezer only); lim.dz counts this run's searches against its budget.
async function lookup(get, g, song, lim) {
  const q = enc(`${g.name} ${song.title}`);
  let t = null;
  if (lim.dz < 40) {
    lim.dz++;
    const r = strictPick((await get(`${DZ}/search?q=${q}&limit=10`)).data, g.names, song.title, r => r.artist && r.artist.name, r => r.title, r => r.preview);
    t = r && fromDeezer(r);
  }
  return t;
}

// opts.paged adds `next` (a cursor for stampMore) to the result; without it the return shape is unchanged (build script).
async function stampSongs(get, stamp, { emit = () => {}, live = () => true, rand = Math.random, paged = false } = {}) {
  const { tags } = stamp, d = stamp.decade || 0, cc = stamp.cc || '';
  const first = await get(mbUrl('recording', `${tagQ(tags)}${cc ? ` AND country:${cc}` : ''} AND ${eraQ(d)}`));
  if (first.error) return { error: true };
  let recs = first.recordings || [];
  const ids = [...new Set(recs.map(r => (creditArtist(r) || {}).id).filter(Boolean))].slice(0, 80);
  const guard = new Map();
  if (ids.length) addGuard(guard, (await get(mbUrl('artist', ids.map(i => `arid:${i}`).join(' OR ')))).artists, cc, cc ? [] : tags);
  if (!live()) return null;
  // artist-first top-up: tagged artists (from cc), then their in-era recordings. Genre-only: when under 8 *tagged* artists.
  if (cc ? guard.size < 8 : [...guard.values()].filter(g => g.tagged).length < 8) {
    const want = new Set(tags.map(norm));
    const res = await get(mbUrl('artist', `${tagQ(tags)}${cc ? ` AND country:${cc}` : ''}`));
    const extra = (res.artists || []).filter(a => (!cc || a.country === cc) && !guard.has(a.id) && (a.tags || []).some(t => want.has(norm(t.name)))).slice(0, 30);
    addGuard(guard, extra, cc, cc ? [] : tags);
    for (let i = 0; i < extra.length && live(); i += 10) {
      const r = await get(mbUrl('recording', `(${extra.slice(i, i + 10).map(a => `arid:${a.id}`).join(' OR ')}) AND ${eraQ(d)}`));
      recs = recs.concat(r.recordings || []);
    }
  }
  const songs = songsFrom(recs, guard, d);
  const artists = new Set(songs.map(s => s.artistId)).size;
  const per = {};
  let count = 0;
  const lim = { dz: 0 }, seen = new Set();
  const names = []; // artists in play order (tagged first), for the genre build script
  for (const { song, round } of order(songs, rand)) {
    if (count >= 10 || !live()) break;
    const n = per[song.artistId] || 0;
    if (!(round < 2 ? n < 2 : round === 2 && n < 3 && count < 8)) continue; // max 2 per artist; a 3rd only to reach 8
    const g = guard.get(song.artistId), t = await lookup(get, g, song, lim);
    seen.add(songKey(song));
    if (!t || !live()) continue;
    per[song.artistId] = n + 1;
    count++;
    names.push(g.name);
    emit({ ...t, year: song.year, ...(cc && { country: cc }), ...(d && { decade: d }), genre: stamp.genre, stamp: stamp.id });
  }
  const mbCount = first.count; // recordings carrying the tag: the genre's tier
  if (!live()) return null; // cancelled (a prefetch that was dropped): not a thin stamp, so nobody marks it short
  if (count < (stamp.atlas && !d && !cc ? 3 : 5)) return { thin: true, count }; // a verified genre (>= 6 songs at build) shows what it has
  const res = { count, artists, mbCount, names, short: count < 8, rarity: count < 8 || artists < 8 ? 'Legendary' : artists < 15 ? 'Rare' : 'Common' };
  if (paged) res.next = { offset: 0, seen: [...seen], per, shown: count, done: false }; // offset 0: the rest of page 1 comes first (tried songs are in seen)
  return res;
}

// The next 10 playable songs after a cursor ({offset, seen, per, shown, done} from `next`): further MusicBrainz pages, same guards
// and max-2-per-artist, nothing already tried. A page cut short by the 10th song is re-read next time (tried songs are in `seen`).
// Returns {added, next} or {error, next} (same cursor, retry-safe).
async function stampMore(get, stamp, cursor, { emit = () => {}, live = () => true, rand = Math.random } = {}) {
  const { tags } = stamp, d = stamp.decade || 0, cc = stamp.cc || '';
  let { offset, done } = cursor;
  const seen = new Set(cursor.seen), per = { ...cursor.per }, lim = { dz: 0 };
  let added = 0;
  const out = () => ({ offset, seen: [...seen], per, shown: cursor.shown + added, done });
  while (!done && added < 10 && live() && lim.dz < 40) {
    const pg = await get(`${mbUrl('recording', `${tagQ(tags)}${cc ? ` AND country:${cc}` : ''} AND ${eraQ(d)}`)}&offset=${offset}`);
    if (pg.error) return { error: true, next: out() };
    const recs = pg.recordings || [], guard = new Map();
    const ids = [...new Set(recs.map(r => (creditArtist(r) || {}).id).filter(Boolean))].slice(0, 80);
    if (ids.length) {
      const ar = await get(mbUrl('artist', ids.map(i => `arid:${i}`).join(' OR ')));
      if (ar.error) return { error: true, next: out() };
      addGuard(guard, ar.artists, cc, cc ? [] : tags);
    }
    let cut = false;
    for (const { song } of order(songsFrom(recs, guard, d).filter(s => !seen.has(songKey(s))), rand)) {
      if (!live()) return { added, next: out() };
      if (added >= 10 || lim.dz >= 40) { cut = true; break; }
      if ((per[song.artistId] || 0) >= 2) continue;
      const g = guard.get(song.artistId), t = await lookup(get, g, song, lim);
      seen.add(songKey(song));
      if (!t || !live()) continue;
      per[song.artistId] = (per[song.artistId] || 0) + 1;
      added++;
      emit({ ...t, year: song.year, ...(cc && { country: cc }), ...(d && { decade: d }), genre: stamp.genre, stamp: stamp.id });
    }
    if (cut) break;
    offset += recs.length;
    done = recs.length < 100 || offset >= (pg.count || 0);
  }
  return { added, next: out() };
}

// Open/prefetch bookkeeping for main.js. One open is live at a time; the prefetch (the next Roll) runs silently,
// is replayed at once when opened, and is stopped when another stamp is opened or prefetched.
function stampRunner(get) {
  let seq = 0, pre = null, cur = null; // cur: the open stamp's paging cursor
  const start = (id, opts) => { const s = data.makeStamp(String(id)); if (!s || s.legacy) throw new Error('bad stamp'); return stampSongs(get, s, { ...opts, paged: true }); };
  // Keeps the cursor here (it is big) and hands the renderer the result with `more` instead.
  const page = (id, res) => {
    if (!res || !res.next) { cur = null; return res; }
    const { next, ...out } = res;
    cur = { id, stamp: data.makeStamp(String(id)), next, busy: false };
    return { ...out, more: !next.done };
  };
  const drop = () => { if (pre) pre.alive = false; pre = null; };
  return {
    async open(id, send, alive = () => true) {
      const mine = ++seq, live = () => mine === seq && alive();
      cur = null;
      const emit = row => live() && send(row);
      if (pre && pre.id === id) {
        const p = pre; pre = null;
        p.rows.forEach(emit); p.on = emit; p.live = live; // still resolving: the rest streams in, and stops if this open goes stale
        const res = await p.res;
        if (!live()) return null;
        if (res && !res.error) return page(id, res); // a thin prefetch is final too: running it again would only repeat the rows
      } else drop();
      const res = await start(id, { emit, live });
      return live() ? page(id, res) : null;
    },
    // The next 10 songs of the open stamp; rows stream through send like open. Resolves {added, more} or {error}.
    async more(id, send, alive = () => true) {
      if (!cur || cur.id !== id || cur.busy) return { error: true };
      const c = cur, mine = seq, live = () => mine === seq && alive();
      c.busy = true;
      try {
        const r = await stampMore(get, c.stamp, c.next, { emit: row => live() && send(row), live });
        c.next = r.next;
        return live() ? (r.error ? { error: true } : { added: r.added, more: !c.next.done }) : null;
      } catch { return { error: true }; } finally { c.busy = false; }
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

module.exports = { ...data, addGuard, songsFrom, order, strictPick, stampSongs, stampMore, stampRunner };
