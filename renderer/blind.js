// ---------- A. Blind Taste Test ----------
const queue = [], tonight = [];
let mystery = null, rated = false, fails = 0, filling = false, trailing = false, shownN = 0, tried = 0, side = 0;
// While no mystery is ready: say what is happening (records looked at, candidates being listened to), not a static line.
function finding() {
  if (mystery) return;
  const n = queue.length, which = shownN ? 'next' : 'first';
  $('#mystery-title').textContent = n ? `Listening to ${n} candidate${n > 1 ? 's' : ''}…`
    : tried ? `Finding your ${which} mystery… ${tried} record${tried > 1 ? 's' : ''} looked at` : `Finding your ${which} mystery…`;
}

// Sound Fingerprint: once 3 tracks are rated, keep ~6 candidates, listen to each, play the one the taste model likes best.
const warm = () => profile.ratings.length >= 3;
// Sources are picked per candidate by Adventure (Features.pickSource); 'genre' only when genres are chosen in Preferences.

// Download the preview (main process, CDN allowlist), decode, analyse ~20 s from the middle. Memoised; resolves to the vector or null.
function fingerprint(c) {
  c.fp ??= (async () => {
    try {
      if (!c.previewUrl) return null; // MusicBrainz-only rows have no preview
      const buf = await api.audio(c.previewUrl);
      if (!buf || !buf.byteLength || !window.Features) return null;
      const ab = await new OfflineAudioContext(1, 1, Features.SR).decodeAudioData(buf);
      const from = Math.max(0, (ab.length >> 1) - Features.SR * 10), to = Math.min(ab.length, from + Features.SR * 20);
      const x = new Float32Array(to - from);
      for (let ch = 0; ch < ab.numberOfChannels; ch++) {
        const d = ab.getChannelData(ch);
        for (let i = from; i < to; i++) x[i - from] += d[i] / ab.numberOfChannels;
      }
      const f = Features.extract(x);
      return f ? Features.vector(f) : null;
    } catch (e) { console.warn('fingerprint failed:', e.message); return null; }
  })().then(v => (c.vec = v));
  return c.fp;
}

// Cold start (or pool not listened to yet): queue order, as before. Warm: best taste score; drop ones passed over 3 times.
// Warm: only candidates within reach of a love play (deep cuts of loved artists always may); the rest are dropped and refilled.
// After 12 misfits in a row the best of what's there plays anyway, so a narrow taste never stalls the Blind Test.
let misfits = 0;

