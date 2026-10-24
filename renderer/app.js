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
let current = null, currentExtra = null, currentFrom = null, retried = false, onFail = null;
const hidden = t => t === mystery && !rated; // an unrated mystery: nothing that names it (cover, colour, last-played) may show

// from: {tab, label} where the track was started, for the bar's "came from" chip and Home's "continue".
async function play(item, { label, onFail: failCb, extra, from } = {}) {
  current = item; currentExtra = extra || null; currentFrom = from || null; retried = false; onFail = failCb || null;
  $('#now-playing').textContent = label || `${item.artist} – ${item.title}`;
  renderNpLike(); renderNpMeta(); syncPlayState();
  remember(item);
  // Stop the old track now: while the new preview is fetched (or turns out unavailable) its time must not drive the new scrubber or tonearm.
  if (audio.getAttribute('src')) { audio.removeAttribute('src'); audio.load(); }
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
  const setBtn = (b, on) => { b.firstChild.replaceWith(icon(on ? 'pause' : 'play')); b.setAttribute('aria-label', on ? 'Pause' : 'Play'); };
  setBtn($('#np-toggle'), playing);
  $('#np-toggle').disabled = !current;
  setBtn($('#mystery-play'), playing && current === mystery);
  const deck = $('#deck'), on = playing && !!mystery && current === mystery;
  if (on && !deck.classList.contains('is-playing')) deck.classList.add('needle-drop'); // the arm swings in and the rim ripples once
  deck.classList.toggle('is-playing', on);
  $('.nowbar').classList.toggle('is-idle', !current);
  $$('.track.is-playing').forEach(r => r.classList.remove('is-playing'));
  $$('.track .play').forEach(b => { b.replaceChildren(icon('play')); b.setAttribute('aria-label', b.dataset.label); });
  if (current) $$(`.track[data-key="${CSS.escape(likeKey(current))}"]`).forEach(r => {
    r.classList.add('is-playing');
    const b = r.querySelector('.play');
    if (playing) { b.replaceChildren(icon('pause')); b.setAttribute('aria-label', 'Pause'); }
  });
}
['play', 'pause', 'ended', 'emptied'].forEach(ev => audio.addEventListener(ev, syncPlayState));
let scrubbing = false;
const onTime = e => {
  if (e.type === 'emptied') scrubbing = false;
  const p = audio.duration ? audio.currentTime / audio.duration : 0, seek = $('#np-progress');
  if (!scrubbing) seek.value = p;
  seek.style.setProperty('--v', seek.value);
  seek.disabled = !audio.duration;
  seek.setAttribute('aria-valuetext', audio.duration ? `${fmt(audio.currentTime)} of ${fmt(audio.duration)}` : '');
  $('#np-time').textContent = audio.duration ? `${fmt(audio.currentTime)} / ${fmt(audio.duration)}` : '';
  if (current === mystery) { $('#mystery-progress').value = p; $('#deck').style.setProperty('--p', p); }
};
['timeupdate', 'durationchange', 'emptied'].forEach(ev => audio.addEventListener(ev, onTime)); // emptied: a new track starts the bar at 0
$('#np-progress').addEventListener('input', e => { scrubbing = true; e.target.style.setProperty('--v', e.target.value); if (audio.duration) audio.currentTime = e.target.value * audio.duration; });
$('#np-progress').addEventListener('change', () => { scrubbing = false; });
$('#deck').addEventListener('animationend', e => { if (e.target.classList.contains('tonearm')) $('#deck').classList.remove('needle-drop'); });
$('#np-toggle').onclick = togglePlay;

// Bar 2.0: the cover (a blurred "?" while it is a mystery) and the "came from" chip that jumps back to the source.
const tabName = id => ($(`#tab-${id}`)?.firstChild.textContent || id).trim();
const bigCover = u => u && u.replace('/100x100bb.', '/300x300bb.'); // iTunes art: ask for a sharper size
function renderNpMeta() {
  const c = $('#np-cover');
  c.classList.toggle('is-mystery', !!current && hidden(current));
  c.replaceChildren(!current ? '' : hidden(current) ? el('span', { textContent: '?' }) : current.cover ? el('img', { src: current.cover, alt: '' }) : '');
  const f = $('#np-from');
  f.hidden = !currentFrom;
  if (currentFrom) { f.textContent = `From ${currentFrom.label}`; f.setAttribute('aria-label', `Go back to ${currentFrom.label}`); }
  setTint(current && !hidden(current) ? current.cover : null);
}
$('#np-from').onclick = () => {
  if (!currentFrom) return;
  showTab(currentFrom.tab);
  if (current === mystery) return $('#mystery-play').focus();
  const row = current && $(`#${currentFrom.tab} .track[data-key="${CSS.escape(likeKey(current))}"]`);
  if (row) { row.scrollIntoView({ block: 'center' }); row.querySelector('.play').focus(); }
  else $(`#tab-${currentFrom.tab}`)?.focus(); // the row is gone (a regrown tree, a cleared list): land on its tab, not on nothing
};
// Last played (never an unrated mystery), kept in the profile for Home's "continue where you left off".
function remember(t) {
  if (hidden(t)) return;
  const { source, id, title, artist, artistDzId, albumId, cover, isrc } = t;
  profile.last = { track: { source, id, title, artist, artistDzId, albumId, cover, isrc, ...(t === current ? currentExtra : null) }, from: t === current ? currentFrom : null, ts: Date.now() };
  save();
}

// Cover accent: the dominant hue of the playing cover tints glows and the bar. Lightness comes from the theme (AA);
// grey covers, unreadable images or a hidden mystery fall back to amber. Both cover CDNs send CORS headers.
const tints = new Map();
function coverTint(url) {
  if (!tints.has(url)) tints.set(url, new Promise(res => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = el('canvas', { width: 24, height: 24 }), x = c.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 24, 24);
        res(Tint.tintOf(x.getImageData(0, 0, 24, 24).data));
      } catch { res(null); } // a tainted canvas: no colour, keep amber
    };
    img.onerror = () => { tints.delete(url); res(null); }; // a network blip: try again next time this cover plays
    img.src = url;
  }));
  return tints.get(url);
}
let tintRun = 0;
function setTint(url) {
  const run = ++tintRun, s = document.documentElement.style;
  (url ? coverTint(url) : Promise.resolve(null)).then(t => {
    if (run !== tintRun) return;
    if (t) { s.setProperty('--tint-h', t.h); s.setProperty('--tint-s', `${t.s}%`); } else { s.removeProperty('--tint-h'); s.removeProperty('--tint-s'); }
  });
}

