#!/usr/bin/env node
// Builds renderer/genre-data.js (docs/12 §4.5): every MusicBrainz genre that plays live becomes a genre-only stamp.
// Run by hand, never in CI. Resumable: progress is saved after every genre to scripts/.genre-verify.json.
//   node scripts/build-genre-stamps.js [--no-itunes] [--only "zeuhl,gqom"] [--limit N] [--fresh]
// MB pacing (1.5 s) comes from src/net.js; this script adds no extra network path except one Wikidata SPARQL call.
const fs = require('fs');
const path = require('path');

const UA = 'MusicDiscovery/0.1 (you@example.com)';
const CHECKPOINT = path.join(__dirname, '.genre-verify.json');
const OUT = path.join(__dirname, '..', 'renderer', 'genre-data.js');
const MIN_SONGS = 6; // ≥6 playable on one fetch: margin above the runtime threshold of 5

// Not music (docs/12 §1).
const BLOCK = new Set(['asmr', "children's music", 'christmas music', 'field recording', 'guided meditation', 'interview', 'sound effects', 'spoken word']);
const blocked = name => BLOCK.has(name.toLowerCase()) || /\bcomedy\b/i.test(name);

// Family roots by MB genre slug, in priority order (a tie at the same depth goes to the earlier family).
const ROOTS = { rock: ['rock'], metal: ['heavy-metal', 'metal'], punk: ['punk', 'punk-rock'], pop: ['pop'], electronic: ['electronic', 'electronica'],
  'hip-hop': ['hip-hop', 'rap'], 'rnb-soul': ['rhythm-and-blues', 'soul', 'r-b'], jazz: ['jazz'], blues: ['blues'], folk: ['folk'], country: ['country'],
  reggae: ['reggae'], latin: ['latin'], classical: ['classical', 'classical-music'], experimental: ['experimental'], ambient: ['ambient'] };

// ---------- pure helpers (tested) ----------
const slugify = name => String(name).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const tierOf = n => (n >= 1000 ? 'C' : n >= 100 ? 'D' : 'O'); // MB recordings with the tag: Common / Deep / Obscure

// [{name}] -> [{name, slug}] with non-music and empty/duplicate slugs dropped (first wins).
function dedupe(genres) {
  const seen = new Set();
  return genres.filter(g => !blocked(g.name)).map(g => ({ ...g, slug: slugify(g.name) })).filter(g => g.slug && !seen.has(g.slug) && seen.add(g.slug));
}
// Nearest family root over the parent graph (slug -> [parent slugs]). BFS with a visited set: Wikidata has cycles.
function familyOf(slug, parents, roots = ROOTS) {
  const rootOf = new Map(Object.entries(roots).flatMap(([f, slugs]) => slugs.map(s => [s, f])));
  const order = Object.keys(roots);
  const seen = new Set([slug]);
  let level = [slug];
  while (level.length) {
    const found = level.filter(s => rootOf.has(s)).map(s => rootOf.get(s));
    if (found.length) return found.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    level = level.flatMap(s => parents[s] || []).filter(p => !seen.has(p) && seen.add(p));
  }
  return 'other';
}
// First ancestor (following first parents, cycle-safe) that is in `keep`, else ''.
function parentOf(slug, parents, keep) {
  const seen = new Set([slug]);
  for (let p = (parents[slug] || [])[0]; p && !seen.has(p); p = (parents[p] || [])[0]) {
    if (keep.has(p)) return p;
    seen.add(p);
  }
  return '';
}

