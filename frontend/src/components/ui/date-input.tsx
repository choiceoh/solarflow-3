import { forwardRef, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';
import { normDate } from './date-input-utils';

/**
 * DateInput — 텍스트 직접 입력 + 달력 선택을 모두 지원하는 공통 날짜 컴포넌트
 *
 * 동작:
 * - 사용자는 "20260407" 또는 "2026-4-7" 같은 형식으로 자유 타이핑 가능 (onBlur 시 정규화)
 * - 우측 달력 아이콘 클릭 → 네이티브 date picker 표시 (input.showPicker())
 * - 네이티브 picker에서 날짜 선택 → 텍스트에 반영
 * - 값은 항상 "YYYY-MM-DD" 형식의 string
 *
 * 사용:
 *   <DateInput value={date} onChange={setDate} placeholder="..." />
 */

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export const DateInput = forwardRef<HTMLInputElement, Props>(function DateInput(
  { value, onChange, placeholder = 'YYYY-MM-DD 또는 20260407', className, disabled, id, name, onKeyDown },
  ref,
) {
  // 외부 value 변경을 즉시 반영하기 위해 prev value를 추적하고 렌더 중 setState 호출 (set-state-in-effect 회피)
  const [text, setText] = useState(value ?? '');
  const [prevValue, setPrevValue] = useState(value ?? '');
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value ?? '');
  }
  const nativeRef = useRef<HTMLInputElement>(null);

  const nativeDateValue = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';

  const openPicker = () => {
    if (disabled) return;
    const el = nativeRef.current;
    if (!el) return;
    try { el.showPicker?.(); } catch { el.click(); }
  };

  return (
    <div className={cn('relative', className)}>
      <Input
        ref={ref}
        type="text"
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        id={id}
        name={name}
        onKeyDown={onKeyDown}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          const v = normDate(e.target.value);
          setText(v);
          if (v !== value) onChange(v);
        }}
        className="pr-10"
      />
      {/* 달력 아이콘 — 클릭 시 showPicker() 호출 */}
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        aria-label="달력에서 날짜 선택"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Calendar className="h-4 w-4" />
      </button>
      {/* 숨겨진 네이티브 date input — showPicker() 타깃 */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        value={nativeDateValue}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          onChange(v);
        }}
        className="absolute right-0 top-0 h-full w-0 opacity-0 pointer-events-none"
      />
    </div>
  );
});
