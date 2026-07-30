/** @type {import('next').NextConfig} */

// CSP 在 middleware 里按请求生成（需要 per-request nonce），
// 这里只放那些静态的安全头。
const securityHeaders = [
  // 禁止浏览器猜测 MIME —— 上传的图片被当成 HTML 执行的经典路径
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 跨域引用时只发送源，不泄露完整路径（账本 id 都在路径里）
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 不需要这些能力，一律关掉
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
  // CSP 里已有 frame-ancestors 'none'，这个是给老浏览器的兜底
  { key: 'X-Frame-Options', value: 'DENY' },
  // 只在 HTTPS 下生效；HTTP 部署的用户不受影响
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
];

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // 别把框架版本号写在响应头里
  poweredByHeader: false,
  experimental: {
    // 让 dynamic route 的 RSC 在客户端 prefetch 缓存里保鲜 30 秒
    // 效果：任何页面 Prefetcher 拉过的首页，30 秒内返回都是即点即开
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
