// Guarda la app en el teléfono para que abra sin señal.
// Si cambiás algún archivo, subí el número de VERSION para que los teléfonos se actualicen.
const VERSION = "avance-pozos-v1";
const ARCHIVOS = ["./", "./index.html", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Solo los archivos de la app; los pedidos a la planilla van directo a internet.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.open(VERSION).then(async cache => {
      const guardado = await cache.match(e.request, { ignoreSearch: true });
      const red = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => null);
      if (guardado) { e.waitUntil(red); return guardado; }   // abre al instante con lo guardado y se actualiza de fondo
      const r = await red;
      return r || (await cache.match("./index.html")) || new Response("Sin señal", { status: 503 });
    })
  );
});
