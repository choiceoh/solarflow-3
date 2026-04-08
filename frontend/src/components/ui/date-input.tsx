import { forwardRef, useRef, useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';

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

/** 8자리/축약 형식을 YYYY-MM-DD로 정규화 */
export function normDate(v: string): string {
  if (!v) return v;
  const digits = v.replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return v;
}

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
  const [text, setText] = useState(value ?? '');
  const hiddenDateRef = useRef<HTMLInputElement>(null);

  // value 외부 변경 시 text 동기화
  useEffect(() => { setText(value ?? ''); }, [value]);

  const openPicker = () => {
    if (disabled) return;
    const el = hiddenDateRef.current;
    if (!el) return;
    // 기존 값 동기화 — 유효 포맷일 때만
    const normalized = normDate(text);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      el.value = normalized;
    }
    // showPicker가 지원되지 않는 브라우저는 focus+click fallback
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (el as any).showPicker === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (el as any).showPicker();
      } else {
        el.focus();
        el.click();
      }
    } catch {
      el.focus();
      el.click();
    }
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
        className="pr-9"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground"
        aria-label="날짜 선택"
      >
        <Calendar className="h-4 w-4" />
      </button>
      {/* 달력 트리거용 숨겨진 네이티브 date input */}
      <input
        ref={hiddenDateRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          onChange(v);
        }}
      />
    </div>
  );
});
