'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatShort } from '@/lib/datetime';
import { rewardMethodLabel } from '@/lib/rewardMethod';
import { afterTaxCents, calcTaxCents } from '@/lib/tax';
import type { Stage } from '@/lib/amounts';
import Money from '@/components/ui/Money';
import Lightbox from '@/components/ui/Lightbox';
import type { ClientEvent } from './types';
import { aggregateCount, aggregateNonMoney, aggregateSum, aggregateTaxSplit, hasMoney } from './types';
import RewardValue from '@/components/ui/RewardValue';
import type { NonMoneySummary } from '@/lib/amounts';
import StageDetail from './StageDetail';
import EditEventModal from './EditEventModal';
import { useConfirm } from '@/components/ui/Dialog';

const STAGE_LABEL: Record<Stage, string> = {
  predicted: '预测收入',
  announced: '公示奖金',
  paid: '到账金额',
};

function DeadlineBadge({ iso }: { iso: string }) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const s = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400 font-normal">
        <span>截止 {s}</span>
        <span className="text-[11px] px-1 py-0.2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 font-normal">
          已过期
        </span>
      </span>
    );
  }
  if (diffDays === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold">
        <span>截止 {s}</span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 font-extrabold animate-pulse">
          今天截止
        </span>
      </span>
    );
  }
  if (diffDays <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
        <span>截止 {s}</span>
        <span className="text-[11px] px-1.5 py-0.2 rounded-md bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300 font-semibold">
          {diffDays} 天后
        </span>
      </span>
    );
  }
  return <span className="text-ink-500 dark:text-ink-400 font-normal">截止 {s}</span>;
}

