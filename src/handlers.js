// Platform-free app handlers: the bodies of main.js's ipcMain.handle blocks, shared by Electron and the phone.
// No electron/fs/path here. Dependencies are injected; per-call `ctx` = { send(channel, ...args), alive() } is the window.
// Spotify is desktop-only and stays out of this file (main.js uses trackIn).
const { safeExternal } = require('./links');
const { flows, COUNTRIES } = require('./music');
const Tree = require('./tree');
const Stamps = require('./stamps');

// A track from the renderer, cleaned; anything malformed throws.
const trackIn = t => {
  if (!t || typeof t.artist !== 'string' || typeof t.title !== 'string') throw new Error('bad track');
  return { source: String(t.source), id: t.id == null ? null : String(t.id), artist: t.artist.slice(0, 300), title: t.title.slice(0, 300), isrc: typeof t.isrc === 'string' ? t.isrc : undefined };
};

// get(url, opts), audio(url), open(safeUrl) and store {load, save} come from the platform.
function create({ get, audio, open, store }) {
  // Family Tree: one build at a time. A newer tree makes the older one's live() false, so it stops before its next call.
  let tree = null, treeRun = 0;
  const recent = []; // song keys shown in recent trees (session only): a similar root next time surfaces other songs
  const stampRunner = Stamps.stampRunner(get); // one playlist at a time, rows streamed as previews resolve
  const rowSink = (ctx, run) => row => ctx.send('stamps:row', run, row);
  return {
    trackIn,
    get: url => get(String(url)),
    audio: url => audio(String(url)),
    async call(name, ...args) {
      if (!Object.hasOwn(flows, name)) throw new Error(`unknown call ${name}`);
      return flows[name](get, ...args);
    },
    countries: () => COUNTRIES,
    async treeGrow(ctx, root, heard, run, saved, settings) {
      if (!root || typeof root.artist !== 'string' || typeof root.title !== 'string') throw new Error('bad root');
      const mine = ++treeRun;
      const live = () => mine === treeRun && ctx.alive();
      recent.splice(0, recent.length - 150);
      tree = Tree.newTree(get, root, { recent, settings: Tree.validSettings(settings), heard: Array.isArray(heard) ? heard.map(String) : [], live,
        saved: Array.isArray(saved) ? saved.filter(s => s && typeof s.artist === 'string' && typeof s.title === 'string')
          .map(s => ({ source: String(s.source), id: s.id == null ? null : String(s.id), artist: s.artist, title: s.title })) : [], emit: n => live() && ctx.send('tree:node', run, n) });
      await Tree.growTree(tree);
      return live();
    },
    treeMore: id => tree ? Tree.moreTree(tree, Number(id)) : { added: 0 },
    stampsOpen: (ctx, id, run) => stampRunner.open(id, rowSink(ctx, run), ctx.alive),
    stampsMore: (ctx, id, run) => stampRunner.more(id, rowSink(ctx, run), ctx.alive),
    stampsPrefetch: id => stampRunner.prefetch(id),
    // Full-song links: only the https allowlist in links.js.
    shellOpen(url) {
      const ok = safeExternal(url);
      if (!ok) throw new Error('link not allowed');
      return open(ok);
    },
    storeLoad: () => store.load(),
    storeSave: profile => store.save(profile),
  };
}

module.exports = { create, trackIn };
