import { describe, it, expect } from 'vitest';
import { roleAtLeast, isLedgerRole, type LedgerRole } from '@/lib/ledgerRole';

/**
 * QA 验证（commit 147bd3a）：桃源活动 读/写 权限契约。
 *
 * 路由实际调用：
 *   - GET /api/events            → resolveTaoyuanLedger(userId, ledgerId, 'viewer')
 *   - GET /api/events/[id]       → requireOwnedEvent(id, { minRole: 'viewer' })
 *   - POST /api/events           → resolveTaoyuanLedger(userId, ledgerId)        // 默认 'editor'
 *   - PATCH /api/events/[id]     → requireOwnedEvent(id)                          // 默认 'editor'
 *   - DELETE /api/events/[id]    → requireOwnedEvent(id)                          // 默认 'editor'
 *
 * 这两个助手共用同一道门：`roleAtLeast(rawRole, minRole)`（见 src/lib/ledgerRole.ts）。
 * 本测试断言该门对四种入口点的判定矩阵，等价于验证了路由的权限语义。
 *
 * 覆盖缺口（如实说明）：仓库 vitest 约定不覆盖 prisma/next 运行时的 route handler
 * （见 vitest.config.ts 注释），且当前没有 session/DB mock 脚手架，因此本测试
 * 「未做真实 HTTP/DB 集成测试」。真实路由等价性依赖：
 *   1) 本矩阵的 roleAtLeast 判定；2) 上面对各 handler 的逐文件 Read 核对（已确认传参正确）。
 */
describe('events 路由权限契约 (commit 147bd3a)', () => {
  const viewer: LedgerRole = 'viewer';
  const editor: LedgerRole = 'editor';
  const owner: LedgerRole = 'owner';

  describe('读路径 minRole=viewer → GET /api/events 与 GET /api/events/[id]', () => {
    it('viewer 成员可同步共享桃源账本活动', () => {
      expect(roleAtLeast(viewer, 'viewer')).toBe(true);
    });
    it('viewer 是合法账本角色', () => {
      expect(isLedgerRole(viewer)).toBe(true);
    });
  });

  describe('写路径 默认 minRole=editor → POST / PATCH / DELETE', () => {
    it('viewer 成员被拦截（不能写）', () => {
      expect(roleAtLeast(viewer, 'editor')).toBe(false);
    });
    it('editor / owner 可写', () => {
      expect(roleAtLeast(editor, 'editor')).toBe(true);
      expect(roleAtLeast(owner, 'editor')).toBe(true);
    });
  });

  describe('非成员 / 越界角色 → 路由返回 404 的判定基石', () => {
    it('空或越界角色不满足任何门槛', () => {
      // 路由里 rawRole 为空时走 notFound；等价地，非法字符串先被 isLedgerRole 拒掉
      expect(isLedgerRole(undefined)).toBe(false);
      expect(isLedgerRole('')).toBe(false);
      expect(isLedgerRole('admin')).toBe(false);
    });
  });
});
