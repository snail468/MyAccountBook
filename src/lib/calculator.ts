/**
 * 安全的数学四则运算解析引擎（支持 + - * / 括号 及全角中文标点归一化）
 * 严格杜绝使用 eval() / Function()，采用调度场算法 (Shunting-Yard) + 逆波兰 (RPN) 求值。
 */

/**
 * 将中英文全角、误触符号统一归一化为标准的 ASCII 数学符号
 */
export function normalizeMathExpression(input: string): string {
  if (!input) return '';
  return input
    .replace(/\s+/g, '') // 移除所有空白
    .replace(/[＋]/g, '+')
    .replace(/[－—–]/g, '-')
    .replace(/[×*xX＊]/g, '*')
    .replace(/[÷/／]/g, '/')
    .replace(/[（【［]/g, '(')
    .replace(/[）】］]/g, ')')
    .replace(/[。，,]/g, '.'); // 中文句号/逗号当作小数点容错
}

/**
 * 判断输入是否包含算符
 */
export function hasMathOperators(input: string): boolean {
  const norm = normalizeMathExpression(input);
  return /[+\-*/()]/.test(norm);
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'op'; value: '+' | '-' | '*' | '/' }
  | { type: 'lparen' }
  | { type: 'rparen' };

/**
 * 词法分词器
 */
function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  const len = expr.length;

  while (i < len) {
    const ch = expr[i];

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }

    // 算符处理（含一元正负号识别）
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      const prev = tokens[tokens.length - 1];
      const isUnary =
        !prev || prev.type === 'op' || prev.type === 'lparen';

      if (isUnary) {
        if (ch === '+') {
          // 正号直接忽略
          i++;
          continue;
        }
        if (ch === '-') {
          // 负号：读取后面的数字，合并为负数
          i++;
          let numStr = '-';
          let hasDot = false;
          while (i < len && (/[\d.]/.test(expr[i]))) {
            if (expr[i] === '.') {
              if (hasDot) return null; // 多个小数点非法
              hasDot = true;
            }
            numStr += expr[i];
            i++;
          }
          if (numStr === '-') return null; // 孤立的负号
          const val = Number(numStr);
          if (Number.isNaN(val)) return null;
          tokens.push({ type: 'num', value: val });
          continue;
        }
        return null; // * 或 / 不能作一元算符
      }

      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    // 数字与小数点
    if (/[\d.]/.test(ch)) {
      let numStr = '';
      let hasDot = false;
      while (i < len && /[\d.]/.test(expr[i])) {
        if (expr[i] === '.') {
          if (hasDot) return null;
          hasDot = true;
        }
        numStr += expr[i];
        i++;
      }
      const val = Number(numStr);
      if (Number.isNaN(val)) return null;
      tokens.push({ type: 'num', value: val });
      continue;
    }

    // 非法字符
    return null;
  }

  return tokens;
}

const PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

/**
 * 调度场算法：将中缀 Token 序列转为逆波兰 RPN
 */
function toRPN(tokens: Token[]): Token[] | null {
  const output: Token[] = [];
  const opStack: (Token & { type: 'op' | 'lparen' })[] = [];

  for (const t of tokens) {
    if (t.type === 'num') {
      output.push(t);
    } else if (t.type === 'op') {
      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1].type === 'op' &&
        PRECEDENCE[(opStack[opStack.length - 1] as { type: 'op'; value: string }).value] >=
          PRECEDENCE[t.value]
      ) {
        output.push(opStack.pop()!);
      }
      opStack.push(t);
    } else if (t.type === 'lparen') {
      opStack.push(t);
    } else if (t.type === 'rparen') {
      let matched = false;
      while (opStack.length > 0) {
        const top = opStack.pop()!;
        if (top.type === 'lparen') {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) return null; // 括号不匹配
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop()!;
    if (top.type === 'lparen') return null; // 未闭合括号
    output.push(top);
  }

  return output;
}

/**
 * 逆波兰求值
 */
