import { cn } from '@/lib/utils';

// 솔라 액센트 스피너 — mockup 톤에 맞춰 warm-line + solar-top 회전
export default function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)}>
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--sf-line-2)] border-t-[var(--sf-solar)]" />
    </div>
  );
}
