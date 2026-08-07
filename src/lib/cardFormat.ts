// 银行卡的纯格式化与校验函数。**客户端安全** —— 不 import env / prisma / 任何服务端模块。
//
// 拆出来的原因：cardCrypto.ts 依赖 CARD_SECRET（走 env.ts），而卡片列表界面是
// 客户端组件、只需要打码显示。让客户端组件 import cardCrypto 会把服务端模块拖进
// 客户端包 —— 项目在 PresetPicker → currency → prisma 那条链上已经踩过一次
// （见 2.9 Bug #4），这次一开始就分开。

/** 卡号打码：只留后四位。入库时尾号是明文单独存的，列表不必解密 */
export function maskCardNumber(last4: string): string {
  return `**** **** **** ${last4}`;
}

/**
 * 完整卡号分组显示：每 4 位一空格。**只用于显示** ——
 * 复制走的是未分组的纯数字，别把这里的空格带进剪贴板。
 */
export function groupCardNumber(normalized: string): string {
  return normalized.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * 「复制完整信息」的正文：**只有银行名、持卡人、完整卡号**三项。
 *
 * 刻意不含别名/卡种/备注 —— 这段是拿去发给别人收款的，别名（"工资卡"）和备注
 * 是自己看的私事，多一行就多泄露一点。持卡人没填就不占行。
 * 卡号用未分组的纯数字，对方粘进网银就能用。
 */
export function buildCardShareText(card: {
  bankName: string;
  holder?: string | null;
  number: string;
}): string {
  return [
    `银行：${card.bankName}`,
    card.holder?.trim() ? `持卡人：${card.holder.trim()}` : null,
    `卡号：${normalizeCardNumber(card.number)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** 规整用户输入的卡号：去掉空格和连字符 */
export function normalizeCardNumber(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

/**
 * 卡号格式校验。
 *
 * 刻意**只做长度和字符集检查，不做 Luhn 校验** —— 银行卡号确实普遍满足 Luhn，
 * 但这是个人记账应用的备份用途，用户可能想记一张虚拟卡、储值卡或者干脆记个账号。
 * 为了"格式正确"把用户真实持有的卡拒之门外是本末倒置。
 */
export function isPlausibleCardNumber(normalized: string): boolean {
  return /^\d{8,24}$/.test(normalized);
}

/** 取后四位，供列表显示 */
export function last4Of(normalized: string): string {
  return normalized.slice(-4);
}
