// Copies renderer/ to mobile/www/ for Capacitor and patches only the copied index.html.
// M0: no phone api.js yet, so the UI loads but network calls fail.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'mobile', 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'renderer'), out, { recursive: true });
const f = path.join(out, 'index.html');
const html = fs.readFileSync(f, 'utf8');
const meta = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">';
if (!html.includes('<head>')) throw new Error('index.html has no <head>');
fs.writeFileSync(f, html.replace('<head>', '<head>\n  ' + meta));