// Picker: 80% MusicBrainz artist-tag similarity to the artists you loved + 20% sound closeness (see Features.blend).
// c.tagSim: undefined = lookup pending, null = unknown tags. Both are standardised against a window of recent candidates.
// The loved-artist profile fills in as lookups arrive (1.5 s each on a cold cache); candidates score against what's there so far.
let loveSum = {}, loveTagsKey = '';
function lovedTags() {
  const names = [...new Set(profile.likes.map(l => l.artist))].slice(-60), key = names.join('|');
  if (key !== loveTagsKey) {
    loveTagsKey = key;
    const sum = loveSum = {};
    (async () => {
      for (const n of names) {
        if (loveTagsKey !== key) return; // likes changed: a newer pass took over
        const t = await call('artistTags', n);
        for (const [k, v] of Object.entries(t || {})) sum[k] = (sum[k] || 0) + Math.max(0, v);
      }
    })().catch(() => {});
  }
  return loveSum;
}
const seen = [];
const TAG_WAIT = 8000; // a busy MusicBrainz queue must not stall the Blind Test: after this the tags count as unknown
function tagScore(c) {
  const fresh = !c.tagP;
  c.tagP ??= (async () => {
    // No loved artists: nothing to compare tags with, so don't spend a MusicBrainz lookup (or the TAG_WAIT) on it.
    const theirs = profile.likes.length ? await Promise.race([call('artistTags', c.artist), new Promise(r => setTimeout(r, TAG_WAIT))]) : null;
    const mine = lovedTags();
    c.tagSim = theirs && Object.keys(mine).length ? Features.tagCos(theirs, mine) : null;
    c.tags = theirs || null;
    return c;
  })().catch(() => { c.tagSim = null; return c; });
  if (fresh) c.tagP.then(() => { if (!mystery && queue.includes(c)) showMystery(); }); // first call only: no re-entry loop
  return c.tagP;
}
function observe(c) { // once both scores exist: feed the calibration window (~80 recent candidates)
  if (c.obs || !c.vec || c.tagSim === undefined || !warm()) return;
  c.obs = true;
  const L = Features.nearest(c.vec, profile.ratings, 'love');
  c.sc = { t: c.tagSim, s: L ? -L.d : null, c: coScore(c), g: window.Colisten && coSets.love.every(s => warmed.has(s)) ? Colisten.graphScore(c.artist, coSets.love) : null }; // coScore refreshes coSets first
  seen.push(c.sc);
  if (seen.length > 80) seen.shift();
}
// ---- Hybrid picker (docs/21). Blind A/B: each mystery is picked by the shipped blend ('ship') or the hybrid ('hyb') at random;
// the listening log keeps which, and Preferences shows the Love rate of each. The hybrid adds co-listening closeness
// (window.Colisten), weights learned from your ratings (LambdaRank), Thompson-sampled sources and genre calibration.
const nextAlg = () => (HYBRID_AB && window.Colisten && Math.random() < 0.5 ? 'hyb' : 'ship');
let alg = 'ship';
let coKey = '', coSets = { love: [], skip: [] };
const warmed = new Set();
function coScore(c) {
  if (!window.Colisten) return null;
  const key = `${profile.likes.length}:${profile.ratings.length}`;
  if (key !== coKey) {
    coKey = key;
    coSets = { love: Colisten.indices(profile.likes.map(l => l.artist)), skip: Colisten.indices(profile.ratings.filter(r => r.rating === 'skip' && r.a).map(r => r.a)) };
    // One PageRank walk per loved artist, spread out so nothing freezes; the graph score waits until all of them are cached.
    coSets.love.filter(s => !warmed.has(s)).forEach((s, i) => setTimeout(() => { Colisten.ppr([s], 0); warmed.add(s); }, 30 * i));
  }
  return Colisten.score(c.artist, coSets.love, coSets.skip);
}
// Love rate per source from the log's Blind Test verdicts (newest 300), for Thompson sampling.
function sourceStats() {
  const out = {};
  for (const e of profile.events.filter(e => e.k === 'rate' && e.src).slice(-300)) { const s = out[e.src] ||= { love: 0, n: 0 }; s.n++; if (e.v === 'love') s.love++; }
  return out;
}
// Weights: Features.W_HYBRID (learned offline from ratings, docs/21) until 60 ratings carry an artist; then LambdaRank on
// those ratings, each scored as a fresh candidate would be (its own artist left out), redone every 20 new ratings.
let learned = null, learning = false, learnedAt = 0;
function hybridW() {
  const rows = profile.ratings.filter(r => r.a && !r.seed);
  if (rows.length >= 60 && rows.length - learnedAt >= 20 && !learning) relearn(rows);
  return learned || Features.W_HYBRID;
}
async function relearn(rows) {
  learning = true;
  try {
    const tags = new Map();
    for (const a of new Set(rows.map(r => r.a))) tags.set(a, await call('artistTags', a).catch(() => null)); // cached, paced lookups
    const raw = rows.map(r => {
      const others = profile.ratings.filter(x => x !== r && !(x.a && norm(x.a) === norm(r.a)));
      const mine = {};
      for (const x of others) if (x.rating === 'love' && x.a) for (const [k, v] of Object.entries(tags.get(x.a) || {})) mine[k] = (mine[k] || 0) + Math.max(0, v);
      const L = Features.nearest(r.features, others, 'love'), ix = k => Colisten.indices(others.filter(x => x.rating === k && x.a).map(x => x.a));
      const lv = ix('love');
      return { t: tags.get(r.a) && Object.keys(mine).length ? Features.tagCos(tags.get(r.a), mine) : null, s: L ? -L.d : null, c: Colisten.score(r.a, lv, ix('skip')), g: Colisten.graphScore(r.a, lv) };
    });
    learned = Features.learnWeights(raw.map((f, i) => ({ x: Features.zs(f, raw), rel: { love: 2, ok: 1, skip: 0 }[rows[i].rating] })), Features.W_HYBRID);
    learnedAt = rows.length;
  } finally { learning = false; }
}
function nextFromQueue() {
  if (!warm()) return queue.shift() || null;
  queue.forEach(c => { tagScore(c); observe(c); });
  const w = alg === 'hyb' ? hybridW() : null, score = c => (w ? Features.blendW(c.sc, seen, w) : Features.blend(c.sc, seen));
  const cut = Features.blendCut(seen, profile.adventure, w);
  const known = c => c.sc;
  const fit = c => c.back || misfits >= 12 || score(c) >= cut;
  const drop = queue.filter(c => c.vec && known(c) && !fit(c));
  misfits += drop.length;
  const ready = queue.filter(c => c.vec && known(c) && fit(c));
  if (!ready.length && !shownN) { // the session's first mystery: play the first listened-to preview, don't wait on tag lookups
    const quick = queue.find(c => c.vec);
    if (quick) { queue.splice(queue.indexOf(quick), 1); return quick; }
  }
  if (!ready.length) { queue.splice(0, queue.length, ...queue.filter(c => !drop.includes(c) && c.vec !== null)); return null; } // wait for more fingerprints
  ready.sort((x, y) => score(y) - score(x));
  if (w) { // hybrid: calibrate against the genres of tonight's last reveals, so one genre doesn't take every mystery
    const pick = Features.calibrate(ready.map(c => ({ score: score(c), tags: c.tags })), lovedTags(), 1, 0.3, tonight.slice(0, 8).map(x => x.t.tags).filter(Boolean))[0];
    if (pick > 0) ready.unshift(...ready.splice(pick, 1));
  }
  const [best, ...rest] = ready;
  best.alg = alg;
  alg = nextAlg();
  misfits = 0;
  rest.forEach(c => { c.passed = (c.passed || 0) + 1; });
  const keep = queue.filter(c => c !== best && !drop.includes(c) && !(c.passed >= 3) && c.vec !== null); // vec null = preview failed to decode: can't be ranked, drop it
  queue.splice(0, queue.length, ...keep);
  return best;
}

