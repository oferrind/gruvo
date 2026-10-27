// Renderer: UI only. All network/logic runs in main via window.api; profile via window.store.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
// Deezer covers: rows use the 250px one; the big sleeve asks for 500px (same URL pattern; an old like keeps working, and a miss falls back to the small one).
const bigCover = u => (u ? u.replace('/250x250-', '/500x500-') : u);
const coverImg = (url, props, big) => {
  const i = el('img', { src: big ? bigCover(url) : url, ...props });
  if (big && i.src !== url) i.dataset.small = url;
  return i;
};
// A cover that failed (offline, a blip) is retried when the connection is back; a big one first falls back to the small one.
const failedImgs = new Set();
document.addEventListener('error', e => {
  const i = e.target;
  if (i.tagName !== 'IMG') return;
  if (i.dataset.small && i.src !== i.dataset.small) return void (i.src = i.dataset.small);
  failedImgs.add(i);
}, true);
window.addEventListener('online', () => { for (const i of failedImgs) { failedImgs.delete(i); if (i.isConnected) { const u = i.src; i.removeAttribute('src'); i.src = u; } } });
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

// One loading / empty / error / done line, with optional drawing, progress bar and next-action buttons.
function setState(box, kind, msg, { actions = [], progress, art } = {}) {
  box.className = `state ${kind}`;
  box.setAttribute('aria-busy', kind === 'loading');
  box.replaceChildren(...[
    art ? el('img', { className: 'state-art', src: `img/${art}.png`, alt: '' }) : null,
    msg ? el('p', {}, kind === 'loading' ? el('span', { className: 'spinner', ariaHidden: 'true' }) : null, msg) : null,
    progress ? el('progress', { max: progress[1], value: progress[0], ariaLabel: 'Progress' }) : null,
    actions.length ? el('div', { className: 'row' }, ...actions) : null].filter(Boolean));
}

// ---------- player (one <audio> for the whole app) ----------
const audio = $('#audio');
let current = null, currentExtra = null, currentFrom = null, retried = false, onFail = null;
const hidden = t => t === mystery && !rated; // an unrated mystery: nothing that names it (cover, colour, last-played) may show

// from: {tab, label} where the track was started, for the bar's "came from" chip and Home's "continue".
async function play(item, { onFail: failCb, extra, from } = {}) {
  current = item; currentExtra = extra || null; currentFrom = from || null; retried = false; onFail = failCb || null;
  renderNpLike(); renderNpMeta(); syncPlayState();
  remember(item);
  // Stop the old track now: while the new preview is fetched (or turns out unavailable) its time must not drive the new scrubber or tonearm.
  if (audio.getAttribute('src')) { audio.removeAttribute('src'); audio.load(); }
  // Saved likes have no preview URL (they expire); fetch one at play time.
  const url = await phoneSrc(item.previewUrl || await call('freshPreview', plain(item)));
  if (current !== item) return URL.revokeObjectURL(url);
  if (!url) return unavailable();
  setSrc(url);
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
  const url = await phoneSrc(await call('freshPreview', plain(item), true)); // bypass cache: token likely expired
  if (current !== item) return URL.revokeObjectURL(url);
  if (!url) return unavailable();
  setSrc(url);
  audio.play().catch(() => {});
});
const plain = o => JSON.parse(JSON.stringify(o));
// Phone (api.caps.blobAudio): play the preview from in-memory bytes, so the WebView never caches it on disk. Desktop: the url as is.
async function phoneSrc(url) {
  if (!url || !api.caps?.blobAudio) return url;
  const buf = await api.audio(url);
  if (!buf || !buf.byteLength) return null;
  return URL.createObjectURL(new Blob([buf], { type: 'audio/mpeg' }));
}
// Frees the previous preview's bytes when a new one replaces it (play() clears src while fetching, so audio.src can't say which blob to free).
let blobUrl = '';
function setSrc(url) {
  if (blobUrl && blobUrl !== url) URL.revokeObjectURL(blobUrl);
  blobUrl = url.startsWith('blob:') ? url : '';
  audio.src = url;
}

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
  $('.nowbar').classList.toggle('is-deck', !!current && current === mystery); // phone: the deck is the player only for the mystery, any other song keeps the mini-player
  $$('.track.is-playing').forEach(r => r.classList.remove('is-playing'));
  $$('.track .play').forEach(b => { b.replaceChildren(icon('play')); b.setAttribute('aria-label', b.dataset.label); });
  if (current) $$(`.track[data-key="${CSS.escape(likeKey(current))}"]`).forEach(r => {
    r.classList.add('is-playing');
    const b = r.querySelector('.play');
    if (playing) { b.replaceChildren(icon('pause')); b.setAttribute('aria-label', 'Pause'); }
  });
}
['play', 'pause', 'ended', 'emptied'].forEach(ev => audio.addEventListener(ev, syncPlayState));
audio.addEventListener('ended', () => { audio.currentTime = 0; scrubbing = false; onTime({ type: 'ended' }); }); // a finished track starts its bar over
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

// The bar: the cover (a plain "?" sleeve while it is a mystery), title over artist, and the "came from" link back to the source.
const tabName = id => ($(`#tab-${id}`)?.firstChild.textContent || id).trim();
function renderNpMeta() {
  const [title, artist] = !current ? ['Nothing playing', ''] : hidden(current) ? ['Mystery track', ''] : [current.title, current.artist];
  $('#now-playing').textContent = title; $('#np-artist').textContent = artist;
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
  entry.stamp = extra.stamp || null; // a Crate Dig song keeps its scene; the count steers rolls toward places and genres you have not loved yet
  if (entry.stamp) { const n = profile.stamps[entry.stamp] = (profile.stamps[entry.stamp] || 0) + 1; }
  addHeard(t);
  save();
  afterLikeChange();
  teach(t, 'love');
}
// Upsert this track's taste-model rating once its fingerprint is known (no preview / decode failure: nothing learned).
function teach(t, kind) {
  if (t.artistDzId != null) { // Blind Test returns: OK-rated artists may come back at low Adventure; a Skip withdraws that
    const ok = profile.back.ok.filter(i => i !== t.artistDzId);
    profile.back.ok = (kind === 'ok' ? [...ok, t.artistDzId] : ok).slice(-50);
  }
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
  lovedTags(); // loves changed: refresh the tag profile (paced and cached lookups)
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
    const card = group.closest('.dig-focus');
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
  if (t.noPreview) return el('span', { className: 'full-song' }, link('Open in Spotify', Links.spotify(t)), link('Open in YouTube', Links.youtube(t))); // MusicBrainz-only song: these stand in for the play button
  return el('span', { className: 'full-song' }, sp.connected ? el('button', { type: 'button', className: 'primary sp-play',
    onclick: e => playInSpotify(t, e.currentTarget) }, icon('play'), 'Play in Spotify') : null, el('span', { className: 'full-label', textContent: 'Full song:' }),
    link('YouTube', Links.youtube(t)), link('Spotify', Links.spotify(t)), link('Deezer', dz));
}

