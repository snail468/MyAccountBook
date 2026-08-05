// 心愿便利贴 SW —— v7 · 让"离线记账"真正可用
//
// v6 的漏洞（用户断网真机复现）：
//   NAV_CACHE 只在 req.mode === 'navigate' 成功时写。SPA 里点 <Link> 走的
//   是 RSC fetch（?_rsc=xxx），SW 从没见过 navigate 请求 —— 于是 /l/[id]
//   的 HTML 一次都没被缓存。断网后 RSC 挂 → Next.js 兜底硬跳 → SW 拿不到
//   缓存 → 掉进 offline.html。B8 那套"离线记账队列"根本走不到 GeneralView
//   去点"记一笔"。
//
// v7 的三件事：
//
//   * 见到 RSC 成功响应 → 后台同时抓一次同 URL 的 HTML，塞进 NAV_CACHE。
//     这样用户"点过一次"的账本页 HTML 就在缓存里，下次断网硬跳能命中。
//   * navigate 分支保留 v6 的 network-first + offline.html 兜底。
//     但**如果缓存里有同 URL 的 HTML**，离线命中就不再落到 offline.html。
//   * postMessage({ type: 'warm', urls: [...] }) —— 客户端可以主动请 SW
//     去 warm 一批 URL（首页在挂载时用它把用户所有普通账本 HTML 提前抓下来，
//     哪怕用户从没点过那个账本卡片，断网也能直接进去记账）。
//
// /api/* 依然不拦截 —— 让 app 层的 offlineQueue.ts 判定 TypeError 入队。

const VERSION = 'v7';
const NAV_CACHE = `xyd-${VERSION}-nav`;
const STATIC_CACHE = `xyd-${VERSION}-static`;
const PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
  '/offline.html',
  '/offline-record.html',
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

function isRscRequest(req, url) {
  if (req.headers.get('rsc') || req.headers.get('RSC')) return true;
  return url.searchParams.has('_rsc');
}

// 只在这些"用户会导航到的页面"上做 HTML 预热与缓存。
// 排除 /api /admin /_next/data 等 —— warm 它们要么无意义要么打回权限错。
function isWarmablePagePath(pathname) {
  if (pathname.startsWith('/api/')) return false;
  if (pathname.startsWith('/admin')) return false;
  if (pathname.startsWith('/_next/')) return false;
  if (pathname.startsWith('/offline.html')) return false;
  return true;
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

// 后台把某个 URL 的 HTML 抓一份塞进 NAV_CACHE。
// key 用去掉 _rsc 参数的纯 URL —— 这样 hard nav 请求与 warm 请求命中同一 key。
async function warmHtmlCache(pathAndSearch) {
  try {
    const cache = await caches.open(NAV_CACHE);
    const warmReq = new Request(pathAndSearch, {
      method: 'GET',
      credentials: 'include',
      // 不带 rsc 头 —— 拿到的是完整 HTML SSR
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    const res = await fetch(warmReq);
    // 只缓 200 且是本站响应；其它（3xx redirect、401 未登录）都跳过
    if (res.ok && res.type !== 'opaque') {
      // 存到 NAV_CACHE 时用不带 _rsc 的 key，让下次 navigate 匹配
      await cache.put(new Request(pathAndSearch), res);
    }
  } catch {
    /* warm 失败无所谓，下次再来 */
  }
}

async function networkFirstNavigation(req) {
  const url = new URL(req.url);
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') {
      const copy = res.clone();
      // key 用"无 _rsc"的纯 URL，与 warmHtmlCache 保持一致
      const keyReq = new Request(url.pathname + url.search);
      caches.open(NAV_CACHE).then((c) => c.put(keyReq, copy)).catch(() => {});
    }
    return res;
  } catch {
    // 网络挂了：先找同 URL（去掉 _rsc）的历史缓存，再回 offline.html
    const cache = await caches.open(NAV_CACHE);
    const keyReq = new Request(url.pathname + url.search);
    const cached = await cache.match(keyReq);
    if (cached) return cached;
    // 有些历史缓存可能带旧 query，兜底再按 pathname 查一次
    const cachedByPath = await cache.match(new Request(url.pathname));
    if (cachedByPath) return cachedByPath;
    const shell = await caches.match('/offline.html');
    if (shell) return shell;
    return new Response('offline', { status: 503 });
  }
}

async function networkFirstRsc(req, url) {
  try {
    const res = await fetch(req);
    // 成功走 SPA nav → 顺手把 HTML 也 warm 了。这样下次真断网硬跳能命中
    if (res.ok) {
      const clean = url.pathname; // 去掉 _rsc 参数
      if (isWarmablePagePath(clean)) {
        // fire-and-forget，不阻塞返回
        warmHtmlCache(clean);
      }
    }
    return res;
  } catch {
    // Next.js 收到 RSC 失败时会 fallback 到 hard navigation，
    // hard navigation 会走上面的 networkFirstNavigation → 命中 warm 过的缓存
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  if (isRscRequest(req, url)) {
    event.respondWith(networkFirstRsc(req, url));
    return;
  }

  // /api/* 与其它请求：不拦截
});

// 客户端主动请 SW 预热一批 URL（首页挂载时会调用，把用户所有账本 HTML 抓下来）
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    Promise.all(
      data.urls
        .filter((u) => typeof u === 'string' && u.startsWith('/') && isWarmablePagePath(new URL(u, self.location.origin).pathname))
        .map((u) => warmHtmlCache(u)),
    ),
  );
});