// "Why you got this": where it came from, plus the sound match only when it is close. Phrasing rotates between reveals.
let lastWhy;
function soundReason(m, v) {
  const names = { ...seedNames(), ...Object.fromEntries(profile.likes.map(l => [likeKey(l), `“${cleanTitle(l.title)}” by ${l.artist}`])) };
  const sound = v && window.Features ? Features.explain(v, profile.ratings.filter(r => r.id !== likeKey(m)), names, { close: true }) : '';
  if (!m.why) return sound || m.reason || '';
  if (whyTag(m)) return sound; // the sticker already says how it was found
  const [text, key] = Features.whyLine(m.why, sound, lastWhy);
  lastWhy = key;
  return text;
}

// About text (Wikipedia or a fact line) per track, fetched once: prefetched while the mystery plays, shown only after rating.
const abouts = new Map();
const aboutOf = t => abouts.get(likeKey(t)) || abouts.set(likeKey(t), call('about', plain(t)).then(a => a || { facts: {} })).get(likeKey(t));

// Fills `box` with the about text, facts chips and source link; a skeleton line until it arrives.
function aboutBlock(t) {
  const box = el('div', { className: 'about', ariaBusy: 'true' }, el('p', { className: 'about-text is-loading', textContent: '…' }));
  aboutOf(t).then(({ text, url, facts = {} }) => {
    box.setAttribute('aria-busy', 'false');
    const chips = [facts.album, facts.year, facts.label, facts.genre && Dig.genre(facts.genre)].filter(Boolean).map(f => el('li', { textContent: f }));
    box.replaceChildren(...[
      text && el('p', { className: 'about-text' }, text, url ? ' ' : null, url ? el('button', { type: 'button', className: 'ext about-src', textContent: 'from Wikipedia',
        ariaLabel: 'Read more on Wikipedia (opens your browser)', onclick: () => api.open(url).catch(() => toast('Could not open the browser')) }) : null),
      chips.length && el('ul', { className: 'facts', ariaLabel: 'Release details' }, ...chips)].filter(Boolean));
  });
  return box;
}
// Saved rows: the same About, fetched only when opened.
function aboutDetails(t) {
  const d = el('details', { className: 'about-more' }, el('summary', { textContent: 'About' }));
  d.ontoggle = () => { if (d.open && d.children.length === 1) d.append(aboutBlock(t)); };
  return d;
}

