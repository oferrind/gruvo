// Renderer: UI only. All network/logic runs in main via window.api; profile via window.store.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.filter(k => k != null)); return e; };
const btn = (text, onclick, className = '') => el('button', { type: 'button', className, textContent: text, onclick });
const norm = s => String(s || '').normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const DECADES = [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010];
document.head.append(el('script', { src: 'features.js' })); // Sound Fingerprint math -> window.Features (no bundler, sandboxed: no require)

let profile, countryNames = {};

function save() { store.save(profile).catch(e => toast('Could not save: ' + e.message)); }
function toast(msg) {
  $('#toast').textContent = msg;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $('#toast').textContent = ''; }, 4000);
}
const call = (name, ...args) => api.call(name, ...args).catch(e => { console.error(name, e); return null; });

// One loading / empty / error / done line, with optional progress bar and next-action buttons.
function setState(box, kind, msg, { actions = [], progress } = {}) {
  box.className = `state ${kind}`;
  box.setAttribute('aria-busy', kind === 'loading');
  box.replaceChildren(...[
    msg ? el('p', {}, kind === 'loading' ? el('span', { className: 'spinner', ariaHidden: 'true' }) : null, msg) : null,
    progress ? el('progress', { max: progress[1], value: progress[0], ariaLabel: 'Progress' }) : null,
    actions.length ? el('div', { className: 'row' }, ...actions) : null].filter(Boolean));
}

// ---------- player (one <audio> for the whole app) ----------
const audio = $('#audio');
let current = null, currentExtra = null, retried = false, onFail = null;

async function play(item, { label, onFail: failCb, extra } = {}) {
  current = item; currentExtra = extra || null; retried = false; onFail = failCb || null;
  $('#now-playing').textContent = label || `${item.artist} – ${item.title}`;
  renderNpLike(); syncPlayState();
  // Saved likes have no preview URL (they expire); fetch one at play time.
  const url = item.previewUrl || await call('freshPreview', plain(item));
  if (current !== item) return;
  if (!url) return unavailable();
  audio.src = url;
  audio.play().catch(() => {});
}
function togglePlay() {
  if (!audio.getAttribute('src')) return;
  audio.paused ? audio.play().catch(() => {}) : audio.pause();
}
function unavailable() {
  toast('Preview unavailable for this track');
  if (onFail) onFail();
}
audio.addEventListener('error', async () => {
  const item = current;
  if (!item || !audio.getAttribute('src')) return;
  if (retried) return unavailable();
  retried = true;
  const url = await call('freshPreview', plain(item), true); // bypass cache: token likely expired
  if (current !== item) return;
  if (!url) return unavailable();
  audio.src = url;
  audio.play().catch(() => {});
});
const plain = o => JSON.parse(JSON.stringify(o));

// Keep every play/pause control and the "playing" row highlight in sync with the audio element.
function syncPlayState() {
  const playing = !audio.paused && !!audio.getAttribute('src');
  const setBtn = (b, on) => { b.firstChild.textContent = on ? '❚❚' : '▶'; b.setAttribute('aria-label', on ? 'Pause' : 'Play'); };
  setBtn($('#np-toggle'), playing);
  $('#np-toggle').disabled = !current;
  setBtn($('#mystery-play'), playing && current === mystery);
  $$('.track.is-playing').forEach(r => r.classList.remove('is-playing'));
  $$('.track .play').forEach(b => { b.textContent = '▶'; b.setAttribute('aria-label', b.dataset.label); });
  if (current) $$(`.track[data-key="${CSS.escape(likeKey(current))}"]`).forEach(r => {
    r.classList.add('is-playing');
    const b = r.querySelector('.play');
    if (playing) { b.textContent = '❚❚'; b.setAttribute('aria-label', 'Pause'); }
  });
}
['play', 'pause', 'ended', 'emptied'].forEach(ev => audio.addEventListener(ev, syncPlayState));
audio.addEventListener('timeupdate', () => {
  const p = audio.duration ? audio.currentTime / audio.duration : 0;
  $('#np-progress').value = p;
  $('#np-time').textContent = audio.duration ? `${fmt(audio.currentTime)} / ${fmt(audio.duration)}` : '';
  if (current === mystery) $('#mystery-progress').value = p;
});
$('#np-toggle').onclick = togglePlay;

