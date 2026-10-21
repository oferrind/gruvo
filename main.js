const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const net = require('./src/net');
const store = require('./src/store');
const { flows, COUNTRIES } = require('./src/music');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 800,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Never leave the app page: a remote page in this window would get window.api / window.store.
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // shortcut: test-only screenshot hook, active only when SNAP is set.
  // SNAP_JS runs in the page first; SNAP_WAIT (ms) is the delay before capture.
  if (process.env.SNAP) {
    win.webContents.setAudioMuted(true);
    win.webContents.once('did-finish-load', async () => {
      if (process.env.SNAP_JS) await win.webContents.executeJavaScript(process.env.SNAP_JS).catch(e => console.error('SNAP_JS', e));
      setTimeout(async () => {
        win.webContents.invalidate(); // occluded windows stop painting; force a fresh frame
        await new Promise(r => setTimeout(r, 500));
        fs.writeFileSync(process.env.SNAP, (await win.webContents.capturePage()).toPNG());
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
ipcMain.handle('store:load', () => store.load());
ipcMain.handle('store:save', (e, profile) => store.save(profile));

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  net.initCache(dir);
  store.init(dir);
  createWindow();
});
app.on('before-quit', () => net.flushCache());
app.on('window-all-closed', () => app.quit());
