// Rotina PDPL — funciona sem internet e avisa quando há versão nova.
// Ao publicar uma versão nova, mude o número abaixo.
const VERSAO = "rotina-pdpl-4.3";
const APP = ["./", "./index.html", "./app.js", "./firebase-config.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
const CDN = /(cdnjs\.cloudflare\.com|www\.gstatic\.com\/firebasejs)/;

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(APP))); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (CDN.test(u.href)) { // bibliotecas: usa a cópia guardada, busca se não tiver
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(r, cp)); } return res; })));
    return;
  }
  if (u.origin !== location.origin) return; // Firebase e login vão direto
  // arquivos do app: tenta a internet primeiro (pega atualizações), sem internet usa a cópia
  e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(VERSAO).then(c => c.put(r, cp)); } return res; })
    .catch(() => caches.match(r).then(hit => hit || caches.match("./index.html"))));
});