// Like button in the now-playing bar. An unrated mystery is rated "Love" instead, so nothing leaks.
function renderNpLike() {
  const box = $('#np-like');
  if (!current) return box.replaceChildren();
  if (current === mystery && !rated) return box.replaceChildren(el('button', { type: 'button', className: 'love', textContent: '♡ Love',
    ariaLabel: 'Love this mystery (rates it and reveals it)', onclick: () => rate('love') }));
  box.replaceChildren(loveButton(current, currentExtra));
}

// ---------- likes / rows ----------
// heard: 'dz:<artistId>' when known (R4: same-name artists stay apart), else the normalized name; matches src/music.js isHeard.
const heardKey = name => norm(name) || String(name || '').trim().toLowerCase(); // symbol-only names ("!!!") would normalize to ''
const isHeard = t => (t.artistDzId != null && profile.heard.includes(`dz:${t.artistDzId}`)) || profile.heard.includes(heardKey(t.artist));
const addHeard = t => { const k = t.artistDzId != null ? `dz:${t.artistDzId}` : heardKey(t.artist); if (k && !profile.heard.includes(k)) profile.heard.push(k); };
const likeKey = t => `${t.source}:${t.id}`;
const isLiked = t => profile.likes.some(l => likeKey(l) === likeKey(t));

function like(t, extra = {}) {
  if (isLiked(t)) return;
  const { source, id, title, artist, artistDzId, cover, isrc } = t;
  const entry = { source, id, title, artist, artistDzId, cover, isrc, ...extra, ts: Date.now() };
  profile.likes.push(entry);
  if (entry.country && entry.decade) profile.stamps[`${entry.country}-${entry.decade}`] = (profile.stamps[`${entry.country}-${entry.decade}`] || 0) + 1;
  addHeard(t);
  save();
  afterLikeChange();
}
function unlike(t) {
  const old = profile.likes.find(l => likeKey(l) === likeKey(t));
  const sk = old && old.country && old.decade && `${old.country}-${old.decade}`;
  if (sk && profile.stamps[sk] && !--profile.stamps[sk]) delete profile.stamps[sk]; // R2: unloving undoes its stamp
  profile.likes = profile.likes.filter(l => likeKey(l) !== likeKey(t));
  save();
  afterLikeChange();
}
function afterLikeChange() {
  $$('.love').forEach(b => b.sync && b.sync());
  $('#saved-count').textContent = profile.likes.length || '';
  renderStamps();
  if ($('#saved').hidden) return;
  const i = $$('#saved-list > li').findIndex(r => r.contains(document.activeElement));
  renderSaved(); // R3: Saved reflects unloves immediately
  if (i < 0) return;
  // The focused row was just re-rendered away: land on the next row's Love, else the heading (R6).
  const rows = $$('#saved-list > li .love'), h = $('#saved-like-count').parentElement;
  if (rows.length) return rows[Math.min(i, rows.length - 1)].focus();
  h.tabIndex = -1; h.focus();
}

function loveButton(t, extra) {
  const b = el('button', { type: 'button', className: 'love' });
  b.sync = () => { const on = isLiked(t); b.textContent = on ? '♥ Loved' : '♡ Love'; b.setAttribute('aria-pressed', on); };
  b.setAttribute('aria-label', `Love ${t.artist} – ${t.title}`);
  b.onclick = () => isLiked(t) ? unlike(t) : like(t, extra);
  b.sync();
  return b;
}

