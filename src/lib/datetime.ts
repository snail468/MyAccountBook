// <input type="datetime-local"> 输入的字符串按本地时区解析，返回 ISO
export function localInputToISO(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// 反向：把 Date 或 ISO 转成 datetime-local 输入用的本地字符串
export function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  return `${y}-${M}-${D}T${h}:${m}`;
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

// 简短显示：yyyy-MM-dd HH:mm
export function formatShort(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
