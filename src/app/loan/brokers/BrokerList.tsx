'use client';

import { useState } from 'react';
import { useToast, useConfirm } from '@/components/ui/Dialog';

export type BrokerItem = {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  rateNote: string | null;
  accountInfo: string | null;
  note: string | null;
  createdAt: string;
  _count?: {
    orders: number;
  };
};

export default function BrokerList({ initialList }: { initialList: BrokerItem[] }) {
  const [list, setList] = useState<BrokerItem[]>(initialList);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [rateNote, setRateNote] = useState('');
  const [accountInfo, setAccountInfo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const toast = useToast();
  const confirm = useConfirm();

  function openCreate() {
    setEditingId(null);
    setName('');
    setPhone('');
    setCompany('');
    setRateNote('');
    setAccountInfo('');
    setNote('');
    setModalOpen(true);
  }

  function openEdit(b: BrokerItem) {
    setEditingId(b.id);
    setName(b.name);
    setPhone(b.phone || '');
    setCompany(b.company || '');
    setRateNote(b.rateNote || '');
    setAccountInfo(b.accountInfo || '');
    setNote(b.note || '');
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ message: '经纪人姓名必填' });
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        // 更新
        const res = await fetch(`/api/loan/brokers/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim() || null,
            company: company.trim() || null,
            rateNote: rateNote.trim() || null,
            accountInfo: accountInfo.trim() || null,
            note: note.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '更新失败');
        setList((prev) =>
          prev.map((item) => (item.id === editingId ? { ...item, ...data.broker } : item))
        );
        toast({ message: '经纪人信息已更新', kind: 'success' });
      } else {
        // 新增
        const res = await fetch('/api/loan/brokers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim() || null,
            company: company.trim() || null,
            rateNote: rateNote.trim() || null,
            accountInfo: accountInfo.trim() || null,
            note: note.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '创建失败');
        setList((prev) => [data.broker, ...prev]);
        toast({ message: '经纪人已添加', kind: 'success' });
      }
      setModalOpen(false);
    } catch (err: any) {
      toast({ message: err.message || '操作失败', kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(b: BrokerItem) {
    const ok = await confirm({
      title: '删除经纪人档案？',
      body: `确定要删除经纪人“${b.name}”吗？已关联的单据快照信息将保留。`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/loan/brokers/${b.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setList((prev) => prev.filter((item) => item.id !== b.id));
      toast({ message: '已删除', kind: 'success' });
    } catch {
      toast({ message: '删除失败，请重试', kind: 'error' });
    }
  }

  const filtered = list.filter((b) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      b.name.toLowerCase().includes(q) ||
      (b.phone && b.phone.includes(q)) ||
      (b.company && b.company.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      {/* 搜索与新增操作栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索经纪人姓名 / 手机 / 中介公司..."
            className="w-full pl-9 pr-3 py-2 rounded-2xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute left-3 top-2.5 text-xs text-ink-400">🔍</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-2 text-xs text-ink-400 hover:text-ink-600"
            >
              ✕
            </button>
          )}
        </div>

        <button
          onClick={openCreate}
          className="shrink-0 px-4 py-2 rounded-2xl bg-blue-600 text-white text-sm font-medium shadow-sm hover:bg-blue-700 active:scale-95 transition flex items-center gap-1"
        >
          <span>＋</span>
          <span>添加经纪人</span>
        </button>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-ink-400 text-sm">
          {search ? '没有匹配的经纪人' : '暂无经纪人档案，点击右上角添加'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">{b.name}</span>
                    {b.company && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300">
                        {b.company}
                      </span>
                    )}
                  </div>
                  {b.phone && (
                    <div className="text-xs text-ink-500 mt-1">📞 {b.phone}</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEdit(b)}
                    className="text-xs text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(b)}
                    className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    删除
                  </button>
                </div>
              </div>

              {b.rateNote && (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 rounded-xl">
                  返佣约定：{b.rateNote}
                </div>
              )}

              {b.accountInfo && (
                <div className="text-xs text-ink-500">
                  结算账号：<span className="font-mono">{b.accountInfo}</span>
                </div>
              )}

              {b.note && (
                <div className="text-xs text-ink-400 bg-ink-50 dark:bg-ink-900/40 p-2 rounded-xl">
                  备注：{b.note}
                </div>
              )}

              <div className="text-[11px] text-ink-400 flex items-center justify-between pt-1 border-t border-ink-100 dark:border-ink-700">
                <span>累计推单：{b._count?.orders ?? 0} 笔</span>
                <span>创建于 {b.createdAt.slice(0, 10)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {editingId ? '编辑经纪人档案' : '新建经纪人档案'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-ink-400 hover:text-ink-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  经纪人姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如: 张经理"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  联系电话
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="手机号"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  所属机构 / 中介门店
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="如: 链家地产科技园店 / XX渠道公司"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  返佣约定 / 点位
                </label>
                <input
                  type="text"
                  value={rateNote}
                  onChange={(e) => setRateNote(e.target.value)}
                  placeholder="如: 按放款额 1.2% / 每单固定返 2000 元"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  结算银行卡号 / 账号信息
                </label>
                <input
                  type="text"
                  value={accountInfo}
                  onChange={(e) => setAccountInfo(e.target.value)}
                  placeholder="如: 招商银行 6214... 张某"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  特别说明 / 备注
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="合作偏好、跟进说明等"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-ink-200 dark:border-ink-700 text-sm text-ink-600 dark:text-ink-300"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? '保存中...' : '确认保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
