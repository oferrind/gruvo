// ---------- player (one <audio> for the whole app) ----------
const audio = $('#audio');
let current = null, currentExtra = null, currentFrom = null, retried = false, onFail = null;
const hidden = t => t === mystery && !rated; // an unrated mystery: nothing that names it (cover, colour, last-played) may show

// from: {tab, label} where the track was started, for the bar's "came from" chip.
async function play(item, { onFail: failCb, extra, from } = {}) {
  current = item; currentExtra = extra || null; currentFrom = from || null; retried = false; onFail = failCb || null;
  renderNpLike(); renderNpMeta(); syncPlayState();
  listen = logEvent({ k: 'listen', id: likeKey(item), from: from && from.tab, sec: 0, ends: 0 }); lastPos = 0;
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
  if (listen) { profile.events = profile.events.filter(e => e !== listen); listen = null; } // nothing was heard
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
// Listening log (profile.events, src/store.js): stays on this device. A listen event is pushed when a play starts and
// updated in place (seconds actually heard, times played to the end); every later save() writes it.
let listen = null, lastPos = 0;
function logEvent(e) {
  const ev = { ts: Date.now(), ...e };
  (profile.events ||= []).push(ev);
  if (profile.events.length > 3000) profile.events.splice(0, profile.events.length - 3000); // store.js keeps the same cap
  return ev;
}
const activeTab = () => shown; // the panel, so Dig logs 'stamps' or 'moods' as before
audio.addEventListener('timeupdate', () => {
  const d = audio.currentTime - lastPos;
  lastPos = audio.currentTime;
  if (listen && !audio.paused && d > 0 && d < 1.5) listen.sec += d; // a jump is a seek, not listening
});
audio.addEventListener('seeked', () => { lastPos = audio.currentTime; });
audio.addEventListener('ended', () => { if (listen) listen.ends++; });
// shortcut: a closed window can drop the seconds heard since the last save; save on a timer if the log needs them exact.
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
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
const tabName = id => ({ stamps: 'Crate Dig', moods: 'Mood Shelf' })[id] || ($(`#tab-${id}`)?.firstChild.textContent || id).trim(); // Dig's two modes go by their own names
function renderNpMeta() {
  const [title, artist] = !current ? ['Nothing playing', ''] : hidden(current) ? ['Mystery track', ''] : [cleanTitle(current.title), current.artist];
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
  else $(`#tab-${tabOf(currentFrom.tab)}`)?.focus(); // the row is gone (a regrown tree, a cleared list): land on its tab, not on nothing
};
// Last played (never an unrated mystery), kept in the profile.
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

