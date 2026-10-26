// Phone implementation of window.api / window.store / window.spotify (the surface preload.js gives desktop).
// Bundled by scripts/build-mobile.js into mobile/www/api.js, loaded before app.js. Calls src/ directly.
import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { AppLauncher } from '@capacitor/app-launcher';
import { KeepAwake } from '@capacitor-community/keep-awake';
import net from '../src/net';
import Handlers from '../src/handlers';
import { fetchVia, audioVia, filesVia, storeVia, cacheVia } from './phone';

net.configure({ fetch: fetchVia(CapacitorHttp) }); // direct calls only; the global fetch patch stays off so nothing skips net.js's allowlist
const files = filesVia(Filesystem, Directory.Data, Encoding.UTF8);
const ready = cacheVia(files).then(io => net.initCache(io));
const H = Handlers.create({ get: net.get, audio: audioVia(CapacitorHttp), open: url => AppLauncher.openUrl({ url }), store: storeVia(files) });

// Behave like IPC: async, and the renderer gets copies (it adds fields such as c.fp to results; they must not reach net.js's cache).
const wrap = f => async (...a) => { await ready; return structuredClone(await f(...structuredClone(a))); };
const subs = {};
const on = ch => cb => { (subs[ch] ||= []).push(cb); };
// Streamed tree nodes / stamp rows; queued so they arrive before the call's own reply, as over IPC.
const ctx = { send: (ch, run, x) => { const v = structuredClone(x); queueMicrotask(() => (subs[ch] || []).forEach(cb => cb(run, v))); }, alive: () => true };

window.api = {
  caps: { blobAudio: true, spotifyLogin: false },
  get: wrap(H.get),
  audio: url => H.audio(url), // already a fresh ArrayBuffer per call
  call: wrap(H.call),
  countries: wrap(H.countries),
  open: wrap(H.shellOpen),
  tree: wrap((...a) => H.treeGrow(ctx, ...a)),
  treeMore: wrap(H.treeMore),
  onTreeNode: on('tree:node'),
  stamp: wrap((id, run) => H.stampsOpen(ctx, id, run)),
  moreStamp: wrap((id, run) => H.stampsMore(ctx, id, run)),
  prefetchStamp: wrap(H.stampsPrefetch),
  onStampRow: on('stamps:row'),
};
// Android back: app.js registers goBack (true = it closed something or changed tab); otherwise the app leaves.
// registerPlugin('App') is the native @capacitor/app plugin (pinned in package.json) without bundling its JS.
let backCb = () => false;
const App = registerPlugin('App');
App.addListener('backButton', () => { if (!backCb()) App.exitApp(); });
window.api.onBack = cb => { backCb = cb; };
window.store = { load: wrap(H.storeLoad), save: wrap(H.storeSave) };
// No Spotify login on the phone (no OAuth, no tokens): app.js hides Spotify Preferences and Export; full-song links still open Spotify.
const NO = async () => ({ error: 'Spotify login is not available on the phone.' });
window.spotify = { status: async () => ({ connected: false, unavailable: true }), connect: NO, disconnect: async () => ({ connected: false, unavailable: true }), devices: NO, play: NO, exportPlaylist: NO };

// Keep the screen on while a preview plays (media events don't bubble: listen in the capture phase).
const awake = on => () => (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => {});
document.addEventListener('playing', awake(true), true);
for (const ev of ['pause', 'ended', 'emptied', 'error']) document.addEventListener(ev, awake(false), true);
// Desktop flushes the response cache on quit; the phone may be killed in the background, so flush when hidden.
document.addEventListener('visibilitychange', () => { if (document.hidden) net.flushCache(); });
