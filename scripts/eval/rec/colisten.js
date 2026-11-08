// Reference: co-listening similarity alone (renderer/colisten.js). Artists missing from the table rank below every known one.
const C = require('./colisten-table');
const memo = new WeakMap();
function prep(train) {
  if (!memo.has(train)) {
    const by = r => C.indices(train.items.filter(x => x.rating === r && x.artist).map(x => x.artist));
    memo.set(train, { love: by('love'), skip: by('skip') });
  }
  return memo.get(train);
}
module.exports = { name: 'co-listening', score: (c, train) => { const p = prep(train); return C.score(c.artist, p.love, p.skip) ?? -1; } };
