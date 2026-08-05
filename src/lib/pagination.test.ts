import { describe, expect, it } from 'vitest';
import {
  createdCursorWhere,
  cursorWhere,
  decodeCursor,
  DEFAULT_PAGE_SIZE,
  encodeCursor,
  MAX_PAGE_SIZE,
  parsePageSize,
  slicePage,
  slicePageByCreated,
} from './pagination';

describe('游标编解码', () => {
  it('往返一致', () => {
    const c = { occurredAt: new Date('2026-07-30T12:34:56.789Z'), id: 'abc123' };
    const decoded = decodeCursor(encodeCursor(c));
    expect(decoded).not.toBeNull();
    expect(decoded!.id).toBe('abc123');
    expect(decoded!.occurredAt.toISOString()).toBe(c.occurredAt.toISOString());
  });

  it('id 里含分隔符也能正确解析', () => {
    // cuid 不含 ~，但别让实现假设这一点
    const c = { occurredAt: new Date('2026-01-01T00:00:00.000Z'), id: 'we~ird~id' };
    expect(decodeCursor(encodeCursor(c))!.id).toBe('we~ird~id');
  });

  it('非法游标返回 null 而不是抛错', () => {
    for (const bad of [null, undefined, '', 'garbage', '~', '~id', 'notadate~id', '2026-01-01T00:00:00.000Z~']) {
      expect(decodeCursor(bad as string | null)).toBeNull();
    }
  });
});

describe('cursorWhere', () => {
  it('无游标时返回空条件（取第一页）', () => {
    expect(cursorWhere(null)).toEqual({});
  });

  it('生成严格小于的复合条件 —— 同一时刻的多条记录不会漏也不会重', () => {
    const at = new Date('2026-07-30T00:00:00.000Z');
    expect(cursorWhere({ occurredAt: at, id: 'm5' })).toEqual({
      OR: [{ occurredAt: { lt: at } }, { occurredAt: at, id: { lt: 'm5' } }],
    });
  });

  it('createdAt 变体结构一致，只是字段名不同', () => {
    const at = new Date('2026-07-30T00:00:00.000Z');
    expect(createdCursorWhere({ occurredAt: at, id: 'x' })).toEqual({
      OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: 'x' } }],
    });
    expect(createdCursorWhere(null)).toEqual({});
  });
});

describe('parsePageSize', () => {
  it('缺失或非法时用默认值', () => {
    for (const bad of [null, undefined, '', 'abc', '0', '-5', 'NaN']) {
      expect(parsePageSize(bad as string | null)).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it('正常值原样返回（取整）', () => {
    expect(parsePageSize('10')).toBe(10);
    expect(parsePageSize('10.9')).toBe(10);
  });

  it('超过上限时截断，防止一次拉爆数据库', () => {
    expect(parsePageSize('99999')).toBe(MAX_PAGE_SIZE);
  });
});

describe('slicePage', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id${i}`,
      occurredAt: new Date(2026, 0, 1, 0, 0, n - i),
    }));

  it('结果不足一页时没有下一页游标', () => {
    const r = slicePage(rows(3), 5);
    expect(r.items).toHaveLength(3);
    expect(r.nextCursor).toBeNull();
  });

  it('刚好一页时也没有下一页 —— 靠多取一条判断', () => {
    const r = slicePage(rows(5), 5);
    expect(r.items).toHaveLength(5);
    expect(r.nextCursor).toBeNull();
  });

  it('多出一条时裁剪并给出游标', () => {
    const all = rows(6);
    const r = slicePage(all, 5);
    expect(r.items).toHaveLength(5);
    expect(r.nextCursor).not.toBeNull();
    // 游标应指向被保留的最后一条，而不是被裁掉的那条
    const decoded = decodeCursor(r.nextCursor);
    expect(decoded!.id).toBe(all[4].id);
  });

  it('createdAt 变体行为一致', () => {
    const all = Array.from({ length: 4 }, (_, i) => ({
      id: `c${i}`,
      createdAt: new Date(2026, 0, 1, 0, 0, 4 - i),
    }));
    const r = slicePageByCreated(all, 3);
    expect(r.items).toHaveLength(3);
    expect(decodeCursor(r.nextCursor)!.id).toBe('c2');
  });
});
