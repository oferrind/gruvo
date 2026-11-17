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
// Hybrid picker + blind A/B (docs/21). On: each mystery is picked by the shipped or the hybrid picker at random, and
// Preferences shows the Love rate of each; needs renderer/colisten-data.js (scripts/data/colisten.py). Off: none of that loads.
const HYBRID_AB = true;
// Co-listening table + lookup -> window.Colisten; async false keeps the data before the code that reads it.
if (HYBRID_AB) for (const src of ['colisten-data.js', 'colisten.js']) document.head.append(el('script', { src, async: false }));

let profile, countryNames = {};

function undoToast(msg, undo) {
  const box = $('#toast');
  box.replaceChildren(msg, ' ', el('button', { type: 'button', className: 'toast-undo', textContent: 'Undo', onclick: () => { clearTimeout(toast.t); box.textContent = ''; undo(); } }));
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { box.textContent = ''; }, 5000);
}
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

// Shared core. Classic scripts share one global scope: index.html loads this first, then player, blind, crate, moods, tree, saved, prefs.js.
// ---------- likes / rows ----------
// heard: 'dz:<artistId>' when known (same-name artists stay apart), else the normalized name; matches src/music.js isHeard.
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
  logEvent({ k: 'save', id: likeKey(t), from: activeTab() });
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
    profile.ratings = [...profile.ratings.filter(r => r.id !== likeKey(t)), { id: likeKey(t), rating: kind, features: v, a: t.artist }].slice(-500); // store.js keeps the same cap
    save();
  });
}
function unlike(t) {
  const old = profile.likes.find(l => likeKey(l) === likeKey(t));
  const at = profile.likes.indexOf(old), rating = profile.ratings.find(r => r.id === likeKey(t) && r.rating === 'love');
  const sk = old && stampOf(old);
  if (sk && profile.stamps[sk] && !--profile.stamps[sk]) delete profile.stamps[sk]; // unloving undoes its stamp
  profile.likes = profile.likes.filter(l => likeKey(l) !== likeKey(t));
  profile.ratings = profile.ratings.filter(r => r.id !== likeKey(t) || r.rating !== 'love');
  if (old) logEvent({ k: 'unsave', id: likeKey(t), from: activeTab() });
  save();
  afterLikeChange();
  if (old && !$('#saved').hidden) undoToast(`Removed “${cleanTitle(t.title)}”`, () => { // Saved: put it back where it was
    if (isLiked(t)) return;
    profile.likes.splice(at, 0, old);
    if (sk) profile.stamps[sk] = (profile.stamps[sk] || 0) + 1;
    if (rating) profile.ratings.push(rating);
    logEvent({ k: 'save', id: likeKey(t), from: 'saved' });
    save();
    afterLikeChange();
  });
}
function afterLikeChange() {
  lovedTags(); // loves changed: refresh the tag profile (paced and cached lookups)
  $$('.love').forEach(b => b.sync && b.sync());
  $('#saved-count').textContent = profile.likes.length || '';
  renderStamps();
  if ($('#saved').hidden) return;
  const i = $$('#saved-list > li').findIndex(r => r.contains(document.activeElement));
  renderSaved(); // Saved reflects unloves immediately
  if (i < 0) return;
  // The focused row was just re-rendered away: land on the next row's Love, else the heading.
  const rows = $$('#saved-list > li .love');
  if (rows.length) return rows[Math.min(i, rows.length - 1)].focus();
  $('#saved-list .state button').focus(); // the list is empty: its heading is hidden, so land on the empty crate's first action
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
  const title = el('span', { className: 'title', textContent: cleanTitle(t.title) });
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
  if (current && likeKey(current) === row.dataset.key) {
    row.classList.add('is-playing');
    if (!audio.paused && audio.getAttribute('src')) { playBtn.replaceChildren(icon('pause')); playBtn.setAttribute('aria-label', 'Pause'); } // same as syncPlayState
  }
  return row;
}

