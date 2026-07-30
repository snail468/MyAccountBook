import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // 只测纯函数 —— 涉及 prisma / next 运行时的模块不在单测范围内，
    // 那些靠 build + 真实请求的 smoke test 覆盖
    include: ['src/**/*.test.ts'],
  },
});