const excluded = () => [...queue, mystery].filter(Boolean).map(c => norm(c.artist));
function accept(c) {
  if (!c || (isHeard(c) && !c.back) || excluded().includes(norm(c.artist))) return false;
  queue.push(c);
  if (warm()) tagScore(c);
  fingerprint(c).then(() => { if (!mystery && queue.includes(c)) showMystery(); }); // warm: a candidate can only play once it has been listened to
  if (!mystery) showMystery();
  finding();
  return true;
}

async function fill() {
  if (filling) return;
  filling = true;
  $('#blind-error').hidden = true;
  while (queue.length < (warm() ? 6 : 3)) {
    const mine = [...queue, mystery].filter(Boolean);
    const back = await call('deepCut', { enabled: profile.prefs.bringBack, adventure: profile.adventure, likes: plain(profile.likes), back: profile.back, busy: mine.some(c => c.back),
      exclude: mine.map(c => c.artistDzId), rated: [...profile.ratings.map(r => r.id), ...tonight.map(x => likeKey(x.t))] });
    if (back) back.src = 'back';
    if (accept(back)) { fails = 0; continue; }
    const genres = profile.prefs.genres.length > 0;
    const source = !warm() ? undefined : alg === 'hyb' ? Features.thompsonSource(profile.adventure, genres, sourceStats()) : Features.pickSource(profile.adventure, genres);
    const tagged = c => { if (c) c.src = source || 'cold'; return c; };
    const ask = () => call('nextCandidate', { likes: plain(profile.likes), heard: profile.heard, exclude: excluded(), adventure: profile.adventure, source, prefs: profile.prefs });
    if (source === 'trail') { // MusicBrainz trails can take ~10 s: run one on the side so the other sources keep filling
      if (!trailing) { trailing = true; ask().then(c => { trailing = false; if (queue.length < 6) accept(tagged(c)); }); }
      continue;
    }
    // Nothing to play at all (first launch, cold cache): two more searches run on the side and the first to land plays. One slow
    // MusicBrainz search no longer holds up the first mystery; net.js paces each request, so this stays polite.
    if (!mystery && !queue.length) while (side < 2) { side++; ask().then(c => { side--; tried++; if (!accept(tagged(c))) finding(); }); }
    const cc = tagged(await ask());
    tried++;
    if (accept(cc)) fails = 0;
    else if (++fails >= 5) {
      if (!mystery) {
        $('#blind-error').hidden = false;
        $('#mystery-title').textContent = 'No mystery yet';
        $('#mystery').setAttribute('aria-busy', false);
      }
      break;
    } else finding();
  }
  filling = false;
}

function setRateEnabled(on) { $$('#rate button').forEach(b => { b.disabled = !on; b.removeAttribute('aria-pressed'); }); }

const playMystery = () => { const m = mystery; play(m, { from: { tab: 'blind', label: tabName('blind') }, onFail: () => { // preview dead: drop silently, never offer this artist again
  if (mystery !== m || rated) return;
  addHeard(m); save(); showMystery();
} }); };

function showMystery() {
  mystery = nextFromQueue();
  rated = false;
  if (mystery) { // count shown mysteries; a returning artist starts its cooldown now
    const b = profile.back;
    b.n++;
    if (mystery.back) { b.last = b.n; b.seen[mystery.artistDzId] = b.n; }
    save();
  }
  $('#reveal').replaceChildren();
  $('#mystery-next').hidden = true; $('#enter-hint').hidden = true;
  $('#mystery-progress').value = 0;
  $('#mystery').classList.remove('is-revealed');
  $$('#deck .sleeve, #deck .verdict').forEach(e => e.remove());
  $('#deck').style.setProperty('--p', 0);
  if (!mystery) {
    tried = 0; finding();
    $('#mystery').setAttribute('aria-busy', true);
    $('#mystery-play').disabled = true; setRateEnabled(false);
    fill(); return;
  }
  shownN++;
  $('#mystery').setAttribute('aria-busy', false);
  $('#mystery-title').textContent = 'Mystery track';
  $('#mystery-play').disabled = false; setRateEnabled(true);
  aboutOf(mystery); // prefetch only; nothing reaches the DOM before the rating
  if (!$('#blind').hidden && navigator.userActivation?.hasBeenActive) playMystery(); // autoplay only where the user is looking (not over the intro or another tab), never before the first tap
  syncPlayState();
  fill();
}

