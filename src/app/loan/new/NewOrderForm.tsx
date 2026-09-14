'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Dialog';

export const LOAN_TYPES = [
  { key: 'mortgage', label: '房按揭 (二手房/新房)', icon: '🏠' },
  { key: 'house_pledge', label: '房产抵押贷', icon: '🏢' },
  { key: 'credit', label: '个人信用贷', icon: '💳' },
  { key: 'consumer', label: '消费贷', icon: '🛍️' },
  { key: 'business', label: '经营贷', icon: '💼' },
  { key: 'car', label: '车贷', icon: '🚗' },
  { key: 'card_staging', label: '卡部专项分期', icon: '🏷️' },
  { key: 'bridge', label: '过桥垫资', icon: '🔄' },
];

type Props = {
  brokers: Array<{ id: string; name: string; company: string | null }>;
  cardStaffs: Array<{ id: string; name: string; workNo: string; branch: string | null }>;
};

export default function NewOrderForm({ brokers: initialBrokers, cardStaffs: initialCardStaffs }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [brokers, setBrokers] = useState(initialBrokers);
  const [cardStaffs, setCardStaffs] = useState(initialCardStaffs);

  // 表单状态
  const [borrowerName, setBorrowerName] = useState('');
  const [phone, setPhone] = useState('');
  const [idCard, setIdCard] = useState('');
  const [loanType, setLoanType] = useState('mortgage'); // 房按揭默认置顶
  const [brokerId, setBrokerId] = useState('');
  const [cardStaffId, setCardStaffId] = useState('');

  // 房产要素（房按揭/抵押）
  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyArea, setPropertyArea] = useState('');
  const [propertyPriceWan, setPropertyPriceWan] = useState('');
  const [downPaymentWan, setDownPaymentWan] = useState('');

  // 需求要素
  const [demandAmountWan, setDemandAmountWan] = useState('');
  const [demandTermMonths, setDemandTermMonths] = useState('240'); // 默认20年

  // 关键字段：从新建意向单开始编辑一段文字描述这个单子的情况
  const [initialDescription, setInitialDescription] = useState('');

  const [busy, setBusy] = useState(false);

  // 快捷新增经纪人弹窗
  const [quickBrokerOpen, setQuickBrokerOpen] = useState(false);
  const [qbName, setQbName] = useState('');
  const [qbPhone, setQbPhone] = useState('');
  const [qbCompany, setQbCompany] = useState('');
  const [qbSaving, setQbSaving] = useState(false);

  // 快捷新增卡部人员弹窗
  const [quickStaffOpen, setQuickStaffOpen] = useState(false);
  const [qsName, setQsName] = useState('');
  const [qsWorkNo, setQsWorkNo] = useState('');
  const [qsBranch, setQsBranch] = useState('');
  const [qsSaving, setQsSaving] = useState(false);

  async function handleQuickBroker(e: React.FormEvent) {
    e.preventDefault();
    if (!qbName.trim()) {
      toast({ message: '请输入经纪人姓名' });
      return;
    }
    setQbSaving(true);
    try {
      const res = await fetch('/api/loan/brokers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: qbName.trim(),
          phone: qbPhone.trim() || null,
          company: qbCompany.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加失败');
      setBrokers((prev) => [data.broker, ...prev]);
      setBrokerId(data.broker.id);
      setQuickBrokerOpen(false);
      setQbName('');
      setQbPhone('');
      setQbCompany('');
      toast({ message: '已添加并选中该经纪人', kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '添加失败', kind: 'error' });
    } finally {
      setQbSaving(false);
    }
  }

  async function handleQuickStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!qsName.trim() || !qsWorkNo.trim()) {
      toast({ message: '姓名和工号均为必填项' });
      return;
    }
    setQsSaving(true);
    try {
      const res = await fetch('/api/loan/card-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: qsName.trim(),
          workNo: qsWorkNo.trim(),
          branch: qsBranch.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '添加失败');
      setCardStaffs((prev) => [data.staff, ...prev]);
      setCardStaffId(data.staff.id);
      setQuickStaffOpen(false);
      setQsName('');
      setQsWorkNo('');
      setQsBranch('');
      toast({ message: '已添加并选中该卡部人员', kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '添加失败', kind: 'error' });
    } finally {
      setQsSaving(false);
    }
  }

  async function submitOrder(status: 'draft' | 'intention') {
    if (!borrowerName.trim()) {
      toast({ message: '客户姓名必填' });
      return;
    }
    setBusy(true);

    const demandCents = demandAmountWan ? Math.round(parseFloat(demandAmountWan) * 10000 * 100) : null;
    const priceCents = propertyPriceWan ? Math.round(parseFloat(propertyPriceWan) * 10000 * 100) : null;
    const downCents = downPaymentWan ? Math.round(parseFloat(downPaymentWan) * 10000 * 100) : null;
    const termMonths = demandTermMonths ? parseInt(demandTermMonths, 10) : null;
    const area = propertyArea ? parseFloat(propertyArea) : null;

    try {
      const res = await fetch('/api/loan/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          borrowerName: borrowerName.trim(),
          phone: phone.trim() || null,
          idCard: idCard.trim() || null,
          loanType,
          status,
          brokerId: brokerId || null,
          cardStaffId: cardStaffId || null,
          propertyAddress: propertyAddress.trim() || null,
          propertyArea: area,
          propertyPriceCents: priceCents,
          downPaymentCents: downCents,
          demandAmountCents: demandCents,
          demandTermMonths: termMonths,
          initialDescription: initialDescription.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建失败');

      toast({ message: status === 'draft' ? '草稿已保存' : '意向单已成功建档', kind: 'success' });
      router.push(`/loan/${data.order.id}`);
    } catch (err: any) {
      toast({ message: err.message || '提交失败，请重试', kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const isPropertyType = loanType === 'mortgage' || loanType === 'house_pledge';

  return (
    <div className="space-y-6">
      {/* 1. 业务类型选择（房按揭首位置顶） */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-3">
        <label className="block text-sm font-semibold">
          业务类型 <span className="text-red-500">* (房按揭优先)</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {LOAN_TYPES.map((t, idx) => {
            const selected = loanType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setLoanType(t.key)}
                className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition active:scale-95 ${
                  selected
                    ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-semibold shadow-sm'
                    : 'border-ink-200 dark:border-ink-700 hover:border-ink-300'
                }`}
              >
                <span className="text-xl shrink-0">{t.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs truncate">{t.label}</div>
                  {idx === 0 && (
                    <div className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">首位核心业务</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 借款客户基础信息 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>👤</span>
          <span>借款客户基础信息</span>
        </h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-500 mb-1">
              客户姓名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
              placeholder="借款人真实姓名"
              className="w-full px-3.5 py-2.5 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">联系电话</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="手机号"
                className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">身份证号</label>
              <input
                type="text"
                value={idCard}
                onChange={(e) => setIdCard(e.target.value)}
                placeholder="身份证号"
                className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">
                拟申请金额 (万元)
              </label>
              <input
                type="number"
                step="0.1"
                value={demandAmountWan}
                onChange={(e) => setDemandAmountWan(e.target.value)}
                placeholder="如: 120"
                className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">拟申请期限 (月)</label>
              <input
                type="number"
                value={demandTermMonths}
                onChange={(e) => setDemandTermMonths(e.target.value)}
                placeholder="如: 240 (20年) / 360"
                className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 房产要素（房按揭首位专属） */}
      {isPropertyType && (
        <div className="rounded-3xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-800/70 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-blue-950 dark:text-blue-200 flex items-center gap-2">
              <span>🏠</span>
              <span>房产标的与按揭要素</span>
            </h3>
            <span className="text-[11px] text-blue-600 dark:text-blue-400">房按揭/抵押关键凭证</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">房屋坐落小区 / 楼幢房号</label>
              <input
                type="text"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="如: 翠微花园 3栋 2单元 801"
                className="w-full px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-white/70 dark:bg-ink-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-ink-500 mb-1">建筑面积 (㎡)</label>
                <input
                  type="number"
                  step="0.01"
                  value={propertyArea}
                  onChange={(e) => setPropertyArea(e.target.value)}
                  placeholder="如: 89.5"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white/70 dark:bg-ink-800/70 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-500 mb-1">成交总价 (万元)</label>
                <input
                  type="number"
                  step="0.1"
                  value={propertyPriceWan}
                  onChange={(e) => setPropertyPriceWan(e.target.value)}
                  placeholder="如: 240"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white/70 dark:bg-ink-800/70 text-xs focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-500 mb-1">首付款 (万元)</label>
                <input
                  type="number"
                  step="0.1"
                  value={downPaymentWan}
                  onChange={(e) => setDownPaymentWan(e.target.value)}
                  placeholder="如: 80"
                  className="w-full px-2.5 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 bg-white/70 dark:bg-ink-800/70 text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. 人员关联（核心需求 1：明确填写经纪人是谁、给卡部的谁挂了工号） */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span>🤝</span>
          <span>渠道经纪人 & 卡部工号挂号</span>
        </h3>

        <div className="space-y-4">
          {/* 经纪人选择 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-ink-500">
                推单经纪人是谁
              </label>
              <button
                type="button"
                onClick={() => setQuickBrokerOpen(true)}
                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                ＋ 快速建档
              </button>
            </div>
            <select
              value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink-300 dark:border-ink-600 bg-white dark:bg-ink-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- 无经纪人 / 客户自来访 --</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.company ? `(${b.company})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 卡部工号人员选择 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-ink-500">
                给卡部的谁挂了工号
              </label>
              <button
                type="button"
                onClick={() => setQuickStaffOpen(true)}
                className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                ＋ 快速建档
              </button>
            </div>
            <select
              value={cardStaffId}
              onChange={(e) => setCardStaffId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink-300 dark:border-ink-600 bg-white dark:bg-ink-900 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- 不挂卡部工号 / 无卡部协同 --</option>
              {cardStaffs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} [工号: {s.workNo}] {s.branch ? `· ${s.branch}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 5. 核心需求 2：从新建意向单开始，编辑一段文字描述这个单子的情况 */}
      <div className="rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 p-5 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold flex items-center gap-1.5">
            <span>📝</span>
            <span>单子基本情况描述 (静态全景说明)</span>
          </label>
          <span className="text-[11px] text-ink-400">贯穿全流程，随时可修改</span>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">
          详细记录客户征信资质、收入流水、负债情况、资金急缓度、特殊背景及意向诉求，便于后续审批把关与方案拟定。
        </p>
        <textarea
          rows={5}
          value={initialDescription}
          onChange={(e) => setInitialDescription(e.target.value)}
          placeholder="例如：客户为某科技公司中层，名下公积金连续缴纳5年，征信近2年无逾期，购买二手房首付款已到位。因房东急需出国，要求本月25号前完成批贷面签并落实放款..."
          className="w-full px-3.5 py-2.5 rounded-2xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
        />
      </div>

      {/* 底部提交栏 */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => submitOrder('draft')}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl border border-ink-300 dark:border-ink-600 text-sm font-medium hover:bg-ink-50 dark:hover:bg-ink-700/50 active:scale-98 transition disabled:opacity-50"
        >
          {busy ? '保存中...' : '存为草稿'}
        </button>

        <button
          type="button"
          onClick={() => submitOrder('intention')}
          disabled={busy}
          className="flex-[2] py-3 rounded-2xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-98 transition shadow-md disabled:opacity-50"
        >
          {busy ? '提交中...' : '提交意向单 (进入跟进)'}
        </button>
      </div>

      {/* 弹窗：快捷新建经纪人 */}
      {quickBrokerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setQuickBrokerOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-ink-900 rounded-3xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-base">快速登记经纪人</h4>
            <form onSubmit={handleQuickBroker} className="space-y-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">姓名 *</label>
                <input
                  type="text"
                  required
                  value={qbName}
                  onChange={(e) => setQbName(e.target.value)}
                  placeholder="经纪人姓名"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-500 mb-1">联系电话</label>
                <input
                  type="tel"
                  value={qbPhone}
                  onChange={(e) => setQbPhone(e.target.value)}
                  placeholder="手机号"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-500 mb-1">所属中介/渠道</label>
                <input
                  type="text"
                  value={qbCompany}
                  onChange={(e) => setQbCompany(e.target.value)}
                  placeholder="如: 链家XX店"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickBrokerOpen(false)}
                  className="px-3 py-1.5 text-xs text-ink-500"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={qbSaving}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium"
                >
                  {qbSaving ? '保存中...' : '确定添加并选用'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 弹窗：快捷新建卡部人员 */}
      {quickStaffOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setQuickStaffOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-ink-900 rounded-3xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-base">快速登记卡部人员</h4>
            <form onSubmit={handleQuickStaff} className="space-y-3">
              <div>
                <label className="block text-xs text-ink-500 mb-1">姓名 *</label>
                <input
                  type="text"
                  required
                  value={qsName}
                  onChange={(e) => setQsName(e.target.value)}
                  placeholder="卡部对接人姓名"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-500 mb-1">卡部工号 *</label>
                <input
                  type="text"
                  required
                  value={qsWorkNo}
                  onChange={(e) => setQsWorkNo(e.target.value)}
                  placeholder="挂号工号 (如: KB88201)"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-ink-500 mb-1">所属支行/团队</label>
                <input
                  type="text"
                  value={qsBranch}
                  onChange={(e) => setQsBranch(e.target.value)}
                  placeholder="如: 高新支行卡部组"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickStaffOpen(false)}
                  className="px-3 py-1.5 text-xs text-ink-500"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={qsSaving}
                  className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium"
                >
                  {qsSaving ? '保存中...' : '确定添加并选用'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
