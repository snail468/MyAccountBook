import { describe, expect, it } from 'vitest';
import {
  computeSettlement,
  computeSettlementSafe,
  SettlementError,
  type NetBalance,
} from './settlement';
import { allocateEvenly } from './splitAllocation';

const moved = (ts: { amountCents: number }[]) => ts.reduce((a, t) => a + t.amountCents, 0);

/** 从「谁垫付了多少 / 谁该承担多少」推出净额，模拟真实数据流 */
function balancesFrom(
  paid: Record<string, number>,
  owed: Record<string, number>,
): NetBalance[] {
  const ids = new Set([...Object.keys(paid), ...Object.keys(owed)]);
  return [...ids].map((id) => ({
    memberId: id,
    name: id,
    netCents: (paid[id] ?? 0) - (owed[id] ?? 0),
  }));
}

describe('computeSettlement', () => {
  it('单人垫付、三人平摊', () => {
    const shares = allocateEvenly(30000, ['a', 'b', 'c']);
    const owed = Object.fromEntries(shares.map((s) => [s.memberId, s.shareCents]));
    const ts = computeSettlement(balancesFrom({ a: 30000 }, owed));
    expect(moved(ts)).toBe(20000);
    // b 和 c 各还 a 10000
    expect(ts).toHaveLength(2);
    expect(ts.every((t) => t.toId === 'a')).toBe(true);
  });

  it('全员已结清时没有转账', () => {
    expect(computeSettlement(balancesFrom({ a: 100 }, { a: 100 }))).toEqual([]);
  });

  it('成员净额全为 0', () => {
    const ts = computeSettlement([
      { memberId: 'a', name: 'a', netCents: 0 },
      { memberId: 'b', name: 'b', netCents: 0 },
    ]);
    expect(ts).toEqual([]);
  });

  it('奇数分摊留下的 1 分尾差也会被结算掉（旧实现会漏）', () => {
    // 100 分 3 人平摊 → 34/33/33；a 垫付
    const shares = allocateEvenly(100, ['a', 'b', 'c']);
    const owed = Object.fromEntries(shares.map((s) => [s.memberId, s.shareCents]));
    const balances = balancesFrom({ a: 100 }, owed);
    const ts = computeSettlement(balances);
    const receivable = balances
      .filter((b) => b.netCents > 0)
      .reduce((s, b) => s + b.netCents, 0);
    expect(moved(ts)).toBe(receivable);
  });

  it('净额恰为 ±1 分的成员不会被忽略', () => {
    const ts = computeSettlement([
      { memberId: 'a', name: 'a', netCents: 1 },
      { memberId: 'b', name: 'b', netCents: -1 },
    ]);
    expect(ts).toHaveLength(1);
    expect(ts[0]).toMatchObject({ fromId: 'b', toId: 'a', amountCents: 1 });
  });

  it('多债务人多债权人：转账总额等于应收总额', () => {
    const balances: NetBalance[] = [
      { memberId: 'a', name: 'a', netCents: 5000 },
      { memberId: 'b', name: 'b', netCents: 3000 },
      { memberId: 'c', name: 'c', netCents: -2000 },
      { memberId: 'd', name: 'd', netCents: -6000 },
    ];
    const ts = computeSettlement(balances);
    expect(moved(ts)).toBe(8000);
    // 笔数不应超过 n-1
    expect(ts.length).toBeLessThanOrEqual(balances.length - 1);
  });

  it('同样输入得到同样清单（幂等）', () => {
    const balances: NetBalance[] = [
      { memberId: 'zoe', name: 'zoe', netCents: 500 },
      { memberId: 'adam', name: 'adam', netCents: 500 },
      { memberId: 'mia', name: 'mia', netCents: -1000 },
    ];
    expect(computeSettlement(balances)).toEqual(computeSettlement(balances));
  });

  it('净额不守恒时抛错，而不是悄悄产出对不上的清单', () => {
    expect(() =>
      computeSettlement([
        { memberId: 'a', name: 'a', netCents: 100 },
        { memberId: 'b', name: 'b', netCents: -99 },
      ]),
    ).toThrow(SettlementError);
  });

  it('随机场景压测：分摊守恒 ⇒ 结算必然守恒', () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let iter = 0; iter < 300; iter++) {
      const n = 2 + Math.floor(rnd() * 8);
      const ids = Array.from({ length: n }, (_, i) => `m${i}`);
      const paid: Record<string, number> = {};
      const owedAcc: Record<string, number> = {};
      const expenseCount = 1 + Math.floor(rnd() * 5);
      for (let e = 0; e < expenseCount; e++) {
        const total = 1 + Math.floor(rnd() * 100000);
        const payer = ids[Math.floor(rnd() * n)];
        paid[payer] = (paid[payer] ?? 0) + total;
        const participants = ids.filter(() => rnd() > 0.3);
        const chosen = participants.length > 0 ? participants : [ids[0]];
        for (const s of allocateEvenly(total, chosen)) {
          owedAcc[s.memberId] = (owedAcc[s.memberId] ?? 0) + s.shareCents;
        }
      }
      const balances = balancesFrom(paid, owedAcc);
      const ts = computeSettlement(balances);
      const receivable = balances
        .filter((b) => b.netCents > 0)
        .reduce((s, b) => s + b.netCents, 0);
      expect(moved(ts)).toBe(receivable);
    }
  });
});

describe('computeSettlementSafe', () => {
  it('数据不守恒时返回空清单和原因，不抛错', () => {
    const r = computeSettlementSafe([
      { memberId: 'a', name: 'a', netCents: 100 },
      { memberId: 'b', name: 'b', netCents: -99 },
    ]);
    expect(r.transfers).toEqual([]);
    expect(r.error).toMatch(/不守恒/);
  });

  it('正常数据与 computeSettlement 一致', () => {
    const balances: NetBalance[] = [
      { memberId: 'a', name: 'a', netCents: 100 },
      { memberId: 'b', name: 'b', netCents: -100 },
    ];
    const r = computeSettlementSafe(balances);
    expect(r.error).toBeNull();
    expect(r.transfers).toEqual(computeSettlement(balances));
  });
});
