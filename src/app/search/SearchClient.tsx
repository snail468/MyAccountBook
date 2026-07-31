'use client';

// 全局搜索界面。
//
// 交互取舍：
//   * 任何条件变化都**防抖 300ms 自动搜**（关键字、类别、标签都是输入框，
//     不防抖会每敲一个字发一次请求）。面板里另给一个「应用」按钮，
//     供想立刻看到结果的人用
//   * 请求带自增序号，慢的旧请求回来时直接丢弃 —— 否则边打字边搜会出现
//     "输入 abc 却显示 ab 的结果"
//   * 筛选面板默认收起，只在有生效条件时显示角标，避免首屏一堆输入框
//   * 分页沿用游标「加载更多」，与各账本列表页一致

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Money from '@/components/ui/Money';
import { SEARCH_SOURCES, SOURCE_LABEL, splitTags, type SearchSource } from '@/lib/search';

type Hit = {
  source: SearchSource;
  id: string;
  ledgerId: string | null;
  ledgerName: string | null;
  title: string;
  category: string | null;
  direction: 'income' | 'expense' | null;
  amountCents: number | null;
  note: string | null;
  tags: string | null;
  occurredAt: string;
  href: string;
};

const inputCls =
  'w-full px-3 py-2 rounded-xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400';

/** 元 → 分。空串返回空串（表示不筛） */
function yuanToCents(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const n = Number(t);
  if (!Number.isFinite(n)) return t; // 交给服务端报错，前端不吞
  return String(Math.round(n * 100));
}