export default function EventCard({
  event,
  selecting,
  selected,
  onToggle,
  canEdit = true,
}: {
  event: ClientEvent;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
  /** 只读协作者(viewer)传 false：隐藏编辑/删除/摘出/金额增删改。默认可写。 */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  const [openStage, setOpenStage] = useState<Stage | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoomImg, setZoomImg] = useState<{ urls: string[]; index: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();

  const merged = event.children.length > 0;

  const sums: Record<Stage, number> = {
    predicted: aggregateSum(event, 'predicted'),
    announced: aggregateSum(event, 'announced'),
    paid: aggregateSum(event, 'paid'),
  };
  const counts: Record<Stage, number> = {
    predicted: aggregateCount(event, 'predicted'),
    announced: aggregateCount(event, 'announced'),
    paid: aggregateCount(event, 'paid'),
  };
  // 非金额奖励（Q币个数、周边名目）与该阶段有没有金额分开算 ——
  // 只发了 Q币的阶段金额是 0，但不能显示成 0.00，那会让人以为没发东西
  const nonMoney: Record<Stage, NonMoneySummary[]> = {
    predicted: aggregateNonMoney(event, 'predicted'),
    announced: aggregateNonMoney(event, 'announced'),
    paid: aggregateNonMoney(event, 'paid'),
  };
  const moneyFlags: Record<Stage, boolean> = {
    predicted: hasMoney(event, 'predicted'),
    announced: hasMoney(event, 'announced'),
    paid: hasMoney(event, 'paid'),
  };

  async function del() {
    const ok = await confirm({
      title: `删除活动 "${event.title}"？`,
      body: merged ? '子活动会被恢复为独立活动。' : '此活动的所有金额记录会一并删除。',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    setHidden(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setHidden(false);
    }
  }

  async function copyTag() {
    if (!event.topicTag) return;
    try {
      await navigator.clipboard.writeText(event.topicTag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
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

  if (hidden) return null;

  return (
    <div
      className={`p-4 rounded-2xl border transition ${
        selected
          ? 'bg-ink-100 dark:bg-ink-700 border-ink-400'
          : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
      } ${pending ? 'opacity-80' : ''}`}
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
          <div className="font-medium flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {event.eventNo !== null && event.eventNo !== undefined && (
              <span className="shrink-0 text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-700 dark:text-ink-200 border border-ink-200 dark:border-ink-600">
                #{event.eventNo}
              </span>
            )}
            <span className="break-all">{event.title}</span>
            {merged && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                已合并 {event.children.length}
              </span>
            )}
            {event.rewardMethods.map((m) => (
              <span
                key={m}
                className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-300"
              >
                {rewardMethodLabel(m)}
              </span>
            ))}
          </div>
          <div className="mt-0.5 text-xs text-ink-500 space-y-0.5">
            {event.startAt && <div>开始 {formatShort(event.startAt)}</div>}
            {event.deadline && <div><DeadlineBadge iso={event.deadline} /></div>}
            {event.reward && <div className="break-all">奖励：{event.reward}</div>}
            {event.content && <div className="break-all">内容：{event.content}</div>}
            {event.note && <div className="break-all">备注：{event.note}</div>}
          </div>

          {event.contentImages.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {event.contentImages.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setZoomImg({ urls: event.contentImages, index: i })}
                  className="aspect-square rounded-lg overflow-hidden bg-ink-100 dark:bg-ink-700"
                  aria-label={`查看图片 ${i + 1}`}
                >
                  { }
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {event.topicTag && (
            <button
              onClick={copyTag}
              className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-ink-50 dark:bg-ink-700 text-xs text-ink-700 dark:text-ink-200 active:scale-[0.97]"
            >
              <span className="break-all">{event.topicTag}</span>
              <span className="text-ink-400">{copied ? '已复制' : '复制'}</span>
            </button>
          )}
        </div>
        {/* 编辑/删除（只读协作者 viewer 隐藏） */}
        {!selecting && canEdit && (
          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-ink-400 hover:text-ink-700 dark:hover:text-ink-100 text-xs px-1"
              aria-label="编辑活动"
              title="编辑"
            >
              ✎
            </button>
            <button
              onClick={del}
              className="text-ink-300 hover:text-red-500 text-xs px-1"
              aria-label="删除"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['predicted', 'announced', 'paid'] as Stage[]).map((s) => (
          <StageButton
            key={s}
            stage={s}
            label={STAGE_LABEL[s]}
            sum={sums[s]}
            count={counts[s]}
            hasMoney={moneyFlags[s]}
            nonMoney={nonMoney[s]}
            highlight={s === 'paid' && sums.paid > 0}
            disabled={selecting}
            onClick={() => setOpenStage(s)}
          />
        ))}
      </div>

      {sums.announced > 0 && (() => {
        // 京东卡不并入税基 —— 实物等价物在劳务报酬预扣里不参与个税，
        // 之前用 afterTaxCents(sums.announced) 把它一起算了会多扣税
        const { taxable, nonTaxable } = aggregateTaxSplit(event, 'announced');
        const tax = calcTaxCents(taxable);
        const afterTax = afterTaxCents(taxable) + nonTaxable;
        return (
          <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 p-3 text-xs">
            <div className="text-amber-800 dark:text-amber-300 flex items-center justify-between">
              <span>税后金额（劳务报酬）</span>
              <span className="num font-semibold text-base">
                <Money cents={afterTax} />
              </span>
            </div>
            <div className="mt-1 text-[10px] text-amber-700/80 dark:text-amber-400/70 num">
              公示 <Money cents={sums.announced} /> · 应纳税{' '}
              <Money cents={tax} />
              {nonTaxable > 0 && (
                <> · 京东卡 <Money cents={nonTaxable} /> 不计税</>
              )}
            </div>
          </div>
        );
      })()}

      {/* 展开子活动与时间线 */}
      <div className="mt-3 flex items-center gap-4 text-xs text-ink-500">
        {merged && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="underline"
          >
            {expanded ? '收起子活动' : `展开 ${event.children.length} 个子活动`}
          </button>
        )}
        <button
          onClick={() => setShowTimeline(!showTimeline)}
          className="underline inline-flex items-center gap-1 hover:text-ink-700 dark:hover:text-ink-300 transition"
        >
          <span>⏱</span>
          <span>{showTimeline ? '收起推进时间线' : '查看推进时间线'}</span>
        </button>
      </div>

      {showTimeline && (
        <EventTimeline event={event} sums={sums} />
      )}

      {expanded && merged && (
        <div className="mt-3 space-y-2 pl-3 border-l-2 border-ink-200 dark:border-ink-700">
          {event.children.map((c) => (
            <ChildRow
              key={c.id}
              child={c}
              canEdit={canEdit}
              onChange={() => startTransition(() => router.refresh())}
            />
          ))}
        </div>
      )}

      {openStage && (
        <StageDetail
          event={event}
          stage={openStage}
          canEdit={canEdit}
          onClose={() => setOpenStage(null)}
          onChanged={() => startTransition(() => router.refresh())}
        />
      )}

      {zoomImg && (
        <Lightbox images={zoomImg.urls} index={zoomImg.index} onClose={() => setZoomImg(null)} />
      )}

      {editing && (
        <EditEventModal
          event={event}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            startTransition(() => router.refresh());
          }}
        />
      )}
    </div>
  );
}

function StageButton({
  label,
  sum,
  count,
  hasMoney,
  nonMoney,
  highlight,
  disabled,
  onClick,
}: {
  stage: Stage;
  label: string;
  sum: number;
  count: number;
  hasMoney: boolean;
  nonMoney: NonMoneySummary[];
  highlight: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const hasValue = count > 0;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-3 rounded-xl text-center transition active:scale-[0.97] disabled:opacity-50 border ${
        highlight
          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700'
          : 'bg-ink-50 dark:bg-ink-700 text-ink-900 dark:text-ink-100 border-ink-200 dark:border-ink-600'
      }`}
    >
      <div className="text-[10px] opacity-70">
        {label}
        {hasValue && count > 1 && <span> · {count}</span>}
      </div>
      <div className="num text-sm font-bold mt-0.5">
        {hasValue ? (
          <RewardValue cents={sum} hasMoney={hasMoney} nonMoney={nonMoney} />
        ) : (
          '+ 填写'
        )}
      </div>
    </button>
  );
}

function ChildRow({
  child,
  onChange,
  canEdit = true,
}: {
  child: ClientEvent;
  onChange: () => void;
  canEdit?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const pSum = aggregateSum(child, 'predicted');
  const aSum = aggregateSum(child, 'announced');
  const paidSum = aggregateSum(child, 'paid');
  async function detach() {
    const ok = await confirm({ title: `把 "${child.title}" 摘出？`, body: '会恢复为独立活动。', confirmText: '摘出' });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/events/${child.id}/unmerge`, { method: 'POST' });
    if (res.ok) onChange();
    else setBusy(false);
  }
  return (
    <div className="p-2 rounded-lg bg-ink-50 dark:bg-ink-800/60 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium break-all">{child.title}</div>
        <div className="text-[10px] text-ink-500 num">
          {pSum > 0 && <>预 <Money cents={pSum} /> </>}
          {aSum > 0 && <>公 <Money cents={aSum} /> </>}
          {paidSum > 0 && <>到 <Money cents={paidSum} /></>}
        </div>
      </div>
      {/* 摘出（拆分合并活动，写操作）：只读协作者 viewer 隐藏。 */}
      {canEdit && (
        <button
          onClick={detach}
          disabled={busy}
          className="text-[10px] text-ink-500 underline disabled:opacity-30"
        >
          摘出
        </button>
      )}
    </div>
  );
}

