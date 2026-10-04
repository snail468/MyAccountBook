'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCents, getGroupLabel, RENQING_CATEGORIES, PERSON_GROUPS } from '@/lib/renqing';
import { useToast, useConfirm } from '@/components/ui/Dialog';
import RecordDialog, { PersonOption, EventOption } from './RecordDialog';
import PersonDialog from './PersonDialog';
import EventDialog from './EventDialog';

export type DashboardRecord = {
  id: string;
  personId: string;
  eventId?: string | null;
  direction: string;
  amountCents: number;
  category: string;
  itemType: string;
  giftItemDesc: string | null;
  occurredAt: string;
  isPendingReturn: boolean;
  note: string | null;
  person: {
    id: string;
    name: string;
    relationship: string | null;
    group: string;
  };
  event: {
    id: string;
    title: string;
    category: string;
  } | null;
};

export type DashboardPerson = {
  id: string;
  name: string;
  relationship: string | null;
  group: string;
  phone: string | null;
  note: string | null;
  recordCount: number;
  totalOutCents: number;
  totalInCents: number;
  netCents: number;
  lastOccurredAt: string | null;
};

export type DashboardEvent = {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  banquetCostCents: number | null;
  note: string | null;
  guestCount: number;
  totalGiftCents: number;
  netProfitCents: number;
};

type Props = {
  businessName: string;
  records: DashboardRecord[];
  persons: DashboardPerson[];
  events: DashboardEvent[];
  stats: {
    totalOutCents: number;
    totalInCents: number;
    netCents: number;
    monthOutCents: number;
    pendingCount: number;
  };
};

