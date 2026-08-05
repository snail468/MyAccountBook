import { prisma } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const log = createLogger('currency');

// 币种常量已挪到 lib/currencyList.ts —— 那份是客户端安全的（不 import prisma）。
// 这里 re-export 保持既有服务端调用方不用改。
export { COMMON_CURRENCIES, currencyLabel } from '@/lib/currencyList';
import { COMMON_CURRENCIES } from '@/lib/currencyList';

const CACHE_TTL_HOURS = 12;

const SUPPORTED_CODES = new Set(COMMON_CURRENCIES.map((c) => c.code));

// 用免费无 key 的开源 currency-api（Cloudflare/jsDelivr CDN）
// 参考：https://github.com/fawazahmed0/exchange-api
const API_URL = (base: string) =>
  `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.json`;

/**
 * 拉一个 base 的汇率表并写入 DB 缓存。
 *
 * 原实现把上游返回的全部 ~200 个币种塞进一个 $transaction 里逐条 upsert，
 * 对 SQLite 是一次相当重的写，而其中 90% 的币种这个 App 根本不会用到。
 * 现在只落 COMMON_CURRENCIES 里的 16 个。
 */
type FetchOutcome =
  | { kind: 'ok'; table: Record<string, number> }
  /** 上游明确表示没有这个币种（404） */
  | { kind: 'unknown-currency' }
  /** 网络错误或上游 5xx —— 稍后重试可能就好了 */
  | { kind: 'unavailable' };

async function fetchAndCache(base: string): Promise<FetchOutcome> {
  const res = await fetch(API_URL(base), { cache: 'no-store' });
  // 上游对未知币种返回 404；这和"上游挂了"是两回事，
  // 前者该让用户手填汇率，后者该提示稍后重试
  if (res.status === 404) return { kind: 'unknown-currency' };
  if (!res.ok) return { kind: 'unavailable' };
  const json = (await res.json()) as Record<string, unknown>;
  const table = (json[base.toLowerCase()] ?? {}) as Record<string, number>;

  const rows = Object.entries(table)
    .filter(([code, v]) => typeof v === 'number' && SUPPORTED_CODES.has(code.toUpperCase()))
    .map(([code, rate]) => ({ base, quote: code.toUpperCase(), rate: Number(rate) }));

  if (rows.length > 0) {
    const now = new Date();
    // 缓存写失败不该让汇率查询失败 —— 大不了下次再拉一遍
    try {
      await prisma.$transaction(
        rows.map((r) =>
          prisma.currencyRate.upsert({
            where: { base_quote: { base: r.base, quote: r.quote } },
            create: { ...r, fetchedAt: now },
            update: { rate: r.rate, fetchedAt: now },
          }),
        ),
      );
    } catch (err) {
      log.warn('写缓存失败，本次仍返回实时汇率', {
        base,
        rows: rows.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const upperTable: Record<string, number> = {};
  for (const r of rows) upperTable[r.quote] = r.rate;
  return { kind: 'ok', table: upperTable };
}

export type RateFailureKind =
  /** 上游拉不到，且本地也没有任何缓存 */
  | 'NO_DATA'
  /** 上游没有这个币种 */
  | 'UNSUPPORTED_CURRENCY';

export type RateResult =
  | { ok: true; rate: number; stale: false }
  /** 上游暂时不可用，返回的是过期缓存 —— 可用但要提示用户 */
  | { ok: true; rate: number; stale: true; ageHours: number }
  | { ok: false; kind: RateFailureKind };

/**
 * 1 quote = ? base（例如 1 USD = ? CNY）。
 *
 * 原实现只返回 `number | null`，调用方无法区分"上游挂了但有旧缓存可用"
 * 和"这个币种根本不支持"，前端只能一律显示"汇率暂不可用"。
 */
export async function getRateDetailed(base: string, quote: string): Promise<RateResult> {
  const B = base.toUpperCase();
  const Q = quote.toUpperCase();
  if (B === Q) return { ok: true, rate: 1, stale: false };

  // fawaz API 返回 1 base = rate quote。我们要的是 1 Q = ? B，
  // 所以直接拉 Q 的表，里面的 B 就是答案，不需要做倒数换算。
  const existing = await prisma.currencyRate.findUnique({
    where: { base_quote: { base: Q, quote: B } },
  });
  if (existing && ageHours(existing.fetchedAt) < CACHE_TTL_HOURS) {
    return { ok: true, rate: existing.rate, stale: false };
  }

  let outcome: FetchOutcome;
  try {
    outcome = await fetchAndCache(Q);
  } catch (err) {
    log.warn('上游请求失败', { quote: Q, error: err instanceof Error ? err.message : String(err) });
    outcome = { kind: 'unavailable' };
  }

  if (outcome.kind === 'ok' && typeof outcome.table[B] === 'number') {
    return { ok: true, rate: outcome.table[B], stale: false };
  }

  // 上游能连通、表也拿到了，但里面没有目标币种 → 是币种问题，不是网络问题
  if (outcome.kind === 'unknown-currency' || outcome.kind === 'ok') {
    // 有旧缓存的话仍然优先给出可用汇率
    if (existing) {
      return {
        ok: true,
        rate: existing.rate,
        stale: true,
        ageHours: Math.round(ageHours(existing.fetchedAt)),
      };
    }
    return { ok: false, kind: 'UNSUPPORTED_CURRENCY' };
  }

  // outcome.kind === 'unavailable'：拉不到就用过期缓存兜底，
  // 并明确告诉调用方这是旧数据
  if (existing) {
    return {
      ok: true,
      rate: existing.rate,
      stale: true,
      ageHours: Math.round(ageHours(existing.fetchedAt)),
    };
  }

  return { ok: false, kind: 'NO_DATA' };
}

/** 兼容旧调用方的简化入口 */
export async function getRate(base: string, quote: string): Promise<number | null> {
  const r = await getRateDetailed(base, quote);
  return r.ok ? r.rate : null;
}

function ageHours(d: Date): number {
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

