// Discovery logic. Pure helpers + flows that take `get(url, opts)` so tests can feed recorded JSON.
const COUNTRIES = require('./countries');

const DZ = 'https://api.deezer.com';
const IT = 'https://itunes.apple.com';
const MB = 'https://musicbrainz.org/ws/2';
const WP = 'https://en.wikipedia.org';
const enc = encodeURIComponent;
const ALL_CC = Object.assign({}, ...Object.values(COUNTRIES));

// ---------- pure helpers ----------

const norm = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function artistMatch(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x)));
}

function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const pickOne = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];

// No title to check the row against: trust only one artist. Exact-name rows beat substring ones; two different
// artists with that name (Trinidad's soca "Atlantik" vs Germany's) = we can't tell which was meant, so none.
function soleArtist(rows, artist, nameOf, idOf) {
  const exact = rows.filter(r => norm(nameOf(r)) === norm(artist));
  const pool = exact.length ? exact : rows;
  return new Set(pool.map(idOf)).size > 1 ? [] : pool;
}

// Deezer search rows -> best row for artist/title, or null.
function pickDeezer(rows, artist, title, requireTitle = false) {
  const ok = (rows || []).filter(r => r.preview && artistMatch(r.artist && r.artist.name, artist));
  const t = norm(title);
  const titled = t ? ok.filter(r => norm(r.title).includes(t)) : [];
  if (titled.length) return titled[0];
  if (requireTitle && t) return null;
  return soleArtist(ok, artist, r => r.artist.name, r => r.artist.id).sort((a, b) => (b.rank || 0) - (a.rank || 0))[0] || null;
}

function pickItunes(rows, artist, title, requireTitle = false) {
  const ok = (rows || []).filter(r => r.previewUrl && artistMatch(r.artistName, artist));
  const t = norm(title);
  const titled = t ? ok.filter(r => norm(r.trackName).includes(t)) : [];
  if (titled.length) return titled[0];
  if (requireTitle && t) return null;
  return soleArtist(ok, artist, r => r.artistName, r => r.artistId)[0] || null;
}

const fromDeezer = r => ({ source: 'dz', id: r.id, title: r.title, artist: r.artist.name, artistDzId: r.artist.id,
  cover: r.album && r.album.cover_medium, albumId: r.album && r.album.id, isrc: r.isrc, previewUrl: r.preview });
const fromItunes = r => ({ source: 'it', id: r.trackId, title: r.trackName, artist: r.artistName,
  cover: r.artworkUrl100, previewUrl: r.previewUrl });

// Adventure 0-100 -> how the Blind Test picks candidates.
function adventureMix(adventure) {
  const a = Math.max(0, Math.min(100, Number(adventure) || 0));
  return { pExplore: a / 100, fanCap: 1000000 * (1 - a / 100) + 20000, hops: a >= 70 ? 2 : 1 };
}

const chooseSource = (adventure, loveCount, r = Math.random()) =>
  loveCount >= 3 && r >= adventureMix(adventure).pExplore ? 'neighbour' : 'explore';

// heard holds 'dz:<id>' / 'mb:<id>' (R4: same-name artists stay apart) or a normalized name (old profiles, iTunes-only artists).
// shortcut: a dz-keyed artist isn't recognised by mb id or by name-only lookups (trail order, iTunes fallback); store both ids if that shows up.
const isHeard = (heard, { dz, mb, name }) =>
  (dz != null && heard.includes(`dz:${dz}`)) || (mb != null && heard.includes(`mb:${mb}`)) || heard.includes(norm(name));

// Related Deezer artists under the fan cap that the user hasn't heard.
const pickRelated = (artists, fanCap, heard) =>
  (artists || []).filter(a => a.nb_fan < fanCap && !isHeard(heard, { dz: a.id, name: a.name }));

// MB recording with the most relations.
const bestRecording = recs => recs.filter(r => r && !r.error).sort((a, b) => (b.relations || []).length - (a.relations || []).length)[0] || null;

const ROLE_ORDER = ['producer', 'engineer', 'mix', 'instrument', 'vocal', 'composer', 'lyricist', 'writer'];

