// Family Tree (docs/05-song-tree-spec.md): a small explained tree of songs around one root song.
// Like src/music.js, everything takes `get(url)` so tests can feed recorded JSON. Runs in main; nodes stream out via `emit`.
const COUNTRIES = require('./countries');
const { norm, soleArtist, sharedNames, personTrail, dedupe, flows: { resolvePreview } } = require('./music');

const DZ = 'https://api.deezer.com';
const MB = 'https://musicbrainz.org/ws/2';
const WD = 'https://www.wikidata.org/w/api.php';
const enc = encodeURIComponent;
const CAP = 60, KIDS = 3, MAX_ROOTS = 2;
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

function sceneQuery(a) {
  const b = yearOf((a['life-span'] || {}).begin);
  return [`tag:"${topTags(a)[0]}"`, b && `begin:[${b - 6} TO ${b + 4}]`, a.country && `country:${a.country}`, a.type === 'Group' && 'type:group']
    .filter(Boolean).join(' AND ');
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
      out.push({ title: r.work.title, kind: 'builton' });
  }
  return out;
}

// Earliest dated studio recording with this exact title: Saved can hold a 2025 live version, the tree wants the original.
function originalRecording(recs, artist, title) {
  const ok = (recs || []).filter(r => norm(r.title) === norm(title) && r['first-release-date']
    && !/\b(live|demo|remix|edit|version|acoustic)\b/i.test(r.disambiguation || '')
    && (r['artist-credit'] || []).some(c => norm(c.name) === norm(artist)));
  return ok.sort((a, b) => a['first-release-date'].localeCompare(b['first-release-date']))[0] || null;
}

// ---------- tree state ----------

function newTree(get, root, { emit = () => {}, live = () => true, heard = [] } = {}) {
  const T = { get, emit, live, heard: new Set(heard), nodes: [], used: new Set(), roots: 0, scene: [], tag: null };
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
  if (parent) parent.kids++;
  T.emit({ id: n.id, parentId: n.parent, depth: n.depth, edgeType: parent ? c.kind : 'root', label: n.label, track });
  return n;
}

// ---------- network steps (each skips its edge on failure, never fails the tree) ----------

// Exact-name Deezer artist; two different artists with that name = can't tell which was meant, so none ("Cast", "Gene").
async function dzArtist(get, name) {
  const res = await get(`${DZ}/search/artist?q=${enc(`artist:"${name}"`)}&limit=10`);
  const exact = (res.data || []).filter(a => norm(a.name) === norm(name)).sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0));
  // Deezer keeps dead duplicate entries (a second "Beady Eye" with 2 fans): a 100x lead still means one real artist.
  if (exact.length > 1 && (exact[0].nb_fan || 0) >= 100 * Math.max(1, exact[1].nb_fan || 0)) return exact[0].id;
  const hit = soleArtist(exact, name, a => a.name, a => a.id);
  return hit.length ? hit[0].id : null;
}

const dzTrack = r => r && { source: 'dz', id: r.id, artist: r.artist.name, artistDzId: r.artist.id,
  cover: r.album && r.album.cover_medium, albumId: r.album && r.album.id, previewUrl: r.preview,
  title: (r.title_short || r.title).replace(/\s*[([-][^)\]]*remaster[^)\]]*[)\]]?\s*$/i, '') || r.title }; // "Beautiful Ones (Remastered)"

// First top track with a preview that isn't a live/remix/demo cut.
async function topTrack(get, dzId) {
  const res = await get(`${DZ}/artist/${enc(dzId)}/top?limit=10`);
  return dzTrack((res.data || []).find(t => t.preview && !/\b(live|remix|demo|version)\b/i.test(t.title)));
}

// A work we only know by title ("based on" carries no performer): the most popular exact-title track.
// shortcut: a famous same-title song by someone else can win; resolve the work's first recording on MB if that shows up.
async function songByTitle(get, title) {
  const res = await get(`${DZ}/search?q=${enc(`track:"${title}"`)}&limit=10`);
  return dzTrack((res.data || []).filter(r => r.preview && norm(r.title_short || r.title) === norm(title)).sort((a, b) => (b.rank || 0) - (a.rank || 0))[0]);
}

