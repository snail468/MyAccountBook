'use client';

import { useEffect, useState } from 'react';

type Feature = {
  icon: string;
  title: string;
  desc: string;
};

const FEATURES: Feature[] = [
  { icon: '📒', title: '普通账本', desc: '日常收支随手记，按月 / 类别统计，还能看环比同比趋势。' },
  { icon: '💼', title: '工作账本', desc: '记录工作进项与出项，月底一眼看清回款与垫付。' },
  { icon: '🌸', title: '桃源账本', desc: '把活动奖金、奖励发给大家，流程清晰可追踪。' },
  { icon: '✈️', title: '旅游账本', desc: '和朋友一起记，自动算 AA 分摊与最优结算，还能生成只读分享页。' },
  { icon: '🔁', title: '周期记账', desc: '房租、订阅、工资，配一次自动记，告别重复手填。' },
  { icon: '📈', title: '统计', desc: '月度趋势、类别占比、收入支出对比，账本全貌一目了然。' },
];

/**
 * 新用户引导。落地页（首页 / 邀请页）在注册成功后带 ?welcome=1 时弹出。
 * 关闭时把该 query 参数从地址栏抹掉，避免刷新重复弹出。
 */
export default function OnboardingGuide({
  inviteLedgerName,
}: {
  inviteLedgerName?: string | null;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('welcome') === '1') {
        setShow(true);
      }
    } catch {
      /* 非浏览器环境兜底 */
    }
  }, []);

  function dismiss() {
    setShow(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('welcome');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch {
      /* 忽略 */
    }
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="text-center">
          <div className="text-3xl mb-2">🎉</div>
          <h2 className="text-xl font-semibold">欢迎使用 心愿便利贴</h2>
          <p className="text-sm text-ink-500 mt-1.5">
            一款帮你把每一笔账记清楚的小工具。下面是它能做的事，挑几样先试试就好。
          </p>
        </div>

        {inviteLedgerName && (
          <div className="mt-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-300">
            你已通过邀请加入协作账本「<span className="font-medium">{inviteLedgerName}</span>
            」。先在下方点「开始使用」，再回到邀请页点「接受邀请」即可一起记账。
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 gap-2.5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3 p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
            >
              <span className="text-2xl shrink-0 leading-none">{f.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs text-ink-500 mt-0.5 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={dismiss}
          className="mt-5 w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium active:scale-[0.98] transition"
        >
          开始使用
        </button>
      </div>
    </div>
  );
}
