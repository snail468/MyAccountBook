'use client';

// 银行卡备份界面。
//
// 安全相关的界面约定：
//   * 列表只显示打码尾号，**永远不自动解密** —— 页面停在那里被人看到也不泄露
//   * 查看完整卡号要二次输入登录密码，拿到后 60 秒自动隐藏
//   * 解密结果只放在组件 state 里，不写 localStorage、不进 URL

import { useCallback, useEffect, useState } from 'react';
import { useAlert, useConfirm } from '@/components/ui/Dialog';
import { maskCardNumber } from '@/lib/cardFormat';

type Card = {
  id: string;
  bankName: string;
  alias: string | null;
  cardType: string;
  holder: string | null;
  last4: string;
};

const inputCls =
  'w-full px-3 py-2 rounded-xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400';

/** 解密后的卡号在界面上停留的时间。到点自动收起，避免屏幕一直亮着号码 */
const REVEAL_TTL_MS = 60_000;

export default function CardsClient() {
  const confirm = useConfirm();
  const alert = useAlert();

  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState('');

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    bankName: '',
    alias: '',
    cardType: 'debit' as 'debit' | 'credit',
    holder: '',
    number: '',
    note: '',
  });

  const [revealing, setRevealing] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState<{ id: string; number: string; note: string | null } | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cards', { cache: 'no-store' });
      const data = await res.json();
      if (res.status === 503) {
        setDisabled(data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error || '加载失败');
      setCards(data.cards);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 到点自动收起明文
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(null), REVEAL_TTL_MS);
    return () => clearTimeout(t);
  }, [revealed]);

  async function submitNew() {
    setError('');
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankName: form.bankName,
          alias: form.alias || null,
          cardType: form.cardType,
          holder: form.holder || null,
          number: form.number,
          note: form.note || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      setForm({ bankName: '', alias: '', cardType: 'debit', holder: '', number: '', note: '' });
      setAdding(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    }
  }

  async function doReveal(id: string) {
    setError('');
    try {
      const res = await fetch(`/api/cards/${id}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '验证失败');
      setRevealed({ id, number: data.number, note: data.note });
      setRevealing(null);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证失败');
    }
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

  if (disabled) {
    return (
      <div className="px-4 py-10">
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <div className="font-medium text-sm mb-1">功能未启用</div>
          <p className="text-xs text-ink-500">{disabled}</p>
          <p className="text-xs text-ink-500 mt-2">
            生成密钥：<code className="text-[11px]">openssl rand -base64 32</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-24 space-y-3">
      <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700">
        <p className="text-[11px] text-ink-500 leading-relaxed">
          卡号与备注以 AES-256-GCM 加密存储，数据库文件泄露也读不出。
          <strong>本应用不存 CVV 和取款密码</strong>，也请不要写进备注。
        </p>
      </div>

      {loading && <p className="text-ink-400 text-sm py-6 text-center">加载中…</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && cards.length === 0 && !adding && (
        <p className="text-ink-500 text-sm py-8 text-center">还没有记录任何卡片</p>
      )}

      {cards.map((c) => (
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
            <button onClick={() => void remove(c)} className="text-xs text-red-500 shrink-0 ml-2">
              删除
            </button>
          </div>

          <div className="mt-3 font-mono text-sm tracking-wider">
            {revealed?.id === c.id ? revealed.number : maskCardNumber(c.last4)}
          </div>

          {revealed?.id === c.id && revealed.note && (
            <div className="text-xs text-ink-500 mt-2">备注：{revealed.note}</div>
          )}

          {revealed?.id === c.id ? (
            <div className="flex items-center gap-3 mt-2">
              <button onClick={() => setRevealed(null)} className="text-xs text-ink-500 underline">
                立即隐藏
              </button>
              <span className="text-[11px] text-ink-400">60 秒后自动隐藏</span>
            </div>
          ) : revealing === c.id ? (
            <div className="mt-3 space-y-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入登录密码以查看"
                className={inputCls}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void doReveal(c.id)}
                  className="flex-1 py-2 rounded-xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm"
                >
                  确认
                </button>
                <button
                  onClick={() => {
                    setRevealing(null);
                    setPassword('');
                  }}
                  className="px-4 py-2 rounded-xl bg-ink-100 dark:bg-ink-700 text-sm"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setRevealing(c.id);
                setPassword('');
                setError('');
              }}
              className="text-xs text-ink-500 underline mt-2"
            >
              查看完整卡号
            </button>
          )}
        </div>
      ))}

      {adding ? (
        <div className="p-4 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 space-y-2">
          <input
            value={form.bankName}
            onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            placeholder="银行名，如 招商银行"
            className={inputCls}
          />
          <input
            value={form.alias}
            onChange={(e) => setForm({ ...form, alias: e.target.value })}
            placeholder="别名，如 工资卡（可选）"
            className={inputCls}
          />
          <div className="flex gap-2">
            {(['debit', 'credit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm({ ...form, cardType: t })}
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
            onChange={(e) => setForm({ ...form, holder: e.target.value })}
            placeholder="持卡人（可选）"
            className={inputCls}
          />
          <input
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            placeholder="完整卡号"
            inputMode="numeric"
            className={`${inputCls} font-mono`}
          />
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="备注（可选，别写密码和 CVV）"
            className={inputCls}
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void submitNew()}
              className="flex-1 py-2 rounded-xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm"
            >
              保存
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
