// 密码强度校验 —— 原来全站只有 zod 的 min(6)，配上没有限流的登录接口
// 等于形同虚设。
//
// 刻意不搞"必须含大写+数字+符号"那套：它逼出来的是 Password1! 这类
// 又难记又好猜的密码。这里只做两件真正有用的事：
//   1. 长度下限（长度是唯一线性提升破解成本的因素）
//   2. 拦掉明显的弱口令与和用户名相关的密码

const MIN_LENGTH = 8;

// 常见弱口令（小写比较）。不求全，只挡最蠢的那批。
const COMMON_PASSWORDS = new Set([
  'password', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'abc12345', 'password1', 'password123', 'iloveyou', 'admin123', 'root1234',
  'letmein1', '11111111', '00000000', '88888888', 'aa123456', 'a1234567',
  'woaini1314', '5201314520', 'qq123456', 'wang123456', 'zhang123456',
]);

export type PasswordAssessment = {
  acceptable: boolean;
  reason?: string;
};

export function assessPassword(password: string, username?: string): PasswordAssessment {
  if (password.length < MIN_LENGTH) {
    return { acceptable: false, reason: `密码至少 ${MIN_LENGTH} 个字符` };
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) {
    return { acceptable: false, reason: '这个密码太常见了，换一个' };
  }

  if (username && username.length >= 3 && lower.includes(username.toLowerCase())) {
    return { acceptable: false, reason: '密码不能包含用户名' };
  }

  // 全同一个字符：aaaaaaaa
  if (/^(.)\1+$/.test(password)) {
    return { acceptable: false, reason: '密码不能是重复的单个字符' };
  }

  // 纯连续数字/字母：12345678、abcdefgh
  if (isSequential(lower)) {
    return { acceptable: false, reason: '密码不能是连续的数字或字母' };
  }

  return { acceptable: true };
}

function isSequential(s: string): boolean {
  if (s.length < 4) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < s.length; i++) {
    const diff = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
    if (!ascending && !descending) return false;
  }
  return ascending || descending;
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH;
