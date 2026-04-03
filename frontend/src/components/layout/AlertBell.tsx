// 헤더 알림 벨 아이콘 + 드롭다운 (Step 31)
import { useState, useRef, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppStore } from '@/stores/appStore';
import { useAlerts } from '@/hooks/useAlerts';
import AlertDropdown from './AlertDropdown';

export default function AlertBell() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const { alerts, totalCount, criticalCount } = useAlerts(selectedCompanyId);
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
      <Button variant="ghost" size="icon" className="h-8 w-8 relative" onClick={() => setOpen(!open)}>
        <Bell className="h-4 w-4" />
        {badgeCount > 0 && (
          <Badge
            className={`absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] flex items-center justify-center ${
              criticalCount > 0 ? 'bg-red-600' : 'bg-yellow-500'
            } text-white border-0`}
          >
            {badgeCount}
          </Badge>
        )}
      </Button>

      {open && (
        <AlertDropdown alerts={alerts} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