// Recording (+ optional work) relations -> [{role, people:[{id,name}]}], credited artists last.
function groupCredits(rec, work) {
  const groups = new Map();
  const add = (role, artist) => {
    if (!groups.has(role)) groups.set(role, []);
    const list = groups.get(role);
    if (!list.some(p => p.id === artist.id)) list.push({ id: artist.id, name: artist.name });
  };
  for (const r of rec.relations || []) {
    if (r['target-type'] !== 'artist' || !r.artist) continue;
    add(r.attributes && r.attributes.length ? `${r.type} (${r.attributes.join(', ')})` : r.type, r.artist);
  }
  for (const r of (work && work.relations) || []) if (r['target-type'] === 'artist' && r.artist) add(r.type, r.artist);
  const rank = role => { const i = ROLE_ORDER.indexOf(role.split(' ')[0]); return i < 0 ? ROLE_ORDER.length : i; };
  const out = [...groups].map(([role, people]) => ({ role, people })).sort((a, b) => rank(a.role) - rank(b.role));
  const credited = (rec['artist-credit'] || []).map(c => c.artist).filter(Boolean);
  if (credited.length) out.push({ role: 'artist', people: credited.map(a => ({ id: a.id, name: a.name })) });
  return out;
}

const creditName = rec => (rec['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join('');

// Person's recording rels -> up to n {artist, title, recId, role}, one per other artist, unheard first.
function trailPicks(relations, excludeArtist, heard, n = 12, rand = Math.random) {
  const byArtist = new Map();
  for (const r of relations || []) {
    if (!r.recording) continue;
    const artist = creditName(r.recording);
    if (!artist || artistMatch(artist, excludeArtist)) continue;
    if (!byArtist.has(artist)) byArtist.set(artist, []);
    const first = (r.recording['artist-credit'] || [])[0];
    byArtist.get(artist).push({ artist, title: r.recording.title, recId: r.recording.id, role: r.type, mbid: first && first.artist && first.artist.id });
  }
  const groups = shuffle([...byArtist.values()], rand);
  const heardG = g => isHeard(heard, { mb: g[0].mbid, name: g[0].artist });
  const fresh = groups.filter(g => !heardG(g));
  const seen = groups.filter(heardG);
  return [...fresh, ...seen].slice(0, n).map(g => pickOne(g, rand));
}

const dedupe = names => {
  const seen = new Set();
  return names.filter(n => n && n !== 'Various Artists' && !seen.has(norm(n)) && seen.add(norm(n)));
};

// ---------- network flows ----------

async function resolvePreview(get, artist, title = '', requireTitle = false) {
  const q = `${artist} ${title}`.trim();
  const dz = await get(`${DZ}/search?q=${enc(q)}&limit=10`);
  const d = pickDeezer(dz.data, artist, title, requireTitle);
  if (d) return fromDeezer(d);
  const it = await get(`${IT}/search?entity=song&limit=10&term=${enc(q)}`);
  const i = pickItunes(it.results, artist, title, requireTitle);
  return i ? fromItunes(i) : null;
}

// Fresh preview URL for a stored/stale item. bypass=true skips the cache (after a 403).
async function freshPreview(get, item, bypass = false) {
  if (item.source === 'dz') {
    const t = await get(`${DZ}/track/${enc(item.id)}`, { fresh: bypass });
    if (t && t.preview) return t.preview;
  } else if (item.source === 'it') {
    const t = await get(`${IT}/lookup?id=${enc(item.id)}`);
    const r = t.results && t.results[0];
    if (r && r.previewUrl) return r.previewUrl;
  }
  const it = await get(`${IT}/search?entity=song&limit=10&term=${enc(`${item.artist} ${item.title}`)}`);
  const i = pickItunes(it.results, item.artist, item.title, true);
  return i ? i.previewUrl : null;
}

// Artist names for a country + decade (MB artist query, release query as fallback).
async function passportArtists(get, cc, decade, offset = 0) {
  const d = Number(decade);
  const q = `country:${cc} AND begin:[${d - 20} TO ${d + 9}]`;
  const res = await get(`${MB}/artist?query=${enc(q)}&limit=100&offset=${offset}&fmt=json`);
  let names = (res.artists || []).map(a => a.name);
  if (names.length < 5 && !offset) {
    const rq = `country:${cc} AND date:[${d} TO ${d + 9}] AND status:official`;
    const rel = await get(`${MB}/release?query=${enc(rq)}&limit=100&fmt=json`);
    names = names.concat(...(rel.releases || []).map(r => (r['artist-credit'] || []).map(c => c.name)));
  }
  let out = shuffle(dedupe(names));
  // A name two artists share (Greece's "Moist" vs Canada's) resolves to whichever is famous, under the wrong country: drop it.
  // One OR query checks the first 40; shortcut: names past 40 go unchecked, fine while callers use only the first few.
  const head = out.slice(0, 40);
  const chk = await get(`${MB}/artist?query=${enc(head.map(n => `artist:"${n.replace(/["\\]/g, ' ')}"`).join(' OR '))}&limit=100&fmt=json`);
  if (!chk.error) { const shared = sharedNames(chk.artists, head); out = out.filter(n => !shared.has(norm(n))); }
  return out;
}

