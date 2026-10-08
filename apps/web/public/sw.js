// Cache only the public shell and build assets. API responses never enter this cache.
const shellCache = 'werewolf-v2-public-shell'
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(shellCache)
      const response = await fetch('/')
      if (!response.ok) return
      const html = await response.clone().text()
      await cache.put('/', response)
      const assets = Array.from(
        html.matchAll(/(?:src|href)="([^"]+)"/g),
        (match) => new URL(match[1], self.location.origin),
      ).filter((url) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'))
      await cache.addAll(assets.map((url) => url.href))
      await self.skipWaiting()
    })(),
  )
})
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return
  const navigation = event.request.mode === 'navigate'
  if (!navigation && !url.pathname.startsWith('/assets/')) return
  event.respondWith(
    (async () => {
      const key = navigation ? '/' : event.request
      try {
        const response = await fetch(event.request)
        if (response.ok) {
          const cache = await caches.open(shellCache)
          await cache.put(key, response.clone())
        }
        return response
      } catch {
        const cache = await caches.open(shellCache)
        return (await cache.match(key)) ?? Response.error()
      }
    })(),
  )
})
