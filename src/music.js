// Discovery logic. Pure helpers + flows that take `get(url, opts)` so tests can feed recorded JSON.
const COUNTRIES = require('./countries');

const DZ = 'https://api.deezer.com';
const IT = 'https://itunes.apple.com';
const MB = 'https://musicbrainz.org/ws/2';
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

// Deezer search rows -> best row for artist/title, or null.
function pickDeezer(rows, artist, title, requireTitle = false) {
  const ok = (rows || []).filter(r => r.preview && artistMatch(r.artist && r.artist.name, artist));
  const t = norm(title);
  const titled = t ? ok.filter(r => norm(r.title).includes(t)) : [];
  if (titled.length) return titled[0];
  if (requireTitle && t) return null;
  return ok.sort((a, b) => (b.rank || 0) - (a.rank || 0))[0] || null;
}

function pickItunes(rows, artist, title, requireTitle = false) {
  const ok = (rows || []).filter(r => r.previewUrl && artistMatch(r.artistName, artist));
  const t = norm(title);
  const titled = t ? ok.filter(r => norm(r.trackName).includes(t)) : [];
  if (titled.length) return titled[0];
  if (requireTitle && t) return null;
  return ok[0] || null;
}

const fromDeezer = r => ({ source: 'dz', id: r.id, title: r.title, artist: r.artist.name, artistDzId: r.artist.id,
  cover: r.album && r.album.cover_medium, isrc: r.isrc, previewUrl: r.preview });
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

// Work recording rels -> shuffled distinct cover artists (excluding the original).
function coverArtists(relations, originalArtist, rand = Math.random) {
  const names = new Set();
  for (const r of relations || []) {
    if (!r.recording || !(r.attributes || []).includes('cover')) continue;
    const a = creditName(r.recording);
    if (a && !artistMatch(a, originalArtist)) names.add(a);
  }
  return shuffle([...names], rand);
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
  return shuffle(dedupe(names));
}

async function exploreCandidate(get, heard, exclude, rand = Math.random) {
  const cc = pickOne(Object.keys(ALL_CC), rand);
  const decade = 1950 + 10 * Math.floor(rand() * 7);
  const names = (await passportArtists(get, cc, decade, Math.floor(rand() * 21)))
    .filter(n => !heard.includes(norm(n)) && !exclude.includes(norm(n)));
  for (const name of names.slice(0, 3)) {
    const t = await resolvePreview(get, name);
    if (t && !isHeard(heard, { dz: t.artistDzId, name: t.artist }) && !exclude.includes(norm(t.artist)))
      return { ...t, reason: `Random trip: ${ALL_CC[cc]}, ${decade}s`, country: cc, decade };
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
  return t ? { ...fromDeezer(t), reason: `Near ${loved.artist}` } : null;
}

async function nextCandidate(get, { likes = [], heard = [], exclude = [], adventure = 50 } = {}) {
  if (chooseSource(adventure, likes.length) === 'neighbour') {
    const n = await neighbourCandidate(get, likes, heard, exclude, adventure);
    if (n) return n;
  }
  return exploreCandidate(get, heard, exclude);
}

async function searchTracks(get, q) {
  const res = await get(`${DZ}/search?q=${enc(q)}&limit=10`);
  return (res.data || []).map(fromDeezer);
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

async function covers(get, workId, originalArtist) {
  const res = await get(`${MB}/work/${workId}?inc=recording-rels+artist-credits&fmt=json`);
  return coverArtists(res.relations, originalArtist);
}

module.exports = {
  COUNTRIES, norm, isHeard, artistMatch, shuffle, pickDeezer, pickItunes, adventureMix, chooseSource, pickRelated,
  bestRecording, groupCredits, trailPicks, coverArtists, dedupe,
  flows: { resolvePreview, freshPreview, passportArtists, nextCandidate, searchTracks, credits, personTrail, covers },
};
