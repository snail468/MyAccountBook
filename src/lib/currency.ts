import { prisma } from '@/lib/db';

// 常用币种列表；base 默认 CNY
export const COMMON_CURRENCIES: { code: string; label: string }[] = [
  { code: 'CNY', label: '人民币 ¥' },
  { code: 'USD', label: '美元 $' },
  { code: 'JPY', label: '日元 ¥' },
  { code: 'EUR', label: '欧元 €' },
  { code: 'GBP', label: '英镑 £' },
  { code: 'HKD', label: '港币 HK$' },
  { code: 'TWD', label: '新台币 NT$' },
  { code: 'KRW', label: '韩元 ₩' },
  { code: 'SGD', label: '新加坡元 S$' },
  { code: 'THB', label: '泰铢 ฿' },
  { code: 'AUD', label: '澳元 A$' },
  { code: 'CAD', label: '加元 C$' },
  { code: 'CHF', label: '瑞士法郎 CHF' },
  { code: 'MYR', label: '马来西亚林吉特 RM' },
  { code: 'IDR', label: '印尼盾 Rp' },
  { code: 'VND', label: '越南盾 ₫' },
];

const CACHE_TTL_HOURS = 12;

// 用免费无 key 的开源 currency-api（Cloudflare/jsDelivr CDN）
// 参考：https://github.com/fawazahmed0/exchange-api
const API_URL = (base: string) =>
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`;

// 拉一个 base 的完整汇率表；写入 DB 缓存
async function fetchAndCache(base: string): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(API_URL(base), { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const baseKey = base.toLowerCase();
    const table = (json[baseKey] ?? {}) as Record<string, number>;
    // 全部写入 DB
    const rows = Object.entries(table)
      .filter(([, v]) => typeof v === 'number')
      .map(([code, rate]) => ({
        base,
        quote: code.toUpperCase(),
        rate: Number(rate),
      }));
    // 用 upsert 批量更新
    await prisma.$transaction(
      rows.map((r) =>
        prisma.currencyRate.upsert({
          where: { base_quote: { base: r.base, quote: r.quote } },
          create: { ...r, fetchedAt: new Date() },
          update: { rate: r.rate, fetchedAt: new Date() },
        }),
      ),
    );
    const upperTable: Record<string, number> = {};
    for (const r of rows) upperTable[r.quote] = r.rate;
    return upperTable;
  } catch {
    return null;
  }
}

// 1 quote = ? base (e.g. 1 USD = ? CNY)
export async function getRate(base: string, quote: string): Promise<number | null> {
  if (base === quote) return 1;
  const B = base.toUpperCase();
  const Q = quote.toUpperCase();

  // 先查缓存（CNY 表：rate 是 1 CNY = rate Q，需要倒推）
  // fawaz API 返回的是 1 base = rate quote。所以：
  //   拉 CNY 的表 → 得到 {USD: 0.14, JPY: 21} 意思是 1 CNY = 0.14 USD
  //   需要 1 USD = ? CNY → 1 / 0.14 = 7.14
  // 更清晰的做法：拉 quote (USD) 的表 → 得到 {CNY: 7.14}
  const existing = await prisma.currencyRate.findUnique({
    where: { base_quote: { base: Q, quote: B } }, // 1 Q = ? B  ← 我们要的方向
  });
  const fresh = existing && ageHours(existing.fetchedAt) < CACHE_TTL_HOURS;
  if (fresh) return existing.rate;

  // 抓 quote 的表（1 quote = ? base 在里面）
  const table = await fetchAndCache(Q);
  if (table && typeof table[B] === 'number') return table[B];

  // 兜底：如果缓存里有但过期了，也先返回
  if (existing) return existing.rate;
  return null;
}

function ageHours(d: Date): number {
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

export function currencyLabel(code: string): string {
  return COMMON_CURRENCIES.find((c) => c.code === code)?.label ?? code;
}