const related = async (get, dzId) => dzId == null ? [] : ((await get(`${DZ}/artist/${enc(dzId)}/related?limit=25`)).data || []);

// MB artist by exact name (root, influences). `like` = a parent row the hit must share a top tag or country with.
async function mbArtist(get, name, like) {
  const res = await get(`${MB}/artist?query=${enc(`artist:"${name.replace(/["\\]/g, ' ')}"`)}&limit=3&fmt=json`);
  const a = (res.artists || []).find(r => norm(r.name) === norm(name));
  if (!a || (like && !(a.country === like.country || topTags(a).some(t => topTags(like).includes(t))))) return null;
  return a;
}

const mbRels = (get, mbid) => get(`${MB}/artist/${mbid}?inc=artist-rels+url-rels+label-rels+tags&fmt=json`);

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

// Ranked scene candidates for `node`: in the root's scene list, boosted when the node's fans also play them.
async function rank(T, node) {
  const rel = await related(T.get, node.dzId);
  const relBy = new Map(rel.map(a => [norm(a.name), a]));
  if (!T.scene.length) return fallback(T, node, rel);
  return T.scene.map(a => {
    const r = relBy.get(norm(a.name));
    const heard = T.heard.has(norm(a.name)) || (r && T.heard.has(`dz:${r.id}`));
    const score = (r ? 3 : 2) + (a.score || 0) / 100 - (heard ? 0.5 : 0);
    return { artist: a.name, mbid: a.id, mb: a, dzId: r ? r.id : undefined, kind: 'scene', score,
      label: sceneLabel(T.tag, a, r && node.artist) };
  }).sort((a, b) => b.score - a.score);
}

// No tags, no scene: the node's Deezer neighbours whose start year is within 8 years of the node's (at most 3 MB checks).
async function fallback(T, node, rel) {
  const b = yearOf(((node.mb || {})['life-span'] || {}).begin);
  if (!b) return [];
  const out = [];
  for (const r of rel.filter(x => !taken(T, { artist: x.name, dzId: x.id })).slice(0, 3)) {
    const a = await mbArtist(T.get, r.name);
    const y = a && yearOf((a['life-span'] || {}).begin);
    if (y && Math.abs(y - b) <= 8) out.push({ artist: r.name, dzId: r.id, mbid: a.id, mb: a, kind: 'related', label: `Same era · fans of ${node.artist} play them too` });
  }
  return out;
}

// Turns a candidate into a child node. Claims first so a concurrent More can't add the same artist.
async function tryAdd(T, node, c) {
  if (T.nodes.length >= CAP || !T.live() || taken(T, c) || (c.kind === 'roots' && T.roots >= MAX_ROOTS)) return null;
  claim(T, c);
  let track;
  if (c.title && !c.artist) {
    track = await songByTitle(T.get, c.title);
    if (track) c.label = `Built on ${track.artist}'s “${c.title}”`;
  } else if (c.title) {
    track = await resolvePreview(T.get, c.artist, c.title, true);
  } else {
    const dzId = c.dzId ?? await dzArtist(T.get, c.artist);
    if (dzId == null || (c.dzId == null && T.used.has(`dz:${dzId}`))) return null;
    T.used.add(`dz:${dzId}`);
    track = await topTrack(T.get, dzId);
  }
  if (!track || !T.live() || (taken(T, { artist: track.artist }) && norm(track.artist) !== norm(c.artist))) return null;
  claim(T, { artist: track.artist, dzId: track.artistDzId });
  if (c.kind === 'roots') T.roots++;
  return addNode(T, node, track, c);
}

async function fill(T, node, n) {
  while (node.kids < n && node.pending.length && T.live()) await tryAdd(T, node, node.pending.shift());
}