// One track row: cover, title / artist, optional reason, play, love. onOpen makes the title a link.
function trackRow(t, { extra, reason, onOpen } = {}) {
  const name = `${t.artist} – ${t.title}`;
  const title = onOpen ? el('button', { type: 'button', className: 'link', textContent: t.title, onclick: onOpen, title: 'See who made this' }) : el('span', { className: 'title', textContent: t.title });
  const playBtn = el('button', { type: 'button', className: 'play', textContent: '▶',
    onclick: () => current && likeKey(current) === likeKey(t) && audio.getAttribute('src') ? togglePlay() : play(t, { extra }) });
  playBtn.dataset.label = `Play ${name}`;
  playBtn.setAttribute('aria-label', playBtn.dataset.label);
  const row = el('li', { className: 'track' },
    t.cover ? el('img', { src: t.cover, alt: '', width: 48, height: 48 }) : el('span', { className: 'cover-ph', ariaHidden: 'true' }),
    playBtn,
    el('div', { className: 'meta' }, title, el('span', { className: 'artist', textContent: t.artist }),
      reason ? el('small', { className: 'reason', textContent: reason }) : null),
    loveButton(t, extra));
  row.dataset.key = likeKey(t);
  if (current && likeKey(current) === row.dataset.key) row.classList.add('is-playing');
  return row;
}

