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

export default function AlertDropdown({ alerts, onClose }: Props) {
  const navigate = useNavigate();
  const visible = alerts.filter((a) => a.count > 0);

  return (
    <div className="absolute right-0 top-full mt-1 w-80 bg-card border rounded-lg shadow-lg z-50 max-h-[400px] overflow-auto">
      <div className="px-3 py-2 border-b">
        <h3 className="text-sm font-medium">알림 ({visible.length})</h3>
      </div>

      {visible.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">알림이 없습니다</div>
      ) : (
        <div className="py-1">
          {visible.map((alert) => (
            <button
              key={alert.id}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 transition-colors ${SEVERITY_BG[alert.severity]}`}
              onClick={() => {
                navigate(alert.link);
                onClose();
              }}
            >
              {SEVERITY_ICON[alert.severity]}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground">{alert.description}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="px-3 py-2 border-t">
        <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { navigate('/'); onClose(); }}>
          전체 보기 (대시보드)
        </Button>
      </div>
    </div>
  );
}
