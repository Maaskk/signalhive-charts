import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

const root = new URL('../dist/', import.meta.url);
const assets = (await readdir(new URL('assets/', root))).map((name) => `./assets/${name}`);
const files = [
  './',
  './index.html',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './manifest.webmanifest',
  ...(await readdir(new URL('licenses/', root))).map((name) => `./licenses/${name}`),
  ...assets,
];
const version = createHash('sha256')
  .update(await readFile(new URL('index.html', root)))
  .digest('hex')
  .slice(0, 12);
const source = `/* Signalhive Charts: only this app's static assets are cached. */
const PREFIX = 'signalhive-charts-' + new URL(self.registration.scope).pathname + '-';
const CACHE = PREFIX + '${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    // Only this build's public static files are cached. Dev/preview hosts may
    // add Vary: Origin; module requests must still match their precached asset.
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      return Response.error();
    }
  }));
});
`;
// A malformed generated worker must fail the build, rather than silently disabling offline use.
new Script(source, { filename: 'sw.js' });
await writeFile(new URL('sw.js', root), source);
console.log(`Offline cache built: ${assets.length} bundled assets.`);