export default function RenqingDashboard({
  businessName: _businessName,
  records,
  persons,
  events,
  stats,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<'records' | 'persons' | 'events' | 'pending'>('records');

  // 流水 Tab 筛选
  const [recordDirection, setRecordDirection] = useState<'all' | 'out' | 'in'>('all');
  const [recordCategory, setRecordCategory] = useState('all');
  const [recordSearch, setRecordSearch] = useState('');

  // 亲友 Tab 筛选
  const [personGroup, setPersonGroup] = useState('all');
  const [personSort, setPersonSort] = useState<'default' | 'netDesc' | 'netAsc' | 'recent'>('default');
  const [personSearch, setPersonSearch] = useState('');

  // 模态弹窗状态
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [recordDialogDirection, setRecordDialogDirection] = useState<'out' | 'in'>('out');
  const [editingRecord, setEditingRecord] = useState<DashboardRecord | null>(null);

  const [personDialogOpen, setPersonDialogOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<DashboardPerson | null>(null);

  const [eventDialogOpen, setEventDialogOpen] = useState(false);

  const personOptions: PersonOption[] = persons.map((p) => ({
    id: p.id,
    name: p.name,
    relationship: p.relationship,
    group: p.group,
  }));

  const eventOptions: EventOption[] = events.map((e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
  }));

  // 过滤流水
  const filteredRecords = records.filter((r) => {
    if (recordDirection !== 'all' && r.direction !== recordDirection) return false;
    if (recordCategory !== 'all' && r.category !== recordCategory) return false;
    if (recordSearch.trim()) {
      const q = recordSearch.trim().toLowerCase();
      const matchName = r.person.name.toLowerCase().includes(q);
      const matchCat = r.category.toLowerCase().includes(q);
      const matchDesc = r.giftItemDesc?.toLowerCase().includes(q);
      const matchNote = r.note?.toLowerCase().includes(q);
      if (!matchName && !matchCat && !matchDesc && !matchNote) return false;
    }
    return true;
  });

  // 待还流水
  const pendingRecords = records.filter((r) => r.isPendingReturn);

  // 过滤亲友
  const filteredPersons = persons
    .filter((p) => {
      if (personGroup !== 'all' && p.group !== personGroup) return false;
      if (personSearch.trim()) {
        const q = personSearch.trim().toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchRel = p.relationship?.toLowerCase().includes(q);
        if (!matchName && !matchRel) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (personSort === 'netDesc') return b.netCents - a.netCents; // 他送我多在先
      if (personSort === 'netAsc') return a.netCents - b.netCents; // 我送他多在先
      if (personSort === 'recent') {
        const timeA = a.lastOccurredAt ? new Date(a.lastOccurredAt).getTime() : 0;
        const timeB = b.lastOccurredAt ? new Date(b.lastOccurredAt).getTime() : 0;
        return timeB - timeA;
      }
      return a.name.localeCompare(b.name, 'zh-CN');
    });

  // 删除记录
  async function handleDeleteRecord(id: string) {
    const ok = await confirm({
      title: '删除该往来记录？',
      body: '删除后将移入回收站，60天内可在回收站找回。',
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/renqing/records/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ message: '已删除并移入回收站', kind: 'success' });
      router.refresh();
    } catch {
      toast({ message: '删除失败，请重试', kind: 'error' });
    }
  }

  // 标记还礼完成
  async function handleToggleReturnStatus(record: DashboardRecord) {
    try {
      const res = await fetch(`/api/renqing/records/${record.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPendingReturn: !record.isPendingReturn }),
      });
      if (!res.ok) throw new Error('更新失败');
      toast({
        message: !record.isPendingReturn ? '已标记为待还礼' : '已标记为还礼完成',
        kind: 'success',
      });
      router.refresh();
    } catch {
      toast({ message: '操作失败', kind: 'error' });
    }
  }

  return (
    <div className="space-y-6">
      {/* 头部统计大卡片 */}
      <div className="rounded-3xl bg-gradient-to-br from-rose-500 via-rose-600 to-red-600 text-white p-6 shadow-lg shadow-rose-500/20 relative overflow-hidden">
        <div className="absolute right-[-10px] bottom-[-20px] text-8xl opacity-15 select-none pointer-events-none">
          🧧
        </div>

        <div className="flex items-center justify-between text-xs text-rose-100 font-medium mb-3">
          <span>人情总结余（礼入 - 礼出）</span>
          <span>本月随礼 ¥{formatCents(stats.monthOutCents)}</span>
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-3xl font-bold tracking-tight">
            {stats.netCents >= 0 ? '+' : '-'}¥{formatCents(Math.abs(stats.netCents))}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md">
            {stats.netCents >= 0 ? '人情顺差 (净收礼)' : '人情逆差 (净送出)'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/20 text-xs">
          <div>
            <div className="text-rose-200">累计礼出 (送礼)</div>
            <div className="text-base font-semibold mt-0.5">¥{formatCents(stats.totalOutCents)}</div>
          </div>
          <div>
            <div className="text-rose-200">累计礼入 (收礼)</div>
            <div className="text-base font-semibold mt-0.5">¥{formatCents(stats.totalInCents)}</div>
          </div>
        </div>
      </div>

      {/* 快捷操作网格 */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <button
          onClick={() => {
            setEditingRecord(null);
            setRecordDialogDirection('out');
            setRecordDialogOpen(true);
          }}
          className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm active:scale-95 transition"
        >
          <div className="text-2xl mb-1">💸</div>
          <div className="text-xs font-medium">记随礼</div>
        </button>

        <button
          onClick={() => {
            setEditingRecord(null);
            setRecordDialogDirection('in');
            setRecordDialogOpen(true);
          }}
          className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm active:scale-95 transition"
        >
          <div className="text-2xl mb-1">🧧</div>
          <div className="text-xs font-medium">记收礼</div>
        </button>

        <button
          onClick={() => setEventDialogOpen(true)}
          className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm active:scale-95 transition"
        >
          <div className="text-2xl mb-1">🏛️</div>
          <div className="text-xs font-medium">办喜事礼簿</div>
        </button>

        <Link
          href="/renqing/import"
          className="p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm active:scale-95 transition flex flex-col items-center justify-center"
        >
          <div className="text-2xl mb-1">📥</div>
          <div className="text-xs font-medium">批量导入</div>
        </Link>
      </div>

      {/* 选项卡导航 */}
      <div className="flex border-b border-ink-200 dark:border-ink-700">
        <button
          onClick={() => setActiveTab('records')}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'records'
              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-semibold'
              : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
          }`}
        >
          往来流水 ({records.length})
        </button>

        <button
          onClick={() => setActiveTab('persons')}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'persons'
              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-semibold'
              : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
          }`}
        >
          亲友录 ({persons.length})
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition ${
            activeTab === 'events'
              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-semibold'
              : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
          }`}
        >
          大事件 ({events.length})
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 pb-3 text-sm font-medium border-b-2 transition relative ${
            activeTab === 'pending'
              ? 'border-rose-500 text-rose-600 dark:text-rose-400 font-semibold'
              : 'border-transparent text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
          }`}
        >
          <span>待还人情</span>
          {stats.pendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-normal">
              {stats.pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: 往来流水 */}
      {activeTab === 'records' && (
        <div className="space-y-3">
          {/* 筛选条 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="搜索姓名、事由、备注..."
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
              <select
                value={recordDirection}
                onChange={(e) => setRecordDirection(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
              >
                <option value="all">全部方向</option>
                <option value="out">随礼出 💸</option>
                <option value="in">收礼入 🧧</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setRecordCategory('all')}
                className={`shrink-0 px-2.5 py-1 rounded-lg transition ${
                  recordCategory === 'all'
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium'
                    : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300'
                }`}
              >
                全部事由
              </button>
              {RENQING_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setRecordCategory(cat)}
                  className={`shrink-0 px-2.5 py-1 rounded-lg transition ${
                    recordCategory === cat
                      ? 'bg-rose-500 text-white font-medium'
                      : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 记录列表 */}
          {filteredRecords.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-400">暂无符合条件的往来记录</div>
          ) : (
            <div className="space-y-2.5">
              {filteredRecords.map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/renqing/persons/${r.person.id}`}
                          className="font-semibold text-base hover:text-rose-600 dark:hover:text-rose-400 transition"
                        >
                          {r.person.name}
                        </Link>
                        {r.person.relationship && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-100 dark:bg-ink-700 text-ink-500">
                            {r.person.relationship}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 font-medium">
                          {r.category}
                        </span>
                      </div>
                      <div className="text-xs text-ink-400 mt-0.5">
                        {r.occurredAt.slice(0, 10)}
                        {r.event && (
                          <Link
                            href={`/renqing/events/${r.event.id}`}
                            className="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            · 归属: {r.event.title}
                          </Link>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-base font-bold ${
                          r.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {r.direction === 'in' ? '+ ' : '- '}¥{formatCents(r.amountCents)}
                      </div>
                      <div className="text-[10px] text-ink-400">
                        {r.itemType === 'gift' ? '实物礼品' : r.itemType === 'both' ? '现金+实物' : '现金红包'}
                      </div>
                    </div>
                  </div>

                  {r.giftItemDesc && (
                    <div className="text-xs text-ink-600 dark:text-ink-300 bg-ink-50 dark:bg-ink-900/40 px-2.5 py-1.5 rounded-xl">
                      🎁 礼物: {r.giftItemDesc}
                    </div>
                  )}

                  {r.note && (
                    <div className="text-xs text-ink-500">
                      📝 {r.note}
                    </div>
                  )}

                  <div className="pt-2 border-t border-ink-100 dark:border-ink-700/60 flex items-center justify-between text-xs text-ink-400">
                    <div>
                      {r.direction === 'in' && (
                        <button
                          type="button"
                          onClick={() => handleToggleReturnStatus(r)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] transition ${
                            r.isPendingReturn
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium'
                              : 'bg-ink-100 dark:bg-ink-700 text-ink-500'
                          }`}
                        >
                          {r.isPendingReturn ? '⏳ 待还礼 (点击已还)' : '✓ 已还清/无须还'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setEditingRecord(r);
                          setRecordDialogOpen(true);
                        }}
                        className="hover:text-rose-600 dark:hover:text-rose-400"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleDeleteRecord(r.id)}
                        className="hover:text-red-600 dark:hover:text-red-400"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 亲友录 */}
      {activeTab === 'persons' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <input
              type="text"
              placeholder="搜索亲友姓名或称谓..."
              value={personSearch}
              onChange={(e) => setPersonSearch(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
            />
            <button
              onClick={() => {
                setEditingPerson(null);
                setPersonDialogOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-medium shadow-sm hover:bg-rose-700 transition"
            >
              ＋ 新建亲友
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                onClick={() => setPersonGroup('all')}
                className={`px-2.5 py-1 rounded-lg shrink-0 transition ${
                  personGroup === 'all'
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                    : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300'
                }`}
              >
                全部
              </button>
              {PERSON_GROUPS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setPersonGroup(g.key)}
                  className={`px-2.5 py-1 rounded-lg shrink-0 transition ${
                    personGroup === g.key
                      ? 'bg-rose-500 text-white'
                      : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>

            <select
              value={personSort}
              onChange={(e) => setPersonSort(e.target.value as any)}
              className="px-2 py-1 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 shrink-0"
            >
              <option value="default">默认姓名</option>
              <option value="netDesc">他随我多 (顺差)</option>
              <option value="netAsc">我随他多 (逆差)</option>
              <option value="recent">最近往来</option>
            </select>
          </div>

          {filteredPersons.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-400">暂无联系人档案</div>
          ) : (
            <div className="space-y-2.5">
              {filteredPersons.map((p) => (
                <Link
                  key={p.id}
                  href={`/renqing/persons/${p.id}`}
                  className="block p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm hover:border-rose-300 dark:hover:border-rose-700 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-base">{p.name}</span>
                        {p.relationship && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-100 dark:bg-ink-700 text-ink-500">
                            {p.relationship}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300">
                          {getGroupLabel(p.group)}
                        </span>
                      </div>
                      <div className="text-xs text-ink-400 mt-1">
                        往来 {p.recordCount} 次
                        {p.lastOccurredAt && ` · 最近 ${p.lastOccurredAt.slice(0, 10)}`}
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className={`text-sm font-bold ${
                          p.netCents > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : p.netCents < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-ink-500'
                        }`}
                      >
                        {p.netCents > 0 ? '+ ' : p.netCents < 0 ? '- ' : ''}¥{formatCents(Math.abs(p.netCents))}
                      </div>
                      <div className="text-[10px] text-ink-400 mt-0.5">
                        我送 ¥{formatCents(p.totalOutCents)} · 他送 ¥{formatCents(p.totalInCents)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: 大事件礼簿 */}
      {activeTab === 'events' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-500">办喜事收礼簿与宴席盈亏核算</span>
            <button
              onClick={() => setEventDialogOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-medium shadow-sm hover:bg-rose-700 transition"
            >
              ＋ 办喜事建礼簿
            </button>
          </div>

          {events.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-400">暂无大事件礼簿</div>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <Link
                  key={e.id}
                  href={`/renqing/events/${e.id}`}
                  className="block p-5 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm hover:border-rose-300 dark:hover:border-rose-700 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-lg">{e.title}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 font-medium">
                          {e.category}
                        </span>
                      </div>
                      <div className="text-xs text-ink-400 mt-1">
                        举办日期: {e.eventDate.slice(0, 10)} · 到场 {e.guestCount} 位宾客
                      </div>
                    </div>
                    <span className="text-ink-400">›</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-ink-100 dark:border-ink-700 text-center">
                    <div>
                      <div className="text-[11px] text-ink-400">礼金总收入</div>
                      <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        ¥{formatCents(e.totalGiftCents)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-ink-400">酒席总开销</div>
                      <div className="text-sm font-semibold text-ink-600 dark:text-ink-300 mt-0.5">
                        {e.banquetCostCents ? `¥${formatCents(e.banquetCostCents)}` : '未记录'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-ink-400">宴席净结余</div>
                      <div
                        className={`text-sm font-bold mt-0.5 ${
                          e.netProfitCents >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {e.netProfitCents >= 0 ? '+' : ''}¥{formatCents(e.netProfitCents)}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: 待还清单 */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          <div className="text-xs text-ink-500">
            下列为您收到的礼金红包，日后对方办喜事时建议还礼：
          </div>

          {pendingRecords.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-400">目前暂无待还礼记录，人情两清 ☕</div>
          ) : (
            <div className="space-y-2.5">
              {pendingRecords.map((r) => (
                <div
                  key={r.id}
                  className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-amber-200 dark:border-amber-900/50 shadow-sm space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/renqing/persons/${r.person.id}`}
                          className="font-semibold text-base hover:underline"
                        >
                          {r.person.name}
                        </Link>
                        {r.person.relationship && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-ink-100 dark:bg-ink-700 text-ink-500">
                            {r.person.relationship}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                          {r.category}
                        </span>
                      </div>
                      <div className="text-xs text-ink-400 mt-1">
                        收礼时间: {r.occurredAt.slice(0, 10)}
                        {r.giftItemDesc && ` · 礼物: ${r.giftItemDesc}`}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-bold text-amber-600 dark:text-amber-400">
                        待还 ¥{formatCents(r.amountCents)}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleReturnStatus(r)}
                        className="mt-1 px-2.5 py-1 text-xs rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium transition"
                      >
                        ✓ 标为已还
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 弹窗 */}
      <RecordDialog
        open={recordDialogOpen}
        onClose={() => {
          setRecordDialogOpen(false);
          setEditingRecord(null);
        }}
        onSuccess={() => router.refresh()}
        initialDirection={recordDialogDirection}
        persons={personOptions}
        events={eventOptions}
        editingRecord={editingRecord}
      />

      <PersonDialog
        open={personDialogOpen}
        onClose={() => {
          setPersonDialogOpen(false);
          setEditingPerson(null);
        }}
        onSuccess={() => router.refresh()}
        editingPerson={editingPerson}
      />

      <EventDialog
        open={eventDialogOpen}
        onClose={() => setEventDialogOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