export default function SearchClient() {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minYuan, setMinYuan] = useState('');
  const [maxYuan, setMaxYuan] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [direction, setDirection] = useState<'' | 'income' | 'expense'>('');
  const [sources, setSources] = useState<SearchSource[]>([...SEARCH_SOURCES]);

  const [panelOpen, setPanelOpen] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [searched, setSearched] = useState(false);

  // 并发保护：慢的旧请求不能覆盖快的新请求
  const reqId = useRef(0);

  const buildParams = useCallback(
    (nextCursor?: string | null) => {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const min = yuanToCents(minYuan);
      const max = yuanToCents(maxYuan);
      if (min) p.set('minCents', min);
      if (max) p.set('maxCents', max);
      if (category.trim()) p.set('category', category.trim());
      if (tag.trim()) p.set('tag', tag.trim());
      if (direction) p.set('direction', direction);
      if (sources.length !== SEARCH_SOURCES.length) p.set('sources', sources.join(','));
      if (nextCursor) p.set('cursor', nextCursor);
      return p;
    },
    [q, from, to, minYuan, maxYuan, category, tag, direction, sources],
  );

  const activeCount = useMemo(() => {
    let n = 0;
    if (from) n += 1;
    if (to) n += 1;
    if (minYuan.trim()) n += 1;
    if (maxYuan.trim()) n += 1;
    if (category.trim()) n += 1;
    if (tag.trim()) n += 1;
    if (direction) n += 1;
    if (sources.length !== SEARCH_SOURCES.length) n += 1;
    return n;
  }, [from, to, minYuan, maxYuan, category, tag, direction, sources]);

  const run = useCallback(
    async (nextCursor: string | null) => {
      const mine = ++reqId.current;
      setBusy(true);
      setError('');
      try {
        const res = await fetch(`/api/search?${buildParams(nextCursor).toString()}`, {
          cache: 'no-store',
        });
        const data = await res.json();
        if (mine !== reqId.current) return; // 已被更新的请求取代
        if (!res.ok) throw new Error(data.error || '搜索失败');

        setHint(data.hint || '');
        setSearched(!data.empty);
        setCursor(data.nextCursor);
        setHits((prev) => (nextCursor ? [...prev, ...data.hits] : data.hits));
      } catch (e) {
        if (mine !== reqId.current) return;
        setError(e instanceof Error ? e.message : '搜索失败');
      } finally {
        if (mine === reqId.current) setBusy(false);
      }
    },
    [buildParams],
  );

  // 关键字防抖；其余条件立即触发
  useEffect(() => {
    const t = setTimeout(() => void run(null), 300);
    return () => clearTimeout(t);
  }, [q, run]);

  function toggleSource(s: SearchSource) {
    setSources((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function resetFilters() {
    setFrom('');
    setTo('');
    setMinYuan('');
    setMaxYuan('');
    setCategory('');
    setTag('');
    setDirection('');
    setSources([...SEARCH_SOURCES]);
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜备注、类别、标签、活动标题…"
          className={inputCls}
          autoFocus
        />
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="relative shrink-0 px-3 py-2 rounded-xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm"
        >
          筛选
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-[10px] leading-4 text-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {panelOpen && (
        <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 space-y-3">
          <div>
            <div className="text-xs text-ink-500 mb-1">时间范围</div>
            <div className="flex items-center gap-2">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
              <span className="text-ink-400">–</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <div className="text-xs text-ink-500 mb-1">金额区间（元）</div>
            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={minYuan}
                onChange={(e) => setMinYuan(e.target.value)}
                placeholder="最低"
                className={inputCls}
              />
              <span className="text-ink-400">–</span>
              <input
                inputMode="decimal"
                value={maxYuan}
                onChange={(e) => setMaxYuan(e.target.value)}
                placeholder="最高"
                className={inputCls}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="类别"
              className={inputCls}
            />
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="标签"
              className={inputCls}
            />
          </div>

          <div>
            <div className="text-xs text-ink-500 mb-1">收支方向</div>
            <div className="flex gap-2">
              {([
                ['', '不限'],
                ['income', '收入'],
                ['expense', '支出'],
              ] as const).map(([v, label]) => (
                <button
                  key={label}
                  onClick={() => setDirection(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs border ${
                    direction === v
                      ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent'
                      : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs text-ink-500 mb-1">搜索范围</div>
            <div className="flex flex-wrap gap-2">
              {SEARCH_SOURCES.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSource(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs border ${
                    sources.includes(s)
                      ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 border-transparent'
                      : 'bg-white dark:bg-ink-800 border-ink-200 dark:border-ink-700'
                  }`}
                >
                  {SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
            {sources.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                一个范围都没选 —— 服务端会当作全选处理
              </p>
            )}
          </div>

          <div className="flex justify-between items-center pt-1">
            <button onClick={resetFilters} className="text-xs text-ink-500 underline">
              清空筛选
            </button>
            <button
              onClick={() => void run(null)}
              className="px-4 py-1.5 rounded-lg bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-xs"
            >
              应用
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}
      {hint && !error && hits.length === 0 && (
        <p className="text-ink-500 text-sm py-8 text-center">{hint}</p>
      )}
      {searched && !busy && hits.length === 0 && !hint && (
        <p className="text-ink-500 text-sm py-8 text-center">没有匹配的记录</p>
      )}

      <div className="space-y-2">
        {hits.map((h) => (
          <Link
            key={`${h.source}:${h.id}`}
            href={h.href}
            className="block p-3 rounded-2xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 active:scale-[0.99] transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-500 shrink-0">
                    {h.ledgerName ?? SOURCE_LABEL[h.source]}
                  </span>
                  <span className="font-medium truncate">{h.title}</span>
                </div>
                {h.note && <div className="text-xs text-ink-500 mt-1 truncate">{h.note}</div>}
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {splitTags(h.tags).map((t) => (
                    <span
                      key={t}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-700 text-ink-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="text-[11px] text-ink-400 mt-1">
                  {h.occurredAt.slice(0, 10)}
                </div>
              </div>
              {h.amountCents !== null && (
                <div
                  className={`shrink-0 tabular-nums ${
                    h.direction === 'income'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-ink-900 dark:text-ink-100'
                  }`}
                >
                  <Money cents={h.amountCents} />
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {busy && <p className="text-ink-400 text-sm text-center py-3">搜索中…</p>}

      {cursor && !busy && (
        <button
          onClick={() => void run(cursor)}
          className="w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm"
        >
          加载更多
        </button>
      )}
    </div>
  );
}
