// Copies renderer/ to mobile/www/ for Capacitor, bundles mobile/api.js next to it, and patches only the copied index.html.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const root = path.join(__dirname, '..'), out = path.join(root, 'mobile', 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'renderer'), out, { recursive: true });
// Browser platform: a stray fs/http/crypto require in src/ fails the build instead of shipping.
esbuild.buildSync({ entryPoints: [path.join(root, 'mobile', 'api.js')], bundle: true, platform: 'browser', format: 'iife', target: 'chrome100', outfile: path.join(out, 'api.js'), logLevel: 'warning' });

const f = path.join(out, 'index.html');
const patch = (s, from, to) => { if (!s.includes(from)) throw new Error(`index.html: "${from}" not found`); return s.replace(from, to); };
let html = fs.readFileSync(f, 'utf8');
html = patch(html, '<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
html = patch(html, 'media-src https://*.dzcdn.net', 'media-src blob:'); // previews play from in-memory bytes only (never an https src: no WebView disk cache)
html = patch(html, '<script src="app.js">', '<script src="api.js"></script>\n  <script src="app.js">');
fs.writeFileSync(f, html);
