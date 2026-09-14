'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LedgerManage from '../ledgers/LedgerManage';
import { useToast, useConfirm } from '@/components/ui/Dialog';

type Props = {
  initialLoanEnabled: boolean;
  initialLoanName: string;
  activeLedgers: any[];
  trashedLedgers: any[];
  hasWork: boolean;
  hasTaoyuan: boolean;
};

export default function FeatureManage({
  initialLoanEnabled,
  initialLoanName,
  activeLedgers,
  trashedLedgers,
  hasWork,
  hasTaoyuan,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();

  const [loanEnabled, setLoanEnabled] = useState(initialLoanEnabled);
  const [loanName, setLoanName] = useState(initialLoanName);
  const [saving, setSaving] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);

  async function saveLoanSettings(enabled: boolean, name: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: {
            loanBusiness: {
              enabled,
              customName: name.trim() || '个贷业务',
            },
          },
        }),
      });
      if (!res.ok) throw new Error('保存失败');
      setLoanEnabled(enabled);
      setLoanName(name.trim() || '个贷业务');
      setNameEditing(false);
      toast({ message: enabled ? '个贷业务功能已开启' : '个贷业务功能已停用', kind: 'success' });
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast({ message: err?.message || '保存失败，请重试', kind: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    if (loanEnabled) {
      const ok = await confirm({
        title: '停用个贷业务？',
        body: '停用后仅从首页及导航隐藏入口，已有的单据、客户和档案数据将完好保留。',
        confirmText: '确认停用',
        cancelText: '取消',
        danger: true,
      });
      if (!ok) return;
      await saveLoanSettings(false, loanName);
    } else {
      await saveLoanSettings(true, loanName);
    }
  }

  return (
    <div className="space-y-8">
      {/* 功能一：个贷业务管理 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center text-2xl shrink-0">
              🏠
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold flex items-center gap-2">
                <span>{loanEnabled ? loanName : '个贷业务管理'}</span>
                {loanEnabled ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500 text-white font-normal">
                    已添加
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink-200 dark:bg-ink-700 text-ink-600 dark:text-ink-300 font-normal">
                    未添加
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-500 mt-1">
                专为银行个贷经理打造：房按揭首位、抵押贷、经纪人渠道与卡部工号协同、全周期台账与提成对账。
              </p>
            </div>
          </div>

          <button
            onClick={handleToggle}
            disabled={saving}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition active:scale-95 ${
              loanEnabled
                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800'
                : 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
            }`}
          >
            {saving ? '保存中...' : loanEnabled ? '停用' : '＋ 添加功能'}
          </button>
        </div>

        {loanEnabled && (
          <div className="mt-5 pt-5 border-t border-ink-100 dark:border-ink-700 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">首页与导航显示名称</div>
                <div className="text-xs text-ink-400 mt-0.5">
                  自定义业务管理在首页和顶部栏的入口名称
                </div>
              </div>

              {nameEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={loanName}
                    onChange={(e) => setLoanName(e.target.value)}
                    placeholder="如: 房按揭业务"
                    maxLength={20}
                    className="px-3 py-1.5 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => saveLoanSettings(true, loanName)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setLoanName(initialLoanName);
                      setNameEditing(false);
                    }}
                    className="px-2 py-1.5 text-xs text-ink-400"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 px-3 py-1 rounded-xl bg-blue-50 dark:bg-blue-900/30">
                    {loanName}
                  </span>
                  <button
                    onClick={() => setNameEditing(true)}
                    className="text-xs text-ink-500 hover:text-ink-800 dark:hover:text-ink-200 underline"
                  >
                    修改名称
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Link
                href="/loan"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-medium shadow-sm hover:bg-blue-700 transition"
              >
                进入{loanName}工作台 ›
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 功能二：账本管理 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>📒</span>
              <span>账本管理</span>
            </h2>
            <p className="text-xs text-ink-400 mt-0.5">
              个人收支、工作垫资、游戏活动及旅游记账
            </p>
          </div>
        </div>

        <LedgerManage
          active={activeLedgers}
          trashed={trashedLedgers}
          hasWork={hasWork}
          hasTaoyuan={hasTaoyuan}
        />
      </div>
    </div>
  );
}
