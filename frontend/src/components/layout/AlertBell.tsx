// 헤더 알림 벨 아이콘 + 드롭다운 (Step 31)
import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import AlertDropdown from './AlertDropdown';
import type { AlertItem } from '@/types/dashboard';

interface Props {
  alerts: AlertItem[];
  totalCount: number;
  criticalCount: number;
}

export default function AlertBell({ alerts, totalCount, criticalCount }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭으로 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const badgeCount = criticalCount > 0 ? criticalCount : totalCount;

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon-xs" className="btn xs ghost icon relative" onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {badgeCount > 0 && (
          <span
            className={cn(
              'sf-mono absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border-[1.5px] border-[var(--sf-surface)] px-1 text-[9px] font-bold tabular-nums text-white',
              criticalCount > 0 ? 'bg-[var(--sf-neg)]' : 'bg-[var(--sf-solar-2)]',
            )}
          >
            {badgeCount}
          </span>
        )}
      </Button>

      {open && (
        <AlertDropdown alerts={alerts} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
