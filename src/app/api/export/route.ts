import { NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/ownership';
import { formatYuan } from '@/lib/money';
import { parseRewardMethods, rewardMethodLabel, rewardValueKind } from '@/lib/rewardMethod';
import { afterTaxCents } from '@/lib/tax';
import { combineAmounts, sumByStage } from '@/lib/amounts';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';
import { collectUserData, type UserBackup } from '@/lib/exportData';

function csvEscape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map(csvEscape).join(',');
}

function parseImageList(v: string | null): string {
  if (!v) return '';
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === 'string').join(' | ');
  } catch {
    /* 老数据可能不是 JSON，原样输出 */
  }
  return v;
}

// ==================== 各账本分区 ====================

function sectionWork(b: UserBackup, lines: string[]) {
  lines.push('# 工作账本');
  lines.push(
    row(['月份', '类别', '方向', '金额(元)', '发生时间', '回款时间', '备注', '创建时间', '状态']),
  );
  for (const e of b.entries) {
    lines.push(
      row([
        e.yearMonth,
        e.category,
        e.direction === 'income' ? '进项' : '出项',
        formatYuan(e.amountCents),
        e.occurredAt,
        e.refundedAt,
        e.note,
        e.createdAt,
        e.deletedAt ? '回收站' : '',
      ]),
    );
  }
}

function sectionTaoyuan(b: UserBackup, lines: string[]) {
  const titleById = new Map(b.events.map((e) => [e.id, e.title]));

  lines.push('# 桃源账本 · 活动总览');
  lines.push(
    row([
      '活动',
      '状态',
      '合并至',
      '开始时间',
      '截止',
      '内容',
      '奖励',
      '发放方式',
      '话题tag',
      '预测合计(元)',
      '公示合计(元)',
      '公示税后(元)',
      '到账合计(元)',
      '备注',
      '创建时间',
    ]),
  );
  for (const ev of b.events) {
    // combineAmounts 需要 Date 类型，备份里已是 ISO 字符串 —— 转回来
    const combined = combineAmounts(
      ev.amounts.map((a) => ({
        id: a.id,
        stage: a.stage,
        cents: a.cents,
        quantity: a.quantity,
        itemDesc: a.itemDesc,
        note: a.note,
        rewardMethod: a.rewardMethod,
        occurredAt: new Date(a.occurredAt),
      })),
      {
        predictedCents: ev.predictedCents,
        announcedCents: ev.announcedCents,
        paidCents: ev.paidCents,
        predictedAt: ev.predictedAt ? new Date(ev.predictedAt) : null,
        announcedAt: ev.announcedAt ? new Date(ev.announcedAt) : null,
        paidAt: ev.paidAt ? new Date(ev.paidAt) : null,
        rewardMethod: ev.rewardMethod,
      },
    );
    const predictedSum = sumByStage(combined, 'predicted');
    const announcedSum = sumByStage(combined, 'announced');
    const paidSum = sumByStage(combined, 'paid');
    const methods = parseRewardMethods(ev.rewardMethods, ev.rewardMethod);

    lines.push(
      row([
        ev.title,
        ev.status,
        ev.parentId ? titleById.get(ev.parentId) ?? ev.parentId : '',
        ev.startAt,
        ev.deadline,
        ev.content,
        ev.reward,
        methods.map(rewardMethodLabel).join(' / '),
        ev.topicTag,
        predictedSum > 0 ? formatYuan(predictedSum) : '',
        announcedSum > 0 ? formatYuan(announcedSum) : '',
        announcedSum > 0 ? formatYuan(afterTaxCents(announcedSum)) : '',
        paidSum > 0 ? formatYuan(paidSum) : '',
        ev.note,
        ev.createdAt,
      ]),
    );
  }

  lines.push('');
  lines.push('# 桃源账本 · 金额明细');
  lines.push(row(['活动', '阶段', '金额(元)', '个数', '奖励内容', '发放方式', '备注', '发生时间']));
  for (const ev of b.events) {
    for (const a of ev.amounts) {
      lines.push(
        row([
          ev.title,
          a.stage,
          // 非金额奖励的金额列留空，而不是写 0.00 —— 写 0 会让人以为发了 0 元。
          // 备份行没有 kind 字段（那是运行时推导的），这里按 rewardMethod 现算
          rewardValueKind(a.rewardMethod) === 'money' ? formatYuan(a.cents) : '',
          a.quantity ?? '',
          a.itemDesc ?? '',
          rewardMethodLabel(a.rewardMethod),
          a.note,
          a.occurredAt,
        ]),
      );
    }
  }
}

function sectionGeneral(b: UserBackup, lines: string[]) {
  const generalLedgers = b.ledgers.filter((l) => l.kind === 'general');
  if (generalLedgers.length === 0) return;
  const nameById = new Map(b.ledgers.map((l) => [l.id, l.name]));

  lines.push('# 普通账本 · 明细');
  lines.push(
    row([
      '账本',
      '方向',
      '类别',
      '金额(元)',
      '标签',
      '备注',
      '图片',
      '发生时间',
      '创建时间',
      '状态',
    ]),
  );
  for (const g of b.generalEntries) {
    lines.push(
      row([
        nameById.get(g.ledgerId) ?? g.ledgerId,
        g.direction === 'income' ? '收入' : '支出',
        g.category,
        formatYuan(g.amountCents),
        g.tags,
        g.note,
        parseImageList(g.imageUrls),
        g.occurredAt,
        g.createdAt,
        g.deletedAt ? '回收站' : '',
      ]),
    );
  }

  lines.push('');
  lines.push('# 普通账本 · 账本设置');
  lines.push(row(['账本', '图标', '月度预算(元)', '状态', '创建时间']));
  for (const l of generalLedgers) {
    lines.push(
      row([
        l.name,
        l.icon,
        l.budgetCents ? formatYuan(l.budgetCents) : '',
        l.deletedAt ? '回收站' : l.archived ? '已归档' : '正常',
        l.createdAt,
      ]),
    );
  }
}

