'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientEvent } from './types';
import { STATUS_LABEL, STATUS_ORDER } from './types';
import NewEventButton from './NewEventButton';
import EventCard from './EventCard';
import MergeBar from './MergeBar';

export default function TaoyuanClient({
  initialEvents,
  initialPaidCursor,
  ledgerId,
}: {
  initialEvents: ClientEvent[];
  /** 只有"已到账"归档需要翻页；活跃项已全量加载 */
  initialPaidCursor: string | null;
  /**
   * Phase 3：加载更多分页 / 新建活动都要按此账本走；缺省 = 请求方 owner 的桃源。
   */
  ledgerId?: string;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const [extraPaid, setExtraPaid] = useState<ClientEvent[]>([]);
  const [paidCursor, setPaidCursor] = useState<string | null>(initialPaidCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  // 服务端重新给了首页 → 丢弃已加载的后续页
  const firstPageSig = initialEvents.map((e) => e.id).join(',');
  useEffect(() => {
    setExtraPaid([]);
    setPaidCursor(initialPaidCursor);
    setLoadError('');
  }, [firstPageSig, initialPaidCursor]);

  const events = useMemo(
    () => [...initialEvents, ...extraPaid],
    [initialEvents, extraPaid],
  );

  async function loadMorePaid() {
    if (!paidCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError('');
    try {
      const qs = new URLSearchParams({ cursor: paidCursor });
      if (ledgerId) qs.set('ledgerId', ledgerId);
      const res = await fetch(`/api/events/paid?${qs.toString()}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '加载失败');
      setExtraPaid((prev) => [...prev, ...(j.events as ClientEvent[])]);
      setPaidCursor(j.nextCursor ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, ClientEvent[]>();
    for (const s of STATUS_ORDER) map.set(s, []);
    for (const ev of events) {
      map.get(ev.status)?.push(ev);
    }
    return map;
  }, [events]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-ink-500">
          {selecting
            ? `已选 ${selectedIds.size} 项`
            : events.length > 0
              ? `共 ${events.length} 个活动`
              : ''}
        </div>
        {events.length > 0 && (
          <button
            onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
            className="text-sm text-ink-700 dark:text-ink-200 underline"
          >
            {selecting ? '完成' : '选择'}
          </button>
        )}
      </div>

      {!selecting && <NewEventButton ledgerId={ledgerId} />}

      <div className="mt-6 space-y-6">
        {STATUS_ORDER.map((s) => {
          const list = groups.get(s) ?? [];
          if (list.length === 0 && s === 'paid') return null;
          return (
            <section key={s}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="text-xs uppercase tracking-wide text-ink-500">
                  {STATUS_LABEL[s]}
                </div>
                <div className="text-xs text-ink-400">· {list.length}</div>
              </div>
              {list.length === 0 ? (
                <div className="text-xs text-ink-400 px-1 py-3">暂无</div>
              ) : (
                <div className="space-y-2">
                  {list.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      selecting={selecting}
                      selected={selectedIds.has(ev.id)}
                      onToggle={() => toggle(ev.id)}
                    />
                  ))}
                </div>
              )}

              {s === 'paid' && paidCursor && (
                <button
                  onClick={loadMorePaid}
                  disabled={loadingMore}
                  className="mt-2 w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-500 active:scale-[0.98] transition disabled:opacity-60"
                >
                  {loadingMore ? '加载中…' : '加载更早的已完成活动'}
                </button>
              )}
              {s === 'paid' && loadError && (
                <p className="text-red-500 text-xs text-center mt-2">{loadError}</p>
              )}
            </section>
          );
        })}
      </div>

      {selecting && (
        <MergeBar
          selectedIds={[...selectedIds]}
          events={events}
          onDone={exitSelecting}
        />
      )}
    </>
  );
}
