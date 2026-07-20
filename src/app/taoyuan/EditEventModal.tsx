'use client';

import { useState } from 'react';
import { REWARD_METHODS, rewardMethodLabel } from '@/lib/rewardMethod';
import { localInputToISO, toLocalInput } from '@/lib/datetime';
import ImageUploader from './ImageUploader';
import type { ClientEvent } from './types';

export default function EditEventModal({
  event,
  onClose,
  onSaved,
}: {
  event: ClientEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [startAt, setStartAt] = useState(event.startAt ? toLocalInput(event.startAt) : '');
  const [deadline, setDeadline] = useState(
    event.deadline ? toLocalInput(event.deadline) : '',
  );
  const [content, setContent] = useState(event.content ?? '');
  const [contentImages, setContentImages] = useState<string[]>(event.contentImages);
  const [reward, setReward] = useState(event.reward ?? '');
  const [rewardMethods, setRewardMethods] = useState<string[]>(event.rewardMethods);
  const [customMethod, setCustomMethod] = useState('');
  const [topicTag, setTopicTag] = useState(event.topicTag ?? '');
  const [participate, setParticipate] = useState(event.participate);
  const [note, setNote] = useState(event.note ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleMethod(m: string) {
    setRewardMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  function addCustomMethod() {
    const v = customMethod.trim();
    if (!v) return;
    const key = `custom:${v}`;
    if (rewardMethods.includes(key)) return;
    setRewardMethods((prev) => [...prev, key]);
    setCustomMethod('');
  }

  async function save() {
    setError('');
    if (!title.trim()) {
      setError('请输入活动名');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'meta',
          title: title.trim(),
          participate,
          startAt: localInputToISO(startAt),
          deadline: localInputToISO(deadline),
          content: content.trim() || null,
          contentImages,
          reward: reward.trim() || null,
          rewardMethods,
          topicTag: topicTag.trim() || null,
          note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">编辑活动</h3>

        <Field label="活动名 *">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className={inputCls}
          />
        </Field>

        <Field label="活动时间">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] text-ink-500 mb-1">开始</div>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <div className="text-[10px] text-ink-500 mb-1">截止</div>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </Field>

        <Field label="活动内容">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            rows={3}
            className={`${inputCls} resize-none`}
          />
          <div className="mt-2">
            <ImageUploader
              value={contentImages}
              onChange={setContentImages}
              namePrefix={title || '活动图片'}
              max={9}
            />
          </div>
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

        <Field label="奖励发放方式（多选）">
          <div className="grid grid-cols-3 gap-2">
            {REWARD_METHODS.map((m) => (
              <button
                type="button"
                key={m.key}
                onClick={() => toggleMethod(m.key)}
                className={`py-2 rounded-xl text-sm ${
                  rewardMethods.includes(m.key)
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900'
                    : 'bg-ink-50 dark:bg-ink-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={customMethod}
              onChange={(e) => setCustomMethod(e.target.value)}
              placeholder="自定义方式（例如：礼盒）"
              maxLength={64}
              className={`${inputCls} py-2 text-sm`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomMethod();
                }
              }}
            />
            <button
              type="button"
              onClick={addCustomMethod}
              className="px-4 rounded-2xl bg-ink-50 dark:bg-ink-800 text-sm"
            >
              加
            </button>
          </div>
          {rewardMethods.filter((m) => m.startsWith('custom:')).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {rewardMethods
                .filter((m) => m.startsWith('custom:'))
                .map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMethod(m)}
                    className="px-3 py-1 rounded-lg bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-xs flex items-center gap-1"
                  >
                    {rewardMethodLabel(m)}
                    <span className="opacity-70">✕</span>
                  </button>
                ))}
            </div>
          )}
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
            maxLength={500}
            className={inputCls}
          />
        </Field>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800">
            取消
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
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
