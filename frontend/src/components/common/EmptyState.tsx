import { Inbox, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  message?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}

// 빈 상태 — mockup의 차분한 well + 미세 hierarchy 패턴
export default function EmptyState({
  message = '데이터가 없습니다',
  description,
  actionLabel,
  onAction,
  icon: Icon = Inbox,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--sf-bg-2)] text-[var(--sf-ink-4)]">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-[var(--sf-ink-2)]">{message}</p>
      {description && (
        <p className="max-w-xs text-xs leading-relaxed text-[var(--sf-ink-3)]">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="mt-2">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
