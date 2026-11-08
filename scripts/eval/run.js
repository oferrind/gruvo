#!/usr/bin/env node
// Offline evaluation harness (docs/20-success.md). Reads a profile JSON (read-only), scores every recommender under the
// pre-registered protocols, prints a table and writes aggregate JSON. Outputs and caches hold your artists: scripts/eval/out/ is git-ignored.
//   node scripts/eval/run.js <profile.json> [--cache dir] [--out dir] [--rec path.js]... [--reps 2000] [--seed 1] [--offline]
// A recommender is a module {name, score(candidate, train, ctx) -> number} or {name, rank(list, train, ctx) -> list best first}.
// candidate: {id, artist, tags, features, rank, fans} (no rating). train: {items: [...same + rating, seed]}. ctx: {pool, seed}.
const fs = require('fs');
const path = require('path');
const M = require('./metrics');
const F = require('../../renderer/features');
const { parse } = require('../../src/store');
const { norm, flows } = require('../../src/music');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const profilePath = args[0];
if (!profilePath || profilePath.startsWith('--')) { console.error('usage: node scripts/eval/run.js <profile.json> [--cache dir] [--out dir] [--rec file]...'); process.exit(2); }
const OUT = path.resolve(opt('--out', path.join(__dirname, 'out')));
const CACHE = path.resolve(opt('--cache', path.join(OUT, 'cache')));
const REPS = Number(opt('--reps', 2000)), SEED = Number(opt('--seed', 1)), K = 10, SPLIT = 0.7;
const BASE = ['random', 'popular', 'shipped', 'tags', 'sound'].map(n => path.join(__dirname, 'rec', `${n}.js`));
const recs = [...BASE, ...args.flatMap((a, i) => (args[i - 1] === '--rec' ? [path.resolve(a)] : []))].map(f => require(f));

// ---- data: profile ratings + artist, MusicBrainz tags (src/net.js cache + pacing) and Deezer popularity (own small cache).
async function load() {
  const { profile } = parse(fs.readFileSync(profilePath, 'utf8'));
  fs.mkdirSync(CACHE, { recursive: true });
  const net = require('../../src/net');
  const netFile = path.join(CACHE, 'net.json'), metaFile = path.join(CACHE, 'meta.json');
  net.initCache({ read: () => JSON.parse(fs.readFileSync(netFile, 'utf8')), write: t => fs.writeFileSync(netFile, t) });
  if (args.includes('--offline')) net.configure({ fetch: async () => { throw new Error('offline'); } });
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
  const deezer = async (key, url, pick) => {
    if (!(key in meta)) { const b = await net.get(url); if (!b || b.error) return null; meta[key] = pick(b); }
    return meta[key];
  };
  const likes = new Map(profile.likes.map(l => [`${l.source}:${l.id}`, l]));
  const items = [];
  for (const [t, r] of profile.ratings.entries()) {
    const like = likes.get(r.id), dz = /^dz:(\d+)$/.exec(r.id);
    const tr = dz ? await deezer(r.id, `https://api.deezer.com/track/${dz[1]}`, b => ({ artist: b.artist && b.artist.name, artistId: b.artist && b.artist.id, rank: b.rank })) : null;
    const artist = (like && like.artist) || (tr && tr.artist) || null, artistId = (like && like.artistDzId) ?? (tr && tr.artistId);
    const fans = artistId ? await deezer(`artist:${artistId}`, `https://api.deezer.com/artist/${artistId}`, b => b.nb_fan ?? null) : null;
    const tags = artist && !r.seed ? await flows.artistTags(net.get, artist).catch(() => null) : null;
    items.push({ id: r.id, t, rating: r.rating, seed: !!r.seed, features: r.features, artist: artist && norm(artist), tags, rank: tr ? tr.rank ?? null : null, fans: fans ?? null });
  }
  net.flushCache();
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  return items;
}

