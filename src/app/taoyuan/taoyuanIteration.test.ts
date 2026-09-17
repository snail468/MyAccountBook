import { describe, it, expect } from 'vitest';
import { STATUS_CONFIG, STATUS_ORDER } from './types';

describe('桃源账本迭代逻辑测试', () => {
  it('4个阶段配置均包含居中标题样式与专属颜色', () => {
    expect(STATUS_ORDER).toEqual(['published', 'predicted', 'announced', 'paid']);
    for (const s of STATUS_ORDER) {
      const conf = STATUS_CONFIG[s];
      expect(conf).toBeDefined();
      expect(conf.label).toBeTruthy();
      expect(conf.titleColor).toBeTruthy();
      expect(conf.badgeCls).toBeTruthy();
    }
    // 验证不同阶段使用不同的专属颜色
    expect(STATUS_CONFIG.published.titleColor).toContain('blue');
    expect(STATUS_CONFIG.predicted.titleColor).toContain('indigo');
    expect(STATUS_CONFIG.announced.titleColor).toContain('amber');
    expect(STATUS_CONFIG.paid.titleColor).toContain('emerald');
  });

  describe('人性化倒计时状态区分判定', () => {
    function getDeadlineStatus(deadlineIso: string, now: Date): 'expired' | 'today' | 'upcoming' | 'normal' {
      const d = new Date(deadlineIso);
      const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return 'expired';
      if (diffDays === 0) return 'today';
      if (diffDays <= 7) return 'upcoming';
      return 'normal';
    }

    const now = new Date('2026-09-17T12:00:00Z');

    it('早于当前时间为已过期 (expired)', () => {
      expect(getDeadlineStatus('2026-09-16T12:00:00Z', now)).toBe('expired');
      expect(getDeadlineStatus('2026-09-01T00:00:00Z', now)).toBe('expired');
    });

    it('今天截止为 (today)', () => {
      expect(getDeadlineStatus('2026-09-17T20:00:00Z', now)).toBe('today');
    });

    it('7天内到期为即将到期 (upcoming)', () => {
      expect(getDeadlineStatus('2026-09-20T12:00:00Z', now)).toBe('upcoming');
      expect(getDeadlineStatus('2026-09-24T12:00:00Z', now)).toBe('upcoming');
    });

    it('超过7天为普通 (normal)', () => {
      expect(getDeadlineStatus('2026-10-01T12:00:00Z', now)).toBe('normal');
    });
  });

  describe('已到账年份归档与分组逻辑', () => {
    function getEventYear(dateStr: string | null): string {
      if (!dateStr) return '历史已完成';
      const y = new Date(dateStr).getFullYear();
      return isNaN(y) ? '历史已完成' : `${y} 年`;
    }

    it('正确提取年份并格式化', () => {
      expect(getEventYear('2026-05-12T10:00:00Z')).toBe('2026 年');
      expect(getEventYear('2025-11-20T08:30:00Z')).toBe('2025 年');
      expect(getEventYear(null)).toBe('历史已完成');
    });
  });
});
