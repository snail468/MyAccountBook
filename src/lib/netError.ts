// 断网 / DNS 不通 / TLS 握手失败 / SW 兜底 → 浏览器 fetch 全部抛 TypeError。
// 把它统一转成一句用户看得懂的话，避免"Failed to fetch"、"NetworkError"
// 这种技术味十足的字面量直出给用户。
//
// 用途：
//   const msg = friendlyFetchError(err) ?? '保存失败：' + defaultReason(err);
//   setError(msg);

export function isNetworkError(err: unknown): boolean {
  // 浏览器实现里 `fetch` 网络失败一律抛 TypeError。
  // navigator.onLine === false 是补强 —— 有些 iOS Safari 版本
  // 网络挂了但 fetch 抛 DOMException 而非 TypeError
  if (err instanceof TypeError) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return false;
}

/** 网络错时返回统一文案；不是网络错返回 null，让调用方走默认逻辑 */
export function friendlyFetchError(err: unknown): string | null {
  if (!isNetworkError(err)) return null;
  return '网络不可用，请检查连接后重试';
}
