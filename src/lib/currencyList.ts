// 纯常量，**不要**在这里 import 任何服务端模块。
//
// 拆出来的原因：这份币种列表被客户端组件用（PresetPicker、TripExpenseModal），
// 而它原来住在 lib/currency.ts 里 —— 那个文件 import 了 prisma。
// 结果 prisma 被拖进客户端模块图，CF 构建给 @prisma/client 换别名时直接暴露：
//   ./src/lib/currency.ts → ./src/app/ledgers/new/PresetPicker.tsx
// 常量与查询逻辑分开后，客户端只拿它需要的那部分。

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

export function currencyLabel(code: string): string {
  return COMMON_CURRENCIES.find((c) => c.code === code)?.label ?? code;
}
