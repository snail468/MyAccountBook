'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LOAN_TYPES } from './new/NewOrderForm';

export type OrderListItem = {
  id: string;
  orderNo: string;
  loanType: string;
  stage: string;
  status: string;
  borrowerName: string;
  phone: string | null;
  propertyAddress: string | null;
  demandAmountCents: number | null;
  actualAmountCents: number | null;
  initialDescription: string | null;
  brokerNameSnapshot: string | null;
  cardStaffNameSnapshot: string | null;
  cardStaffWorkNoSnapshot: string | null;
  createdAt: string;
  broker?: { id: string; name: string; company: string | null } | null;
  cardStaff?: { id: string; name: string; workNo: string } | null;
  _count?: { logs: number; attachments: number };
};

type Props = {
  orders: OrderListItem[];
  businessName: string;
  stats: {
    totalLoanedCents: number;
    mortgageRatio: string;
    newIntentionCount: number;
    pendingApprovalCount: number;
  };
};

const STAGES = [
  { key: 'all', label: '全部单据' },
  { key: 'intention', label: '意向单' },
  { key: 'scheme', label: '方案中' },
  { key: 'approval', label: '审批中' },
  { key: 'lending', label: '放款履约' },
  { key: 'settled', label: '已结清' },
  { key: 'overdue', label: '逾期' },
];

