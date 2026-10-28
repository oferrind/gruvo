const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const { safeExternal } = require('./src/links');
const fs = require('fs');
const path = require('path');
const net = require('./src/net');
const store = require('./src/store-fs');
const Handlers = require('./src/handlers');
const Spotify = require('./src/spotify');

let win;

// Desktop cache file for net.js: read once at start, written atomically (tmp + rename).
const fileCache = file => ({
  read: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } },
  write: text => { fs.writeFileSync(file + '.tmp', text); fs.renameSync(file + '.tmp', file); },
});

const ZOOM_DEFAULT = 0.85;
const zoomFile = () => path.join(app.getPath('userData'), 'zoom.json');
const clampZoom = z => (Number.isFinite(z) ? Math.round(Math.min(2, Math.max(0.5, z)) * 20) / 20 : ZOOM_DEFAULT);
function readZoom() {
  try { return clampZoom(JSON.parse(fs.readFileSync(zoomFile(), 'utf8')).zoom); } catch { return ZOOM_DEFAULT; }
}
function setZoom(z) {
  z = clampZoom(z);
  win.webContents.setZoomFactor(z);
  try { fs.writeFileSync(zoomFile(), JSON.stringify({ zoom: z })); } catch {} // losing the zoom pref is harmless
}

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 800, icon: path.join(__dirname, 'renderer', 'img', 'logo-512.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // On high-DPI Windows scaling the UI read too big: start at 85%, Ctrl +/-/0 and Ctrl+wheel adjust, remembered.
  const cur = () => win.webContents.getZoomFactor();
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(readZoom()));
  win.webContents.on('zoom-changed', (e, dir) => setZoom(cur() + (dir === 'in' ? 0.05 : -0.05)));
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown' || !i.control) return;
    const z = { '=': cur() + 0.05, '+': cur() + 0.05, '-': cur() - 0.05, '0': ZOOM_DEFAULT }[i.key];
    if (z !== undefined) { e.preventDefault(); setZoom(z); }
  });
  // Never leave the app page: a remote page in this window would get window.api / window.store.
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // shortcut: test-only screenshot hook, active only when SNAP is set.
  // SNAP_JS runs in the page first; SNAP_WAIT (ms) is the delay before capture.
  if (process.env.SNAP) {
    // A hung SNAP_JS, a failed capture or a load that never finishes left orphan test windows eating RAM: hard deadline.
    setTimeout(() => app.exit(1), (Number(process.env.SNAP_WAIT) || 2500) + 60000);
    win.webContents.setAudioMuted(true);
    win.webContents.on('console-message', (e, ...a) => console.log('[page]', e.message ?? a[1]));
    win.webContents.once('did-finish-load', async () => {
      if (process.env.SNAP_JS) await win.webContents.executeJavaScript(process.env.SNAP_JS).catch(e => console.error('SNAP_JS', e));
      setTimeout(async () => {
        try {
          win.webContents.invalidate(); // occluded windows stop painting; force a fresh frame
          await new Promise(r => setTimeout(r, 500));
          fs.writeFileSync(process.env.SNAP, (await win.webContents.capturePage()).toPNG());
        } catch (e) { console.error('SNAP capture', e); }
        app.quit();
      }, Number(process.env.SNAP_WAIT) || 2500);
    });
  }
}

const H = Handlers.create({ get: net.get, audio: net.audio, open: url => shell.openExternal(url), store });
const ctxOf = e => ({ send: (...a) => e.sender.send(...a), alive: () => !e.sender.isDestroyed() });
ipcMain.handle('api:audio', (e, url) => H.audio(url));
ipcMain.handle('api:call', (e, name, ...args) => H.call(name, ...args));
ipcMain.handle('api:countries', () => H.countries());
ipcMain.handle('tree:grow', (e, root, heard, run, saved, settings) => H.treeGrow(ctxOf(e), root, heard, run, saved, settings));
ipcMain.handle('stamps:open', (e, id, run) => H.stampsOpen(ctxOf(e), id, run));
ipcMain.handle('stamps:more', (e, id, run) => H.stampsMore(ctxOf(e), id, run));
ipcMain.handle('stamps:prefetch', (e, id) => H.stampsPrefetch(id));
ipcMain.handle('tree:more', (e, id) => H.treeMore(id));
ipcMain.handle('shell:open', (e, url) => H.shellOpen(url));
// Spotify (desktop only): tokens stay in this process; the renderer only gets status, devices and results.
let spotify;
const trackIn = Handlers.trackIn;
ipcMain.handle('spotify:status', () => spotify.status());
ipcMain.handle('spotify:connect', (e, clientId) => spotify.connect(String(clientId)));
ipcMain.handle('spotify:disconnect', () => spotify.disconnect());
ipcMain.handle('spotify:devices', () => spotify.devices());
ipcMain.handle('spotify:play', (e, t, deviceId) => spotify.play(trackIn(t), deviceId == null ? undefined : String(deviceId)));
ipcMain.handle('spotify:export', (e, name, tracks) => {
  if (!Array.isArray(tracks)) throw new Error('bad tracks');
  return spotify.exportPlaylist(String(name || 'Gruvo').slice(0, 100), tracks.slice(0, 500).map(trackIn));
});
ipcMain.handle('store:load', () => H.storeLoad());
ipcMain.handle('store:save', (e, profile) => H.storeSave(profile));

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  net.initCache(fileCache(path.join(dir, 'cache.json')));
  store.init(dir);
  spotify = Spotify.create({ dir, send: net.send, getJson: net.get,
    crypt: { available: () => safeStorage.isAsyncEncryptionAvailable(), encrypt: s => safeStorage.encryptStringAsync(s),
      decrypt: async b => (await safeStorage.decryptStringAsync(b)).result },
    openUrl: url => {
      if (process.env.SNAP) return console.log('[spotify] authorize', url); // test hook: log (no secrets in it), don't open a browser
      const ok = safeExternal(url); if (!ok) throw new Error('link not allowed'); return shell.openExternal(ok); } });
  createWindow();
});
app.on('before-quit', () => net.flushCache());
app.on('window-all-closed', () => app.quit());