function sectionTravel(b: UserBackup, lines: string[]) {
  const travelLedgers = b.ledgers.filter((l) => l.kind === 'travel');
  if (travelLedgers.length === 0) return;
  const nameById = new Map(b.ledgers.map((l) => [l.id, l.name]));
  const memberById = new Map(b.tripMembers.map((m) => [m.id, m]));
  const baseCurrencyById = new Map(
    b.ledgers.map((l) => [l.id, l.baseCurrency ?? 'CNY']),
  );

  lines.push('# 旅游账本 · 概览');
  lines.push(
    row(['账本', '图标', '本币', '开始日期', '结束日期', '成员数', '支出笔数', '总花费(本币元)', '状态']),
  );
  for (const l of travelLedgers) {
    const members = b.tripMembers.filter((m) => m.ledgerId === l.id);
    const expenses = b.tripExpenses.filter((e) => e.ledgerId === l.id);
    const total = expenses.reduce((a, e) => a + e.amountBaseCents, 0);
    lines.push(
      row([
        l.name,
        l.icon,
        l.baseCurrency,
        l.startDate,
        l.endDate,
        members.length,
        expenses.length,
        formatYuan(total),
        l.deletedAt ? '回收站' : l.archived ? '已归档' : '正常',
      ]),
    );
  }

  lines.push('');
  lines.push('# 旅游账本 · 成员');
  lines.push(row(['账本', '成员', '关联应用用户', '加入时间']));
  for (const m of b.tripMembers) {
    lines.push(
      row([
        nameById.get(m.ledgerId) ?? m.ledgerId,
        m.displayName,
        m.userId ? '是' : '否',
        m.createdAt,
      ]),
    );
  }

  lines.push('');
  lines.push('# 旅游账本 · 支出明细');
  lines.push(
    row([
      '账本',
      '标题',
      '类别',
      '阶段',
      '付款人',
      '原币种',
      '原币金额',
      '汇率',
      '本币金额(元)',
      '分摊明细',
      '备注',
      '图片',
      '发生时间',
      '状态',
    ]),
  );
  for (const e of b.tripExpenses) {
    const shares = e.splits
      .map((s) => {
        const m = memberById.get(s.memberId);
        return `${m?.displayName ?? s.memberId} ${formatYuan(s.shareCents)}`;
      })
      .join(' | ');
    lines.push(
      row([
        nameById.get(e.ledgerId) ?? e.ledgerId,
        e.title,
        e.category,
        e.phase === 'pre' ? '行前' : '行中',
        memberById.get(e.payerId)?.displayName ?? e.payerId,
        e.currency,
        (e.amountForeignCents / 100).toFixed(2),
        e.rate,
        formatYuan(e.amountBaseCents),
        shares,
        e.note,
        parseImageList(e.imageUrls),
        e.occurredAt,
        e.deletedAt ? '回收站' : '',
      ]),
    );
  }

  // 每个旅游账本的净额，方便对账
  lines.push('');
  lines.push('# 旅游账本 · 成员净额（正数=应收，负数=应付；只算未在回收站的支出）');
  lines.push(row(['账本', '成员', '垫付合计(元)', '应承担(元)', '净额(元)', '本币']));
  for (const l of travelLedgers) {
    const members = b.tripMembers.filter((m) => m.ledgerId === l.id);
    // 结算必须只算未软删的 —— 与 /l/[id] 页的口径一致
    const expenses = b.tripExpenses.filter((e) => e.ledgerId === l.id && !e.deletedAt);
    for (const m of members) {
      const paid = expenses
        .filter((e) => e.payerId === m.id)
        .reduce((a, e) => a + e.amountBaseCents, 0);
      const owed = expenses.reduce(
        (a, e) =>
          a + e.splits.filter((s) => s.memberId === m.id).reduce((x, s) => x + s.shareCents, 0),
        0,
      );
      lines.push(
        row([
          l.name,
          m.displayName,
          formatYuan(paid),
          formatYuan(owed),
          formatYuan(paid - owed),
          baseCurrencyById.get(l.id),
        ]),
      );
    }
  }
}

// ==================== 路由 ====================

export async function GET() {
  const user = await requireSessionUser();
  if (user instanceof Response) return user;

  await ensureLegacyMigrated();
  const backup = await collectUserData(user.id);

  const lines: string[] = [];
  const push = (fn: (b: UserBackup, l: string[]) => void) => {
    const before = lines.length;
    fn(backup, lines);
    if (lines.length > before) lines.push('');
  };

  lines.push(`# 心愿便利贴 数据导出 · ${backup.user.username} · ${backup.exportedAt}`);
  lines.push('# 说明：本文件供人阅读/Excel 查看；需要完整还原请使用 JSON 备份（导出备份 → 完整备份 JSON）');
  lines.push('');

  if (backup.entries.length > 0) push(sectionWork);
  if (backup.events.length > 0) push(sectionTaoyuan);
  push(sectionGeneral);
  push(sectionTravel);

  const body = '﻿' + lines.join('\n');
  const filename = `account-book-${backup.user.username}-${backup.exportedAt.slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