export default function LoanDashboard({ orders, businessName: _businessName, stats }: Props) {
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = orders.filter((o) => {
    // 阶段过滤
    if (selectedStage !== 'all') {
      if (selectedStage === 'intention' && o.stage !== 'intention' && o.stage !== 'draft') {
        return false;
      } else if (selectedStage !== 'intention' && o.stage !== selectedStage) {
        return false;
      }
    }
    // 类型过滤
    if (selectedType !== 'all' && o.loanType !== selectedType) {
      return false;
    }
    // 搜索过滤
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return (
        o.borrowerName.toLowerCase().includes(q) ||
        o.orderNo.toLowerCase().includes(q) ||
        (o.phone && o.phone.includes(q)) ||
        (o.propertyAddress && o.propertyAddress.toLowerCase().includes(q)) ||
        (o.brokerNameSnapshot && o.brokerNameSnapshot.toLowerCase().includes(q)) ||
        (o.cardStaffWorkNoSnapshot && o.cardStaffWorkNoSnapshot.toLowerCase().includes(q))
      );
    }
    return true;
  });

  function getLoanTypeMeta(key: string) {
    return LOAN_TYPES.find((t) => t.key === key) || { label: key, icon: '📄' };
  }

  function getStageBadge(stage: string) {
    switch (stage) {
      case 'draft':
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300">草稿</span>;
      case 'intention':
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-medium">意向跟进</span>;
      case 'scheme':
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">方案拟定</span>;
      case 'approval':
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">行内审批中</span>;
      case 'lending':
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">已放款履约</span>;
      case 'settled':
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 dark:bg-gray-800 text-gray-500 font-medium">已结清</span>;
      case 'overdue':
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">已逾期</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[11px] bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300">{stage}</span>;
    }
  }

  return (
    <div className="space-y-5">
      {/* 快捷工具栏 */}
      <div className="grid grid-cols-3 gap-2">
        <Link
          href="/loan/brokers"
          className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-center active:scale-95 transition shadow-sm"
        >
          <div className="text-lg">🤝</div>
          <div className="text-xs font-medium mt-1">经纪人档案</div>
        </Link>
        <Link
          href="/loan/card-staff"
          className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-center active:scale-95 transition shadow-sm"
        >
          <div className="text-lg">💳</div>
          <div className="text-xs font-medium mt-1">卡部工号档案</div>
        </Link>
        <Link
          href="/loan/stats"
          className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-center active:scale-95 transition shadow-sm"
        >
          <div className="text-lg">📊</div>
          <div className="text-xs font-medium mt-1">月度对账表</div>
        </Link>
      </div>

      {/* 顶部指标卡片 */}
      <div className="p-4 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md">
        <div className="flex items-center justify-between text-xs text-blue-100 mb-2">
          <span>本月放款概况</span>
          <span>房按揭占比: {stats.mortgageRatio}</span>
        </div>
        <div className="text-2xl font-bold font-mono">
          ¥{(stats.totalLoanedCents / 1000000).toFixed(2)} <span className="text-sm font-normal">万元</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/15 text-xs">
          <div>
            <span className="text-blue-200">本月新增意向：</span>
            <span className="font-semibold">{stats.newIntentionCount} 单</span>
          </div>
          <div>
            <span className="text-blue-200">行内审批中：</span>
            <span className="font-semibold">{stats.pendingApprovalCount} 单</span>
          </div>
        </div>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索客户姓名 / 单号 / 手机 / 房产坐落 / 经纪人 / 卡部工号..."
          className="w-full pl-9 pr-3 py-2.5 rounded-2xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="absolute left-3 top-3 text-xs text-ink-400">🔍</span>
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 text-xs text-ink-400 hover:text-ink-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* 阶段筛选 Tab */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {STAGES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelectedStage(s.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition active:scale-95 ${
              selectedStage === s.key
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* 业务类型二级单选（房按揭首位） */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
        <button
          onClick={() => setSelectedType('all')}
          className={`shrink-0 px-2.5 py-1 rounded-lg transition ${
            selectedType === 'all'
              ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium'
              : 'text-ink-500 hover:text-ink-800'
          }`}
        >
          全部类型
        </button>
        {LOAN_TYPES.map((t, idx) => (
          <button
            key={t.key}
            onClick={() => setSelectedType(t.key)}
            className={`shrink-0 px-2.5 py-1 rounded-lg flex items-center gap-1 transition ${
              selectedType === t.key
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200 dark:border-blue-800'
                : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            <span>{t.icon}</span>
            <span>{idx === 0 ? '房按揭 (优先)' : t.label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* 单据列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-ink-400 text-sm">
          暂无匹配的个贷业务单据
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => {
            const typeMeta = getLoanTypeMeta(order.loanType);
            const isMortgage = order.loanType === 'mortgage';

            return (
              <Link
                key={order.id}
                href={`/loan/${order.id}`}
                className="block p-4 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm hover:border-blue-400 active:scale-[0.99] transition space-y-3"
              >
                {/* 头部：客户名 + 业务类型 + 阶段状态 */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{order.borrowerName}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          isMortgage
                            ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium'
                            : 'bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300'
                        }`}
                      >
                        <span>{typeMeta.icon}</span>
                        <span>{typeMeta.label.split(' ')[0]}</span>
                      </span>
                    </div>
                    <div className="text-xs text-ink-400 font-mono mt-0.5">
                      单号: {order.orderNo}
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {getStageBadge(order.stage)}
                    <span className="text-[10px] text-ink-400">
                      {order.createdAt.slice(5, 10)}
                    </span>
                  </div>
                </div>

                {/* 房产坐落（房按揭首位核心） */}
                {order.propertyAddress && (
                  <div className="text-xs text-ink-600 dark:text-ink-300 bg-ink-50 dark:bg-ink-900/40 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 truncate">
                    <span>🏠</span>
                    <span className="truncate">{order.propertyAddress}</span>
                  </div>
                )}

                {/* 金额要素 */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    <span className="text-ink-400">拟申请：</span>
                    <span className="font-semibold font-mono text-ink-800 dark:text-ink-200">
                      {order.demandAmountCents
                        ? `${(order.demandAmountCents / 1000000).toFixed(2)} 万元`
                        : '待拟定'}
                    </span>
                  </div>

                  {order.actualAmountCents ? (
                    <div>
                      <span className="text-ink-400">实际放款：</span>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {(order.actualAmountCents / 1000000).toFixed(2)} 万元
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* 核心要求展示：经纪人是谁 & 给卡部的谁挂了工号 */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-2 border-t border-ink-100 dark:border-ink-700/60">
                  <div className="flex items-center gap-1 text-ink-500 truncate">
                    <span>🤝 经纪人:</span>
                    <span className="font-medium text-ink-700 dark:text-ink-300 truncate">
                      {order.broker?.name || order.brokerNameSnapshot || '自来访'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-ink-500 truncate">
                    <span>💳 卡部工号:</span>
                    <span className="font-medium font-mono text-blue-600 dark:text-blue-400 truncate">
                      {order.cardStaffWorkNoSnapshot
                        ? `${order.cardStaffNameSnapshot || ''} (${order.cardStaffWorkNoSnapshot})`
                        : '未挂工号'}
                    </span>
                  </div>
                </div>

                {/* 核心要求展示：单子情况描述预览 */}
                {order.initialDescription && (
                  <div className="text-xs text-ink-500 dark:text-ink-400 line-clamp-2 bg-ink-50/60 dark:bg-ink-900/30 p-2.5 rounded-xl leading-relaxed">
                    <span className="font-medium text-ink-700 dark:text-ink-300">情况描述：</span>
                    {order.initialDescription}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* 底部浮动新建按钮 */}
      <div className="fixed bottom-6 left-0 right-0 max-w-md mx-auto px-6 pointer-events-none z-30">
        <Link
          href="/loan/new"
          className="pointer-events-auto flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-blue-600 text-white font-semibold text-sm shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-98 transition"
        >
          <span>＋</span>
          <span>新建意向单 (录入经纪人与卡部工号)</span>
        </Link>
      </div>
    </div>
  );
}
