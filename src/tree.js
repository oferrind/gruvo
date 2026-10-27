// Family Tree (docs/05-song-tree-spec.md): a small explained tree of songs around one root song.
// Like src/music.js, everything takes `get(url)` so tests can feed recorded JSON. Runs in main; nodes stream out via `emit`.
const COUNTRIES = require('./countries');
const { norm, soleArtist, sharedNames, personTrail, dedupe, baseTitle, adventureMix, flows: { resolvePreview } } = require('./music');

const DZ = 'https://api.deezer.com';
const MB = 'https://musicbrainz.org/ws/2';
const WD = 'https://www.wikidata.org/w/api.php';
const enc = encodeURIComponent;
const FAMED = new Set(['scene', 'related', 'era', 'place', 'label']); // edges the Fame setting gates; members, roots and songs are chosen on purpose
const CAP = 60, MORE = 3, MAX_ROOTS = 2, MB_BUDGET = 60; // MB_BUDGET: paced MusicBrainz calls per build (60 x 1.5 s); each More gets up to 12 more
const CC = Object.assign({}, ...Object.values(COUNTRIES));
const ccName = cc => ({ GB: 'UK', US: 'US' }[cc] || CC[cc] || cc);
const yearOf = s => parseInt(String(s || '').slice(0, 4), 10) || null;

// ---------- pure helpers ----------

const GENERIC = new Set(['rock', 'pop', 'british', 'english', 'uk', 'american', 'usa', 'seenlive', 'favorites', 'male vocalists', 'female vocalists']
  .concat(Object.values(CC)).map(norm));
const generic = t => GENERIC.has(norm(t)) || /^\d0s$|^\d{4}s?$/.test(t);

// Highest-count tags, skipping words that say nothing about the sound.
const topTags = (a, n = 5) => ((a && a.tags) || []).filter(t => !generic(t.name))
  .sort((x, y) => y.count - x.count).slice(0, n).map(t => t.name);

// Risk guard (§9): a scene hit must share 2 of the root's top tags, or the top tag plus the country (cuts Metallica out of grunge).
function sceneGuard(root, cand) {
  const rt = topTags(root), ct = topTags(cand);
  if (!rt.length) return false;
  return rt.filter(t => ct.includes(t)).length >= 2 || (ct.includes(rt[0]) && !!cand.country && cand.country === root.country);
}

// ---------- Grow settings (prefs.tree) ----------
// Every edge type a tree can grow along. The default is the original behaviour (related is only a ranking boost there).
const EDGES = ['scene', 'related', 'era', 'place', 'soundtrack', 'producer', 'label', 'member', 'builton', 'roots'];
const SETTINGS = () => ({ edges: ['scene', 'member', 'builton', 'roots'], era: 'near', place: 'same', fame: 50, width: 3 });
// Allowlist + clamp: used by the profile store and the IPC boundary, so nothing odd reaches the query builders.
function validSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  const d = SETTINGS(), edges = EDGES.filter(e => Array.isArray(s.edges) && s.edges.includes(e));
  return { edges: edges.length ? edges : d.edges, era: ['near', 'decade', 'any'].includes(s.era) ? s.era : d.era,
    place: ['same', 'any'].includes(s.place) ? s.place : d.place,
    fame: Number.isFinite(s.fame) ? Math.max(0, Math.min(100, Math.round(s.fame))) : d.fame, width: s.width === 5 ? 5 : 3 };
}
// Fame slider 0 (famous) .. 100 (obscure), 50 = no preference. Obscure reuses the Blind Test's fan cap; famous is a fan floor.
function fameOk(fans, fame) {
  if (!Number.isFinite(fans) || fame === 50) return true;
  return fame > 50 ? fans <= 5 * adventureMix((fame - 50) * 2).fanCap : fans >= (50 - fame) * 4000; // x5: related lists are all well-known, the Blind Test's raw cap would empty them
}
// Begin-year window for the Era filter ('any' = none).
const eraWindow = (era, b) => !b || era === 'any' ? null : era === 'decade' ? [b - (b % 10), b - (b % 10) + 9] : [b - 5, b + 5];
const span = w => w && `begin:[${w[0]} TO ${w[1]}]`;