// ---------- tabs + first-launch intro ----------
const tabs = $$('#tabs [role=tab]');
let introOpen = false;
const tabHist = []; // tabs left behind, for the Android back button
let prefsFrom = null, prefsFirst = false; // the tab Preferences was opened from: the last button leads back there
let goingBack = false, shown = null; // shown: the panel on screen (Dig's tab shows 'stamps' or 'moods')
// Dig is one tab over two panels, Crate Dig (stamps) and Mood Shelf (moods); it reopens on the mode used last.
const DIG = ['stamps', 'moods'];
const tabOf = name => (DIG.includes(name) ? 'dig' : name);
function showTab(name, focus) {
  if (name === 'dig') name = ls('digMode') === 'moods' ? 'moods' : 'stamps';
  if (DIG.includes(name)) {
    ls('digMode', name);
    $$('[data-dig]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dig === name)));
    $('#tab-dig').setAttribute('aria-controls', name);
  }
  closeIntro();
  const prev = shown;
  shown = name;
  if (prev && prev !== name && !goingBack) { const i = tabHist.lastIndexOf(name); if (i >= 0) tabHist.length = i; tabHist.push(prev); } // revisiting a tab drops the loop, so Back never replays ping-pong
  const tab = tabOf(name), isTab = tabs.some(b => b.dataset.tab === tab); // Preferences is no tab: none selected, the first stays in the Tab order
  tabs.forEach((b, i) => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', on); b.tabIndex = on || (!isTab && !i) ? 0 : -1; if (on && focus) b.focus(); });
  if (name === 'prefs') $('#prefs-open').setAttribute('aria-current', 'page'); else $('#prefs-open').removeAttribute('aria-current');
  $$('.panel').forEach(p => { p.hidden = p.id !== name; });
  if (prev !== name && !goingBack) scrollTo(0, 0); // a new tab opens at its top
  if (name === 'blind' && mystery && !rated && !current && navigator.userActivation?.hasBeenActive) playMystery(); // the app opens here: no sound before the first tap
  if (name === 'saved') renderSaved();
  if (name === 'moods') renderMoods();
  if (name === 'prefs') { if (prev && prev !== 'prefs') prefsFrom = prev; renderPrefs(); prefsMode(prefsFirst); }
  if (name === 'tree' && !trNodes.length) showStart(true);
}
$('#tabs').addEventListener('click', e => { const t = e.target.closest('[role=tab]'); if (t) showTab(t.dataset.tab); });
$('#brand').onclick = () => showTab('blind');
$('#prefs-open').onclick = () => showTab('prefs');
$$('[data-dig]').forEach(b => { b.onclick = () => { showTab(b.dataset.dig); $(`#${b.dataset.dig} [data-dig="${b.dataset.dig}"]`).focus(); }; }); // the switch is in both panels: keep focus on it
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

// Drawn UI icons (play, pause, heart, close) in the tree icons' 16px, 1.6 stroke.
const ICONS = { play: 'M5 3.2v9.6L12.8 8z', chevron: 'M6 3.5 10.5 8 6 12.5', more: 'M3.5 8h.01M8 8h.01M12.5 8h.01', pause: 'M5.5 3.5v9M10.5 3.5v9', close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  heart: 'M8 13.4S2.3 10 2.3 6a2.9 2.9 0 0 1 5.7-1.2A2.9 2.9 0 0 1 13.7 6c0 4-5.7 7.4-5.7 7.4z' };
function icon(name, filled) {
  const s = svgEl('svg', { viewBox: '0 0 16 16', class: `icon i-${name}${filled ? ' filled' : ''}`, 'aria-hidden': 'true', focusable: 'false' });
  s.append(svgEl('path', { d: ICONS[name] }));
  return s;
}
const svgEl = (tag, attrs) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
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

// ---------- start (after every script has loaded) ----------
document.addEventListener('DOMContentLoaded', () => {
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
    if (!introSeen() && !profile.likes.length) openPrefs(true); else showTab('blind');
    fill();
    seedTaste(); // finishes seeding an interrupted earlier session; no-op otherwise
  })();
  
  // Theme toggle: follows the OS until the user picks; the choice persists in localStorage.
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
});