// ---- scoring
const strip = ({ rating, seed, t, ...c }) => c;
function scoreAll(rec, cands, train, ctx) {
  if (!rec.rank) return cands.map(c => rec.score(strip(c), train, ctx));
  const pos = new Map(rec.rank(ctx.pool, train, ctx).map((c, i) => [c.id, i]));
  return cands.map(c => -pos.get(c.id));
}
// Leave-one-out: each rated item scored by a model trained on all the others (fair: minus every item by the same artist).
function loo(rec, rated, seeds, fair) {
  const pool = rated.map(strip);
  return rated.map(x => {
    const train = { items: [...seeds, ...rated.filter(y => y !== x && !(fair && x.artist && y.artist === x.artist))] };
    return scoreAll(rec, [x], train, { pool, seed: SEED })[0];
  });
}
// Time split: train on the oldest 70% of ratings (plus onboarding seeds), score the newest 30%.
function timed(rec, rated, seeds) {
  const { train, test } = M.timeSplit(rated, SPLIT);
  return { test, train, scores: scoreAll(rec, test, { items: [...seeds, ...train] }, { pool: test.map(strip), seed: SEED }) };
}

// ---- metrics over index samples (idx: indices into items/scores)
const REL = { love: 2, ok: 1, skip: 0 };
const lfans = x => Math.log10(x.fans + 1);
function ratingMetrics(items, scores, order) {
  const by = (idx, f) => idx.filter(i => f(items[i])).map(i => scores[i]);
  return {
    'AUC love v skip': idx => M.auc(by(idx, x => x.rating === 'love'), by(idx, x => x.rating === 'skip')),
    'AUC love v rest': idx => M.auc(by(idx, x => x.rating === 'love'), by(idx, x => x.rating !== 'love')),
    'NDCG@10': idx => { const pos = new Map(order.map((i, p) => [i, p])); return M.ndcg(idx.slice().sort((a, b) => pos.get(a) - pos.get(b)).map(i => ({ score: scores[i], rel: REL[items[i].rating] })), K); },
  };
}
// List metrics on the top-10 of the (resampled) test pool. Novel = artist not rated before the split.
function listMetrics(items, scores, order, trainArtists) {
  const top = idx => {
    const pos = new Map(order.map((i, p) => [i, p])), seen = new Set();
    return idx.slice().sort((a, b) => scores[b] - scores[a] || pos.get(a) - pos.get(b)).filter(i => !seen.has(i) && seen.add(i)).slice(0, K).map(i => items[i]);
  };
  const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  return {
    'novel artist share': idx => { const l = top(idx).filter(x => x.artist); return l.length ? l.filter(x => !trainArtists.has(x.artist)).length / l.length : NaN; },
    'mean log10 fans': idx => mean(top(idx).filter(x => x.fans != null).map(lfans)),
    'mean Deezer rank': idx => mean(top(idx).filter(x => x.rank != null).map(x => x.rank)),
    'distinct artists': idx => { const l = top(idx).filter(x => x.artist); return l.length ? new Set(l.map(x => x.artist)).size / l.length : NaN; },
    'tag ILD': idx => M.ild(top(idx).filter(x => x.tags).map(x => x.tags), F.tagCos),
  };
}
// Popularity bias: rank correlation of score with log artist fans over the whole pool (not a top-k statistic, so it gets a CI).
const popBias = (items, scores) => ({ 'pop bias rho': idx => { const k = idx.filter(i => items[i].fans != null); return M.spearman(k.map(i => scores[i]), k.map(i => lfans(items[i]))); } });

