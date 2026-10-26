// Read-only: per-picker results of the blind taste experiment. Usage: node scripts/ab-report.js path/to/profile.json
const fs = require('fs');

const lg = n => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
const lchoose = (n, k) => lg(n) - lg(k) - lg(n - k);
// Two-sided Fisher exact test on [[a, b], [c, d]]: sum of table probabilities not above the observed one.
function fisher(a, b, c, d) {
  const r1 = a + b, c1 = a + c, n = a + b + c + d;
  const p = x => Math.exp(lchoose(r1, x) + lchoose(n - r1, c1 - x) - lchoose(n, c1));
  const p0 = p(a);
  let sum = 0;
  for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) if (p(x) <= p0 * (1 + 1e-9)) sum += p(x);
  return Math.min(1, sum);
}
function report(profile) {
  const out = {};
  for (const m of ['fp', 'tags']) {
    const rs = (profile.ratings || []).filter(r => r.ab === m);
    const love = rs.filter(r => r.rating === 'love').length, ok = rs.filter(r => r.rating === 'ok').length;
    out[m] = { n: rs.length, love, ok, skip: rs.length - love - ok, rate: rs.length ? love / rs.length : null };
  }
  const { fp, tags } = out;
  out.p = fp.n && tags.n ? fisher(fp.love, fp.n - fp.love, tags.love, tags.n - tags.love) : null;
  return out;
}
function format(r) {
  const row = (name, x) => `${name.padEnd(6)} n=${x.n}  love=${x.love}  ok=${x.ok}  skip=${x.skip}  love rate=${x.rate == null ? '-' : (100 * x.rate).toFixed(1) + '%'}`;
  return [row('fp', r.fp), row('tags', r.tags), `Fisher exact p (love rate, two-sided) = ${r.p == null ? 'n/a' : r.p.toFixed(4)}`].join('\n');
}
module.exports = { report, format, fisher };
if (require.main === module) {
  if (!process.argv[2]) { console.error('usage: node scripts/ab-report.js profile.json'); process.exit(1); }
  console.log(format(report(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')))));
}
