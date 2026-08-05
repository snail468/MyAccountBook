'use client';

import { useState } from 'react';
import {
  ICON_LIBRARY,
  type GeneralCategory,
  type GeneralCategoryDirection,
} from '@/lib/generalCategories';
import { inputCls } from './styles';

export default function AddCategoryModal({
  direction,
  existingNames,
  onCancel,
  onAdd,
}: {
  direction: GeneralCategoryDirection;
  existingNames: string[];
  onCancel: () => void;
  onAdd: (c: GeneralCategory) => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>('🌟');
  const [error, setError] = useState('');

  function confirmAdd() {
    const n = name.trim();
    if (!n) {
      setError('请输入类别名');
      return;
    }
    if (n.length > 12) {
      setError('类别名不超过 12 个字符');
      return;
    }
    if (existingNames.includes(n)) {
      setError('该类别名已存在');
      return;
    }
    onAdd({ name: n, icon, direction });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium mb-4">
          新增{direction === 'expense' ? '支出' : '收入'}类别
        </h3>

        <label className="block text-xs text-ink-500 mb-1">类别名</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          placeholder="例：健身、买菜、副业A"
          maxLength={12}
          className={inputCls}
        />

        <label className="block text-xs text-ink-500 mt-4 mb-2">
          图标（当前 <span className="text-lg">{icon}</span>）
        </label>
        <div className="space-y-3 max-h-[40dvh] overflow-y-auto rounded-2xl bg-ink-50 dark:bg-ink-800 p-2">
          {ICON_LIBRARY.map((g) => (
            <div key={g.group}>
              <div className="text-[10px] text-ink-500 px-1 mb-1">{g.group}</div>
              <div className="grid grid-cols-8 gap-1">
                {g.icons.map((emo) => (
                  <button
                    key={emo}
                    onClick={() => setIcon(emo)}
                    className={`aspect-square rounded-lg text-xl leading-none flex items-center justify-center transition ${
                      icon === emo
                        ? 'bg-ink-900 dark:bg-ink-100 ring-2 ring-ink-500'
                        : 'bg-white dark:bg-ink-700'
                    }`}
                  >
                    {emo}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl bg-ink-50 dark:bg-ink-800"
          >
            取消
          </button>
          <button
            onClick={confirmAdd}
            className="flex-1 py-3 rounded-2xl bg-ink-900 dark:bg-ink-100 text-white dark:text-ink-900"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
