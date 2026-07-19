import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { formatYuan } from '@/lib/money';
import { parseRewardMethods, rewardMethodLabel } from '@/lib/rewardMethod';
import { afterTaxCents } from '@/lib/tax';
import { combineAmounts, sumByStage } from '@/lib/amounts';
import { ensureLegacyMigrated } from '@/lib/legacyMigrate';

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  await ensureLegacyMigrated();

  const [entries, events] = await Promise.all([
    prisma.entry.findMany({
      where: { userId: user.id },
      orderBy: [{ yearMonth: 'asc' }, { occurredAt: 'asc' }],
    }),
    prisma.event.findMany({
      where: { userId: user.id },
      include: { amounts: { orderBy: { occurredAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const lines: string[] = [];

  // 工作账本
  lines.push('# 工作账本');
  lines.push(
    ['月份', '类别', '方向', '金额(元)', '发生时间', '回款时间', '备注', '创建时间'].join(','),
  );
  for (const e of entries) {
    lines.push(
      [
        csvEscape(e.yearMonth),
        csvEscape(e.category),
        csvEscape(e.direction === 'income' ? '进项' : '出项'),
        csvEscape(formatYuan(e.amountCents)),
        csvEscape(e.occurredAt.toISOString()),
        csvEscape(e.refundedAt?.toISOString()),
        csvEscape(e.note),
        csvEscape(e.createdAt.toISOString()),
      ].join(','),
    );
  }

  lines.push('');

  // 桃源账本 —— 活动总览
  lines.push('# 桃源账本 · 活动总览');
  lines.push(
    [
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
    ].join(','),
  );
  const titleById = new Map(events.map((e) => [e.id, e.title]));
  for (const ev of events) {
    const combined = combineAmounts(ev.amounts, {
      predictedCents: ev.predictedCents,
      announcedCents: ev.announcedCents,
      paidCents: ev.paidCents,
      predictedAt: ev.predictedAt,
      announcedAt: ev.announcedAt,
      paidAt: ev.paidAt,
      rewardMethod: ev.rewardMethod,
    });
    const predictedSum = sumByStage(combined, 'predicted');
    const announcedSum = sumByStage(combined, 'announced');
    const paidSum = sumByStage(combined, 'paid');
    const methods = parseRewardMethods(ev.rewardMethods, ev.rewardMethod);

    lines.push(
      [
        csvEscape(ev.title),
        csvEscape(ev.status),
        csvEscape(ev.parentId ? titleById.get(ev.parentId) ?? ev.parentId : ''),
        csvEscape(ev.startAt?.toISOString()),
        csvEscape(ev.deadline?.toISOString()),
        csvEscape(ev.content),
        csvEscape(ev.reward),
        csvEscape(methods.map(rewardMethodLabel).join(' / ')),
        csvEscape(ev.topicTag),
        csvEscape(predictedSum > 0 ? formatYuan(predictedSum) : ''),
        csvEscape(announcedSum > 0 ? formatYuan(announcedSum) : ''),
        csvEscape(announcedSum > 0 ? formatYuan(afterTaxCents(announcedSum)) : ''),
        csvEscape(paidSum > 0 ? formatYuan(paidSum) : ''),
        csvEscape(ev.note),
        csvEscape(ev.createdAt.toISOString()),
      ].join(','),
    );
  }

  lines.push('');

  // 桃源账本 —— 金额明细
  lines.push('# 桃源账本 · 金额明细');
  lines.push(['活动', '阶段', '金额(元)', '发放方式', '备注', '发生时间'].join(','));
  for (const ev of events) {
    for (const a of ev.amounts) {
      lines.push(
        [
          csvEscape(ev.title),
          csvEscape(a.stage),
          csvEscape(formatYuan(a.cents)),
          csvEscape(rewardMethodLabel(a.rewardMethod)),
          csvEscape(a.note),
          csvEscape(a.occurredAt.toISOString()),
        ].join(','),
      );
    }
  }

  const body = '﻿' + lines.join('\n');
  const filename = `account-book-${user.username}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
