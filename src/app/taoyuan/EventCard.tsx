'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatYuan, yuanToCents } from '@/lib/money';

type Props = {
  id: string;
  title: string;
  status: string;
  participate: boolean;
  deadline: string | null;
  predictedCents: number | null;
  announcedCents: number | null;
  paidCents: number | null;
  note: string | null;
};

const NEXT_LABEL: Record<string, string> = {
  published: '填写预测收入',
  predicted: '登记公示奖金',
  announced: '确认到账金额',
};

const NEXT_ACTION: Record<string, 'predict' | 'announce' | 'pay'> = {
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

export default function EventCard(props: Props) {
  const router = useRouter();
  const [openAdvance, setOpenAdvance] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canAdvance = props.status !== 'paid';
  const nextAction = canAdvance ? NEXT_ACTION[props.status] : null;
  const nextLabel = canAdvance ? NEXT_LABEL[props.status] : '';

  async function advance() {
    setError('');
    const cents = yuanToCents(amount);
    if (cents === null || cents === 0) {
      setError('金额格式不正确');
      return;
    }
    if (!nextAction) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { action: nextAction };
      if (nextAction === 'predict') payload.predictedCents = cents;
      if (nextAction === 'announce') payload.announcedCents = cents;
      if (nextAction === 'pay') payload.paidCents = cents;

      const res = await fetch(`/api/events/${props.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '失败');
      setOpenAdvance(false);
      setAmount('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '失败');
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!confirm(`删除活动 "${props.title}"？`)) return;
    setBusy(true);
    const res = await fetch(`/api/events/${props.id}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setBusy(false);
  }

  // 预测 vs 公示 vs 到账 差异
  const diffs: { label: string; from: number; to: number }[] = [];
  if (props.announcedCents !== null && props.predictedCents !== null) {
    diffs.push({
      label: '公示 vs 预测',
      from: props.predictedCents,
      to: props.announcedCents,
    });
  }
  if (props.paidCents !== null && props.announcedCents !== null) {
    diffs.push({
      label: '到账 vs 公示',
      from: props.announcedCents,
      to: props.paidCents,
    });
  }

  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{props.title}</div>
          {props.deadline && (
            <div className="text-xs text-ink-500 mt-0.5">{formatDeadline(props.deadline)}</div>
          )}
          {props.note && <div className="text-xs text-ink-400 mt-1 truncate">{props.note}</div>}
        </div>
        <button
          onClick={del}
          disabled={busy}
          className="text-ink-300 hover:text-red-500 text-xs px-1 disabled:opacity-30"
          aria-label="删除"
        >
          ✕
        </button>
      </div>

      {(props.predictedCents !== null ||
        props.announcedCents !== null ||
        props.paidCents !== null) && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Slot label="预测" cents={props.predictedCents} />
          <Slot label="公示" cents={props.announcedCents} />
          <Slot label="到账" cents={props.paidCents} highlight={props.status === 'paid'} />
        </div>
      )}

      {diffs.length > 0 && (
        <div className="mt-2 text-xs text-ink-500 space-y-0.5 num">
          {diffs.map((d, i) => {
            const delta = d.to - d.from;
            return (
              <div key={i}>
                {d.label}:{' '}
                <span className={delta === 0 ? '' : delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                  {formatYuan(delta, { sign: true })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {canAdvance && !openAdvance && (
        <button
          onClick={() => setOpenAdvance(true)}
          className="mt-3 w-full py-2.5 rounded-xl bg-ink-50 dark:bg-ink-700 text-sm active:scale-[0.98]"
        >
          {nextLabel} →
        </button>
      )}

      {openAdvance && (
        <div className="mt-3 p-3 rounded-xl bg-ink-50 dark:bg-ink-700">
          <div className="text-xs text-ink-500 mb-2">{nextLabel} (元)</div>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-lg num focus:outline-none"
          />
          {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                setOpenAdvance(false);
                setAmount('');
                setError('');
              }}
              className="flex-1 py-2 rounded-lg text-sm text-ink-500"
            >
              取消
            </button>
            <button
              onClick={advance}
              disabled={busy}
              className="flex-1 py-2 rounded-lg bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm disabled:opacity-50"
            >
              {busy ? '…' : '确定'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Slot({ label, cents, highlight }: { label: string; cents: number | null; highlight?: boolean }) {
  return (
    <div
      className={`p-2 rounded-lg ${highlight ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-ink-50 dark:bg-ink-700'}`}
    >
      <div className="text-[10px] text-ink-500">{label}</div>
      <div className="num text-sm font-medium mt-0.5">
        {cents !== null ? formatYuan(cents) : '—'}
      </div>
    </div>
  );
}