function sceneQuery(a, S = SETTINGS()) {
  const b = yearOf((a['life-span'] || {}).begin);
  return [`tag:"${topTags(a)[0]}"`, span(eraWindow(S.era, b)), S.place === 'same' && a.country && `country:${a.country}`, a.type === 'Group' && 'type:group']
    .filter(Boolean).join(' AND ');
}
// Same era: any genre, the node's years (the Era filter's window, never "any"), its country unless Place = Anywhere.
function eraQuery(a, S) {
  const b = yearOf((a['life-span'] || {}).begin);
  return b ? [span(eraWindow(S.era === 'any' ? 'near' : S.era, b)), S.place === 'same' && a.country && `country:${a.country}`].filter(Boolean).join(' AND ') : '';
}
const areaOf = a => ((a['begin-area'] || a.area || {}).name || '').replace(/["\\]/g, ' ').trim();
// Same place: its city/area OR its country (a city alone finds ~2 artists; the OR ranks city matches first); any genre; the Era filter still narrows the years.
function placeQuery(a, S) {
  const b = yearOf((a['life-span'] || {}).begin), area = areaOf(a);
  const where = [area && `beginarea:"${area}"`, a.country && `country:${a.country}`].filter(Boolean).join(' OR ');
  return where ? [`(${where})`, span(eraWindow(S.era, b))].filter(Boolean).join(' AND ') : '';
}

const sceneLabel = (tag, a, fansOf) => {
  const b = yearOf((a['life-span'] || {}).begin);
  return `Same scene: ${[tag, a.country && ccName(a.country), b && `${a.type === 'Person' ? 'born' : 'formed'} ${b}`].filter(Boolean).join(', ')}`
    + (fansOf ? ` · fans of ${fansOf} play them too` : '');
};

// Band members (people) of a band's artist-rels, singers first: frontmen are the likeliest to have moved on.
function parseMembers(rels) {
  const out = new Map();
  for (const r of rels || []) {
    if (r.type !== 'member of band' || r.direction !== 'backward' || !r.artist || out.has(r.artist.id)) continue;
    const role = (r.attributes || []).filter(x => x !== 'original').map(x => x.replace(/\s*\(.*\)/, ''))[0] || '';
    out.set(r.artist.id, { id: r.artist.id, name: r.artist.name, role, joined: yearOf(r.begin) });
  }
  return [...out.values()].sort((a, b) => /vocal/.test(b.role) - /vocal/.test(a.role));
}

// A member's other bands. Era guard: the other band can't start more than 15 years after the parent band.
function otherBands(memberRels, member, band) {
  const out = new Map();
  for (const r of memberRels || []) {
    if (r.type !== 'member of band' || r.direction !== 'forward' || !r.artist || r.artist.id === band.id || out.has(r.artist.id)) continue;
    const begin = yearOf(r.begin), end = yearOf(r.end);
    if (begin && band.begin && begin > band.begin + 15) continue;
    const before = end && member.joined && end <= member.joined;
    out.set(r.artist.id, { artist: r.artist.name, mbid: r.artist.id, kind: 'member',
      label: `${member.name}${member.role ? ` (${member.role})` : ''} ${before ? 'came from' : 'went on to'} ${r.artist.name}` });
  }
  return [...out.values()];
}

// Looking back only (§2): what this recording samples (forward rel) and what its work is based on (backward rel).
// Forward "based on" / backward "samples" are the songs built on THIS one (mashups, parodies): never used.
function lookBack(rec, work) {
  const out = [];
  for (const r of (rec && rec.relations) || []) {
    if (r.type !== 'samples material' || r.direction !== 'forward' || !r.recording) continue;
    const artist = (r.recording['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join('');
    if (artist) out.push({ artist, title: r.recording.title, kind: 'builton', label: `Samples ${artist}'s “${r.recording.title}”` });
  }
  for (const r of (work && work.relations) || []) {
    if (r.type === 'based on' && r.direction === 'backward' && r.work && !out.some(o => norm(o.title) === norm(r.work.title)))
      out.push({ title: r.work.title, work: r.work.id, kind: 'builton' });
  }
  return out;
}

// Who first recorded a work: the credit on its earliest dated recording that isn't a live/demo/remix cut.
function firstPerformer(recs) {
  const ok = (recs || []).filter(r => r['first-release-date'] && !/(live|demo|remix|edit|version)/i.test(r.disambiguation || ''))
    .sort((a, b) => a['first-release-date'].localeCompare(b['first-release-date']))[0];
  return ok ? (ok['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join('') || null : null;
}

// Earliest dated studio recording with this exact title: Saved can hold a 2025 live version, the tree wants the original.
function originalRecording(recs, artist, title) {
  const ok = (recs || []).filter(r => norm(r.title) === norm(title) && r['first-release-date']
    && !/\b(live|demo|remix|edit|version|acoustic)\b/i.test(r.disambiguation || '')
    && (r['artist-credit'] || []).some(c => norm(c.name) === norm(artist)));
  return ok.sort((a, b) => a['first-release-date'].localeCompare(b['first-release-date']))[0] || null;
}

// The best-known official pure soundtrack (not a "Soundtrack + Compilation" mix) that carries this song,
// from recording-search rows (their releases carry the release-group's secondary types).
function bestSoundtrack(recs, artist, title) {
  const out = [];
  for (const r of recs || []) {
    if (norm(r.title) !== norm(title) || !(r['artist-credit'] || []).some(c => norm(c.name) === norm(artist))) continue;
    for (const rel of r.releases || []) {
      const t = (rel['release-group'] || {})['secondary-types'] || [];
      if (rel.status === 'Official' && t.includes('Soundtrack') && !t.includes('Compilation')) out.push(rel);
    }
  }
  // The soundtrack with the most editions is the famous film (Pulp Fiction over Riding Giants); earliest edition breaks ties.
  const group = r => (r['release-group'] || {}).id || norm(r.title), n = {};
  for (const r of out) n[group(r)] = (n[group(r)] || 0) + 1;
  const hit = out.sort((a, b) => n[group(b)] - n[group(a)] || (a.date || '9999').localeCompare(b.date || '9999'))[0];
  return hit ? { id: hit.id, title: hit.title, year: yearOf(hit.date) } : null;
}
// "Pulp Fiction: Music From the Motion Picture" -> "Pulp Fiction"
const filmName = t => t.replace(/\s*[:(–-]\s*(music from|original|motion picture|ost|soundtrack|\w+ (motion picture|soundtrack))\b.*$/i, '').replace(/\s+soundtrack$/i, '').trim() || t;
// Other artists' tracks on a release's tracklist, one per artist.
function soundtrackTracks(rel, artist, sound) {
  const seen = new Set([norm(artist)]), out = [];
  for (const m of (rel && rel.media) || []) for (const t of m.tracks || []) {
    const a = (t['artist-credit'] || []).map(c => c.name + (c.joinphrase || '')).join('');
    if (!a || !t.title || /^various/i.test(a) || seen.has(norm(a))) continue;
    seen.add(norm(a));
    out.push({ artist: a, title: t.title, kind: 'soundtrack', label: `Also on the ${filmName(sound.title)} soundtrack${sound.year ? ` (${sound.year})` : ''}` });
  }
  return out;
}

// ---------- tree state ----------

// Saved songs never come back as tree songs (the root is shown as given): by id, or artist + base title so a remaster counts too.
const songKey = t => `${norm(t.artist)}|${baseTitle(t.title)}`;
const isSaved = (T, t) => T.saved.has(`id:${t.source}:${t.id}`) || T.saved.has(songKey(t));
function newTree(get, root, { emit = () => {}, live = () => true, heard = [], saved = [], settings, rand = Math.random, recent = [] } = {}) {
  // MusicBrainz is paced, so the build gets a fixed call budget: past it MB calls answer {error} and that edge is skipped.
  const T = { S: validSettings(settings), rand, recent, fans: new Map(), rels: new Map(), mbLeft: MB_BUDGET, emit, live, heard: new Set(heard), nodes: [], used: new Set(), roots: 0,
    fails: 0, // network errors seen, so an offline More is not mistaken for "no more family"
    get: url => String(url).startsWith(MB) && T.mbLeft-- <= 0 ? Promise.resolve({ error: 'budget' }) : get(url).then(res => { if (res && res.error && res.error.message) T.fails++; return res; }),
    saved: new Set(saved.flatMap(s => [s.id != null && `id:${s.source}:${s.id}`, songKey(s)]).filter(Boolean)) };
  addNode(T, null, root, { label: '' });
  claim(T, { artist: root.artist, dzId: root.artistDzId });
  return T;
}

const keys = c => [c.artist && `n:${norm(c.artist)}`, c.mbid && `mb:${c.mbid}`, c.dzId != null && `dz:${c.dzId}`].filter(Boolean);
const taken = (T, c) => keys(c).some(k => T.used.has(k));
const claim = (T, c) => keys(c).forEach(k => T.used.add(k));

function addNode(T, parent, track, c) {
  const n = { id: T.nodes.length, parent: parent ? parent.id : null, depth: parent ? parent.depth + 1 : 0, kids: 0,
    artist: track.artist, track, label: c.label, mbid: c.mbid || null, mb: c.mb || null, dzId: track.artistDzId ?? null,
    pending: [], done: new Set() };
  T.nodes.push(n);
  T.recent.push(songKey(track)); // the caller's list of songs shown lately (handlers.js trims it)
  if (parent) parent.kids++;
  T.emit({ id: n.id, parentId: n.parent, depth: n.depth, edgeType: parent ? c.kind : 'root', label: n.label, track });
  return n;
}

// ---------- network steps (each skips its edge on failure, never fails the tree) ----------

// Exact-name Deezer artist; two different artists with that name = can't tell which was meant, so none ("Cast", "Gene").
async function dzArtist(get, name, fans) {
  const res = await get(`${DZ}/search/artist?q=${enc(`artist:"${name}"`)}&limit=10`);
  const exact = (res.data || []).filter(a => norm(a.name) === norm(name)).sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
  const pick = a => { if (fans && Number.isFinite(a.nb_fan)) fans.set(a.id, a.nb_fan); return a.id; }; // fan counts feed the Fame setting
  // Deezer keeps dead duplicate entries (a second "Beady Eye" with 2 fans): a 100x lead still means one real artist.
  if (exact.length > 1 && (exact[0].nb_fan || 0) >= 100 * Math.max(1, exact[1].nb_fan || 0)) return pick(exact[0]);
  const hit = soleArtist(exact, name, a => a.name, a => a.id);
  return hit.length ? pick(hit[0]) : null;
}

const dzTrack = r => r && { source: 'dz', id: r.id, artist: r.artist.name, artistDzId: r.artist.id,
  cover: r.album && r.album.cover_medium, albumId: r.album && r.album.id, previewUrl: r.preview,
  title: (r.title_short || r.title).replace(/\s*[([-][^)\]]*remaster[^)\]]*[)\]]?\s*$/i, '') || r.title }; // "Beautiful Ones (Remastered)"

// Variety: sort by rank plus noise (rand = () => 0 keeps strict rank order); items shown lately sink to the back.
const JITTER = 4, RECENT_PENALTY = 8;
const recentArtist = (T, a) => T.recent.some(k => k.startsWith(`${norm(a)}|`));
const jitter = (T, list) => list.map((c, i) => ({ c, k: i + T.rand() * JITTER + (recentArtist(T, c.artist) ? RECENT_PENALTY : 0) }))
  .sort((x, y) => x.k - y.k).map(x => x.c);

// One of the artist's top 5 usable tracks (preview, not a live/remix/demo cut), rank-weighted; the Fame setting flattens (obscure) or sharpens (famous) the weights.
// Tracks already saved or shown lately are left out unless nothing else is left.
async function topTrack(T, dzId) {
  const res = await T.get(`${DZ}/artist/${enc(dzId)}/top?limit=10`);
  const ok = (res.data || []).filter(t => t.preview && !/\b(live|remix|demo|version)\b/i.test(t.title)).map(dzTrack);
  const fresh = ok.filter(x => !isSaved(T, x) && !T.recent.includes(songKey(x)));
  const pool = (fresh.length ? fresh : ok).slice(0, 5), p = T.S.fame > 50 ? 0 : T.S.fame < 50 ? 2 : 1;
  const w = pool.map((_, i) => 1 / (i + 1) ** p);
  let r = T.rand() * w.reduce((a, b) => a + b, 0), i = 0;
  while (i < pool.length - 1 && r >= w[i]) r -= w[i++];
  return pool[i];
}

// A work we only know by title ("based on" carries no performer): its first recording on MB names the artist.
// shortcut: MB browse returns the first 100 recordings only; a much-covered work's original may be past them.
async function workPerformer(get, workId) {
  const res = await get(`${MB}/recording?work=${enc(workId)}&inc=artist-credits&limit=100&fmt=json`);
  return firstPerformer(res.recordings);
}

const related = async (get, dzId) => dzId == null ? [] : ((await get(`${DZ}/artist/${enc(dzId)}/related?limit=25`)).data || []);

// MB artist by exact name (root, influences). `like` = a parent row the hit must share a top tag or country with.
async function mbArtist(get, name, like) {
  const res = await get(`${MB}/artist?query=${enc(`artist:"${name.replace(/["\\]/g, ' ')}"`)}&limit=3&fmt=json`);
  const a = (res.artists || []).find(r => norm(r.name) === norm(name));
  if (!a || (like && !(a.country === like.country || topTags(a).some(t => topTags(like).includes(t))))) return null;
  return a;
}

const relsOf = (T, mbid) => T.rels.get(mbid) || T.rels.set(mbid, T.get(`${MB}/artist/${mbid}?inc=artist-rels+url-rels+label-rels+tags&fmt=json`)).get(mbid);

async function influences(get, rels) {
  const url = ((rels && rels.relations) || []).find(r => r.type === 'wikidata' && r.url);
  const qid = url && (url.url.resource.match(/Q\d+$/) || [])[0];
  if (!qid) return [];
  const e = await get(`${WD}?action=wbgetentities&ids=${qid}&props=claims&format=json`);
  const ids = (((e.entities || {})[qid] || {}).claims || {}).P737 || [];
  const qs = ids.map(c => ((c.mainsnak.datavalue || {}).value || {}).id).filter(Boolean).slice(0, 6);
  if (!qs.length) return [];
  const l = await get(`${WD}?action=wbgetentities&ids=${qs.join('|')}&props=labels&languages=en&format=json`);
  return qs.map(q => (((l.entities || {})[q] || {}).labels || {}).en).filter(Boolean).map(x => x.value);
}

// The node's MB row (tags, era, country): from the scene search, its rels, or an exact-name lookup like the root's.
async function mbOf(T, node) {
  if (node.mb) return node.mb;
  if (node.mbid) { const r = await relsOf(T, node.mbid); if (!r.error) node.mb = r; }
  else { const a = await mbArtist(T.get, node.artist, T.nodes[0].mb); if (a) { node.mb = a; node.mbid = a.id; claim(T, { mbid: a.id }); } }
  return node.mb;
}

// The node's own scene (its top tag, era, country): one MB query per node, started once.
// With node.mb known the query is queued synchronously, so it goes on the MB lane ahead of anything started after it.
function sceneOf(T, node) {
  return node.sceneP ??= (node.mb ? scan(T, node.mb) : mbOf(T, node).then(mb => scan(T, mb))).catch(() => []);
}

// A narrow Era window leaves old or niche artists with a scene of 1-2 (Dick Dale): one retry without the years.
const scan = async (T, mb) => {
  if (!mb || !topTags(mb).length) return [];
  const rows = await search(T, mb, sceneQuery(mb, T.S), true);
  return rows.length < 3 && T.S.era !== 'any' && T.live() ? search(T, mb, sceneQuery(mb, { ...T.S, era: 'any' }), true) : rows;
};

// One MB artist query (50 rows) around `mb`; `guard` = the scene's shared-tag check.
async function search(T, mb, q, guard) {
  if (!mb || !q || !T.live()) return [];
  const res = await T.get(`${MB}/artist?query=${enc(q)}&limit=50&fmt=json`);
  const rows = (res.artists || []).filter(a => a.id !== mb.id && (!guard || sceneGuard(mb, a)));
  const shared = sharedNames(rows, rows.map(a => a.name)); // two artists with one name: can't tell them apart on Deezer
  return rows.filter(a => !shared.has(norm(a.name)));
}
// Same era / Same place: one cached query per node, like the scene's.
const laneOf = (T, node, key, queryOf) => node[key] ??= mbOf(T, node).then(mb => search(T, mb, mb && queryOf(mb, T.S))).catch(() => []);

// Ranked scene candidates for `node`: its own scene, boosted when the node's fans also play them.
async function rank(T, node) {
  const has = k => T.S.edges.includes(k);
  const [rel, scene, era, place] = await Promise.all([has('scene') || has('related') ? related(T.get, node.dzId) : [],
    has('scene') ? sceneOf(T, node) : [], has('era') ? laneOf(T, node, 'eraP', eraQuery) : [], has('place') ? laneOf(T, node, 'placeP', placeQuery) : []]);
  const relBy = new Map(rel.map(a => [norm(a.name), a]));
  const heardOf = (a, r) => T.heard.has(norm(a.name)) || (r && T.heard.has(`dz:${r.id}`));
  const lists = [];
  if (has('scene')) {
    const tag = topTags(node.mb)[0];
    lists.push(scene.map(a => {
      const r = relBy.get(norm(a.name));
      return { artist: a.name, mbid: a.id, mb: a, dzId: r ? r.id : undefined, fans: r && r.nb_fan, kind: 'scene',
        score: (r ? 3 : 2) + (a.score || 0) / 100 - (heardOf(a, r) ? 0.5 : 0), label: sceneLabel(tag, a, r && node.artist) };
    }).sort((a, b) => b.score - a.score));
    lists[0] = jitter(T, lists[0]);
  }
  const rows = (list, kind, label) => list.map(a => ({ artist: a.name, mbid: a.id, mb: a, kind, score: (a.score || 0) / 100 - (heardOf(a) ? 0.5 : 0), label: label(a) }))
    .sort((a, b) => b.score - a.score);
  const rowsJ = (...x) => jitter(T, rows(...x));
  const b = yearOf(((node.mb || {})['life-span'] || {}).begin), cc = node.mb && node.mb.country;
  if (has('era')) lists.push(rowsJ(era, 'era', () => `Same era: ${[S_cc(T, cc), b && `${b - (b % 10)}s`].filter(Boolean).join(', ')}`));
  if (has('place')) lists.push(rowsJ(place, 'place', a => `Also from ${areaOf(a) && areaOf(a) === areaOf(node.mb || {}) ? areaOf(a) : ccName(a.country || cc)}`));
  if (has('related') || (has('scene') && !lists[0].length)) lists.push(jitter(T, await relatedEdge(T, node, rel, scene, !has('related'))));
  const out = []; // one from each kind in turn, so a tree with several edge types shows them all
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}
const S_cc = (T, cc) => T.S.place === 'same' && cc ? ccName(cc) : '';

// Deezer's related artists as an edge: sorted by the Fame setting, and, when Era or Place narrow things, checked on MB
// (at most 3 lookups per node; an artist already in the node's scene list needs none).
async function relatedEdge(T, node, rel, scene, fallback) {
  const { S } = T, b = yearOf(((node.mb || {})['life-span'] || {}).begin), cc = node.mb && node.mb.country;
  const era = fallback && S.era === 'any' ? 'near' : S.era; // no tags and no scene: the era check is what keeps it a "family"
  const w = eraWindow(era, b), sameCc = S.place === 'same' && cc;
  const inScene = new Set(scene.map(a => norm(a.name)));
  const pool = rel.filter(x => !taken(T, { artist: x.name, dzId: x.id }));
  if (S.fame !== 50) pool.sort((x, y) => S.fame < 50 ? (y.nb_fan || 0) - (x.nb_fan || 0) : (x.nb_fan || 0) - (y.nb_fan || 0));
  const out = [], rest = []; // rest: Deezer's own picks that failed or skipped the Era/Place check; they fill up what the check left short
  let checks = 0;
  for (const r of pool) {
    if (out.length >= T.S.width + 2) break;
    const c = { artist: r.name, dzId: r.id, fans: r.nb_fan, kind: 'related', label: `Fans of ${node.artist} also play` };
    if ((w || sameCc) && !inScene.has(norm(r.name))) {
      if (checks++ >= 3 || !T.live()) { rest.push(c); continue; }
      const a = await mbArtist(T.get, r.name);
      const y = a && yearOf((a['life-span'] || {}).begin);
      if (!a || (w && !(y && y >= w[0] && y <= w[1])) || (sameCc && a.country && a.country !== cc)) { rest.push(c); continue; }
      Object.assign(c, { mbid: a.id, mb: a });
    }
    out.push(c);
  }
  // Related is the only edge that keeps Deezer's picks past the check, and only when the user chose it (the fallback stays a strict "family").
  return fallback ? out : out.concat(rest).slice(0, T.S.width + 2);
}

// Turns a candidate into a child node. Claims first so a concurrent More can't add the same artist.
async function tryAdd(T, node, c) {
  if (T.nodes.length >= CAP || !T.live() || taken(T, c) || (c.kind === 'roots' && T.roots >= MAX_ROOTS)) return null;
  claim(T, c);
  let track;
  if (c.title && !c.artist) {
    const artist = c.work && await workPerformer(T.get, c.work);
    if (!artist || taken(T, { artist })) return null;
    track = await resolvePreview(T.get, artist, c.title, true);
    c.artist = artist;
    c.label = `Built on ${artist}'s “${c.title}”`;
  } else if (c.title) {
    track = await resolvePreview(T.get, c.artist, c.title, true);
  } else {
    const dzId = c.dzId ?? await dzArtist(T.get, c.artist, T.fans);
    if (dzId == null || (c.dzId == null && T.used.has(`dz:${dzId}`))) return null;
    if (FAMED.has(c.kind) && !fameOk(c.fans ?? T.fans.get(dzId), T.S.fame)) return null;
    T.used.add(`dz:${dzId}`);
    track = await topTrack(T, dzId);
  }
  if (!track || !T.live() || isSaved(T, track) || (taken(T, { artist: track.artist }) && norm(track.artist) !== norm(c.artist))) return null;
  claim(T, { artist: track.artist, dzId: track.artistDzId });
  if (c.kind === 'roots') T.roots++;
  return addNode(T, node, track, c);
}

async function fill(T, node, n) {
  while (node.kids < n && node.pending.length && T.live()) await tryAdd(T, node, node.pending.shift());
}

// The original recording, its producers and what it looks back on. Cached per node (MB calls are 1.5 s each).
// The promise is kept, so a More during the build waits for the lookup the build started instead of getting nothing.
// One recording search per node (100 rows: their releases carry the release-group types the Soundtrack edge reads).
const recSearch = (T, node) => node.recSearchP ??= (async () => {
  const { artist } = node.track;
  const title = node.track.title.replace(/\s*[([][^)\]]*[)\]]|\s+-\s+.*$/g, '').trim() || node.track.title; // "Wonderwall (Live from Dublin)" -> "Wonderwall"
  const q = `recording:"${title.replace(/["\\]/g, ' ')}" AND artist:"${artist.replace(/["\\]/g, ' ')}"`;
  return { recordings: (await T.get(`${MB}/recording?query=${enc(q)}&limit=100&fmt=json`)).recordings || [], artist, title };
})();
function recordingOf(T, node) {
  return node.recP ??= (async () => {
    const { recordings, artist, title } = await recSearch(T, node);
    const hit = originalRecording(recordings, artist, title);
    if (!hit) return null;
    const rec = await T.get(`${MB}/recording/${hit.id}?inc=work-rels+recording-rels+artist-rels+artist-credits&fmt=json`);
    if (rec.error) return null;
    const perf = (rec.relations || []).find(r => r.type === 'performance' && r.work);
    const work = perf ? await T.get(`${MB}/work/${perf.work.id}?inc=work-rels&fmt=json`) : null;
    node.year = yearOf(hit['first-release-date']);
    return { rec, work: work && !work.error ? work : null };
  })().catch(() => null);
}