// Names (normalized) that more than one artist in `artists` carries exactly.
function sharedNames(artists, names) {
  const want = new Set(names.map(norm)), seen = new Map();
  for (const a of artists || []) { const k = norm(a.name); if (want.has(k)) seen.set(k, (seen.get(k) || 0) + 1); }
  return new Set([...seen].filter(([, c]) => c > 1).map(([k]) => k));
}

// Random-trip target. With chosen regions/decades, each axis follows them TRIP_BIAS of the time; the rest stays pure chance so discovery survives.
const TRIP_BIAS = 0.7;
function pickTrip(prefs = {}, rand = Math.random) {
  const regions = (prefs.regions || []).filter(r => Object.hasOwn(COUNTRIES, r));
  const decades = prefs.decades || [];
  const ccs = regions.length && rand() < TRIP_BIAS ? regions.flatMap(r => Object.keys(COUNTRIES[r])) : Object.keys(ALL_CC);
  const decade = decades.length && rand() < TRIP_BIAS ? pickOne(decades, rand) : 1950 + 10 * Math.floor(rand() * 7);
  return { cc: pickOne(ccs, rand), decade };
}

// Artists the user listed in their preferences: never recommended (they know them already).
const prefHeard = (prefs = {}) => (prefs.artists || []).flatMap(a => [`dz:${a.dzId}`, norm(a.name)]);

// Deezer artist search rows -> by fans, an exact name match counting 10x (so a half-typed "Nirv" doesn't beat Nirvana).
const rankArtists = (rows, q) => (rows || []).filter(a => a && a.id != null && a.name)
  .map(a => ({ dzId: a.id, name: a.name, fans: a.nb_fan || 0, w: (a.nb_fan || 0) * (norm(a.name) === norm(q) ? 10 : 1) }))
  .sort((a, b) => b.w - a.w).map(({ w, ...a }) => a);

async function exploreCandidate(get, heard, exclude, prefs, rand = Math.random) {
  const { cc, decade } = pickTrip(prefs, rand);
  const names = (await passportArtists(get, cc, decade, Math.floor(rand() * 21)))
    .filter(n => !heard.includes(norm(n)) && !exclude.includes(norm(n)));
  for (const name of names.slice(0, 3)) {
    const t = await resolvePreview(get, name);
    if (!t || isHeard(heard, { dz: t.artistDzId, name: t.artist }) || exclude.includes(norm(t.artist))) continue;
    // The MB query is on the artist's birth/formation year and the track is their top one from any year: claim no song decade.
    const who = `an artist born or formed ${decade - 20}–${decade + 9}`;
    return { ...t, reason: `Random trip: ${ALL_CC[cc]}, ${who}`, why: { kind: 'trip', place: ALL_CC[cc] }, country: cc, decade };
  }
  return null;
}

