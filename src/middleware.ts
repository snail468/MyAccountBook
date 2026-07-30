import { NextResponse, type NextRequest } from 'next/server';

// 两件事在这里统一做，避免在几十个路由里各写一遍：
//
// 1. CSRF —— 会话 cookie 是 sameSite=lax，JSON API 基本安全，但
//    /api/events/upload 收 multipart/form-data，这是**跨站表单可以直接
//    提交**的内容类型，存在被诱导上传的面。对所有写操作校验 Origin。
//
// 2. CSP —— 每个请求生成一个 nonce，写进请求头让 Next 给自己的内联脚本
//    打标，同时写进响应头。这样 layout 里那两段 dangerouslySetInnerHTML
//    可以带 nonce 通过，而不必开 'unsafe-inline'。

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * 当前请求是否走在 HTTPS 上。反代终止 TLS 时看 x-forwarded-proto，
 * 直连时看 URL 自身的协议。
 */
function isHttps(req: NextRequest): boolean {
  const forwarded = req.headers.get('x-forwarded-proto');
  if (forwarded) {
    // 多层代理会串成 "https, http"，第一跳才是客户端看到的协议
    return forwarded.split(',')[0].trim().toLowerCase() === 'https';
  }
  return req.nextUrl.protocol === 'https:';
}

function buildCsp(nonce: string, https: boolean): string {
  return [
    "default-src 'self'",
    // strict-dynamic 让带 nonce 的脚本可以动态加载 chunk，
    // 这是 Next.js 代码分割能在严格 CSP 下工作的前提
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Tailwind 的动态宽度用的是 style 属性（进度条等），必须放开 style-src-attr
    "style-src 'self' 'unsafe-inline'",
    // blob: 给图片上传预览；data: 给内联小图标
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    // ⚠️ 只在 HTTPS 下发。HTTP 部署（http://IP:3000 这种）如果发了这条，
    // 浏览器会把 /_next/static 下的 CSS、JS 以及所有同源导航统统升级到 https，
    // 而服务端只监听 HTTP —— 结果是页面没样式、点任何链接都报
    // ERR_SSL_PROTOCOL_ERROR。HTTPS 下这条仍然有价值（兜住漏网的 http 资源）。
    ...(https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** 写操作必须来自同源。Origin 缺失时回退看 Referer。 */
function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host');
  if (!host) return false;

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  // 少数客户端（部分原生 WebView）不带 Origin，退一步看 Referer
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  // 两个都没有：非浏览器发起的写请求，一律拒绝
  return false;
}

export function middleware(req: NextRequest) {
  if (!SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return NextResponse.json(
      { error: '跨站请求被拒绝' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = buildCsp(nonce, isHttps(req));

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next 会从请求上的 CSP 头里解析 nonce，自动打到它注入的内联脚本上
  requestHeaders.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  // 静态资源不需要过 middleware
  matcher: [
    '/((?!_next/static|_next/image|favicon.png|icon-|manifest.json|audio/|sw\\.js).*)',
  ],
};
