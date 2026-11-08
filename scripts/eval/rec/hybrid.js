// Hybrid picker (docs/21): tag + sound + co-listening z-scores, weights learned per fold with LambdaRank (Features.learnWeights).
// Each training item's features are computed without its own artist, as a fresh candidate would see them, so the learned weights
// are not inflated by an item matching itself. HYBRID_LEARN=0 scores with the prior weights only.
const F = require('../../../renderer/features');
const C = require('./colisten-table');
const REL = { love: 2, ok: 1, skip: 0 };
const PRIOR = { t: 0.8, s: 0.2, c: Number(process.env.HYBRID_PRIOR_C ?? 0.5), g: Number(process.env.HYBRID_PRIOR_G ?? 0) };
const LEARN = process.env.HYBRID_LEARN !== '0';

function features(c, items) {
  const loved = items.filter(x => x.rating === 'love' && !x.seed && x.artist);
  const mine = {}, seen = new Map();
  for (const x of loved) { seen.delete(x.artist); seen.set(x.artist, x.tags); }
  for (const t of [...seen.values()].slice(-60)) for (const [k, v] of Object.entries(t || {})) mine[k] = (mine[k] || 0) + Math.max(0, v);
  const L = F.nearest(c.features, items, 'love');
  const ix = r => C.indices(items.filter(x => x.rating === r && x.artist).map(x => x.artist));
  const lv = ix('love');
  return { t: c.tags && Object.keys(mine).length ? F.tagCos(c.tags, mine) : null, s: L ? -L.d : null, c: C.score(c.artist, lv, ix('skip')), g: C.graphScore(c.artist, lv) };
}
const memo = new WeakMap();
function prepare(train) {
  if (!memo.has(train)) {
    const rated = train.items.filter(x => !x.seed);
    const raw = rated.map(x => features(x, train.items.filter(y => y !== x && !(x.artist && y.artist === x.artist))));
    const rows = raw.map((f, i) => ({ x: F.zs(f, raw), rel: REL[rated[i].rating] }));
    memo.set(train, { win: raw, w: LEARN ? F.learnWeights(rows, PRIOR) : PRIOR });
  }
  return memo.get(train);
}
module.exports = {
  name: LEARN ? 'hybrid learned' : 'hybrid prior', prepare, features, PRIOR,
  score: (c, train) => { const p = prepare(train); return F.blendW(features(c, train.items), p.win, p.w); },
};
