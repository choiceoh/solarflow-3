import { cn } from '@/lib/utils';

// 솔라 액센트 스피너 — mockup 톤에 맞춰 warm-line + solar-top 회전
export default function LoadingSpinner({
  className,
  label = '로딩 중',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn('flex items-center justify-center p-8', className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div
        className="h-5 w-5 animate-spin rounded-full border-2"
        style={{
          borderColor: 'var(--sf-line-2)',
          borderTopColor: 'var(--sf-solar)',
        }}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
