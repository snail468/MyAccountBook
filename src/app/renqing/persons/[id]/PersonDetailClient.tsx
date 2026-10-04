'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCents, getGroupLabel } from '@/lib/renqing';
import { useToast, useConfirm } from '@/components/ui/Dialog';
import RecordDialog, { PersonOption, EventOption } from '../../RecordDialog';
import PersonDialog from '../../PersonDialog';

type PersonData = {
  id: string;
  name: string;
  relationship: string | null;
  group: string;
  phone: string | null;
  note: string | null;
  createdAt: string;
};

type RecordData = {
  id: string;
  direction: string;
  amountCents: number;
  category: string;
  itemType: string;
  giftItemDesc: string | null;
  occurredAt: string;
  isPendingReturn: boolean;
  note: string | null;
  event?: { id: string; title: string; category: string } | null;
};

type Props = {
  person: PersonData;
  records: RecordData[];
  events: EventOption[];
  totalOutCents: number;
  totalInCents: number;
  netCents: number;
  reciprocalAdvice: string;
};

export default function PersonDetailClient({
  person,
  records,
  events,
  totalOutCents,
  totalInCents,
  netCents,
  reciprocalAdvice,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [editPersonOpen, setEditPersonOpen] = useState(false);
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [recordDirection, setRecordDirection] = useState<'out' | 'in'>('out');
  const [editingRecord, setEditingRecord] = useState<any>(null);

  const personOption: PersonOption = {
    id: person.id,
    name: person.name,
    relationship: person.relationship,
    group: person.group,
  };

  async function handleDeletePerson() {
    const ok = await confirm({
      title: `删除「${person.name}」档案？`,
      body: '删除该联系人档案将同时将其名下所有往来记录移入回收站。60天内可在回收站找回。',
      confirmText: '确认删除',
      danger: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/renqing/persons/${person.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('删除失败');
      toast({ message: '亲友档案已删除', kind: 'success' });
      router.push('/renqing');
    } catch {
      toast({ message: '删除失败，请重试', kind: 'error' });
    }
  }

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

  return (
    <div className="space-y-6">
      {/* 亲友档案基础卡片 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{person.name}</h1>
              {person.relationship && (
                <span className="text-xs px-2 py-0.5 rounded-md bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300 font-medium">
                  {person.relationship}
                </span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300">
                {getGroupLabel(person.group)}
              </span>
            </div>
            {person.phone && (
              <div className="text-xs text-ink-500 mt-1.5 flex items-center gap-1">
                <span>📞 {person.phone}</span>
              </div>
            )}
            {person.note && (
              <div className="text-xs text-ink-500 mt-1">
                📝 {person.note}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditPersonOpen(true)}
              className="text-xs px-3 py-1.5 rounded-xl border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-700"
            >
              编辑档案
            </button>
            <button
              onClick={handleDeletePerson}
              className="text-xs px-2.5 py-1.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              删除
            </button>
          </div>
        </div>

        {/* 双向人情账总结余卡片 */}
        <div className="mt-5 p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-amber-50 dark:from-rose-950/20 dark:to-amber-950/20 border border-rose-100 dark:border-rose-900/40">
          <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
            <span>双向往来差额结余</span>
            <span className="font-semibold text-ink-700 dark:text-ink-300">
              往来共 {records.length} 次
            </span>
          </div>

          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-2xl font-bold">
              {netCents >= 0 ? '+' : '-'}¥{formatCents(Math.abs(netCents))}
            </span>
            <span className="text-xs text-ink-500">
              {netCents > 0
                ? '（对方随我多，我欠对方人情）'
                : netCents < 0
                  ? '（我随对方多，对方欠我人情）'
                  : '（礼尚往来，两不相欠）'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-rose-200/50 dark:border-rose-800/40">
            <div>
              <div className="text-ink-500">我给对方随过</div>
              <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                ¥{formatCents(totalOutCents)}
              </div>
            </div>
            <div>
              <div className="text-ink-500">对方给我随过</div>
              <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                ¥{formatCents(totalInCents)}
              </div>
            </div>
          </div>
        </div>

        {/* 智能还礼建议 */}
        {reciprocalAdvice && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <span className="text-base leading-none">💡</span>
            <div className="flex-1 font-medium">{reciprocalAdvice}</div>
          </div>
        )}
      </div>

      {/* 快捷按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            setEditingRecord(null);
            setRecordDirection('out');
            setRecordDialogOpen(true);
          }}
          className="flex-1 py-2.5 rounded-2xl bg-rose-600 text-white font-medium text-sm shadow-sm hover:bg-rose-700 transition"
        >
          ＋ 记一笔随礼出 💸
        </button>
        <button
          onClick={() => {
            setEditingRecord(null);
            setRecordDirection('in');
            setRecordDialogOpen(true);
          }}
          className="flex-1 py-2.5 rounded-2xl bg-emerald-600 text-white font-medium text-sm shadow-sm hover:bg-emerald-700 transition"
        >
          ＋ 记一笔收礼入 🧧
        </button>
      </div>

      {/* 双向往来时间轴 */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">往来时间轴 ({records.length})</h2>

        {records.length === 0 ? (
          <div className="py-10 text-center text-xs text-ink-400">与该亲友暂无往来记录</div>
        ) : (
          <div className="space-y-2.5">
            {records.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm space-y-1.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{r.category}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                          r.direction === 'in'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300'
                        }`}
                      >
                        {r.direction === 'in' ? '收礼 🧧' : '随礼 💸'}
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

                  <div className="text-right">
                    <div
                      className={`text-base font-bold ${
                        r.direction === 'in'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {r.direction === 'in' ? '+ ' : '- '}¥{formatCents(r.amountCents)}
                    </div>
                  </div>
                </div>

                {r.giftItemDesc && (
                  <div className="text-xs text-ink-600 dark:text-ink-300 bg-ink-50 dark:bg-ink-900/40 px-2.5 py-1 rounded-xl">
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
                    {r.isPendingReturn && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                        ⏳ 待还礼
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setEditingRecord({
                          ...r,
                          personId: person.id,
                        });
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

      <RecordDialog
        open={recordDialogOpen}
        onClose={() => {
          setRecordDialogOpen(false);
          setEditingRecord(null);
        }}
        onSuccess={() => router.refresh()}
        initialDirection={recordDirection}
        initialPersonId={person.id}
        persons={[personOption]}
        events={events}
        editingRecord={editingRecord}
      />

      <PersonDialog
        open={editPersonOpen}
        onClose={() => setEditPersonOpen(false)}
        onSuccess={() => router.refresh()}
        editingPerson={person}
      />
    </div>
  );
}
