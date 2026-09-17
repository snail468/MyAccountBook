'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClientEvent } from './types';
import { STATUS_CONFIG, STATUS_ORDER } from './types';
import { aggregateSum } from './types';
import NewEventButton from './NewEventButton';
import EventCard from './EventCard';
import MergeBar from './MergeBar';
import Money from '@/components/ui/Money';

function getEventYear(ev: ClientEvent): string {
  const dStr = ev.paidAt || ev.deadline || ev.startAt || ev.publishedAt;
  if (!dStr) return '历史已完成';
  const y = new Date(dStr).getFullYear();
  return isNaN(y) ? '历史已完成' : `${y} 年`;
}

export default function TaoyuanClient({
  initialEvents,
  initialPaidCursor,
  ledgerId,
  canEdit = true,
}: {
  initialEvents: ClientEvent[];
  /** 只有"已到账"归档需要翻页；活跃项已全量加载 */
  initialPaidCursor: string | null;
  /**
   * Phase 3：加载更多分页 / 新建活动都要按此账本走；缺省 = 请求方 owner 的桃源。
   */
  ledgerId?: string;
  /** 只读协作者(viewer)传 false：隐藏「新活动」/「选择」等写入入口。默认可写。 */
  canEdit?: boolean;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const [extraPaid, setExtraPaid] = useState<ClientEvent[]>([]);
  const [paidCursor, setPaidCursor] = useState<string | null>(initialPaidCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');

  // 建议 1：搜索与筛选状态
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 建议 2：已到账按年份折叠状态（Set 存放已展开的年份名）
  const [expandedYears, setExpandedYears] = useState<Set<string>>(() => new Set());
  const [hasInitializedYear, setHasInitializedYear] = useState(false);

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

  // 收集所有存在的话题标签用于快速筛选
  const allTopicTags = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      if (ev.topicTag) set.add(ev.topicTag.trim());
      for (const c of ev.children) {
        if (c.topicTag) set.add(c.topicTag.trim());
      }
    }
    return [...set];
  }, [events]);

  // 根据搜索与标签过滤活动列表
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tag = selectedTag;

    if (!q && !tag) return events;

    return events.filter((ev) => {
      // 标签匹配（包括主活动或任一子活动匹配）
      if (tag) {
        const hasTag =
          ev.topicTag === tag || ev.children.some((c) => c.topicTag === tag);
        if (!hasTag) return false;
      }

      // 关键词搜索匹配
      if (q) {
        // 匹配编号，如 "#1" 或 "1"
        const eventNoMatch =
          ev.eventNo !== null &&
          ev.eventNo !== undefined &&
          (String(ev.eventNo) === q || `#${ev.eventNo}` === q);

        const textMatch =
          ev.title.toLowerCase().includes(q) ||
          (ev.content && ev.content.toLowerCase().includes(q)) ||
          (ev.note && ev.note.toLowerCase().includes(q)) ||
          (ev.topicTag && ev.topicTag.toLowerCase().includes(q)) ||
          ev.children.some(
            (c) =>
              c.title.toLowerCase().includes(q) ||
              (c.eventNo !== null && (String(c.eventNo) === q || `#${c.eventNo}` === q)),
          );

        if (!eventNoMatch && !textMatch) return false;
      }

      return true;
    });
  }, [events, searchQuery, selectedTag]);

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
    for (const ev of filteredEvents) {
      map.get(ev.status)?.push(ev);
    }
    return map;
  }, [filteredEvents]);

  // 已到账活动按年份分组
  const paidByYear = useMemo(() => {
    const paidList = groups.get('paid') ?? [];
    const yearMap = new Map<string, ClientEvent[]>();
    for (const ev of paidList) {
      const yr = getEventYear(ev);
      const list = yearMap.get(yr) ?? [];
      list.push(ev);
      yearMap.set(yr, list);
    }
    // 年份倒序排列
    const sortedYears = [...yearMap.keys()].sort((a, b) => b.localeCompare(a));
    return sortedYears.map((yr) => ({
      year: yr,
      list: yearMap.get(yr)!,
      totalPaidCents: yearMap.get(yr)!.reduce((acc, e) => acc + aggregateSum(e, 'paid'), 0),
    }));
  }, [groups]);

  // 初始化展开最新年份
  useEffect(() => {
    if (!hasInitializedYear && paidByYear.length > 0) {
      setExpandedYears(new Set([paidByYear[0].year]));
      setHasInitializedYear(true);
    }
  }, [paidByYear, hasInitializedYear]);

  function toggleYear(year: string) {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

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

  const hasFilter = searchQuery.trim() !== '' || selectedTag !== null;

  return (
    <>
      {/* 顶部统计与操作栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-ink-500">
          {selecting
            ? `已选 ${selectedIds.size} 项`
            : hasFilter
              ? `筛选出 ${filteredEvents.length} / 共 ${events.length} 个活动`
              : events.length > 0
                ? `共 ${events.length} 个活动`
                : ''}
        </div>
        {canEdit && events.length > 0 && (
          <button
            onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
            className="text-sm text-ink-700 dark:text-ink-200 underline"
          >
            {selecting ? '完成' : '选择'}
          </button>
        )}
      </div>

      {/* 建议 1：搜索与话题标签筛选栏 */}
      {!selecting && events.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 text-sm pointer-events-none">
              🔍
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索活动名、#编号、标签、内容或备注…"
              className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-ink-50 dark:bg-ink-800/80 border border-ink-200 dark:border-ink-700 text-sm focus:outline-none focus:ring-2 focus:ring-ink-400 dark:focus:ring-ink-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 px-1"
                aria-label="清空搜索"
              >
                ✕
              </button>
            )}
          </div>

          {/* 话题标签横向滑动药丸 */}
          {allTopicTags.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <button
                onClick={() => setSelectedTag(null)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-xs transition ${
                  selectedTag === null
                    ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium'
                    : 'bg-ink-100/70 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700'
                }`}
              >
                全部标签
              </button>
              {allTopicTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-xs transition ${
                    selectedTag === tag
                      ? 'bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 font-medium'
                      : 'bg-ink-100/70 dark:bg-ink-800 text-ink-600 dark:text-ink-300 hover:bg-ink-200 dark:hover:bg-ink-700'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {hasFilter && (
            <div className="flex items-center justify-between text-xs text-ink-500 px-1">
              <span>正在显示筛选结果</span>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTag(null);
                }}
                className="underline hover:text-ink-700 dark:hover:text-ink-300"
              >
                清空筛选
              </button>
            </div>
          )}
        </div>
      )}

      {!selecting && canEdit && <NewEventButton ledgerId={ledgerId} />}

      {/* 流水线阶段列表 */}
      <div className="mt-6 space-y-8">
        {STATUS_ORDER.map((s) => {
          const list = groups.get(s) ?? [];
          if (list.length === 0 && s === 'paid') return null;
          const conf = STATUS_CONFIG[s];

          return (
            <section key={s}>
              {/* 需求 2：流水线阶段大标题水平居中、加大加粗、专属颜色区分 */}
              <div className="flex items-center justify-center gap-2 mb-3 py-1.5 border-b border-ink-100 dark:border-ink-800/60">
                <h2 className={`text-base sm:text-lg font-bold tracking-wide ${conf.titleColor}`}>
                  {conf.label}
                </h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${conf.badgeCls}`}>
                  {list.length}
                </span>
              </div>

              {list.length === 0 ? (
                <div className="text-xs text-center text-ink-400 py-3">
                  {hasFilter ? '未找到符合条件的活动' : '暂无'}
                </div>
              ) : s === 'paid' ? (
                /* 建议 2：已到账按年份折叠手风琴 */
                <div className="space-y-3">
                  {paidByYear.map(({ year, list: yearList, totalPaidCents }) => {
                    const isExpanded = expandedYears.has(year);
                    return (
                      <div
                        key={year}
                        className="rounded-2xl border border-ink-200 dark:border-ink-700/80 bg-ink-50/50 dark:bg-ink-800/30 overflow-hidden"
                      >
                        {/* 年份折叠条 Header */}
                        <button
                          onClick={() => toggleYear(year)}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-ink-100/50 dark:hover:bg-ink-800/60 transition text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-ink-400 transition-transform duration-200">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <span className="font-semibold text-sm text-ink-800 dark:text-ink-200">
                              {year}
                            </span>
                            <span className="text-xs text-ink-400">
                              · {yearList.length} 个活动
                            </span>
                          </div>
                          {totalPaidCents > 0 && (
                            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 num">
                              到账 <Money cents={totalPaidCents} />
                            </div>
                          )}
                        </button>

                        {/* 该年份下的活动列表 */}
                        {isExpanded && (
                          <div className="p-2 space-y-2 border-t border-ink-100 dark:border-ink-700/50 bg-white dark:bg-ink-900/40">
                            {yearList.map((ev) => (
                              <EventCard
                                key={ev.id}
                                event={ev}
                                selecting={selecting}
                                selected={selectedIds.has(ev.id)}
                                onToggle={() => toggle(ev.id)}
                                canEdit={canEdit}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* 活跃活动列表平铺渲染 */
                <div className="space-y-2">
                  {list.map((ev) => (
                    <EventCard
                      key={ev.id}
                      event={ev}
                      selecting={selecting}
                      selected={selectedIds.has(ev.id)}
                      onToggle={() => toggle(ev.id)}
                      canEdit={canEdit}
                    />
                  ))}
                </div>
              )}

              {s === 'paid' && paidCursor && (
                <button
                  onClick={loadMorePaid}
                  disabled={loadingMore}
                  className="mt-3 w-full py-3 rounded-2xl bg-ink-50 dark:bg-ink-800 border border-ink-200 dark:border-ink-700 text-sm text-ink-500 active:scale-[0.98] transition disabled:opacity-60"
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

