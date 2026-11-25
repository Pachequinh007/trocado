// Guarda o app inteiro no aparelho: abre na hora e funciona sem internet. Trocar NOME a cada versão publicada.
const NOME = "trocado-v1";
const CASCA = ["./", "index.html", "util.js", "base.js", "telas.js", "estilo.css", "manifest.webmanifest",
  "privacidade.html", "icones/icone.svg", "icones/icone-192.png", "icones/icone-512.png", "fontes/inter.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(NOME).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((nomes) => Promise.all(nomes.filter((n) => n !== NOME).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// Cache primeiro; em segundo plano baixa a versão nova para a próxima abertura.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(caches.open(NOME).then(async (cache) => {
    const guardado = await cache.match(e.request, { ignoreSearch: true });
    const rede = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; });
    if (guardado) { rede.catch(() => {}); return guardado; }
    return rede.catch(() => cache.match("index.html"));
  }));
});
