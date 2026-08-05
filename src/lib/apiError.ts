import { NextResponse } from 'next/server';

// API 错误响应的统一出口。
//
// 改造前的状况：30 个 route 各自手写 NextResponse.json({ error: '...' }, { status }),
// 同一件事有三种说法 —— '不存在' / '账本不存在' / 'not found'，
// 参数不合法有 '参数错误' / '请求格式错误' / 'bad path'（还混着英文）。
// 状态码也不成体系：账本不存在给 404，账本类型不对给 400。
//
// ---------------------------------------------------------------------------
// 状态码判定规则（新增路由请照这个来）
//
//   401 未认证：没登录，或提交的凭据本身不对（登录失败）
//   403 已认证但不允许：非管理员操作管理员接口、二次验证没过
//   404 路径指向的资源不存在 —— **包含三种情况**：
//         a. 真的没有这条记录
//         b. 记录存在但不属于当前用户
//         c. 记录存在且属于你，但类型不对（比如对普通账本请求 /expenses）
//       b 归到 404 是有意为之：返回 403 等于告诉对方"这个 id 是存在的"，
//       给了枚举他人资源的探针。c 归到 404 是因为对一个普通账本来说，
//       /expenses 这个子资源压根不存在，不是"请求写错了"。
//   400 请求本身不合法：body 解析失败、参数越界、字段冲突
//   409 与当前状态冲突：用户名重复、对未删除的账本请求恢复
//   413 体积超限   415 媒体类型不支持
//
// 唯一有意的例外：/api/auth/password 里"当前密码不正确"返回 403 而不是 401。
// 那个请求的会话是有效的，只是二次验证没过；返回 401 容易让客户端误判成
// 会话失效而把人踢去登录页。
// ---------------------------------------------------------------------------
//
// 响应体保持 { error: string } 不变 —— 所有前端都在读这个字段做提示文案，
// 额外多一个 code：文案随时会改措辞，状态码又太粗（400 涵盖十几种情况），
// 需要一个稳定的机器可读中间层供将来的分支判断与埋点使用。

export const ErrorCode = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  INVALID_ARGUMENT: 'invalid_argument',
  CONFLICT: 'conflict',
  PAYLOAD_TOO_LARGE: 'payload_too_large',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
  TOO_MANY_REQUESTS: 'too_many_requests',
  SERVICE_UNAVAILABLE: 'service_unavailable',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ApiErrorBody = {
  /** 给人看的中文文案，前端直接展示 */
  error: string;
  /** 给程序看的稳定标识，不随文案措辞变化 */
  code: ErrorCode;
};

type ErrorInit = {
  /** 额外响应头，目前只有 429 的 Retry-After 用得上 */
  headers?: HeadersInit;
  /** 额外的响应体字段。给 /api/currency 那种带领域判别式的场景留的口子 */
  extra?: Record<string, unknown>;
};

/** 底层构造器。一般用下面的具名函数，状态码与 code 的搭配已经定好。 */
export function apiError(
  status: number,
  code: ErrorCode,
  message: string,
  init: ErrorInit = {},
): NextResponse<ApiErrorBody> {
  return NextResponse.json(
    { error: message, code, ...(init.extra ?? {}) },
    { status, ...(init.headers ? { headers: init.headers } : {}) },
  );
}

/** 401 —— 没登录，或登录凭据不正确 */
export function unauthorized(message = '未登录'): NextResponse<ApiErrorBody> {
  return apiError(401, ErrorCode.UNAUTHORIZED, message);
}

/** 403 —— 身份有效但不允许做这件事 */
export function forbidden(message = '无权操作'): NextResponse<ApiErrorBody> {
  return apiError(403, ErrorCode.FORBIDDEN, message);
}

/** 404 —— 不存在、不属于你、或类型不对，三者一律用这个，不泄露区别 */
export function notFound(message = '不存在'): NextResponse<ApiErrorBody> {
  return apiError(404, ErrorCode.NOT_FOUND, message);
}

/** 400 —— 请求本身不合法 */
export function badRequest(
  message = '参数错误',
  extra?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return apiError(400, ErrorCode.INVALID_ARGUMENT, message, { extra });
}

/** 409 —— 与当前状态冲突（重名、重复操作） */
export function conflict(message: string): NextResponse<ApiErrorBody> {
  return apiError(409, ErrorCode.CONFLICT, message);
}

/** 413 —— 上传体积超限 */
export function payloadTooLarge(message: string): NextResponse<ApiErrorBody> {
  return apiError(413, ErrorCode.PAYLOAD_TOO_LARGE, message);
}

/** 415 —— 媒体类型不支持 */
export function unsupportedMediaType(message: string): NextResponse<ApiErrorBody> {
  return apiError(415, ErrorCode.UNSUPPORTED_MEDIA_TYPE, message);
}

/** 429 —— 触发限流。retryAfterSeconds 会同时写进 Retry-After 头 */
export function tooManyRequests(
  message: string,
  retryAfterSeconds: number,
): NextResponse<ApiErrorBody> {
  return apiError(429, ErrorCode.TOO_MANY_REQUESTS, message, {
    headers: { 'Retry-After': String(retryAfterSeconds) },
  });
}

/** 503 —— 依赖的上游暂时不可用 */
export function serviceUnavailable(
  message: string,
  extra?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
  return apiError(503, ErrorCode.SERVICE_UNAVAILABLE, message, { extra });
}
