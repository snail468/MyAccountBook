'use client';

import { useMemo, useRef, useState } from 'react';
import type { Expense, Member } from './TravelView';
import type { NetBalance, Transfer } from '@/lib/settlement';
import { svgElementToPng, triggerDownload } from '@/lib/domToPng';

const W = 480;
const PAD = 28;
const BG = '#ffffff';
const INK = '#1f2937';
const SUB = '#6b7280';
const ACCENT = '#065f46';
const LINE = '#e5e7eb';
const POS = '#059669';
const NEG = '#374151';

function fmt(cents: number) {
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function weekday(d: string) {
  const dt = new Date(`${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? '' : WEEK[dt.getDay()];
}

export default function SettlementSheet({
  ledger,
  members,
  expenses,
  balances,
  transfers,
  settlementError,
  onClose,
}: {
  ledger: {
    name: string;
    icon: string | null;
    baseCurrency: string;
    startDate: string | null;
    endDate: string | null;
  };
  members: Member[];
  expenses: Expense[];
  balances: NetBalance[];
  transfers: Transfer[];
  settlementError: string | null;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);

  const { svg } = useMemo(() => {
    const els: React.ReactNode[] = [];
    let y = 0;

    // 背景
    els.push(<rect key="bg" x={0} y={0} width={W} height={4000} fill={BG} />);

    // 标题
    y = 56;
    els.push(
      <text key="title" x={PAD} y={y} fontSize={22} fontWeight={700} fill={INK} fontFamily="sans-serif">
        {`${ledger.icon ?? '✈️'} ${ledger.name}`}
      </text>,
    );
    // 副标题：日期区间
    y = 82;
    const range = [ledger.startDate?.slice(0, 10), ledger.endDate?.slice(0, 10)]
      .filter(Boolean)
      .join('  ~  ');
    els.push(
      <text key="sub" x={PAD} y={y} fontSize={13} fill={SUB} fontFamily="sans-serif">
        {range ? `旅游 AA 结算单 · ${range}` : '旅游 AA 结算单'}
      </text>,
    );
    // 分割线
    y = 104;
    els.push(<line key="ln1" x1={PAD} y1={y} x2={W - PAD} y2={y} stroke={LINE} strokeWidth={1} />);

    // —— 账目明细：按日期分组，逐笔记 ——
    y += 30;
    els.push(
      <text key="h0" x={PAD} y={y} fontSize={15} fontWeight={700} fill={ACCENT} fontFamily="sans-serif">
        账目明细（{expenses.length} 笔）
      </text>,
    );
    y += 14;

    const byDate = new Map<string, Expense[]>();
    for (const e of expenses) {
      const d = e.occurredAt.slice(0, 10);
      const arr = byDate.get(d) ?? [];
      arr.push(e);
      byDate.set(d, arr);
    }
    const dates = Array.from(byDate.keys()).sort();

    if (dates.length === 0) {
      y += 22;
      els.push(
        <text key="none" x={PAD} y={y} fontSize={13} fill={SUB} fontFamily="sans-serif">
          还没有任何记录
        </text>,
      );
      y += 18;
    }

    for (const d of dates) {
      y += 26;
      els.push(
        <text key={`d-${d}`} x={PAD} y={y} fontSize={13} fontWeight={700} fill={ACCENT} fontFamily="sans-serif">
          {`${d} 周${weekday(d)}`}
        </text>,
      );
      y += 20;
      for (const e of byDate.get(d)!) {
        els.push(
          <text key={`t-${e.id}`} x={PAD} y={y} fontSize={14} fill={INK} fontFamily="sans-serif">
            {trunc(e.title, 20)}
          </text>,
        );
        els.push(
          <text
            key={`ta-${e.id}`}
            x={W - PAD}
            y={y}
            fontSize={14}
            textAnchor="end"
            fill={NEG}
            fontFamily="sans-serif"
          >
            {`${fmt(e.amountBaseCents)} ${ledger.baseCurrency}`}
          </text>,
        );
        y += 18;
        const foreign =
          e.currency !== ledger.baseCurrency
            ? ` · ${fmt(e.amountForeignCents)} ${e.currency}`
            : '';
        els.push(
          <text key={`s-${e.id}`} x={PAD} y={y} fontSize={12} fill={SUB} fontFamily="sans-serif">
            {`${trunc(e.category, 8)} · ${e.payerName}垫付${foreign}`}
          </text>,
        );
        y += 22;
      }
    }

    // —— 总账单 ——
    y += 14;
    els.push(<line key="ln2" x1={PAD} y1={y} x2={W - PAD} y2={y} stroke={LINE} strokeWidth={1} />);
    y += 32;
    els.push(
      <text key="h3" x={PAD} y={y} fontSize={15} fontWeight={700} fill={ACCENT} fontFamily="sans-serif">
        总账单
      </text>,
    );
    y += 28;

    const totalSpent = expenses.reduce((s, e) => s + e.amountBaseCents, 0);
    els.push(
      <text key="tot-l" x={PAD} y={y} fontSize={16} fontWeight={700} fill={INK} fontFamily="sans-serif">
        总花费
      </text>,
    );
    els.push(
      <text
        key="tot-v"
        x={W - PAD}
        y={y}
        fontSize={16}
        fontWeight={700}
        textAnchor="end"
        fill={INK}
        fontFamily="sans-serif"
      >
        {`${fmt(totalSpent)} ${ledger.baseCurrency}`}
      </text>,
    );
    y += 24;

    // 按币种合计
    const curMap = new Map<string, number>();
    for (const e of expenses) {
      curMap.set(e.currency, (curMap.get(e.currency) ?? 0) + e.amountForeignCents);
    }
    const curEntries = Array.from(curMap.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (curEntries.length > 1) {
      for (const [c, v] of curEntries) {
        els.push(
          <text key={`cur-${c}`} x={PAD} y={y} fontSize={13} fill={SUB} fontFamily="sans-serif">
            {`${c} 原币合计`}
          </text>,
        );
        els.push(
          <text
            key={`curv-${c}`}
            x={W - PAD}
            y={y}
            fontSize={13}
            textAnchor="end"
            fill={SUB}
            fontFamily="sans-serif"
          >
            {`${fmt(v)} ${c}`}
          </text>,
        );
        y += 22;
      }
      y += 4;
    }

    // 成员净额
    y += 8;
    els.push(
      <text key="h1" x={PAD} y={y} fontSize={14} fontWeight={700} fill={ACCENT} fontFamily="sans-serif">
        成员净额
      </text>,
    );
    y += 24;
    for (const b of balances) {
      const settled = members.find((m) => m.id === b.memberId)?.settled;
      const label = b.netCents > 0 ? '应收' : b.netCents < 0 ? '应付' : '已平';
      els.push(
        <text key={`b-${b.memberId}`} x={PAD} y={y} fontSize={14} fill={INK} fontFamily="sans-serif">
          {`${b.name}${settled ? '  ✓已结清' : ''}`}
        </text>,
      );
      els.push(
        <text
          key={`bn-${b.memberId}`}
          x={W - PAD}
          y={y}
          fontSize={14}
          textAnchor="end"
          fill={b.netCents > 0 ? POS : NEG}
          fontFamily="sans-serif"
        >
          {`${label} ${fmt(Math.abs(b.netCents))} ${ledger.baseCurrency}`}
        </text>,
      );
      y += 24;
    }

    // 最优结算
    y += 10;
    els.push(<line key="ln3" x1={PAD} y1={y} x2={W - PAD} y2={y} stroke={LINE} strokeWidth={1} />);
    y += 30;
    els.push(
      <text key="h2" x={PAD} y={y} fontSize={14} fontWeight={700} fill={ACCENT} fontFamily="sans-serif">
        最优结算
      </text>,
    );
    y += 24;
    if (settlementError) {
      els.push(
        <text key="err" x={PAD} y={y} fontSize={13} fill={SUB} fontFamily="sans-serif">
          部分记录分摊不守恒，暂无法生成转账清单（请在账本内逐笔编辑保存修正）
        </text>,
      );
      y += 24;
    } else if (transfers.length === 0) {
      els.push(
        <text key="flat" x={PAD} y={y} fontSize={13} fill={SUB} fontFamily="sans-serif">
          无需转账，大家已平
        </text>,
      );
      y += 24;
    } else {
      for (const t of transfers) {
        els.push(
          <text key={`t-${t.fromId}-${t.toId}`} x={PAD} y={y} fontSize={14} fill={INK} fontFamily="sans-serif">
            {`${t.fromName} → ${t.toName}`}
          </text>,
        );
        els.push(
          <text
            key={`tn-${t.fromId}-${t.toId}`}
            x={W - PAD}
            y={y}
            fontSize={14}
            textAnchor="end"
            fill={NEG}
            fontFamily="sans-serif"
          >
            {`${fmt(t.amountCents)} ${ledger.baseCurrency}`}
          </text>,
        );
        y += 24;
      }
    }

    // 页脚：生成时间
    y += 14;
    els.push(<line key="ln4" x1={PAD} y1={y} x2={W - PAD} y2={y} stroke={LINE} strokeWidth={1} />);
    y += 28;
    const now = new Date();
    els.push(
      <text key="foot" x={PAD} y={y} fontSize={12} fill={SUB} fontFamily="sans-serif">
        {`生成于 ${now.toISOString().slice(0, 10)}`}
      </text>,
    );
    y += 24;

    const H = y + 8;
    // 修正背景高度
    els[0] = <rect key="bg" x={0} y={0} width={W} height={H} fill={BG} />;

    return {
      svg: (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: 'block', borderRadius: 16, background: BG }}
          role="img"
          aria-label="旅游结算单"
        >
          {els}
        </svg>
      ),
    };
  }, [ledger, members, expenses, balances, transfers, settlementError]);

  async function download() {
    if (!svgRef.current) return;
    setBusy(true);
    try {
      const blob = await svgElementToPng(svgRef.current, 2);
      triggerDownload(blob, `${ledger.name || '结算单'}.png`);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!svgRef.current) return;
    setBusy(true);
    try {
      const blob = await svgElementToPng(svgRef.current, 2);
      const file = new File([blob], `${ledger.name || '结算单'}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & {
        canShare?: (data: { files: File[] }) => boolean;
      };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: ledger.name || '旅游结算单' });
      } else {
        triggerDownload(blob, `${ledger.name || '结算单'}.png`);
      }
    } catch {
      // 用户取消分享或环境不支持：静默回退（share 取消会抛 AbortError）
      try {
        if (svgRef.current) {
          const blob = await svgElementToPng(svgRef.current, 2);
          triggerDownload(blob, `${ledger.name || '结算单'}.png`);
        }
      } catch {
        /* 忽略 */
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-3xl p-4 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-medium">结算单</h3>
          <button onClick={onClose} className="text-ink-400 text-sm px-2" aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="rounded-2xl border border-ink-200 dark:border-ink-700 overflow-hidden">
          {svg}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={download}
            disabled={busy}
            className="flex-1 py-2.5 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900 text-sm font-medium disabled:opacity-60"
          >
            {busy ? '生成中…' : '下载图片'}
          </button>
          <button
            onClick={share}
            disabled={busy}
            className="flex-1 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-60"
          >
            分享
          </button>
        </div>
        <p className="mt-2 text-[11px] text-ink-400 text-center">
          导出为 PNG，可保存到相册或直接分享给同伴
        </p>
      </div>
    </div>
  );
}
