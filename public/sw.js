// Service Worker لأمبير — يخزّن غلاف التطبيق الثابت فقط (الأيقونات والـ manifest).
// لا يُخزَّن أي طلب API أو بيانات مالية مؤقتًا؛ التطبيق يتطلب اتصالًا فعالًا لأي عملية تغيّر بيانات.
const CACHE_NAME = "ampere-shell-v1";
const SHELL_ASSETS = ["/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!SHELL_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
