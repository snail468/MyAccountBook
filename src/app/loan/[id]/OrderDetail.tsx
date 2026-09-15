'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast, useConfirm } from '@/components/ui/Dialog';
import { formatShort, localInputToISO, toLocalInput } from '@/lib/datetime';
import { LOAN_TYPES } from '../new/NewOrderForm';

type OrderData = {
  id: string;
  orderNo: string;
  loanType: string;
  stage: string;
  status: string;
  borrowerName: string;
  phone: string | null;
  idCard: string | null;
  brokerId: string | null;
  brokerNameSnapshot: string | null;
  cardStaffId: string | null;
  cardStaffNameSnapshot: string | null;
  cardStaffWorkNoSnapshot: string | null;
  propertyAddress: string | null;
  propertyArea: number | null;
  propertyPriceCents: number | null;
  downPaymentCents: number | null;
  demandAmountCents: number | null;
  demandTermMonths: number | null;
  bankName: string | null;
  approvedAmountCents: number | null;
  approvedRate: number | null;
  repaymentMethod: string | null;
  actualAmountCents: number | null;
  loanDate: string | null;
  firstRepayDate: string | null;
  monthlyPaymentCents: number | null;
  dueDate: string | null;
  serviceFeeCents: number | null;
  brokerCommissionCents: number | null;
  cardCommissionCents: number | null;
  netIncomeCents: number | null;
  initialDescription: string | null;
  createdAt: string;
  updatedAt: string;
  broker?: { id: string; name: string; phone: string | null; company: string | null; rateNote: string | null } | null;
  cardStaff?: { id: string; name: string; workNo: string | null; phone: string | null; branch: string | null; commissionNote: string | null } | null;
  logs: Array<{ id: string; action: string; content: string; occurredAt: string }>;
};

type Props = {
  initialOrder: OrderData;
  brokers: Array<{ id: string; name: string; company: string | null }>;
  cardStaffs: Array<{ id: string; name: string; workNo: string | null }>;
};

const STAGE_STEPS = [
  { key: 'intention', label: '1. 意向初筛' },
  { key: 'approval', label: '2. 行内审批' },
  { key: 'lending', label: '3. 已放款' },
];

