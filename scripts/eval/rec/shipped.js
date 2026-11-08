// The shipped Blind Test picker: 80% MusicBrainz artist-tag similarity + 20% sound closeness (renderer/features.js blend),
// each standardised against a window of candidates. Offline the window is the evaluation pool (the app uses ~80 recent candidates).
const F = require('../../../renderer/features');

// Loved-artist tag profile, as renderer/app.js lovedTags(): sum of the tags of the last 60 distinct loved artists (seeds have none).
function lovedTags(train) {
  const seen = new Map();
  for (const x of train.items) if (x.rating === 'love' && !x.seed && x.artist) { seen.delete(x.artist); seen.set(x.artist, x.tags); }
  const sum = {};
  for (const t of [...seen.values()].slice(-60)) for (const [k, v] of Object.entries(t || {})) sum[k] = (sum[k] || 0) + Math.max(0, v);
  return sum;
}
// Candidate -> {t, s} exactly as renderer/app.js tagScore() + observe() build c.sc.
function sc(c, prep) {
  const L = F.nearest(c.features, prep.ratings, 'love');
  return { t: c.tags && Object.keys(prep.mine).length ? F.tagCos(c.tags, prep.mine) : null, s: L ? -L.d : null };
}
const memo = new WeakMap();
function prepare(train, ctx) {
  if (!memo.has(train)) {
    const p = { mine: lovedTags(train), ratings: train.items };
    p.win = ctx.pool.map(c => sc(c, p));
    memo.set(train, p);
  }
  return memo.get(train);
}

module.exports = {
  name: 'shipped 80/20', sc, prepare,
  score: (c, train, ctx) => { const p = prepare(train, ctx); return F.blend(sc(c, p), p.win); },
};
