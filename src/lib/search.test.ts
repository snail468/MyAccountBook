import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  hasAnyFilter,
  mergeAndSlice,
  parseSearchParams,
  SEARCH_SOURCES,
  splitTags,
  type SearchHit,
} from '@/lib/search';

const parse = (qs: string) => parseSearchParams(new URLSearchParams(qs));
const ok = (qs: string) => {
  const r = parse(qs);
  if (!r.ok) throw new Error(`期望解析成功，实际失败：${r.reason}`);
  return r.filters;
};

describe('parseSearchParams · 默认值', () => {
  it('全空时四个来源都选上，limit 有默认值', () => {
    const f = ok('');
    expect(f.sources).toEqual([...SEARCH_SOURCES]);
    expect(f.limit).toBe(30);
    expect(f.q).toBe('');
    expect(f.from).toBeNull();
    expect(f.minCents).toBeNull();
  });

  it('关键字两端空格被去掉', () => {
    expect(ok('q=%20%20咖啡%20%20').q).toBe('咖啡');
  });

  it('limit 有上限，防止一次拖垮整个库', () => {
    expect(ok('limit=9999').limit).toBe(100);
    expect(ok('limit=-5').limit).toBe(30);
    expect(ok('limit=abc').limit).toBe(30);
  });
});

describe('parseSearchParams · 日期', () => {
  it('只给日期时，结束日期补到当天末尾', () => {
    const f = ok('to=2026-07-31');
    expect(f.to?.getHours()).toBe(23);
    expect(f.to?.getMinutes()).toBe(59);
    expect(f.to?.getSeconds()).toBe(59);
  });

  it('给了完整时间戳就不补', () => {
    const f = ok('to=2026-07-31T08:00:00.000Z');
    expect(f.to?.toISOString()).toBe('2026-07-31T08:00:00.000Z');
  });

  it('日期不合法要报错，而不是静默忽略', () => {
    expect(parse('from=乱写')).toMatchObject({ ok: false });
    expect(parse('to=2026-13-45')).toMatchObject({ ok: false });
  });

  it('开始晚于结束要报错', () => {
    const r = parse('from=2026-08-01&to=2026-07-01');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('晚于');
  });

  it('空字符串当作没填', () => {
    expect(ok('from=&to=').from).toBeNull();
  });
});

describe('parseSearchParams · 金额', () => {
  it('正常区间', () => {
    const f = ok('minCents=100&maxCents=5000');
    expect(f.minCents).toBe(100);
    expect(f.maxCents).toBe(5000);
  });

  it('小数四舍五入到整分', () => {
    expect(ok('minCents=100.6').minCents).toBe(101);
  });

  it('非数字要报错', () => {
    expect(parse('minCents=十块')).toMatchObject({ ok: false });
  });

  it('负数要报错', () => {
    expect(parse('minCents=-1')).toMatchObject({ ok: false });
  });

  it('最小大于最大要报错', () => {
    const r = parse('minCents=500&maxCents=100');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('最小金额大于最大金额');
  });

  it('只给一端也合法', () => {
    expect(ok('minCents=100').maxCents).toBeNull();
    expect(ok('maxCents=100').minCents).toBeNull();
  });
});

describe('parseSearchParams · 来源与方向', () => {
  it('只选部分来源', () => {
    expect(ok('sources=work,travel').sources).toEqual(['work', 'travel']);
  });

  it('无法识别的来源被丢掉', () => {
    expect(ok('sources=work,火星账本').sources).toEqual(['work']);
  });

  it('全是无效来源时回退成全选，而不是搜出空结果', () => {
    expect(ok('sources=火星,月球').sources).toEqual([...SEARCH_SOURCES]);
  });

  it('重复的来源去重', () => {
    expect(ok('sources=work,work,work').sources).toEqual(['work']);
  });

  it('方向只认 income / expense', () => {
    expect(ok('direction=income').direction).toBe('income');
    expect(ok('direction=expense').direction).toBe('expense');
    expect(ok('direction=乱写').direction).toBeNull();
  });
});

describe('activeFilterCount / hasAnyFilter', () => {
  it('什么都没填时为 0', () => {
    const f = ok('');
    expect(activeFilterCount(f)).toBe(0);
    expect(hasAnyFilter(f)).toBe(false);
  });

  it('逐项累加', () => {
    expect(activeFilterCount(ok('q=咖啡'))).toBe(1);
    expect(activeFilterCount(ok('q=咖啡&minCents=100'))).toBe(2);
    expect(activeFilterCount(ok('q=咖啡&minCents=100&category=吃饭'))).toBe(3);
  });

  it('缩小来源范围也算一项筛选', () => {
    expect(activeFilterCount(ok('sources=work'))).toBe(1);
    // 全选等于没筛
    expect(activeFilterCount(ok('sources=work,general,travel,taoyuan'))).toBe(0);
  });
});

describe('mergeAndSlice', () => {
  const hit = (id: string, iso: string): SearchHit => ({
    source: 'general',
    id,
    ledgerId: null,
    ledgerName: null,
    title: id,
    category: null,
    direction: null,
    amountCents: null,
    note: null,
    tags: null,
    occurredAt: new Date(iso),
    href: '#',
  });

  it('跨来源按时间倒序归并', () => {
    const a = [hit('a1', '2026-07-03T00:00:00Z'), hit('a2', '2026-07-01T00:00:00Z')];
    const b = [hit('b1', '2026-07-04T00:00:00Z'), hit('b2', '2026-07-02T00:00:00Z')];
    const { items } = mergeAndSlice([a, b], 10);
    expect(items.map((h) => h.id)).toEqual(['b1', 'a1', 'b2', 'a2']);
  });

  it('时间相同时按 id 倒序 —— 必须与游标语义一致', () => {
    const same = '2026-07-01T00:00:00Z';
    const { items } = mergeAndSlice([[hit('aaa', same)], [hit('zzz', same)]], 10);
    expect(items.map((h) => h.id)).toEqual(['zzz', 'aaa']);
  });

  it('没超过一页时不给游标', () => {
    const { items, nextCursor } = mergeAndSlice([[hit('a', '2026-07-01T00:00:00Z')]], 10);
    expect(items).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  it('超出一页时裁剪并给出游标，游标指向本页最后一条', () => {
    const rows = ['a', 'b', 'c', 'd'].map((id, i) =>
      hit(id, `2026-07-0${4 - i}T00:00:00Z`),
    );
    const { items, nextCursor } = mergeAndSlice([rows], 2);
    expect(items.map((h) => h.id)).toEqual(['a', 'b']);
    expect(nextCursor).toBe('2026-07-03T00:00:00.000Z~b');
  });

  it('空输入不炸', () => {
    expect(mergeAndSlice([[], [], []], 10)).toEqual({ items: [], nextCursor: null });
  });
});

describe('splitTags', () => {
  it('逗号分隔并去空格', () => {
    expect(splitTags('日常, 咖啡 ,')).toEqual(['日常', '咖啡']);
  });

  it('空值返回空数组', () => {
    expect(splitTags(null)).toEqual([]);
    expect(splitTags('')).toEqual([]);
    expect(splitTags(' , , ')).toEqual([]);
  });
});