// Like button in the now-playing bar. An unrated mystery is rated "Love" instead, so nothing leaks.
function renderNpLike() {
  const box = $('#np-like');
  if (!current) return box.replaceChildren();
  if (current === mystery && !rated) return box.replaceChildren(el('button', { type: 'button', className: 'love',
    ariaLabel: 'Love this mystery (rates it and reveals it)', onclick: () => rate('love') }, icon('heart'), 'Love'));
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
  entry.stamp = extra.stamp || null; // only a Genre Stamps song earns a stamp (Blind Test trips keep country + decade, no genre)
  if (entry.stamp) { const n = profile.stamps[entry.stamp] = (profile.stamps[entry.stamp] || 0) + 1; if (n === 1 || n === 3) stampEarned(entry.stamp, n); }
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
  const sk = old && stampOf(old);
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
  if (!$('#home').hidden && !$('#home').contains(document.activeElement)) renderHome(); // never re-render under the focused Love
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
  b.sync = () => { const on = isLiked(t); b.replaceChildren(icon('heart', on), on ? 'Loved' : 'Love'); b.setAttribute('aria-pressed', on); };
  b.setAttribute('aria-label', `Love ${t.artist} – ${t.title}`);
  b.onclick = () => {
    if (isLiked(t)) return unlike(t);
    like(t, extra);
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); // heart pulse, replayable
  };
  b.addEventListener('animationend', () => b.classList.remove('pop'));
  b.sync();
  return b;
}

// Skip / OK / Love on a tree song: the Blind Test's rating into the same taste model (teach upserts one rating per
// track, the latest wins; Love is the Saved button itself). Wraps the row's Love button so every sync updates the group.
function rateGroup(t, love) {
  const kind = () => isLiked(t) ? 'love' : t.rated || (profile.ratings.find(r => r.id === likeKey(t)) || {}).rating;
  const bs = [['skip', 'Skip'], ['ok', 'OK']].map(([k, text]) => {
    const b = btn(text, () => { if (isLiked(t)) unlike(t); t.rated = k; addHeard(t); teach(t, k); save(); love.sync(); });
    b.dataset.rate = k; b.setAttribute('aria-label', `${text} ${t.artist} – ${t.title}`);
    return b;
  });
  const group = el('div', { className: 'node-rate', role: 'group', ariaLabel: 'Rate this song' }, ...bs, love);
  const sync = love.sync, toggle = love.onclick;
  love.dataset.rate = 'love';
  love.onclick = () => { t.rated = undefined; toggle(); };
  love.sync = () => {
    sync();
    const k = kind();
    bs.forEach(b => b.setAttribute('aria-pressed', b.dataset.rate === k));
    const card = group.closest('.node-card');
    if (card) card.classList.toggle('skipped', k === 'skip'); // dims in place: no layout change
  };
  love.sync();
  return group;
}

// "Listen to the full song" (previews stop at 30 s): opens the default browser via main's https allowlist. Only for revealed tracks.
function fullSong(t) {
  const q = encodeURIComponent(`${t.artist} ${t.title}`);
  const dz = t.source === 'dz' ? `https://www.deezer.com/track/${encodeURIComponent(t.id)}` : `https://www.deezer.com/search/${q}`;
  const link = (name, url) => el('button', { type: 'button', className: 'ext', textContent: name,
    ariaLabel: `Listen to the full song on ${name} (opens your browser)`, onclick: () => api.open(url).catch(() => toast('Could not open the browser')) });
  return el('span', { className: 'full-song' }, sp.connected ? el('button', { type: 'button', className: 'primary sp-play',
    onclick: e => playInSpotify(t, e.currentTarget) }, icon('play'), 'Play in Spotify') : null, el('span', { className: 'full-label', textContent: 'Full song:' }),
    link('YouTube', `https://www.youtube.com/results?search_query=${q}`), link('Spotify', `https://open.spotify.com/search/${q}`), link('Deezer', dz));
}

