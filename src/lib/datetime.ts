/**
 * 统一时间处理模块（中国标准时间 UTC+8 / Asia/Shanghai）
 *
 * 保证在 Docker 容器、Node.js 服务端（常运行在 UTC 时区）与客户端浏览器之间，
 * 所有业务日期的解析、计算、格式化均采用严格一致的 UTC+8 口径。
 */

const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 提取 Date / 时间戳在 UTC+8（北京时间）下的各时间分量
 */
export function getBeijingParts(d: Date | string | number | null | undefined): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  if (!d) return null;
  const date = typeof d === 'object' && d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return null;

  // 将 UTC 毫秒数平移 8 小时，随后直接通过 UTC 系列方法读取北京时间的分量
  const bj = new Date(date.getTime() + BJ_OFFSET_MS);
  return {
    year: bj.getUTCFullYear(),
    month: bj.getUTCMonth() + 1,
    day: bj.getUTCDate(),
    hour: bj.getUTCHours(),
    minute: bj.getUTCMinutes(),
    second: bj.getUTCSeconds(),
  };
}

/**
 * 将前端表单输入（<input type="datetime-local"> 或 <input type="date"> 或 "YYYY-MM-DD HH:mm"）
 * 按照中国标准时间（UTC+8）解析并转换为标准 ISO 8601 UTC 字符串
 */
export function localInputToISO(v: string | null | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  if (!trimmed) return null;

  // 匹配常见的 YYYY-MM-DD, YYYY-MM-DDTHH:mm, YYYY-MM-DD HH:mm, YYYY-MM-DDTHH:mm:ss 等无时区字符串
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  if (match) {
    const [, y, mo, d, h = '00', mi = '00', s = '00'] = match;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    const hour = Number(h);
    const minute = Number(mi);
    const second = Number(s);
    // 构造 UTC 毫秒并减去 8 小时
    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - BJ_OFFSET_MS;
    return new Date(utcMs).toISOString();
  }

  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * 反向：把 Date 或 ISO 统一转成 datetime-local 输入用的本地字符串（UTC+8 下的 YYYY-MM-DDTHH:mm）
 */
export function toLocalInput(d: Date | string | null | undefined): string {
  const p = getBeijingParts(d);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * 格式化为北京时间简短显示：yyyy-MM-dd HH:mm
 */
export function formatShort(d: Date | string | null | undefined): string {
  const p = getBeijingParts(d);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * 格式化为北京时间日期：yyyy-MM-dd
 */
export function formatDateBeijing(d: Date | string | null | undefined): string {
  const p = getBeijingParts(d);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * 格式化为短日期：MM-dd（用于卡片列表）
 */
export function formatDateShortBeijing(d: Date | string | null | undefined): string {
  const p = getBeijingParts(d);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.month)}-${pad(p.day)}`;
}

/**
 * 格式化为年月：yyyy-MM
 */
export function formatYearMonthBeijing(d: Date | string | null | undefined): string {
  const p = getBeijingParts(d);
  if (!p) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}`;
}

/**
 * 当前北京时间的 yyyy-MM
 */
export function currentBeijingYearMonth(): string {
  return formatYearMonthBeijing(new Date())!;
}

/**
 * 当前北京时间的 yyyy-MM-dd
 */
export function currentBeijingDateStr(): string {
  return formatDateBeijing(new Date())!;
}

/**
 * 计算指定月份（'YYYY-MM'）在 UTC+8 下的起止时间区间
 * start: 当月 1 号 00:00:00 UTC+8 对应的 Date
 * end: 下月 1 号 00:00:00 UTC+8 对应的 Date
 */
export function getBeijingMonthRange(yearMonth: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = yearMonth.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const startMs = Date.UTC(y, m - 1, 1, 0, 0, 0) - BJ_OFFSET_MS;
  const endMs = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0) - BJ_OFFSET_MS;
  return { start: new Date(startMs), end: new Date(endMs) };
}

/**
 * 在 'YYYY-MM' 这个月的页面上记一笔时，"操作时间"该默认成哪一刻。
 *
 * 老实现是无脑 new Date()：8 月打开 3 月的页面补录一笔垫款，落库就是
 * { yearMonth: '2026-03', occurredAt: '2026-08-xx' } —— 明细里按 3 月分组
 * 排在页面最底下，超期天数却按"8 月才发生"算，于是顶部黄色汇总漏掉它。
 * （读侧的兜底见 lib/refundStatus.ts 的 advanceDate()；这里是写侧的源头。）
 *
 * 规则：当月 → 此刻；过去的月份 → 该月最后一天 12:00（月内最晚的可能时间，
 * 与 advanceDate() 取月末的口径一致）；未来的月份 → 该月 1 号 12:00。
 * 用户仍可在表单里改成准确日期，这只是个不再撒谎的默认值。
 */
export function defaultOccurredAtFor(yearMonth: string, now: Date = new Date()): Date {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(yearMonth);
  if (!m) return now;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  if (now.getFullYear() === year && now.getMonth() + 1 === month) return now;
  const isPast = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);
  // new Date(y, 月索引, 0) = 上个月的最后一天，即本月的最后一天
  return isPast ? new Date(year, month, 0, 12, 0) : new Date(year, month - 1, 1, 12, 0);
}
