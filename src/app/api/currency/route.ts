import { NextResponse } from 'next/server';
import { getRate } from '@/lib/currency';
import { requireUser } from '@/lib/session';

// GET /api/currency?base=CNY&quote=USD → { rate: 7.14 }
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  const url = new URL(req.url);
  const base = url.searchParams.get('base') || 'CNY';
  const quote = url.searchParams.get('quote') || 'USD';
  const rate = await getRate(base, quote);
  if (rate === null) return NextResponse.json({ error: '汇率暂不可用' }, { status: 503 });
  return NextResponse.json({ base, quote, rate });
}