async function neighbourCandidate(get, likes, heard, exclude, adventure, rand = Math.random) {
  const { fanCap, hops } = adventureMix(adventure);
  const loved = pickOne(likes.filter(l => l.artistDzId), rand);
  if (!loved) return null;
  const skip = [...heard, ...exclude];
  let pool = [], from = loved.artistDzId;
  for (let h = 0; h < hops; h++) {
    const rel = await get(`${DZ}/artist/${from}/related`);
    const next = pickRelated(rel.data, fanCap, skip);
    if (!next.length) break;
    pool = next;
    from = pickOne(pool, rand).id;
  }
  if (!pool.length) return null;
  const a = pickOne(pool, rand);
  const top = await get(`${DZ}/artist/${a.id}/top?limit=5`);
  const t = pickOne((top.data || []).filter(r => r.preview), rand);
  return t ? { ...fromDeezer(t), reason: `Near ${loved.artist}`, why: { kind: 'near', artist: loved.artist } } : null;
}

const ROLE_WORD = { instrument: 'musician', vocal: 'singer', mix: 'mixer', 'mix-DJ': 'DJ' };
const roleWord = role => ROLE_WORD[role.split(' ')[0]] || role.split(' ')[0];

// Credits trail from a loved track: its producer (or engineer, player...) -> another artist they worked with.
// Slow (MusicBrainz, 1.5 s/request) on first use per loved track; the disk cache makes repeats cheap.
async function trailCandidate(get, likes, heard, exclude, rand = Math.random) {
  const loved = pickOne(likes.filter(l => l.title && l.artist), rand);
  if (!loved) return null;
  const c = await credits(get, loved);
  const people = ((c && c.groups) || []).filter(g => g.role !== 'artist').flatMap(g => g.people.map(p => ({ ...p, role: roleWord(g.role) })));
  const person = people.length ? pickOne(people.slice(0, 3), rand) : null; // groups come producer-first
  if (!person) return null;
  const skip = [...heard, ...exclude];
  for (const pick of (await personTrail(get, person.id, loved.artist, skip)).slice(0, 3)) {
    if (isHeard(skip, { mb: pick.mbid, name: pick.artist })) continue;
    const t = await resolvePreview(get, pick.artist, pick.title);
    if (!t || isHeard(skip, { dz: t.artistDzId, name: t.artist })) continue;
    return { ...t, reason: `Via ${person.name} (${person.role} on ${loved.title})`,
      why: { kind: 'trail', person: person.name, role: person.role, loved: loved.title, also: norm(t.title).includes(norm(pick.title)) ? roleWord(pick.role) : '' } };
  }
  return null;
}

// A top track by one of Deezer's artists for a genre the user picked.
async function genreCandidate(get, genres, heard, exclude, rand = Math.random) {
  const g = pickOne(genres, rand);
  if (!g) return null;
  const skip = [...heard, ...exclude];
  const res = await get(`${DZ}/genre/${enc(g.id)}/artists`);
  const a = pickOne((res.data || []).filter(x => !isHeard(skip, { dz: x.id, name: x.name })), rand);
  if (!a) return null;
  const top = await get(`${DZ}/artist/${a.id}/top?limit=5`);
  const t = pickOne((top.data || []).filter(r => r.preview), rand);
  return t ? { ...fromDeezer(t), reason: `From the ${g.name} shelf`, why: { kind: 'genre', genre: g.name } } : null;
}

// source: 'explore' | 'neighbour' | 'trail' | 'genre'; omitted = the Adventure mix (cold start).
// prefs: listed artists are never returned but feed the neighbour source; genres add a source; regions/decades bias random trips.
async function nextCandidate(get, { likes = [], heard = [], exclude = [], adventure = 50, source, prefs = {} } = {}, rand = Math.random) {
  heard = [...heard, ...prefHeard(prefs)];
  const genres = prefs.genres || [];
  const near = [...likes, ...(prefs.artists || []).map(a => ({ artist: a.name, artistDzId: a.dzId }))];
  source = source || (genres.length && rand() < 0.25 ? 'genre' : chooseSource(adventure, near.length, rand()));
  const n = source === 'trail' ? (await trailCandidate(get, likes, heard, exclude, rand)) // no loved tracks yet: listed artists stand in
      || (prefs.artists || []).length && await neighbourCandidate(get, near, heard, exclude, adventure, rand)
    : source === 'neighbour' ? await neighbourCandidate(get, near, heard, exclude, adventure, rand)
    : source === 'genre' ? await genreCandidate(get, genres, heard, exclude, rand) : null;
  return n || exploreCandidate(get, heard, exclude, prefs, rand);
}

