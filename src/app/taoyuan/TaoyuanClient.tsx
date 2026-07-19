'use client';

import { useMemo, useState } from 'react';
import type { ClientEvent } from './types';
import { STATUS_LABEL, STATUS_ORDER } from './types';
import NewEventButton from './NewEventButton';
import EventCard from './EventCard';
import MergeBar from './MergeBar';

export default function TaoyuanClient({ events }: { events: ClientEvent[] }) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

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

      {!selecting && <NewEventButton />}

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