function EventTimeline({
  event,
  sums,
}: {
  event: ClientEvent;
  sums: Record<Stage, number>;
}) {
  const isPaid = event.status === 'paid';
  const isAnnounced = isPaid || event.status === 'announced';
  const isPredicted = isAnnounced || event.status === 'predicted';

  const steps = [
    {
      key: 'published',
      label: '活动发布',
      active: true,
      time: event.publishedAt ? formatShort(event.publishedAt) : null,
      desc: event.participate ? '参与中 · 首页待办提醒' : '已发布',
      badgeColor: 'bg-blue-500 text-white',
    },
    {
      key: 'predicted',
      label: '预测收入',
      active: isPredicted,
      time: event.predictedAt ? formatShort(event.predictedAt) : null,
      desc: sums.predicted > 0 ? (
        <span>预估 <Money cents={sums.predicted} /></span>
      ) : isPredicted ? '已进入预测阶段' : '待录入预测',
      badgeColor: isPredicted ? 'bg-indigo-500 text-white' : 'bg-ink-300 dark:bg-ink-600 text-white',
    },
    {
      key: 'announced',
      label: '公示奖金',
      active: isAnnounced,
      time: event.announcedAt ? formatShort(event.announcedAt) : null,
      desc: sums.announced > 0 ? (
        <span>公示 <Money cents={sums.announced} /></span>
      ) : isAnnounced ? '已进入公示阶段' : '待公示',
      badgeColor: isAnnounced ? 'bg-amber-500 text-white' : 'bg-ink-300 dark:bg-ink-600 text-white',
    },
    {
      key: 'paid',
      label: '资金到账',
      active: isPaid,
      time: event.paidAt ? formatShort(event.paidAt) : null,
      desc: sums.paid > 0 ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
          到账 <Money cents={sums.paid} />
        </span>
      ) : isPaid ? '已到账' : '待发钱到账',
      badgeColor: isPaid ? 'bg-emerald-500 text-white' : 'bg-ink-300 dark:bg-ink-600 text-white',
    },
  ];

  return (
    <div className="mt-3 p-3.5 rounded-xl bg-ink-50/80 dark:bg-ink-900/40 border border-ink-200/60 dark:border-ink-700/50">
      <div className="text-[11px] font-medium text-ink-600 dark:text-ink-300 mb-2.5 flex items-center justify-between">
        <span>活动推进生命周期</span>
        <span className="text-[10px] text-ink-400 font-normal">状态根据金额明细自动流转</span>
      </div>
      <div className="relative pl-3 space-y-3 before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-ink-200 dark:before:bg-ink-700">
        {steps.map((step, idx) => (
          <div key={step.key} className="relative flex items-start gap-2.5">
            <div
              className={`relative z-10 w-3 h-3 rounded-full flex items-center justify-center text-[8px] mt-0.5 ${step.badgeColor}`}
            >
              {step.active ? '✓' : ''}
            </div>
            <div className="flex-1 min-w-0 text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`font-medium ${step.active ? 'text-ink-900 dark:text-ink-100' : 'text-ink-400 dark:text-ink-500'}`}>
                  {idx + 1}. {step.label}
                </span>
                {step.time && (
                  <span className="text-[10px] text-ink-400 num">{step.time}</span>
                )}
              </div>
              <div className="text-[11px] text-ink-500 mt-0.5">
                {step.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
