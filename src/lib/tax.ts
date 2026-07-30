// 劳务报酬个税预扣计算，全部以「分」为单位。
//
// 原实现把四档阈值和税率硬编码在 if 链里，改一个数字要动逻辑，也没法为
// 不同账本配不同规则。现在抽成档位表，calcTaxCents 只是遍历它。
//
// 默认规则（现行劳务报酬预扣预缴）：
//   ≤ 800:            免征
//   800 – 4000:       (x - 800) × 20%
//   4000 – 25000:     x × 0.8 × 20% = x × 0.16
//   25000 – 62500:    x × 0.8 × 30% - 2000 = x × 0.24 - 2000
//   > 62500:          x × 0.8 × 40% - 7000 = x × 0.32 - 7000

const YUAN = 100;

export type TaxBracket = {
  /** 该档上界（含），null 表示最高档无上界。单位：分 */
  upToCents: number | null;
  /** 对应用额（应纳税所得额）的比例；作用于 base 计算结果 */
  rate: number;
  /**
   * 计税基数的算法：
   *   'full'    → 直接用收入全额（配合 deductCents 做起征点扣除）
   *   'reduced' → 用收入 × 0.8（劳务报酬的 20% 费用扣除已并入 rate）
   */
  base: 'full' | 'reduced';
  /** 从计税基数里先扣掉的金额（分），如 800 元起征点 */
  deductCents?: number;
  /** 算出税额后再减去的速算扣除数（分） */
  quickDeductCents?: number;
};

export const DEFAULT_TAX_BRACKETS: TaxBracket[] = [
  { upToCents: 800 * YUAN, rate: 0, base: 'full' },
  { upToCents: 4000 * YUAN, rate: 0.2, base: 'full', deductCents: 800 * YUAN },
  { upToCents: 25000 * YUAN, rate: 0.16, base: 'full' },
  { upToCents: 62500 * YUAN, rate: 0.24, base: 'full', quickDeductCents: 2000 * YUAN },
  { upToCents: null, rate: 0.32, base: 'full', quickDeductCents: 7000 * YUAN },
];

export class TaxConfigError extends Error {}

/** 校验档位表：上界必须递增，最后一档必须无上界 */
export function validateBrackets(brackets: TaxBracket[]): void {
  if (brackets.length === 0) throw new TaxConfigError('档位表不能为空');
  let prev = -1;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    const isLast = i === brackets.length - 1;
    if (isLast) {
      if (b.upToCents !== null) throw new TaxConfigError('最后一档必须无上界（upToCents=null）');
    } else {
      if (b.upToCents === null) throw new TaxConfigError('只有最后一档可以无上界');
      if (b.upToCents <= prev) throw new TaxConfigError('档位上界必须严格递增');
      prev = b.upToCents;
    }
    if (!Number.isFinite(b.rate) || b.rate < 0 || b.rate > 1) {
      throw new TaxConfigError(`档位 ${i} 的税率必须在 0..1 之间`);
    }
  }
}

/**
 * 计算应扣税额。
 * @param brackets 自定义档位表；不传用默认规则
 */
export function calcTaxCents(
  incomeCents: number,
  brackets: TaxBracket[] = DEFAULT_TAX_BRACKETS,
): number {
  if (incomeCents <= 0) return 0;

  const bracket =
    brackets.find((b) => b.upToCents === null || incomeCents <= b.upToCents) ??
    brackets[brackets.length - 1];

  const rawBase = bracket.base === 'reduced' ? incomeCents * 0.8 : incomeCents;
  const taxable = Math.max(0, rawBase - (bracket.deductCents ?? 0));
  const tax = taxable * bracket.rate - (bracket.quickDeductCents ?? 0);

  // 税额不可能为负，也不可能超过收入本身
  return Math.min(incomeCents, Math.max(0, Math.round(tax)));
}

export function afterTaxCents(
  incomeCents: number,
  brackets: TaxBracket[] = DEFAULT_TAX_BRACKETS,
): number {
  return incomeCents - calcTaxCents(incomeCents, brackets);
}

/** 解析账本上存的自定义档位表（JSON）。非法或缺失时回落到默认规则。 */
export function parseBrackets(json: string | null | undefined): TaxBracket[] {
  if (!json) return DEFAULT_TAX_BRACKETS;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return DEFAULT_TAX_BRACKETS;
    validateBrackets(parsed as TaxBracket[]);
    return parsed as TaxBracket[];
  } catch {
    return DEFAULT_TAX_BRACKETS;
  }
}