// ---------- Blind Test: loved artists come back with a deep cut ----------
const BACK_GAP = 6, BACK_COOLDOWN = 20, BACK_OK_BELOW = 34; // >=6 mysteries apart = at most 1 in 6; OK-rated artists only in the bottom third of Adventure
const returnShare = a => (1 / 6) * (1 - Math.max(0, Math.min(100, Number(a) || 0)) / 100); // low adventure: the cap; high: near zero
// back = {n: mysteries shown, last: n at the last return, seen: {dzArtistId: n at its return}, ok: [dzArtistIds rated OK]}. Returns a Deezer artist id or null.
function pickReturnArtist({ enabled = true, adventure = 50, likes = [], back = {}, busy = false, exclude = [] } = {}, rand = Math.random) {
  const { n = 0, last = 0, seen = {}, ok = [] } = back;
  if (!enabled || busy || n - last < BACK_GAP || rand() >= returnShare(adventure)) return null;
  const ids = [...likes.map(l => l.artistDzId), ...(adventure < BACK_OK_BELOW ? ok : [])].filter(i => i != null);
  const pool = [...new Set(ids)].filter(i => !(i in seen && n - seen[i] < BACK_COOLDOWN) && !exclude.includes(i));
  return pool.length ? pickOne(pool, rand) : null;
}
// Skip the top 10 by popularity, pick from 11-35; never a track already rated/liked; prefer an album other than a liked one. Needs a preview.
function pickDeepCut(top, { rated = [], albums = [] } = {}, rand = Math.random) {
  const pool = [...(top || [])].sort((a, b) => (b.rank || 0) - (a.rank || 0)).slice(10, 35)
    .filter(r => r.preview && r.artist && !rated.includes(`dz:${r.id}`));
  const other = pool.filter(r => !r.album || !albums.includes(r.album.id));
  const from = other.length ? other : pool;
  return from.length ? pickOne(from, rand) : null;
}
async function deepCut(get, { enabled, adventure, likes = [], back, busy, exclude = [], rated = [] } = {}, rand = Math.random) {
  const id = pickReturnArtist({ enabled, adventure, likes, back, busy, exclude }, rand);
  if (id == null) return null;
  try {
    const top = await get(`${DZ}/artist/${enc(id)}/top?limit=50`);
    const albums = likes.filter(l => l.artistDzId === id && l.albumId != null).map(l => l.albumId);
    const t = pickDeepCut(top.data, { rated: [...rated, ...likes.map(l => `${l.source}:${l.id}`)], albums }, rand);
    if (!t) return null;
    let year = '';
    try { year = String((await get(`${DZ}/album/${enc(t.album.id)}`)).release_date || '').slice(0, 4); } catch {}
    return { ...fromDeezer(t), back: { artist: t.artist.name, album: (t.album && t.album.title) || '', year: /^\d{4}$/.test(year) ? year : '' } };
  } catch { return null; }
}

// Preferences step: Deezer genres (minus "All") and artist search.
async function genres(get) {
  const res = await get(`${DZ}/genre`);
  return (res.data || []).filter(g => g.id > 0 && g.name).map(g => ({ id: g.id, name: g.name }));
}
async function searchArtists(get, q) {
  const res = await get(`${DZ}/search/artist?q=${enc(q)}&limit=8`);
  return rankArtists(res.data, q);
}

