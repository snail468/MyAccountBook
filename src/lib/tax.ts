// 劳务报酬个税分档计算，全部以「分」为单位
// 参考规则：
//   ≤ 800:                 免征
//   800 – 4000:            (x - 800) × 20%
//   4000 – 25000:          x × 0.8 × 20% = x × 0.16
//   25000 – 62500:         x × 0.8 × 30% - 2000 = x × 0.24 - 2000
//   > 62500:               x × 0.8 × 40% - 7000 = x × 0.32 - 7000

const T_800 = 800_00;
const T_4000 = 4000_00;
const T_25000 = 25000_00;
const T_62500 = 62500_00;

export function calcTaxCents(incomeCents: number): number {
  if (incomeCents <= 0) return 0;
  if (incomeCents <= T_800) return 0;
  if (incomeCents <= T_4000) {
    return Math.round((incomeCents - T_800) * 0.2);
  }
  if (incomeCents <= T_25000) {
    return Math.round(incomeCents * 0.16);
  }
  if (incomeCents <= T_62500) {
    return Math.round(incomeCents * 0.24 - 2000_00);
  }
  return Math.round(incomeCents * 0.32 - 7000_00);
}

export function afterTaxCents(incomeCents: number): number {
  return incomeCents - calcTaxCents(incomeCents);
}
