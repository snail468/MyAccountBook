/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  experimental: {
    // 让 dynamic route 的 RSC 在客户端 prefetch 缓存里保鲜 30 秒
    // 效果：任何页面 Prefetcher 拉过的首页，30 秒内返回都是即点即开
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
