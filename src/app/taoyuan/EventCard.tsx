'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatYuan } from '@/lib/money';
import { formatShort } from '@/lib/datetime';
import { rewardMethodLabel } from '@/lib/rewardMethod';
import { afterTaxCents, calcTaxCents } from '@/lib/tax';
import type { ClientEvent } from './types';
import { aggregate } from './types';
import AmountEditor from './AmountEditor';

const NEXT_LABEL: Record<string, string> = {
  published: '填写预测收入',
  predicted: '登记公示奖金',
  announced: '确认到账金额',
};

type Stage = 'predicted' | 'announced' | 'paid';
const ADVANCE_ACTION: Record<string, 'predict' | 'announce' | 'pay'> = {
  published: 'predict',
  predicted: 'announce',
  announced: 'pay',
};

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const s = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays < 0) return `${s} · 已过期`;
  if (diffDays === 0) return `${s} · 今天`;
  if (diffDays <= 7) return `${s} · ${diffDays} 天后`;
  return s;
}

export default function EventCard({
  event,
  selecting,
  selected,
  onToggle,
}: {
  event: ClientEvent;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [editStage, setEditStage] = useState<Stage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const canAdvance = event.status !== 'paid';
  const merged = event.children.length > 0;
  const agg = aggregate(event);

  async function advance(cents: number, atISO: string | null) {
    const action = ADVANCE_ACTION[event.status];
    if (!action) return;
    const payload: Record<string, unknown> = { action, at: atISO };
    if (action === 'predict') payload.predictedCents = cents;
    if (action === 'announce') payload.announcedCents = cents;
    if (action === 'pay') payload.paidCents = cents;
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '失败');
    setAdvanceOpen(false);
    router.refresh();
  }

  async function editAmount(stage: Stage, cents: number, atISO: string | null) {
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'editAmount', stage, cents, at: atISO }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '失败');
    setEditStage(null);
    router.refresh();
  }

  async function clearStage(stage: Stage) {
    const labels = { predicted: '预测', announced: '公示', paid: '到账' } as const;
    if (!confirm(`删除 ${labels[stage]} 金额？状态会退回到上一步。`)) return;
    setBusy(true);
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearStage', stage }),
    });
    if (res.ok) router.refresh();
    else setBusy(false);
  }

  async function del() {
    if (!confirm(`删除活动 "${event.title}"？${merged ? '子活动会被恢复为独立活动。' : ''}`)) return;
    setBusy(true);
    const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setBusy(false);
  }

  async function copyTag() {
    if (!event.topicTag) return;
    try {
      await navigator.clipboard.writeText(event.topicTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = event.topicTag;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const advanceLabel = canAdvance ? NEXT_LABEL[event.status] : '';

  return (
    <div
      className={`p-4 rounded-2xl border ${
        selected
          ? 'bg-ink-100 dark:bg-ink-700 border-ink-400'
          : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
      }`}
    >
      <div className="flex items-start gap-3">
        {selecting && (
          <button
            onClick={onToggle}
            className={`shrink-0 mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              selected
                ? 'bg-ink-900 dark:bg-ink-100 border-ink-900 dark:border-ink-100 text-white dark:text-ink-900'
                : 'border-ink-300 dark:border-ink-600'
            }`}
            aria-label={selected ? '取消选择' : '选择'}
          >
            {selected && <span className="text-[10px]">✓</span>}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate flex items-center gap-2">
            <span className="truncate">{event.title}</span>
            {merged && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                已合并 {event.children.length}
              </span>
            )}
            {event.rewardMethod && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300">
                {rewardMethodLabel(event.rewardMethod)}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-ink-500 space-y-0.5">
            {event.startAt && <div>开始 {formatShort(event.startAt)}</div>}
            {event.deadline && <div>截止 {formatDeadline(event.deadline)}</div>}
            {event.reward && <div className="truncate">奖励：{event.reward}</div>}
            {event.content && <div className="truncate">内容：{event.content}</div>}
            {event.note && <div className="truncate">备注：{event.note}</div>}
          </div>
          {event.topicTag && (
            <button
              onClick={copyTag}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-ink-50 dark:bg-ink-700 text-xs text-ink-700 dark:text-ink-200 active:scale-[0.97]"
            >
              <span className="truncate max-w-[16rem]">{event.topicTag}</span>
              <span className="text-ink-400">{copied ? '已复制' : '复制'}</span>
            </button>
          )}
        </div>
        {!selecting && (
          <button
            onClick={del}
            disabled={busy}
            className="shrink-0 text-ink-300 hover:text-red-500 text-xs px-1 disabled:opacity-30"
            aria-label="删除"
          >
            ✕
          </button>
        )}
      </div>

      {(agg.predicted !== null || agg.announced !== null || agg.paid !== null) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <StageSlot
            label={merged ? '预测合计' : '预测'}
            cents={agg.predicted}
            onEdit={
              !merged && event.predictedCents !== null
                ? () => setEditStage('predicted')
                : undefined
            }
            onClear={
              !merged && event.predictedCents !== null
                ? () => clearStage('predicted')
                : undefined
            }
            at={event.predictedAt}
          />
          <StageSlot
            label={merged ? '公示合计' : '公示'}
            cents={agg.announced}
            onEdit={
              !merged && event.announcedCents !== null
                ? () => setEditStage('announced')
                : undefined
            }
            onClear={
              !merged && event.announcedCents !== null
                ? () => clearStage('announced')
                : undefined
            }
            at={event.announcedAt}
          />
          <StageSlot
            label={merged ? '到账合计' : '到账'}
            cents={agg.paid}
            highlight={event.status === 'paid'}
            onEdit={
              !merged && event.paidCents !== null ? () => setEditStage('paid') : undefined
            }
            onClear={
              !merged && event.paidCents !== null ? () => clearStage('paid') : undefined
            }
            at={event.paidAt}
          />
        </div>
      )}

      {agg.announced !== null && agg.announced > 0 && (
        <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 p-3 text-xs">
          <div className="text-amber-800 dark:text-amber-300 flex items-center justify-between">
            <span>税后金额（劳务报酬）</span>
            <span className="num font-semibold text-base">
              {formatYuan(afterTaxCents(agg.announced))}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-amber-700/80 dark:text-amber-400/70 num">
            公示 {formatYuan(agg.announced)} · 应纳税 {formatYuan(calcTaxCents(agg.announced))}
          </div>
        </div>
      )}

      {merged && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-ink-500 underline"
        >
          {expanded ? '收起子活动' : `展开 ${event.children.length} 个子活动`}
        </button>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 pl-3 border-l-2 border-ink-200 dark:border-ink-700">
          {event.children.map((c) => (
            <ChildRow key={c.id} child={c} onChange={() => router.refresh()} />
          ))}
        </div>
      )}

      {canAdvance && !selecting && (
        <button
          onClick={() => setAdvanceOpen(true)}
          className="mt-3 w-full py-2.5 rounded-xl bg-ink-50 dark:bg-ink-700 text-sm active:scale-[0.98]"
        >
          {advanceLabel} →
        </button>
      )}

      {advanceOpen && canAdvance && (
        <AmountEditor
          title={advanceLabel + '（元）'}
          onCancel={() => setAdvanceOpen(false)}
          onSubmit={advance}
        />
      )}

      {editStage && (
        <AmountEditor
          title={`修改${editStage === 'predicted' ? '预测' : editStage === 'announced' ? '公示' : '到账'}金额（元）`}
          initialAmountCents={
            editStage === 'predicted'
              ? event.predictedCents
              : editStage === 'announced'
                ? event.announcedCents
                : event.paidCents
          }
          initialAt={
            editStage === 'predicted'
              ? event.predictedAt
              : editStage === 'announced'
                ? event.announcedAt
                : event.paidAt
          }
          onCancel={() => setEditStage(null)}
          onSubmit={(cents, at) => editAmount(editStage, cents, at)}
        />
      )}
    </div>
  );
}

function StageSlot({
  label,
  cents,
  highlight,
  onEdit,
  onClear,
  at,
}: {
  label: string;
  cents: number | null;
  highlight?: boolean;
  onEdit?: () => void;
  onClear?: () => void;
  at?: string | null;
}) {
  return (
    <div
      className={`p-2 rounded-lg ${highlight ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-ink-50 dark:bg-ink-700'}`}
    >
      <div className="text-[10px] text-ink-500">{label}</div>
      <div className="num text-sm font-medium mt-0.5">
        {cents !== null ? formatYuan(cents) : '—'}
      </div>
      {at && <div className="text-[9px] text-ink-400 mt-0.5">{formatShort(at).slice(5)}</div>}
      {(onEdit || onClear) && (
        <div className="mt-1 flex justify-center gap-2 text-[10px]">
          {onEdit && (
            <button onClick={onEdit} className="text-ink-500 underline">
              改
            </button>
          )}
          {onClear && (
            <button onClick={onClear} className="text-red-500 underline">
              删
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChildRow({ child, onChange }: { child: ClientEvent; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  async function detach() {
    if (!confirm(`把 "${child.title}" 摘出？`)) return;
    setBusy(true);
    const res = await fetch(`/api/events/${child.id}/unmerge`, { method: 'POST' });
    if (res.ok) onChange();
    else setBusy(false);
  }
  return (
    <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-800/60 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate">{child.title}</div>
        <div className="text-[10px] text-ink-500 num">
          {child.predictedCents !== null && <>预 {formatYuan(child.predictedCents)} </>}
          {child.announcedCents !== null && <>公 {formatYuan(child.announcedCents)} </>}
          {child.paidCents !== null && <>到 {formatYuan(child.paidCents)}</>}
        </div>
      </div>
      <button
        onClick={detach}
        disabled={busy}
        className="text-[10px] text-ink-500 underline disabled:opacity-30"
      >
        摘出
      </button>
    </div>
  );
}