function evaluateRPN(rpn: Token[]): { ok: true; val: number } | { ok: false; error: string } {
  const stack: number[] = [];

  for (const t of rpn) {
    if (t.type === 'num') {
      stack.push(t.value);
    } else if (t.type === 'op') {
      if (stack.length < 2) return { ok: false, error: '表达式缺少操作数' };
      const b = stack.pop()!;
      const a = stack.pop()!;
      let res = 0;
      switch (t.value) {
        case '+':
          res = a + b;
          break;
        case '-':
          res = a - b;
          break;
        case '*':
          res = a * b;
          break;
        case '/':
          if (Math.abs(b) < 1e-12) {
            return { ok: false, error: '除数不能为0' };
          }
          res = a / b;
          break;
      }
      if (!Number.isFinite(res)) return { ok: false, error: '计算结果溢出' };
      stack.push(res);
    }
  }

  if (stack.length !== 1) return { ok: false, error: '表达式不完整' };
  return { ok: true, val: stack[0] };
}

/**
 * 智能自动补全未完成的算式（供实时预览使用）
 * 如 "100+" -> "100"，"(20+30" -> "(20+30)"
 */
export function autoRepairExpression(expr: string): string {
  let s = normalizeMathExpression(expr);
  if (!s) return '';

  // 剥除末尾多余的运算符和小数点
  s = s.replace(/[+\-*/.]+$/, '');

  // 补齐末尾缺失的右括号
  let openCount = 0;
  for (const ch of s) {
    if (ch === '(') openCount++;
    if (ch === ')') openCount--;
  }
  while (openCount > 0) {
    s += ')';
    openCount--;
  }

  return s;
}

export type CalcResult =
  | { ok: true; result: number; cents: number; formatted: string }
  | { ok: false; error: string };

export type EvaluateOptions = {
  /** 是否允许为0（例如预算设为0关闭，默认 false，记账金额需大于0） */
  allowZero?: boolean;
  /** 最大金额上限（元），默认 10 亿 */
  maxAmount?: number;
};

/**
 * 解析并计算数学算式的主入口函数
 */
export function evaluateMathExpression(
  rawInput: string,
  opts: EvaluateOptions = {},
): CalcResult {
  const norm = normalizeMathExpression(rawInput);
  if (!norm) {
    return { ok: false, error: '金额不能为空' };
  }

  const tokens = tokenize(norm);
  if (!tokens || tokens.length === 0) {
    return { ok: false, error: '表达式格式不正确' };
  }

  const rpn = toRPN(tokens);
  if (!rpn) {
    return { ok: false, error: '表达式括号不匹配或符号不完整' };
  }

  const evalRes = evaluateRPN(rpn);
  if (!evalRes.ok) {
    return { ok: false, error: evalRes.error };
  }

  const rawVal = evalRes.val;
  if (Number.isNaN(rawVal) || !Number.isFinite(rawVal)) {
    return { ok: false, error: '计算结果不合法' };
  }

  const allowZero = opts.allowZero ?? false;
  const max = opts.maxAmount ?? 1_000_000_000;

  if (rawVal < 0 || (!allowZero && rawVal === 0)) {
    return { ok: false, error: allowZero ? '金额不能小于0' : '金额必须大于0' };
  }

  if (rawVal > max) {
    return { ok: false, error: '金额超出最大允许范围' };
  }

  // 转换为分（采用标准四舍五入精确处理浮点数问题）
  const cents = Math.round(rawVal * 100);
  const roundedVal = cents / 100;
  const formatted = roundedVal.toFixed(2);

  return {
    ok: true,
    result: roundedVal,
    cents,
    formatted,
  };
}

/**
 * 快速求值（用于轻量或实时预览）：如果计算成功返回 roundedVal，否则返回 null
 */
export function tryEvaluate(
  rawInput: string,
  opts: EvaluateOptions = {},
): number | null {
  const res = evaluateMathExpression(rawInput, opts);
  if (res.ok) return res.result;

  // 尝试自动修复末尾挂起算符进行预览求值
  const repaired = autoRepairExpression(rawInput);
  if (repaired && repaired !== rawInput) {
    const repRes = evaluateMathExpression(repaired, opts);
    if (repRes.ok) return repRes.result;
  }

  return null;
}
