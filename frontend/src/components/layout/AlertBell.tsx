// 헤더 알림 벨 아이콘 + 드롭다운 (Step 31)
import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <Button variant="ghost" size="icon-lg" className="relative" onClick={() => setOpen(!open)}>
        <Bell className="h-5 w-5" />
        {badgeCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
            style={{
              background: criticalCount > 0 ? 'var(--sf-neg)' : 'var(--sf-solar-2)',
              color: '#fff',
              fontFamily: 'var(--sf-mono)',
              border: '1.5px solid var(--sf-surface)',
            }}
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
