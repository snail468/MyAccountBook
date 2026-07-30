import { describe, expect, it } from 'vitest';
import { assessPassword, PASSWORD_MIN_LENGTH } from './passwordPolicy';

describe('assessPassword', () => {
  it('接受合规密码', () => {
    for (const pw of ['Tr4vel-Ledger-9x', 'meadow kettle 58', '账本记录很开心呀', 'x9K2mQ7pLw']) {
      expect(assessPassword(pw).acceptable, pw).toBe(true);
    }
  });

  it('拒绝过短密码', () => {
    const r = assessPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1) + '');
    expect(r.acceptable).toBe(false);
    expect(r.reason).toMatch(new RegExp(String(PASSWORD_MIN_LENGTH)));
  });

  it('拒绝常见弱口令（大小写不敏感）', () => {
    for (const pw of ['password', 'PASSWORD', 'Password123', '12345678', 'woaini1314']) {
      expect(assessPassword(pw).acceptable, pw).toBe(false);
    }
  });

  it('拒绝包含用户名的密码', () => {
    expect(assessPassword('smoketest99', 'smoketest').acceptable).toBe(false);
    // 大小写不敏感
    expect(assessPassword('SmokeTest99', 'smoketest').acceptable).toBe(false);
  });

  it('用户名过短时不做包含检查，避免误伤', () => {
    // 用户名只有 2 个字符，几乎任何密码都可能含它
    expect(assessPassword('ab-strong-passphrase', 'ab').acceptable).toBe(true);
  });

  it('拒绝单字符重复', () => {
    expect(assessPassword('aaaaaaaa').acceptable).toBe(false);
    expect(assessPassword('11111111').acceptable).toBe(false);
  });

  it('拒绝连续数字/字母（升序和降序）', () => {
    expect(assessPassword('abcdefgh').acceptable).toBe(false);
    expect(assessPassword('hgfedcba').acceptable).toBe(false);
    expect(assessPassword('23456789').acceptable).toBe(false);
    expect(assessPassword('98765432').acceptable).toBe(false);
  });

  it('只是含有连续片段不算连续，不该误伤', () => {
    expect(assessPassword('abc-ledger-99').acceptable).toBe(true);
  });

  it('每个拒绝都带可读原因', () => {
    for (const pw of ['short', 'password', 'aaaaaaaa', 'abcdefgh']) {
      const r = assessPassword(pw);
      expect(r.acceptable).toBe(false);
      expect(r.reason && r.reason.length).toBeGreaterThan(0);
    }
  });
});
