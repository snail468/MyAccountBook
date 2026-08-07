'use client';

// 银行卡备份界面。
//
// 安全相关的界面约定：
//   * 验密**只在进页面时一次**（CardsUnlockGate → session.cardsUnlockedAt，10 分钟 TTL）。
//     过了这道门就不再打码、不再逐张点"查看" —— 用户诉求就是"忘了卡号来这儿查"，
//     解锁后还要一张张点开纯属自己给自己上锁。
//   * 明文由 GET /api/cards 在解锁态下直接给出；未解锁时接口只回尾号，
//     所以"看得见"这件事的闸门始终在服务端，不是靠前端藏。
//   * 解锁 TTL 到点 → 自动清空明文并 router.refresh() 回解锁门。
//     没有这一步的话，页面开着不动就等于把 10 分钟 TTL 变成了无限期。
//   * 明文只放在组件 state，不写 localStorage、不进 URL。

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAlert, useConfirm } from '@/components/ui/Dialog';
import { buildCardShareText, groupCardNumber } from '@/lib/cardFormat';

type Card = {
  id: string;
  bankName: string;
  alias: string | null;
  cardType: string;
  holder: string | null;
  last4: string;
  /** 解锁态下的完整卡号；解密失败时为 null */
  number: string | null;
  note: string | null;
  decryptFailed: boolean;
};

type CardForm = {
  bankName: string;
  alias: string;
  cardType: 'debit' | 'credit';
  holder: string;
  number: string;
  note: string;
};

const EMPTY_FORM: CardForm = {
  bankName: '',
  alias: '',
  cardType: 'debit',
  holder: '',
  number: '',
  note: '',
};

const inputCls =
  'w-full px-3 py-2 rounded-xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400';

/** 新增与编辑共用同一组字段 —— 两处各写一遍迟早会漂移 */
function CardFields({
  form,
  onChange,
}: {
  form: CardForm;
  onChange: (next: CardForm) => void;
}) {
  return (
    <>
      <input
        value={form.bankName}
        onChange={(e) => onChange({ ...form, bankName: e.target.value })}
        placeholder="银行名，如 招商银行"
        className={inputCls}
      />
      <input
        value={form.alias}
        onChange={(e) => onChange({ ...form, alias: e.target.value })}
        placeholder="别名，如 工资卡（可选）"
        className={inputCls}
      />
      <div className="flex gap-2">
        {(['debit', 'credit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => onChange({ ...form, cardType: t })}
            className={`flex-1 py-2 rounded-xl text-sm border ${
              form.cardType === t
                ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent'
                : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
            }`}
          >
            {t === 'debit' ? '储蓄卡' : '信用卡'}
          </button>
        ))}
      </div>
      <input
        value={form.holder}
        onChange={(e) => onChange({ ...form, holder: e.target.value })}
        placeholder="持卡人（可选）"
        className={inputCls}
      />
      <input
        value={form.number}
        onChange={(e) => onChange({ ...form, number: e.target.value })}
        placeholder="完整卡号"
        inputMode="numeric"
        className={`${inputCls} font-mono`}
      />
      <input
        value={form.note}
        onChange={(e) => onChange({ ...form, note: e.target.value })}
        placeholder="备注（可选，别写密码和 CVV）"
        className={inputCls}
      />
    </>
  );
}

