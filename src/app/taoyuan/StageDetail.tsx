'use client';

import { useEffect, useState } from 'react';
import Money from '@/components/ui/Money';
import { formatShort, localInputToISO, toLocalInput } from '@/lib/datetime';
import { yuanToCents } from '@/lib/money';
import { rewardMethodLabel, rewardValueKind } from '@/lib/rewardMethod';
import type { Stage } from '@/lib/amounts';
import type { ClientEvent } from './types';
import { useConfirm } from '@/components/ui/Dialog';
import { nonMoneyText } from '@/components/ui/RewardValue';
import type { AmountEntry } from '@/lib/amounts';

/** 单条奖励的展示：金额走 Money（受隐藏开关控制），个数与文字直接显示 */
function AmountValue({ a, className }: { a: AmountEntry; className?: string }) {
  if (a.kind === 'money') return <span className={className}><Money cents={a.cents} /></span>;
  return (
    <span className={className}>
      {nonMoneyText({
        rewardMethod: a.rewardMethod ?? '',
        kind: a.kind,
        total: a.quantity ?? 0,
        items: a.itemDesc ? [a.itemDesc] : [],
      })}
    </span>
  );
}

// 金额 / 个数 / 文字三种输入框共用的大号样式 —— 抄三遍必然改漏一处
const bigInputCls =
  'mt-1 w-full px-4 py-4 text-2xl num rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';

const STAGE_TITLE: Record<Stage, string> = {
  predicted: '预测收入',
  announced: '公示奖金',
  paid: '到账金额',
};