// Seed taste: a couple of top tracks per listed artist, to fingerprint as "love" seeds.
async function seedTracks(get, artists, n = 2) {
  const out = [];
  for (const a of artists || []) {
    const top = await get(`${DZ}/artist/${enc(a.dzId)}/top?limit=${n + 3}`);
    out.push(...(top.data || []).filter(r => r.preview).slice(0, n).map(r => ({ ...fromDeezer(r), seedId: `seed:${a.dzId}:${r.id}` })));
  }
  return out;
}

// Search rows: title/artist named in the query first, then most popular (Deezer rank); one row per song across versions.
const baseTitle = t => norm(String(t).replace(/\s*[([].*$/, '')) || norm(t); // "Creep (Acoustic)" -> creep

function sortHits(rows, q) {
  const nq = norm(q), has = s => !!s && nq.includes(s);
  const base = r => baseTitle(r.title);
  const hit = r => 2 * has(base(r)) + has(norm(r.artist && r.artist.name)); // the title names the song; the artist alone doesn't
  const seen = new Set();
  return rows.slice().sort((a, b) => hit(b) - hit(a) || (b.rank || 0) - (a.rank || 0))
    .filter(r => { const k = `${norm(r.artist && r.artist.name)}|${base(r)}`; return !seen.has(k) && seen.add(k); });
}

// Title-only query: among the popular hits with exactly that title, the earliest iTunes release date is the original.
// Only popular hits compete, so an older unrelated song with the same title (The Damned's "Creep") can't win;
// a date tie keeps the more popular one (iTunes misdates some covers, e.g. a 2018 "Hallelujah" as 1984).
function originalFirst(hits, itRows, q) {
  const nq = baseTitle(q);
  const date = r => (itRows || []).filter(i => i.releaseDate && baseTitle(i.trackName) === nq && artistMatch(i.artistName, r.artist && r.artist.name))
    .map(i => i.releaseDate).sort()[0];
  const dated = hits.filter(r => baseTitle(r.title) === nq).map(r => ({ r, d: date(r) })).filter(x => x.d);
  if (!dated.length) return { rows: hits, year: null };
  const o = dated.reduce((a, b) => (b.d < a.d ? b : a));
  return { rows: [o.r, ...hits.filter(r => r !== o.r)], year: Number(o.d.slice(0, 4)) };
}

async function searchTracks(get, q) {
  const [res, it] = await Promise.all([get(`${DZ}/search?q=${enc(q)}&limit=25`), get(`${IT}/search?entity=song&limit=200&term=${enc(q)}`)]);
  // iTunes-only songs (bonus tracks Deezer lacks, e.g. Oasis "Sad Song") join when the query names both title and artist;
  // rank 0 keeps the Deezer version when both have it.
  const nq = norm(q);
  const extra = (it.results || []).filter(r => r.previewUrl && nq.includes(baseTitle(r.trackName)) && nq.includes(norm(r.artistName)))
    .map(r => ({ title: r.trackName, artist: { name: r.artistName }, rank: 0, it: r }));
  const { rows, year } = originalFirst(sortHits([...(res.data || []), ...extra], q).slice(0, 10), it.results, q);
  return rows.map((r, i) => ({ ...(r.it ? fromItunes(r.it) : fromDeezer(r)), original: i === 0 ? year : null }));
}

// Credits for a track: {recId} or {isrc, title, artist}.
async function credits(get, { recId, isrc, title, artist }) {
  const inc = 'inc=artist-rels+work-rels+artist-credits&fmt=json';
  let rec = null;
  if (recId) rec = await get(`${MB}/recording/${recId}?${inc}`);
  else {
    const ids = isrc ? ((await get(`${MB}/isrc/${enc(isrc)}?fmt=json`)).recordings || []).slice(0, 3).map(r => r.id) : [];
    rec = bestRecording(await seq(ids, id => get(`${MB}/recording/${id}?${inc}`)));
    if (!rec || !(rec.relations || []).length) {
      const q = `recording:"${title}" AND artist:"${artist}"`;
      const found = ((await get(`${MB}/recording?query=${enc(q)}&limit=5&fmt=json`)).recordings || []).slice(0, 3);
      const alt = bestRecording(await seq(found.map(r => r.id), id => get(`${MB}/recording/${id}?${inc}`)));
      if (alt && (!rec || (alt.relations || []).length > (rec.relations || []).length)) rec = alt;
    }
  }
  if (!rec || rec.error) return null;
  const perf = (rec.relations || []).find(r => r['target-type'] === 'work' && r.work);
  const work = perf ? await get(`${MB}/work/${perf.work.id}?inc=artist-rels&fmt=json`) : null;
  const groups = groupCredits(rec, work && !work.error ? work : null);
  const mainArtist = (rec['artist-credit'] || [])[0];
  let country = null;
  if (groups.length <= 1 && mainArtist) country = (await get(`${MB}/artist/${mainArtist.artist.id}?fmt=json`)).country || null;
  return {
    recId: rec.id, title: rec.title, artist: creditName(rec) || artist,
    work: perf ? { id: perf.work.id, title: perf.work.title } : null,
    hasCredits: groups.length > 1, groups, country,
  };
}

// Sequential map: MB calls are paced anyway, keep order simple.
async function seq(items, fn) { const out = []; for (const x of items) out.push(await fn(x)); return out; }

async function personTrail(get, mbid, excludeArtist, heard = []) {
  const res = await get(`${MB}/artist/${mbid}?inc=recording-rels+artist-credits&fmt=json`);
  return trailPicks(res.relations, excludeArtist, heard);
}

// ---------- About (reveal description) ----------

const MUSIC = /\b(singer|band|musician|rapper|group|dj|composer|producer|songwriter|duo|trio|vocalist|guitarist|pianist|drummer|orchestra|ensemble|song|single|album)s?\b/i;
const ABBR = /(?:\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|No|Vol|feat|ft|Bros|Inc|Ltd|Co)|\b[A-Z])\.$/;

// First n sentences, cut at a sentence end ("Jr." / "St." / initials are not ends), at most ~max chars when n > 1.
function trimSentences(text, n = 2, max = 320) {
  const parts = String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=["“(]?[A-Z0-9])/);
  const out = [];
  for (const p of parts) {
    if (out.length && ABBR.test(out[out.length - 1])) { out[out.length - 1] += ' ' + p; continue; }
    if (out.length >= n || (out.length && (out.join(' ') + ' ' + p).length > max)) break;
    out.push(p);
  }
  return out.join(' ');
}

// A Wikipedia REST summary counts only if it is plainly about music and names the artist (and, for a song page, the title).
function wikiAccept(s, artist, title) {
  if (!s || s.error || s.type === 'disambiguation' || !s.extract) return false;
  const what = s.description || trimSentences(s.extract, 1);
  const shown = norm(`${s.description || ''} ${trimSentences(s.extract)}`); // the artist must be named in what we show
  if (!MUSIC.test(what) || !shown.includes(norm(artist))) return false;
  if (title) return /\b(song|single|composition|instrumental)\b/i.test(what) && norm(s.title).includes(norm(title));
  return norm(s.title.replace(/\s*\([^)]*\)$/, '')) === norm(artist) && !/\b(song|single|album)\b/i.test(what); // "Nirvana (band)", never "Mercury Rev" for Mercury
}

const andList = xs => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || '';

// Natural sentence from the fields we have, nothing invented. a: MusicBrainz artist (search row); f: album facts.
function factSentence(a, f = {}) {
  const out = [];
  if (a) {
    const all = (a.tags || []).slice().sort((x, y) => y.count - x.count).map(t => t.name);
    const role = a.type === 'Person' && all.find(t => MUSIC.test(t)); // "film composer" is what they are, not a style
    const noun = role || { Group: 'band', Person: 'artist', Orchestra: 'orchestra', Choir: 'choir' }[a.type] || 'act';
    const area = a.area && a.area.name, born = a['begin-area'] && a['begin-area'].name;
    const year = ((a['life-span'] || {}).begin || '').slice(0, 4);
    const tags = all.filter(t => !MUSIC.test(t)).slice(0, 3);
    const verb = a.type === 'Person' ? 'born' : 'formed';
    const when = [born && born !== area && `in ${born}`, year && `in ${year}`].filter(Boolean).join(' ');
    if (area || when || tags.length)
      out.push(`${/^[aeiou]/.test(noun) ? 'An' : 'A'} ${noun}${area ? ` from ${area}` : ''}${when ? `, ${verb} ${when}` : ''}${tags.length ? `, known for ${andList(tags)}` : ''}.`);
  }
  if (f.album) {
    const kind = { single: 'single', ep: 'EP', compile: 'compilation' }[f.kind] || 'album';
    out.push(`${out.length ? 'This track is from' : 'From'} the ${f.year ? `${f.year} ` : ''}${kind} “${f.album}”${f.label ? ` on ${f.label}` : ''}.`);
  } else if (f.year) out.push(`Released in ${f.year}.`);
  return out.join(' ');
}

const wikiSummary = (get, title) => get(`${WP}/api/rest_v1/page/summary/${enc(title.replace(/ /g, '_'))}`);
const wikiSearch = async (get, q) => ((await get(`${WP}/w/api.php?action=query&list=search&srlimit=3&format=json&srsearch=${enc(q)}`)).query || {}).search || [];

// Song page if it has one, else the artist's page; null when nothing passes wikiAccept.
async function wikiAbout(get, artist, title) {
  title = title.replace(/\s*[([][^)\]]*[)\]]|\s+-\s+.*$/g, '').trim() || title; // "China (2015 Remaster)" -> "China"
  for (const r of await wikiSearch(get, `${title} ${artist} song`)) {
    if (!norm(r.title).includes(norm(title))) continue;
    const s = await wikiSummary(get, r.title);
    if (wikiAccept(s, artist, title)) return s;
  }
  const direct = await wikiSummary(get, artist);
  if (wikiAccept(direct, artist)) return direct;
  for (const r of await wikiSearch(get, `${artist} musician band`)) {
    if (!norm(r.title).startsWith(norm(artist)) || r.title === (direct && direct.title)) continue; // cheap pre-filter; wikiAccept is strict
    const s = await wikiSummary(get, r.title);
    if (wikiAccept(s, artist)) return s;
  }
  return null;
}

