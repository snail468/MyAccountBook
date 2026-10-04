'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ui/Dialog';

type ParsedItem = {
  name: string;
  direction: 'out' | 'in';
  amountCents: number;
  category: string;
  occurredAt?: string;
  relationship?: string;
  group: 'relative' | 'friend' | 'colleague' | 'classmate' | 'other';
  giftItemDesc?: string;
  eventTitle?: string;
  note?: string;
  isPendingReturn: boolean;
  rawAmount: string;
  error?: string;
};

export default function BatchImportClient() {
  const toast = useToast();

  const [pasteText, setPasteText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    createdPersonsCount: number;
    createdEventsCount: number;
  } | null>(null);

  // 下载 CSV 模板
  function handleDownloadTemplate() {
    const headers = [
      '姓名(必填)',
      '方向(随礼/收礼)',
      '金额(元必填)',
      '事由(如婚礼/满月)',
      '日期(如2026-05-01)',
      '称谓关系(选填)',
      '分组(亲戚/朋友/同事/同学/其他)',
      '实物说明(选填)',
      '归属大事件礼簿(选填)',
      '备注(选填)',
    ];
    const sampleRows = [
      ['张三', '随礼', '800', '婚礼', '2026-01-15', '大学室友', '同学', '', '', '微信转账'],
      ['李四', '收礼', '1000', '婚礼', '2026-05-01', '表哥', '亲戚', '', '2026年婚礼', '现场红包'],
      ['王大明', '随礼', '500', '生子满月', '2026-06-20', '同事', '同事', '母婴礼盒', '', ''],
    ];

    const csvContent =
      '\uFEFF' +
      [
        headers.join(','),
        ...sampleRows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
      ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '人情往来导入模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // 解析文本（支持制表符或逗号分隔）
  function parseText(raw: string) {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setParsedItems([]);
      return;
    }

    const items: ParsedItem[] = [];

    // 检测是否包含表头行
    let startIndex = 0;
    if (lines[0].includes('姓名') || lines[0].includes('金额') || lines[0].includes('name')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      // 区分 tab 还是 comma
      const separator = line.includes('\t') ? '\t' : ',';
      const cols = line.split(separator).map((c) => c.trim().replace(/^["']|["']$/g, ''));

      if (cols.length === 0 || !cols[0]) continue;

      const name = cols[0] || '';
      const rawDir = cols[1] || '';
      const direction: 'out' | 'in' =
        rawDir.includes('收') || rawDir.toLowerCase() === 'in' ? 'in' : 'out';
      const rawAmount = cols[2] || '';
      const yuan = parseFloat(rawAmount.replace(/[^0-9.-]/g, ''));
      const category = cols[3] || '人情往来';
      const occurredAt = cols[4] || new Date().toISOString().slice(0, 10);
      const relationship = cols[5] || undefined;
      const rawGroup = cols[6] || '';
      let group: 'relative' | 'friend' | 'colleague' | 'classmate' | 'other' = 'other';
      if (rawGroup.includes('亲')) group = 'relative';
      else if (rawGroup.includes('友')) group = 'friend';
      else if (rawGroup.includes('事')) group = 'colleague';
      else if (rawGroup.includes('学')) group = 'classmate';

      const giftItemDesc = cols[7] || undefined;
      const eventTitle = cols[8] || undefined;
      const note = cols[9] || undefined;

      let error = '';
      if (!name) error = '缺少姓名';
      else if (isNaN(yuan) || yuan < 0) error = '金额无效';

      items.push({
        name,
        direction,
        amountCents: isNaN(yuan) ? 0 : Math.round(yuan * 100),
        rawAmount,
        category,
        occurredAt,
        relationship,
        group,
        giftItemDesc,
        eventTitle,
        note,
        isPendingReturn: direction === 'in',
        error: error || undefined,
      });
    }

    setParsedItems(items);
  }

  // 文件上传读取
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setPasteText(content);
      parseText(content);
    };
    reader.readAsText(file, 'utf-8');
  }

  // 提交导入
  async function handleSubmit() {
    if (parsedItems.length === 0) {
      toast({ message: '没有可导入的数据', kind: 'error' });
      return;
    }

    const hasError = parsedItems.some((item) => item.error);
    if (hasError) {
      toast({ message: '存在校验不通过的数据，请先修正', kind: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        items: parsedItems.map((item) => ({
          name: item.name,
          direction: item.direction,
          amountCents: item.amountCents,
          category: item.category,
          occurredAt: item.occurredAt,
          relationship: item.relationship,
          group: item.group,
          giftItemDesc: item.giftItemDesc,
          eventTitle: item.eventTitle,
          note: item.note,
          isPendingReturn: item.isPendingReturn,
        })),
      };

      const res = await fetch('/api/renqing/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '导入失败');
      }

      const result = await res.json();
      setImportResult(result);
      toast({ message: `成功导入 ${result.importedCount} 条记录！`, kind: 'success' });
    } catch (err: any) {
      toast({ message: err.message || '导入失败', kind: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 导入成功展示 */}
      {importResult ? (
        <div className="p-6 rounded-3xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <h2 className="text-xl font-bold text-emerald-800 dark:text-emerald-300">
            批量导入成功！
          </h2>
          <div className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1">
            <p>共成功录入 <strong>{importResult.importedCount}</strong> 笔人情明细</p>
            {importResult.createdPersonsCount > 0 && (
              <p>自动新建了 <strong>{importResult.createdPersonsCount}</strong> 位新亲友联系人档案</p>
            )}
            {importResult.createdEventsCount > 0 && (
              <p>自动建立了 <strong>{importResult.createdEventsCount}</strong> 本大事件礼簿</p>
            )}
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            <Link
              href="/renqing"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition shadow-sm"
            >
              返回人情往来工作台 ›
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* 模版与指引 */}
          <div className="p-5 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">第一步：获取模板或准备数据</h2>
                <p className="text-xs text-ink-500 mt-0.5">
                  支持上传 CSV 模板文件，或直接从 Excel 复制表格粘贴
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-300 font-medium hover:bg-rose-100 transition"
              >
                📥 下载标准模板
              </button>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl border-2 border-dashed border-ink-300 dark:border-ink-600 hover:border-rose-400 text-xs font-medium text-ink-600 dark:text-ink-300 transition">
                <span>📁 上传 CSV 文件</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* 粘贴文本框 */}
          <div className="p-5 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">第二步：粘贴或核对数据</h2>
              {parsedItems.length > 0 && (
                <span className="text-xs text-rose-600 font-medium">
                  已解析 {parsedItems.length} 条记录
                </span>
              )}
            </div>

            <textarea
              rows={4}
              placeholder="可直接在此处粘贴 Excel 中的数据行，或点击上方上传 CSV 文件..."
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                parseText(e.target.value);
              }}
              className="w-full p-3 text-xs rounded-xl border border-ink-200 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-900/50 font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* 实时预览表格 */}
          {parsedItems.length > 0 && (
            <div className="p-5 rounded-3xl bg-white dark:bg-ink-800 border border-ink-200 dark:border-ink-700 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">第三步：数据解析预览</h2>
                <div className="text-xs text-ink-500">
                  {parsedItems.some((i) => i.error) ? (
                    <span className="text-red-500 font-medium">⚠️ 存在错误项，请修改后提交</span>
                  ) : (
                    <span className="text-emerald-500 font-medium">✓ 全部数据校验通过</span>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto max-h-72 border border-ink-100 dark:border-ink-700 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ink-100/70 dark:bg-ink-800 sticky top-0 text-ink-500">
                    <tr>
                      <th className="p-2">#</th>
                      <th className="p-2">姓名</th>
                      <th className="p-2">方向</th>
                      <th className="p-2">金额</th>
                      <th className="p-2">事由</th>
                      <th className="p-2">日期</th>
                      <th className="p-2">大事件礼簿</th>
                      <th className="p-2">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                    {parsedItems.map((item, idx) => (
                      <tr
                        key={idx}
                        className={item.error ? 'bg-red-50/50 dark:bg-red-950/20 text-red-600' : ''}
                      >
                        <td className="p-2 text-ink-400 font-mono">{idx + 1}</td>
                        <td className="p-2 font-medium">{item.name || '-'}</td>
                        <td className="p-2">
                          {item.direction === 'in' ? (
                            <span className="text-emerald-600 font-medium">收礼 🧧</span>
                          ) : (
                            <span className="text-rose-600 font-medium">随礼 💸</span>
                          )}
                        </td>
                        <td className="p-2 font-mono font-medium">
                          ¥{(item.amountCents / 100).toFixed(2)}
                        </td>
                        <td className="p-2">{item.category}</td>
                        <td className="p-2 text-ink-400">{item.occurredAt}</td>
                        <td className="p-2 text-ink-400">{item.eventTitle || '-'}</td>
                        <td className="p-2">
                          {item.error ? (
                            <span className="text-red-500">{item.error}</span>
                          ) : (
                            <span className="text-emerald-500">正常</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <Link
                  href="/renqing"
                  className="px-4 py-2 text-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-200"
                >
                  取消
                </Link>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || parsedItems.some((i) => i.error)}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm transition shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? '正在导入中...' : `确认导入 ${parsedItems.length} 条记录`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