function rate(kind) {
  if (!mystery || rated) return;
  rated = true;
  const m = mystery;
  const extra = m.country ? { country: m.country, decade: m.decade } : {};
  addHeard(m);
  logEvent({ k: 'rate', id: likeKey(m), v: kind, from: 'blind', src: m.src, alg: m.alg });
  if (kind === 'love') like(m, extra); else teach(m, kind); // every rating (Skip and OK too) teaches the taste model
  save();
  const reason = el('p', { className: 'reason' });
  fingerprint(m).then(v => {
    reason.textContent = soundReason(m, v);
    if (v) fill();
  });
  setRateEnabled(false);
  $(`#rate [data-rate=${kind}]`).setAttribute('aria-pressed', true);
  const said = VERDICT[kind];
  // Artist/title enter the DOM only now, after rating. The cover slides out over the record, the name types on.
  $('#deck').prepend(m.cover ? coverImg(m.cover, { className: 'sleeve', alt: `Cover of ${m.title}` }, true) : el('span', { className: 'sleeve cover-ph', ariaHidden: 'true' }));
  $('#deck').append(el('img', { className: 'verdict', src: `img/sticker-${kind}.png`, alt: '' })); // the shop's sticker; the sr-only line below says it
  $('#deck').dataset.verdict = kind;
  const [meta, about] = revealDetails(m);
  $('#mystery-title').textContent = cleanTitle(m.title); // the song's name takes the "Mystery track" line; the artist leads the card below
  $('#reveal').replaceChildren(el('div', { className: 'reveal-card' },
    el('p', { className: 'sr-only', textContent: `You said ${said}. It was ${m.title}, by` }),
    el('h3', { className: 'reveal-artist', textContent: m.artist }),
    meta, m.back ? el('p', { className: 'reason', textContent: `Back again: a deep cut from ${m.back.artist}${m.back.album ? `, off ${m.back.album}${m.back.year ? ` (${m.back.year})` : ''}` : ''}.` }) : null, reason, about,
    el('div', { className: 'reveal-actions' }, loveButton(m, extra), fullSong(m))));
  $('#mystery').classList.add('is-revealed');
  tonight.unshift({ t: m, kind, extra });
  renderTonight();
  if (current === m) { currentExtra = extra; renderNpLike(); renderNpMeta(); remember(m); }
  $('#mystery-next').hidden = false; $('#enter-hint').hidden = false;
  $('#mystery-next').focus({ preventScroll: true }); // focusing the far button scrolled the title under the sticky header
  if (PHONE.matches) $('#mystery').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }); // sleeve, name and verdict in view (scroll-margin clears the header)
}

