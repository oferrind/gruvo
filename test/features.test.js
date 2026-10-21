const test = require('node:test');
const assert = require('node:assert');
const F = require('../renderer/features');

const SR = F.SR, SEC = 12;
const signal = fn => Float32Array.from({ length: SR * SEC }, (_, i) => fn(i / SR, i));
const sine = hz => signal(t => 0.5 * Math.sin(2 * Math.PI * hz * t));
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const noise = () => signal(() => rnd() - 0.5);
// Short decaying noise burst every 60/bpm seconds.
const clicks = bpm => signal(t => { const ph = t % (60 / bpm); return ph < 0.03 ? (rnd() - 0.5) * Math.exp(-ph * 150) : 0; });

test('a 120 BPM click track detects ~120 BPM', () => {
  const f = F.extract(clicks(120));
  assert.ok(Math.abs(f.bpm - 120) < 4, `got ${f.bpm}`);
});

test('a 90 BPM click track detects ~90 BPM', () => {
  const f = F.extract(clicks(90));
  assert.ok(Math.abs(f.bpm - 90) < 4, `got ${f.bpm}`);
});

test('a low sine has a lower spectral centroid than a high sine', () => {
  const lo = F.extract(sine(150)), hi = F.extract(sine(3000));
  assert.ok(lo.centroid < hi.centroid, `${lo.centroid} vs ${hi.centroid}`);
  assert.ok(F.vector(lo)[3] < F.vector(hi)[3]);
});

test('white noise is flatter than a sine', () => {
  assert.ok(F.extract(noise()).flatness > 10 * F.extract(sine(440)).flatness);
});

test('clicks are more percussive than a steady sine; vectors are in 0..1', () => {
  const c = F.vector(F.extract(clicks(120))), s = F.vector(F.extract(sine(440)));
  assert.ok(c[5] > s[5]);
  for (const v of [...c, ...s]) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v));
  assert.equal(c.length, F.DIM);
});

test('silence or too-short audio gives null instead of garbage', () => {
  assert.equal(F.extract(new Float32Array(SR * 5)), null);
  assert.equal(F.extract(new Float32Array(100)), null);
});

// ---------- taste model ----------
const v = (...head) => [...head, ...Array(F.DIM - head.length).fill(0.5)];
const R = (id, rating, features) => ({ id, rating, features });

test('cold model: no loves, no skips scores 0', () => {
  assert.equal(F.score(v(0.5), [], 50), 0);
});

test('low adventure picks the closest match to a love', () => {
  const ratings = [R('a', 'love', v(0.2, 0.2)), R('b', 'skip', v(0.9, 0.9))];
  const near = { vec: v(0.22, 0.2) }, mid = { vec: v(0.5, 0.5) }, far = { vec: v(0.85, 0.9) };
  assert.deepEqual(F.rank([far, mid, near], ratings, 0), [near, mid, far]);
});

test('high adventure picks a stretch, but never one close to a skip', () => {
  const ratings = [R('a', 'love', v(0.2, 0.2)), R('b', 'skip', v(0.2, 0.9))];
  const near = { vec: v(0.21, 0.2) }, stretch = { vec: v(0.75, 0.3) }, nearSkip = { vec: v(0.25, 0.8) };
  const best = F.rank([near, stretch, nearSkip], ratings, 100);
  assert.equal(best[0], stretch);
  // Without the skip, nearSkip sits right on the target distance and would win: the skip is what pushed it down.
  assert.equal(F.rank([near, stretch, nearSkip], ratings.slice(0, 1), 100)[0], nearSkip);
});

test('middle adventure prefers moderate distance over identical', () => {
  const ratings = [R('a', 'love', v(0.2))];
  const same = { vec: v(0.2) }, moderate = { vec: v(0.2 + F.TMAX / 2) };
  assert.equal(F.rank([same, moderate], ratings, 50)[0], moderate);
});

test('OK pulls (weakly), skip pushes (strongly)', () => {
  const ratings = [R('o', 'ok', v(0.8)), R('s', 'skip', v(0.2))];
  assert.ok(F.score(v(0.8), ratings, 0) > F.score(v(0.2), ratings, 0));
  assert.ok(F.score(v(0.8), ratings, 0) > 0 && F.score(v(0.2), ratings, 0) < 0);
});

test('explain names the nearest love and a shared trait', () => {
  const loved = F.vector({ bpm: 120, rms: 0.2, rmsCV: 0.3, centroid: 600, flatness: 0.01, onsetRate: 2, bands: [5, 5, 2, 1, 1, 0.5, 0.2, 0.1] });
  const cand = F.vector({ bpm: 121, rms: 0.2, rmsCV: 0.3, centroid: 650, flatness: 0.01, onsetRate: 2, bands: [5, 5, 2, 1, 1, 0.5, 0.2, 0.1] });
  const s = F.explain(cand, [R('dz:1', 'love', loved)], { 'dz:1': '“Tezeta” by Mulatu' }, 10);
  assert.match(s, /~120 BPM/);
  assert.match(s, /“Tezeta” by Mulatu/);
  assert.equal(F.explain(cand, [], {}, 10), '');
  const far = cand.map((x, i) => (i === 3 || i === 5 ? 1 - x : x));
  assert.match(F.explain(far, [R('dz:1', 'love', loved)], {}), /^(A stretch from|The .* of|Close to) a track you loved.*(brighter|more percussive)/);
});