// One track row: cover, title / artist, optional reason, play, love. onOpen makes the title a link.
// from: where the bar's "came from" chip leads; by default the row's own tab (plus its Family Tree step).
const fromOf = row => {
  const tab = row.closest('.panel')?.id, step = row.closest('.tree-node')?.dataset.step;
  return tab ? { tab, label: tabName(tab) + (step && step !== '0' ? `, step ${step}` : '') } : null;
};
function trackRow(t, { extra, reason, onOpen, full, tag = 'li', from } = {}) {
  const name = `${t.artist} – ${t.title}`;
  const title = onOpen ? el('button', { type: 'button', className: 'link', textContent: t.title, onclick: onOpen, title: 'Grow its family tree' }) : el('span', { className: 'title', textContent: t.title });
  const playBtn = el('button', { type: 'button', className: 'play',
    onclick: () => current && likeKey(current) === likeKey(t) && audio.getAttribute('src') ? togglePlay() : play(t, { extra, from: from || fromOf(row) }) });
  playBtn.append(icon('play'));
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
  if (name === 'home') renderHome();
  if (name === 'blind' && mystery && !rated && !current) playMystery(); // Home is the landing page: the first mystery waits until you come here
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
const queue = [], tonight = [];
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

const playMystery = () => { const m = mystery; play(m, { label: 'Mystery track: rate it to reveal', from: { tab: 'blind', label: tabName('blind') }, onFail: () => { // preview dead: drop silently, never offer this artist again
  if (mystery !== m || rated) return;
  addHeard(m); save(); showMystery();
} }); };

function showMystery() {
  mystery = nextFromQueue();
  rated = false;
  $('#reveal').replaceChildren();
  $('#mystery-next').hidden = true; $('#enter-hint').hidden = true;
  $('#mystery-progress').value = 0;
  $('#mystery').classList.remove('is-revealed');
  $$('#deck .sleeve, #deck .verdict').forEach(e => e.remove());
  $('#deck').style.setProperty('--p', 0);
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
  const said = VERDICT[kind];
  // Artist/title enter the DOM only now, after rating. The cover slides out over the record, the name types on.
  $('#deck').prepend(m.cover ? el('img', { className: 'sleeve', src: bigCover(m.cover), alt: `Cover of ${m.title}` }) : el('span', { className: 'sleeve cover-ph', ariaHidden: 'true' }));
  $('#deck').append(el('span', { className: 'verdict', textContent: `You said ${said}`, ariaHidden: 'true' }));
  $('#deck').dataset.verdict = kind;
  const [meta, about] = revealDetails(m);
  $('#reveal').replaceChildren(el('div', { className: 'reveal-card' },
    el('p', { className: 'sr-only', textContent: `You said ${said}. It was` }),
    el('h3', { className: 'reveal-artist', textContent: m.artist }),
    norm(m.title) === norm(m.artist) ? null : el('p', { className: 'reveal-title', textContent: m.title }), // self-titled: say it once
    meta, reason, about,
    el('div', { className: 'reveal-actions' }, loveButton(m, extra), fullSong(m))));
  $('#mystery').classList.add('is-revealed');
  tonight.unshift({ t: m, kind, extra });
  renderTonight();
  if (current === m) { $('#now-playing').textContent = `${m.artist} – ${m.title}`; currentExtra = extra; renderNpLike(); renderNpMeta(); remember(m); }
  $('#mystery-next').hidden = false; $('#enter-hint').hidden = false;
  $('#mystery-next').focus();
}

const VERDICT = { skip: 'Skip', ok: 'OK', love: 'Love' };
// How the pick was found, as a short price-sticker tag ("Random trip: Greece", "Near Oasis").
function whyTag(m) {
  const w = m.why || {};
  return { trip: `Random trip: ${w.place}${m.decade ? `, ${m.decade}s` : ''}`, near: `Near ${w.artist}`, trail: `Via ${w.person}`, genre: `${w.genre} shelf` }[w.kind] || '';
}
// Reveal order: name, then a meta row (how it was found · year · label · genre · album), then the about text clamped to 3 lines.
function revealDetails(m) {
  const tag = whyTag(m);
  const facts = el('ul', { className: 'facts', ariaLabel: 'Release details' });
  const meta = el('div', { className: 'meta-row' }, tag ? el('span', { className: 'sticker', textContent: tag }) : null, facts);
  const box = el('div', { className: 'about', ariaBusy: 'true' }, el('p', { className: 'about-text is-loading', textContent: '…' }));
  aboutOf(m).then(({ text, url, facts: f = {} }) => {
    facts.append(...[f.year, f.label, f.genre, f.album].filter(Boolean).map(x => el('li', { textContent: x })));
    box.setAttribute('aria-busy', 'false');
    if (!text) return box.replaceChildren();
    const p = el('p', { className: 'about-text clamp', textContent: text });
    const more = el('button', { type: 'button', className: 'more-toggle', textContent: 'More' });
    more.setAttribute('aria-expanded', 'false');
    more.onclick = () => { const shut = p.classList.toggle('clamp'); more.textContent = shut ? 'More' : 'Less'; more.setAttribute('aria-expanded', !shut); };
    const src = url ? el('button', { type: 'button', className: 'ext about-src', textContent: 'Wikipedia',
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
$('#blind-retry').onclick = () => { fails = 0; $('#mystery-title').textContent = 'Finding your first mystery…'; fill(); };
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

const ADVENTURE = [[20, 'Stays close to artists you loved.'], [45, 'Mostly familiar, a few surprises.'],
  [69, 'Half near what you loved, half complete strangers.'], [89, 'Mostly strangers, wandering further from your taste.'], [100, 'Almost all complete strangers.']];
function showAdventure() {
  const v = profile.adventure;
  const text = ADVENTURE.find(([max]) => v <= max)[1];
  $('#adventure-value').textContent = `${v}: ${text}${profile.likes.length ? '' : ' Love a few tracks first; until then every pick is a stranger.'}`;
  $('#adventure').setAttribute('aria-valuetext', `${v}, ${text}`);
}
$('#adventure').addEventListener('input', e => { profile.adventure = Number(e.target.value); showAdventure(); });
$('#adventure').addEventListener('change', save);

// ---------- B. Genre Stamps (docs/06) ----------
let SD, stRun = 0, stOpen = null, stSongs = [], nextRoll = null, thumpId = null;
const stState = (kind, msg, opts) => setState($('#stamp-state'), kind, msg, opts);
// Per-viewer conveniences only (last rolls, combos that came back thin); losing them is harmless. Rarity lives in the profile.
const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = { Africa: 1, Asia: 2, Europe: 3, 'North America': 4, 'Latin America & Caribbean': 5, Oceania: 6 };
// A like's stamp: new likes carry it (null = none); an old Passport like (country + decade) counts toward its legacy stamp.
const stampOf = e => ('stamp' in e ? e.stamp : e.country && e.decade ? `${e.decade}-${e.country}-` : null);
// Re-loving keeps the stamp. A saved like with no stamp field is an old Passport like: it re-earns its legacy stamp, as unloving took it away.
const extraOf = t => (t.country ? { country: t.country, decade: t.decade, genre: t.genre, stamp: 'stamp' in t ? t.stamp : t.ts ? stampOf(t) : null } : undefined);
const scene = s => (s.legacy ? 'Passport' : s.label.replace(/^\S+\s/, '').replace(new RegExp(`^${SD.DEMONYM[s.cc]} `), ''));
const tilt = id => ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 7) - 3; // same stamp, same angle, every render
const rarityOf = id => profile.rarity[id];

function stampFace(s, count = 0) {
  const t = SD.tier(count), r = rarityOf(s.id);
  const e = el('span', { className: `stamp ink-${s.legacy ? 0 : INK[SD.continentOf(s.cc)]} ${t ? `is-${t}` : 'is-empty'}${r ? ` r-${r.toLowerCase()}` : ''}`, ariaHidden: 'true' },
    el('span', { className: 'stamp-face' }, el('span', { className: 'stamp-decade', textContent: SD.decadeName(s.decade) }),
      el('span', { className: 'stamp-genre', textContent: scene(s) }), el('span', { className: 'stamp-place', textContent: countryNames[s.cc] || s.cc })));
  e.style.setProperty('--tilt', `${t ? tilt(s.id) : 0}deg`);
  return e;
}
const earnedBy = s => profile.likes.find(l => stampOf(l) === s.id);
function slotEl({ stamp: s, count }) {
  const r = rarityOf(s.id), by = count && earnedBy(s);
  const what = count ? `${count >= 3 ? 'gold' : 'stamped'}${r ? `, ${r.toLowerCase()}` : ''}${by ? `, earned with ${by.artist}, ${by.title}` : ''}` : 'not stamped yet';
  return el('li', {}, el('button', { type: 'button', className: 'slot', title: s.label, ariaLabel: `${s.label}, ${what}. ${s.legacy ? 'Pick a genre for it' : 'Open'}`,
    onclick: () => { showTab('stamps'); s.legacy ? prefillBuilder(s) : openStamp(s); } }, stampFace(s, count)));
}

function buildStamps(regions) {
  SD = StampData(regions);
  const old = ls('stampRarity'); // rarity used to live in localStorage: move it into the profile once
  if (old && typeof old === 'object') { profile.rarity = { ...old, ...profile.rarity }; save(); try { localStorage.removeItem('stampRarity'); } catch {} }
  for (const list of Object.values(regions)) Object.assign(countryNames, list);
  const opt = (value, text) => el('option', { value, textContent: text });
  $('#b-decade').append(...SD.DECADES.map(d => opt(d, SD.decadeName(d))));
  $('#b-place').append(...SD.CONTINENTS.map(c => el('optgroup', { label: c }, ...Object.keys(SD.ALL_CC).filter(cc => SD.continentOf(cc) === c)
    .sort((a, b) => SD.DEMONYM[a].localeCompare(SD.DEMONYM[b])).map(cc => opt(cc, SD.DEMONYM[cc])))));
  $('#b-genre').append(...Object.entries(SD.GENRES).sort((a, b) => a[1][0].localeCompare(b[1][0])).map(([g, [name]]) => opt(g, name)));
  $('#cat-filter').append(...SD.CONTINENTS.map(c => opt(c, c)));
  syncBuilder(SD.makeStamp('1990-JP-rock'));
}
function syncBuilder(s) {
  $('#b-decade').value = s.decade; $('#b-place').value = s.cc;
  if (Object.hasOwn(SD.GENRES, s.genre)) $('#b-genre').value = s.genre;
}
function prefillBuilder(s) { syncBuilder(s); $('#b-genre').focus(); toast(`Pick a genre for the ${s.label}`); }
$('#builder').addEventListener('submit', e => {
  e.preventDefault();
  const s = SD.makeStamp(`${$('#b-decade').value}-${$('#b-place').value}-${$('#b-genre').value}`); // a catalogue combo opens that entry
  if (s) openStamp(s);
});
$('#cat-filter').addEventListener('change', () => renderCatalogue());

let catAll = false; // the catalogue shows 8 rows until "Show all"
function renderCatalogue() {
  const f = $('#cat-filter').value, list = SD.CATALOGUE.filter(s => !f || SD.continentOf(s.cc) === f);
  $('#catalogue').replaceChildren(...(catAll ? list : list.slice(0, 8)).map(s => {
    const n = profile.stamps[s.id] || 0, held = n >= 3 ? 'Gold stamp' : 'Stamped';
    const b = el('button', { type: 'button', className: `cat-item ink-${INK[SD.continentOf(s.cc)]}`, onclick: () => openStamp(s) },
      el('span', { className: 'cat-label', textContent: s.label }), n ? el('span', { className: `cat-held${n >= 3 ? ' is-gold' : ''}`, role: 'img', ariaLabel: held, title: held }) : null,
      el('span', { className: 'cat-blurb', textContent: s.blurb }));
    if (stOpen && stOpen.id === s.id) b.setAttribute('aria-current', 'true');
    return el('li', {}, b);
  }));
  $('#cat-more').hidden = catAll || list.length <= 8;
  $('#cat-more').textContent = `Show all ${list.length}`;
}
$('#cat-more').onclick = () => { catAll = true; renderCatalogue(); $$('#catalogue .cat-item')[8]?.focus(); };

function renderBook() {
  const b = SD.book(profile.stamps);
  const earned = [...b.groups.flatMap(g => g.slots), ...b.legacy].filter(x => x.count);
  $('#book-line').replaceChildren(earned.length ? `${earned.length} stamp${earned.length === 1 ? '' : 's'}` : 'No stamps yet',
    el('span', { className: 'decade-strip', ariaLabel: `Decades stamped: ${b.decades.map(SD.decadeName).join(', ') || 'none yet'}` },
      ...SD.DECADES.slice(0, 7).map(d => el('span', { className: b.decades.includes(d) ? 'on' : '', ariaHidden: 'true', textContent: SD.decadeName(d) }))));
  // Only earned stamps are drawn; the rest of a continent is one muted line of names, each opens that stamp.
  const group = (title, quiet, slots) => {
    const got = slots.filter(x => x.count), left = slots.filter(x => !x.count);
    return el('section', { className: 'book-group' }, el('h3', {}, title, quiet ? el('span', { className: 'quiet', textContent: quiet }) : null),
      got.length ? el('ul', { className: 'book-slots' }, ...got.map(slotEl)) : null,
      left.length ? el('p', { className: 'still' }, 'Still to find: ', ...left.flatMap(({ stamp: s }, i) =>
        [i ? ', ' : '', el('button', { type: 'button', className: 'still-link', textContent: s.label, onclick: () => openStamp(s) })])) : null);
  };
  $('#book').replaceChildren(...[b.legacy.length ? group('Passport (legacy)', 'place and decade only', b.legacy) : null,
    ...b.groups.map(g => group(g.continent, '', g.slots))].filter(Boolean));
  $('#saved-stamp-count').textContent = earned.length;
  $('#saved-stamps').replaceChildren(...(earned.length ? earned.map(slotEl) : [el('li', { className: 'muted', textContent: 'Love a song in Genre Stamps and its scene gets stamped here.' })]));
}

function renderStampHead() {
  const s = stOpen, head = $('#stamp-head');
  $('#stamp-export-box').hidden = !stSongs.length;
  if (!s) return head.replaceChildren(el('p', { className: 'stamp-empty', textContent: 'Roll a stamp, pick one from the catalogue, or build your own: a decade, a place and a genre.' }));
  const n = profile.stamps[s.id] || 0, r = rarityOf(s.id), by = n && earnedBy(s);
  const face = stampFace(s, n);
  face.classList.add('big');
  if (thumpId === s.id) { face.classList.add('thump'); thumpId = null; }
  // Gold and rarity are drawn (foil, ink weight), never written; the plain words only reach the accessible name.
  if (n) Object.assign(face, { role: 'img', ariaHidden: null, ariaLabel: `${n >= 3 ? 'Gold stamp' : 'Stamp'}${r ? `, ${r.toLowerCase()}` : ''}`, title: `${n >= 3 ? 'Gold' : 'Stamped'}${r ? `, ${r.toLowerCase()}` : ''}` });
  head.replaceChildren(face, el('div', { className: 'stamp-info' },
    el('h2', { textContent: s.label }), s.blurb ? el('p', { className: 'stamp-blurb', textContent: s.blurb }) : null,
    by ? el('p', { className: 'stamp-meta', textContent: `Stamped ${day(by.ts)} with ${by.artist}, “${by.title}”` }) : null));
}
function renderStamps() {
  if (!SD) return;
  renderBook(); renderCatalogue(); renderStampHead();
}
function stampEarned(id, n) {
  const s = SD.makeStamp(id);
  if (!s) return;
  thumpId = id;
  toast(n >= 3 ? `Stamped in gold: ${s.label}` : `Stamped: ${s.label}`);
}

let stMenu = 0;
function songRow(t) {
  const row = trackRow(t, { extra: extraOf(t), full: true });
  if (t.year) row.querySelector('.artist').textContent = `${t.artist}, ${t.year}`;
  // At rest: ▶, Skip / OK / Love (as in the Blind Test and the Tree) and ⋯ for About and Full song, as on the Tree cards.
  row.append(el('div', { className: 'node-actions' }, rateGroup(t, row.querySelector('.love')), moreMenu(row, `stamp-menu-${++stMenu}`, `${t.artist} – ${t.title}`)));
  return row;
}
api.onStampRow((run, row) => {
  if (run !== stRun) return;
  stSongs.push(row);
  $('#stamp-export-box').hidden = false;
  $('#stamp-songs').append(songRow(row));
});

const markShort = id => ls('stampShort', [...new Set([...(ls('stampShort') || []), id])].slice(-200));
// Prefetch the next Roll; a thin one is remembered, discarded and replaced (3 tries at most), so the user never lands on it.
function prefetchNext(s, tries = 3) {
  const n = nextRoll = SD.roll({ ...rollState(), recent: [...(ls('stampRecent') || []), s.id].slice(-5) });
  api.prefetchStamp(n.id).then(res => {
    if (nextRoll !== n || !res || !res.thin) return;
    markShort(n.id); nextRoll = null;
    if (tries > 1) prefetchNext(s, tries - 1);
  }).catch(() => {});
}
async function openStamp(s, rerolls = 0) {
  const run = ++stRun;
  stOpen = s; stSongs = [];
  $('#stamp-songs').replaceChildren(); $('#stamp-export-status').replaceChildren();
  syncBuilder(s); renderStampHead(); renderCatalogue();
  stState('loading', 'Searching…');
  const res = await api.stamp(s.id, run).catch(() => ({ error: true }));
  if (run !== stRun || !res) return;
  if (res.error) return stState('error', "Couldn't reach the record stacks. Check your connection and try again.", { actions: [btn('Try again', () => openStamp(s), 'primary')] });
  if (res.thin) {
    markShort(s.id);
    if (rerolls > 0) return land(SD.roll(rollState()), rerolls - 1);
  }
  prefetchNext(s); // prefetched: the next dice landing is instant
  if (res.thin) {
    const near = [s.decade - 10, s.decade + 10].map(d => SD.makeStamp(`${d}-${s.cc}-${s.genre}`)).filter(Boolean);
    return stState('empty', `Only ${res.count} song${res.count === 1 ? '' : 's'} from ${s.label} made it.${near.length ? ` Try the ${near.map(x => SD.decadeName(x.decade)).join(' or ')}?` : ''}`,
      { actions: near.map(x => btn(x.label, () => openStamp(x))) });
  }
  profile.rarity[s.id] = res.rarity; save();
  stState('done', `${res.count} songs, every one first released in the ${SD.decadeName(s.decade)} by an artist from ${countryNames[s.cc]}.`);
  renderStamps();
}

// ---- Roll: three reels land one by one (~1.2 s) while the playlist is already on its way ----
const rollState = () => ({ held: profile.stamps, recent: ls('stampRecent') || [], adventurous: $('#adventurous').checked, streak: ls('stampStreak') || 0,
  short: ls('stampShort') || [], topTags: [...profile.prefs.genres.map(g => g.name), ...profile.likes.filter(l => l.genre && SD.GENRES[l.genre]).flatMap(l => SD.GENRES[l.genre][1])] });
function doRoll() {
  const st = rollState();
  const s = nextRoll && !st.recent.includes(nextRoll.id) ? nextRoll : SD.roll(st);
  nextRoll = null;
  land(s, 2);
}
// Lands a rolled stamp; one that comes back thin is re-rolled (up to `left` times) before the suggestion screen shows.
function land(s, left) {
  const st = rollState();
  const heldC = new Set(Object.keys(profile.stamps).map(k => SD.continentOf(k.split('-')[1])));
  ls('stampRecent', [...st.recent, s.id].slice(-5));
  ls('stampStreak', heldC.has(SD.continentOf(s.cc)) ? st.streak + 1 : 0);
  spinReels(s);
  openStamp(s, left);
}
function spinReels(s) {
  const vals = [SD.decadeName(s.decade), SD.DEMONYM[s.cc], scene(s)];
  const pools = [SD.DECADES.map(SD.decadeName), Object.values(SD.DEMONYM), Object.values(SD.GENRES).map(g => g[0])];
  $('#roll-said').textContent = `Rolled: ${s.label}`;
  $$('#reels .reel').forEach((reel, i) => {
    const strip = reel.firstElementChild, land = () => strip.replaceChildren(el('span', { textContent: vals[i] }));
    strip.getAnimations().forEach(a => a.cancel());
    if (reduced()) return land();
    const spin = Array.from({ length: 7 + 3 * i }, () => pools[i][Math.floor(Math.random() * pools[i].length)]);
    strip.replaceChildren(...[strip.lastElementChild.textContent, ...spin, vals[i]].map(v => el('span', { textContent: v })));
    strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-(spin.length + 1) * reel.clientHeight}px)` }],
      { duration: 480 + 360 * i, easing: 'cubic-bezier(.25,.1,.25,1)', fill: 'forwards' })
      .finished.then(() => { strip.getAnimations().forEach(a => a.cancel()); land(); }, () => {});
  });
}
$('#roll').onclick = doRoll;
$('#stamp-export').onclick = e => stOpen && exportToSpotify(`Stumble: ${stOpen.label}`, stSongs, $('#stamp-export-status'), e.currentTarget);

// ---------- C. Family Tree ----------
// main builds the tree (src/tree.js) and streams nodes over 'tree:node'; a newer tree's run number drops the old one's.
let trRun = 0, trSearch = 0, trBusy = 0, trNodes = [], trRoots = [], trEls = new Map();
const trState = (kind, msg, opts) => setState($('#tree-state'), kind, msg, opts);
const trWork = d => { trBusy += d; if (trBusy) trState('loading', 'Searching…'); };

function renderTreePicker() {
  trRoots = profile.likes.slice().reverse(); // newest first
  $('#tree-root').replaceChildren(...trRoots.map((t, i) => el('option', { value: i, textContent: `${t.title} – ${t.artist}` })));
  $('#tree-pick').hidden = !trRoots.length;
  renderGrowSettings();
  if (!trRoots.length && !trNodes.length) trState('empty', 'Nothing saved yet. Search any song to grow its tree, or save songs in Blind Test or Genre Stamps.',
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

// Grow settings (profile.prefs.tree): saved on change, applied only when the tree is regrown.
const GROW_EDGES = [ // [edge, hint], in the order they are listed
  ['scene', 'Same genre, years and country'], ['related', 'What fans of the artist also play'], ['era', 'Any genre, the same years'],
  ['place', 'Same city or country, any genre'], ['soundtrack', 'Songs from the same film'], ['producer', 'Records the same producer made'],
  ['label', 'Signed to the same label then'], ['member', 'Bands a member went on to or came from'],
  ['builton', 'Songs it samples or is based on'], ['roots', 'Artists it names as an influence']];
let trRoot = null, trUsed = '';
const growSet = () => profile.prefs.tree;
function renderGrowSettings() {
  const s = growSet();
  $('#grow-edges').replaceChildren(...GROW_EDGES.map(([e, hint]) => {
    const box = el('input', { type: 'checkbox', value: e, checked: s.edges.includes(e) });
    return el('label', { className: 'grow-edge' }, box, el('span', { className: 'grow-name', textContent: EDGE_NAMES[e] }), el('span', { className: 'grow-hint', textContent: hint }));
  }));
  $$('#grow-edges .grow-edge').forEach((l, i) => l.dataset.edge = GROW_EDGES[i][0]);
  Object.assign($('#grow-era'), { value: s.era }); $('#grow-place').value = s.place; $('#grow-width').value = String(s.width); $('#grow-fame').value = s.fame;
  growSummary();
}
function growSummary() {
  const s = growSet(), on = s.edges.map(e => EDGE_NAMES[e].replace(/^Same /, '').toLowerCase());
  $('#grow-summary').textContent = `${on.length > 3 ? `${on.length} connections` : on.join(', ')} · ${{ near: 'same years', decade: 'same decade', any: 'any era' }[s.era]} · ${s.place === 'same' ? 'same country' : 'anywhere'}`
    + (s.fame < 40 ? ' · famous' : s.fame > 60 ? ' · obscure' : '') + (s.width === 5 ? ' · 5 per node' : '');
  $('#grow-regrow').hidden = !trRoot || JSON.stringify(s) === trUsed;
}
$('#grow-settings').addEventListener('change', e => {
  const boxes = $$('#grow-edges input'), on = boxes.filter(b => b.checked).map(b => b.value);
  if (!on.length) { e.target.checked = true; return toast('Keep at least one way to connect songs.'); } // the last one stays on
  profile.prefs.tree = { edges: on, era: $('#grow-era').value, place: $('#grow-place').value, fame: Number($('#grow-fame').value), width: Number($('#grow-width').value) };
  save(); growSummary();
});
$('#grow-regrow').onclick = () => trRoot && growTree(trRoot);

async function growTree(root) {
  const run = ++trRun;
  trNodes = []; trBusy = 0; trEls = new Map();
  trRoot = root; trUsed = JSON.stringify(growSet()); $('#grow-regrow').hidden = true;
  $('#tree-canvas').replaceChildren();
  trWork(1);
  const ok = await api.tree(plain(root), profile.heard, run, profile.likes.map(({ source, id, artist, title }) => ({ source, id, artist, title })), plain(growSet())).catch(e => { console.error('tree', e); return null; });
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
const EDGE_NAMES = { era: 'Same era', place: 'Same place', soundtrack: 'Same soundtrack', scene: 'Same scene', member: 'Member moved', builton: 'Built on', roots: 'Roots', producer: 'Same producer', label: 'Same label', related: 'Fans also play' };
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
  era: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  place: 'M2 4l4-1.5 4 1.5 4-1.5v9.5L10 13.5 6 12 2 13.5zM6 2.5V12M10 4v9.5',
  soundtrack: 'M3 2.5h10v11H3zM6 2.5v11M10 2.5v11M3 6h3M10 6h3M3 10h3M10 10h3',
};
// Drawn UI icons (play, pause, heart, close) in the tree icons' 16px, 1.6 stroke.
const ICONS = { play: 'M5 3.2v9.6L12.8 8z', more: 'M3.5 8h.01M8 8h.01M12.5 8h.01', pause: 'M5.5 3.5v9M10.5 3.5v9', close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  heart: 'M8 13.4S2.3 10 2.3 6a2.9 2.9 0 0 1 5.7-1.2A2.9 2.9 0 0 1 13.7 6c0 4-5.7 7.4-5.7 7.4z' };
function icon(name, filled) {
  const s = svgEl('svg', { viewBox: '0 0 16 16', class: `icon i-${name}${filled ? ' filled' : ''}`, 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('path', { d: ICONS[name] }));
  return s;
}
const svgEl = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const edgeIcon = edge => { const s = svgEl('svg', { viewBox: '0 0 16 16', class: 'edge-icon', 'aria-hidden': 'true' }); s.append(svgEl('path', { d: EDGE_ICONS[edge] || EDGE_ICONS.related })); return s; };

// "⋯": a disclosure for a card's secondary actions. Opens on hover or when focus enters it, stays open after a click,
// closes on Esc (focus back on ⋯), outside click or when focus leaves.
function overflowMenu(id, name, ...items) {
  const menu = el('div', { className: 'node-menu', id, hidden: true }, ...items);
  const b = el('button', { type: 'button', className: 'dots', ariaLabel: `More for ${name}` }, icon('more'));
  b.setAttribute('aria-controls', id);
  const wrap = el('div', { className: 'node-menu-wrap' }, b, menu);
  let pinned = false;
  const set = on => { menu.hidden = !on; b.setAttribute('aria-expanded', on); if (!on) pinned = false; };
  wrap.close = () => set(false);
  // A mouse click on a hover-opened menu pins it (rather than closing it under the pointer); a keyboard press toggles.
  b.onclick = e => { if (menu.hidden || (e.detail && !pinned)) { pinned = true; set(true); } else set(false); };
  wrap.addEventListener('mouseenter', () => set(true));
  wrap.addEventListener('mouseleave', () => { if (!pinned && !wrap.contains(document.activeElement)) set(false); });
  wrap.addEventListener('focusin', e => { if (!wrap.contains(e.relatedTarget)) set(true); });
  wrap.addEventListener('focusout', e => { if (!wrap.contains(e.relatedTarget)) set(false); });
  wrap.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); set(false); b.focus(); } });
  set(false);
  return wrap;
}
// A full trackRow's About and Full song, moved behind ⋯ (Tree cards and Stamp rows).
function moreMenu(row, id, name) {
  return overflowMenu(id, name, row.querySelector('.about-more'), el('details', { className: 'full-more' }, el('summary', { textContent: 'Full song' }), row.querySelector('.full-song')));
}
document.addEventListener('pointerdown', e => $$('.node-menu:not([hidden])').forEach(m => { if (!m.parentElement.contains(e.target)) m.parentElement.close(); }));

function placeNode(n, canvas) {
  const row = trackRow(n.track, { reason: n.label || 'Your song', full: true, tag: 'div' });
  if (EDGE_ICONS[n.edgeType]) row.querySelector('.reason').prepend(edgeIcon(n.edgeType));
  const more = btn('+ More', () => moreTree(n), 'more');
  more.setAttribute('aria-label', `More from this branch: ${n.track.artist} – ${n.track.title}`);
  // Secondary actions sit in one quiet row under the song: Skip / OK / Love (Love alone on your song), ⋯ (About, Full song), More.
  const love = row.querySelector('.love');
  const actions = el('div', { className: 'node-actions' }, n.parentId == null ? love : rateGroup(n.track, love),
    moreMenu(row, `node-menu-${n.id}`, `${n.track.artist} – ${n.track.title}`), more);
  const card = el('div', { className: 'node-card' }, el('span', { className: 'step' }), row, actions);
  love.sync();
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
  $('#saved-like-count').textContent = profile.likes.length;
  const list = $('#saved-list');
  list.replaceChildren(...profile.likes.slice().reverse().map(t => trackRow(t, {
    extra: extraOf(t), full: true, // re-loving keeps the stamp
    reason: [t.country && `${countryNames[t.country] || t.country}, ${t.decade}s`, t.ts && `loved ${new Date(t.ts).toLocaleDateString()}`].filter(Boolean).join(' · ') })));
  if (!profile.likes.length) list.append(el('li', { className: 'state empty' },
    el('p', { textContent: 'Nothing saved yet. Press Love on any track to keep it here.' }),
    el('div', { className: 'row' }, btn('Start a Blind Test', () => showTab('blind'), 'primary'), btn('Open Genre Stamps', () => showTab('stamps')))));
}

// ---------- Home ----------
const day = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const topOf = (xs, n = 3) => Object.entries(xs.reduce((a, x) => ((a[x] = (a[x] || 0) + 1), a), {})).sort((a, b) => b[1] - a[1]).slice(0, n);
function renderHome() {
  if (!profile) return;
  const { last, likes } = profile, f = last && last.from && $(`#tab-${last.from.tab}`) ? last.from : null;
  // Last on the platter: the record you played last; before any play, the newest love; before any love, a blank inner sleeve.
  const loved = !last && likes[likes.length - 1], shown = last ? last.track : loved;
  if (!current) setTint(shown && shown.cover);
  const blank = () => el('span', { className: 'sleeve-blank' });
  const art = shown && shown.cover ? el('img', { src: bigCover(shown.cover), alt: '' }) : blank();
  if (art.tagName === 'IMG') art.onerror = () => art.replaceWith(blank());
  $('#platter').classList.toggle('is-empty', !shown);
  $('#platter-title').textContent = last ? 'Last on the platter' : loved ? 'Last you loved' : 'Nothing on the platter yet';
  $('#platter-art').replaceChildren(art);
  $('#platter-body').replaceChildren(...(shown ? [
    trackRow(shown, { tag: 'div', from: f || undefined, extra: extraOf(shown),
      reason: last ? `Played ${day(last.ts)}${f ? ` from ${f.label || tabName(f.tab)}` : ''}` : loved.ts ? `Loved ${day(loved.ts)}` : 'Loved' }),
    el('div', { className: 'row' }, btn(tonight.length ? 'Next mystery' : 'Start a Blind Test', () => showTab('blind'), 'primary'),
      f && f.tab !== 'blind' ? btn(`Back to ${tabName(f.tab)}`, () => showTab(f.tab)) : null)]
    : [el('p', { className: 'muted', textContent: 'Start with a mystery: one track, no names, and you rate it before you find out who it was.' }),
      el('div', { className: 'row' }, btn('Start a Blind Test', () => showTab('blind'), 'primary'))]));

  // Lately: one sentence from your loves and picks, not a stats table.
  const and = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
  const parts = [topOf(likes.filter(l => l.country).map(l => countryNames[l.country] || l.country)).map(([k]) => k),
    topOf(likes.filter(l => l.decade).map(l => `the ${l.decade}s`), 2).map(([k]) => k),
    profile.prefs.genres.slice(0, 2).map(g => g.name)].filter(x => x.length).map(and);
  $('#lately').textContent = parts.length ? `Lately: ${parts.join('; ')}.` : 'Love a few records and your taste starts to show here.';

  // Other ways in: a quiet row (the tabs are the ways in); the stamps tab is whatever the tab after Blind Test is called now.
  const stampTab = tabs.find(b => !['home', 'blind', 'tree', 'saved', 'prefs'].includes(b.dataset.tab));
  const stamps = Object.keys(profile.stamps || {}).length, newest = likes[likes.length - 1];
  const ways = [['blind', tonight.length ? `${tonight.length} revealed tonight` : 'a mystery is cued up'],
    stampTab && [stampTab.dataset.tab, `${stamps} stamp${stamps === 1 ? '' : 's'} so far`],
    ['tree', newest ? `grow one from “${newest.title}”` : 'start from any song']].filter(Boolean);
  $('#ways').replaceChildren(...ways.map(([tab, live]) => el('li', {}, el('button', { type: 'button', className: 'way', onclick: () => showTab(tab) },
    el('span', { className: 'way-name', textContent: tabName(tab) }), el('span', { className: 'way-live', textContent: live })))));

  // Recent finds: tonight's reveals and your newest loves, one crate of sleeves.
  const seen = new Set(), finds = [];
  for (const { t, kind, extra } of tonight) finds.push({ t, extra, reason: `You said ${VERDICT[kind]} tonight` });
  for (const t of likes.slice().reverse()) finds.push({ t, extra: extraOf(t), reason: t.ts ? `Loved ${day(t.ts)}` : 'Loved' });
  const crate = finds.filter(({ t }) => !seen.has(likeKey(t)) && seen.add(likeKey(t))).slice(0, 8);
  $('#recent-count').textContent = crate.length || '';
  $('#recent').replaceChildren(...(crate.length ? crate.map(({ t, extra, reason }) => trackRow(t, { extra, reason }))
    : [el('li', { className: 'state empty' }, el('p', { textContent: 'Nothing in the crate yet. Rate a mystery or love a track anywhere and it lands here.' }))]));
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
  a.name, icon('close')))));
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

// ---------- Spotify (options A + C; tokens stay in main) ----------
let sp = { connected: false };
function renderSpotifyPrefs(msg) {
  $('#sp-redirect').textContent = sp.redirectUri || '';
  if (!$('#sp-client').value) $('#sp-client').value = sp.clientId || '';
  $('#sp-connect').hidden = !!sp.connected;
  $('#sp-off').hidden = !sp.connected;
  $('#sp-setup').open = !sp.clientId && !sp.connected;
  $('#sp-status').textContent = msg ?? (sp.connected ? `Connected as ${sp.name || 'your Spotify account'}.` : 'Not connected.');
}
function openSpotifyPrefs() {
  showTab('prefs');
  $('#spotify-prefs').scrollIntoView({ block: 'start' });
  (sp.connected ? $('#sp-off') : $('#sp-client')).focus();
}
$('#sp-connect').addEventListener('submit', async e => {
  e.preventDefault();
  $('#sp-go').disabled = true;
  renderSpotifyPrefs('Log in to Spotify in your browser, then come back here…');
  const r = await spotify.connect($('#sp-client').value).catch(() => ({ error: 'Spotify login failed. Try again.' }));
  $('#sp-go').disabled = false;
  if (r.error) return renderSpotifyPrefs(r.error);
  sp = r;
  renderSpotifyPrefs();
});
$('#sp-off').onclick = async () => { sp = await spotify.disconnect(); renderSpotifyPrefs(); $('#sp-client').focus(); };
$('#sp-dash').onclick = () => api.open('https://developer.spotify.com/dashboard').catch(() => toast('Could not open the browser'));

// Plays that exact track on the user's Spotify device; several idle devices: ask which, next to the button.
async function playInSpotify(t, b, deviceId) {
  b.disabled = true;
  const r = await spotify.play(plain(t), deviceId).catch(() => ({ error: 'Spotify failed. Try again.' }));
  b.disabled = false;
  b.parentElement.querySelector('.sp-devices')?.remove();
  if (r.devices) return b.after(el('span', { className: 'sp-devices' }, el('span', { className: 'full-label', textContent: 'Play on:' }),
    ...r.devices.map(d => btn(d.name, () => playInSpotify(t, b, d.id), 'ext'))));
  if (r.error) return toast(r.error);
  audio.pause();
  toast(`Playing “${t.title}” in Spotify${r.name ? ` on ${r.name}` : ''}`);
}

// Private playlist from tracks (in order); reports matches and the songs Spotify doesn't have. Genre Stamps can call it too.
async function exportToSpotify(name, tracks, out, b) {
  if (!sp.connected) return openSpotifyPrefs();
  if (!tracks.length) return out.replaceChildren('Nothing to export yet.');
  if (b) b.disabled = true;
  out.replaceChildren(`Finding ${tracks.length} songs on Spotify…`);
  const r = await spotify.exportPlaylist(name, plain(tracks)).catch(() => ({ error: 'Spotify failed. Try again.' }));
  if (b) b.disabled = false;
  const miss = r.unmatched?.length ? ` Not on Spotify: ${r.unmatched.map(u => `${u.artist} – ${u.title}`).join(', ')}.` : '';
  if (r.error) return out.replaceChildren(r.error + miss);
  out.replaceChildren(`Added ${r.added} of ${r.total} songs to the private playlist “${name}”.${miss} `,
    btn('Open in Spotify', () => api.open(r.url).catch(() => toast('Could not open the browser')), 'ext'));
}
$('#saved-export').onclick = e => exportToSpotify('Stumble: Loved', profile.likes.slice().reverse(), $('#saved-export-status'), e.currentTarget);
$('#tree-export').onclick = e => {
  const steps = $$('#tree-canvas .tree-node').map(n => trNodes[n.dataset.nodeId]?.track).filter(Boolean); // guided-step (document) order
  exportToSpotify(steps.length ? `Stumble: ${steps[0].title} family tree` : 'Stumble', steps, $('#tree-export-status'), e.currentTarget);
};

// ---------- start ----------
(async () => {
  sp = await spotify.status().catch(() => sp);
  renderSpotifyPrefs();
  profile = await store.load();
  regionList = await api.countries();
  buildStamps(regionList);
  $('#adventure').value = profile.adventure;
  showAdventure();
  afterLikeChange();
  renderTonight();
  syncPlayState(); // draws the play icons
  if (!introSeen() && !profile.likes.length) openPrefs(true); else showTab('home');
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