// The original recording, its producers and what it looks back on. Cached per node (MB calls are 1.5 s each).
async function recordingOf(T, node) {
  if (node.done.has('rec')) return node.rec;
  node.done.add('rec');
  const { artist } = node.track;
  const title = node.track.title.replace(/\s*[([][^)\]]*[)\]]|\s+-\s+.*$/g, '').trim() || node.track.title; // "Wonderwall (Live from Dublin)" -> "Wonderwall"
  const q = `recording:"${title.replace(/["\\]/g, ' ')}" AND artist:"${artist.replace(/["\\]/g, ' ')}"`;
  const hit = originalRecording((await T.get(`${MB}/recording?query=${enc(q)}&limit=10&fmt=json`)).recordings, artist, title);
  if (!hit) return (node.rec = null);
  const rec = await T.get(`${MB}/recording/${hit.id}?inc=work-rels+recording-rels+artist-rels+artist-credits&fmt=json`);
  if (rec.error) return (node.rec = null);
  const perf = (rec.relations || []).find(r => r.type === 'performance' && r.work);
  const work = perf ? await T.get(`${MB}/work/${perf.work.id}?inc=work-rels&fmt=json`) : null;
  node.year = yearOf(hit['first-release-date']);
  return (node.rec = { rec, work: work && !work.error ? work : null });
}

// Third child: Built on (root only) > Member moved > Roots, else the next scene candidate. Leftovers wait for More.
async function special(T, node) {
  const cands = [];
  if (node.depth === 0) { const r = await recordingOf(T, node); if (r) cands.push(...lookBack(r.rec, r.work)); }
  if (!T.live()) return;
  if (!node.mbid && !node.mb) { const a = await mbArtist(T.get, node.artist, T.nodes[0].mb); if (a) { node.mb = a; node.mbid = a.id; } }
  const rels = node.mbid ? await mbRels(T.get, node.mbid) : null;
  if (rels && !rels.error) {
    node.mb = node.mb || rels;
    const band = { id: node.mbid, begin: yearOf(((node.mb || rels)['life-span'] || {}).begin) };
    const members = parseMembers(rels.relations);
    members.forEach(m => claim(T, { artist: m.name })); // "Liam Gallagher" never shows up under Oasis
    for (const m of members.slice(0, node.depth === 0 ? 2 : 1)) {
      if (!T.live()) return;
      const mr = await T.get(`${MB}/artist/${m.id}?inc=artist-rels&fmt=json`);
      cands.push(...otherBands(mr.relations, m, band));
    }
    if (T.roots < MAX_ROOTS) {
      const inf = (await influences(T.get, rels)).filter(n => !taken(T, { artist: n }));
      if (inf[0]) cands.push({ artist: inf[0], kind: 'roots', label: `${node.artist} named ${inf[0]} as an influence` });
    }
  }
  while (node.kids < KIDS && cands.length && T.live()) await tryAdd(T, node, cands.shift());
  node.pending.unshift(...cands); // leftovers wait for More
  await fill(T, node, KIDS);
}

// ---------- flows ----------

// Root -> 3 children -> 3 grandchildren each, streamed. Scene children first (fast), the MB-heavy special slots after.
async function growTree(T) {
  const root = T.nodes[0];
  root.mb = await mbArtist(T.get, root.artist);
  root.mbid = root.mb && root.mb.id;
  claim(T, { mbid: root.mbid });
  if (root.dzId == null) root.dzId = await dzArtist(T.get, root.artist);
  if (!T.live()) return T;
  if (root.mb && topTags(root.mb).length) {
    T.tag = topTags(root.mb)[0];
    const res = await T.get(`${MB}/artist?query=${enc(sceneQuery(root.mb))}&limit=50&fmt=json`);
    const rows = (res.artists || []).filter(a => a.id !== root.mbid && sceneGuard(root.mb, a));
    const shared = sharedNames(rows, rows.map(a => a.name)); // two scene artists with one name: can't tell them apart on Deezer
    T.scene = rows.filter(a => !shared.has(norm(a.name)));
  }
  if (!T.live()) return T;
  await ranked(T, root);
  await fill(T, root, 2);
  for (const c of kidsOf(T, root)) { await ranked(T, c); await fill(T, c, 2); }
  await special(T, root);
  for (const c of kidsOf(T, root)) {
    if (!T.live()) break;
    await ranked(T, c);
    await fill(T, c, 2);
    await special(T, c);
  }
  return T;
}