export default function OrderDetail({ initialOrder, brokers: _brokers, cardStaffs: _cardStaffs }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [order, setOrder] = useState<OrderData>(initialOrder);

  // 1. 全局初始情况描述编辑状态
  const [descEditing, setDescEditing] = useState(false);
  const [descText, setDescText] = useState(order.initialDescription || '');
  const [descSaving, setDescSaving] = useState(false);

  // 2. 追加跟进流水状态
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logAction, setLogAction] = useState('跟进记录');
  const [logContent, setLogContent] = useState('');
  const [logSaving, setLogSaving] = useState(false);

  // 3. 推进批复弹窗
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvedWan, setApprovedWan] = useState(
    order.approvedAmountCents
      ? (order.approvedAmountCents / 1000000).toString()
      : order.demandAmountCents
      ? (order.demandAmountCents / 1000000).toString()
      : ''
  );
  const [approvalResult, setApprovalResult] = useState<'approved' | 'rejected'>('approved');

  // 4. 登记放款弹窗
  const initialWan = order.approvedAmountCents ? (order.approvedAmountCents / 1000000).toString() : '';
  const initialFeeYuan = order.serviceFeeCents
    ? (order.serviceFeeCents / 100).toString()
    : order.approvedAmountCents
    ? ((order.approvedAmountCents / 100) * 0.0004).toFixed(2)
    : '';
  const initialBrokerYuan = order.brokerCommissionCents
    ? (order.brokerCommissionCents / 100).toString()
    : order.approvedAmountCents
    ? ((order.approvedAmountCents / 100) * 0.002).toFixed(2)
    : '';

  const [lendModalOpen, setLendModalOpen] = useState(false);
  const [actualWan, setActualWan] = useState(initialWan);
  const [loanDateStr, setLoanDateStr] = useState(() =>
    order.loanDate ? toLocalInput(order.loanDate) : toLocalInput(new Date())
  );
  const [serviceFeeYuan, setServiceFeeYuan] = useState(initialFeeYuan);
  const [brokerCommissionYuan, setBrokerCommissionYuan] = useState(initialBrokerYuan);
  const [cardCommissionYuan, setCardCommissionYuan] = useState(
    order.cardCommissionCents ? (order.cardCommissionCents / 100).toString() : ''
  );
  const [recordWorkExpense, setRecordWorkExpense] = useState(true);

  const [busy, setBusy] = useState(false);

  // 保存初始情况描述
  async function saveDescription() {
    setDescSaving(true);
    try {
      const res = await fetch(`/api/loan/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initialDescription: descText.trim() || null,
          logAction: '更新情况描述',
          logContent: '个贷经理修改了单子全景情况描述',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setOrder(data.order);
      setDescEditing(false);
      toast({ message: '情况描述已保存', kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '保存失败', kind: 'error' });
    } finally {
      setDescSaving(false);
    }
  }

  // 追加跟进流水
  async function handleAddLog(e: React.FormEvent) {
    e.preventDefault();
    if (!logContent.trim()) {
      toast({ message: '请输入跟进内容' });
      return;
    }
    setLogSaving(true);
    try {
      const res = await fetch(`/api/loan/orders/${order.id}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: logAction.trim(),
          content: logContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加日志失败');
      setOrder((prev) => ({
        ...prev,
        logs: [data.log, ...prev.logs],
      }));
      setLogContent('');
      setLogModalOpen(false);
      toast({ message: '跟进动态已追加', kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '操作失败', kind: 'error' });
    } finally {
      setLogSaving(false);
    }
  }

  // 实际放款金额变更时自动按比例计算提成与返佣（支持手工修改）
  function handleActualWanChange(val: string) {
    setActualWan(val);
    const wan = parseFloat(val);
    if (!isNaN(wan) && wan > 0) {
      const amountYuan = wan * 10000;
      // 个人提成 = 放款金额 * 0.04%
      setServiceFeeYuan((amountYuan * 0.0004).toFixed(2));
      // 应付经纪人返佣 = 放款金额 * 0.2%
      setBrokerCommissionYuan((amountYuan * 0.002).toFixed(2));
    }
  }

  // 录入审批结果
  async function submitApproval(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const isApproved = approvalResult === 'approved';
    const amountCents = approvedWan ? Math.round(parseFloat(approvedWan) * 10000 * 100) : null;
    try {
      const res = await fetch(`/api/loan/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: isApproved ? 'approval' : 'rejected',
          status: isApproved ? 'approved' : 'rejected',
          approvedAmountCents: isApproved ? amountCents : null,
          approvedRate: null,
          logAction: isApproved ? '行内审批通过' : '行内审批拒绝',
          logContent: isApproved
            ? `审批通过(已批贷)，批复金额: ${approvedWan}万元`
            : `行内审批拒绝/退件，单据已归入审批拒绝`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '录入审批结果失败');
      setOrder(data.order);
      setApprovalModalOpen(false);
      toast({ message: isApproved ? '审批通过结果已录入' : '已标记为审批拒绝', kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '操作失败', kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // 确认放款
  async function submitLending(e: React.FormEvent) {
    e.preventDefault();
    if (!actualWan) {
      toast({ message: '请输入实际放款金额' });
      return;
    }
    setBusy(true);
    const actualCents = Math.round(parseFloat(actualWan) * 10000 * 100);
    const feeCents = serviceFeeYuan ? Math.round(parseFloat(serviceFeeYuan) * 100) : 0;
    const brokerCents = brokerCommissionYuan ? Math.round(parseFloat(brokerCommissionYuan) * 100) : 0;
    const cardCents = cardCommissionYuan ? Math.round(parseFloat(cardCommissionYuan) * 100) : 0;

    const loanDateISO = localInputToISO(loanDateStr) ?? new Date().toISOString();
    try {
      const res = await fetch(`/api/loan/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'lending',
          status: 'loaned',
          actualAmountCents: actualCents,
          loanDate: loanDateISO,
          monthlyPaymentCents: null,
          serviceFeeCents: feeCents,
          brokerCommissionCents: brokerCents,
          cardCommissionCents: cardCents,
          netIncomeCents: feeCents,
          recordWorkExpense,
          logAction: '放款成功登记',
          logContent: `实际放款金额: ${actualWan}万元，放款时间: ${formatShort(loanDateISO)}，个人提成: ¥${serviceFeeYuan || '0'}，应付经纪人返佣: ¥${brokerCommissionYuan || '0'}${recordWorkExpense && brokerCents > 0 ? '（已同步记录工作账本房贷垫款）' : ''}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '放款登记失败');
      setOrder(data.order);
      setLendModalOpen(false);
      toast({ message: '放款登记成功，进入已放款状态', kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '操作失败', kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // 删除单条流水日志（二次确认）
  async function handleDeleteLog(logId: string, actionName: string) {
    const ok = await confirm({
      title: '确认删除该条流水记录？',
      body: `确定要删除流水记录【${actionName}】吗？删除后不可恢复。`,
      confirmText: '确认删除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/loan/orders/${order.id}/logs?logId=${logId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || '删除失败');
      }
      setOrder((prev) => ({
        ...prev,
        logs: prev.logs.filter((l) => l.id !== logId),
      }));
      toast({ message: '跟进流水记录已删除', kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '删除失败', kind: 'error' });
    }
  }

  // 打开录入审批结果弹窗（默认带入拟申请金额，支持手动修改）
  function handleOpenApprovalModal() {
    if (!approvedWan && order.demandAmountCents) {
      setApprovedWan((order.demandAmountCents / 1000000).toString());
    }
    setApprovalModalOpen(true);
  }

  // 打开确认放款弹窗（放款时间默认为操作当时的时间）
  function handleOpenLendModal() {
    setLoanDateStr(toLocalInput(new Date()));
    if (!actualWan && order.approvedAmountCents) {
      handleActualWanChange((order.approvedAmountCents / 1000000).toString());
    }
    setLendModalOpen(true);
  }

  function getStageName(stage: string) {
    switch (stage) {
      case 'intention':
      case 'draft':
        return '意向初筛';
      case 'approval':
        return '行内审批';
      case 'lending':
        return '已放款';
      case 'rejected':
        return '审批拒绝';
      default:
        return stage;
    }
  }

  // 阶段回退到上一阶段
  async function handleRollbackStage(explicitTarget?: string) {
    const current = order.stage;
    const target = explicitTarget || (current === 'lending' ? 'approval' : current === 'approval' ? 'intention' : 'approval');

    let targetLabel = '上一阶段';
    let bodyText = '';

    if (target === 'approval') {
      targetLabel = '行内审批';
      if (current === 'lending') {
        bodyText = '确定要将业务阶段从【已放款】回退到【行内审批】吗？\n\n回退后将重置实际放款金额与相关提成收益数据。若曾同步记录工作账本垫款，请前往工作账本核对或删除该笔垫款。';
      } else if (current === 'rejected') {
        bodyText = '确定要解除【审批拒绝】状态，回退到【行内审批】重新推进批贷吗？';
      }
    } else if (target === 'intention') {
      targetLabel = '意向初筛';
      if (current === 'approval') {
        bodyText = '确定要将业务阶段从【行内审批】回退到【意向初筛】吗？\n\n回退后将重置已录入的行内批贷额度与执行利率。';
      } else if (current === 'rejected') {
        bodyText = '确定要将此单据从【审批拒绝】状态回退到【意向初筛】重新制定方案吗？';
      }
    }

    const ok = await confirm({
      title: `确认回退到【${targetLabel}】阶段？`,
      body: bodyText || `确定要将业务阶段回退至【${targetLabel}】吗？`,
      confirmText: '确认回退',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      const updatePayload: any = {
        stage: target,
        status: target === 'approval' ? 'approved' : 'intention',
        logAction: '阶段回退',
        logContent: `个贷经理将业务阶段从【${getStageName(current)}】回退至【${targetLabel}】`,
      };

      if (current === 'lending') {
        updatePayload.actualAmountCents = null;
        updatePayload.loanDate = null;
        updatePayload.firstRepayDate = null;
        updatePayload.dueDate = null;
        updatePayload.monthlyPaymentCents = null;
        updatePayload.serviceFeeCents = null;
        updatePayload.brokerCommissionCents = null;
        updatePayload.cardCommissionCents = null;
        updatePayload.netIncomeCents = null;
      } else if (target === 'intention') {
        updatePayload.approvedAmountCents = null;
        updatePayload.approvedRate = null;
      }

      const res = await fetch(`/api/loan/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '回退阶段失败');
      setOrder(data.order);

      // 同步重置前端表单局部状态
      if (current === 'lending') {
        setActualWan(data.order.approvedAmountCents ? (data.order.approvedAmountCents / 1000000).toString() : '');
      } else if (target === 'intention') {
        setApprovedWan('');
        setApprovalResult('approved');
      }

      toast({ message: `已成功回退到【${targetLabel}】阶段`, kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '回退操作失败', kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  // 删除单据
  async function handleDeleteOrder() {
    const ok = await confirm({
      title: '删除此个贷单据？',
      body: '确定要删除此单据吗？删除后进入软删除状态。',
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/loan/orders/${order.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ message: '单据已删除', kind: 'success' });
      router.push('/loan');
    } catch {
      toast({ message: '删除失败，请重试', kind: 'error' });
    }
  }

  const typeMeta = LOAN_TYPES.find((t) => t.key === order.loanType) || { label: order.loanType, icon: '📄' };
  const stageRank: Record<string, number> = {
    draft: 0,
    intention: 0,
    scheme: 0,
    approval: 1,
    lending: 2,
    settled: 2,
    rejected: -1,
  };
  const currentStageIdx = stageRank[order.stage] ?? 0;
  const canRollback = order.stage !== 'intention' && order.stage !== 'draft';
  const prevStageLabel = order.stage === 'lending' ? '行内审批' : order.stage === 'approval' ? '意向初筛' : '上一阶段';

  return (
    <div className="space-y-6">
      {/* 1. 顶部全景业务状态与全周期 Timeline */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold">{order.borrowerName}</span>
              <span className="text-xs px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold flex items-center gap-1">
                <span>{typeMeta.icon}</span>
                <span>{typeMeta.label}</span>
              </span>
            </div>
            <div className="text-xs text-ink-400 font-mono mt-1">
              单号: {order.orderNo} · 电话: {order.phone || '未填'}
            </div>
          </div>

          <button
            onClick={handleDeleteOrder}
            className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg border border-red-200 dark:border-red-900"
          >
            删除
          </button>
        </div>

        {/* 阶段进度条 */}
        <div className="pt-2">
          {order.stage === 'rejected' ? (
            <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🚫</span>
                <div>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 block">当前阶段：行内审批拒绝</span>
                  <span className="text-[10px] text-red-500/70">已退件</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleRollbackStage('approval')}
                  disabled={busy}
                  className="text-xs text-red-700 dark:text-red-300 px-2.5 py-1 rounded-xl bg-white dark:bg-ink-800 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/40 active:scale-95 transition font-medium disabled:opacity-50"
                >
                  ↩ 回退至行内审批
                </button>
                <button
                  type="button"
                  onClick={() => handleRollbackStage('intention')}
                  disabled={busy}
                  className="text-xs text-ink-600 dark:text-ink-300 px-2.5 py-1 rounded-xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-900 active:scale-95 transition font-medium disabled:opacity-50"
                >
                  ↩ 回退至意向初筛
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
              {STAGE_STEPS.map((step, idx) => {
                const isPassed = currentStageIdx >= idx;
                const isCurrent = currentStageIdx === idx;
                return (
                  <div key={step.key} className="flex-1 min-w-[60px] text-center">
                    <div
                      className={`h-2 rounded-full mb-1.5 transition ${
                        isCurrent
                          ? 'bg-blue-600'
                          : isPassed
                          ? 'bg-blue-300 dark:bg-blue-700'
                          : 'bg-ink-100 dark:bg-ink-700'
                      }`}
                    />
                    <span
                      className={`text-[11px] block truncate ${
                        isCurrent
                          ? 'font-bold text-blue-600 dark:text-blue-400'
                          : isPassed
                          ? 'text-ink-700 dark:text-ink-300 font-medium'
                          : 'text-ink-400'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 2. 核心要求 1：展示经纪人是谁 & 给卡部的谁挂了工号 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>🤝</span>
          <span>渠道经纪人 & 卡部工号挂号</span>
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {/* 经纪人信息卡 */}
          <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/60 space-y-1">
            <div className="text-xs text-amber-800 dark:text-amber-300 font-medium">
              推单经纪人
            </div>
            <div className="text-base font-bold text-amber-950 dark:text-amber-100">
              {order.broker?.name || order.brokerNameSnapshot || '无 / 客户自来访'}
            </div>
            {order.broker?.company && (
              <div className="text-xs text-ink-500 truncate">{order.broker.company}</div>
            )}
            {order.broker?.phone && (
              <div className="text-xs text-ink-500">📞 {order.broker.phone}</div>
            )}
          </div>

          {/* 卡部工号信息卡 */}
          <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/60 space-y-1">
            <div className="text-xs text-blue-800 dark:text-blue-300 font-medium">
              卡部挂工号
            </div>
            <div className="text-base font-bold text-blue-950 dark:text-blue-100">
              {order.cardStaff?.name || order.cardStaffNameSnapshot || '无卡部协同'}
            </div>
            <div className="text-xs text-ink-600 dark:text-ink-300 font-mono truncate">
              {order.cardStaffWorkNoSnapshot ? `工号: ${order.cardStaffWorkNoSnapshot}` : '未挂工号'}
            </div>
            {order.cardStaff?.branch && (
              <div className="text-[11px] text-ink-400 truncate">{order.cardStaff.branch}</div>
            )}
            {order.cardStaff?.phone && (
              <div className="text-xs text-ink-500">📞 {order.cardStaff.phone}</div>
            )}
          </div>
        </div>
      </div>

      {/* 3. 核心要求 2：双重描述之一 —— 贯穿全流程的初始静态全局情况描述 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span>📝</span>
            <span>单子基本情况描述 (静态全景说明)</span>
          </h3>
          {!descEditing && (
            <button
              onClick={() => setDescEditing(true)}
              className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
            >
              编辑修改
            </button>
          )}
        </div>

        {descEditing ? (
          <div className="space-y-2.5">
            <textarea
              rows={5}
              value={descText}
              onChange={(e) => setDescText(e.target.value)}
              placeholder="详细编辑单子全貌、客户资产、资金需求、首付及征信情况..."
              className="w-full px-3.5 py-2.5 rounded-2xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDescText(order.initialDescription || '');
                  setDescEditing(false);
                }}
                className="px-3 py-1.5 text-xs text-ink-500"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveDescription}
                disabled={descSaving}
                className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {descSaving ? '保存中...' : '保存修改'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-ink-50/70 dark:bg-ink-900/40 text-sm leading-relaxed text-ink-700 dark:text-ink-200 whitespace-pre-wrap">
            {order.initialDescription || (
              <span className="text-ink-400 italic">暂无文字情况描述，点击右上角补充</span>
            )}
          </div>
        )}
      </div>

      {/* 4. 房产要素与方案数据卡片 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-3 text-sm">
        <h3 className="font-semibold flex items-center gap-2">
          <span>📊</span>
          <span>进件要素与放款履约</span>
        </h3>

        <div className="space-y-2 divide-y divide-ink-100 dark:divide-ink-700/60">
          {order.propertyAddress && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-ink-500">房屋坐落小区</span>
              <span className="font-medium text-right max-w-[200px] truncate">{order.propertyAddress}</span>
            </div>
          )}
          {order.propertyArea && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-ink-500">建筑面积</span>
              <span className="font-medium">{order.propertyArea} ㎡</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <span className="text-ink-500">拟申请资金</span>
            <span className="font-semibold font-mono">
              {order.demandAmountCents ? `${(order.demandAmountCents / 1000000).toFixed(2)} 万元` : '未定'}
            </span>
          </div>
          {order.approvedAmountCents ? (
            <div className="flex items-center justify-between pt-2">
              <span className="text-ink-500">批贷额度</span>
              <span className="font-semibold font-mono text-blue-600 dark:text-blue-400">
                {(order.approvedAmountCents / 1000000).toFixed(2)} 万元
              </span>
            </div>
          ) : null}
          {order.actualAmountCents ? (
            <div className="flex items-center justify-between pt-2">
              <span className="text-ink-500">实际放款金额</span>
              <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {(order.actualAmountCents / 1000000).toFixed(2)} 万元
              </span>
            </div>
          ) : null}
          {order.loanDate ? (
            <div className="flex items-center justify-between pt-2">
              <span className="text-ink-500">放款时间</span>
              <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">
                {formatShort(order.loanDate)}
              </span>
            </div>
          ) : null}
          {order.monthlyPaymentCents ? (
            <div className="flex items-center justify-between pt-2">
              <span className="text-ink-500">每月还款月供</span>
              <span className="font-semibold font-mono text-ink-800 dark:text-ink-200">
                ¥{(order.monthlyPaymentCents / 100).toFixed(2)} 元
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* 5. 阶段流转操作推进面板 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span>⚡</span>
            <span>业务阶段推进操作</span>
          </h3>
          {canRollback && (
            <button
              type="button"
              onClick={() => handleRollbackStage()}
              disabled={busy}
              className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-800 font-medium flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 active:scale-95 transition disabled:opacity-50"
            >
              <span>↩</span>
              <span>回退至{prevStageLabel}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleOpenApprovalModal}
            className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs font-semibold active:scale-95 transition flex items-center justify-center gap-1.5"
          >
            <span>🏛️</span>
            <span>录入行内批贷</span>
          </button>

          <button
            type="button"
            onClick={handleOpenLendModal}
            className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold active:scale-95 transition flex items-center justify-center gap-1.5"
          >
            <span>💰</span>
            <span>确认登记放款</span>
          </button>
        </div>
      </div>

      {/* 6. 提成收益核算卡片（放款后展示） */}
      {order.actualAmountCents ? (
        <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800 p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200 flex items-center gap-2">
            <span>📈</span>
            <span>提成收益对账 (个贷专属)</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-white/70 dark:bg-ink-800/70 border border-emerald-200/60 dark:border-emerald-800/60">
              <span className="text-ink-400">应付经纪人佣金</span>
              <div className="text-base font-bold font-mono text-amber-600 mt-1">
                ¥{((order.brokerCommissionCents || 0) / 100).toFixed(2)}
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white/70 dark:bg-ink-800/70 border border-emerald-200/60 dark:border-emerald-800/60">
              <span className="text-ink-400">卡部协同提成</span>
              <div className="text-base font-bold font-mono text-blue-600 mt-1">
                ¥{((order.cardCommissionCents || 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-emerald-200/70 dark:border-emerald-800/70 text-sm">
            <span className="font-medium text-emerald-950 dark:text-emerald-100">
              个人净提成收益
            </span>
            <span className="font-bold font-mono text-lg text-emerald-700 dark:text-emerald-300">
              ¥{((order.netIncomeCents || 0) / 100).toFixed(2)} 元
            </span>
          </div>
        </div>
      ) : null}

      {/* 7. 核心要求 2：双重描述之二 —— 阶段跟进动态流水日志（时间轴） */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span>⏱️</span>
            <span>办件动态流水 (时间轴追加)</span>
          </h3>
          <button
            onClick={() => setLogModalOpen(true)}
            className="text-xs px-3 py-1.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-95 transition shadow-sm"
          >
            ＋ 追加跟进记录
          </button>
        </div>

        {order.logs.length === 0 ? (
          <div className="text-center py-6 text-xs text-ink-400">暂无动态记录</div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink-200 dark:before:bg-ink-700">
            {order.logs.map((log) => (
              <div key={log.id} className="relative space-y-1">
                {/* 时间轴圆点 */}
                <span className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white dark:ring-ink-800" />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-ink-400 font-mono">
                      {formatShort(log.occurredAt)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteLog(log.id, log.action)}
                    className="text-[11px] text-ink-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 px-1.5 py-0.5 rounded transition"
                    title="删除流水记录"
                  >
                    删除
                  </button>
                </div>
                <div className="text-xs text-ink-700 dark:text-ink-300 leading-relaxed bg-ink-50/70 dark:bg-ink-900/40 p-2.5 rounded-xl">
                  {log.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 弹窗：追加跟进动态 */}
      {logModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setLogModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-ink-900 rounded-3xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-base">追加办件跟进记录</h4>
            <form onSubmit={handleAddLog} className="space-y-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">阶段动作标签</label>
                <select
                  value={logAction}
                  onChange={(e) => setLogAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none"
                >
                  <option value="电话跟进">电话跟进</option>
                  <option value="补充征信流水">补充征信/流水材料</option>
                  <option value="房产下户勘验">房产下户勘验</option>
                  <option value="客户签约面签">客户签约面签</option>
                  <option value="卡部核身协同">卡部核身协同</option>
                  <option value="抵押出件登记">抵押出件登记</option>
                  <option value="催收提醒">到期催收提醒</option>
                  <option value="其它跟进">其它特别事项</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-ink-500 mb-1">跟进内容详细记录 *</label>
                <textarea
                  rows={3}
                  required
                  value={logContent}
                  onChange={(e) => setLogContent(e.target.value)}
                  placeholder="如：已收取买卖双方身份证及产证复印件，评估公司预计周二下户..."
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLogModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-ink-500"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={logSaving}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {logSaving ? '提交中...' : '确认追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* 弹窗：录入审批结果 */}
      {approvalModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setApprovalModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-ink-900 rounded-3xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-base">录入行内审批结果</h4>
            <form onSubmit={submitApproval} className="space-y-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">审批结果</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="appr"
                      checked={approvalResult === 'approved'}
                      onChange={() => setApprovalResult('approved')}
                    />
                    <span>审批通过 (已批贷)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="appr"
                      checked={approvalResult === 'rejected'}
                      onChange={() => setApprovalResult('rejected')}
                    />
                    <span>审批退件 / 拒绝</span>
                  </label>
                </div>
              </div>

              {approvalResult === 'approved' && (
                <div>
                  <label className="block text-xs text-ink-500 mb-1">批复金额 (万元)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={approvedWan}
                    onChange={(e) => setApprovedWan(e.target.value)}
                    placeholder="批贷金额"
                    className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setApprovalModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-ink-500"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                >
                  {busy ? '提交中...' : '确认录入'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗：登记放款 */}
      {lendModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setLendModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-ink-900 rounded-3xl p-5 space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-base">确认放款与提成核算</h4>
            <form onSubmit={submitLending} className="space-y-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">实际放款金额 (万元) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={actualWan}
                  onChange={(e) => handleActualWanChange(e.target.value)}
                  placeholder="如: 120"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs text-ink-500 mb-1">放款时间 (精确到分钟)</label>
                <input
                  type="datetime-local"
                  required
                  value={loanDateStr}
                  onChange={(e) => setLoanDateStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm font-mono"
                />
              </div>

              <div className="pt-2 border-t border-ink-100 dark:border-ink-700">
                <div className="text-xs font-semibold text-ink-600 dark:text-ink-300 mb-2">
                  提成收益核算 (公式联动可修改)
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] text-ink-600 dark:text-ink-300 mb-0.5">
                      个人提成 (元) <span className="text-[10px] text-ink-400 font-normal">（按放款×0.04%自动计算，支持手工微调）</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={serviceFeeYuan}
                      onChange={(e) => setServiceFeeYuan(e.target.value)}
                      placeholder="如: 400.00"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-amber-600 dark:text-amber-400 mb-0.5">
                      应付经纪人返佣 (元) <span className="text-[10px] text-amber-500/80 font-normal">（按放款×0.2%自动计算，支持手工微调）</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={brokerCommissionYuan}
                      onChange={(e) => setBrokerCommissionYuan(e.target.value)}
                      placeholder="如: 2000.00"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-transparent text-xs font-mono font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-blue-600 dark:text-blue-400 mb-0.5">
                      卡部协同激励支出 (元)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={cardCommissionYuan}
                      onChange={(e) => setCardCommissionYuan(e.target.value)}
                      placeholder="如: 0"
                      className="w-full px-2.5 py-1.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-transparent text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-ink-100 dark:border-ink-700/60">
                  <label className="flex items-start gap-2.5 text-xs text-ink-700 dark:text-ink-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={recordWorkExpense}
                      onChange={(e) => setRecordWorkExpense(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 border-ink-300 dark:border-ink-600"
                    />
                    <div>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        是否记录工作账本垫款？
                      </span>
                      <p className="text-[11px] text-ink-400 mt-0.5">
                        默认勾选。放款登记成功后将同步在工作账本记一笔【房贷垫款】出项（金额为应付经纪人返佣，备注借款人与经纪人）。
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setLendModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-ink-500"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                >
                  {busy ? '登记中...' : '确认放款'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