// ---------- tabs + first-launch intro ----------
const tabs = $$('#tabs [role=tab]');
let introOpen = false;
function showTab(name, focus) {
  closeIntro();
  tabs.forEach(b => { const on = b.dataset.tab === name; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
  $$('.panel').forEach(p => { p.hidden = p.id !== name; });
  if (name === 'saved') renderSaved();
}
$('#tabs').addEventListener('click', e => { const t = e.target.closest('[role=tab]'); if (t) showTab(t.dataset.tab); });
// Arrow / Home / End move between tabs (WAI-ARIA tabs pattern).
$('#tabs').addEventListener('keydown', e => {
  const i = tabs.indexOf(document.activeElement);
  const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  showTab(tabs[(to + tabs.length) % tabs.length].dataset.tab, true);
});

const introSeen = () => { try { return localStorage.getItem('introSeen') === '1'; } catch { return true; } };
function openIntro() {
  introOpen = true;
  $('#intro').hidden = false;
  $$('.panel').forEach(p => { p.hidden = true; });
}
function closeIntro() {
  if (!introOpen) return;
  introOpen = false;
  $('#intro').hidden = true;
  try { localStorage.setItem('introSeen', '1'); } catch {}
}
$('#intro-start').onclick = () => {
  showTab('blind');
  if (mystery && current !== mystery) playMystery();
  $('#mystery-play').focus();
};
$$('#intro [data-goto]').forEach(b => { b.onclick = () => showTab(b.dataset.goto); });

// ---------- A. Blind Taste Test ----------
const queue = [];
let mystery = null, rated = false, n = 0, fails = 0, filling = false, srcTurn = 0;

// Sound Fingerprint: once 3 tracks are rated, keep ~6 candidates, listen to each, play the one the taste model likes best.
const warm = () => profile.ratings.length >= 3;
const SOURCES = ['explore', 'trail', 'explore', 'trail', 'neighbour']; // Deezer neighbours: one minor source of five

// Download the preview (main process, CDN allowlist), decode, analyse ~20 s from the middle. Memoised; resolves to the vector or null.
function fingerprint(c) {
  c.fp ??= (async () => {
    try {
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
function nextFromQueue() {
  const ready = queue.filter(c => c.vec);
  if (!warm() || ready.length < 2) return queue.shift() || null;
  const [best, ...rest] = Features.rank(ready, profile.ratings, profile.adventure);
  rest.forEach(c => { c.passed = (c.passed || 0) + 1; });
  const keep = queue.filter(c => c !== best && !(c.passed >= 3));
  queue.splice(0, queue.length, ...keep);
  return best;
}

// Reveal sentence: how it sounds next to your nearest love, plus where it came from.
function soundReason(m, v) {
  const names = Object.fromEntries(profile.likes.map(l => [likeKey(l), `“${l.title}” by ${l.artist}`]));
  const sound = v && window.Features ? Features.explain(v, profile.ratings.filter(r => r.id !== likeKey(m)), names) : '';
  return sound && m.via ? `${sound}; found via ${m.via}` : sound || m.reason || '';
}

async function fill() {
  if (filling) return;
  filling = true;
  $('#blind-error').hidden = true;
  while (queue.length < (warm() ? 6 : 3)) {
    const exclude = [...queue, mystery].filter(Boolean).map(c => norm(c.artist));
    const source = warm() ? SOURCES[srcTurn++ % SOURCES.length] : undefined;
    const c = await call('nextCandidate', { likes: plain(profile.likes), heard: profile.heard, exclude, adventure: profile.adventure, source });
    if (c && !isHeard(c) &&!exclude.includes(norm(c.artist))) {
      fails = 0;
      queue.push(c);
      fingerprint(c);
      if (!mystery) showMystery();
    } else if (++fails >= 5) {
      if (!mystery) {
        $('#blind-error').hidden = false;
        $('#mystery-title').textContent = 'No mystery yet';
        $('#mystery').setAttribute('aria-busy', false);
      }
      break;
    }
  }
  filling = false;
}

function setRateEnabled(on) { $$('#rate button').forEach(b => { b.disabled = !on; b.removeAttribute('aria-pressed'); }); }

const playMystery = () => { const m = mystery; play(m, { label: `Mystery #${n}: rate it to reveal`, onFail: () => { // preview dead: drop silently, never offer this artist again
  if (mystery !== m || rated) return;
  addHeard(m); save(); showMystery();
} }); };

function showMystery() {
  mystery = nextFromQueue();
  rated = false;
  $('#reveal').replaceChildren();
  $('#mystery-next').hidden = true;
  $('#mystery-progress').value = 0;
  $('#mystery').classList.remove('is-revealed');
  if (!mystery) {
    $('#mystery-title').textContent = 'Finding the next mystery…';
    $('#mystery').setAttribute('aria-busy', true);
    $('#mystery-play').disabled = true; setRateEnabled(false);
    fill(); return;
  }
  n++;
  $('#mystery').setAttribute('aria-busy', false);
  $('#mystery-title').textContent = `Mystery #${n}`;
  $('#mystery-play').disabled = false; setRateEnabled(true);
  if (!$('#blind').hidden) playMystery(); // autoplay only where the user is looking (not over the intro or another tab)
  syncPlayState();
  fill();
}

function rate(kind) {
  if (!mystery || rated) return;
  rated = true;
  const m = mystery;
  const extra = m.country ? { country: m.country, decade: m.decade } : {};
  addHeard(m);
  if (kind === 'love') like(m, extra);
  save();
  const reason = el('p', { className: 'reason', textContent: m.reason || '' });
  // Every rating (Skip and OK too) teaches the taste model, once the track has been listened to.
  fingerprint(m).then(v => {
    reason.textContent = soundReason(m, v);
    if (!v) return;
    profile.ratings = [...profile.ratings, { id: likeKey(m), rating: kind, features: v }].slice(-500); // store.js keeps the same cap
    save();
    fill();
  });
  setRateEnabled(false);
  $(`#rate [data-rate=${kind}]`).setAttribute('aria-pressed', true);
  // Artist/title enter the DOM only now, after rating.
  $('#reveal').replaceChildren(el('div', { className: 'reveal-card' },
    m.cover ? el('img', { src: m.cover, alt: `Cover of ${m.title}`, width: 128, height: 128 }) : el('span', { className: 'cover-ph big', ariaHidden: 'true' }),
    el('div', { className: 'reveal-text' },
      el('p', { className: 'eyebrow', textContent: `You said ${{ skip: 'Skip', ok: 'OK', love: 'Love' }[kind]}. It was…` }),
      el('h3', { className: 'reveal-artist', textContent: m.artist }),
      el('p', { className: 'reveal-title', textContent: m.title }),
      reason,
      loveButton(m, extra))));
  $('#mystery').classList.add('is-revealed');
  if (current === m) { $('#now-playing').textContent = `${m.artist} – ${m.title}`; currentExtra = extra; renderNpLike(); }
  $('#mystery-next').hidden = false;
  $('#mystery-next').focus();
}

$('#rate').addEventListener('click', e => { const b = e.target.closest('[data-rate]'); if (b) rate(b.dataset.rate); });
$('#mystery-next').onclick = () => showMystery();
$('#mystery-play').onclick = () => {
  if (!mystery) return;
  if (current !== mystery) return rated ? play(mystery) : playMystery(); // resume after playing something else
  togglePlay();
};
$('#blind-retry').onclick = () => { fails = 0; $('#mystery-title').textContent = 'Finding your first mystery…'; fill(); };
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches?.('input, select, textarea')) return;
  // Space on a focused button presses it; elsewhere it is play/pause.
  if (e.key === ' ' && !e.target.closest('button, a, [role=tab]')) { e.preventDefault(); return $('#blind').hidden ? togglePlay() : $('#mystery-play').click(); }
  if ($('#blind').hidden) return;
  if (e.key in { 1: 1, 2: 1, 3: 1 }) rate(['skip', 'ok', 'love'][e.key - 1]);
  else if (e.key === 'Enter' && rated && e.target === document.body) showMystery();
});

const ADVENTURE = [[20, 'Stays close to artists you loved.'], [45, 'Mostly familiar, a few surprises.'],
  [69, 'Half near what you loved, half complete strangers.'], [89, 'Mostly strangers, wandering further from your taste.'], [100, 'Almost all complete strangers.']];
function showAdventure() {
  const v = profile.adventure;
  const text = ADVENTURE.find(([max]) => v <= max)[1];
  $('#adventure-value').textContent = `${v} · ${text}${profile.likes.length ? '' : ' Love a few tracks first; until then every pick is a stranger.'}`;
  $('#adventure').setAttribute('aria-valuetext', `${v}, ${text}`);
}
$('#adventure').addEventListener('input', e => { profile.adventure = Number(e.target.value); showAdventure(); });
$('#adventure').addEventListener('change', save);

// ---------- B. Sonic Passport ----------
let ppRun = 0, ppCountry = null, ppDecade = null;

function buildPassport(countries) {
  const box = $('#countries');
  for (const [continent, list] of Object.entries(countries)) {
    const chips = Object.entries(list).map(([cc, name]) => {
      countryNames[cc] = name;
      const b = btn(name, () => pickCountry(cc), 'chip');
      b.dataset.cc = cc;
      return b;
    });
    box.append(el('div', { className: 'chip-group' }, el('h3', { textContent: continent }), el('div', { className: 'chips' }, ...chips)));
  }
  for (const d of DECADES) { const b = btn(`${d}s`, () => pickDecade(d), 'chip'); b.dataset.decade = d; $('#decades').append(b); }
  passportIdle();
}
function syncPicker() {
  $$('#countries .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.cc === ppCountry));
  $$('#decades .chip').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.decade) === ppDecade));
}
function passportIdle() {
  const ideas = [['NG', 1970], ['JP', 1980], ['BR', 1960]];
  setState($('#passport-state'), 'empty', ppCountry ? `${countryNames[ppCountry]} selected. Now pick a decade.`
    : ppDecade ? `${ppDecade}s selected. Now pick a country.` : 'Pick a decade and a country, or try one of these:',
  { actions: ppCountry || ppDecade ? [] : ideas.map(([cc, d]) => btn(`${countryNames[cc]} · ${d}s`, () => runPassport(cc, d), 'chip')) });
}
function pickCountry(cc) { ppCountry = cc; syncPicker(); ppDecade ? runPassport(cc, ppDecade) : passportIdle(); }
function pickDecade(d) { ppDecade = d; syncPicker(); ppCountry ? runPassport(ppCountry, d) : passportIdle(); }

// Search-as-you-type over the country chips; Enter picks the first match, Escape clears.
$('#country-q').addEventListener('input', e => {
  const q = norm(e.target.value);
  $$('.chip-group').forEach(g => {
    let any = false;
    g.querySelectorAll('.chip').forEach(b => { b.hidden = !norm(b.textContent).includes(q); any ||= !b.hidden; });
    g.hidden = !any;
  });
});
$('#country-q').addEventListener('keydown', e => {
  if (e.key === 'Enter') { const b = $$('#countries .chip').find(c => !c.hidden); if (b) b.click(); }
  else if (e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input')); }
});

async function runPassport(cc, decade) {
  const run = ++ppRun;
  ppCountry = cc; ppDecade = decade;
  syncPicker();
  const where = `${countryNames[cc]}, ${decade}s`;
  const state = $('#passport-state');
  const list = $('#passport-results');
  list.replaceChildren();
  setState(state, 'loading', `Asking MusicBrainz who made music in ${where}…`);
  const names = await call('passportArtists', cc, decade);
  if (run !== ppRun) return;
  if (!names) return setState(state, 'error', "Couldn't reach MusicBrainz. Check your connection.", { actions: [btn('Try again', () => runPassport(cc, decade), 'primary')] });
  const neighbours = () => [decade - 10, decade + 10].filter(d => DECADES.includes(d)).map(d => btn(`Try the ${d}s`, () => runPassport(cc, d)));
  if (!names.length) return setState(state, 'empty', `No recorded artists for ${where} yet.`, { actions: neighbours() });
  const misses = [], max = Math.min(30, names.length);
  let found = 0, tried = 0;
  for (const name of names) {
    if (found >= 10 || tried >= 30) break;
    tried++;
    setState(state, 'loading', `Finding playable tracks from ${where}: ${found} of 10 found. Tracks appear below as they arrive; this can take up to a minute.`, { progress: [tried, max] });
    const t = await call('resolvePreview', name);
    if (run !== ppRun) return;
    if (t) { found++; list.append(trackRow(t, { extra: { country: cc, decade }, reason: `${where}` })); } else misses.push(name);
  }
  if (!found) setState(state, 'empty', `Found artists from ${where}, but none with a playable preview.`, { actions: neighbours() });
  else setState(state, 'done', `${found} playable tracks from ${where}. Love one to collect the stamp.`);
  if (found < 3) for (const name of misses) list.append(el('li', { className: 'track nopreview', textContent: `${name} (no preview)` }));
}

function stampItems() {
  const keys = Object.keys(profile.stamps).sort();
  if (!keys.length) return [el('li', { className: 'muted', textContent: 'No stamps yet. Love a track from Passport to collect its country and decade.' })];
  return keys.map(k => {
    const [cc, d] = k.split('-');
    const b = el('button', { type: 'button', className: 'stamp', onclick: () => { showTab('passport'); runPassport(cc, Number(d)); },
      ariaLabel: `${countryNames[cc] || cc}, ${d}s, ${profile.stamps[k]} loved. Open in Passport` },
    el('span', { className: 'stamp-country', textContent: countryNames[cc] || cc }), el('span', { className: 'stamp-decade', textContent: `${d}s` }));
    return el('li', {}, b);
  });
}
function renderStamps() {
  const count = Object.keys(profile.stamps).length;
  $('#stamp-count').textContent = count;
  $('#stamps').replaceChildren(...stampItems());
}

// ---------- C. Liner Notes Trail + Covers ----------
let lnRun = 0, crumbs = [], coverHits = [];
const lnState = (kind, msg, opts) => setState($('#liner-state'), kind, msg, opts);

$('#liner-search').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#liner-q').value.trim();
  if (!q) return $('#liner-q').focus();
  const run = ++lnRun;
  crumbs = []; renderCrumbs();
  for (const id of ['#credits', '#trail', '#covers-list']) $(id).replaceChildren();
  $('#trail-title').hidden = true; $('#liner-subtabs').hidden = true;
  lnState('loading', `Searching for "${q}"…`);
  const hits = await call('searchTracks', q);
  if (run !== lnRun) return; // a newer search or an opened track took over
  if (!hits) return lnState('error', "Couldn't reach Deezer. Check your connection.", { actions: [btn('Try again', () => $('#liner-search').requestSubmit(), 'primary')] });
  lnState(hits.length ? 'done' : 'empty', hits.length ? 'Pick the right song to see who made it.' : `No songs found for "${q}". Try artist and title, e.g. "Radiohead Creep".`);
  $('#liner-hits').replaceChildren(...hits.map(t => trackRow(t, { onOpen: () => { crumbs = []; $('#liner-hits').replaceChildren(); openTrack(t); } })));
});
for (const q of ['Radiohead Creep', 'Stevie Wonder Superstition', 'Portishead Glory Box'])
  $('#liner-examples').append(btn(q, () => { $('#liner-q').value = q; $('#liner-search').requestSubmit(); }, 'chip'));
