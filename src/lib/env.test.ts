import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCardSecret, requireSessionSecret } from './env';

const GOOD = 'a'.repeat(32);
const DEV_FALLBACK = 'dev-only-insecure-secret-please-change-me-now';

const original = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PHASE: process.env.NEXT_PHASE,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CARD_SECRET: process.env.CARD_SECRET,
};

function setEnv(vals: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vals)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  setEnv({ NODE_ENV: 'test', NEXT_PHASE: undefined, SESSION_SECRET: undefined, CARD_SECRET: undefined });
});

afterEach(() => {
  setEnv(original as Record<string, string | undefined>);
  vi.restoreAllMocks();
});

describe('requireSessionSecret · 合规密钥', () => {
  it('够长就原样返回', () => {
    setEnv({ SESSION_SECRET: GOOD });
    expect(requireSessionSecret()).toBe(GOOD);
  });

  it('生产环境下合规密钥同样通过', () => {
    setEnv({ NODE_ENV: 'production', SESSION_SECRET: GOOD });
    expect(requireSessionSecret()).toBe(GOOD);
  });
});

describe('requireSessionSecret · 运行时缺失应当抛错', () => {
  it('生产环境未设置 → 抛错', () => {
    setEnv({ NODE_ENV: 'production' });
    expect(() => requireSessionSecret()).toThrow(/未设置/);
  });

  it('生产环境过短 → 抛错，并说明实际长度', () => {
    setEnv({ NODE_ENV: 'production', SESSION_SECRET: 'short' });
    expect(() => requireSessionSecret()).toThrow(/只有 5 个字符/);
  });

  it('生产环境用开发默认值 → 抛错', () => {
    setEnv({ NODE_ENV: 'production', SESSION_SECRET: DEV_FALLBACK });
    expect(() => requireSessionSecret()).toThrow(/开发用的默认值/);
  });
});

describe('requireSessionSecret · 构建期必须放行', () => {
  // 回归测试：next build 会自己把 NODE_ENV 设成 production，
  // 且 Collecting page data 阶段会 import 所有路由模块。
  // 如果这里抛错，Docker 镜像根本构建不出来：
  //   Error: [env] SESSION_SECRET 未设置。生产环境拒绝启动
  //   [Error: Failed to collect page data for /api/entries]
  // 这个 bug 真实发生过一次（CI 构建失败），不要让它回来。
  it('构建期未设置密钥 → 不抛错，返回占位值', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' });
    expect(() => requireSessionSecret()).not.toThrow();
    expect(requireSessionSecret()).toBe(DEV_FALLBACK);
  });

  it('构建期密钥过短 → 也不抛错', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build', SESSION_SECRET: 'x' });
    expect(() => requireSessionSecret()).not.toThrow();
  });

  it('构建期即便填的是开发默认值也放行', () => {
    setEnv({
      NODE_ENV: 'production',
      NEXT_PHASE: 'phase-production-build',
      SESSION_SECRET: DEV_FALLBACK,
    });
    expect(() => requireSessionSecret()).not.toThrow();
  });

  it('构建期有合规密钥时仍原样返回', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build', SESSION_SECRET: GOOD });
    expect(requireSessionSecret()).toBe(GOOD);
  });

  it('只有 phase-production-build 算构建期，别的 NEXT_PHASE 值不放行', () => {
    setEnv({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-server' });
    expect(() => requireSessionSecret()).toThrow(/未设置/);
  });
});

describe('requireSessionSecret · 开发环境', () => {
  it('缺失时给警告并回落到默认值，不抛错', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setEnv({ NODE_ENV: 'development' });
    expect(requireSessionSecret()).toBe(DEV_FALLBACK);
    expect(warn).toHaveBeenCalled();
  });
});

describe('getCardSecret', () => {
  it('未设置或过短返回 null（表示功能未启用，而不是降级成明文）', () => {
    expect(getCardSecret()).toBeNull();
    setEnv({ CARD_SECRET: 'tooshort' });
    expect(getCardSecret()).toBeNull();
  });

  it('够长则返回', () => {
    setEnv({ CARD_SECRET: GOOD });
    expect(getCardSecret()).toBe(GOOD);
  });
});
