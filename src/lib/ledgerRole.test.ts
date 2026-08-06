import { describe, it, expect } from 'vitest';
import { isLedgerRole, roleAtLeast, LEDGER_ROLES } from './ledgerRole';

describe('ledgerRole', () => {
  it('LEDGER_ROLES 覆盖 owner/editor/viewer 且顺序稳定', () => {
    expect(LEDGER_ROLES).toEqual(['owner', 'editor', 'viewer']);
  });

  describe('isLedgerRole', () => {
    it.each(['owner', 'editor', 'viewer'])('识别合法角色 %s', (r) => {
      expect(isLedgerRole(r)).toBe(true);
    });

    it('拒绝越界字符串', () => {
      // 顶级 admin 是 User.role 的值，不是账本角色 —— 别让它意外通过
      expect(isLedgerRole('admin')).toBe(false);
      expect(isLedgerRole('OWNER')).toBe(false); // 大小写敏感
      expect(isLedgerRole('')).toBe(false);
      expect(isLedgerRole('read')).toBe(false);
    });

    it('拒绝非字符串', () => {
      expect(isLedgerRole(null)).toBe(false);
      expect(isLedgerRole(undefined)).toBe(false);
      expect(isLedgerRole(0)).toBe(false);
      expect(isLedgerRole({})).toBe(false);
    });
  });

  describe('roleAtLeast', () => {
    it('owner 满足所有门槛', () => {
      expect(roleAtLeast('owner', 'owner')).toBe(true);
      expect(roleAtLeast('owner', 'editor')).toBe(true);
      expect(roleAtLeast('owner', 'viewer')).toBe(true);
    });

    it('editor 满足 editor / viewer，不满足 owner', () => {
      expect(roleAtLeast('editor', 'owner')).toBe(false);
      expect(roleAtLeast('editor', 'editor')).toBe(true);
      expect(roleAtLeast('editor', 'viewer')).toBe(true);
    });

    it('viewer 只满足 viewer 门槛', () => {
      expect(roleAtLeast('viewer', 'owner')).toBe(false);
      expect(roleAtLeast('viewer', 'editor')).toBe(false);
      expect(roleAtLeast('viewer', 'viewer')).toBe(true);
    });
  });
});