async function ranked(T, node) {
  if (node.done.has('ranked')) return;
  node.done.add('ranked');
  node.pending.push(...await rank(T, node));
}

const kidsOf = (T, node) => T.nodes.filter(n => n.parent === node.id);

// "More from this branch": up to 3 more children. The More-only edges come first, once: Built on, Same producer,
// Same label + era; then the leftover scene queue; then the node's own scene query.
async function moreTree(T, id) {
  const node = T.nodes[id];
  if (!node || T.nodes.length >= CAP) return { added: 0, full: T.nodes.length >= CAP };
  if (!node.done.has('more')) {
    node.done.add('more');
    await ranked(T, node);
    const r = await recordingOf(T, node);
    const built = r && node.depth > 0 ? lookBack(r.rec, r.work) : [];
    const prod = r ? await producerEdge(T, node, r.rec) : [];
    const lab = await labelEdge(T, node);
    node.pending = [...built, ...prod.slice(0, 1), ...lab.slice(0, 1), ...node.pending, ...prod.slice(1), ...lab.slice(1)];
  }
  const start = T.nodes.length;
  while (T.nodes.length - start < KIDS && T.nodes.length < CAP && T.live()) {
    if (!node.pending.length) {
      if (node.done.has('ownScene')) break;
      node.done.add('ownScene');
      node.pending = await ownScene(T, node);
      continue;
    }
    await tryAdd(T, node, node.pending.shift());
  }
  return { added: T.nodes.length - start, full: T.nodes.length >= CAP };
}

async function producerEdge(T, node, rec) {
  const p = (rec.relations || []).find(r => r.type === 'producer' && r.artist && r.artist.id !== node.mbid && norm(r.artist.name) !== norm(node.artist));
  if (!p) return [];
  const picks = await personTrail(T.get, p.artist.id, node.artist, [...T.heard]);
  return picks.map(x => ({ artist: x.artist, title: x.title, mbid: x.mbid, kind: 'producer', label: `Also produced by ${p.artist.name}` }));
}

async function labelEdge(T, node) {
  const rels = node.mbid ? await mbRels(T.get, node.mbid) : null; // cached by net.js since special()
  const l = ((rels && rels.relations) || []).find(r => r.type === 'recording contract' && r.label);
  const y = node.year || yearOf(((node.mb || {})['life-span'] || {}).begin);
  if (!l || !y) return [];
  const q = `label:"${l.label.name.replace(/["\\]/g, ' ')}" AND date:[${y - 2} TO ${y + 2}]`;
  const res = await T.get(`${MB}/release?query=${enc(q)}&limit=100&fmt=json`);
  const names = dedupe((res.releases || []).flatMap(r => (r['artist-credit'] || []).map(c => c.name)));
  return names.map(n => ({ artist: n, kind: 'label', label: `Also on ${l.label.name}, ${y - 2}–${String(y + 2).slice(2)}` }));
}

async function ownScene(T, node) {
  if (!node.mb || !topTags(node.mb).length) return [];
  const res = await T.get(`${MB}/artist?query=${enc(sceneQuery(node.mb))}&limit=50&fmt=json`);
  const tag = topTags(node.mb)[0];
  return (res.artists || []).filter(a => sceneGuard(node.mb, a))
    .map(a => ({ artist: a.name, mbid: a.id, mb: a, kind: 'scene', label: sceneLabel(tag, a) }));
}

module.exports = { topTags, sceneGuard, sceneQuery, parseMembers, otherBands, lookBack, originalRecording, newTree, growTree, moreTree, CAP };
