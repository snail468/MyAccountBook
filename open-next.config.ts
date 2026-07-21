// @opennextjs/cloudflare 的适配层配置
// 只在跑 `npm run build:cf` 时生效；本地/Docker 不会读到

import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // 使用默认配置：ISR/图片按 Cloudflare 默认；
  // 我们的账本页面全部 dynamic force-dynamic，无 ISR 顾虑
});