// Special-slot candidates: Built on (root only) > Member moved > Roots. Started once, early, so the calls overlap.
function candsOf(T, node) {
  return node.candsP ??= (async () => {
    if (!T.live()) return [];
    const has = k => T.S.edges.includes(k), near = node.depth <= 1; // producer, label and soundtrack lookups cost 2-4 MB calls: root and its children only
    const recP = node.depth === 0 && (has('builton') || has('producer')) ? recordingOf(T, node) : null;
    const soundP = near && has('soundtrack') ? soundEdge(T, node) : null;
    await mbOf(T, node);
    const rels = node.mbid && T.live() && (has('member') || has('roots')) ? await relsOf(T, node.mbid) : null;
    const cands = [];
    if (rels && !rels.error) {
      node.mb = node.mb || rels;
      const band = { id: node.mbid, begin: yearOf((node.mb['life-span'] || {}).begin) };
      const members = parseMembers(rels.relations);
      members.forEach(m => claim(T, { artist: m.name })); // "Liam Gallagher" never shows up under Oasis
      const infP = has('roots') && T.roots < MAX_ROOTS ? influences(T.get, rels).catch(() => []) : Promise.resolve([]); // Wikidata runs beside the MB lookups
      const mrs = T.live() && has('member') ? await Promise.all(members.slice(0, node.depth === 0 ? 2 : 1).map(m => T.get(`${MB}/artist/${m.id}?inc=artist-rels&fmt=json`))) : [];
      mrs.forEach((mr, i) => cands.push(...otherBands(mr.relations, members[i], band)));
      const inf = (await infP).filter(n => !taken(T, { artist: n }));
      if (inf[0]) cands.push({ artist: inf[0], kind: 'roots', label: `${node.artist} named ${inf[0]} as an influence` });
    }
    const r = await recP;
    const prod = near && has('producer') && T.live() ? await (async () => { const rr = r || await recordingOf(T, node); return rr ? producerEdge(T, node, rr.rec) : []; })() : [];
    const sound = soundP ? await soundP : [], lab = near && has('label') && T.live() ? await labelEdge(T, node) : [];
    // One of each chosen edge first, so every type shows up; the rest wait for More.
    return [...(r && has('builton') ? lookBack(r.rec, r.work) : []), ...prod.slice(0, 1), ...sound.slice(0, 1), ...lab.slice(0, 1), ...cands, ...prod.slice(1), ...sound.slice(1), ...lab.slice(1)];
  })().catch(() => []);
}

