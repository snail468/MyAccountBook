'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast, useConfirm } from '@/components/ui/Dialog';

export type CardStaffItem = {
  id: string;
  name: string;
  workNo: string | null;
  phone: string | null;
  branch: string | null;
  commissionNote: string | null;
  note: string | null;
  createdAt: string;
  _count?: {
    orders: number;
  };
};

export default function CardStaffList({ initialList }: { initialList: CardStaffItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [list, setList] = useState<CardStaffItem[]>(initialList);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [workNo, setWorkNo] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('');
  const [commissionNote, setCommissionNote] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const toast = useToast();
  const confirm = useConfirm();

  function openCreate() {
    setEditingId(null);
    setName('');
    setWorkNo('');
    setPhone('');
    setBranch('');
    setCommissionNote('');
    setNote('');
    setModalOpen(true);
  }

  function openEdit(item: CardStaffItem) {
    setEditingId(item.id);
    setName(item.name);
    setWorkNo(item.workNo || '');
    setPhone(item.phone || '');
    setBranch(item.branch || '');
    setCommissionNote(item.commissionNote || '');
    setNote(item.note || '');
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast({ message: '卡部人员姓名必填' });
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        // 更新
        const res = await fetch(`/api/loan/card-staff/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            workNo: workNo.trim() || null,
            phone: phone.trim() || null,
            branch: branch.trim() || null,
            commissionNote: commissionNote.trim() || null,
            note: note.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '更新失败');
        setList((prev) =>
          prev.map((item) => (item.id === editingId ? { ...item, ...data.staff } : item))
        );
        toast({ message: '卡部人员信息已更新', kind: 'success' });
      } else {
        // 新增
        const res = await fetch('/api/loan/card-staff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            workNo: workNo.trim() || null,
            phone: phone.trim() || null,
            branch: branch.trim() || null,
            commissionNote: commissionNote.trim() || null,
            note: note.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '创建失败');
        setList((prev) => [data.staff, ...prev]);
        toast({ message: '卡部人员已添加', kind: 'success' });
      }
      setModalOpen(false);
      startTransition(() => router.refresh());
    } catch (err: any) {
      toast({ message: err.message || '操作失败', kind: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: CardStaffItem) {
    const ok = await confirm({
      title: '删除卡部人员？',
      body: `确定要删除卡部人员“${item.name}${item.workNo ? ` (${item.workNo})` : ''}”吗？已关联的单据快照仍会保留。`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/loan/card-staff/${item.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      setList((prev) => prev.filter((i) => i.id !== item.id));
      startTransition(() => router.refresh());
      toast({ message: '已删除', kind: 'success' });
    } catch {
      toast({ message: '删除失败，请重试', kind: 'error' });
    }
  }

  const filtered = list.filter((item) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      (item.workNo && item.workNo.toLowerCase().includes(q)) ||
      (item.phone && item.phone.includes(q)) ||
      (item.branch && item.branch.toLowerCase().includes(q))
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
            placeholder="搜索姓名 / 卡部工号 / 支行..."
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
          <span>添加卡部人员</span>
        </button>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-ink-400 text-sm">
          {search ? '没有匹配的卡部人员' : '暂无卡部人员档案，点击右上角添加'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm flex flex-col gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">{item.name}</span>
                    {item.workNo ? (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-mono font-medium">
                        工号: {item.workNo}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-ink-100 dark:bg-ink-700 text-ink-400 font-mono">
                        未设工号
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-500 mt-1 flex items-center gap-2">
                    {item.branch && <span>🏛️ {item.branch}</span>}
                    {item.phone && <span>📞 {item.phone}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => openEdit(item)}
                    className="text-xs text-blue-600 dark:text-blue-400 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    删除
                  </button>
                </div>
              </div>

              {item.commissionNote && (
                <div className="text-xs text-blue-800 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/30 px-2.5 py-1.5 rounded-xl">
                  协同提成约定：{item.commissionNote}
                </div>
              )}

              {item.note && (
                <div className="text-xs text-ink-400 bg-ink-50 dark:bg-ink-900/40 p-2 rounded-xl">
                  备注：{item.note}
                </div>
              )}

              <div className="text-[11px] text-ink-400 flex items-center justify-between pt-1 border-t border-ink-100 dark:border-ink-700">
                <span>累计挂号协同：{item._count?.orders ?? 0} 笔</span>
                <span>创建于 {item.createdAt.slice(0, 10)}</span>
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
                {editingId ? '编辑卡部人员' : '新建卡部人员档案'}
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
                  姓名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="卡部对接人员姓名"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  卡部工号 <span className="text-ink-400 font-normal">(选填)</span>
                </label>
                <input
                  type="text"
                  value={workNo}
                  onChange={(e) => setWorkNo(e.target.value)}
                  placeholder="如: KB88201 (选填)"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  placeholder="手机或办公座机"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  所属支行 / 卡部团队
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="如: 市分行信用卡部 / 高新支行卡部组"
                  className="w-full px-3 py-2 rounded-xl border border-ink-300 dark:border-ink-600 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">
                  协同提成 / 分润约定
                </label>
                <input
                  type="text"
                  value={commissionNote}
                  onChange={(e) => setCommissionNote(e.target.value)}
                  placeholder="如: 单笔固定 500 元 / 计发卡部协同奖励"
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
                  placeholder="挂号注意事项、对接时间等"
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