export default function StageDetail({
  event,
  stage,
  onClose,
  onChanged,
}: {
  event: ClientEvent;
  stage: Stage;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // 父卡片进入时展示 本卡的条目 + 子卡片对应 stage 的条目（只读）
  const own = event.amounts.filter((a) => a.stage === stage);
  const fromChildren = event.children.flatMap((c) =>
    c.amounts
      .filter((a) => a.stage === stage)
      .map((a) => ({ ...a, __from: c.title })),
  );
  // 合计只算金额类 —— Q币个数、周边件数不是钱
  const total =
    own.filter((e) => e.kind === 'money').reduce((a, e) => a + e.cents, 0) +
    fromChildren.filter((e) => e.kind === 'money').reduce((a, e) => a + e.cents, 0);

  // 自动初始化：如果本 stage 没有任何条目 → 直接进入新增
  useEffect(() => {
    if (own.length === 0 && fromChildren.length === 0 && !adding && !editingId) {
      setAdding(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-lg font-medium">{STAGE_TITLE[stage]}</h3>
          <div className="num text-2xl font-bold">
            <Money cents={total} />
          </div>
        </div>

        {editingId ? (
          <AmountEditor
            eventId={event.id}
            stage={stage}
            amount={own.find((a) => a.id === editingId)!}
            rewardMethodOptions={event.rewardMethods}
            onCancel={() => setEditingId(null)}
            onDone={() => {
              setEditingId(null);
              onChanged();
            }}
          />
        ) : adding ? (
          <AmountEditor
            eventId={event.id}
            stage={stage}
            rewardMethodOptions={event.rewardMethods}
            onCancel={() => {
              setAdding(false);
              if (own.length === 0 && fromChildren.length === 0) onClose();
            }}
            onDone={() => {
              setAdding(false);
              onChanged();
            }}
          />
        ) : (
          <>
            <div className="space-y-2">
              {own.map((a) => (
                <AmountRow
                  key={a.id}
                  eventId={event.id}
                  amount={a}
                  onEdit={() => setEditingId(a.id)}
                  onDeleted={onChanged}
                />
              ))}
              {fromChildren.map((a) => (
                <div
                  key={`c-${a.id}`}
                  className="p-3 rounded-xl bg-ink-50 dark:bg-ink-800 opacity-80"
                >
                  <div className="flex items-baseline justify-between">
                    <AmountValue a={a} className="num text-sm font-medium" />
                    <div className="text-[10px] text-ink-500">来自: {a.__from}</div>
                  </div>
                  <div className="text-[11px] text-ink-500 mt-1">
                    {formatShort(a.occurredAt)}
                    {a.rewardMethod && <> · {rewardMethodLabel(a.rewardMethod)}</>}
                    {a.note && <> · {a.note}</>}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setAdding(true)}
              className="mt-4 w-full py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-semibold"
            >
              + 添加一条
            </button>
            <button
              onClick={onClose}
              className="mt-2 w-full py-3 rounded-2xl text-ink-500"
            >
              关闭
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// —— 条目行（含改/删按钮） ——
function AmountRow({
  eventId,
  amount,
  onEdit,
  onDeleted,
}: {
  eventId: string;
  amount: AmountEntry;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const isLegacy = amount.id.startsWith('legacy:');

  async function del() {
    const ok = await confirm({
      title: '删除这条金额？',
      body:
        amount.kind === 'money'
          ? `${(amount.cents / 100).toFixed(2)} 元`
          : nonMoneyText({
              rewardMethod: amount.rewardMethod ?? '',
              kind: amount.kind,
              total: amount.quantity ?? 0,
              items: amount.itemDesc ? [amount.itemDesc] : [],
            }),
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(`/api/events/${eventId}/amounts/${amount.id}`, {
      method: 'DELETE',
    });
    if (res.ok) onDeleted();
    else setBusy(false);
  }

  return (
    <div className="p-3 rounded-xl bg-ink-50 dark:bg-ink-800">
      <div className="flex items-baseline justify-between">
        <AmountValue a={amount} className="num text-base font-medium" />
        {!isLegacy && (
          <div className="flex gap-3 text-xs">
            <button onClick={onEdit} className="text-ink-500 underline">
              改
            </button>
            <button
              onClick={del}
              disabled={busy}
              className="text-red-500 underline disabled:opacity-30"
            >
              删
            </button>
          </div>
        )}
      </div>
      <div className="text-[11px] text-ink-500 mt-1">
        {formatShort(amount.occurredAt)}
        {amount.rewardMethod && <> · {rewardMethodLabel(amount.rewardMethod)}</>}
        {isLegacy && <> · 旧数据</>}
      </div>
      {amount.note && (
        <div className="text-xs text-ink-500 mt-1 break-all">备注：{amount.note}</div>
      )}
    </div>
  );
}

// —— 添加/编辑金额表单 ——
function AmountEditor({
  eventId,
  stage,
  amount,
  rewardMethodOptions,
  onCancel,
  onDone,
}: {
  eventId: string;
  stage: Stage;
  amount?: {
    id: string;
    cents: number;
    quantity: number | null;
    itemDesc: string | null;
    note: string | null;
    rewardMethod: string | null;
    occurredAt: string;
  };
  rewardMethodOptions: string[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const editing = !!amount;
  const [cents, setCents] = useState(amount ? (amount.cents / 100).toFixed(2) : '');
  const [quantity, setQuantity] = useState(amount?.quantity ? String(amount.quantity) : '');
  const [itemDesc, setItemDesc] = useState(amount?.itemDesc ?? '');
  const [note, setNote] = useState(amount?.note ?? '');
  const [rewardMethod, setRewardMethod] = useState(amount?.rewardMethod ?? '');
  const [at, setAt] = useState(
    amount ? toLocalInput(amount.occurredAt) : toLocalInput(new Date()),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 输入框随发放方式切换：金额 / 个数 / 文字。
  // 判定用与服务端同一个 rewardValueKind，避免两边规则各写一份而走样
  const kind = rewardValueKind(rewardMethod || null);

  async function submit() {
    setError('');
    const payload: Record<string, unknown> = {};
    if (kind === 'money') {
      const c = yuanToCents(cents);
      if (c === null || c === 0) {
        setError('金额格式不正确');
        return;
      }
      payload.cents = c;
    } else if (kind === 'count') {
      const q = Number(quantity);
      if (!Number.isInteger(q) || q <= 0) {
        setError('请填写正整数个数');
        return;
      }
      payload.quantity = q;
    } else {
      if (!itemDesc.trim()) {
        setError('请填写奖励内容');
        return;
      }
      payload.itemDesc = itemDesc.trim();
    }
    setBusy(true);
    try {
      if (editing) {
        const res = await fetch(`/api/events/${eventId}/amounts/${amount!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            note: note.trim() || null,
            rewardMethod: rewardMethod || null,
            occurredAt: localInputToISO(at),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || '保存失败');
        }
      } else {
        const res = await fetch(`/api/events/${eventId}/amounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage,
            ...payload,
            note: note.trim() || null,
            rewardMethod: rewardMethod || null,
            occurredAt: localInputToISO(at),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || '保存失败');
        }
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
      setBusy(false);
    }
  }

  return (
    <div>
      {kind === 'money' && (
        <>
          <label className="block text-xs text-ink-500">金额（元）</label>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0.00"
            value={cents}
            onChange={(e) => setCents(e.target.value)}
            className={bigInputCls}
          />
        </>
      )}
      {kind === 'count' && (
        <>
          <label className="block text-xs text-ink-500">
            数量（{rewardMethodLabel(rewardMethod)} 多少个）
          </label>
          <input
            autoFocus
            inputMode="numeric"
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={bigInputCls}
          />
        </>
      )}
      {kind === 'text' && (
        <>
          <label className="block text-xs text-ink-500">
            奖励内容（什么{rewardMethodLabel(rewardMethod) || '奖励'}）
          </label>
          <input
            autoFocus
            placeholder="如：限量手办"
            value={itemDesc}
            onChange={(e) => setItemDesc(e.target.value)}
            maxLength={200}
            className={bigInputCls}
          />
        </>
      )}

      <label className="block mt-3 text-xs text-ink-500">备注</label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={200}
        className="mt-1 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
      />

      {rewardMethodOptions.length > 0 && (
        <>
          <label className="block mt-3 text-xs text-ink-500">奖励方式（此条金额）</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {rewardMethodOptions.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setRewardMethod(rewardMethod === m ? '' : m)}
                className={`px-3 py-1.5 rounded-xl text-sm ${
                  rewardMethod === m
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                    : 'bg-ink-50 dark:bg-ink-800'
                }`}
              >
                {rewardMethodLabel(m)}
              </button>
            ))}
          </div>
        </>
      )}

      <label className="block mt-3 text-xs text-ink-500">操作时间</label>
      <input
        type="datetime-local"
        value={at}
        onChange={(e) => setAt(e.target.value)}
        className="mt-1 w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400"
      />

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
          取消
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
        >
          {busy ? '…' : editing ? '保存' : '添加'}
        </button>
      </div>
    </div>
  );
}
