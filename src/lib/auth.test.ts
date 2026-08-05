import { afterEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  describeHash,
  hashPassword,
  needsRehash,
  RECOMMENDED_ITERATIONS,
  targetIterations,
  verifyPassword,
} from './auth';

// 单测里把迭代次数压到下限，否则每次 hash 要几百毫秒。
// 每个用例结束后复位，因为有些用例会故意改它。
const FAST = '10000';
process.env.PASSWORD_KDF_ITERATIONS = FAST;

afterEach(() => {
  process.env.PASSWORD_KDF_ITERATIONS = FAST;
});

const PW = 'Tr4vel-Ledger-9x';

describe('targetIterations', () => {
  it('未配置时用 OWASP 推荐值', () => {
    delete process.env.PASSWORD_KDF_ITERATIONS;
    expect(targetIterations()).toBe(RECOMMENDED_ITERATIONS);
  });

  it('非法值回落到推荐值', () => {
    for (const bad of ['', 'abc', '0', '-1']) {
      process.env.PASSWORD_KDF_ITERATIONS = bad;
      expect(targetIterations()).toBe(RECOMMENDED_ITERATIONS);
    }
  });

  it('低于硬下限时抬到 10000 —— 不允许配成形同虚设', () => {
    process.env.PASSWORD_KDF_ITERATIONS = '100';
    expect(targetIterations()).toBe(10_000);
  });

  it('高于上限时截断', () => {
    process.env.PASSWORD_KDF_ITERATIONS = '99999999999';
    expect(targetIterations()).toBe(10_000_000);
  });
});

describe('hashPassword / verifyPassword（PBKDF2）', () => {
  it('哈希格式自描述：算法$迭代$盐$派生', async () => {
    const h = await hashPassword(PW);
    const parts = h.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('pbkdf2-sha256');
    expect(Number(parts[1])).toBe(10_000);
    expect(parts[2].length).toBeGreaterThan(0);
    expect(parts[3].length).toBeGreaterThan(0);
  });

  it('正确密码通过，错误密码不通过', async () => {
    const h = await hashPassword(PW);
    expect(await verifyPassword(PW, h)).toBe(true);
    expect(await verifyPassword(PW + 'x', h)).toBe(false);
    expect(await verifyPassword('', h)).toBe(false);
  });

  it('同一密码两次哈希不同（盐随机），但都能验证', async () => {
    const a = await hashPassword(PW);
    const b = await hashPassword(PW);
    expect(a).not.toBe(b);
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword(PW, b)).toBe(true);
  });

  it('改配置不会让已有密码失效 —— 验证用的是哈希里记录的迭代次数', async () => {
    const h = await hashPassword(PW); // 10000 次
    process.env.PASSWORD_KDF_ITERATIONS = '30000';
    expect(await verifyPassword(PW, h)).toBe(true);
  });

  it('支持中文与超长密码', async () => {
    for (const pw of ['账本记录很开心呀', 'x'.repeat(128), '🎉🍜 emoji 也行']) {
      const h = await hashPassword(pw);
      expect(await verifyPassword(pw, h)).toBe(true);
      expect(await verifyPassword(pw + '1', h)).toBe(false);
    }
  });

  it('哈希串被篡改时不通过，且不抛错', async () => {
    const h = await hashPassword(PW);
    const parts = h.split('$');
    for (const broken of [
      'pbkdf2-sha256$10000$onlythree',
      'pbkdf2-sha256$abc$' + parts[2] + '$' + parts[3],
      `pbkdf2-sha256$10000$!!!notb64!!!$${parts[3]}`,
      '',
      'garbage',
    ]) {
      await expect(verifyPassword(PW, broken)).resolves.toBe(false);
    }
  });
});

describe('bcrypt 向后兼容', () => {
  it('旧 bcrypt 哈希仍可验证', async () => {
    const legacy = await bcrypt.hash(PW, 4); // 低 cost，测试跑快点
    expect(await verifyPassword(PW, legacy)).toBe(true);
    expect(await verifyPassword('wrong', legacy)).toBe(false);
  });

  it('$2a$ / $2b$ / $2y$ 三种前缀都识别', () => {
    for (const p of ['$2a$', '$2b$', '$2y$']) {
      expect(describeHash(p + '10$abcdefghijklmnopqrstuv')).toBe('bcrypt(legacy)');
    }
  });
});

describe('needsRehash', () => {
  it('bcrypt 一律需要升级', async () => {
    const legacy = await bcrypt.hash(PW, 4);
    expect(needsRehash(legacy)).toBe(true);
  });

  it('迭代次数达标时不需要重算', async () => {
    const h = await hashPassword(PW);
    expect(needsRehash(h)).toBe(false);
  });

  it('目标提高后旧哈希需要加固', async () => {
    const h = await hashPassword(PW); // 10000
    process.env.PASSWORD_KDF_ITERATIONS = '50000';
    expect(needsRehash(h)).toBe(true);
  });

  it('目标降低后不会反过来要求"降级"重算', async () => {
    process.env.PASSWORD_KDF_ITERATIONS = '50000';
    const h = await hashPassword(PW); // 50000
    process.env.PASSWORD_KDF_ITERATIONS = '10000';
    expect(needsRehash(h)).toBe(false);
  });

  it('无法识别的格式不当作需要重算（避免每次登录都白算一遍）', () => {
    expect(needsRehash('garbage')).toBe(false);
  });
});

describe('describeHash', () => {
  it('输出格式与强度，不泄露哈希内容', async () => {
    const h = await hashPassword(PW);
    expect(describeHash(h)).toBe('pbkdf2-sha256/10000');
    expect(describeHash('garbage')).toBe('unknown');
  });
});
