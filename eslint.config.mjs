// ESLint flat config。
//
// 原来 package.json 里有 lint 脚本但根目录没有任何 eslint 配置文件，
// 实际跑的是 Next 的内置默认，CI 里也没有 lint 步骤 —— 等于没在用。

import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      // @opennextjs/cloudflare 的产物 —— 里面有近三万个打包后的文件，
      // 漏掉这条会让 lint 和 next build（内置 lint 步骤）一起炸
      '.open-next/**',
      '.wrangler/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'dist/**',
      'prisma/data/**',
      'data/**',
      'next-env.d.ts',
      '*.tsbuildinfo',
      // Service Worker 跑在完全不同的全局环境里（self / caches / clients），
      // 按应用代码的规则去检查只会产生一堆假的 no-undef
      'public/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },
  {
    // 代码里已有若干 react-hooks/exhaustive-deps 的行内 disable，
    // 插件必须注册，否则 ESLint 会报 "Definition for rule was not found"
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      // 未使用变量：允许 _ 前缀占位（解构丢弃、未用的函数参数）
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 项目里有若干处需要 any 与 webpack 打交道（db.ts 的适配器加载），
      // 那些点已有行内 eslint-disable 说明理由，这里保持 warn 而非 error
      '@typescript-eslint/no-explicit-any': 'warn',
      // <img> 是有意的：上传的图片走 /api/uploads 动态路由，
      // next/image 的优化在这里帮不上忙还会多一层代理
      '@next/next/no-img-element': 'off',
    },
  },
  {
    // 测试文件里断言写法更随意一些
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
