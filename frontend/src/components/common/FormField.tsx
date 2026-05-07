import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label: ReactNode;
  /** 필수 표시 — `*` + aria-label 자동 부착. */
  required?: boolean;
  /** zod/react-hook-form `errors.field?.message` 직접 전달 가능. */
  error?: string | undefined;
  /** 에러 없을 때만 노출되는 보조 설명. */
  hint?: ReactNode;
  className?: string;
  /** 사이즈
   *  - `default`: 표준 라벨 + 6px gap (마스터 폼 기본)
   *  - `dense`:   12px 라벨 + 4px gap (LC/PO 등록 다이얼로그)
   *  - `compact`: 11px 라벨 + 4px gap (PO 라인 그리드 셀)
   */
  size?: 'default' | 'dense' | 'compact';
  children: ReactNode;
}

/** 폼 필드 래퍼 — `<Label>`, 입력, 에러/힌트 메시지 묶음.
 *  마스터 폼 곳곳의 `<div className="space-y-1.5">` 블록을 대체.
 *  에러는 `role="alert"` 로 스크린리더에 알려진다. */
export default function FormField({
  label, required, error, hint, className, size = 'default', children,
}: FormFieldProps) {
  const labelClass = size === 'compact' ? 'text-[11px]' : size === 'dense' ? 'text-[12px]' : undefined;
  const wrapperClass = size === 'default' ? 'space-y-1.5' : 'flex flex-col gap-1';
  return (
    <div className={cn(wrapperClass, className)}>
      <Label className={labelClass}>
        {label}
        {required && <span className="text-destructive ml-1" aria-label="필수">*</span>}
      </Label>
      {children}
      {error
        ? <p className="text-xs text-destructive" role="alert">{error}</p>
        : hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
