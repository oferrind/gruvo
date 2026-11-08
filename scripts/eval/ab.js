#!/usr/bin/env node
// Blind in-app A/B (docs/21): Love rate per picker from a profile's listening log, with a 95% interval on the difference
// (Newcombe's hybrid Wilson score method) and seconds heard before a Skip. Read-only; prints aggregates only.
//   node scripts/eval/ab.js <profile.json> [more profiles...]   (several = pooled testers, one line each plus the pool)
const fs = require('fs');
const { parse } = require('../../src/store');

const wilson = (k, n, z = 1.96) => {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [c - h, c + h];
};
function diff(a, b) { // Newcombe (1998) method 10: interval for pA - pB
  const pa = a.love / a.n, pb = b.love / b.n, [la, ua] = wilson(a.love, a.n), [lb, ub] = wilson(b.love, b.n);
  return [pa - pb - Math.sqrt((pa - la) ** 2 + (ub - pb) ** 2), pa - pb + Math.sqrt((ua - pa) ** 2 + (pb - lb) ** 2)];
}
function stats(profile) {
  const ev = profile.events || [], heard = new Map();
  for (const e of ev) if (e.k === 'listen') heard.set(e.id, Math.max(heard.get(e.id) || 0, e.sec));
  const out = { ship: { n: 0, love: 0, skipSec: [] }, hyb: { n: 0, love: 0, skipSec: [] } };
  for (const e of ev) {
    const s = out[e.alg];
    if (e.k !== 'rate' || !s) continue;
    s.n++;
    if (e.v === 'love') s.love++;
    if (e.v === 'skip' && heard.has(e.id)) s.skipSec.push(heard.get(e.id));
  }
  return out;
}
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const line = (label, s) => {
  const r = k => `${s[k].love}/${s[k].n} (${s[k].n ? Math.round(100 * s[k].love / s[k].n) : 0}%)`;
  const [lo, hi] = s.ship.n && s.hyb.n ? diff(s.hyb, s.ship) : [NaN, NaN];
  return `${label}: new ${r('hyb')} vs old ${r('ship')}; difference ${s.hyb.n && s.ship.n ? ((s.hyb.love / s.hyb.n - s.ship.love / s.ship.n) * 100).toFixed(0) : 'n/a'} points, 95% CI [${(lo * 100).toFixed(0)}, ${(hi * 100).toFixed(0)}]; median s before a Skip: new ${median(s.hyb.skipSec).toFixed(1)}, old ${median(s.ship.skipSec).toFixed(1)}`;
};

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: node scripts/eval/ab.js <profile.json>...'); process.exit(2); }
const pool = { ship: { n: 0, love: 0, skipSec: [] }, hyb: { n: 0, love: 0, skipSec: [] } };
files.forEach((f, i) => {
  const s = stats(parse(fs.readFileSync(f, 'utf8')).profile);
  for (const k of ['ship', 'hyb']) { pool[k].n += s[k].n; pool[k].love += s[k].love; pool[k].skipSec.push(...s[k].skipSec); }
  console.log(line(files.length > 1 ? `tester ${i + 1}` : 'you', s));
});
if (files.length > 1) console.log(line('all testers', pool));
console.log('The new picker wins when the interval is wholly above 0 (docs/20: decide only at 60 rated mysteries per picker, set in advance).');
