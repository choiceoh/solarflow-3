// 알림 드롭다운 목록 (Step 31)
import { useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AlertItem } from '@/types/dashboard';

interface Props {
  alerts: AlertItem[];
  onClose: () => void;
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 shrink-0" />,
  info: <Info className="h-3.5 w-3.5 text-blue-600 shrink-0" />,
};

const SEVERITY_BG: Record<string, string> = {
  critical: 'bg-red-50 hover:bg-red-100',
  warning: 'bg-yellow-50 hover:bg-yellow-100',
  info: 'hover:bg-muted',
};

const SEVERITY_PILL: Record<string, string> = {
  critical: 'sf-pill neg',
  warning: 'sf-pill warn',
  info: 'sf-pill info',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRIT',
  warning: 'WARN',
  info: 'INFO',
};

export default function AlertDropdown({ alerts, onClose }: Props) {
  const navigate = useNavigate();
  const visible = alerts.filter((a) => a.count > 0);

  return (
    <div
      className="absolute right-0 top-full z-50 mt-1.5 max-h-[420px] w-80 overflow-auto rounded-md border"
      style={{
        background: 'var(--sf-surface)',
        borderColor: 'var(--sf-line)',
        boxShadow: 'var(--sf-shadow-3)',
      }}
    >
      <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: 'var(--sf-line)' }}>
        <span className="sf-eyebrow">알림</span>
        <span className="sf-mono text-[10.5px] font-semibold" style={{ color: visible.length > 0 ? 'var(--sf-solar-3)' : 'var(--sf-ink-4)' }}>
          {visible.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--sf-ink-3)' }}>알림이 없습니다</div>
      ) : (
        <div className="py-1">
          {visible.map((alert) => (
            <button
              key={alert.id}
              className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${SEVERITY_BG[alert.severity]}`}
              onClick={() => {
                navigate(alert.link);
                onClose();
              }}
            >
              {SEVERITY_ICON[alert.severity]}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={SEVERITY_PILL[alert.severity]}>{SEVERITY_LABEL[alert.severity]}</span>
                  <p className="truncate text-xs font-semibold" style={{ color: 'var(--sf-ink)' }}>{alert.title}</p>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug" style={{ color: 'var(--sf-ink-3)' }}>
                  {alert.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="border-t px-2 py-1.5" style={{ borderColor: 'var(--sf-line)', background: 'var(--sf-bg-2)' }}>
        <Button variant="ghost" size="sm" className="h-7 w-full text-[11px]" onClick={() => { navigate('/dashboard'); onClose(); }}>
          전체 보기 (대시보드)
        </Button>
      </div>
    </div>
  );
}
