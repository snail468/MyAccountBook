import { describe, expect, it } from 'vitest';
import { parseBackup, planImport, rewriteImageOwner, type ParsedBackup } from '@/lib/importData';
import { BACKUP_VERSION } from '@/lib/backupFormat';

const ISO = '2026-07-01T00:00:00.000Z';

function emptyBackup(over: Partial<ParsedBackup> = {}): ParsedBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: ISO,
    user: { id: 'olduser', username: 'old', createdAt: ISO },
    ledgers: [],
    entries: [],
    events: [],
    generalEntries: [],
    tripMembers: [],
    tripExpenses: [],
    ...over,
  };
}

function ledger(id: string, kind: string, over: Record<string, unknown> = {}) {
  return {
    id,
    kind,
    // 名字里不要嵌 id —— 下面有断言检查"原 id 不出现在计划里"
    name: `某账本`,
    icon: null,
    color: null,
    order: 0,
    archived: false,
    deletedAt: null,
    budgetCents: null,
    customCategories: null,
    baseCurrency: null,
    startDate: null,
    endDate: null,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function event(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    title: `活动-${id}`,
    startAt: null,
    content: null,
    rewardMethod: null,
    rewardMethods: null,
    reward: null,
    topicTag: null,
    contentImages: null,
    publishedAt: ISO,
    participate: true,
    deadline: null,
    predictedCents: null,
    announcedCents: null,
    paidCents: null,
    predictedAt: null,
    announcedAt: null,
    paidAt: null,
    status: 'published',
    note: null,
    parentId: null,
    createdAt: ISO,
    updatedAt: ISO,
    amounts: [],
    ...over,
  };
}

/** 确定性 id 生成器，让断言能直接比对 */
function seqIds() {
  let n = 0;
  return () => `new${++n}`;
}

// Phase 2：Entry/Event 都必填 ledgerId。测试默认给一份"work/taoyuan 兜底账本 id"，
// 让不专门测试孤儿分支的 case 不必每个都手动挂 ledgerId 与 built-in 元数据。
// 专门测试孤儿的 case 可以传 existingBuiltinLedgerIds: {} 覆盖掉。
const opts = (over: Record<string, unknown> = {}) => ({
  targetUserId: 'newuser',
  mode: 'merge' as const,
  newId: seqIds(),
  existingBuiltinLedgerIds: { work: 'fallback-work', taoyuan: 'fallback-taoyuan' },
  ...over,
});

describe('parseBackup', () => {
  it('拒绝非对象', () => {
    expect(parseBackup(null)).toMatchObject({ ok: false });
    expect(parseBackup('x')).toMatchObject({ ok: false });
    expect(parseBackup(42)).toMatchObject({ ok: false });
  });

  it('拒绝缺少 version 的文件', () => {
    const r = parseBackup({ ledgers: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('version');
  });

  it('拒绝版本高于本程序的备份 —— 强行导入会静默丢新字段', () => {
    const r = parseBackup(emptyBackup({ version: BACKUP_VERSION + 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('高于本程序支持的');
  });

  it('接受合法的空备份', () => {
    expect(parseBackup(emptyBackup()).ok).toBe(true);
  });

  it('结构不对时指出出错的字段路径', () => {
    const bad = emptyBackup({
      // amountCents 应该是数字
      entries: [
        {
          id: 'e1',
          yearMonth: '2026-07',
          category: '吃饭',
          direction: 'expense',
          amountCents: '一百' as unknown as number,
          note: null,
          occurredAt: ISO,
          refundedAt: null,
          createdAt: ISO,
        },
      ],
    });
    const r = parseBackup(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('entries.0.amountCents');
  });
});

describe('rewriteImageOwner', () => {
  it('把 owner 段换成导入者的 id', () => {
    const raw = JSON.stringify(['/api/uploads/olduser/2026-07/abc.jpg']);
    expect(rewriteImageOwner(raw, 'newuser')).toBe(
      JSON.stringify(['/api/uploads/newuser/2026-07/abc.jpg']),
    );
  });

  it('null 原样返回', () => {
    expect(rewriteImageOwner(null, 'newuser')).toBeNull();
  });

  it('不是 JSON 的老数据原样保留', () => {
    expect(rewriteImageOwner('/api/uploads/olduser/a.jpg', 'newuser')).toBe(
      '/api/uploads/olduser/a.jpg',
    );
  });

  it('非上传路径的 URL 不动', () => {
    const raw = JSON.stringify(['https://example.com/x.jpg']);
    expect(rewriteImageOwner(raw, 'newuser')).toBe(raw);
  });
});

describe('planImport · id 重映射', () => {
  it('所有 id 都换成新的，原 id 不出现在结果里', () => {
    const b = emptyBackup({
      ledgers: [ledger('L1', 'general')],
      generalEntries: [
        {
          id: 'G1',
          ledgerId: 'L1',
          direction: 'expense',
          category: '吃饭',
          amountCents: 100,
          tags: null,
          note: null,
          imageUrls: null,
          occurredAt: ISO,
          createdAt: ISO,
        },
      ],
    });
    const plan = planImport(b, opts());
    expect(plan.ledgers[0].id).toBe('new1');
    expect(plan.generalEntries[0].id).toBe('new2');
    // 外键指向新账本 id，而不是备份里的 L1
    expect(plan.generalEntries[0].ledgerId).toBe('new1');
    expect(JSON.stringify(plan)).not.toContain('L1');
    expect(JSON.stringify(plan)).not.toContain('G1');
  });

  it('所有行都挂到导入者名下', () => {
    // Phase 2 后 Entry.ledgerId 必填，测试要么提供 ledgerId 要么给 work fallback
    const b = emptyBackup({
      ledgers: [ledger('L_work', 'work'), ledger('L1', 'general')],
      entries: [
        {
          id: 'E1',
          ledgerId: 'L_work',
          yearMonth: '2026-07',
          category: '工资',
          direction: 'income',
          amountCents: 100,
          note: null,
          occurredAt: ISO,
          refundedAt: null,
          createdAt: ISO,
        },
      ],
    });
    const plan = planImport(b, opts());
    // 两本账本都以新 id 落到 newuser 名下
    for (const l of plan.ledgers) expect(l.userId).toBe('newuser');
    expect(plan.entries[0].userId).toBe('newuser');
    // Entry 的 ledgerId 也走了 map（指向新建的 work Ledger 的新 id）
    const newWorkId = plan.ledgers.find((l) => l.kind === 'work')!.id;
    expect(plan.entries[0].ledgerId).toBe(newWorkId);
  });
});

describe('planImport · 活动的父子关系', () => {
  it('parentId 跟着重映射', () => {
    const b = emptyBackup({
      events: [event('P'), event('C', { parentId: 'P' })],
    });
    const plan = planImport(b, opts());
    const parent = plan.events.find((e) => e.title === '活动-P')!;
    const child = plan.events.find((e) => e.title === '活动-C')!;
    expect(child.parentId).toBe(parent.id);
  });

  it('父活动不在备份里时摘成顶层，并如实报告', () => {
    const b = emptyBackup({ events: [event('C', { parentId: '不存在的父' })] });
    const plan = planImport(b, opts());
    expect(plan.events[0].parentId).toBeNull();
    expect(plan.skipped.join()).toContain('父活动不在备份里');
  });

  it('活动金额挂到重映射后的活动上', () => {
    const b = emptyBackup({
      events: [
        event('P', {
          amounts: [
            {
              id: 'A1',
              stage: 'paid',
              cents: 500,
              note: null,
              rewardMethod: null,
              occurredAt: ISO,
              createdAt: ISO,
            },
          ],
        }),
      ],
    });
    const plan = planImport(b, opts());
    expect(plan.eventAmounts).toHaveLength(1);
    expect(plan.eventAmounts[0].eventId).toBe(plan.events[0].id);
  });
});

describe('planImport · merge 模式下的内置账本', () => {
  it('已有同类型内置账本时跳过那行元数据，条目重定向到现有账本', () => {
    // Phase 2 后 Entry.ledgerId 必填 —— merge 时旧备份里的 work Ledger 元数据行
    // 会被跳过（不建第二本），但备份里挂在它下面的 Entry 要被重定向到用户现有的
    // work 账本 id 上，否则会孤儿。所以调用方要把 existingBuiltinLedgerIds 传进来。
    const b = emptyBackup({
      ledgers: [ledger('L1', 'work'), ledger('L2', 'general')],
      entries: [
        {
          id: 'E1',
          ledgerId: 'L1',
          yearMonth: '2026-07',
          category: '工资',
          direction: 'income',
          amountCents: 100,
          note: null,
          occurredAt: ISO,
          refundedAt: null,
          createdAt: ISO,
        },
      ],
    });
    const plan = planImport(
      b,
      opts({
        existingBuiltinKinds: new Set(['work']),
        existingBuiltinLedgerIds: { work: 'existing-work-id' },
      }),
    );
    expect(plan.ledgers.map((l) => l.kind)).toEqual(['general']);
    // Entry 被重定向到现有 work 账本
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].ledgerId).toBe('existing-work-id');
    expect(plan.skipped.join()).toContain('内置账本');
  });

  it('没有同类型账本时正常导入', () => {
    const b = emptyBackup({ ledgers: [ledger('L1', 'work')] });
    const plan = planImport(b, opts({ existingBuiltinKinds: new Set<string>() }));
    expect(plan.ledgers).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });
});

describe('planImport · 旅游账本的外键', () => {
  const travelBackup = (over: Record<string, unknown> = {}) =>
    emptyBackup({
      ledgers: [ledger('L1', 'travel')],
      tripMembers: [
        { id: 'M1', ledgerId: 'L1', userId: 'olduser', displayName: '我', createdAt: ISO },
        { id: 'M2', ledgerId: 'L1', userId: null, displayName: '同伴', createdAt: ISO },
      ],
      tripExpenses: [
        {
          id: 'X1',
          ledgerId: 'L1',
          payerId: 'M1',
          title: '住宿',
          category: '住',
          phase: 'during',
          currency: 'JPY',
          amountForeignCents: 10000,
          rate: 0.05,
          amountBaseCents: 500,
          note: null,
          imageUrls: null,
          occurredAt: ISO,
          createdAt: ISO,
          splits: [
            { id: 'S1', memberId: 'M1', shareCents: 250 },
            { id: 'S2', memberId: 'M2', shareCents: 250 },
          ],
        },
      ],
      ...over,
    });

  it('付款人与分摊成员都指向重映射后的成员', () => {
    const plan = planImport(travelBackup(), opts());
    const me = plan.tripMembers.find((m) => m.displayName === '我')!;
    const mate = plan.tripMembers.find((m) => m.displayName === '同伴')!;
    expect(plan.tripExpenses[0].payerId).toBe(me.id);
    expect(plan.tripSplits.map((s) => s.memberId).sort()).toEqual([me.id, mate.id].sort());
    expect(plan.tripSplits.every((s) => s.expenseId === plan.tripExpenses[0].id)).toBe(true);
  });

  it('指向导出者本人的成员关联改指到导入者，指向别人的断开', () => {
    const plan = planImport(travelBackup(), opts());
    expect(plan.tripMembers.find((m) => m.displayName === '我')!.userId).toBe('newuser');
    expect(plan.tripMembers.find((m) => m.displayName === '同伴')!.userId).toBeNull();
  });

  it('付款人不在成员名单里的支出会被丢弃并报告，而不是插入悬空外键', () => {
    const b = travelBackup();
    b.tripExpenses[0].payerId = '查无此人';
    const plan = planImport(b, opts());
    expect(plan.tripExpenses).toHaveLength(0);
    expect(plan.tripSplits).toHaveLength(0);
    expect(plan.skipped.join()).toContain('找不到所属账本或付款人');
  });

  it('分摊成员缺失时只丢那条分摊，并提醒金额会对不上', () => {
    const b = travelBackup();
    b.tripExpenses[0].splits[1].memberId = '查无此人';
    const plan = planImport(b, opts());
    expect(plan.tripExpenses).toHaveLength(1);
    expect(plan.tripSplits).toHaveLength(1);
    expect(plan.skipped.join()).toContain('分摊金额会对不上');
  });

  it('账本被跳过时，属于它的成员和支出一并跳过', () => {
    const b = travelBackup({ ledgers: [] });
    const plan = planImport(b, opts());
    expect(plan.tripMembers).toHaveLength(0);
    expect(plan.tripExpenses).toHaveLength(0);
    expect(plan.skipped.join()).toContain('旅游成员找不到所属账本');
  });
});

describe('planImport · 摘要', () => {
  it('条数统计与实际计划一致', () => {
    const b = emptyBackup({
      ledgers: [ledger('L1', 'general'), ledger('L2', 'travel')],
      events: [event('P')],
    });
    const plan = planImport(b, opts());
    expect(plan.summary).toMatchObject({ 账本: 2, 桃源活动: 1, 工作条目: 0 });
  });

  it('统计带图片引用的记录数', () => {
    const b = emptyBackup({
      events: [event('P', { contentImages: JSON.stringify(['/api/uploads/olduser/a.jpg']) })],
    });
    const plan = planImport(b, opts());
    expect(plan.imageRefCount).toBe(1);
  });
});