// Third child: the first special candidate that resolves, else the next scene candidate. Leftovers wait for More.
async function special(T, node) {
  const cands = [...await candsOf(T, node)];
  if (!T.live()) return;
  while (node.kids < T.S.width && cands.length && T.live()) await tryAdd(T, node, cands.shift());
  node.pending.unshift(...cands); // leftovers wait for More
  await fill(T, node, T.S.width);
}

// ---------- flows ----------

// Root + its 3 children first (what the Dig view shows), then, in the background, each child's own 3 (so a Dig is instant).
// Children are prefetched one at a time: starting every lane at once would queue a listener's More behind ~10 MB calls.
// `background`: don't wait for the grandchildren (the handler returns, and the renderer stops "growing", at the first family).
async function growTree(T, { background = false } = {}) {
  const root = T.nodes[0];
  [root.mb, root.dzId] = await Promise.all([mbArtist(T.get, root.artist), root.dzId ?? dzArtist(T.get, root.artist, T.fans)]);
  root.mbid = root.mb && root.mb.id;
  claim(T, { mbid: root.mbid });
  if (!T.live()) return T;
  // The root's scene query goes first on the 1.5 s MB lane; its special lookups use the lane while that (slow) query runs.
  if (T.S.edges.includes('scene')) sceneOf(T, root);
  candsOf(T, root);
  await ranked(T, root);
  await fill(T, root, T.S.width - 1);
  const spec = special(T, root), deep = T.deep = prefetchTree(T, spec); // the kids' scene families share the MB lane with the root's special lookups
  await (background ? spec : deep);
  return T;
}