export default function CardsClient({ lockAtMs }: { lockAtMs: number | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const alert = useAlert();

  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<CardForm>(EMPTY_FORM);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CardForm>(EMPTY_FORM);

  const [copied, setCopied] = useState<{ id: string; kind: 'number' | 'full' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cards', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      // 解锁已过期（接口只回尾号）→ 回解锁门，别让页面停在半吊子状态
      if (!data.unlocked) {
        router.refresh();
        return;
      }
      setCards(data.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  // 解锁 TTL 到点：清掉内存里的明文并回到解锁门
  useEffect(() => {
    if (lockAtMs === null) return;
    const ms = lockAtMs - Date.now();
    if (ms <= 0) {
      router.refresh();
      return;
    }
    const t = setTimeout(() => {
      setCards([]);
      setEditingId(null);
      router.refresh();
    }, ms);
    return () => clearTimeout(t);
  }, [lockAtMs, router]);

  // 复制反馈短暂显示
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  function formToBody(f: CardForm) {
    return {
      bankName: f.bankName,
      alias: f.alias || null,
      cardType: f.cardType,
      holder: f.holder || null,
      number: f.number,
      note: f.note || null,
    };
  }

  async function submitNew() {
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(addForm)),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setAddForm(EMPTY_FORM);
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: Card) {
    setError('');
    setEditingId(c.id);
    setEditForm({
      bankName: c.bankName,
      alias: c.alias ?? '',
      cardType: c.cardType === 'credit' ? 'credit' : 'debit',
      holder: c.holder ?? '',
      number: c.number ?? '',
      note: c.note ?? '',
    });
  }

  async function submitEdit(id: string) {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formToBody(editForm)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '保存失败');
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function writeClipboard(text: string, id: string, kind: 'number' | 'full') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ id, kind });
    } catch {
      // clipboard 权限被拒时降级：用 prompt 让用户手动复制
      window.prompt('复制以下内容：', text);
    }
  }

  function copyNumber(c: Card) {
    if (!c.number) return;
    void writeClipboard(c.number, c.id, 'number');
  }

  // 「复制完整信息」的内容口径在 buildCardShareText 里（有单测锁着），
  // 这里只负责把它送进剪贴板
  function copyFull(c: Card) {
    if (!c.number) return;
    void writeClipboard(
      buildCardShareText({ bankName: c.bankName, holder: c.holder, number: c.number }),
      c.id,
      'full',
    );
  }

  async function remove(c: Card) {
    const okToDelete = await confirm({
      title: `删除「${c.alias || c.bankName}」？`,
      body: '这张卡的记录会被永久删除，不进回收站。',
      danger: true,
      confirmText: '删除',
    });
    if (!okToDelete) return;
    const res = await fetch(`/api/cards/${c.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      await alert({ title: '删除失败', body: d.error || '未知错误', danger: true });
      return;
    }
    await load();
  }

  async function lockNow() {
    setCards([]);
    setEditingId(null);
    try {
      await fetch('/api/cards/unlock', { method: 'DELETE' });
    } catch {
      // 主动上锁失败无所谓，router.refresh 后服务端读的是当前 session
    }
    router.refresh();
  }

  return (
    <div className="px-4 pb-24 space-y-3">
      <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 flex items-start justify-between gap-3">
        <p className="text-[11px] text-ink-500 leading-relaxed flex-1">
          已验密，卡号直接显示；10 分钟后自动上锁。
          卡号与备注以 AES-256-GCM 加密存储，数据库文件泄露也读不出。
          <strong>本应用不存 CVV 和取款密码</strong>，也请不要写进备注。
        </p>
        <button
          onClick={() => void lockNow()}
          className="text-[11px] text-ink-500 underline shrink-0"
        >
          立即上锁
        </button>
      </div>

      {loading && <p className="text-ink-400 text-sm py-6 text-center">加载中…</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && cards.length === 0 && !adding && (
        <p className="text-ink-500 text-sm py-8 text-center">还没有记录任何卡片</p>
      )}

      {cards.map((c) =>
        editingId === c.id ? (
          <div
            key={c.id}
            className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-400 dark:border-ink-500 space-y-2"
          >
            <div className="text-xs text-ink-500">编辑卡片</div>
            <CardFields form={editForm} onChange={setEditForm} />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void submitEdit(c.id)}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm disabled:opacity-60"
              >
                {saving ? '保存中…' : '保存'}
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="px-4 py-2 rounded-xl bg-ink-100 dark:bg-ink-700 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div
            key={c.id}
            className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <div className="font-medium truncate">{c.alias || c.bankName}</div>
                <div className="text-xs text-ink-500 mt-0.5">
                  {c.bankName} · {c.cardType === 'credit' ? '信用卡' : '储蓄卡'}
                  {c.holder ? ` · ${c.holder}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <button onClick={() => startEdit(c)} className="text-xs text-indigo-600 underline">
                  编辑
                </button>
                <button onClick={() => void remove(c)} className="text-xs text-red-500">
                  删除
                </button>
              </div>
            </div>

            {c.decryptFailed ? (
              <p className="mt-3 text-xs text-red-500 leading-relaxed">
                解密失败 —— 通常是 CARD_SECRET 与加密时不一致。换回原来的密钥即可恢复，
                数据没有丢失（尾号 {c.last4}）。
              </p>
            ) : (
              <>
                <div className="mt-3 font-mono text-sm tracking-wider break-all">
                  {groupCardNumber(c.number ?? '')}
                </div>

                {c.note && <div className="text-xs text-ink-500 mt-2">备注：{c.note}</div>}

                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <button
                    onClick={() => copyNumber(c)}
                    className="text-xs text-indigo-600 underline"
                  >
                    {copied?.id === c.id && copied.kind === 'number' ? '已复制 ✓' : '复制卡号'}
                  </button>
                  <button onClick={() => copyFull(c)} className="text-xs text-indigo-600 underline">
                    {copied?.id === c.id && copied.kind === 'full' ? '已复制 ✓' : '复制完整信息'}
                  </button>
                </div>
              </>
            )}
          </div>
        ),
      )}

      {adding ? (
        <div className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 space-y-2">
          <CardFields form={addForm} onChange={setAddForm} />
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void submitNew()}
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm disabled:opacity-60"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-4 py-2 rounded-xl bg-ink-100 dark:bg-ink-700 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        !loading && (
          <button
            onClick={() => setAdding(true)}
            className="w-full py-3 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-500 text-sm"
          >
            ＋ 添加卡片
          </button>
        )
      )}
    </div>
  );
}
