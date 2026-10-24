const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const { safeExternal } = require('./src/links');
const fs = require('fs');
const path = require('path');
const net = require('./src/net');
const store = require('./src/store');
const { flows, COUNTRIES } = require('./src/music');
const Tree = require('./src/tree');
const Spotify = require('./src/spotify');
const Stamps = require('./src/stamps');

let win;

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
    width: 1100, height: 800,
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

ipcMain.handle('api:get', (e, url) => net.get(String(url)));
ipcMain.handle('api:audio', (e, url) => net.audio(String(url)));
ipcMain.handle('api:call', async (e, name, ...args) => {
  if (!Object.hasOwn(flows, name)) throw new Error(`unknown call ${name}`);
  return flows[name](net.get, ...args);
});
ipcMain.handle('api:countries', () => COUNTRIES);
// Family Tree: one build at a time. A newer tree makes the older one's live() false, so it stops before its next call.
let tree = null, treeRun = 0;
ipcMain.handle('tree:grow', async (e, root, heard, run, saved) => {
  if (!root || typeof root.artist !== 'string' || typeof root.title !== 'string') throw new Error('bad root');
  const mine = ++treeRun;
  const live = () => mine === treeRun && !e.sender.isDestroyed();
  tree = Tree.newTree(net.get, root, { heard: Array.isArray(heard) ? heard.map(String) : [], live,
    saved: Array.isArray(saved) ? saved.filter(s => s && typeof s.artist === 'string' && typeof s.title === 'string')
      .map(s => ({ source: String(s.source), id: s.id == null ? null : String(s.id), artist: s.artist, title: s.title })) : [], emit: n => live() && e.sender.send('tree:node', run, n) });
  await Tree.growTree(tree);
  return live();
});
// Genre Stamps: one playlist at a time, rows streamed as previews resolve (src/stamps.js stampRunner). The id is rebuilt there, so only real stamps run.
const stampRunner = Stamps.stampRunner(net.get);
ipcMain.handle('stamps:open', (e, id, run) => stampRunner.open(id, row => e.sender.send('stamps:row', run, row), () => !e.sender.isDestroyed()));
ipcMain.handle('stamps:prefetch', (e, id) => stampRunner.prefetch(id));
ipcMain.handle('tree:more', (e, id) => tree ? Tree.moreTree(tree, Number(id)) : { added: 0 });
// Full-song links open in the default browser, never in this window; only the https allowlist in src/links.js.
ipcMain.handle('shell:open', (e, url) => {
  const ok = safeExternal(url);
  if (!ok) throw new Error('link not allowed');
  return shell.openExternal(ok);
});
// Spotify: tokens stay in this process; the renderer only gets status, devices and results.
let spotify;
const trackIn = t => {
  if (!t || typeof t.artist !== 'string' || typeof t.title !== 'string') throw new Error('bad track');
  return { source: String(t.source), id: t.id == null ? null : String(t.id), artist: t.artist.slice(0, 300), title: t.title.slice(0, 300), isrc: typeof t.isrc === 'string' ? t.isrc : undefined };
};
ipcMain.handle('spotify:status', () => spotify.status());
ipcMain.handle('spotify:connect', (e, clientId) => spotify.connect(String(clientId)));
ipcMain.handle('spotify:disconnect', () => spotify.disconnect());
ipcMain.handle('spotify:devices', () => spotify.devices());
ipcMain.handle('spotify:play', (e, t, deviceId) => spotify.play(trackIn(t), deviceId == null ? undefined : String(deviceId)));
ipcMain.handle('spotify:export', (e, name, tracks) => {
  if (!Array.isArray(tracks)) throw new Error('bad tracks');
  return spotify.exportPlaylist(String(name || 'After Hours').slice(0, 100), tracks.slice(0, 500).map(trackIn));
});
ipcMain.handle('store:load', () => store.load());
ipcMain.handle('store:save', (e, profile) => store.save(profile));

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  net.initCache(dir);
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
