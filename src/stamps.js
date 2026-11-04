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
// One strict preview lookup (Deezer only); lim.dz counts this run's calls against its budget (lim.art: artistId -> top rows, or null = not on Deezer).
// A free search with zero rows (typical for Japanese-script titles) falls back to the artist's own Deezer top list, found once per artist.
const TARGET = 15, BUDGET = 90; // measured: a Japanese-script title finds nothing on Deezer ~half the time, so a Roll needs ~3 searches per song
// The Deezer artist for a guarded MB artist (name in its name/alias set), or null when Deezer does not carry them.
async function dzArtist(get, g) {
  return ((await get(`${DZ}/search/artist?q=${enc(g.name)}&limit=5`)).data || []).find(x => g.names.has(norm(x.name))) || null;
}
async function lookup(get, g, song, lim) {
  if (song.row) return fromDeezer(song.row); // already a Deezer track (album route)
  const pick = rows => strictPick(rows, g.names, song.title, r => r.artist && r.artist.name, r => r.title, r => r.preview);
  const art = lim.art || (lim.art = {});
  if (song.artistId in art) { const top = await art[song.artistId]; return top && (pick(top) ? fromDeezer(pick(top)) : null); }
  if (lim.dz >= BUDGET) return null;
  lim.dz++;
  const rows = (await get(`${DZ}/search?q=${enc(`${g.name} ${song.title.replace(/\s*[(\[（].*$/, '')}`)}&limit=10`)).data || [];
  const r = pick(rows);
  if (r || rows.length || lim.dz >= BUDGET) return r && fromDeezer(r);
  art[song.artistId] ||= (async () => { // ||=: a sibling song in the same batch may have started it
    lim.dz += 2;
    const a = await dzArtist(get, g);
    return a ? (await get(`${DZ}/artist/${a.id}/top?limit=50`)).data || [] : null;
  })();
  const top = await art[song.artistId], hit = top && pick(top);
  return hit ? fromDeezer(hit) : null;
}

// ---------- artist-first pool, ranked by Deezer fame ----------
// Era pool query: artists of the stamp's tags/country that were active in the decade (begin before its end, not ended before its start).
const poolQ = (tags, cc, d) => `${tagQ(tags)}${cc ? ` AND country:${cc}` : ''}${d ? ` AND begin:[* TO ${d + 9}] AND (end:[${d} TO *] OR ended:false)` : ''}`;
const entryOf = (id, g) => ({ id, name: g.name, names: [...g.names], tagged: g.tagged });
const guardOf = list => new Map(list.map(e => [e.id, { name: e.name, names: new Set(e.names), tagged: e.tagged }]));

// Fame order with discovery: the better-known half by fans fills 2 of every 3 slots, the lesser half (shuffled) the third.
function rank(list, rand = Math.random) {
  const s = [...list].sort((a, b) => b.fan - a.fan), h = Math.ceil(s.length / 2), top = s.slice(0, h), rest = shuffle(s.slice(h), rand), out = [];
  while (top.length || rest.length) out.push(...top.splice(0, 2), ...rest.splice(0, 1));
  return out;
}

// Takes the next RANK_N candidates off pool, finds each on Deezer (3 in flight; not on Deezer = dropped) and returns them ranked, with fan + Deezer id.
const RANK_N = 50;
async function rankNext(get, pool, live, rand) {
  const take = pool.splice(0, RANK_N), got = [];
  for (let i = 0; i < take.length && live(); i += 3) {
    await Promise.all(take.slice(i, i + 3).map(async e => { const a = await dzArtist(get, { name: e.name, names: new Set(e.names) }); if (a) got.push({ ...e, fan: a.nb_fan || 0, dz: a.id }); }));
  }
  return rank(got, rand);
}

// A ranked artist's in-era songs straight from Deezer: up to 2 albums/singles released in the decade (no live/best-of/remaster), their tracks with
// a preview. Needs no title matching, which loses half of the Japanese-script MB titles. Deezer dates reissues by the reissue, so an artist
// whose catalogue was re-released has fewer; the MB route covers those.
const NOT_ERA = /\b(live|best|greatest|collection|remaster(ed)?|selection|anthology|tribute|karaoke)\b/i;
async function albumSongs(get, e, d) {
  const names = new Set(e.names), year = a => Number(String(a.release_date).slice(0, 4));
  const albums = ((await get(`${DZ}/artist/${e.dz}/albums?limit=100`)).data || []).filter(a => year(a) >= d && year(a) <= d + 9 && !NOT_ERA.test(a.title) && !BAD.test(a.title)).slice(0, 2);
  const out = [];
  for (const a of albums) {
    for (const t of (await get(`${DZ}/album/${a.id}/tracks?limit=30`)).data || []) {
      if (t.preview && t.artist && names.has(norm(t.artist.name)) && !BAD.test(t.title) && !NOT_ERA.test(t.title)) out.push({ artistId: e.id, title: t.title, year: year(a), tagged: e.tagged, row: { ...t, album: { id: a.id, cover_medium: a.cover_medium } } });
    }
  }
  return out;
}

// A ranked batch's (<= 10 artists) in-era songs: Deezer albums (3 artists in flight) first, then the MB recordings (one call) for the rest.
async function eraSongs(get, batch, d) {
  const mb = get(mbUrl('recording', `(${batch.map(e => `arid:${e.id}`).join(' OR ')}) AND ${eraQ(d)}`));
  const dzs = [];
  if (d) for (let i = 0; i < batch.length; i += 3) dzs.push(...(await Promise.all(batch.slice(i, i + 3).map(e => albumSongs(get, e, d).catch(() => [])))).flat());
  const seen = new Set();
  return [...dzs, ...songsFrom((await mb).recordings, guardOf(batch), d)].filter(s => !seen.has(songKey(s)) && seen.add(songKey(s)));
}

// opts.paged adds `next` (a cursor for stampMore) to the result; without it the return shape is unchanged (build script).
async function stampSongs(get, stamp, { emit = () => {}, live = () => true, rand = Math.random, paged = false } = {}) {
  const { tags } = stamp, d = stamp.decade || 0, cc = stamp.cc || '';
  const first = await get(mbUrl('recording', `${tagQ(tags)}${cc ? ` AND country:${cc}` : ''} AND ${eraQ(d)}`));
  if (first.error) return { error: true };
  const recs = first.recordings || [];
  const ids = [...new Set(recs.map(r => (creditArtist(r) || {}).id).filter(Boolean))].slice(0, 80);
  const guard = new Map();
  if (ids.length) addGuard(guard, (await get(mbUrl('artist', ids.map(i => `arid:${i}`).join(' OR ')))).artists, cc, cc ? [] : tags);
  if (!live()) return null;
  const per = {}, lim = { dz: 0, art: {} }, seen = new Set(), names = []; // names: artists in play order (tagged first), for the genre build script
  let count = 0;
  const artistIds = new Set();
  // Plays songs in order, 3 Deezer lookups in flight at once (src/net.js still paces the host); rows emit in order as each resolves.
  const play = async (songs, cap = TARGET) => {
    const list = order(songs, rand);
    songs.forEach(s => artistIds.add(s.artistId));
    for (let i = 0; i < list.length && count < cap && live();) {
      const batch = [], tent = {};
      for (; i < list.length && batch.length < 3; i++) {
        const { song, round } = list[i], n = (per[song.artistId] || 0) + (tent[song.artistId] || 0);
        if (!(round < 2 ? n < 2 : round === 2 && n < 3 && count + batch.length < 12)) continue; // max 2 per artist; a 3rd only to reach 12
        tent[song.artistId] = (tent[song.artistId] || 0) + 1;
        batch.push({ song, p: lookup(get, guard.get(song.artistId), song, lim) });
      }
      for (const { song, p } of batch) {
        const t = await p;
        if (count >= cap) continue; // an overshoot lookup: not tried, so More still offers it
        seen.add(songKey(song));
        if (!t || !live()) continue;
        per[song.artistId] = (per[song.artistId] || 0) + 1;
        count++;
        names.push(guard.get(song.artistId).name);
        emit({ ...t, year: song.year, ...(cc && { country: cc }), ...(d && { decade: d }), genre: stamp.genre, stamp: stamp.id });
      }
    }
  };
  const songs = songsFrom(recs, guard, d);
  const poolUrl = mbUrl('artist', poolQ(tags, cc, d)), poolP = Promise.all([get(poolUrl), get(`${poolUrl}&offset=100`)]); // 2 pages, fetched while the first songs resolve
  await play(songs, 5); // a few recording-first songs start streaming at once; famous artists fill the rest
  // Artist-first: tagged artists active in the era (+ the recording-first ones), ranked by Deezer fame, then their in-era recordings.
  // Well-tagged artists first (tag votes are a free popularity hint), so the 50 looked up on Deezer per round are the likelier-famous ones.
  const weight = a => (a.tags || []).reduce((n, t) => n + (t.count || 0), 0);
  const found = (await poolP).flatMap(r => r.artists || []).sort((a, b) => weight(b) - weight(a)), before = new Set(guard.keys());
  addGuard(guard, found, cc, cc ? [] : tags);
  const pool = [...guard].filter(([id]) => !before.has(id)).concat([...guard].filter(([id]) => before.has(id))).map(([id, g]) => entryOf(id, g));
  let ranked = [];
  while (count < TARGET && live() && (ranked.length || pool.length)) {
    if (!ranked.length) { ranked = await rankNext(get, pool, live, rand); continue; }
    const batch = ranked.splice(0, 10);
    await play((await eraSongs(get, batch, d)).filter(s => !seen.has(songKey(s))));
    if (count >= TARGET) ranked.unshift(...batch); // its untried songs are More's first
  }
  if (count < TARGET && live()) await play(songs.filter(s => !seen.has(songKey(s)))); // the rest of the recording-first songs
  // Still short and MusicBrainz has more pages: read on (a niche stamp's first 100 recordings often hold few songs Deezer carries).
  if (count < TARGET && live() && recs.length >= 100 && (first.count || 0) > 100) {
    const r = await stampMore(get, stamp, { offset: 100, seen: [...seen], per, shown: count, done: false, q: [], pool: [] }, { emit: row => (names.push(row.artist), emit(row)), live, rand, want: TARGET - count });
    if (!r.error) { count += r.added; r.next.seen.forEach(k => seen.add(k)); Object.assign(per, r.next.per); Object.keys(per).forEach(k => artistIds.add(k)); }
  }
  const artists = artistIds.size, mbCount = first.count; // recordings carrying the tag: the genre's tier
  if (!live()) return null; // cancelled (a prefetch that was dropped): not a thin stamp, so nobody marks it short
  if (count < (stamp.atlas && !d && !cc ? 3 : 5)) return { thin: true, count }; // a verified genre (>= 6 songs at build) shows what it has
  const res = { count, artists, mbCount, names, short: count < 12, rarity: count < 12 || artists < 8 ? 'Legendary' : artists < 15 ? 'Rare' : 'Common' };
  if (paged) res.next = { offset: 0, seen: [...seen], per, shown: count, done: false, q: ranked, pool }; // offset 0: the rest of page 1 comes first (tried songs are in seen); q/pool: the fame-ranked artists still to play, and the candidates not yet ranked
  return res;
}

// The next 15 playable songs after a cursor ({offset, seen, per, shown, done} from `next`): further MusicBrainz pages, same guards
// and max-2-per-artist, nothing already tried. A page cut short by the 15th song is re-read next time (tried songs are in `seen`).
// Returns {added, next} or {error, next} (same cursor, retry-safe).
async function stampMore(get, stamp, cursor, { emit = () => {}, live = () => true, rand = Math.random, want = TARGET } = {}) {
  const { tags } = stamp, d = stamp.decade || 0, cc = stamp.cc || '';
  let { offset, done } = cursor;
  const seen = new Set(cursor.seen), per = { ...cursor.per }, lim = { dz: 0, art: {} }, q = [...(cursor.q || [])], pool = [...(cursor.pool || [])];
  let added = 0;
  const out = () => ({ offset, seen: [...seen], per, shown: cursor.shown + added, done, q, pool });
  // Plays songs (max 2 per artist, nothing tried) until the 15th; true = stop here (cut short or cancelled).
  const step = async (songs, guard) => {
    for (const { song } of order(songs.filter(s => !seen.has(songKey(s))), rand)) {
      if (!live()) return true;
      if (added >= want || lim.dz >= BUDGET) return true;
      if ((per[song.artistId] || 0) >= 2) continue;
      const g = guard.get(song.artistId), t = await lookup(get, g, song, lim);
      seen.add(songKey(song));
      if (!t || !live()) continue;
      per[song.artistId] = (per[song.artistId] || 0) + 1;
      added++;
      emit({ ...t, year: song.year, ...(cc && { country: cc }), ...(d && { decade: d }), genre: stamp.genre, stamp: stamp.id });
    }
    return false;
  };
  while (!done && added < want && live() && lim.dz < BUDGET) {
    if (q.length || pool.length) { // first down the fame-ranked artists
      if (!q.length) { q.push(...await rankNext(get, pool, live, rand)); continue; }
      const batch = q.splice(0, 10);
      if (await step(await eraSongs(get, batch, d), guardOf(batch))) { q.unshift(...batch); break; }
      continue;
    }
    const pg = await get(`${mbUrl('recording', `${tagQ(tags)}${cc ? ` AND country:${cc}` : ''} AND ${eraQ(d)}`)}&offset=${offset}`);
    if (pg.error) return added ? { added, next: out() } : { error: true, next: out() }; // songs already streamed: keep them, the cursor retries this page
    const recs = pg.recordings || [], guard = new Map();
    const ids = [...new Set(recs.map(r => (creditArtist(r) || {}).id).filter(Boolean))].slice(0, 80);
    if (ids.length) {
      const ar = await get(mbUrl('artist', ids.map(i => `arid:${i}`).join(' OR ')));
      if (ar.error) return { error: true, next: out() };
      addGuard(guard, ar.artists, cc, cc ? [] : tags);
    }
    if (await step(songsFrom(recs, guard, d), guard)) break;
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
    // The next 15 songs of the open stamp; rows stream through send like open. Resolves {added, more} or {error}.
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

module.exports = { ...data, rank, addGuard, songsFrom, order, strictPick, stampSongs, stampMore, stampRunner };