// Sweep 1 gives every child its scene family (about one MB call each) while the root's special child is still being looked up;
// sweep 2 adds each child's MB-heavy special third child.
async function prefetchTree(T, rootSpecial = Promise.resolve()) {
  const sweep = async step => {
    for (const c of kidsOf(T, T.nodes[0])) {
      if (!T.live()) return;
      c.prefP = step(c).catch(() => {}).finally(() => { c.prefP = null; });
      await c.prefP;
    }
  };
  const scene = async c => { await ranked(T, c); await fill(T, c, T.S.width - 1); };
  await sweep(scene);
  await rootSpecial.catch(() => {});
  await sweep(scene); // the root's special child, if it arrived meanwhile (a no-op for the others)
  await sweep(c => special(T, c));
}

// One rank per node; the promise is kept so a More during the prefetch waits for it instead of seeing an empty queue.
const ranked = (T, node) => node.rankP ??= rank(T, node).then(r => { node.pending.push(...r); });

const kidsOf = (T, node) => T.nodes.filter(n => n.parent === node.id);

// "More from this branch": up to 3 more children. The More-only edges come first, once: Built on, Same producer,
// Same label + era; then the leftover queue of the node's own scene.
async function moreTree(T, id) {
  const node = T.nodes[id];
  if (!node || T.nodes.length >= CAP) return { added: 0, full: T.nodes.length >= CAP };
  T.mbLeft = Math.max(T.mbLeft, 12); // a More is the listener asking: it gets its own few MB calls
  if (node.prefP) { // its family is still being fetched in the background: that is the answer to this More
    const before = node.kids;
    await node.prefP;
    if (node.kids > before) return { added: node.kids - before, full: T.nodes.length >= CAP };
  }
  if (!node.done.has('more')) {
    node.done.add('more');
    await ranked(T, node);
    const r = await recordingOf(T, node);
    const has = k => T.S.edges.includes(k); // an unchecked connection stays out of More too
    const built = r && has('builton') && node.depth > 0 ? lookBack(r.rec, r.work) : [];
    const prod = r && has('producer') ? await producerEdge(T, node, r.rec) : [];
    const lab = has('label') ? await labelEdge(T, node) : [], sound = has('soundtrack') ? await soundEdge(T, node) : [];
    node.pending = [...built, ...prod.slice(0, 1), ...sound.slice(0, 1), ...lab.slice(0, 1), ...node.pending, ...prod.slice(1), ...sound.slice(1), ...lab.slice(1)];
  }
  const start = T.nodes.length, f0 = T.fails;
  while (T.nodes.length - start < MORE && T.nodes.length < CAP && node.pending.length && T.live()) await tryAdd(T, node, node.pending.shift());
  const added = T.nodes.length - start;
  if (!added && T.fails > f0) { node.done.delete('more'); node.rankP = null; return { added, error: true }; } // offline: the next More tries again
  return { added, full: T.nodes.length >= CAP };
}

