// 结构化日志与错误上报出口。
//
// 现状是散落各处的 console.warn('[db] ...')，线上出问题只能靠 docker logs
// 肉眼捞。这里给一个统一入口：
//   * 开发环境保持人类可读的单行输出
//   * 生产环境输出 JSON，方便 docker logs / loki / CloudWatch 直接解析
//   * 留一个 onError 钩子，将来接 Sentry 之类不用再改调用点
//
// 刻意不引入日志库：一个个人账本项目不值得为此加依赖和配置面。

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * 错误上报钩子。接 Sentry 时在应用启动处赋值一次即可，
 * 所有 logger.error 调用点不用改。
 */
type ErrorReporter = (err: unknown, context: LogFields) => void;
let errorReporter: ErrorReporter | null = null;

export function setErrorReporter(fn: ErrorReporter | null): void {
  errorReporter = fn;
}

/** 把 Error 摊平成可序列化的字段，避免 JSON.stringify(Error) 得到 {} */
function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: err.message,
      // 生产环境也保留栈 —— 这是排障的主要线索，且日志不对外
      stack: err.stack,
    };
  }
  return { errorMessage: String(err) };
}

function emit(level: LogLevel, scope: string, message: string, fields: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  if (isProduction()) {
    sink(
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        scope,
        message,
        ...fields,
      }),
    );
    return;
  }

  // 开发环境：保持原来 [scope] message 的可读形式
  const extra = Object.keys(fields).length > 0 ? fields : '';
  sink(`[${scope}] ${message}`, extra);
}

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  /** 记录并（若已配置）上报错误 */
  error(message: string, err?: unknown, fields?: LogFields): void;
};

/**
 * 建一个带作用域的 logger。
 * @example const log = createLogger('currency'); log.warn('上游不可用', { quote: 'JPY' });
 */
export function createLogger(scope: string): Logger {
  return {
    debug: (message, fields = {}) => emit('debug', scope, message, fields),
    info: (message, fields = {}) => emit('info', scope, message, fields),
    warn: (message, fields = {}) => emit('warn', scope, message, fields),
    error: (message, err, fields = {}) => {
      const merged = err === undefined ? fields : { ...fields, ...serializeError(err) };
      emit('error', scope, message, merged);
      if (errorReporter) {
        try {
          errorReporter(err, { scope, message, ...fields });
        } catch (reportErr) {
          // 上报失败绝不能反过来炸掉业务
          console.error('[logger] 错误上报本身失败:', reportErr);
        }
      }
    },
  };
}
