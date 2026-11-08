// Baseline: a seeded random score per candidate id (same seed, same order).
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
module.exports = { name: 'random', score: (c, train, ctx) => hash(`${ctx.seed}:${c.id}`) };
