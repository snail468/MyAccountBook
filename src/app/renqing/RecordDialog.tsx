'use client';

import { useState, useEffect } from 'react';
import { RENQING_CATEGORIES, PERSON_GROUPS } from '@/lib/renqing';
import { useToast } from '@/components/ui/Dialog';

export type PersonOption = {
  id: string;
  name: string;
  relationship: string | null;
  group: string;
};

export type EventOption = {
  id: string;
  title: string;
  category: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDirection?: 'out' | 'in';
  initialPersonId?: string;
  initialEventId?: string;
  persons: PersonOption[];
  events: EventOption[];
  editingRecord?: {
    id: string;
    personId: string;
    eventId?: string | null;
    direction: string;
    amountCents: number;
    category: string;
    itemType: string;
    giftItemDesc?: string | null;
    occurredAt: string;
    isPendingReturn: boolean;
    note?: string | null;
  } | null;
};

export default function RecordDialog({
  open,
  onClose,
  onSuccess,
  initialDirection = 'out',
  initialPersonId,
  initialEventId,
  persons,
  events,
  editingRecord,
}: Props) {
  const toast = useToast();
  const [direction, setDirection] = useState<'out' | 'in'>(initialDirection);
  const [selectedPersonId, setSelectedPersonId] = useState(initialPersonId || '');
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonRelationship, setNewPersonRelationship] = useState('');
  const [newPersonGroup, setNewPersonGroup] = useState('other');

  const [eventId, setEventId] = useState(initialEventId || '');
  const [amountYuan, setAmountYuan] = useState('');
  const [category, setCategory] = useState<string>('婚礼');
  const [customCategory, setCustomCategory] = useState('');
  const [itemType, setItemType] = useState<'money' | 'gift' | 'both'>('money');
  const [giftItemDesc, setGiftItemDesc] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 10));
  const [isPendingReturn, setIsPendingReturn] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editingRecord) {
      setDirection(editingRecord.direction as 'out' | 'in');
      setSelectedPersonId(editingRecord.personId);
      setIsCreatingPerson(false);
      setEventId(editingRecord.eventId || '');
      setAmountYuan((editingRecord.amountCents / 100).toString());
      if (RENQING_CATEGORIES.includes(editingRecord.category as any)) {
        setCategory(editingRecord.category);
        setCustomCategory('');
      } else {
        setCategory('其他');
        setCustomCategory(editingRecord.category);
      }
      setItemType(editingRecord.itemType as any);
      setGiftItemDesc(editingRecord.giftItemDesc || '');
      setOccurredAt(editingRecord.occurredAt.slice(0, 10));
      setIsPendingReturn(editingRecord.isPendingReturn);
      setNote(editingRecord.note || '');
    } else {
      setDirection(initialDirection);
      setSelectedPersonId(initialPersonId || (persons[0]?.id ?? ''));
      setIsCreatingPerson(persons.length === 0);
      setNewPersonName('');
      setNewPersonRelationship('');
      setNewPersonGroup('other');
      setEventId(initialEventId || '');
      setAmountYuan('');
      setCategory('婚礼');
      setCustomCategory('');
      setItemType('money');
      setGiftItemDesc('');
      setOccurredAt(new Date().toISOString().slice(0, 10));
      setIsPendingReturn(initialDirection === 'in');
      setNote('');
    }
  }, [open, editingRecord, initialDirection, initialPersonId, initialEventId, persons]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const yuan = parseFloat(amountYuan);
    if (isNaN(yuan) || yuan < 0) {
      toast({ message: '请输入有效的金额', kind: 'error' });
      return;
    }
    const finalCategory = category === '其他' && customCategory.trim() ? customCategory.trim() : category;

    if (!isCreatingPerson && !selectedPersonId) {
      toast({ message: '请选择亲友联系人', kind: 'error' });
      return;
    }
    if (isCreatingPerson && !newPersonName.trim()) {
      toast({ message: '请输入亲友姓名', kind: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const payload: any = {
        direction,
        amountCents: Math.round(yuan * 100),
        category: finalCategory,
        itemType,
        giftItemDesc: giftItemDesc.trim() || null,
        occurredAt: new Date(occurredAt).toISOString(),
        isPendingReturn,
        note: note.trim() || null,
        eventId: eventId || null,
      };

      if (isCreatingPerson) {
        payload.newPersonName = newPersonName.trim();
        payload.newPersonRelationship = newPersonRelationship.trim() || null;
        payload.newPersonGroup = newPersonGroup;
      } else {
        payload.personId = selectedPersonId;
      }

      const url = editingRecord ? `/api/renqing/records/${editingRecord.id}` : '/api/renqing/records';
      const method = editingRecord ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      toast({ message: editingRecord ? '修改成功' : '记账成功', kind: 'success' });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ message: err.message || '操作失败', kind: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-ink-850 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-ink-100 dark:border-ink-800 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-ink-100 dark:border-ink-800">
          <h2 className="text-lg font-semibold">
            {editingRecord ? '编辑人情记录' : direction === 'out' ? '记一笔随礼出 💸' : '记一笔收礼入 🧧'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* 方向选择 */}
          {!editingRecord && (
            <div className="grid grid-cols-2 gap-2 p-1 bg-ink-100 dark:bg-ink-800 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setDirection('out');
                  setIsPendingReturn(false);
                }}
                className={`py-2 text-sm font-medium rounded-xl transition ${
                  direction === 'out'
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'text-ink-600 dark:text-ink-300 hover:text-ink-900'
                }`}
              >
                随礼出 (我送人)
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirection('in');
                  setIsPendingReturn(true);
                }}
                className={`py-2 text-sm font-medium rounded-xl transition ${
                  direction === 'in'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-ink-600 dark:text-ink-300 hover:text-ink-900'
                }`}
              >
                收礼入 (人送我)
              </button>
            </div>
          )}

          {/* 亲友选择 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-ink-600 dark:text-ink-300">
                亲友姓名 <span className="text-rose-500">*</span>
              </label>
              {!editingRecord && (
                <button
                  type="button"
                  onClick={() => setIsCreatingPerson(!isCreatingPerson)}
                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline"
                >
                  {isCreatingPerson ? '从已有亲友选择' : '＋ 新建联系人'}
                </button>
              )}
            </div>

            {isCreatingPerson ? (
              <div className="space-y-2 p-3 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200 dark:border-ink-700">
                <input
                  type="text"
                  required
                  placeholder="亲友姓名（如：张伟）"
                  value={newPersonName}
                  onChange={(e) => setNewPersonName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="身份关系（如：堂弟）"
                    value={newPersonRelationship}
                    onChange={(e) => setNewPersonRelationship(e.target.value)}
                    className="px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                  <select
                    value={newPersonGroup}
                    onChange={(e) => setNewPersonGroup(e.target.value)}
                    className="px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {PERSON_GROUPS.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                disabled={!!editingRecord}
                className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.relationship ? `(${p.relationship})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* 金额 */}
          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">
              礼金金额 (元) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 font-semibold">¥</span>
              <input
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={amountYuan}
                onChange={(e) => setAmountYuan(e.target.value)}
                className="w-full pl-8 pr-4 py-2.5 text-lg font-semibold rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>

          {/* 事由类别 */}
          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">事由缘由</label>
            <div className="flex flex-wrap gap-1.5">
              {RENQING_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 text-xs rounded-lg transition ${
                    category === cat
                      ? 'bg-rose-500 text-white font-medium'
                      : 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {category === '其他' && (
              <input
                type="text"
                placeholder="请输入具体事由（如：开业志禧）"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="mt-2 w-full px-3 py-1.5 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            )}
          </div>

          {/* 礼品形态 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">礼品形式</label>
              <select
                value={itemType}
                onChange={(e) => setItemType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
              >
                <option value="money">纯现金红包</option>
                <option value="gift">实物礼品</option>
                <option value="both">礼金 ＋ 实物</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">发生日期</label>
              <input
                type="date"
                required
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
              />
            </div>
          </div>

          {/* 实物说明 */}
          {itemType !== 'money' && (
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1">
                实物礼品描述 (金额请填写折价估值)
              </label>
              <input
                type="text"
                placeholder="如：茅台飞天2瓶、黄金手镯1只"
                value={giftItemDesc}
                onChange={(e) => setGiftItemDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
              />
            </div>
          )}

          {/* 关联大事件礼簿 */}
          {events.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1.5">归属大事件礼簿 (选填)</label>
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
              >
                <option value="">不归属特定事件</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.category})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 待还礼标记 */}
          {direction === 'in' && (
            <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={isPendingReturn}
                onChange={(e) => setIsPendingReturn(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
              />
              <span className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                标记为「待还礼」（对方日后办喜事需备礼）
              </span>
            </label>
          )}

          {/* 备注 */}
          <div>
            <label className="block text-xs font-medium text-ink-600 dark:text-ink-300 mb-1">备注说明 (选填)</label>
            <input
              type="text"
              placeholder="如：微信转账、夫妻同赴宴、代某某转交等"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition shadow-sm disabled:opacity-50"
            >
              {submitting ? '保存中...' : '确认保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
