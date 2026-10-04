'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCents, getGroupLabel, PERSON_GROUPS } from '@/lib/renqing';
import { useToast, useConfirm } from '@/components/ui/Dialog';
import EventDialog from '../../EventDialog';

type EventData = {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  banquetCostCents: number | null;
  note: string | null;
};

type RecordItem = {
  id: string;
  amountCents: number;
  itemType: string;
  giftItemDesc: string | null;
  occurredAt: string;
  note: string | null;
  person: {
    id: string;
    name: string;
    relationship: string | null;
    group: string;
  };
};

type Props = {
  event: EventData;
  records: RecordItem[];
  guestCount: number;
  totalGiftCents: number;
  netProfitCents: number;
};

export default function EventDetailClient({
  event,
  records: initialRecords,
  guestCount: initialGuestCount,
  totalGiftCents: initialTotalGiftCents,
  netProfitCents: initialNetProfitCents,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [records, setRecords] = useState(initialRecords);
  const [guestCount, setGuestCount] = useState(initialGuestCount);
  const [totalGiftCents, setTotalGiftCents] = useState(initialTotalGiftCents);
  const [netProfitCents, setNetProfitCents] = useState(initialNetProfitCents);

  const [editEventOpen, setEditEventOpen] = useState(false);

  // 极速收礼表单状态
  const [guestName, setGuestName] = useState('');
  const [amountYuan, setAmountYuan] = useState('');
  const [relationship, setRelationship] = useState('');
  const [group, setGroup] = useState('other');
  const [note, setNote] = useState('');
  const [fastSubmitting, setFastSubmitting] = useState(false);

  // 快速连续录入
  async function handleFastSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestName.trim()) {
      toast({ message: '请输入宾客姓名', kind: 'error' });
      return;
    }
    const yuan = parseFloat(amountYuan);
    if (isNaN(yuan) || yuan < 0) {
      toast({ message: '请输入有效的礼金金额', kind: 'error' });
      return;
    }

    setFastSubmitting(true);
    try {
      const res = await fetch(`/api/renqing/events/${event.id}/fast-entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestName: guestName.trim(),
          amountCents: Math.round(yuan * 100),
          relationship: relationship.trim() || null,
          group,
          note: note.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '录入失败');
      }

      const newRecord = await res.json();
      toast({ message: `已记录 ${guestName} 礼金 ¥${yuan}`, kind: 'success' });

      // 本地状态更新
      const newAmountCents = Math.round(yuan * 100);
      setRecords([newRecord, ...records]);
      setGuestCount((prev) => prev + 1);
      setTotalGiftCents((prev) => prev + newAmountCents);
      setNetProfitCents((prev) => prev + newAmountCents);

      // 清空输入框，准备录入下一位，光标自动回到姓名
      setGuestName('');
      setAmountYuan('');
      setRelationship('');
      setNote('');
    } catch (err: any) {
      toast({ message: err.message || '录入失败', kind: 'error' });
    } finally {
      setFastSubmitting(false);
    }
  }

  // 导出 CSV 礼簿
  function handleExportCsv() {
    if (records.length === 0) {
      toast({ message: '当前礼簿暂无宾客记录', kind: 'error' });
      return;
    }

    const headers = ['宾客姓名', '称谓关系', '分组', '礼金金额(元)', '实物说明', '备注说明', '录入时间'];
    const rows = records.map((r) => [
      `"${r.person.name.replace(/"/g, '""')}"`,
      `"${(r.person.relationship || '').replace(/"/g, '""')}"`,
      `"${getGroupLabel(r.person.group)}"`,
      (r.amountCents / 100).toFixed(2),
      `"${(r.giftItemDesc || '').replace(/"/g, '""')}"`,
      `"${(r.note || '').replace(/"/g, '""')}"`,
      `"${r.occurredAt.slice(0, 10)}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `礼簿_${event.title}_${event.eventDate.slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ message: '礼簿 CSV 导出成功', kind: 'success' });
  }

  // 删除单笔记录
  async function handleDeleteRecord(id: string) {
    const ok = await confirm({
      title: '删除该礼金记录？',
      body: '删除后将移入回收站，60天内可在回收站找回。',
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/renqing/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ message: '记录已删除', kind: 'success' });
      router.refresh();
    } catch {
      toast({ message: '删除失败', kind: 'error' });
    }
  }

  // 删除整个礼簿
  async function handleDeleteEvent() {
    const ok = await confirm({
      title: `删除礼簿「${event.title}」？`,
      body: '删除该大事件礼簿后，所包含的宾客礼金记录仍会保留在对应亲友名下。',
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/renqing/events/${event.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ message: '礼簿已删除', kind: 'success' });
      router.push('/renqing');
    } catch {
      toast({ message: '删除失败', kind: 'error' });
    }
  }

  return (
    <div className="space-y-6">
      {/* 礼簿大盘卡片 */}
      <div className="p-6 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{event.title}</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 font-medium">
                {event.category}
              </span>
            </div>
            <div className="text-xs text-ink-500 mt-1">
              举办日期: {event.eventDate.slice(0, 10)}
              {event.note && ` · 备注: ${event.note}`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="text-xs px-3 py-1.5 rounded-xl bg-ink-100 dark:bg-ink-700 text-ink-700 dark:text-ink-200 hover:bg-ink-200 transition"
            >
              📥 导出礼簿
            </button>
            <button
              onClick={() => setEditEventOpen(true)}
              className="text-xs px-3 py-1.5 rounded-xl border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-50"
            >
              编辑
            </button>
            <button
              onClick={handleDeleteEvent}
              className="text-xs px-2.5 py-1.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              删除
            </button>
          </div>
        </div>

        {/* 核算指标 */}
        <div className="grid grid-cols-3 gap-2 mt-5 p-4 rounded-2xl bg-ink-50 dark:bg-ink-900/40 text-center">
          <div>
            <div className="text-xs text-ink-500">已收礼金 ({guestCount} 人)</div>
            <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              ¥{formatCents(totalGiftCents)}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-500">酒席总开销</div>
            <div className="text-lg font-semibold text-ink-700 dark:text-ink-300 mt-0.5">
              {event.banquetCostCents ? `¥${formatCents(event.banquetCostCents)}` : '未记录'}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-500">本场宴席盈亏</div>
            <div
              className={`text-lg font-bold mt-0.5 ${
                netProfitCents >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {netProfitCents >= 0 ? '+' : ''}¥{formatCents(netProfitCents)}
            </div>
          </div>
        </div>
      </div>

      {/* 现场极速收礼录入卡片（账房先生模式） */}
      <div className="p-5 rounded-3xl bg-rose-50/70 dark:bg-rose-950/20 border-2 border-rose-200 dark:border-rose-800/60 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <span className="font-semibold text-base text-rose-900 dark:text-rose-200">
              现场极速录入台（连记模式）
            </span>
          </div>
          <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
            回车一秒录入 · 自动匹配亲友
          </span>
        </div>

        <form onSubmit={handleFastSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-rose-900 dark:text-rose-300 mb-1">
                宾客姓名 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="如: 王叔"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-rose-900 dark:text-rose-300 mb-1">
                礼金金额 (元) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-400 font-semibold">¥</span>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="800"
                  value={amountYuan}
                  onChange={(e) => setAmountYuan(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="称谓关系 (选填)"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-ink-800"
            />
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-ink-800"
            >
              {PERSON_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="附注 (选填)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-ink-800"
            />
          </div>

          <button
            type="submit"
            disabled={fastSubmitting}
            className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm transition shadow-sm active:scale-95 disabled:opacity-50"
          >
            {fastSubmitting ? '录入中...' : '🧧 收下礼金并入簿（Enter）'}
          </button>
        </form>
      </div>

      {/* 礼簿明细列表 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">礼簿名册 ({records.length} 人)</h2>
        </div>

        {records.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-400">礼簿暂无宾客记录，可通过上方快速录入</div>
        ) : (
          <div className="space-y-2">
            {records.map((r, index) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-xs text-ink-400 font-mono text-center">
                    {records.length - index}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/renqing/persons/${r.person.id}`}
                        className="font-semibold text-sm hover:underline"
                      >
                        {r.person.name}
                      </Link>
                      {r.person.relationship && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-100 dark:bg-ink-700 text-ink-500">
                          {r.person.relationship}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300">
                        {getGroupLabel(r.person.group)}
                      </span>
                    </div>
                    {r.note && <div className="text-xs text-ink-400 mt-0.5">{r.note}</div>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                    +¥{formatCents(r.amountCents)}
                  </span>
                  <button
                    onClick={() => handleDeleteRecord(r.id)}
                    className="text-xs text-ink-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <EventDialog
        open={editEventOpen}
        onClose={() => setEditEventOpen(false)}
        onSuccess={() => router.refresh()}
        editingEvent={event}
      />
    </div>
  );
}
