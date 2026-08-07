'use client';

import { useMemo, useRef, useState } from 'react';
import type { Member } from './TravelView';
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

export default function SettlementSheet({
  ledger,
  members,
  balances,
  transfers,
  settlementError,
  totalSpentCents,
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
  balances: NetBalance[];
  transfers: Transfer[];
  settlementError: string | null;
  totalSpentCents: number;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);

  const { svg } = useMemo(() => {
    const els: React.ReactNode[] = [];
    let y = 0;

    // 背景
    els.push(<rect key="bg" x={0} y={0} width={W} height={2000} fill={BG} />);

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

    // 成员净额
    y = 136;
    els.push(
      <text key="h1" x={PAD} y={y} fontSize={15} fontWeight={700} fill={ACCENT} fontFamily="sans-serif">
        成员净额
      </text>,
    );
    y = 164;
    for (const b of balances) {
      const settled = members.find((m) => m.id === b.memberId)?.settled;
      const label = b.netCents > 0 ? '应收' : b.netCents < 0 ? '应付' : '已平';
      els.push(
        <text key={`b-${b.memberId}`} x={PAD} y={y} fontSize={14} fill={INK} fontFamily="sans-serif">
          {b.name}
          {settled ? '  ✓已结清' : ''}
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
      y += 28;
    }

    // 最优结算
    y += 12;
    els.push(<line key="ln2" x1={PAD} y1={y} x2={W - PAD} y2={y} stroke={LINE} strokeWidth={1} />);
    y += 32;
    els.push(
      <text key="h2" x={PAD} y={y} fontSize={15} fontWeight={700} fill={ACCENT} fontFamily="sans-serif">
        最优结算
      </text>,
    );
    y += 28;
    if (settlementError) {
      els.push(
        <text key="err" x={PAD} y={y} fontSize={13} fill={SUB} fontFamily="sans-serif">
          部分记录分摊不守恒，暂无法生成转账清单（请在账本内逐笔编辑保存修正）
        </text>,
      );
      y += 28;
    } else if (transfers.length === 0) {
      els.push(
        <text key="flat" x={PAD} y={y} fontSize={13} fill={SUB} fontFamily="sans-serif">
          无需转账，大家已平
        </text>,
      );
      y += 28;
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
        y += 28;
      }
    }

    // 页脚：总花费 + 生成时间
    y += 16;
    els.push(<line key="ln3" x1={PAD} y1={y} x2={W - PAD} y2={y} stroke={LINE} strokeWidth={1} />);
    y += 30;
    const now = new Date();
    els.push(
      <text key="foot" x={PAD} y={y} fontSize={13} fill={INK} fontFamily="sans-serif">
        {`总花费 ${fmt(totalSpentCents)} ${ledger.baseCurrency} · 生成于 ${now.toISOString().slice(0, 10)}`}
      </text>,
    );
    y += 36;

    return {
      svg: (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${y}`}
          width="100%"
          style={{ display: 'block', borderRadius: 16, background: BG }}
          role="img"
          aria-label="旅游结算单"
        >
          {els}
        </svg>
      ),
    };
  }, [ledger, members, balances, transfers, settlementError, totalSpentCents]);

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
