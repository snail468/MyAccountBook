// 心愿便利贴 SW —— v6 · 断网也不摔到浏览器恐龙
//
// 之前的 v5 只精缓存了 icon/manifest；一断网就"应用消失显示恐龙"。
// 现在的策略：
//
//   * navigate 请求（HTML）      network-first → 缓存回退 → offline.html
//     浏览器不再走浏览器兜底页；用户看到的是我们自己的"网络不可用"页
//   * RSC / Server Action 请求    network-first → 失败**返 503 空**
//     Next.js 收到 503 会保留当前页面，不会跳走
//   * /_next/static/*             cache-first（内容有哈希）+ 写缓存
//     动态 import 弹窗的 chunk 也在这个前缀下，第一次访问后就永久离线可用
//   * icon / manifest / audio    cache-first
//   * /api/*                     不拦截 —— 让应用层判定错误（含离线队列）
//
// 离线记账队列（普通账本）是应用层的事：见 src/lib/offlineQueue.ts。
// 这个 SW 不试图代理 API，那样只会把错误提示藏起来。

const VERSION = 'v6';
const NAV_CACHE = `xyd-${VERSION}-nav`;
const STATIC_CACHE = `xyd-${VERSION}-static`;
const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== NAV_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
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

// Next.js 的 RSC 请求带 RSC:1 头，或 URL 里带 ?_rsc=xxx。
// 它们不是导航但也不是资源 —— 用 network-first + 503 兜底就好，
// 因为 Next.js 收到失败会保留旧页面而不是崩溃
function isRscRequest(req, url) {
  if (req.headers.get('rsc') || req.headers.get('RSC')) return true;
  return url.searchParams.has('_rsc');
}

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) {
    const copy = res.clone();
    caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
  }
  return res;
}

async function networkFirstNavigation(req) {
  try {
    const res = await fetch(req);
    // 只缓存 200 且是本站 HTML
    if (res.ok && res.type !== 'opaque') {
      const copy = res.clone();
      caches.open(NAV_CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  } catch {
    // 网络挂了：先回同 URL 的历史缓存，再回 offline.html
    const cached = await caches.match(req);
    if (cached) return cached;
    const shell = await caches.match('/offline.html');
    if (shell) return shell;
    return new Response('offline', { status: 503 });
  }
}

async function networkFirstRsc(req) {
  try {
    return await fetch(req);
  } catch {
    // Next.js 客户端遇到 RSC 请求失败会保留当前页面，比抛错好得多
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航（HTML 页面）
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  // 静态资源（包含 next/dynamic 拉的 chunk）
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // RSC / server component payload
  if (isRscRequest(req, url)) {
    event.respondWith(networkFirstRsc(req));
    return;
  }

  // /api/* 与其它请求：不拦截，让浏览器/应用层处理
});