// One track row: cover, title / artist, optional reason, play, love.
// from: where the bar's "came from" chip leads; by default the row's own tab (Family Tree rows pass "Tree, via <title>").
const fromOf = row => {
  const tab = row.closest('.panel')?.id;
  return tab ? { tab, label: tabName(tab) } : null;
};
function trackRow(t, { extra, reason, full, tag = 'li', from } = {}) {
  const name = `${t.artist} – ${t.title}`;
  const title = el('span', { className: 'title', textContent: t.title });
  const playBtn = el('button', { type: 'button', className: 'play',
    onclick: () => current && likeKey(current) === likeKey(t) && audio.getAttribute('src') ? togglePlay() : play(t, { extra, from: from || fromOf(row) }) });
  playBtn.append(icon('play'));
  playBtn.dataset.label = `Play ${name}`;
  playBtn.setAttribute('aria-label', playBtn.dataset.label);
  const row = el(tag, { className: 'track' },
    t.cover ? coverImg(t.cover, { alt: '', width: 48, height: 48 }, full) : el('span', { className: 'cover-ph', ariaHidden: 'true' }),
    t.noPreview ? null : playBtn,
    el('div', { className: 'meta' }, title, el('span', { className: 'artist', textContent: t.artist + (t.year ? ` · ${t.year}` : '') }),
      reason ? el('small', { className: 'reason', textContent: reason }) : null, full || t.noPreview ? fullSong(t) : null, full ? aboutDetails(t) : null),
    loveButton(t, extra));
  row.dataset.key = likeKey(t);
  if (current && likeKey(current) === row.dataset.key) row.classList.add('is-playing');
  return row;
}