// factory(scores) -> {metric: stat(idx)}. Each cell: estimate, 95% CI, and the paired difference vs the shipped picker
// (same bootstrap resamples for both, since the seed fixes the index draws).
// ci false: point estimates only (a top-10 statistic is biased under resampling with duplicates, so its percentile CI is not valid).
function evaluate(n, scoresByRec, factory, ci = true) {
  const out = {}, ship = factory(scoresByRec['shipped 80/20']), all = [...Array(n).keys()];
  const boot = stat => (ci ? M.bootstrap(n, stat, { reps: REPS, seed: SEED }) : { est: stat(all), lo: NaN, hi: NaN });
  for (const [rec, s] of Object.entries(scoresByRec)) {
    for (const [name, m] of Object.entries(factory(s))) {
      const b = boot(m);
      const d = rec === 'shipped 80/20' ? null : boot(idx => m(idx) - ship[name](idx));
      (out[name] ||= {})[rec] = { est: b.est, lo: b.lo, hi: b.hi, n, ...(d && { diff: { est: d.est, lo: d.lo, hi: d.hi } }) };
    }
  }
  return out;
}

(async () => {
  const all = await load();
  const seeds = all.filter(x => x.seed), rated = all.filter(x => !x.seed);
  const tagged = rated.filter(x => x.tags);
  const r = M.rng(SEED), shuffle = n => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const count = xs => Object.fromEntries(['love', 'ok', 'skip'].map(k => [k, xs.filter(x => x.rating === k).length]));
  const data = { n: rated.length, ...count(rated), seeds: seeds.length, withArtist: rated.filter(x => x.artist).length, tagged: tagged.length, withFans: rated.filter(x => x.fans != null).length };
  const results = {};
  const rate = (label, items, scoreFn) => {
    const order = shuffle(items.length), s = Object.fromEntries(recs.map(rec => [rec.name, scoreFn(rec)]));
    results[label] = { n: items.length, ...count(items), metrics: evaluate(items.length, s, sc => ratingMetrics(items, sc, order)) };
    return { order, s };
  };
  rate('LOO fair (primary)', rated, rec => loo(rec, rated, seeds, true));
  rate('LOO fair, tagged only', tagged, rec => loo(rec, tagged, seeds, true));
  rate('LOO same-artist allowed', rated, rec => loo(rec, rated, seeds, false));
  // Time split: rating metrics plus list metrics on the top-10 of the newest 30%.
  const { test, train } = M.timeSplit(rated, SPLIT), trainArtists = new Set(train.map(x => x.artist).filter(Boolean));
  const { order, s } = rate('time split 70/30', test, rec => timed(rec, rated, seeds).scores);
  Object.assign(results['time split 70/30'].metrics, evaluate(test.length, s, sc => popBias(test, sc)),
    evaluate(test.length, s, sc => listMetrics(test, sc, order, trainArtists), false));

  // ---- report
  const f = v => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : 'n/a');
  const names = recs.map(x => x.name);
  console.log(`ratings n=${data.n} (love ${data.love} / ok ${data.ok} / skip ${data.skip}), seeds ${data.seeds}, artist known ${data.withArtist}, tagged ${data.tagged}, Deezer fans ${data.withFans}; bootstrap ${REPS} reps, seed ${SEED}\n`);
  for (const [label, res] of Object.entries(results)) {
    console.log(`## ${label}: n=${res.n} (love ${res.love} / ok ${res.ok} / skip ${res.skip})`);
    console.log(['metric', ...names].join(' | '));
    for (const [m, row] of Object.entries(res.metrics))
      console.log([m, ...names.map(n => { const c = row[n], d = c.diff, ci = x => (Number.isFinite(x.lo) ? ` [${f(x.lo)}, ${f(x.hi)}]` : '');
        return `${f(c.est)}${ci(c)}${d ? ` d${f(d.est)}${ci(d)}` : ''}`; })].join(' | '));
    console.log('');
  }
  console.log('d = paired bootstrap difference vs shipped 80/20. Catalogue coverage: not measured offline (needs the candidate pool / event log).');
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `eval-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ date: new Date().toISOString(), reps: REPS, seed: SEED, k: K, split: SPLIT, data, results }, null, 1));
  console.log(`wrote ${file}`);
})().catch(e => { console.error(e); process.exit(1); });
