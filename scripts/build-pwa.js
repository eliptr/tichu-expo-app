const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../dist');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(root).filter(file => path.basename(file) !== 'sw.js' && !file.endsWith('.map') &&
  (!file.endsWith('.html') || ['index.html', 'offline/game.html'].includes(path.relative(root, file).replaceAll('\\', '/'))));
const revision = crypto.createHash('sha256');
for (const file of files) revision.update(fs.readFileSync(file));
const urls = files.map(file => '/' + path.relative(root, file).replaceAll('\\', '/'));
const cache = 'tichu-offline-' + revision.digest('hex').slice(0, 16);
fs.writeFileSync(path.join(root, 'sw.js'), `
const CACHE = ${JSON.stringify(cache)};
const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(URLS)));
});
// Updates activate after existing tabs close, avoiding mixed app versions.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('tichu-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    if (!['/', '/index.html', '/offline/game', '/offline/game/', '/offline/game.html'].includes(url.pathname)) return;
    const page = url.pathname.startsWith('/offline/') ? '/offline/game.html' : '/index.html';
    event.respondWith(caches.open(CACHE).then(cache => cache.match(page)).then(hit => hit || fetch(event.request)));
    return;
  }
  if (URLS.includes(url.pathname)) event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(hit => hit || fetch(event.request)));
});
`);
console.log(`PWA cache generated: ${urls.length} files (${cache})`);
