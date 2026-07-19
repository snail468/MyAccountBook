'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { REWARD_METHODS } from '@/lib/rewardMethod';
import { localInputToISO } from '@/lib/datetime';

export default function NewEventButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [startAt, setStartAt] = useState('');
  const [deadline, setDeadline] = useState('');
  const [content, setContent] = useState('');
  const [reward, setReward] = useState('');
  const [rewardMethod, setRewardMethod] = useState<string>('');
  const [topicTag, setTopicTag] = useState('');
  const [participate, setParticipate] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reset() {
    setOpen(false);
    setTitle('');
    setStartAt('');
    setDeadline('');
    setContent('');
    setReward('');
    setRewardMethod('');
    setTopicTag('');
    setParticipate(true);
    setNote('');
    setError('');
  }

  async function save() {
    setError('');
    if (!title.trim()) {
      setError('请输入活动名');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          participate,
          startAt: localInputToISO(startAt),
          deadline: localInputToISO(deadline),
          content: content.trim() || null,
          reward: reward.trim() || null,
          rewardMethod: rewardMethod || null,
          topicTag: topicTag.trim() || null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      reset();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-4 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-base font-medium active:scale-[0.98] transition"
      >
        + 新活动
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={reset}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">新活动</h3>

        <Field label="活动名 *">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className={inputCls}
          />
        </Field>

        <Field label="活动开始时间">
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={inputCls}
          />
        </Field>

        <Field label="活动内容">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={500}
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>

        <Field label="活动奖励">
          <input
            value={reward}
            onChange={(e) => setReward(e.target.value)}
            maxLength={200}
            placeholder="例如：1000 元 或 500 京东卡"
            className={inputCls}
          />
        </Field>

        <Field label="奖励发放方式">
          <div className="grid grid-cols-3 gap-2">
            {REWARD_METHODS.map((m) => (
              <button
                type="button"
                key={m.key}
                onClick={() => setRewardMethod(rewardMethod === m.key ? '' : m.key)}
                className={`py-2 rounded-xl text-sm ${
                  rewardMethod === m.key
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                    : 'bg-ink-50 dark:bg-ink-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="话题 tag（用于一键复制）">
          <input
            value={topicTag}
            onChange={(e) => setTopicTag(e.target.value)}
            maxLength={200}
            placeholder="#桃源xxx 挑战 @xxx"
            className={inputCls}
          />
        </Field>

        <Field label="预测截止时间（可选）">
          <input
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={inputCls}
          />
        </Field>

        <label className="flex items-center gap-2 mt-3 text-sm text-ink-600 dark:text-ink-300">
          <input
            type="checkbox"
            checked={participate}
            onChange={(e) => setParticipate(e.target.checked)}
            className="w-4 h-4"
          />
          参与并在首页提醒
        </label>

        <Field label="备注">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className={inputCls}
          />
        </Field>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={reset} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
          >
            {saving ? '保存中…' : '发布'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-2 focus:ring-ink-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-ink-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
