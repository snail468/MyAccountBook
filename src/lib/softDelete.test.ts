import { describe, expect, it } from 'vitest';
import {
  NOT_DELETED,
  RETENTION_DAYS,
  TRASH_TYPES,
  TRASH_TYPE_LABEL,
  cutoffFor,
  daysLeft,
  isTrashType,
} from '@/lib/softDelete';

describe('softDelete', () => {
  describe('NOT_DELETED 常量', () => {
    it('是 { deletedAt: null }，能直接展开进 where', () => {
      expect(NOT_DELETED).toEqual({ deletedAt: null });
    });
  });

  describe('RETENTION_DAYS', () => {
    it('保留期与账本级 ledgerTrash 一致（60 天）', () => {
      expect(RETENTION_DAYS).toBe(60);
    });
  });

  describe('TRASH_TYPES', () => {
    it('刚好覆盖记账类五个模型', () => {
      expect([...TRASH_TYPES].sort()).toEqual(
        ['entry', 'event', 'eventAmount', 'generalEntry', 'tripExpense'].sort(),
      );
    });

    it('每个类型都有中文标签', () => {
      for (const t of TRASH_TYPES) {
        expect(TRASH_TYPE_LABEL[t]).toBeTruthy();
      }
    });
  });

  describe('isTrashType', () => {
    it('接受合法类型', () => {
      expect(isTrashType('entry')).toBe(true);
      expect(isTrashType('event')).toBe(true);
    });

    it('拒绝非法输入 —— 用户可通过 URL 传任意字符串', () => {
      expect(isTrashType('ledger')).toBe(false); // 账本级回收站是另一套
      expect(isTrashType('')).toBe(false);
      expect(isTrashType(null)).toBe(false);
      expect(isTrashType(undefined)).toBe(false);
      expect(isTrashType(123)).toBe(false);
      // 首尾空格必须显式匹配才算合法，防止 URL 注入
      expect(isTrashType(' entry')).toBe(false);
    });
  });

  describe('daysLeft', () => {
    it('刚删除 → 大约 60 天（浮点误差用 ±1 天兜住）', () => {
      const now = new Date('2026-08-01T12:00:00Z');
      const justDeleted = new Date(now);
      const d = daysLeft(justDeleted, now);
      expect(d).toBeGreaterThanOrEqual(59);
      expect(d).toBeLessThanOrEqual(60);
    });

    it('已过 30 天 → 大约 30 天剩余', () => {
      const now = new Date('2026-08-01T00:00:00Z');
      const deletedAt = new Date('2026-07-02T00:00:00Z');
      expect(daysLeft(deletedAt, now)).toBe(30);
    });

    it('超过保留期 → 0（不返回负数，方便直接显示）', () => {
      const now = new Date('2026-12-01T00:00:00Z');
      const deletedAt = new Date('2026-06-01T00:00:00Z');
      expect(daysLeft(deletedAt, now)).toBe(0);
    });

    it('恰好到期 → 0', () => {
      const now = new Date('2026-08-01T00:00:00Z');
      const deletedAt = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      expect(daysLeft(deletedAt, now)).toBe(0);
    });
  });

  describe('cutoffFor', () => {
    it('返回 60 天前的时间戳 —— 早于此的软删记录该被硬删', () => {
      const now = new Date('2026-08-01T00:00:00Z');
      const c = cutoffFor(now);
      const diffDays = (now.getTime() - c.getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBe(60);
    });
  });
});
