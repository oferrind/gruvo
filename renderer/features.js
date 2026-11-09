// Sound Fingerprint: pure audio features + taste model. Shared by the renderer (window.Features) and node tests.
(function (root) {
  'use strict';
  const SR = 22050, N = 1024, HOP = 512, FPS = SR / HOP;
  const EDGES = [60, 120, 250, 500, 1000, 2000, 4000, 8000, 11025]; // 8 timbre bands, Hz
  const DIM = 6 + 8;
  const W = [1, 1, 1, 1, 1, 1, ...Array(8).fill(0.5)]; // timbre has 8 dims; damp it so it can't drown the rest
  const TMAX = 0.6, D0 = 0.25; // distance at Adventure 100; similarity falloff (tuned on real previews)
  const clamp = v => Math.max(0, Math.min(1, v));
  const log2 = Math.log2, log10 = Math.log10;

  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < h; k++) {
          const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  // Autocorrelation of the onset envelope over 60-200 BPM, with a soft preference for ~120 (avoids half/double picks).
  function tempo(env) {
    // Smooth first: a beat rarely lands on a whole number of frames, so spread each onset over its neighbours.
    const sm = env.map((_, i) => [1, 4, 6, 4, 1].reduce((s, w, j) => s + w * (env[i + j - 2] || 0), 0) / 16);
    const n = sm.length, mean = sm.reduce((s, x) => s + x, 0) / n, e = sm.map(x => x - mean);
    const ac = lag => { let s = 0; for (let i = 0; i + lag < n; i++) s += e[i] * e[i + lag]; return s / (n - lag); };
    const lo = Math.floor(FPS * 60 / 200), hi = Math.ceil(FPS * 60 / 60) + 1;
    const a = []; for (let l = 0; l <= hi + 1; l++) a.push(l >= lo ? ac(l) : 0);
    let best = -Infinity, bpm = 120;
    for (let b = 60; b <= 200; b += 0.5) {
      const lag = FPS * 60 / b, i = Math.floor(lag), fr = lag - i;
      const v = (a[i] * (1 - fr) + a[i + 1] * fr) * Math.exp(-0.5 * (log2(b / 120) / 1.2) ** 2);
      if (v > best) { best = v; bpm = b; }
    }
    return bpm;
  }

  // Mono samples at SR -> raw features, or null for silence / too-short audio.
  function extract(x) {
    const frames = Math.floor((x.length - N) / HOP) + 1;
    if (frames < FPS * 3) return null;
    const half = N / 2, binHz = SR / N, re = new Float64Array(N), im = new Float64Array(N);
    const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const bandOf = Array.from({ length: half }, (_, k) => EDGES.findIndex((e, j) => j < 8 && k * binHz >= e && k * binHz < EDGES[j + 1]));
    const bands = Array(8).fill(0), rmsA = [], flux = [];
    let prev = new Float64Array(half), next = new Float64Array(half), cen = 0, flat = 0, loud = 0;
    for (let f = 0; f < frames; f++) {
      let ss = 0;
      for (let i = 0; i < N; i++) { const v = x[f * HOP + i]; ss += v * v; re[i] = v * win[i]; im[i] = 0; }
      const rms = Math.sqrt(ss / N);
      rmsA.push(rms);
      fft(re, im);
      let mSum = 0, cSum = 0, pSum = 0, lSum = 0, fl = 0;
      for (let k = 1; k < half; k++) {
        const m = Math.hypot(re[k], im[k]), p = m * m;
        mSum += m; cSum += k * binHz * m; pSum += p; lSum += Math.log(p + 1e-12);
        if (bandOf[k] >= 0) bands[bandOf[k]] += p;
        next[k] = Math.log(1 + 100 * m);
        if (next[k] > prev[k]) fl += next[k] - prev[k];
      }
      [prev, next] = [next, prev];
      flux.push(fl);
      if (rms > 1e-3) { loud++; cen += cSum / mSum; flat += Math.exp(lSum / (half - 1)) / (pSum / (half - 1)); }
    }
    if (!loud) return null;
    const rmsMean = rmsA.reduce((s, v) => s + v, 0) / frames;
    const rmsSd = Math.sqrt(rmsA.reduce((s, v) => s + (v - rmsMean) ** 2, 0) / frames);
    // Onsets: local flux maxima clearly above the average.
    const fm = flux.reduce((s, v) => s + v, 0) / frames, fsd = Math.sqrt(flux.reduce((s, v) => s + (v - fm) ** 2, 0) / frames);
    let onsets = 0;
    for (let i = 3; i < frames - 3; i++) {
      if (flux[i] > fm + fsd && flux.slice(i - 3, i + 4).every(v => v <= flux[i])) onsets++;
    }
    return { bpm: tempo(flux), rms: rmsMean, rmsCV: rmsSd / (rmsMean || 1), centroid: cen / loud, flatness: flat / loud,
      onsetRate: onsets / (frames / FPS), bands };
  }

  // Raw features -> DIM numbers in 0..1:
  // [tempo, loudness, dynamics, brightness, noisiness, percussiveness, 8 x band share].
  function vector(f) {
    const total = f.bands.reduce((s, v) => s + v, 0) || 1;
    return [
      clamp(log2(f.bpm / 60) / log2(200 / 60)),
      clamp((20 * log10(f.rms + 1e-9) + 40) / 40),
      clamp(f.rmsCV),
      clamp(log2(f.centroid / 250) / 5),
      clamp((log10(f.flatness + 1e-9) + 3) / 3),
      clamp(f.onsetRate / 8),
      ...f.bands.map(b => clamp(1 + log10(b / total + 1e-6) / 4)),
    ];
  }

  const bpmOf = v => Math.round(60 * (200 / 60) ** v[0]);
  const dist = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + W[i] * (x - b[i]) ** 2, 0));
  const sim = d => Math.exp(-d / D0);
  function nearest(v, ratings, kind) {
    let best = null;
    for (const r of ratings) if (r.rating === kind) { const d = dist(v, r.features); if (!best || d < best.d) best = { d, r }; }
    return best;
  }

  // Taste score: like the loves (1) / OKs (0.3), unlike the skips (0.7). Adventure moves the loves' sweet spot
  // from "identical" (0) to TMAX away (100) and makes skip-likeness cost more, so a stretch never lands on a skip.
  function score(v, ratings, adventure) {
    const a = clamp(adventure / 100), L = nearest(v, ratings, 'love'), O = nearest(v, ratings, 'ok'), S = nearest(v, ratings, 'skip');
    return (L ? Math.exp(-Math.abs(L.d - a * TMAX) / D0) : 0) + 0.3 * (O ? sim(O.d) : 0) - 0.7 * (1 + a) * (S ? sim(S.d) : 0);
  }
  const rank = (cands, ratings, adventure) =>
    cands.map(c => [score(c.vec, ratings, adventure), c]).sort((x, y) => y[0] - x[0]).map(x => x[1]);

  // Human sentence comparing a track to its nearest love. names: rating id -> display name. close: '' when the match is weak.
  function explain(v, ratings, names, { close } = {}) {
    const L = nearest(v, ratings, 'love');
    if (!L || (close && L.d >= TMAX * 2 / 3)) return '';
    const l = L.r.features, name = names[L.r.id] || 'a track you loved';
    const both = (i, lo, hi) => (v[i] < lo && l[i] < lo) || (v[i] > hi && l[i] > hi);
    const bass = u => (u[6] + u[7]) / 2;
    const beat = v[5] > 0.3 && l[5] > 0.3; // tempo of soft, sparse audio is a guess: only talk tempo when both have clear onsets
    const octave = Math.abs(Math.abs(log2(bpmOf(v) / bpmOf(l))) - 1) < 0.08; // half/double reads as the same feel, not faster/slower
    const shared = [
      beat && Math.abs(bpmOf(v) / bpmOf(l) - 1) < 0.06 && `${v[5] > 0.45 && v[1] > 0.5 ? 'driving' : 'steady'} pulse`,
      both(3, 0.35, 0.65) && (v[3] < 0.35 ? 'dark, warm tone' : 'bright, airy top end'),
      bass(v) > 0.8 && bass(l) > 0.8 && 'deep low end',
      both(5, 0.15, 0.45) && (v[5] > 0.45 ? 'busy, percussive rhythm' : 'sparse, gentle rhythm'),
      both(1, 0.5, 0.8) && (v[1] > 0.8 ? 'loud, dense energy' : 'quiet, intimate feel'),
      v[4] > 0.6 && l[4] > 0.6 && 'gritty, noisy texture',
    ].filter(Boolean).slice(0, 2);
    if (L.d < TMAX / 3) return shared.length ? `Same ${shared.join(' and ')} as ${name}` : `Sounds closest to ${name} among your loves`;
    const diff = [
      beat && !octave && Math.abs(v[0] - l[0]) > 0.1 && (v[0] > l[0] ? 'faster' : 'slower'),
      !both(3, 0.35, 0.65) && Math.abs(v[3] - l[3]) > 0.1 && (v[3] > l[3] ? 'brighter' : 'darker'), // never "bright top end ... but darker"
      !both(5, 0.15, 0.45) && Math.abs(v[5] - l[5]) > 0.1 && (v[5] > l[5] ? 'more percussive' : 'calmer'),
      Math.abs(v[4] - l[4]) > 0.1 && (v[4] > l[4] ? 'noisier' : 'cleaner'),
    ].filter(Boolean).slice(0, 3);
    const but = diff.length ? ` but ${diff.join(', ')}` : '';
    if (L.d < TMAX * 2 / 3) return shared.length ? `The ${shared[0]} of ${name},${but || ' in a new setting'}` : `Close to ${name}${but && `,${but}`}`;
    return `A stretch from ${name}${diff.length ? `: ${diff.join(', ')}` : ''}${shared.length ? `, keeping the ${shared[0]}` : ''}`;
  }

  // "Why you got this": a few phrasings per source, never the same one twice in a row. Returns [text, key]; pass key back as prev.
  const WHY = {
    trip: w => [`A random trip to ${w.place}`, `Picked at random from ${w.place}`, `A pin dropped on ${w.place}`, `A blind pick from ${w.place}`],
    near: w => [`Because you loved ${w.artist}`, `A neighbour of ${w.artist}`, `In ${w.artist}’s orbit`, `One step from ${w.artist}`],
    trail: w => [`${w.person}, ${w.role} on “${w.loved}”, ${w.also ? 'is on this one too' : 'worked with them'}`,
      `Followed ${w.person} from “${w.loved}”`, `A thread from “${w.loved}”: its ${w.role}, ${w.person}`],
    genre: w => [`From the ${w.genre} shelf`, `${w.genre}, a genre you picked`, `Pulled from your ${w.genre} picks`],
  };
  function whyLine(why, sound, prev, rand = Math.random) {
    const all = WHY[why && why.kind] ? WHY[why.kind](why) : [];
    const keys = all.map((_, i) => `${why.kind}:${i}`).filter(k => k !== prev);
    const key = keys[Math.floor(rand() * keys.length)];
    const head = key && all[key.split(':')[1]];
    return [head && sound ? `${head} · ${sound[0].toLowerCase()}${sound.slice(1)}` : head || sound || '', key || prev];
  }

  // Minimum match: a candidate plays only if some love is within reach. "Close" (2/3 TMAX) at Adventure 0, up to 1.5 TMAX at 100.
  const reach = adventure => TMAX * (2 / 3 + clamp(adventure / 100) * (5 / 6));
  const fits = (v, ratings, adventure) => { const L = nearest(v, ratings, 'love'); return !L || L.d <= reach(adventure); };

  // Where the next candidate comes from: low Adventure leans on related artists and chosen genres, high on random trips and credit trails.
  const sourceWeights = (adventure, hasGenres, a = clamp(adventure / 100)) =>
    [['neighbour', 3 - 2 * a], ['genre', hasGenres ? 2 - a : 0], ['trail', 1 + a], ['explore', 0.25 + 2.75 * a]];
  function pickSource(adventure, hasGenres, r = Math.random()) {
    const w = sourceWeights(adventure, hasGenres);
    let x = r * w.reduce((s, [, n]) => s + n, 0);
    return (w.find(([, n]) => (x -= n) < 0) || w[0])[0];
  }

  // Method B (A/B test): MusicBrainz artist-tag similarity. Tags are {name: count}; cosine on the count vectors.
  function tagCos(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (const [k, v] of Object.entries(a || {})) { const x = Math.max(0, v); na += x * x; if (b && b[k] > 0) dot += x * b[k]; }
    for (const v of Object.values(b || {})) nb += Math.max(0, v) ** 2;
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  // Blind Test picker: 80% artist-tag similarity + 20% sound closeness, each standardised against a window of recent candidates.
  // Candidate c = { t: tag cosine or null (unknown), s: -distance to the nearest loved fingerprint or null }.
  const W_TAG = 0.8, W_SOUND = 0.2, UNKNOWN_TAG = 1; // unknown tags score one SD below the window mean
  function z(x, xs) {
    const v = xs.filter(Number.isFinite), m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
    return v.length ? (x - m) / Math.max(Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length), 1e-6) : 0;
  }
  const blend = (c, win) => W_TAG * (Number.isFinite(c.t) ? z(c.t, win.map(w => w.t)) : -UNKNOWN_TAG)
    + W_SOUND * (Number.isFinite(c.s) ? z(c.s, win.map(w => w.s)) : 0);
  // Share of the window that passes: 35% at Adventure 0 up to 85% at 100. Features.fits passed roughly this share of a
  // typical pool (reach 2/3 TMAX -> 1.5 TMAX), so Adventure keeps the same feel.
  const passShare = adventure => 0.35 + 0.5 * clamp(adventure / 100);
  // Lowest blended score that passes; with fewer than 12 samples nothing is rejected yet.
  function blendCut(win, adventure, wts) {
    if (win.length < 12) return -Infinity;
    const s = win.map(w => (wts ? blendW(w, win, wts) : blend(w, win))).sort((x, y) => y - x);
    return s[Math.min(s.length - 1, Math.max(0, Math.round(passShare(adventure) * s.length) - 1))];
  }

  // Hybrid picker (docs/21): the same z-scores plus co-listening closeness (c, renderer/colisten.js), with weights w.
  // Unknown tags score one SD below the mean (as blend); unknown sound or co-listening is neutral.
  const zs = (c, win) => ({ t: Number.isFinite(c.t) ? z(c.t, win.map(x => x.t)) : -UNKNOWN_TAG,
    s: Number.isFinite(c.s) ? z(c.s, win.map(x => x.s)) : 0, c: Number.isFinite(c.c) ? z(c.c, win.map(x => x.c)) : 0,
    g: Number.isFinite(c.g) ? z(c.g, win.map(x => x.g)) : 0 });
  const W_HYBRID = { t: 1.10, s: 0.47, c: 0.63, g: 0.24 }; // LambdaRank on 121 ratings, mean over the harness folds (docs/21)
  const dotW = (x, w) => w.t * x.t + w.s * x.s + w.c * x.c + (w.g || 0) * (x.g || 0);
  const blendW = (c, win, w) => dotW(zs(c, win), w);
  // LambdaRank (Burges 2010) for a linear model: pairs with different ratings pull the weights by how much swapping them
  // would change NDCG. rows: [{x: zs(...), rel: 2 love / 1 ok / 0 skip}]. L2 keeps the weights near `prior` when data is thin.
  function learnWeights(rows, prior, { iters = 200, lr = 0.5, l2 = 0.02 } = {}) {
    const w = { g: 0, ...prior }, K = ['t', 's', 'c', 'g'], gain = r => 2 ** r - 1;
    const ideal = rows.map(r => gain(r.rel)).sort((a, b) => b - a).reduce((a, g, i) => a + g / Math.log2(i + 2), 0);
    if (!ideal) return w;
    for (let it = 0; it < iters; it++) {
      const sc = rows.map(r => dotW(r.x, w)), pos = new Array(rows.length);
      sc.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).forEach(([, i], p) => { pos[i] = p; });
      const g = { t: 0, s: 0, c: 0, g: 0 };
      let tot = 0;
      for (let i = 0; i < rows.length; i++) for (let j = 0; j < rows.length; j++) {
        if (rows[i].rel <= rows[j].rel) continue;
        const dn = Math.abs((gain(rows[i].rel) - gain(rows[j].rel)) * (1 / Math.log2(pos[i] + 2) - 1 / Math.log2(pos[j] + 2))) / ideal;
        const rho = dn / (1 + Math.exp(sc[i] - sc[j]));
        for (const k of K) g[k] += rho * ((rows[i].x[k] || 0) - (rows[j].x[k] || 0));
        tot += dn;
      }
      if (!tot) break;
      for (const k of K) w[k] += lr * (g[k] / tot - l2 * (w[k] - (prior[k] || 0)));
    }
    return w;
  }

  // Thompson sampling (docs/21) over the same sources: each source's Love rate is drawn from Beta(1 + loves, 1 + other verdicts)
  // and scaled by its Adventure weight. Sources that keep finding loves get picked more; an unlucky one still gets chances,
  // so the Blind Test keeps learning your taste instead of only pleasing it. stats: {source: {love, n}} from the listening log.
  const normal = rand => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  function gamma(k, rand) { // Marsaglia and Tsang (2000), k >= 1
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = normal(rand); v = 1 + c * x; } while (v <= 0);
      v = v * v * v;
      const u = rand();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  const beta = (a, b, rand) => { const x = gamma(a, rand); return x / (x + gamma(b, rand)); };
  function thompsonSource(adventure, hasGenres, stats = {}, rand = Math.random) {
    const w = sourceWeights(adventure, hasGenres), max = Math.max(...w.map(([, n]) => n));
    let best = w[0][0], top = -1;
    for (const [k, n] of w) {
      if (!n) continue;
      const { love = 0, n: seen = 0 } = stats[k] || {};
      const v = beta(1 + love, 1 + Math.max(0, seen - love), rand) * n / max;
      if (v > top) { best = k; top = v; }
    }
    return best;
  }
  // Calibration (Steck 2018): greedy re-rank so the tags of what you are shown follow the tag mix of your loves, instead of
  // the top of the list piling onto one genre. items: [{score, tags}]; mix: {tag: weight}; prefix: tag maps already shown.
  // Each pick maximises (1 - lambda) * score - lambda * KL(mix || shown mix). Returns item indices in order.
  function calibrate(items, mix, k, lambda = 0.3, prefix = []) {
    const top = Object.entries(mix || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const P = top.reduce((a, [, v]) => a + v, 0);
    const order = items.map((_, i) => i).sort((a, b) => items[b].score - items[a].score);
    if (!P || lambda <= 0) return order.slice(0, k);
    const dist = t => { const e = top.map(([g]) => Math.max(0, (t || {})[g] || 0)), s = e.reduce((a, b) => a + b, 0); return s ? e.map(x => x / s) : null; };
    const sum = top.map(() => 0);
    let n = 0;
    const add = d => { if (d) { d.forEach((x, i) => { sum[i] += x; }); n++; } };
    prefix.forEach(t => add(dist(t)));
    const kl = extra => top.reduce((a, [, v], i) => {
      const p = v / P, q = (sum[i] + (extra ? extra[i] : 0)) / (n + (extra ? 1 : 0) || 1);
      return a + p * Math.log(p / (0.99 * q + 0.01 * p));
    }, 0);
    const out = [], left = new Set(order), ds = items.map(x => dist(x.tags));
    while (out.length < k && left.size) {
      let best = -1, bv = -Infinity;
      for (const i of left) { const v = (1 - lambda) * items[i].score - lambda * kl(ds[i]); if (v > bv) { bv = v; best = i; } }
      out.push(best); left.delete(best); add(ds[best]);
    }
    return out;
  }

  const api = { SR, DIM, TMAX, extract, vector, bpmOf, dist, score, rank, explain, whyLine, reach, fits, pickSource, nearest, tagCos, W_TAG, W_SOUND, blend, passShare, blendCut, zs, blendW, learnWeights, thompsonSource, calibrate, W_HYBRID };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Features = api;
})(this);
