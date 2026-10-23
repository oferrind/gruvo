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
  box.replaceChildren(fullSong(current), loveButton(current, currentExtra));
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
  const { source, id, title, artist, artistDzId, albumId, cover, isrc } = t;
  const entry = { source, id, title, artist, artistDzId, albumId, cover, isrc, ...extra, ts: Date.now() };
  profile.likes.push(entry);
  if (entry.country && entry.decade) profile.stamps[`${entry.country}-${entry.decade}`] = (profile.stamps[`${entry.country}-${entry.decade}`] || 0) + 1;
  addHeard(t);
  save();
  afterLikeChange();
  teach(t, 'love');
}
// Upsert this track's taste-model rating once its fingerprint is known (no preview / decode failure: nothing learned).
function teach(t, kind) {
  fingerprint(t).then(v => {
    if (!v || (kind === 'love' && !isLiked(t))) return; // unloved while we were listening
    profile.ratings = [...profile.ratings.filter(r => r.id !== likeKey(t)), { id: likeKey(t), rating: kind, features: v }].slice(-500); // store.js keeps the same cap
    save();
  });
}
function unlike(t) {
  const old = profile.likes.find(l => likeKey(l) === likeKey(t));
  const sk = old && old.country && old.decade && `${old.country}-${old.decade}`;
  if (sk && profile.stamps[sk] && !--profile.stamps[sk]) delete profile.stamps[sk]; // R2: unloving undoes its stamp
  profile.likes = profile.likes.filter(l => likeKey(l) !== likeKey(t));
  profile.ratings = profile.ratings.filter(r => r.id !== likeKey(t) || r.rating !== 'love');
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

// "Listen to the full song" (previews stop at 30 s): opens the default browser via main's https allowlist. Only for revealed tracks.
function fullSong(t) {
  const q = encodeURIComponent(`${t.artist} ${t.title}`);
  const dz = t.source === 'dz' ? `https://www.deezer.com/track/${encodeURIComponent(t.id)}` : `https://www.deezer.com/search/${q}`;
  const link = (name, url) => el('button', { type: 'button', className: 'ext', textContent: name,
    ariaLabel: `Listen to the full song on ${name} (opens your browser)`, onclick: () => api.open(url).catch(() => toast('Could not open the browser')) });
  return el('span', { className: 'full-song' }, el('span', { className: 'full-label', textContent: 'Full song:' }),
    link('YouTube', `https://www.youtube.com/results?search_query=${q}`), link('Spotify', `https://open.spotify.com/search/${q}`), link('Deezer', dz));
}

// One track row: cover, title / artist, optional reason, play, love. onOpen makes the title a link.
function trackRow(t, { extra, reason, onOpen, full, tag = 'li' } = {}) {
  const name = `${t.artist} – ${t.title}`;
  const title = onOpen ? el('button', { type: 'button', className: 'link', textContent: t.title, onclick: onOpen, title: 'Grow its family tree' }) : el('span', { className: 'title', textContent: t.title });
  const playBtn = el('button', { type: 'button', className: 'play', textContent: '▶',
    onclick: () => current && likeKey(current) === likeKey(t) && audio.getAttribute('src') ? togglePlay() : play(t, { extra }) });
  playBtn.dataset.label = `Play ${name}`;
  playBtn.setAttribute('aria-label', playBtn.dataset.label);
  const row = el(tag, { className: 'track' },
    t.cover ? el('img', { src: t.cover, alt: '', width: 48, height: 48 }) : el('span', { className: 'cover-ph', ariaHidden: 'true' }),
    playBtn,
    el('div', { className: 'meta' }, title, el('span', { className: 'artist', textContent: t.artist }),
      reason ? el('small', { className: 'reason', textContent: reason }) : null, full ? fullSong(t) : null, full ? aboutDetails(t) : null),
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
  if (name === 'prefs') renderPrefs();
  if (name === 'tree') renderTreePicker();
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
  prefsMode(false); // the first-launch preferences step is over
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
let mystery = null, rated = false, fails = 0, filling = false, trailing = false, srcTurn = 0;

// Sound Fingerprint: once 3 tracks are rated, keep ~6 candidates, listen to each, play the one the taste model likes best.
const warm = () => profile.ratings.length >= 3;
const SOURCES = ['explore', 'trail', 'explore', 'trail', 'neighbour', 'genre']; // Deezer neighbours: minor; 'genre' falls back to a random trip without chosen genres

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
  const keep = queue.filter(c => c !== best && !(c.passed >= 3) && c.vec !== null); // vec null = preview failed to decode: can't be ranked, drop it
  queue.splice(0, queue.length, ...keep);
  return best;
}

// "Why you got this": where it came from, plus the sound match only when it is close. Phrasing rotates between reveals.
let lastWhy;
function soundReason(m, v) {
  const names = { ...seedNames(), ...Object.fromEntries(profile.likes.map(l => [likeKey(l), `“${l.title}” by ${l.artist}`])) };
  const sound = v && window.Features ? Features.explain(v, profile.ratings.filter(r => r.id !== likeKey(m)), names, { close: true }) : '';
  if (!m.why) return sound || m.reason || '';
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
    const chips = [facts.album, facts.year, facts.label, facts.genre].filter(Boolean).map(f => el('li', { textContent: f }));
    box.replaceChildren(...[
      text && el('p', { className: 'about-text' }, text, url ? ' ' : null, url ? el('button', { type: 'button', className: 'ext about-src', textContent: 'Wikipedia',
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
  if (!c || isHeard(c) || excluded().includes(norm(c.artist))) return false;
  queue.push(c);
  fingerprint(c);
  if (!mystery) showMystery();
  return true;
}

async function fill() {
  if (filling) return;
  filling = true;
  $('#blind-error').hidden = true;
  while (queue.length < (warm() ? 6 : 3)) {
    const source = warm() ? SOURCES[srcTurn++ % SOURCES.length] : undefined;
    const ask = () => call('nextCandidate', { likes: plain(profile.likes), heard: profile.heard, exclude: excluded(), adventure: profile.adventure, source, prefs: profile.prefs });
    if (source === 'trail') { // MusicBrainz trails can take ~10 s: run one on the side so the other sources keep filling
      if (!trailing) { trailing = true; ask().then(c => { trailing = false; if (queue.length < 6) accept(c); }); }
      continue;
    }
    if (accept(await ask())) fails = 0;
    else if (++fails >= 5) {
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

const playMystery = () => { const m = mystery; play(m, { label: 'Mystery track: rate it to reveal', onFail: () => { // preview dead: drop silently, never offer this artist again
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
  $('#mystery').setAttribute('aria-busy', false);
  $('#mystery-title').textContent = 'Mystery track';
  $('#mystery-play').disabled = false; setRateEnabled(true);
  aboutOf(mystery); // prefetch only; nothing reaches the DOM before the rating
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
  if (kind === 'love') like(m, extra); else teach(m, kind); // every rating (Skip and OK too) teaches the taste model
  save();
  const reason = el('p', { className: 'reason' });
  fingerprint(m).then(v => {
    reason.textContent = soundReason(m, v);
    if (v) fill();
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
      aboutBlock(m),
      reason,
      loveButton(m, extra), fullSong(m))));
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
  setState(state, 'loading', 'Searching…');
  const names = await call('passportArtists', cc, decade);
  if (run !== ppRun) return;
  if (!names) return setState(state, 'error', "Couldn't search right now. Check your connection.", { actions: [btn('Try again', () => runPassport(cc, decade), 'primary')] });
  const neighbours = () => [decade - 10, decade + 10].filter(d => DECADES.includes(d)).map(d => btn(`Try the ${d}s`, () => runPassport(cc, d)));
  if (!names.length) return setState(state, 'empty', `No recorded artists for ${where} yet.`, { actions: neighbours() });
  const misses = [], max = Math.min(30, names.length);
  let found = 0, tried = 0;
  for (const name of names) {
    if (found >= 10 || tried >= 30) break;
    tried++;
    setState(state, 'loading', `Searching… ${found} of 10`, { progress: [tried, max] });
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

// ---------- C. Family Tree ----------
// main builds the tree (src/tree.js) and streams nodes over 'tree:node'; a newer tree's run number drops the old one's.
let trRun = 0, trSearch = 0, trBusy = 0, trNodes = [], trRoots = [], trEls = new Map();
const trState = (kind, msg, opts) => setState($('#tree-state'), kind, msg, opts);
const trWork = d => { trBusy += d; if (trBusy) trState('loading', 'Searching…'); };

function renderTreePicker() {
  trRoots = profile.likes.slice().reverse(); // newest first
  $('#tree-root').replaceChildren(...trRoots.map((t, i) => el('option', { value: i, textContent: `${t.title} – ${t.artist}` })));
  $('#tree-pick').hidden = !trRoots.length;
  if (!trRoots.length && !trNodes.length) trState('empty', 'Nothing saved yet. Search any song to grow its tree, or save songs in Blind Test or Passport.',
    { actions: [btn('Search a song', () => $('#tree-q').focus(), 'primary')] });
}
$('#tree-pick').addEventListener('submit', e => { e.preventDefault(); const t = trRoots[$('#tree-root').value]; if (t) growTree(t); });
$('#tree-search').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#tree-q').value.trim();
  if (!q) return $('#tree-q').focus();
  const run = ++trSearch;
  trState('loading', 'Searching…');
  const hits = await call('searchTracks', q);
  if (run !== trSearch) return;
  if (!hits) return trState('error', "Couldn't search right now. Check your connection.", { actions: [btn('Try again', () => $('#tree-search').requestSubmit(), 'primary')] });
  trState(hits.length ? 'done' : 'empty', hits.length ? 'Pick the song to grow its tree.' : `No songs found for "${q}". Try artist and title, e.g. "Oasis Wonderwall".`);
  $('#tree-hits').replaceChildren(...hits.map(t => trackRow(t, { onOpen: () => { $('#tree-hits').replaceChildren(); growTree(t); } })));
});

async function growTree(root) {
  const run = ++trRun;
  trNodes = []; trBusy = 0; trEls = new Map();
  $('#tree-canvas').replaceChildren();
  trWork(1);
  const ok = await api.tree(plain(root), profile.heard, run).catch(e => { console.error('tree', e); return null; });
  if (run !== trRun) return;
  trBusy--;
  if (ok === null) return trState('error', "Couldn't grow the tree right now. Check your connection.", { actions: [btn('Try again', () => growTree(root), 'primary')] });
  if (trBusy) return;
  if (trNodes.length > 1) trState('done', '');
  else trState('empty', 'No family found yet.', { actions: [btn('Try More', () => trNodes[0] && moreTree(trNodes[0]))] });
}
api.onTreeNode((run, n) => { if (run === trRun) { trNodes[n.id] = n; renderTree({ nodes: trNodes }); } });

// Render hook for the Family Tree. model.nodes: {id, parentId, depth, edgeType, label, track}; this adds `step` (a stable label: 1, 1.2, 1.2.1) and `spine`.
// Each node is built once (open About panels survive re-renders). Children sit in one .branch per edgeType under their
// parent, so each category can be drawn as its own branch off the path. The spine is the root plus its children, in
// step order. Fires 'tree:updated' on #tree-canvas after every change (stream or More) so connectors can be redrawn.
const EDGE_NAMES = { scene: 'Same scene', member: 'Member moved', builton: 'Built on', roots: 'Roots', producer: 'Same producer', label: 'Same label', related: 'Fans also play' };
function renderTree(model) {
  const canvas = $('#tree-canvas');
  for (const n of model.nodes) if (n && !trEls.has(n.id)) placeNode(n, canvas);
  // Guided path: document order is depth-first pre-order, so numbering the nodes in order reads like a walk.
  let stop = 0;
  $$('#tree-canvas .tree-node').forEach(e => {
    const n = model.nodes[e.dataset.nodeId];
    n.step = e.dataset.step; n.spine = n.depth <= 1;
    e.dataset.spine = n.spine;
    e.classList.toggle('alt', n.spine && stop++ % 2 === 1); // spine stops swap sides, so the path winds
  });
  canvas.dispatchEvent(new CustomEvent('tree:updated', { detail: model }));
}

// Category icons: 16px stroke glyphs, so a branch reads by shape and label as well as colour.
const EDGE_ICONS = {
  scene: 'M8 14.5s-4.5-4.6-4.5-8a4.5 4.5 0 0 1 9 0c0 3.4-4.5 8-4.5 8zM8 8.2a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4z',
  member: 'M8 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 14c0-2.8 2.2-5 5-5s5 2.2 5 5',
  builton: 'M8 2 2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3',
  roots: 'M8 2v6M8 8c0 2-2 3-4 5M8 8c0 2 2 3 4 5M8 10v4',
  producer: 'M4 2v12M8 2v12M12 2v12M2.5 10h3M6.5 5h3M10.5 8h3',
  label: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  related: 'M6 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};
const svgEl = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const edgeIcon = edge => { const s = svgEl('svg', { viewBox: '0 0 16 16', class: 'edge-icon', 'aria-hidden': 'true' }); s.append(svgEl('path', { d: EDGE_ICONS[edge] || EDGE_ICONS.related })); return s; };

function placeNode(n, canvas) {
  const row = trackRow(n.track, { reason: n.label || 'Your song', full: true, tag: 'div' });
  if (EDGE_ICONS[n.edgeType]) row.querySelector('.reason').prepend(edgeIcon(n.edgeType));
  const more = btn('+ More', () => moreTree(n), 'more');
  more.setAttribute('aria-label', `More from this branch: ${n.track.artist} – ${n.track.title}`);
  // Secondary actions sit in one quiet row under the song: Love, About, Full song (folded), More.
  const full = el('details', { className: 'full-more' }, el('summary', { textContent: 'Full song' }), row.querySelector('.full-song'));
  const actions = el('div', { className: 'node-actions' }, row.querySelector('.love'), row.querySelector('.about-more'), full, more);
  const card = el('div', { className: 'node-card' }, el('span', { className: 'step' }), row, actions);
  const node = el(n.parentId == null ? 'div' : 'li', { className: 'tree-node grow' }, card, el('div', { className: 'branches' }));
  Object.assign(node.dataset, { nodeId: n.id, parentId: n.parentId ?? '', edge: n.edgeType, depth: n.depth });
  trEls.set(n.id, node);
  trResize.observe(card);
  node.addEventListener('animationend', e => { if (e.target === card) node.classList.remove('grow'); });
  if (n.parentId == null) { node.dataset.step = '0'; return canvas.append(node); }
  // Stable guided steps: a parent's k-th child is k (spine) or <parent step>.k, in arrival order; More never renumbers.
  const parent = trEls.get(n.parentId), branches = parent.querySelector(':scope > .branches');
  const k = parent.dataset.kids = Number(parent.dataset.kids || 0) + 1;
  node.dataset.step = n.step = n.depth === 1 ? `${k}` : `${parent.dataset.step}.${k}`;
  card.querySelector('.step').textContent = n.step;
  // The spine keeps arrival order: a stop joins the last sign only if it is the same category, else opens a new one.
  let branch = n.depth === 1 ? branches.lastElementChild : branches.querySelector(`:scope > .branch[data-edge="${n.edgeType}"]`);
  if (branch && branch.dataset.edge !== n.edgeType) branch = null;
  if (!branch) branches.append(branch = el('section', { className: 'branch' },
    el('h3', { className: 'branch-name' }, edgeIcon(n.edgeType), EDGE_NAMES[n.edgeType] || n.edgeType), el('ol')));
  branch.dataset.edge = n.edgeType;
  branch.querySelector('ol').append(node);
}

// Connectors: one SVG under the nodes (decorative, aria-hidden). The spine is a winding trail through the stops;
// each stop's categories leave it on parallel rails; songs hang off a category by elbows. Paths are kept by key
// so a line that is still drawing in is not restarted by the next streamed node.
let trFrame = 0, trPaths = new Map();
const trResize = new ResizeObserver(() => drawTree());
trResize.observe($('#tree-canvas'));
$('#tree-canvas').addEventListener('tree:updated', () => drawTree());
function drawTree() { cancelAnimationFrame(trFrame); trFrame = requestAnimationFrame(drawLines); }
function drawLines() {
  const canvas = $('#tree-canvas');
  let svg = canvas.querySelector(':scope > .tree-lines');
  if (!svg) {
    canvas.prepend(svg = svgEl('svg', { class: 'tree-lines', 'aria-hidden': 'true', focusable: 'false' }));
    svg.addEventListener('animationend', e => e.target.classList.remove('grow')); // grow once, not on every tab switch
    trPaths = new Map();
  }
  const o = canvas.getBoundingClientRect(), z = o.width / canvas.offsetWidth || 1; // client rects are zoomed, SVG units are not
  const R = e => { const r = e.getBoundingClientRect(), l = (r.left - o.left) / z, t = (r.top - o.top) / z, w = r.width / z, h = r.height / z;
    return { l, r: l + w, t, b: t + h, x: l + w / 2, y: t + h / 2 }; };
  const card = n => n.querySelector(':scope > .node-card');
  const seen = new Set();
  const line = (key, d, cls, edge) => {
    let p = trPaths.get(key);
    if (!p) { trPaths.set(key, p = svgEl('path', { class: `${cls} grow`, pathLength: 1 })); if (edge) p.dataset.edge = edge; svg.append(p); }
    p.setAttribute('d', d); seen.add(key);
  };
  // Spine: down from a stop's marker, across between rows (through the category sign, if one starts there), down to the next.
  const stops = $$('#tree-canvas .tree-node[data-spine="true"]');
  for (let i = 1; i < stops.length; i++) {
    const a = R(stops[i - 1].querySelector('.step')), bNode = stops[i], b = R(bNode.querySelector('.step'));
    const end = i === 1 ? R(card(stops[0])).b : R(stops[i - 1]).b, ol = bNode.parentElement;
    const ym = ol.firstElementChild === bNode ? R(ol.previousElementSibling).y : (end + R(bNode).t) / 2;
    const dx = b.x - a.x, s = Math.sign(dx), r = Math.max(0, Math.min(36, Math.abs(dx) / 2, ym - a.y, b.y - ym));
    line(`s${bNode.dataset.nodeId}`, Math.abs(dx) < 1 ? `M${a.x} ${a.y}V${b.y}`
      : `M${a.x} ${a.y}V${ym - r}Q${a.x} ${ym} ${a.x + s * r} ${ym}H${b.x - s * r}Q${b.x} ${ym} ${b.x} ${ym + r}V${b.y}`, 'trail');
  }
  // Branches off every node except the root (the root's branches are the spine itself).
  for (const owner of $$('#tree-canvas .tree-node:not([data-depth="0"])')) {
    const brs = [...owner.querySelectorAll(':scope > .branches > .branch')];
    const c = R(card(owner));
    brs.forEach((br, i) => {
      const h = R(br.querySelector(':scope > .branch-name')), edge = br.dataset.edge, far = brs.length - 1 - i;
      let d, hx;
      if (h.t >= c.b - 2) { // stacked under the song: a trunk down its left side, elbow into the sign
        const x = c.l + 18 + far * 6, r = Math.max(0, Math.min(10, h.l - x));
        d = `M${x} ${c.b}V${h.y - r}Q${x} ${h.y} ${x + r} ${h.y}H${h.l}`; hx = h.l + 12;
      } else { // beside the song: a rail out of its side, dropping onto the sign (farther signs ride higher rails)
        const right = h.x > c.x, x0 = right ? c.r : c.l, y0 = c.t + 22 + far * 6, s = right ? 1 : -1, r = Math.max(0, Math.min(12, h.t - y0));
        d = `M${x0} ${y0}H${h.x - s * r}Q${h.x} ${y0} ${h.x} ${y0 + r}V${h.t}`; hx = right ? h.l + 12 : h.r - 12;
      }
      line(`b${owner.dataset.nodeId}-${edge}`, d, 'rail', edge);
      for (const kid of br.querySelectorAll(':scope > ol > .tree-node')) {
        const k = R(card(kid)), y = k.t + 26, toL = k.l >= hx, xe = toL ? k.l : k.r, r = Math.min(10, Math.abs(xe - hx));
        line(`k${kid.dataset.nodeId}`, `M${hx} ${h.b}V${y - r}Q${hx} ${y} ${hx + (toL ? r : -r)} ${y}H${xe}`, 'twig', edge);
      }
    });
  }
  for (const [k, p] of trPaths) if (!seen.has(k)) { p.remove(); trPaths.delete(k); }
}
// Up / Down (Home / End) move between songs; Tab still walks every control in reading order.
$('#tree-canvas').addEventListener('keydown', e => {
  const cur = e.target.closest('.node-card');
  if (!cur || e.altKey || e.ctrlKey || e.metaKey || e.target.closest('.about')) return;
  const plays = $$('#tree-canvas .node-card .play'), i = plays.indexOf(cur.querySelector('.play'));
  const to = plays[{ ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: plays.length - 1 }[e.key]];
  if (!to) return;
  e.preventDefault();
  to.focus();
});

async function moreTree(n) {
  const run = trRun, more = trEls.get(n.id).querySelector(':scope > .node-card .more');
  more.disabled = true;
  trWork(1);
  const r = await api.treeMore(n.id).catch(() => null);
  if (run !== trRun) return;
  trBusy--;
  more.disabled = !!(r && r.full);
  if (trBusy) return;
  trState(r ? 'done' : 'error', !r ? "Couldn't reach the music services. Try again." : r.full ? 'This tree is full. Start a new one from any song.' : r.added ? '' : 'No more family found.');
}

// ---------- Saved ----------
function renderSaved() {
  $('#saved-stamp-count').textContent = Object.keys(profile.stamps).length;
  $('#saved-stamps').replaceChildren(...stampItems());
  $('#saved-like-count').textContent = profile.likes.length;
  const list = $('#saved-list');
  list.replaceChildren(...profile.likes.slice().reverse().map(t => trackRow(t, {
    extra: t.country ? { country: t.country, decade: t.decade } : undefined, full: true, // re-loving from the now-playing bar keeps the stamp
    reason: [t.country && `${countryNames[t.country] || t.country}, ${t.decade}s`, t.ts && `loved ${new Date(t.ts).toLocaleDateString()}`].filter(Boolean).join(' · ') })));
  if (!profile.likes.length) list.append(el('li', { className: 'state empty' },
    el('p', { textContent: 'Nothing saved yet. Press Love on any track to keep it here.' }),
    el('div', { className: 'row' }, btn('Start a Blind Test', () => showTab('blind'), 'primary'), btn('Open Passport', () => showTab('passport')))));
}

// ---------- Preferences (first-launch step + tab) ----------
// Seed ratings are 'seed:<artistDzId>:<trackId>': a favourite artist's top track, fingerprinted and kept as a Love.
const seedArtist = r => r.id.split(':')[1];
const seedNames = () => Object.fromEntries(profile.ratings.filter(r => r.seed).map(r => {
  const a = profile.prefs.artists.find(x => String(x.dzId) === seedArtist(r));
  return [r.id, a ? `${a.name}, one of your favourites` : 'one of your favourite artists'];
}));
let genreList = null, seeding = false, seedAgain = false, prefsTimer = null, artistQ = 0;

// Background: drop seeds of removed artists, fetch + fingerprint 2 top tracks per new artist. Never blocks the Blind Test.
async function seedTaste() {
  if (seeding) { seedAgain = true; return; }
  seeding = true;
  try {
    const listed = () => new Set(profile.prefs.artists.map(a => String(a.dzId)));
    profile.ratings = profile.ratings.filter(r => !r.seed || listed().has(seedArtist(r)));
    const done = new Set(profile.ratings.filter(r => r.seed).map(seedArtist));
    const todo = profile.prefs.artists.filter(a => !done.has(String(a.dzId)));
    if (!todo.length) return;
    const tracks = (await call('seedTracks', plain(todo))) || [];
    for (const [i, t] of tracks.entries()) {
      prefStatus(`Listening to your favourites… ${i + 1} of ${tracks.length}`);
      const v = await fingerprint(t);
      if (!v || !listed().has(String(t.artistDzId))) continue;
      profile.ratings = [...profile.ratings.filter(r => r.id !== t.seedId), { id: t.seedId, rating: 'love', features: v, seed: true }].slice(-500);
      save();
    }
    prefStatus();
  } finally {
    seeding = false;
    if (seedAgain) { seedAgain = false; seedTaste(); }
  }
}
function prefStatus(msg) {
  const n = profile.ratings.filter(r => r.seed).length;
  $('#pref-status').textContent = msg || (n ? `Learned the sound of ${n} track${n > 1 ? 's' : ''} by your favourite artists.` : '');
}

// Any change: save now; after a pause, re-seed and drop queued picks that were found before the change.
function prefsChanged() {
  save();
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    seedTaste();
    queue.length = 0;
    if (mystery && !rated && current !== mystery) { mystery = null; showMystery(); } else fill();
  }, 1200);
}

function toggleChip(label, on, onToggle) {
  const b = btn(label, () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); onToggle(v); prefsChanged(); }, 'chip');
  b.setAttribute('aria-pressed', on);
  return b;
}
const setIn = (list, x, on, same = (a, b) => a === b) => (on ? [...list.filter(y => !same(y, x)), x] : list.filter(y => !same(y, x)));

function renderPickedArtists() {
  const p = profile.prefs;
  $('#pref-artists').replaceChildren(...p.artists.map(a => el('li', {}, el('button', { type: 'button', className: 'chip picked-chip', ariaLabel: `Remove ${a.name}`,
    onclick: () => { p.artists = p.artists.filter(x => x.dzId !== a.dzId); renderPickedArtists(); prefsChanged(); $('#pref-artist-q').focus(); } },
  a.name, el('span', { ariaHidden: 'true', className: 'x', textContent: '✕' })))));
  if (!p.artists.length) $('#pref-artists').append(el('li', { className: 'hint', textContent: 'None yet.' }));
}
function addArtist(a) {
  const p = profile.prefs;
  if (!p.artists.some(x => x.dzId === a.dzId)) p.artists = [...p.artists, { dzId: a.dzId, name: a.name }].slice(0, 30);
  $('#pref-artist-q').value = '';
  $('#pref-artist-hits').replaceChildren();
  renderPickedArtists();
  prefsChanged();
}
const fans = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M fans` : n >= 1e3 ? `${Math.round(n / 1e3)}K fans` : `${n} fans`;
let hits = [];
$('#pref-artist-q').addEventListener('input', e => {
  const q = e.target.value.trim(), my = ++artistQ;
  clearTimeout(e.target.t);
  if (q.length < 2) { hits = []; return $('#pref-artist-hits').replaceChildren(); }
  e.target.t = setTimeout(async () => {
    const res = (await call('searchArtists', q)) || [];
    if (my !== artistQ) return; // a newer keystroke won
    hits = res.slice(0, 6);
    $('#pref-artist-hits').replaceChildren(...(hits.length ? hits.map(a => el('li', {}, el('button', { type: 'button', className: 'suggest-row', onclick: () => addArtist(a) },
      el('span', { textContent: a.name }), el('small', { className: 'muted', textContent: fans(a.fans) })))) : [el('li', { className: 'hint', textContent: `No artist called “${q}” found.` })]));
  }, 250);
});
$('#pref-artist-q').addEventListener('keydown', e => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); addArtist(hits[0]); } });

async function renderGenres() {
  const box = $('#pref-genres');
  genreList ??= await call('genres');
  if (!genreList || !genreList.length) {
    genreList = null;
    return setState(box, 'error', "Couldn't load the genre list.", { actions: [btn('Try again', renderGenres)] });
  }
  box.className = 'chips';
  const p = profile.prefs;
  box.replaceChildren(...genreList.map(g => toggleChip(g.name, p.genres.some(x => x.id === g.id),
    on => { p.genres = setIn(p.genres, { id: g.id, name: g.name }, on, (a, b) => a.id === b.id); })));
}

let prefsBuilt = false;
function renderPrefs() {
  const p = profile.prefs;
  renderPickedArtists();
  prefStatus();
  renderGenres();
  if (prefsBuilt) return;
  prefsBuilt = true;
  $('#pref-decades').append(...DECADES.map(d => toggleChip(`${d}s`, p.decades.includes(d), on => { profile.prefs.decades = setIn(profile.prefs.decades, d, on); })));
  $('#pref-regions').append(...Object.keys(regionList).map(r => toggleChip(r, p.regions.includes(r), on => { profile.prefs.regions = setIn(profile.prefs.regions, r, on); })));
}

// First launch: this step comes before the intro; Continue and Skip both lead there. Later it is just a tab.
let regionList = {};
function prefsMode(first) {
  $('#prefs-title').textContent = first ? 'First, what do you already love?' : 'Your taste';
  $('#prefs-skip').hidden = !first;
  $('#prefs-done').textContent = first ? 'Continue' : 'Back to the Blind Test';
  $('#prefs-done').onclick = () => (first ? openIntro() : showTab('blind'));
}
function openPrefs(first) {
  prefsMode(first);
  showTab('prefs');
  if (first) $('#pref-artist-q').focus();
}
prefsMode(false);
$('#prefs-skip').onclick = () => openIntro();

// ---------- start ----------
(async () => {
  profile = await store.load();
  regionList = await api.countries();
  buildPassport(regionList);
  $('#adventure').value = profile.adventure;
  showAdventure();
  afterLikeChange();
  if (!introSeen() && !profile.likes.length) openPrefs(true);
  fill();
  seedTaste(); // finishes seeding an interrupted earlier session; no-op otherwise
})();

// Theme toggle (Agent 6): follows the OS until the user picks; the choice persists in localStorage.
{
  const root = document.documentElement, tbtn = document.getElementById('theme-toggle'), os = matchMedia('(prefers-color-scheme: light)');
  try { const t = localStorage.getItem('theme'); if (t === 'light' || t === 'dark') root.dataset.theme = t; } catch {}
  const dark = () => (root.dataset.theme || (os.matches ? 'light' : 'dark')) === 'dark';
  const sync = () => tbtn.setAttribute('aria-pressed', String(dark()));
  tbtn.onclick = () => { root.dataset.theme = dark() ? 'light' : 'dark'; try { localStorage.setItem('theme', root.dataset.theme); } catch {} sync(); };
  os.addEventListener('change', sync);
  sync();
}
