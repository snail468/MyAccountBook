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
