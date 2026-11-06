'use client';

import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  autoRepairExpression,
  evaluateMathExpression,
  hasMathOperators,
  tryEvaluate,
} from '@/lib/calculator';

export interface AmountCalculatorInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size' | 'prefix'> {
  value: string;
  onChange: (value: string) => void;
  onEvaluated?: (cents: number, formatted: string) => void;
  onEnterSubmit?: () => void;
  allowZero?: boolean;
  maxAmount?: number;
  showOperatorBar?: boolean;
  operatorBarMode?: 'auto' | 'always' | 'never';
  containerClassName?: string;
  prefix?: React.ReactNode;
  unitSuffix?: React.ReactNode;
}

export default function AmountCalculatorInput({
  value,
  onChange,
  onEvaluated,
  onEnterSubmit,
  allowZero = false,
  maxAmount,
  showOperatorBar = true,
  operatorBarMode = 'auto',
  containerClassName = '',
  className = '',
  prefix,
  unitSuffix,
  placeholder = '0.00',
  autoFocus,
  disabled,
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: AmountCalculatorInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const helpId = useId();

  // 实时运算预览
  const previewResult = useMemo(() => {
    if (!value || !hasMathOperators(value)) return null;
    const res = tryEvaluate(value, { allowZero, maxAmount });
    if (res === null) return null;
    return res.toFixed(2);
  }, [value, allowZero, maxAmount]);

  // 触发最终计算与规整
  const handleEvaluate = useCallback(() => {
    if (!value || !hasMathOperators(value)) return;
    const repaired = autoRepairExpression(value);
    const res = evaluateMathExpression(repaired, { allowZero, maxAmount });
    if (res.ok) {
      onChange(res.formatted);
      onEvaluated?.(res.cents, res.formatted);
    }
  }, [value, allowZero, maxAmount, onChange, onEvaluated]);

  // 插入运算符并保持光标位置
  const handleInsert = useCallback(
    (char: string) => {
      const el = inputRef.current;
      if (!el) {
        onChange((value || '') + char);
        return;
      }
      const start = el.selectionStart ?? (value || '').length;
      const end = el.selectionEnd ?? (value || '').length;
      const next = (value || '').slice(0, start) + char + (value || '').slice(end);
      onChange(next);
      // 保持焦点在输入框
      requestAnimationFrame(() => {
        el.focus();
        const nextPos = start + char.length;
        el.setSelectionRange(nextPos, nextPos);
      });
    },
    [value, onChange],
  );

  // 清空输入
  const handleClear = useCallback(() => {
    onChange('');
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [onChange]);

  // 失焦时自动完成挂起算式并格式化
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    if (value && hasMathOperators(value)) {
      handleEvaluate();
    }
    onBlur?.(e);
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  // IME 安全回车及按键响应
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 遵守 Modern Web 规范：中文输入法合成期间不触发
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      onKeyDown?.(e);
      return;
    }

    if (e.key === '=') {
      if (hasMathOperators(value)) {
        e.preventDefault();
        handleEvaluate();
        return;
      }
    }

    if (e.key === 'Enter') {
      if (hasMathOperators(value)) {
        e.preventDefault();
        handleEvaluate();
        if (onEnterSubmit) {
          onEnterSubmit();
        }
        return;
      }
      if (onEnterSubmit) {
        onEnterSubmit();
      }
    }

    onKeyDown?.(e);
  };

  const shouldShowBar =
    showOperatorBar &&
    (operatorBarMode === 'always' ||
      (operatorBarMode === 'auto' && (isFocused || hasMathOperators(value))));

  return (
    <div className={`relative flex flex-col ${containerClassName}`}>
      <div className="relative flex items-center w-full">
        {prefix && <div className="shrink-0 flex items-center">{prefix}</div>}

        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          autoFocus={autoFocus}
          disabled={disabled}
          className={className}
          aria-describedby={previewResult ? helpId : undefined}
          {...rest}
        />

        {unitSuffix && <div className="shrink-0 flex items-center">{unitSuffix}</div>}

        {/* 算式实时预览徽章（可点击直接完成计算） */}
        {previewResult !== null && (
          <button
            type="button"
            id={helpId}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleEvaluate}
            className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 shadow-sm hover:scale-105 active:scale-95 transition-all flex items-center gap-1 z-10"
            title="点击确认计算结果"
          >
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">=</span>
            <span>¥{previewResult}</span>
          </button>
        )}
      </div>

      {/* 算符工具栏（移动端键盘无运算符时的快捷输入板） */}
      {shouldShowBar && !disabled && (
        <div
          className="flex items-center justify-between gap-1 mt-1.5 p-1 rounded-xl bg-ink-50/80 dark:bg-ink-800/80 border border-ink-200/60 dark:border-ink-700/60 text-xs select-none transition-all animate-in fade-in slide-in-from-top-1 duration-150"
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-1 flex-1 overflow-x-auto py-0.5 no-scrollbar">
            {(['+', '-', '*', '/'] as const).map((op) => {
              const label = op === '*' ? '×' : op === '/' ? '÷' : op;
              return (
                <button
                  key={op}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleInsert(op)}
                  className="flex-1 min-w-[28px] h-7 flex items-center justify-center rounded-lg bg-white dark:bg-ink-700 hover:bg-ink-100 dark:hover:bg-ink-600 border border-ink-200 dark:border-ink-600 text-ink-800 dark:text-ink-100 font-mono font-semibold active:scale-95 transition shadow-sm text-sm"
                  title={`输入 ${label}`}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleInsert('(')}
              className="flex-1 min-w-[26px] h-7 flex items-center justify-center rounded-lg bg-white dark:bg-ink-700 hover:bg-ink-100 dark:hover:bg-ink-600 border border-ink-200 dark:border-ink-600 text-ink-800 dark:text-ink-100 font-mono font-semibold active:scale-95 transition shadow-sm text-xs"
              title="输入左括号 ("
            >
              (
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleInsert(')')}
              className="flex-1 min-w-[26px] h-7 flex items-center justify-center rounded-lg bg-white dark:bg-ink-700 hover:bg-ink-100 dark:hover:bg-ink-600 border border-ink-200 dark:border-ink-600 text-ink-800 dark:text-ink-100 font-mono font-semibold active:scale-95 transition shadow-sm text-xs"
              title="输入右括号 )"
            >
              )
            </button>
          </div>

          <div className="flex items-center gap-1 shrink-0 pl-1 border-l border-ink-200 dark:border-ink-700">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleEvaluate}
              disabled={!value || !hasMathOperators(value)}
              className="px-2.5 h-7 flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white font-mono font-bold active:scale-95 transition shadow-sm text-xs"
              title="计算结果 (=)"
            >
              =
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleClear}
              className="px-2 h-7 flex items-center justify-center rounded-lg bg-ink-200/70 hover:bg-ink-300 dark:bg-ink-700 dark:hover:bg-ink-600 text-ink-600 dark:text-ink-300 font-mono font-medium active:scale-95 transition text-[11px]"
              title="清空"
            >
              C
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