// Reveal description: { text, url (the Wikipedia page when that is the source), facts: { album, year, label, genre, kind } }.
async function about(get, { source, id, albumId, title, artist }) {
  if (!albumId && source === 'dz' && id) albumId = ((await get(`${DZ}/track/${enc(id)}`)).album || {}).id;
  const al = albumId ? await get(`${DZ}/album/${enc(albumId)}`) : {};
  const year = (al.release_date || '').slice(0, 4);
  const genre = ((al.genres || {}).data || [])[0];
  const facts = al.error ? {} : { album: al.title, year: year > '0000' ? year : undefined, label: al.label, genre: genre && genre.name, kind: al.record_type };
  const w = await wikiAbout(get, artist, title);
  if (w) return { text: trimSentences(w.extract), url: ((w.content_urls || {}).desktop || {}).page, facts };
  const rows = ((await get(`${MB}/artist?query=${enc(`artist:"${artist}"`)}&limit=5&fmt=json`)).artists || [])
    .filter(r => r.score >= 90 && norm(r.name) === norm(artist));
  return { text: factSentence(new Set(rows.map(r => r.id)).size === 1 ? rows[0] : null, facts), facts }; // two same-name artists: say nothing about either
}

module.exports = {
  COUNTRIES, norm, isHeard, artistMatch, shuffle, fromDeezer, fromItunes, pickDeezer, pickItunes, adventureMix, chooseSource, pickRelated,
  bestRecording, groupCredits, trailPicks, trimSentences, wikiAccept, factSentence, dedupe, sharedNames, soleArtist, personTrail, sortHits, baseTitle, originalFirst, pickTrip, prefHeard, rankArtists, TRIP_BIAS, returnShare, pickReturnArtist, pickDeepCut, BACK_GAP, BACK_COOLDOWN,
  flows: { deepCut, resolvePreview, freshPreview, passportArtists, nextCandidate, searchTracks, genres, searchArtists, seedTracks, about },
};