// ---------- tabs + first-launch intro ----------
const tabs = $$('#tabs [role=tab]');
let introOpen = false;
const tabHist = []; // tabs left behind, for the Android back button
let goingBack = false;
function showTab(name, focus) {
  closeIntro();
  const prev = tabs.find(b => b.getAttribute('aria-selected') === 'true')?.dataset.tab;
  if (prev && prev !== name && !goingBack) { const i = tabHist.lastIndexOf(name); if (i >= 0) tabHist.length = i; tabHist.push(prev); } // revisiting a tab drops the loop, so Back never replays ping-pong
  tabs.forEach(b => { const on = b.dataset.tab === name; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
  $$('.panel').forEach(p => { p.hidden = p.id !== name; });
  if (prev !== name && !goingBack) scrollTo(0, 0); // a new tab opens at its top
  if (name === 'home') renderHome();
  if (name === 'blind' && mystery && !rated && !current) playMystery(); // Home is the landing page: the first mystery waits until you come here
  if (name === 'saved') renderSaved();
  if (name === 'prefs') renderPrefs();
  if (name === 'tree' && !trNodes.length) showStart(true);
}
$('#tabs').addEventListener('click', e => { const t = e.target.closest('[role=tab]'); if (t) showTab(t.dataset.tab); });
$('#brand').onclick = () => showTab('home'); // phones have no Home tab: the brand is the way back
// Touch screen with no mouse: hide key hints (CSS .touch) and say "tap" where the copy says "press Enter".
{
  const mq = matchMedia('(hover: none) and (pointer: coarse)');
  const sync = () => {
    document.documentElement.classList.toggle('touch', mq.matches);
    $('#pref-artist-help').textContent = mq.matches ? 'Tap a match below to add it.' : 'Press Enter to add the best match, or pick one below.';
  };
  mq.addEventListener('change', sync);
  sync();
}
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
const startBlind = () => {
  showTab('blind');
  if (mystery && current !== mystery) playMystery();
  $('#mystery-play').focus();
};
$('#intro-start').onclick = startBlind;
$$('#intro [data-goto]').forEach(b => { b.onclick = () => (b.dataset.goto === 'blind' ? startBlind() : showTab(b.dataset.goto)); });

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
    return c;
  })().catch(() => { c.tagSim = null; return c; });
  if (fresh) c.tagP.then(() => { if (!mystery && queue.includes(c)) showMystery(); }); // first call only: no re-entry loop
  return c.tagP;
}
function observe(c) { // once both scores exist: feed the calibration window (~80 recent candidates)
  if (c.obs || !c.vec || c.tagSim === undefined || !warm()) return;
  c.obs = true;
  const L = Features.nearest(c.vec, profile.ratings, 'love');
  c.sc = { t: c.tagSim, s: L ? -L.d : null };
  seen.push(c.sc);
  if (seen.length > 80) seen.shift();
}
function nextFromQueue() {
  if (!warm()) return queue.shift() || null;
  queue.forEach(c => { tagScore(c); observe(c); });
  const cut = Features.blendCut(seen, profile.adventure);
  const known = c => c.sc;
  const fit = c => c.back || misfits >= 12 || Features.blend(c.sc, seen) >= cut;
  const drop = queue.filter(c => c.vec && known(c) && !fit(c));
  misfits += drop.length;
  const ready = queue.filter(c => c.vec && known(c) && fit(c));
  if (!ready.length && !shownN) { // the session's first mystery: play the first listened-to preview, don't wait on tag lookups
    const quick = queue.find(c => c.vec);
    if (quick) { queue.splice(queue.indexOf(quick), 1); return quick; }
  }
  if (!ready.length) { queue.splice(0, queue.length, ...queue.filter(c => !drop.includes(c) && c.vec !== null)); return null; } // wait for more fingerprints
  const [best, ...rest] = ready.sort((x, y) => Features.blend(y.sc, seen) - Features.blend(x.sc, seen));
  misfits = 0;
  rest.forEach(c => { c.passed = (c.passed || 0) + 1; });
  const keep = queue.filter(c => c !== best && !drop.includes(c) && !(c.passed >= 3) && c.vec !== null); // vec null = preview failed to decode: can't be ranked, drop it
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
    if (accept(back)) { fails = 0; continue; }
    const source = warm() ? Features.pickSource(profile.adventure, profile.prefs.genres.length > 0) : undefined;
    const ask = () => call('nextCandidate', { likes: plain(profile.likes), heard: profile.heard, exclude: excluded(), adventure: profile.adventure, source, prefs: profile.prefs });
    if (source === 'trail') { // MusicBrainz trails can take ~10 s: run one on the side so the other sources keep filling
      if (!trailing) { trailing = true; ask().then(c => { trailing = false; if (queue.length < 6) accept(c); }); }
      continue;
    }
    // Nothing to play at all (first launch, cold cache): two more searches run on the side and the first to land plays. One slow
    // MusicBrainz search no longer holds up the first mystery; net.js paces each request, so this stays polite.
    if (!mystery && !queue.length) while (side < 2) { side++; ask().then(c => { side--; tried++; if (!accept(c)) finding(); }); }
    const cc = await ask();
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
  $('#deck').prepend(m.cover ? coverImg(m.cover, { className: 'sleeve', alt: `Cover of ${m.title}` }, true) : el('span', { className: 'sleeve cover-ph', ariaHidden: 'true' }));
  $('#deck').append(el('img', { className: 'verdict', src: `img/sticker-${kind}.png`, alt: '' })); // the shop's sticker; the sr-only line below says it
  $('#deck').dataset.verdict = kind;
  const [meta, about] = revealDetails(m);
  $('#mystery-title').textContent = m.title; // the song's name takes the "Mystery track" line; the artist leads the card below
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
let SD, stRun = 0, stDone = false, stOpen = null, stSongs = [], nextRoll = null;
const stState = (kind, msg, opts) => setState($('#stamp-state'), kind, msg, opts);
// Per-viewer conveniences only (last rolls, combos that came back thin); losing them is harmless. Rarity lives in the profile.
const ls = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = { Africa: 1, Asia: 2, Europe: 3, 'North America': 4, 'Latin America & Caribbean': 5, Oceania: 6 };
// A like's stamp: new likes carry it (null = none); an old Passport like (country + decade) counts toward its legacy stamp.
const stampOf = e => ('stamp' in e ? e.stamp : e.country && e.decade ? `${e.decade}-${e.country}-` : null);
// Re-loving keeps the stamp. A saved like with no stamp field is an old Passport like: it re-earns its legacy stamp, as unloving took it away.
const extraOf = t => (t.country || t.stamp ? { country: t.country, decade: t.decade, genre: t.genre, stamp: 'stamp' in t ? t.stamp : t.ts ? stampOf(t) : null } : undefined);
function buildStamps(regions) {
  SD = StampData(regions, window.GENRE_DATA);
  for (const list of Object.values(regions)) Object.assign(countryNames, list);
  const opt = (value, text) => el('option', { value, textContent: text });
  $('#b-decade').append(opt('', 'any decade'), ...SD.DECADES.map(d => opt(d, SD.decadeName(d))));
  $('#b-place').append(opt('', 'anywhere'), ...SD.CONTINENTS.map(c => el('optgroup', { label: c }, ...Object.keys(SD.ALL_CC).filter(cc => SD.continentOf(cc) === c)
    .sort((a, b) => SD.DEMONYM[a].localeCompare(SD.DEMONYM[b])).map(cc => opt(cc, SD.DEMONYM[cc])))));
  $('#b-genre').append(...Object.entries(SD.GENRES).sort((a, b) => a[1][0].localeCompare(b[1][0])).map(([g, [name]]) => opt(g, name)));
  $('#cat-filter').append(...SD.CONTINENTS.map(c => opt(c, c)));
  syncBuilder(SD.makeStamp('1990-JP-rock'));
  $('#builder').classList.toggle('has-sheet', SD.ATLAS.size > 0);
  $('#genre-family').append(...Object.entries(SD.FAMILIES).filter(([f]) => [...SD.ATLAS.values()].some(e => e.family === f)).map(([f, n]) => opt(f, n)));
  $('#genre-tier').append(...Object.entries(SD.TIERS).map(([t, n]) => opt(t, n)));
  $('#genre-total').textContent = SD.ATLAS.size ? `(${SD.ATLAS.size.toLocaleString()})` : '';
  $('#br-genres').hidden = !SD.ATLAS.size;
  const m = ls('stampMode');
  setMode(m === 'browse' ? ls('stampBrowse') : m); // 'browse' + stampBrowse: the two switches before they became one
}
// One switch for the left column: Roll (Surprise me + Pick one), or the catalogue by Scenes or by Genres.
function setMode(mode) {
  if (mode === 'genres' && !SD.ATLAS.size) mode = 'scenes';
  if (mode !== 'scenes' && mode !== 'genres') mode = 'roll';
  $('#stamps').dataset.mode = mode;
  $('#roll-pane').hidden = mode !== 'roll'; $('#browse-pane').hidden = $('#browse-find').hidden = mode === 'roll';
  $('#browse-q').placeholder = mode === 'genres' ? 'Search genres: zeuhl, shoegaze…' : 'Search scenes: Lagos, city pop…';
  $('#browse-q').setAttribute('aria-label', mode === 'genres' ? 'Search genres' : 'Search scenes');
  $('#scenes-view').hidden = mode !== 'scenes'; $('#genres-view').hidden = mode !== 'genres';
  for (const [id, m] of [['mode-roll', 'roll'], ['br-scenes', 'scenes'], ['br-genres', 'genres']]) $(`#${id}`).setAttribute('aria-pressed', String(mode === m));
  ls('stampMode', mode);
  if (mode === 'genres') renderGenreList(); else if (mode === 'scenes') renderCatalogue();
  renderStampHead(); // its empty line speaks to the chosen mode
}
$('#mode-roll').onclick = () => setMode('roll');
$('#br-scenes').onclick = () => setMode('scenes');
$('#br-genres').onclick = () => setMode('genres');
// Phone: the songs sit under the Roll and the sentence; bring them up once a pick is made (after the reel lands, for a Roll).
const toResults = (delay = 0) => { if (PHONE.matches) setTimeout(() => $('#stamp-head').scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' }), delay); };
const STACKED = matchMedia('(max-width: 899px)'); // one column: a search hides the last pick (CSS), so opening a result clears it
const pick = s => { if (STACKED.matches && $('#browse-q').value) { $('#browse-q').value = ''; renderBrowse(); } openStamp(s); toResults(); };

// ---- Genres view: search + family/tier filters over the atlas (docs/12) ----
let gShown = 60, gDig = null, gTimer = 0;
function genreItem(s) {
  const b = el('button', { type: 'button', className: `cat-item ink-g`, onclick: () => pick(s) },
    el('span', { className: 'cat-label', textContent: s.label }),
    el('span', { className: 'cat-blurb', textContent: `${SD.FAMILIES[s.family].toLowerCase()} · ${SD.TIERS[s.tier]}` }));
  if (stOpen && stOpen.id === s.id) b.setAttribute('aria-current', 'true');
  return el('li', {}, b);
}
function renderGenreList() {
  if ($('#genres-view').hidden) return;
  const q = $('#browse-q').value, family = $('#genre-family').value, gTier = $('#genre-tier').value, none = !q.trim() && !family && !gTier;
  let stamps, total;
  if (none) { // "Dig somewhere new": 12 random uncollected Deep/Obscure genres
    gDig ??= [...SD.ATLAS.values()].filter(e => e.tier !== 'C' && !profile.stamps[`--${e.slug}`]).sort(() => Math.random() - .5).slice(0, 12).map(e => SD.makeStamp(`--${e.slug}`));
    stamps = gDig; total = stamps.length;
  } else ({ stamps, total } = SD.searchGenres(q, { family, tier: gTier }, gShown));
  $('#genre-dig').textContent = none ? 'Dig somewhere new' : `${total} genre${total === 1 ? '' : 's'}`;
  $('#genre-list').replaceChildren(...(stamps.length ? stamps.map(genreItem) : [noMatch('genre')]));
  $('#genre-more').hidden = none || total <= stamps.length;
  $('#genre-more').textContent = `Show more (${total - stamps.length})`;
}
// One search field over both lists (Scenes and Genres), kept across the switch. On a phone it stays under the top bar,
// and typing brings the list up under it, past an open pick's songs.
function renderBrowse() {
  $('#browse-clear').hidden = !$('#browse-q').value;
  gShown = 60; catAll = false;
  renderGenreList(); renderCatalogue();
  const f = $('#browse-find'), under = parseFloat(getComputedStyle(f).top) + f.offsetHeight; // where the field's bottom sits once stuck
  const d = $('#browse-pane').getBoundingClientRect().top - under;
  if (PHONE.matches && Math.abs(d) > 1) scrollBy(0, d);
}
// No match: the "?" sleeve and a way back.
const noMatch = what => {
  const q = $('#browse-q').value.trim();
  return el('li', { className: 'cat-empty' }, el('img', { className: 'state-art', src: 'img/empty-unknown.png', alt: '' }),
    el('p', { textContent: q ? `No ${what} matches "${q}".` : `No ${what} matches these filters.` }), q ? btn('Clear search', clearBrowse) : null);
};
const clearBrowse = () => { $('#browse-q').value = ''; renderBrowse(); $('#browse-q').focus(); };
$('#browse-q').addEventListener('input', () => { clearTimeout(gTimer); gTimer = setTimeout(renderBrowse, 150); });
$('#browse-q').addEventListener('keydown', e => {
  if (e.key === 'Escape' && e.target.value) { e.preventDefault(); return clearBrowse(); }
  if (e.key !== 'Enter') return;
  e.preventDefault(); clearTimeout(gTimer); renderBrowse();
  const top = $('#browse-pane > :not([hidden]) .cat-item'); if (top) top.click();
});
$('#browse-clear').onclick = clearBrowse;
$$('#genre-family, #genre-tier').forEach(s => s.addEventListener('change', () => { gShown = 60; renderGenreList(); }));
$('#genre-more').onclick = () => { gShown += 60; renderGenreList(); $$('#genre-list .cat-item')[gShown - 60]?.focus(); };
function syncBuilder(s) {
  if (s.decade) $('#b-decade').value = s.decade;
  if (s.cc) $('#b-place').value = s.cc;
  if (Object.hasOwn(SD.GENRES, s.genre)) $('#b-genre').value = s.genre;
  syncGenreBtn();
}
// Phone: the genre select is replaced by a button that opens a searchable sheet over every atlas genre (CSS shows it only on phones).
const syncGenreBtn = () => { $('#b-genre-btn').textContent = $('#b-genre').selectedOptions[0]?.textContent || 'any genre'; };
const gSheet = el('div', { className: 'sheet', id: 'genre-sheet', role: 'dialog', ariaLabel: 'Pick a genre', hidden: true });
const gSheetQ = el('input', { type: 'search', placeholder: 'Search genres: zeuhl, shoegaze...', autocomplete: 'off', spellcheck: false, ariaLabel: 'Search genres' });
const gSheetList = el('ul', { className: 'cat-list' });
function fillGenreSheet() {
  const { stamps } = SD.searchGenres(gSheetQ.value, {}, 60);
  gSheetList.replaceChildren(...stamps.map(s => el('li', {}, el('button', { type: 'button', className: 'cat-item ink-g', onclick: () => {
    const sel = $('#b-genre');
    if (!$$('#b-genre option').some(o => o.value === s.genre)) sel.append(el('option', { value: s.genre, textContent: s.label })); // an atlas slug: makeStamp takes it in any combo
    sel.value = s.genre; syncGenreBtn(); gSheet.hidden = true; $('#b-genre-btn').focus();
  } }, el('span', { className: 'cat-label', textContent: s.label }), el('span', { className: 'cat-blurb', textContent: `${SD.FAMILIES[s.family].toLowerCase()} · ${SD.TIERS[s.tier]}` })))));
  if (!stamps.length) gSheetList.append(el('li', { className: 'muted cat-empty', textContent: 'No genre matches.' }));
}
gSheetQ.addEventListener('input', fillGenreSheet);
gSheet.append(gSheetQ, gSheetList);
gSheet.addEventListener('click', e => { if (e.target === gSheet) gSheet.hidden = true; }); // the scrim
$('#main').append(gSheet);
$('#b-genre-btn').onclick = () => { gSheetQ.value = ''; fillGenreSheet(); gSheet.hidden = false; gSheetQ.focus(); };
$('#builder').addEventListener('submit', e => {
  e.preventDefault();
  // A catalogue combo opens that entry; "any decade" / "anywhere" give a decade + genre, place + genre or bare genre stamp.
  const d = $('#b-decade').value, cc = $('#b-place').value, g = $('#b-genre').value;
  const ALIAS = { psych: 'psychedelic-rock', prog: 'progressive-rock', indie: 'indie-rock', chanson: 'chanson-francaise' }; // builder genre -> atlas slug
  const s = SD.makeStamp(`${d}-${cc}-${d && cc ? g : ALIAS[g] || g}`);
  $('#builder-note').textContent = s ? '' : `${SD.GENRES[g][0]} needs a decade and a place.`;
  if (s) pick(s);
});
$('#cat-filter').addEventListener('change', () => renderCatalogue());

let catAll = false; // the catalogue shows 8 rows until "Show all"
function renderCatalogue() {
  const q = $('#browse-q').value, list = SD.searchScenes(q, $('#cat-filter').value), all = catAll || !!q.trim(); // a search shows every match
  if (!list.length) { $('#cat-more').hidden = true; return $('#catalogue').replaceChildren(noMatch('scene')); }
  $('#catalogue').replaceChildren(...(all ? list : list.slice(0, 8)).map(s => {
    const b = el('button', { type: 'button', className: `cat-item ink-${INK[SD.continentOf(s.cc)]}`, onclick: () => pick(s) },
      el('span', { className: 'cat-label', textContent: s.label }),
      el('span', { className: 'cat-blurb', textContent: s.blurb }));
    if (stOpen && stOpen.id === s.id) b.setAttribute('aria-current', 'true');
    return el('li', {}, b);
  }));
  $('#cat-more').hidden = all || list.length <= 8;
  $('#cat-more').textContent = `Show all ${list.length}`;
}
$('#cat-more').onclick = () => { catAll = true; renderCatalogue(); $$('#catalogue .cat-item')[8]?.focus(); };

function renderStampHead() {
  const s = stOpen, head = $('#stamp-head');
  $('#stamp-export-box').hidden = !(stSongs.length && stDone); // only once the Roll has finished
  if (!s) return head.replaceChildren(el('p', { className: 'stamp-empty', textContent: { scenes: 'Pick a scene: a place, a decade and its sound. Ten songs from it.',
    genres: 'Search or pick a genre, from the well-known to the deeply obscure.' }[$('#stamps').dataset.mode] || 'Roll, or pick a genre. Add a decade or a place if you like.' }));
  head.replaceChildren(el('div', { className: 'stamp-info' },
    el('h2', { textContent: s.label }), s.blurb ? el('p', { className: 'stamp-blurb', textContent: s.blurb }) : null,
    s.atlas && SD.nearby(s.genre).length ? el('div', { className: 'chips nearby' }, el('span', { className: 'nearby-lead', textContent: 'Nearby' }),
      ...SD.nearby(s.genre).map(x => btn(x.label, () => openStamp(x), 'chip'))) : null));
}
function renderStamps() {
  if (!SD) return;
  renderCatalogue(); renderGenreList(); renderStampHead();
}
let stMenu = 0;
const PHONE = matchMedia('(max-width: 840px)');
PHONE.addEventListener('change', () => $$('#stamp-songs .track').forEach(r => r.fit?.()));
function songRow(t) {
  const row = trackRow(t, { extra: extraOf(t), full: true });
  if (t.year) row.querySelector('.artist').textContent = `${t.artist}, ${t.year}`;
  // At rest: ▶, Skip / OK / Love (as in the Blind Test and the Tree) and ⋯ for About and Full song, as on the Tree cards.
  const group = rateGroup(t, row.querySelector('.love')), more = moreMenu(row, `stamp-menu-${++stMenu}`, `${t.artist} – ${t.title}`);
  row.append(el('div', { className: 'node-actions' }, group, more));
  fitPhone(row, group, more);
  return row;
}
api.onStampRow((run, row) => {
  if (run !== stRun) return;
  stSongs.push(row);
  $('#stamp-songs').append(songRow(row));
});

// "More songs" under the list: idle button, busy, retry on failure, or the quiet end line. The cursor lives in main.
function showMore(s, run, doneMsg, mode = 'idle') {
  const box = $('#stamp-more');
  const go = () => {
    box.replaceChildren(el('button', { type: 'button', disabled: true, textContent: 'Finding more…' }));
    api.moreStamp(s.id, run).catch(() => ({ error: true })).then(res => {
      if (run !== stRun || !res) return;
      if (!res.error) stState('done', doneMsg(stSongs.length));
      showMore(s, run, doneMsg, res.error ? 'error' : res.more ? 'idle' : 'done');
    });
  };
  box.replaceChildren(...(mode === 'done' ? [el('p', { className: 'hint', textContent: `That's every song we could find for ${s.label}.` })]
    : mode === 'error' ? [el('p', { className: 'hint', textContent: "Couldn't load more songs." }), btn('Try again', go)] : [btn('More songs', go)]));
}
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
  stOpen = s; stSongs = []; stDone = false;
  $('#stamp-songs').replaceChildren(); $('#stamp-more').replaceChildren(); $('#stamp-export-status').replaceChildren();
  renderStampHead(); renderCatalogue(); renderGenreList();
  stState('loading', 'Searching…');
  const res = await api.stamp(s.id, run).catch(() => ({ error: true }));
  if (run !== stRun || !res) return;
  if (res.error) return stState('error', "Couldn't reach the record stacks. Check your connection and try again.", { art: 'empty-unknown', actions: [btn('Try again', () => openStamp(s), 'primary')] });
  if (res.thin) {
    markShort(s.id);
    if (rerolls > 0) return land(SD.roll(rollState()), rerolls - 1);
  }
  prefetchNext(s); // prefetched: the next dice landing is instant
  if (res.thin && s.atlas && !s.decade && !s.cc) {
    const near = SD.nearby(s.genre).slice(0, 3);
    return stState('empty', `Only ${res.count} song${res.count === 1 ? '' : 's'} tagged ${s.label.toLowerCase()} made it.${near.length ? ` Try ${near.map(x => x.label).join(' or ')}?` : ''}`,
      { actions: near.map(x => btn(x.label, () => openStamp(x))) });
  }
  if (res.thin) {
    const near = (s.atlas ? [SD.makeStamp(`--${s.genre}`)] : [s.decade - 10, s.decade + 10].map(d => SD.makeStamp(`${d}-${s.cc}-${s.genre}`))).filter(Boolean); // a genre with a place that is empty: the genre itself
    return stState('empty', `Only ${res.count} song${res.count === 1 ? '' : 's'} from ${s.label} made it.${near.length ? ` Try ${near.map(x => x.label).join(' or ')}?` : ''}`,
      { actions: near.map(x => btn(x.label, () => openStamp(x))) });
  }
  if (!stSongs.length) return stState('empty', 'No songs came through for this one.', { art: 'empty-unknown', actions: [btn('Try again', () => openStamp(s), 'primary')] }); // never a silent empty list
  stDone = true; $('#stamp-export-box').hidden = false;
  const doneMsg = n => (s.atlas ? `${n} songs tagged ${SD.ATLAS.get(s.genre).name}${s.decade ? `, first released in the ${SD.decadeName(s.decade)}` : ''}${s.cc ? `, by artists from ${countryNames[s.cc]}` : ''}.`
    : `${n} songs, every one first released in the ${SD.decadeName(s.decade)} by an artist from ${countryNames[s.cc]}.`);
  stState('done', doneMsg(res.count));
  if (res.more) showMore(s, run, doneMsg); else if (res.more === false) showMore(s, run, doneMsg, 'done');
  renderStamps();
}

// ---- Roll: one reel spins to the stamp name (~1.1 s) while the playlist is already on its way ----
const rollState = () => ({ held: profile.stamps, recent: ls('stampRecent') || [], adventurous: $('#adventurous').checked, streak: ls('stampStreak') || 0, gstreak: ls('stampGStreak') || 0,
  short: ls('stampShort') || [], topTags: [...profile.prefs.genres.map(g => g.name), ...profile.likes.filter(l => l.genre && SD.GENRES[l.genre]).flatMap(l => SD.GENRES[l.genre][1])] });
function doRoll() {
  setMode('roll'); // R from Browse: show the reel it lands on
  const st = rollState();
  const s = nextRoll && !st.recent.includes(nextRoll.id) ? nextRoll : SD.roll(st);
  nextRoll = null;
  land(s, 2);
  toResults(reduced() ? 0 : 1150);
}
// Lands a rolled stamp; one that comes back thin is re-rolled (up to `left` times) before the suggestion screen shows.
function land(s, left) {
  const st = rollState();
  const keys = Object.keys(profile.stamps), heldC = new Set(keys.map(k => SD.continentOf(k.split('-')[1])));
  ls('stampRecent', [...st.recent, s.id].slice(-5));
  if (s.atlas && !s.cc) { // a genre roll counts toward the family streak only
    const heldF = new Set(keys.filter(k => k.startsWith('--')).map(k => (SD.ATLAS.get(k.slice(2)) || {}).family));
    ls('stampGStreak', heldF.has(s.family) ? st.gstreak + 1 : 0);
  } else ls('stampStreak', heldC.has(SD.continentOf(s.cc)) ? st.streak + 1 : 0);
  spinReels(s);
  openStamp(s, left);
}
let reelPool = null;
function spinReels(s) { // one reel: random stamp names spin past and the rolled one lands
  reelPool ??= [...SD.CATALOGUE.map(x => x.label), ...[...SD.ATLAS.values()].map(e => e.label)];
  $('#roll-said').textContent = `Rolled: ${s.label}`;
  const reel = $('#reels .reel'), strip = reel.firstElementChild, land = () => strip.replaceChildren(el('span', { textContent: s.label }));
  strip.getAnimations().forEach(a => a.cancel());
  if (reduced()) return land();
  const spin = Array.from({ length: 12 }, () => reelPool[Math.floor(Math.random() * reelPool.length)]);
  strip.replaceChildren(...[strip.lastElementChild.textContent, ...spin, s.label].map(v => el('span', { textContent: v })));
  strip.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${-(spin.length + 1) * reel.clientHeight}px)` }],
    { duration: 1100, easing: 'cubic-bezier(.25,.1,.25,1)', fill: 'forwards' })
    .finished.then(() => { strip.getAnimations().forEach(a => a.cancel()); land(); }, () => {});
}
$('#roll').onclick = doRoll;
$('#stamp-export').onclick = e => stOpen && exportToSpotify(`Gruvo: ${stOpen.label}`, stSongs, $('#stamp-export-status'), e.currentTarget);

// ---------- C. Family Tree ----------
// main builds the tree (src/tree.js) and streams nodes over 'tree:node'; a newer tree's run number drops the old one's.
// The view is a dig: one record in focus, its family under it grouped by relation, and the way back up as a row of sleeves.
let trRun = 0, trSearch = 0, trBusy = 0, trNodes = [], trFocus = 0, trFull = false;
const trDigging = new Set(); // ids with a More in flight
const trState = (kind, msg, opts) => setState($('#tree-state'), kind, msg, opts);
const trWork = d => { trBusy += d; if (trBusy) trState('loading', 'Searching…'); };
const kinOf = id => trNodes.filter(n => n && n.parentId === id);
const treeFrom = n => ({ tab: 'tree', label: n.parentId == null ? tabName('tree') : `Tree, via ${trNodes[n.parentId].track.title}` });
const TREE_MORE = 3; // songs one More adds (src/tree.js MORE)

// A 48px "Dig ›" / "Grow ›": the one way into a record.
function digBtn(text, label, onclick) {
  const b = el('button', { type: 'button', className: 'dig-go', onclick }, text, icon('chevron'));
  b.setAttribute('aria-label', label);
  return b;
}

// Start: search any song, or tap one of your saved sleeves. With a tree already grown, the way back to it.
function showStart(on) {
  $('#tree-start').hidden = !on;
  $('#tree-dig').hidden = on || !trNodes.length;
  $('#tree-new').hidden = on || !trNodes.length;
  if (!on) return;
  const saved = profile.likes.slice().reverse(); // newest first
  $('#tree-saved-box').hidden = !saved.length;
  $('#tree-saved').replaceChildren(...saved.map(t => el('li', {}, el('button', { type: 'button', className: 'sleeve-pick', onclick: () => growTree(t), ariaLabel: `Grow a tree from ${t.artist} – ${t.title}` },
    t.cover ? el('img', { src: t.cover, alt: '', width: 96, height: 96 }) : el('span', { className: 'cover-ph' }),
    el('span', { className: 'sleeve-title', textContent: t.title }), el('span', { className: 'sleeve-artist', textContent: t.artist })))));
  $('#tree-saved').scrollLeft = 0;
  const f = trNodes[trFocus];
  if (f) trState('done', '', { actions: [btn(`Back to “${f.track.title}”`, () => { trState('done', ''); showStart(false); })] });
  else if (!saved.length) trState('empty', 'Search any song to start digging. Songs you save in Blind Test or Crate Dig wait here too.', { art: 'empty-deck' });
  else trState('done', '');
}
$('#tree-new').onclick = () => { showStart(true); $('#tree-q').focus(); };
$('#tree-search').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#tree-q').value.trim();
  if (!q) return $('#tree-q').focus();
  const run = ++trSearch;
  trState('loading', 'Searching…');
  $('#tree-saved-box').hidden = true; // the answer (or the no-match line) must not sit under the carousel, off-screen
  const hits = await call('searchTracks', q);
  if (run !== trSearch) return;
  if (!hits) return trState('error', "Couldn't search right now. Check your connection.", { art: 'empty-unknown', actions: [btn('Try again', () => $('#tree-search').requestSubmit(), 'primary')] });
  trState(hits.length ? 'done' : 'empty', hits.length ? '' : `No songs found for "${q}". Try artist and title, e.g. "Oasis Wonderwall".`, { art: hits.length ? null : 'empty-unknown' });
  $('#tree-hits').replaceChildren(...hits.map(t => {
    const row = trackRow(t);
    row.append(digBtn('Grow', `Grow a tree from ${t.artist} – ${t.title}`, () => growTree(t)));
    return row;
  }));
});

// Tune (profile.prefs.tree): five plain switches, the rest under "More ways", then the filters. Saved on change, applied on close.
const GROW_EDGES = [ // [edge, hint], in the order they are listed
  ['scene', 'Same genre, years and country'], ['related', 'What fans of the artist also play'], ['era', 'Any genre, the same years'],
  ['place', 'Same city or country, any genre'], ['soundtrack', 'Songs from the same film'], ['producer', 'Records the same producer made'],
  ['label', 'Signed to the same label then'], ['member', 'Bands a member went on to or came from'],
  ['builton', 'Songs it samples or is based on'], ['roots', 'Artists it names as an influence']];
const TUNE_MAIN = { scene: 'Same scene', member: 'Band members', builton: 'Samples and covers', roots: 'Influences', related: 'Fans also play' };
let trRoot = null, trUsed = '';
const growSet = () => profile.prefs.tree;
function renderGrowSettings() {
  const s = growSet(), sw = ([e, hint]) => el('label', { className: 'grow-edge' },
    el('span', { className: 'grow-name', textContent: TUNE_MAIN[e] || EDGE_NAMES[e] }), TUNE_MAIN[e] ? null : el('span', { className: 'grow-hint', textContent: hint }),
    el('input', { type: 'checkbox', role: 'switch', value: e, checked: s.edges.includes(e) }));
  $('#grow-edges').replaceChildren(...Object.keys(TUNE_MAIN).map(e => sw(GROW_EDGES.find(g => g[0] === e))));
  $('#grow-edges-more').replaceChildren(...GROW_EDGES.filter(([e]) => !TUNE_MAIN[e]).map(sw));
  $('#grow-era').value = s.era; $('#grow-place').value = s.place; $('#grow-width').value = String(s.width); $('#grow-fame').value = s.fame;
}
$('#tree-tune').addEventListener('change', e => {
  const on = $$('#tree-tune input[type=checkbox]').filter(b => b.checked).map(b => b.value);
  if (!on.length) { e.target.checked = true; return toast('Keep at least one way to connect songs.'); } // the last one stays on
  profile.prefs.tree = { edges: on, era: $('#grow-era').value, place: $('#grow-place').value, fame: Number($('#grow-fame').value), width: Number($('#grow-width').value) };
  save();
});
$('#tree-tune-open').onclick = () => { renderGrowSettings(); $('#tree-tune').showModal(); };
$('#grow-done').onclick = () => $('#tree-tune').close();
$('#tree-tune').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); }); // a tap on the backdrop
$('#tree-tune').addEventListener('close', () => {
  if (!trRoot || JSON.stringify(growSet()) === trUsed) return;
  toast('Regrowing with your new settings.');
  growTree(trRoot);
});

// Back (Android's button via api.onBack; Esc passes sheets only): an open sheet first, then the previous tab. False = nothing left, Android leaves the app.
function goBack(leave = true) {
  const menus = $$('.node-menu:not([hidden])');
  if (menus.length) { menus.forEach(m => m.parentElement.close()); return true; }
  if (!gSheet.hidden) { gSheet.hidden = true; return true; }
  if ($('#tree-tune').open) { $('#tree-tune').close(); return true; }
  if (!leave || !tabHist.length) return false;
  goingBack = true; showTab(tabHist.pop()); goingBack = false;
  return true;
}
api.onBack?.(() => goBack());
document.addEventListener('keydown', e => { if (e.key === 'Escape') goBack(false); });
// Phone sheets follow a downward drag from their top and close past 80px. Every sheet already closes on a click on itself (the scrim).
{
  let drag = null;
  document.addEventListener('touchstart', e => {
    const s = e.target.closest?.('#main :is(.node-menu, .sheet, .tune)');
    if (s && PHONE.matches && s.scrollTop <= 0 && getComputedStyle(s).position === 'fixed') drag = { s, y: e.touches[0].clientY, dy: 0 };
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!drag) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
    drag.s.style.transition = 'none';
    drag.s.style.translate = `0 ${drag.dy}px`;
  }, { passive: true });
  const end = () => {
    if (!drag) return;
    const { s, dy } = drag; drag = null;
    s.style.transition = 'translate 200ms cubic-bezier(.16,1,.3,1)';
    s.style.translate = '';
    if (dy > 80) s.click();
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
}

async function growTree(root) {
  const run = ++trRun;
  trSearch++; // a search still out must not paint its hits over this tree
  trNodes = []; trBusy = 0; trFocus = 0; trFull = false; trDigging.clear(); $('#tree-export').parentElement.hidden = true;
  trRoot = root; trUsed = JSON.stringify(growSet());
  $('#tree-hits').replaceChildren(); $('#tree-start').hidden = true;
  trWork(1);
  const ok = await api.tree(plain(root), profile.heard, run, profile.likes.map(({ source, id, artist, title }) => ({ source, id, artist, title })), plain(growSet())).catch(e => { console.error('tree', e); return null; });
  if (run !== trRun) return;
  trBusy--;
  if (ok === null) { if (!trNodes.length) showStart(true); return trState('error', "Couldn't grow the tree right now. Check your connection.", { art: 'empty-unknown', actions: [btn('Try again', () => growTree(root), 'primary')] }); }
  if (trBusy) return;
  const seen = new Set(trNodes.map(n => n && n.edgeType)), none = growSet().edges.filter(e => !seen.has(e)).map(e => EDGE_NAMES[e]);
  if (trNodes.length > 1) trState('done', none.length ? `Nothing found for: ${none.join(', ')}.` : '');
  else trState('empty', `No family found${none.length ? ` for: ${none.join(', ')}` : ' yet'}. Try More, or Tune for other ways to connect.`, { art: 'empty-unknown' });
  if (trFocus && !kinOf(trFocus).length) moreTree(trNodes[trFocus], true); // dug into a song the build left bare
  kinNote();
}
api.onTreeNode((run, n) => {
  if (run !== trRun) return;
  trNodes[n.id] = n;
  if (n.parentId == null) renderDig(); else if (n.parentId === trFocus) addKin(n, true);
  $('#tree-export').parentElement.hidden = false;
  const k = trNodes.filter(Boolean).length - 1; // a live count instead of a "Searching…" that sits over a tree already growing; cleared when the grow ends
  if (trBusy && k > 0) trState('loading', `Growing… ${k} song${k > 1 ? 's' : ''} so far`);
});

// The dig: path (root .. focus) as sleeves, the focus as a full card, its family grouped under one sign per relation.
// model nodes: {id, parentId, depth, edgeType, label, track}. The first grow brings root, children and grandchildren,
// so the first Dig is instant; a record with no family yet gets a More.
const EDGE_NAMES = { era: 'Same era', place: 'Same place', soundtrack: 'Same soundtrack', scene: 'Same scene', member: 'Member moved', builton: 'Built on', roots: 'Roots', producer: 'Same producer', label: 'Same label', related: 'Fans also play' };
function renderDig() {
  const f = trNodes[trFocus], parent = trNodes[f.parentId];
  $('#tree-start').hidden = true; $('#tree-dig').hidden = false; $('#tree-new').hidden = false;
  $('#tree-path').replaceChildren(...Dig.path(trNodes, trFocus).map(n => {
    const b = el('button', { type: 'button', className: 'crumb', onclick: () => n !== f && dig(n.id) },
      n.track.cover ? el('img', { src: n.track.cover, alt: '', width: 40, height: 40 }) : el('span', { className: 'cover-ph' }),
      el('span', { className: 'crumb-title', textContent: n.track.title }));
    b.setAttribute('aria-label', n === f ? `${n.track.title}, in focus` : `Back to ${n.track.artist} – ${n.track.title}`);
    if (n === f) b.setAttribute('aria-current', 'step');
    return el('li', {}, b);
  }));
  $('#tree-path').scrollLeft = 1e5; // phone: a long path scrolls sideways; keep the record in focus (the last sleeve) in view
  const row = trackRow(f.track, { tag: 'div', full: true, reason: Dig.reason(f, parent) || 'Where this dig started.', from: treeFrom(f) });
  const love = row.querySelector('.love');
  if (parent) row.append(rateGroup(f.track, love));
  $('#tree-focus').replaceChildren(row);
  $('#tree-family-h').textContent = `The family of “${f.track.title}”`;
  $('#tree-family').replaceChildren();
  kinOf(trFocus).forEach(n => addKin(n, false));
  kinNote();
}
function dig(id) {
  trFocus = id;
  renderDig();
  if ($('#tree-dig').getBoundingClientRect().top < 0) $('#tree-dig').scrollIntoView({ block: 'start' }); // from deep in the list: back up to the new focus
  $('#tree-focus .play')?.focus({ preventScroll: true });
  if (!kinOf(id).length && !trBusy) moreTree(trNodes[id], true);
}
function addKin(n, fresh) {
  const fam = $('#tree-family');
  let group = [...fam.children].find(g => g.dataset.edge === n.edgeType);
  if (!group) {
    fam.append(group = el('section', { className: 'kin' }, el('h3', { className: 'kin-sign' }, edgeIcon(n.edgeType), EDGE_NAMES[n.edgeType] || n.edgeType), el('ol', { className: 'tracks kin-rows' })));
    group.dataset.edge = n.edgeType;
  }
  const row = trackRow(n.track, { reason: Dig.reason(n, trNodes[n.parentId], true), from: treeFrom(n) });
  row.append(digBtn('Dig', `Dig into ${n.track.artist} – ${n.track.title}`, () => dig(n.id)));
  if (fresh) { row.classList.add('grow'); row.addEventListener('animationend', () => row.classList.remove('grow'), { once: true }); }
  group.lastElementChild.append(row);
  kinNote();
}
// The family's last line: "+ 3 more like …", or what is happening while it is still empty.
function kinNote() {
  const f = trNodes[trFocus], b = $('#tree-more'), busy = trDigging.has(trFocus), none = !kinOf(trFocus).length;
  if (!f) return;
  b.textContent = trFull ? 'This tree is full' : busy ? 'Digging…' : `+ ${TREE_MORE} more like “${f.track.title}”`;
  b.disabled = trFull || busy;
  let p = $('#tree-family .kin-wait');
  if (!none) return p?.remove();
  if (!p) $('#tree-family').append(p = el('div', { className: 'kin-wait' }, el('img', { className: 'state-art', src: 'img/empty-deck.png', alt: '' }), el('p', {}, el('span', { className: 'kin-disc', ariaHidden: 'true' }), el('span', { className: 'kin-msg' }))));
  const wait = busy || trBusy > 0;
  p.classList.toggle('is-busy', wait); p.querySelector('.state-art').hidden = !wait;
  p.querySelector('.kin-msg').textContent = wait ? 'Digging for its family…' : 'No family found for this one yet. Try More, or Tune for other ways to connect.';
}
$('#tree-more').onclick = () => trNodes[trFocus] && moreTree(trNodes[trFocus]);

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
const ICONS = { play: 'M5 3.2v9.6L12.8 8z', chevron: 'M6 3.5 10.5 8 6 12.5', more: 'M3.5 8h.01M8 8h.01M12.5 8h.01', pause: 'M5.5 3.5v9M10.5 3.5v9', close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
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
  menu.addEventListener('click', e => { if (e.target === menu && getComputedStyle(menu).position === 'fixed') set(false); }); // phone sheet: a tap on the scrim closes it
  menu.addEventListener('click', e => { if (e.target.closest('button.ext, button.more')) set(false); }); // a link or More is done with the menu
  set(false);
  return wrap;
}
// A full trackRow's About and Full song, moved behind ⋯ (Tree cards, Stamp rows, Saved): the song's name on top, then one
// plain list of actions, each link a single tap ("Full song on YouTube").
function moreMenu(row, id, name) {
  const full = row.querySelector('.full-song');
  full.querySelector('.full-label')?.remove();
  for (const b of full.querySelectorAll('button.ext')) if (!/^Open /.test(b.textContent)) b.textContent = `Full song on ${b.textContent}`;
  const wrap = overflowMenu(id, name, el('p', { className: 'menu-title', textContent: name }), row.querySelector('.about-more'), ...full.children);
  full.remove();
  return wrap;
}
// Phone: Skip / OK (and any `extra`, e.g. the Tree's + More) move into the ⋯ sheet, so the row keeps only ▶, ♥ and ⋯.
function fitPhone(owner, group, wrap, ...extra) {
  const skipOk = group ? [...group.querySelectorAll('[data-rate=skip], [data-rate=ok]')] : [];
  const slot = el('div', { className: 'menu-rate', role: 'group', ariaLabel: 'Rate this song' }), menu = wrap.querySelector('.node-menu');
  menu.querySelector('.menu-title').after(slot);
  owner.fit = () => {
    if (PHONE.matches) { slot.append(...skipOk); menu.append(...extra); } else { group?.prepend(...skipOk); wrap.after(...extra); }
    for (const e of extra) { e.dataset.short ??= e.textContent; e.textContent = PHONE.matches && e.dataset.long || e.dataset.short; } // a sheet row can say it in full
  };
  owner.fit();
}
document.addEventListener('pointerdown', e => $$('.node-menu:not([hidden])').forEach(m => { if (!m.parentElement.contains(e.target)) m.parentElement.close(); }));

async function moreTree(n, quiet) { // quiet: a Dig started it, the family just fills in; only the More button toasts
  if (trDigging.has(n.id)) return; // a second tap or a second Dig into the same leaf would add its three twice
  const run = trRun;
  trDigging.add(n.id); kinNote();
  const r = await api.treeMore(n.id).catch(() => null);
  if (run !== trRun) return;
  trDigging.delete(n.id);
  if (r && r.full) trFull = true;
  kinNote();
  if (quiet && r && !r.error && r.added) return;
  toast(!r || r.error ? "Couldn't reach the music services. Try again." : r.added ? `${r.added} more in the family of “${n.track.title}”.`
    : r.full ? 'This tree is full. Start a new one from any song.' : `No more family found for “${n.track.title}”.`);
}

// ---------- Saved ----------
// Phone only (CSS hides the chips on desktop, where Home has Recent finds): Loved | Recent.
function setSeg(seg) {
  $('#saved').dataset.seg = seg;
  $('#seg-loved').setAttribute('aria-pressed', String(seg === 'loved')); $('#seg-recent').setAttribute('aria-pressed', String(seg === 'recent'));
  ls('savedSeg', seg);
}
$('#seg-loved').onclick = () => setSeg('loved');
$('#seg-recent').onclick = () => setSeg('recent');
function renderSaved() {
  setSeg(ls('savedSeg') === 'recent' ? 'recent' : 'loved');
  fillCrate($('#saved-recent'), $('#saved-recent-count'));
  $('#saved-like-count').textContent = profile.likes.length;
  $('#saved-export').parentElement.hidden = !profile.likes.length;
  const list = $('#saved-list');
  list.replaceChildren(...profile.likes.slice().reverse().map((t, i) => {
    const row = trackRow(t, { extra: extraOf(t), full: true, // re-loving keeps the stamp
      reason: [t.country && `${countryNames[t.country] || t.country}, ${t.decade}s`, t.ts && `loved ${new Date(t.ts).toLocaleDateString()}`].filter(Boolean).join(' · ') });
    row.append(el('div', { className: 'node-actions' }, moreMenu(row, `saved-menu-${i}`, `${t.artist} – ${t.title}`))); // About and Full song behind ⋯, as on the Tree
    return row;
  }));
  if (!profile.likes.length) list.append(el('li', { className: 'state empty' }, el('img', { className: 'state-art', src: 'img/empty-crate.png', alt: '' }),
    el('p', { textContent: 'Nothing saved yet. Press Love on any track to keep it here.' }),
    el('div', { className: 'row' }, btn('Start a Blind Test', () => showTab('blind'), 'primary'), btn('Open Crate Dig', () => showTab('stamps')))));
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
  const art = shown && shown.cover ? el('img', { src: shown.cover, alt: '' }) : blank();
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
  const newest = likes[likes.length - 1];
  const ways = [['blind', tonight.length ? `${tonight.length} revealed tonight` : 'a mystery is cued up'],
    stampTab && [stampTab.dataset.tab, 'roll a genre you have never heard'],
    ['tree', newest ? `grow one from “${newest.title}”` : 'start from any song']].filter(Boolean);
  $('#ways').replaceChildren(...ways.map(([tab, live]) => el('li', {}, el('button', { type: 'button', className: 'way', onclick: () => showTab(tab) },
    el('span', { className: 'way-name', textContent: tabName(tab) }), el('span', { className: 'way-live', textContent: live })))));

  fillCrate($('#recent'), $('#recent-count'));
}
// Recent finds: tonight's reveals and your newest loves, one crate of sleeves (Home, and Saved > Recent on a phone).
function fillCrate(list, count) {
  const seen = new Set(), finds = [];
  for (const { t, kind, extra } of tonight) finds.push({ t, extra, reason: `You said ${VERDICT[kind]} tonight` });
  for (const t of profile.likes.slice().reverse()) finds.push({ t, extra: extraOf(t), reason: t.ts ? `Loved ${day(t.ts)}` : 'Loved' });
  const crate = finds.filter(({ t }) => !seen.has(likeKey(t)) && seen.add(likeKey(t))).slice(0, 8);
  count.textContent = crate.length || '';
  list.replaceChildren(...(crate.length ? crate.map(({ t, extra, reason }) => trackRow(t, { extra, reason }))
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

// Colour scheme (profile.prefs.scheme): applied at once; mirrored in localStorage so a launch paints it before the profile loads.
const SCHEMES = { shop: 'Record shop', bluelabel: 'Blue label', riso: 'Gig poster', tuner: 'Night tuner', soul: 'Soul 45', bleep: 'Bleep', mixtape: 'Mixtape', acid: 'Acid house' };
function applyScheme(s) { document.documentElement.dataset.scheme = s; try { localStorage.setItem('scheme', s); } catch {} }
function renderSchemes() {
  $('#pref-scheme').replaceChildren(...Object.entries(SCHEMES).map(([id, label]) => {
    const sw = el('span', { className: 'swatch' }, ...Array.from({ length: 6 }, () => el('span')));
    sw.dataset.scheme = id;
    sw.setAttribute('aria-hidden', 'true');
    return el('label', { className: 'scheme' },
      el('input', { type: 'radio', name: 'scheme', value: id, checked: profile.prefs.scheme === id, onchange: () => { profile.prefs.scheme = id; applyScheme(id); save(); } }),
      el('span', { className: 'scheme-name', textContent: label }), sw);
  }));
}

let prefsBuilt = false;
function renderPrefs() {
  const p = profile.prefs;
  renderPickedArtists();
  prefStatus();
  renderGenres();
  if (prefsBuilt) return;
  prefsBuilt = true;
  renderSchemes();
  $('#pref-decades').append(...DECADES.map(d => toggleChip(`${d}s`, p.decades.includes(d), on => { profile.prefs.decades = setIn(profile.prefs.decades, d, on); })));
  $('#pref-bringback').checked = p.bringBack;
  $('#pref-bringback').onchange = e => { profile.prefs.bringBack = e.target.checked; save(); };
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
document.querySelectorAll('#sources [data-url]').forEach(b => { b.onclick = () => api.open(b.dataset.url).catch(() => toast('Could not open the browser')); });
$('#sp-dash').onclick =() => api.open('https://developer.spotify.com/dashboard').catch(() => toast('Could not open the browser'));

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
$('#saved-export').onclick = e => exportToSpotify('Gruvo: Loved', profile.likes.slice().reverse(), $('#saved-export-status'), e.currentTarget);
$('#tree-export').onclick = e => {
  const steps = trNodes.filter(Boolean).map(n => n.track); // arrival order: the root, its family, theirs
  exportToSpotify(steps.length ? `Gruvo: ${steps[0].title} family tree` : 'Gruvo', steps, $('#tree-export-status'), e.currentTarget);
};

// ---------- start ----------
(async () => {
  sp = await spotify.status().catch(() => sp);
  document.body.classList.toggle('no-spotify', !!sp.unavailable); // phone: no Spotify login, so no Preferences section or Export
  renderSpotifyPrefs();
  profile = await store.load();
  lovedTags(); // warm the loved-artist tags before the first mystery
  applyScheme(profile.prefs.scheme);
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
  try { const s = localStorage.getItem('scheme'); if (Object.hasOwn(SCHEMES, s)) root.dataset.scheme = s; } catch {}
  const dark = () => (root.dataset.theme || (os.matches ? 'light' : 'dark')) === 'dark';
  const picks = $$('[data-theme-pick]'); // Preferences: Light | Dark (on a phone the header toggle is hidden and this is the control)
  const sync = () => { tbtn.setAttribute('aria-pressed', String(dark())); picks.forEach(b => b.setAttribute('aria-pressed', String((b.dataset.themePick === 'dark') === dark()))); };
  const setTheme = t => { root.dataset.theme = t; try { localStorage.setItem('theme', t); } catch {} sync(); };
  tbtn.onclick = () => setTheme(dark() ? 'light' : 'dark');
  picks.forEach(b => { b.onclick = () => setTheme(b.dataset.themePick); });
  os.addEventListener('change', sync);
  sync();
}