// Arrow keys move between results; Down from the search box enters the list; Escape clears.
$('#liner').addEventListener('keydown', e => {
  if (e.key === 'Escape' && e.target.id === 'liner-q') { e.target.value = ''; $('#liner-hits').replaceChildren(); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const links = $$('#liner-hits .link');
  if (!links.length) return;
  const i = links.indexOf(document.activeElement);
  if (i < 0 && e.target.id !== 'liner-q') return;
  e.preventDefault();
  links[Math.max(0, Math.min(links.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
});

function goCrumb(i) { const c = crumbs[i]; crumbs = crumbs.slice(0, i); c.fn(); }
function renderCrumbs() {
  $('#trail-nav').hidden = !crumbs.length;
  $('#liner-back').disabled = crumbs.length < 2;
  $('#crumbs').replaceChildren(...crumbs.map((c, i) => el('li', {}, i === crumbs.length - 1
    ? el('span', { className: 'crumb', textContent: c.label, ariaCurrent: 'step' })
    : btn(c.label, () => goCrumb(i), 'crumb link'))));
}
function pushCrumb(label, fn) { crumbs.push({ label, fn }); renderCrumbs(); }
$('#liner-back').onclick = () => { if (crumbs.length > 1) goCrumb(crumbs.length - 2); };

async function openTrack(t) {
  const run = ++lnRun;
  pushCrumb(`♪ ${t.title} (${t.artist})`, () => openTrack(t));
  $('#credits').replaceChildren(); $('#trail').replaceChildren(); $('#covers-list').replaceChildren();
  $('#trail-title').hidden = true; $('#liner-subtabs').hidden = true; showSub('credits');
  lnState('loading', `Asking MusicBrainz who made "${t.title}"… (each step takes about 1.5 s)`);
  const c = await call('credits', { recId: t.recId, isrc: t.isrc, title: t.title, artist: t.artist });
  if (run !== lnRun) return;
  if (!c) return lnState('empty', `MusicBrainz has no record of "${t.title}" yet. Try another song.`, { actions: [btn('New search', () => $('#liner-q').focus())] });
  lnState('', '');
  $('#liner-subtabs').hidden = !c.work;
  coverWork = c.work && { ...c.work, artist: c.artist, loaded: false };
  const box = $('#credits');
  box.append(el('h2', { textContent: `Who made "${c.title}"` }), el('p', { className: 'muted', textContent: `by ${c.artist}` }));
  if (!c.hasCredits) {
    box.append(el('p', { className: 'state empty', textContent: `MusicBrainz has no credits for this recording yet.${c.work ? ' You can still hear its covers.' : ''}` }));
    if (c.country && countryNames[c.country]) box.append(btn(`Explore ${countryNames[c.country]} in Passport`,
      () => { showTab('passport'); runPassport(c.country, ppDecade || 1970); }));
    return;
  }
  box.append(el('p', { className: 'hint', textContent: 'Pick a person to hear other music they worked on.' }));
  for (const g of c.groups) {
    box.append(el('h3', { className: 'role', textContent: g.role }),
      el('ul', { className: 'people' }, ...g.people.map(p => el('li', {}, el('button', { type: 'button', className: 'person',
        ariaLabel: `${p.name}, ${g.role}. Show their other work`, onclick: () => openPerson(p, g.role, c) },
      el('span', { textContent: p.name }), el('span', { className: 'arrow', ariaHidden: 'true', textContent: '→' }))))));
  }
}

async function openPerson(p, role, ctx) {
  const run = ++lnRun;
  pushCrumb(`${p.name} (${role})`, () => openPerson(p, role, ctx));
  $('#credits').replaceChildren(); $('#liner-subtabs').hidden = true; showSub('credits');
  const list = $('#trail');
  list.replaceChildren();
  $('#trail-title').hidden = false;
  $('#trail-title').replaceChildren(`Other music ${p.name} worked on`, el('small', { className: 'muted', textContent: ` (${role} on ${ctx.artist} – ${ctx.title})` }));
  lnState('loading', `Asking MusicBrainz about ${p.name}…`);
  const picks = await call('personTrail', p.id, ctx.artist, profile.heard);
  if (run !== lnRun) return;
  if (!picks) return lnState('error', "Couldn't reach MusicBrainz.", { actions: [btn('Try again', () => { crumbs.pop(); openPerson(p, role, ctx); }, 'primary')] });
  if (!picks.length) return lnState('empty', `No other artists found for ${p.name}.`, { actions: [btn('← Back', () => $('#liner-back').click())] });
  let found = 0;
  for (const [i, pick] of picks.entries()) {
    lnState('loading', `Finding previews: ${i + 1} of ${picks.length}. Select a title to follow the trail.`, { progress: [i + 1, picks.length] });
    const t = await call('resolvePreview', pick.artist, pick.title);
    if (run !== lnRun) return;
    if (!t) continue;
    found++;
    list.append(trackRow(t, { reason: `${p.name}, ${pick.role}, for ${pick.artist}`,
      onOpen: () => openTrack({ recId: pick.recId, title: pick.title, artist: pick.artist }) }));
  }
  lnState(found ? 'done' : 'empty', found ? `${found} playable of ${picks.length} artists. Select a title to see its credits and keep going.` : `None of ${p.name}'s other work has a playable preview.`);
}

let coverWork = null;
function showSub(name) {
  $('#credits').hidden = name !== 'credits';
  $('#covers').hidden = name !== 'covers';
  $$('#liner-subtabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.sub === name));
  if (name === 'covers' && coverWork && !coverWork.loaded) loadCovers(coverWork);
}
$('#liner-subtabs').addEventListener('click', e => { if (e.target.dataset.sub) showSub(e.target.dataset.sub); });

async function loadCovers(w) {
  w.loaded = true;
  const run = lnRun;
  coverHits = [];
  const list = $('#covers-list');
  list.replaceChildren();
  lnState('loading', `Asking MusicBrainz for covers of "${w.title}"…`);
  const names = (await call('covers', w.id, w.artist)) || [];
  if (run !== lnRun) return;
  let tried = 0;
  const max = Math.min(25, names.length);
  for (const name of names) {
    if (coverHits.length >= 8 || tried >= 25) break;
    tried++;
    lnState('loading', `Finding cover previews: ${coverHits.length} found so far.`, { progress: [tried, max] });
    const t = await call('resolvePreview', name, w.title, true);
    if (run !== lnRun) return;
    if (t) { coverHits.push(t); list.append(trackRow(t, { reason: `Cover of ${w.artist}` })); }
  }
  lnState(coverHits.length ? 'done' : 'empty', names.length ? `${coverHits.length} playable covers.` : 'No covers recorded in MusicBrainz.');
}
$('#spin').onclick = () => coverHits.length ? play(coverHits[Math.floor(Math.random() * coverHits.length)]) : toast('No covers loaded yet');

// ---------- Saved ----------
function renderSaved() {
  $('#saved-stamp-count').textContent = Object.keys(profile.stamps).length;
  $('#saved-stamps').replaceChildren(...stampItems());
  $('#saved-like-count').textContent = profile.likes.length;
  const list = $('#saved-list');
  list.replaceChildren(...profile.likes.slice().reverse().map(t => trackRow(t, {
    extra: t.country ? { country: t.country, decade: t.decade } : undefined, // re-loving from the now-playing bar keeps the stamp
    reason: [t.country && `${countryNames[t.country] || t.country}, ${t.decade}s`, t.ts && `loved ${new Date(t.ts).toLocaleDateString()}`].filter(Boolean).join(' · ') })));
  if (!profile.likes.length) list.append(el('li', { className: 'state empty' },
    el('p', { textContent: 'Nothing saved yet. Press Love on any track to keep it here.' }),
    el('div', { className: 'row' }, btn('Start a Blind Test', () => showTab('blind'), 'primary'), btn('Open Passport', () => showTab('passport')))));
}

// ---------- start ----------
(async () => {
  profile = await store.load();
  buildPassport(await api.countries());
  $('#adventure').value = profile.adventure;
  showAdventure();
  afterLikeChange();
  if (!introSeen() && !profile.likes.length) openIntro();
  fill();
})();
