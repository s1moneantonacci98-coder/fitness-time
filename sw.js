/*
 * Fitness Time Club — Service Worker
 * App-shell cache-first (funzionamento offline in sala pesi) +
 * network-first per le chiamate API verso Supabase.
 * Aggiornare CACHE_VERSION ad ogni release per invalidare la cache.
 */
const CACHE_VERSION = 'fitnesstime-v10';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './vendor/supabase.js',
  './vendor/jspdf.umd.min.js',
  './vendor/dejavu-fonts.js',
  './pdf.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('fitnesstime-') && key !== APP_SHELL_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url) {
  return url.hostname.endsWith('.supabase.co');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // le POST/PATCH (log, RPC) restano sempre in rete
  const url = new URL(request.url);

  // Chiamate verso Supabase: sempre in rete, nessuna cache (dati live).
  if (isSupabaseRequest(url)) {
    event.respondWith(
      fetch(request).catch(() => new Response(
        JSON.stringify({ offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Stessa origine: network-first (aggiornamenti subito visibili),
  // con ripiego sulla cache quando manca la rete (offline in sala pesi).
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
  }
});