const VERDICT = { skip: 'Skip', ok: 'OK', love: 'Love' };
// How the pick was found, as a short price-sticker tag ("Random trip: Greece", "Near Oasis").
function whyTag(m) {
  const w = m.why || {};
  return { trip: `Random trip: ${w.place}${m.decade ? `, ${m.decade}s` : ''}`, near: `Near ${w.artist}`, trail: `Via ${w.person}`, genre: `${Dig.genre(Dig.shopGenre(w.genre) || w.genre)} shelf` }[w.kind] || '';
}
// Reveal order: name, then a meta row (how it was found · year · label · genre · album), then the about text clamped to 3 lines.
function revealDetails(m) {
  const tag = whyTag(m);
  const facts = el('ul', { className: 'facts', ariaLabel: 'Release details' });
  const sticker = tag ? el('span', { className: 'sticker', textContent: tag }) : null;
  const meta = el('div', { className: 'meta-row' }, sticker, facts);
  const box = el('div', { className: 'about', ariaBusy: 'true' }, el('p', { className: 'about-text is-loading', textContent: '…' }));
  aboutOf(m).then(({ text, url, facts: f = {} }) => {
    facts.append(...[f.year, f.label, f.genre && Dig.genre(f.genre), f.album].filter(x => x && ![m.title, m.artist].some(n => norm(n) === norm(x))).map(x => el('li', { textContent: x })));
    // The shelf is where it was picked from, not a claim about the song: reword it when the facts name another genre.
    const shelf = norm(m.why && m.why.genre);
    if (sticker && m.why.kind === 'genre' && f.genre && !norm(f.genre).includes(shelf) && !shelf.includes(norm(f.genre))) sticker.textContent = `Picked from your ${Dig.genre(Dig.shopGenre(m.why.genre) || m.why.genre)} shelf`;
    box.setAttribute('aria-busy', 'false');
    if (!text) return box.replaceChildren();
    const p = el('p', { className: 'about-text clamp', textContent: text });
    const more = el('button', { type: 'button', className: 'more-toggle', textContent: 'More' });
    more.setAttribute('aria-expanded', 'false');
    more.onclick = () => { const shut = p.classList.toggle('clamp'); more.textContent = shut ? 'More' : 'Less'; more.setAttribute('aria-expanded', !shut); };
    const src = url ? el('button', { type: 'button', className: 'ext about-src', textContent: 'from Wikipedia',
      ariaLabel: 'Read more on Wikipedia (opens your browser)', onclick: () => api.open(url).catch(() => toast('Could not open the browser')) }) : null;
    box.replaceChildren(p, el('div', { className: 'about-links' }, more, src));
    requestAnimationFrame(() => { more.hidden = p.scrollHeight <= p.clientHeight + 1; }); // short text: nothing to expand
  });
  return [meta, box];
}

// Tonight's reveals: this session's rated mysteries, newest first (in memory only).
function renderTonight() {
  $('#rail-count').textContent = tonight.length || '';
  $('#tonight').replaceChildren(...(tonight.length ? tonight.map(({ t, kind, extra }) => {
    const row = trackRow(t, { extra, from: { tab: 'blind', label: "Tonight's reveals" } }); // the verdict lives on the sleeve stamp only
    row.dataset.verdict = kind;
    return row;
  }) : [el('li', { className: 'rail-empty', textContent: 'Every mystery you rate lands here, newest first, so you can play it again.' })]));
}

$('#rate').addEventListener('click', e => { const b = e.target.closest('[data-rate]'); if (b) rate(b.dataset.rate); });
$('#mystery-next').onclick = () => showMystery();
$('#mystery-play').onclick = () => {
  if (!mystery) return;
  if (current !== mystery) return rated ? play(mystery, { from: { tab: 'blind', label: tabName('blind') } }) : playMystery(); // resume after playing something else
  togglePlay();
};
$('#blind-retry').onclick = () => { fails = 0; tried = 0; finding(); fill(); };
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input, select, textarea')) return;
  // Space on a focused button presses it; elsewhere it is play/pause.
  if (e.key === ' ' && !e.target.closest('button, a, summary, [role=tab]')) { e.preventDefault(); return $('#blind').hidden ? togglePlay() : $('#mystery-play').click(); }
  if (!$('#stamps').hidden) { // R rolls; 1/2/3 rate the song row that has focus
    if (e.key === 'r' || e.key === 'R') return doRoll();
    const row = e.key in { 1: 1, 2: 1, 3: 1 } && e.target.closest?.('#stamp-songs .track');
    return row && row.querySelector(`[data-rate=${['skip', 'ok', 'love'][e.key - 1]}]`).click();
  }
  if ($('#blind').hidden) return;
  if (e.key in { 1: 1, 2: 1, 3: 1 }) rate(['skip', 'ok', 'love'][e.key - 1]);
  else if (e.key === 'Enter' && rated && e.target === document.body) showMystery();
});

const ADVENTURE = [[20, 'Close to what you love'], [45, 'Mostly familiar, a few surprises'],
  [69, 'Half familiar, half strangers'], [89, 'Mostly strangers'], [100, 'Nearly all strangers']];
function showAdventure() {
  const text = ADVENTURE.find(([max]) => profile.adventure <= max)[1];
  $('#adventure-value').textContent = text;
  $('#adventure-help').textContent = profile.likes.length ? '' : 'Love a few tracks first; until then every pick is a stranger.';
  $('#adventure').setAttribute('aria-valuetext', text);
}
$('#adventure').addEventListener('input', e => { profile.adventure = Number(e.target.value); showAdventure(); });
$('#adventure').addEventListener('change', save);

