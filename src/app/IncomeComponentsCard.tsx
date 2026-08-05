'use client';

// 首页顶部"总收入 A"卡片 + 组成设置弹窗。
//
// 组件顺序与字母（B/C/D/E…）在服务端算好，这里只负责渲染 + 处理开关。
// 与老实现的行为差别：
//   * B/C/D/E… 全部可开关（默认全开），A 只累加启用项
//   * 只有 1 个可选来源时（例如只启了工作账本）仍走同一张卡片，
//     不再区分"只有工作"/"只有桃源"的特殊卡片 —— 减少 UI 分支，让"分量"
//     成为总收入的稳定心智模型
// 老"以下奖励不计入 A"区块保留 —— 桃源的非现金/京东卡奖励继续挂这儿。

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Money from '@/components/ui/Money';
import { useAlert } from '@/components/ui/Dialog';

export type IncomeComponent = {
  key: string;
  /** 展示字母：'B', 'C', 'D', 'E'... 由服务端 letterFor 算好 */
  letter: string;
  name: string;
  cents: number;
  enabled: boolean;
};

export default function IncomeComponentsCard({
  components,
  A,
  otherReward,
  countReward,
  textReward,
}: {
  components: IncomeComponent[];
  A: number;
  otherReward: [string, number][];
  countReward: [string, number][];
  textReward: [string, string[]][];
}) {
  const [showSettings, setShowSettings] = useState(false);
  const enabled = components.filter((c) => c.enabled);

  // 公式串 "A = B + C + D"。禁用项从公式里省略 —— 缺字母本身就在暗示"你把它关了"。
  const formula =
    enabled.length === 0
      ? '总收入 A（未启用任何来源）'
      : `总收入 A = ${enabled.map((c) => c.letter).join(' + ')} (元)`;

  return (
    <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-6 mt-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-ink-500">{formula}</div>
        {/* 只有 2+ 来源时才展示设置齿轮 —— 单来源用户配置无意义 */}
        {components.length >= 2 && (
          <button
            onClick={() => setShowSettings(true)}
            className="text-ink-400 text-sm"
            aria-label="总收入组成设置"
          >
            ⚙
          </button>
        )}
      </div>
      <div className="num text-5xl font-bold" style={{ color: '#ff2d87' }}>
        <Money cents={A} />
      </div>

      {enabled.length > 0 && (
        <div className="mt-5 space-y-2 text-sm">
          {enabled.map((c, i) => (
            <ComponentRow
              key={c.key}
              letter={c.letter}
              name={c.name}
              cents={c.cents}
              // 第一项高亮，后续项弱化 —— 老 UI 里 D 就是灰的，保留视觉层级
              dim={i > 1}
            />
          ))}
        </div>
      )}

      {/* 被用户关掉的来源折叠展示，方便"啊我关了什么" —— 但金额压低不喧宾夺主 */}
      {components.some((c) => !c.enabled) && (
        <div className="mt-4 pt-3 border-t border-ink-100 dark:border-ink-700">
          <div className="text-[11px] text-ink-500 mb-1">已排除（不计入 A）</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-400 num">
            {components
              .filter((c) => !c.enabled)
              .map((c) => (
                <span key={c.key} className="line-through">
                  {c.name} <Money cents={c.cents} />
                </span>
              ))}
          </div>
        </div>
      )}

      {(otherReward.length > 0 || countReward.length > 0 || textReward.length > 0) && (
        <div className="mt-4 pt-3 border-t border-ink-100 dark:border-ink-700">
          <div className="text-[11px] text-ink-500 mb-1">以下奖励不计入 A，仅存档展示</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-500 num">
            {otherReward.map(([k, v]) => (
              <span key={k}>
                {rewardLabel(k)} <Money cents={v} />
              </span>
            ))}
            {/* 个数类：显示个数而不是金额，且**不受「隐藏金额」开关影响** ——
                Q币的个数不是钱，藏起来没有意义 */}
            {countReward.map(([k, n]) => (
              <span key={k}>
                {rewardLabel(k)} {n} 个
              </span>
            ))}
            {textReward.map(([k, items]) => (
              <span key={k}>
                {rewardLabel(k)}：{items.join(' / ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsModal components={components} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function ComponentRow({
  letter,
  name,
  cents,
  dim,
}: {
  letter: string;
  name: string;
  cents: number;
  dim?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs text-ink-500">
        {letter}  {name}
      </span>
      <span
        className={`num text-base font-medium ${
          dim ? 'text-ink-400 dark:text-ink-500' : 'text-ink-900 dark:text-ink-100'
        }`}
      >
        <Money cents={cents} />
      </span>
    </div>
  );
}

function SettingsModal({
  components,
  onClose,
}: {
  components: IncomeComponent[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean>>(
    () => Object.fromEntries(components.map((c) => [c.key, c.enabled])),
  );
  const [saving, setSaving] = useState(false);
  const alert = useAlert();

  const dirty = components.some((c) => local[c.key] !== c.enabled);

  async function save() {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      // 只提交与服务端"缺失=启用"约定不一致的项：仅显式 false 才写进去。
      // 老用户 preferences=null 时不会因为一次保存写满一屏 true 冗余键。
      const patch: Record<string, boolean> = {};
      for (const c of components) {
        const nextEnabled = local[c.key];
        if (nextEnabled !== c.enabled) patch[c.key] = nextEnabled;
      }
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incomeComponents: patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      onClose();
      startTransition(() => router.refresh());
    } catch (e) {
      await alert({
        title: '保存失败',
        body: e instanceof Error ? e.message : '未知错误',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-1">总收入 A 的组成</h3>
        <p className="text-xs text-ink-500 mb-4">
          勾选想计入 A 的来源。B/C/D 是固定分量，E 起按普通账本顺序自动分配。
        </p>

        <div className="space-y-2">
          {components.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-3 p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={!!local[c.key]}
                onChange={(e) =>
                  setLocal((prev) => ({ ...prev, [c.key]: e.target.checked }))
                }
                className="w-4 h-4"
              />
              <span className="w-6 text-sm font-semibold text-ink-500">{c.letter}</span>
              <span className="flex-1 min-w-0 text-sm truncate">{c.name}</span>
              <span className="num text-xs text-ink-500 shrink-0">
                <Money cents={c.cents} />
              </span>
            </label>
          ))}
        </div>

        {!Object.values(local).some(Boolean) && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
            至少启用一项，否则 A 将显示为 0。
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-60"
          >
            {saving ? '保存中…' : dirty ? '保存' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}

function rewardLabel(k: string) {
  if (k.startsWith('custom:')) return k.slice('custom:'.length);
  switch (k) {
    case 'qcoin':
      return 'Q币';
    case 'carrotcoin':
      return '萝卜币';
    case 'merch':
      return '周边';
    default:
      return k;
  }
}
