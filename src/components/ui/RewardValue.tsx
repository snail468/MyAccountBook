'use client';

// 奖励值的统一渲染：金额走 Money（受「隐藏金额」开关控制），
// 个数与文字直接显示。
//
// 抽出来是因为同一套「金额 / 个数 / 文字」三分支要在活动卡片、阶段详情、
// 首页、统计页各出现一次。散在四处必然出现某一处忘了改，
// 而"某一处仍把 Q币当钱显示"正是这次需求要消灭的东西。

import Money from '@/components/ui/Money';
import { COUNT_UNIT, rewardMethodLabel } from '@/lib/rewardMethod';
import type { NonMoneySummary } from '@/lib/amounts';

/** 单条非金额奖励的文字表示，如「Q币 200 个」「周边：手办 / 海报」 */
export function nonMoneyText(s: NonMoneySummary): string {
  const label = rewardMethodLabel(s.rewardMethod) || '奖励';
  if (s.kind === 'count') {
    return `${label} ${s.total} ${COUNT_UNIT[s.rewardMethod] ?? '个'}`;
  }
  return s.items.length > 0 ? `${label}：${s.items.join(' / ')}` : label;
}

/**
 * 一个阶段的完整展示。
 *
 * 三种情况：
 *   * 有金额 → 显示金额，非金额奖励追加在后面
 *   * 只有非金额奖励 → 只显示它们，**不显示 0.00**
 *     （显示 0 会让人以为这个阶段没发东西）
 *   * 什么都没有 → 交给调用方决定（返回 null）
 */
export default function RewardValue({
  cents,
  hasMoney,
  nonMoney,
  className,
}: {
  cents: number;
  hasMoney: boolean;
  nonMoney: NonMoneySummary[];
  className?: string;
}) {
  if (!hasMoney && nonMoney.length === 0) return null;

  return (
    <span className={className}>
      {hasMoney && <Money cents={cents} />}
      {nonMoney.length > 0 && (
        <span className={hasMoney ? 'ml-1 text-xs text-ink-500' : 'text-xs'}>
          {nonMoney.map(nonMoneyText).join(' · ')}
        </span>
      )}
    </span>
  );
}
