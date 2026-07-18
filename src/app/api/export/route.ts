import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { formatYuan } from '@/lib/money';

function csvEscape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const [entries, events] = await Promise.all([
    prisma.entry.findMany({ where: { userId: user.id }, orderBy: { yearMonth: 'asc' } }),
    prisma.event.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
  ]);

  const lines: string[] = [];

  lines.push('# 工作账本');
  lines.push(['月份', '类别', '方向', '金额(元)', '备注', '创建时间'].join(','));
  for (const e of entries) {
    lines.push(
      [
        csvEscape(e.yearMonth),
        csvEscape(e.category),
        csvEscape(e.direction === 'income' ? '进项' : '出项'),
        csvEscape(formatYuan(e.amountCents)),
        csvEscape(e.note),
        csvEscape(e.createdAt.toISOString()),
      ].join(','),
    );
  }

  lines.push('');
  lines.push('# 桃源账本');
  lines.push(
    ['活动', '状态', '截止', '预测(元)', '公示(元)', '到账(元)', '到账时间', '备注', '创建时间'].join(','),
  );
  for (const ev of events) {
    lines.push(
      [
        csvEscape(ev.title),
        csvEscape(ev.status),
        csvEscape(ev.deadline?.toISOString()),
        csvEscape(ev.predictedCents !== null ? formatYuan(ev.predictedCents) : ''),
        csvEscape(ev.announcedCents !== null ? formatYuan(ev.announcedCents) : ''),
        csvEscape(ev.paidCents !== null ? formatYuan(ev.paidCents) : ''),
        csvEscape(ev.paidAt?.toISOString()),
        csvEscape(ev.note),
        csvEscape(ev.createdAt.toISOString()),
      ].join(','),
    );
  }

  const body = '﻿' + lines.join('\n'); // BOM 给 Excel 正确识别 UTF-8
  const filename = `account-book-${user.username}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