async function producerEdge(T, node, rec) {
  const p = (rec.relations || []).find(r => r.type === 'producer' && r.artist && r.artist.id !== node.mbid && norm(r.artist.name) !== norm(node.artist));
  if (!p) return [];
  const picks = await personTrail(T.get, p.artist.id, node.artist, [...T.heard]);
  return picks.map(x => ({ artist: x.artist, title: x.title, mbid: x.mbid, kind: 'producer', label: `Also produced by ${p.artist.name}` }));
}

async function labelEdge(T, node) {
  const rels = node.mbid ? await relsOf(T, node.mbid) : null; // cached by net.js since special()
  const l = ((rels && rels.relations) || []).find(r => r.type === 'recording contract' && r.label);
  const y = node.year || yearOf(((node.mb || {})['life-span'] || {}).begin);
  if (!l || !y) return [];
  const w = T.S.era === 'decade' ? [y - (y % 10), y - (y % 10) + 9] : T.S.era === 'any' ? null : [y - 2, y + 2]; // narrower than the scene's window: a label names a roster
  const q = `label:"${l.label.name.replace(/["\\]/g, ' ')}"${w ? ` AND date:[${w[0]} TO ${w[1]}]` : ''}`;
  const res = await T.get(`${MB}/release?query=${enc(q)}&limit=100&fmt=json`);
  const names = dedupe((res.releases || []).flatMap(r => (r['artist-credit'] || []).map(c => c.name)));
  return names.map(n => ({ artist: n, kind: 'label', label: `Also on ${l.label.name}${w ? `, ${w[0]}–${String(w[1]).slice(2)}` : ''}` }));
}

// Other artists on the song's soundtrack: its best pure-soundtrack release from the recording search, then that tracklist (1 more MB call).
function soundEdge(T, node) {
  return node.soundP ??= (async () => {
    const { recordings, artist, title } = await recSearch(T, node);
    const sound = bestSoundtrack(recordings, artist, title);
    if (!sound || !T.live()) return [];
    return soundtrackTracks(await T.get(`${MB}/release/${sound.id}?inc=recordings+artist-credits&fmt=json`), artist, sound);
  })().catch(() => []);
}

module.exports = { validSettings, fameOk, eraQuery, placeQuery, bestSoundtrack, soundtrackTracks, EDGES, SETTINGS, topTags, sceneGuard, sceneQuery, parseMembers, otherBands, lookBack, firstPerformer, originalRecording, newTree, songKey, growTree, prefetchTree, moreTree, CAP };