// ---------- network ----------
async function fetchGenres(get) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const r = await get(`https://musicbrainz.org/ws/2/genre/all?fmt=json&limit=100&offset=${offset}`, { fresh: true });
    if (r.error) throw new Error(`MB genre list failed at ${offset}: ${JSON.stringify(r.error)}`);
    all.push(...r.genres);
    if (!r.genres.length || all.length >= r['genre-count']) return all;
  }
}
// MB genre id -> parent MB genre ids, from Wikidata P8052 (MB genre id) + P279 (subclass of).
async function fetchParents() {
  const q = 'SELECT ?mb ?pmb WHERE { ?g wdt:P8052 ?mb . OPTIONAL { ?g wdt:P279 ?p . ?p wdt:P8052 ?pmb } }';
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata SPARQL failed: ${res.status}`);
  const map = {};
  for (const b of (await res.json()).results.bindings) if (b.pmb) (map[b.mb.value] ||= []).push(b.pmb.value);
  return map;
}

// ---------- checkpoint + output ----------
const load = () => { try { return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')); } catch { return null; } };
function save(state) { fs.writeFileSync(`${CHECKPOINT}.tmp`, JSON.stringify(state)); fs.renameSync(`${CHECKPOINT}.tmp`, CHECKPOINT); }

// state.done[slug] = {n, mb, a:[top artists]} (kept when n >= MIN_SONGS) or {n, drop:'thin'}. Returns the genre-data.js text and a summary.
function render(state, date = new Date().toISOString().slice(0, 10)) {
  const kept = state.genres.filter(g => (state.done[g.slug] || {}).n >= MIN_SONGS).sort((a, b) => a.name.localeCompare(b.name));
  const keep = new Set(kept.map(g => g.slug));
  const rows = kept.map(g => {
    const d = state.done[g.slug];
    return [g.slug, g.name, familyOf(g.slug, state.parents), tierOf(d.mb), parentOf(g.slug, state.parents, keep), d.n, d.a.map(a => a.replace(/\|/g, ' ')).join('|')];
  });
  const text = `// generated by scripts/build-genre-stamps.js on ${date}; do not edit. MB genres CC0, Wikidata CC0.\n(function (root) {\nconst D = [\n${rows.map(r => `${JSON.stringify(r)},`).join('\n')}\n];\n`
    + `if (typeof module === 'object' && module.exports) module.exports = D; else root.GENRE_DATA = D;\n})(this);\n`;
  const by = (i) => rows.reduce((o, r) => ((o[r[i]] = (o[r[i]] || 0) + 1), o), {});
  const drops = state.genres.filter(g => state.done[g.slug] && !keep.has(g.slug)).map(g => `${g.name} (${state.done[g.slug].n} songs)`);
  return { text, total: rows.length, tiers: by(3), families: by(2), drops, pending: state.genres.filter(g => !state.done[g.slug]).length };
}

// ---------- main ----------
async function main(argv) {
  const arg = k => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };
  const net = require('../src/net');
  const { stampSongs } = require('../src/stamps');
  let get = net.get;
  if (argv.includes('--no-itunes')) get = url => (url.includes('itunes.apple.com') ? Promise.resolve({ results: [] }) : net.get(url)); // iTunes paces at 3 s
  let state = argv.includes('--fresh') ? null : load();
  if (!state) {
    console.log('Fetching the MusicBrainz genre list and the Wikidata parent tree...');
    const list = await fetchGenres(net.get), wd = await fetchParents();
    const genres = dedupe(list.map(g => ({ id: g.id, name: g.name })));
    const slugOf = Object.fromEntries(genres.map(g => [g.id, g.slug]));
    const parents = {};
    for (const g of genres) parents[g.slug] = (wd[g.id] || []).map(id => slugOf[id]).filter(s => s && s !== g.slug);
    state = { v: 1, genres, parents, done: {} };
    save(state);
  }
  const only = arg('--only') && new Set(arg('--only').split(',').map(s => s.trim().toLowerCase()));
  let todo = state.genres.filter(g => !state.done[g.slug] && (!only || only.has(g.name.toLowerCase()) || only.has(g.slug)));
  if (arg('--limit')) todo = todo.slice(0, Number(arg('--limit')));
  console.log(`${state.genres.length} genres, ${Object.keys(state.done).length} already checked, ${todo.length} to check now.`);
  let errors = 0;
  for (const [i, g] of todo.entries()) {
    const names = [];
    let stuck = false, timer;
    const watchdog = new Promise(r => { timer = setTimeout(() => { stuck = true; r({ error: true }); }, 4 * 60 * 1000); }); // a hung genre must not stall a whole night
    const res = await Promise.race([stampSongs(get, { id: `--${g.slug}`, decade: null, cc: '', genre: g.slug, tags: [g.name] },
      { live: () => !stuck, emit: row => { if (!names.includes(row.artist)) names.push(row.artist); } }), watchdog]);
    clearTimeout(timer);
    if (!res) { console.log(`[${i + 1}/${todo.length}] ${g.name}: cancelled`); continue; }
    if (res.error) { // network trouble: not recorded, so the next run retries it
      console.log(`[${i + 1}/${todo.length}] ${g.name}: network error`);
      if (++errors >= 5) { console.error('5 errors in a row; stopping. Run again to resume.'); break; }
      continue;
    }
    errors = 0;
    state.done[g.slug] = res.thin ? { n: res.count, drop: 'thin' } : { n: res.count, mb: res.mbCount, a: names.slice(0, 3) };
    save(state);
    console.log(`[${i + 1}/${todo.length}] ${g.name}: ${res.count} songs${res.thin ? ' (dropped, thin)' : ''}`);
  }
  const out = render(state);
  fs.writeFileSync(OUT, out.text);
  console.log(`\nWrote ${path.relative(process.cwd(), OUT)}: ${out.total} genre stamps (${out.pending} genres not checked yet).`);
  console.log('Tiers', out.tiers, '\nFamilies', out.families, `\nDropped (${out.drops.length}):`, out.drops.join('; '));
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
module.exports = { slugify, tierOf, dedupe, familyOf, parentOf, render, blocked, ROOTS };
