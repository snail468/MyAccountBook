import { describe, it, expect } from 'vitest';
import {
  evaluateMathExpression,
  normalizeMathExpression,
  tryEvaluate,
  hasMathOperators,
  autoRepairExpression,
} from './calculator';

describe('calculator.ts 运算引擎单测', () => {
  describe('normalizeMathExpression 全半角与常见误触符号归一化', () => {
    it('转换全角加减乘除与括号', () => {
      expect(normalizeMathExpression('100 ＋ 200 － 50 × 2 ÷ 4')).toBe('100+200-50*2/4');
      expect(normalizeMathExpression('（10 ＋ 20）＊ 3')).toBe('(10+20)*3');
      expect(normalizeMathExpression('100／5')).toBe('100/5');
      expect(normalizeMathExpression('20x3X4')).toBe('20*3*4');
    });

    it('中文句号逗号当作小数点容错', () => {
      expect(normalizeMathExpression('12。5+3，8')).toBe('12.5+3.8');
    });
  });

  describe('hasMathOperators 判断', () => {
    it('纯数字与小数返回 false', () => {
      expect(hasMathOperators('100')).toBe(false);
      expect(hasMathOperators('12.34')).toBe(false);
      expect(hasMathOperators('  50  ')).toBe(false);
    });

    it('包含算符返回 true', () => {
      expect(hasMathOperators('10+20')).toBe(true);
      expect(hasMathOperators('50×2')).toBe(true);
      expect(hasMathOperators('(100)')).toBe(true);
      expect(hasMathOperators('10-5')).toBe(true);
    });
  });

  describe('基础四则运算与算符优先级', () => {
    it('加减法', () => {
      expect(evaluateMathExpression('10 + 20')).toMatchObject({ ok: true, result: 30, cents: 3000, formatted: '30.00' });
      expect(evaluateMathExpression('100 - 35.5')).toMatchObject({ ok: true, result: 64.5, cents: 6450, formatted: '64.50' });
    });

    it('乘除法与浮点精度', () => {
      expect(evaluateMathExpression('12 * 5')).toMatchObject({ ok: true, result: 60, cents: 6000, formatted: '60.00' });
      expect(evaluateMathExpression('100 / 4')).toMatchObject({ ok: true, result: 25, cents: 2500, formatted: '25.00' });
      // 0.1 + 0.2 经典浮点数
      expect(evaluateMathExpression('0.1 + 0.2')).toMatchObject({ ok: true, result: 0.3, cents: 30, formatted: '0.30' });
      // 100 / 3 精度截断四舍五入
      expect(evaluateMathExpression('100 / 3')).toMatchObject({ ok: true, result: 33.33, cents: 3333, formatted: '33.33' });
    });

    it('优先级：先乘除后加减', () => {
      expect(evaluateMathExpression('10 + 20 * 3')).toMatchObject({ ok: true, result: 70, cents: 7000 });
      expect(evaluateMathExpression('100 - 40 / 2')).toMatchObject({ ok: true, result: 80, cents: 8000 });
    });

    it('括号改变优先级', () => {
      expect(evaluateMathExpression('(10 + 20) * 3')).toMatchObject({ ok: true, result: 90, cents: 9000 });
      expect(evaluateMathExpression('(100 - 20) / (2 + 2)')).toMatchObject({ ok: true, result: 20, cents: 2000 });
    });

    it('多层嵌套与连续计算', () => {
      expect(evaluateMathExpression('((2 + 3) * 4 - 5) * 2')).toMatchObject({ ok: true, result: 30, cents: 3000 });
      expect(evaluateMathExpression('1 + 2 + 3 + 4 + 5')).toMatchObject({ ok: true, result: 15, cents: 1500 });
    });
  });

  describe('边界与异常情况防御', () => {
    it('除以零拦截', () => {
      const res = evaluateMathExpression('100 / 0');
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toBe('除数不能为0');
    });

    it('结果小于等于0时默认报错（记账必须大于0）', () => {
      const zero = evaluateMathExpression('10 - 10');
      expect(zero.ok).toBe(false);
      if (!zero.ok) expect(zero.error).toContain('必须大于0');

      const neg = evaluateMathExpression('10 - 30');
      expect(neg.ok).toBe(false);
      if (!neg.ok) expect(neg.error).toContain('必须大于0');
    });

    it('allowZero: true 时允许结果为 0', () => {
      const zero = evaluateMathExpression('10 - 10', { allowZero: true });
      expect(zero).toMatchObject({ ok: true, result: 0, cents: 0, formatted: '0.00' });
    });

    it('括号不闭合或非法符号', () => {
      expect(evaluateMathExpression('(10 + 20').ok).toBe(false);
      expect(evaluateMathExpression('10 + * 20').ok).toBe(false);
      expect(evaluateMathExpression('abc').ok).toBe(false);
      expect(evaluateMathExpression('12..34').ok).toBe(false);
    });

    it('纯数字输入直接支持', () => {
      expect(evaluateMathExpression('123.45')).toMatchObject({ ok: true, result: 123.45, cents: 12345 });
    });
  });

  describe('autoRepairExpression 与 tryEvaluate 预览补全', () => {
    it('自动修复末尾多余算符', () => {
      expect(autoRepairExpression('100+')).toBe('100');
      expect(autoRepairExpression('100+20*')).toBe('100+20');
      expect(autoRepairExpression('50.')).toBe('50');
    });

    it('自动补齐未闭合的右括号', () => {
      expect(autoRepairExpression('(100+20')).toBe('(100+20)');
      expect(autoRepairExpression('((10+20)*3')).toBe('((10+20)*3)');
    });

    it('tryEvaluate 实时平滑求值', () => {
      expect(tryEvaluate('50+25')).toBe(75);
      expect(tryEvaluate('50+25+')).toBe(75); // 正在输入加号时仍能看到 75
      expect(tryEvaluate('(20+30')).toBe(50); // 括号尚未闭合时仍能算出 50
      expect(tryEvaluate('invalid')).toBeNull();
    });
  });
});
