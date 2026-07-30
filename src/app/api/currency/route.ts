import { NextResponse } from 'next/server';
import { getRateDetailed } from '@/lib/currency';
import { requireUser } from '@/lib/session';

// GET /api/currency?base=CNY&quote=USD
//   → 200 { rate, stale: false }
//   → 200 { rate, stale: true, ageHours }  上游暂时不可用，给的是过期缓存
//   → 400 { error, kind: 'UNSUPPORTED_CURRENCY' }  币种不支持，用户该手填
//   → 503 { error, kind: 'NO_DATA' }              网络问题，稍后重试或手填
//
// 原来一律返回 503「汇率暂不可用」，前端没法区分"该重试"和"该手填"。
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const url = new URL(req.url);
  const base = url.searchParams.get('base') || 'CNY';
  const quote = url.searchParams.get('quote') || 'USD';

  if (!/^[A-Za-z]{3}$/.test(base) || !/^[A-Za-z]{3}$/.test(quote)) {
    return NextResponse.json({ error: '币种代码格式不正确' }, { status: 400 });
  }

  const result = await getRateDetailed(base, quote);

  if (result.ok) {
    return NextResponse.json({
      base: base.toUpperCase(),
      quote: quote.toUpperCase(),
      rate: result.rate,
      stale: result.stale,
      ...(result.stale ? { ageHours: result.ageHours } : {}),
    });
  }

  if (result.kind === 'UNSUPPORTED_CURRENCY') {
    return NextResponse.json(
      { error: '不支持这个币种，请手动填写汇率', kind: result.kind },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: '汇率服务暂时不可用，请稍后重试或手动填写', kind: result.kind },
    { status: 503 },
  );
}
