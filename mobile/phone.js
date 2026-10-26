// Phone adapters for src/: CapacitorHttp transport, preview bytes kept in memory only, files in app storage.
// Pure: the Capacitor plugins are passed in, so node tests run these with fakes; mobile/api.js wires the real ones.
const { parse, serialize } = require('../src/store');

const TIMEOUT = 15000;
const MAX_AUDIO = 2 * 1024 * 1024; // same cap as net.js on desktop

// net.configure({ fetch }) shape. CapacitorHttp is native, so it may set User-Agent and needs no CORS.
// `signal` is ignored: CapacitorHttp has no abort, its own 15 s timeouts stand in for AbortSignal.timeout.
const fetchVia = http => async (url, { headers } = {}) => {
  const r = await http.request({ url, method: 'GET', headers, responseType: 'text', connectTimeout: TIMEOUT, readTimeout: TIMEOUT });
  // A JSON content-type arrives already parsed (Capacitor's "backward compatibility" branch); anything else as text.
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) };
};

// CapacitorHttp 8.5.3 returns responseType 'arraybuffer' as a base64 string (HttpRequestHandler.readStreamAsBase64).
function fromBase64(s) {
  const bin = atob(s), out = new Uint8Array(bin.length); // atob drops the line breaks Android's Base64.DEFAULT adds
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// Preview bytes for playback (blob: URL) and the Sound Fingerprint: *.dzcdn.net only, no redirects, at most MAX_AUDIO,
// never written to disk. The last `keep` previews stay in memory so play + fingerprint download once.
// Returns a fresh ArrayBuffer copy (decodeAudioData detaches what it is given), or {error}. Never throws.
function audioVia(http, keep = 8) {
  const lru = new Map(); // href -> Promise<ArrayBuffer | {error}>
  const load = async href => {
    try {
      const r = await http.request({ url: href, method: 'GET', responseType: 'arraybuffer', disableRedirects: true, connectTimeout: TIMEOUT, readTimeout: TIMEOUT });
      if (r.status < 200 || r.status >= 300) return { error: { status: r.status } };
      if (typeof r.data !== 'string') return { error: { message: 'not audio' } };
      if (r.data.length > MAX_AUDIO * 1.4) return { error: { message: 'too large' } }; // base64 is ~1.35x; skip the decode
      const buf = fromBase64(r.data);
      return buf.byteLength > MAX_AUDIO ? { error: { message: 'too large' } } : buf;
    } catch (e) {
      return { error: { message: e.message } };
    }
  };
  return async url => {
    let u;
    try { u = new URL(url); } catch { return { error: { message: 'bad url' } }; }
    if (u.protocol !== 'https:' || !u.hostname.endsWith('.dzcdn.net')) return { error: { message: 'host not allowed' } };
    const p = lru.get(u.href) || load(u.href);
    lru.delete(u.href);
    lru.set(u.href, p);
    if (lru.size > keep) lru.delete(lru.keys().next().value);
    const b = await p;
    if (!(b instanceof ArrayBuffer)) { if (lru.get(u.href) === p) lru.delete(u.href); return b; } // failures are not kept
    return b.slice(0);
  };
}

// Text files in app storage (Filesystem plugin, Directory.Data): writes to one path run one at a time, tmp + rename.
function filesVia(fs, directory, encoding) {
  const chains = {};
  const read = path => fs.readFile({ path, directory, encoding }).then(r => r.data, () => null);
  const move = (from, to) => fs.rename({ from, to, directory, toDirectory: directory });
  const write = (path, text) => (chains[path] = (chains[path] || Promise.resolve()).catch(() => {}).then(async () => {
    await fs.writeFile({ path: path + '.tmp', data: text, directory, encoding });
    // If rename won't replace an existing file, delete then rename; load() falls back to the .tmp in between.
    try { await move(path + '.tmp', path); } catch { await fs.deleteFile({ path, directory }).catch(() => {}); await move(path + '.tmp', path); }
  }));
  return { read, write, move };
}

// window.store on the phone: same validation and corrupt-file handling as desktop (src/store.js).
function storeVia(files) {
  return {
    async load() {
      const raw = (await files.read('profile.json')) ?? (await files.read('profile.json.tmp'));
      const { profile, corrupt } = parse(raw);
      // Move it aside so the next save can't destroy the user's likes for good.
      if (corrupt) await files.move('profile.json', `profile.json.corrupt-${Date.now()}`).catch(e => console.error('profile backup failed', e.message));
      return profile;
    },
    async save(p) { await files.write('profile.json', serialize(p)); return true; },
  };
}

// net.initCache io for the phone: read once (async) before init, smaller prune cap so the cold-start parse stays short.
async function cacheVia(files) {
  let data = null;
  try { data = JSON.parse(await files.read('cache.json')); } catch {}
  return { read: () => data || {}, write: text => { files.write('cache.json', text).catch(e => console.error('cache save failed', e.message)); }, cap: 2000, maxBytes: 5e6 };
}

module.exports = { fetchVia, fromBase64, audioVia, filesVia, storeVia, cacheVia, MAX_AUDIO };
