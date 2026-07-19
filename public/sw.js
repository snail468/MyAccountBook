// 心愿便利贴 SW —— 目标：不添乱
// 策略：
//   * /_next/static/*  cache-first（内容有版本哈希，永远不变）
//   * /icon-*.png / manifest.json  cache-first（应用图标级）
//   * 其余全部 network-only —— HTML、RSC payload、API、图片上传都直连服务端
// 好处：绝不会把旧 RSC / 老 HTML 返给用户，也不干扰 Next.js 的路由预取

const CACHE_NAME = 'xyd-v5-static';
const STATIC_PRECACHE = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_PRECACHE).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.png' ||
    url.pathname.startsWith('/icon-') ||
    url.pathname.startsWith('/audio/')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }
  // 其它请求：不拦截，让浏览器/Next.js 直接跑
});
