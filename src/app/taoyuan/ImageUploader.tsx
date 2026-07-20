'use client';

import { useRef, useState } from 'react';

export default function ImageUploader({
  value,
  onChange,
  namePrefix,
  max = 9,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  // 上传时用作文件名前缀（活动名）；服务端会自动清洗特殊字符 + 补编号
  namePrefix?: string;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    const remaining = Math.max(0, max - value.length);
    if (remaining === 0) {
      setError(`最多 ${max} 张`);
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    setBusy(true);
    try {
      const uploaded: string[] = [];
      for (const f of list) {
        const fd = new FormData();
        fd.append('file', f);
        if (namePrefix && namePrefix.trim()) fd.append('title', namePrefix.trim());
        const res = await fetch('/api/events/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');
        uploaded.push(data.url);
      }
      onChange([...value, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => pickFiles(e.target.files)}
      />
      <div className="grid grid-cols-3 gap-2">
        {value.map((url, i) => (
          <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-ink-100 dark:bg-ink-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
              aria-label="删除"
            >
              ✕
            </button>
          </div>
        ))}
        {value.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="aspect-square rounded-lg border-2 border-dashed border-ink-300 dark:border-ink-600 text-ink-400 text-3xl active:scale-95 disabled:opacity-50"
          >
            {busy ? '…' : '+'}
          </button>
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      <p className="text-[10px] text-ink-400 mt-1">
        单张 ≤ 8MB · jpg/png/webp/gif · 最多 {max} 张
      </p>
    </div>
  );
}
