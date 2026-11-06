import { autoRepairExpression, evaluateMathExpression, hasMathOperators } from './calculator';

// 输入元字符串，返回 分（Int）。允许最多两位小数，负数不允许。支持四则运算表达式如 10+20*3
export function yuanToCents(input: string): number | null {
  const s = input.trim();
  if (/^\d+(\.\d{1,2})?$/.test(s)) {
    const [intPart, fracPart = ''] = s.split('.');
    const cents = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2));
    if (!Number.isFinite(cents) || cents < 0) return null;
    return cents;
  }
  if (hasMathOperators(s)) {
    let res = evaluateMathExpression(s);
    if (!res.ok) {
      const repaired = autoRepairExpression(s);
      if (repaired && repaired !== s) {
        res = evaluateMathExpression(repaired);
      }
    }
    if (res.ok) {
      return res.cents;
    }
  }
  return null;
}

export function formatYuan(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const yuan = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  const body = `${yuan.toLocaleString('zh-CN')}.${frac}`;
  if (opts.sign) return neg ? `-${body}` : `+${body}`;
  return neg ? `-${body}` : body;
}
