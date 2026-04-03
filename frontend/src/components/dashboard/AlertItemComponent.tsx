import { useNavigate } from 'react-router-dom';
import {
  Clock, TrendingDown, AlertTriangle, AlertCircle,
  FileText, Ship, Package, PackageX, Truck,
} from 'lucide-react';
import type { AlertItem } from '@/types/dashboard';

const ICON_MAP: Record<string, React.ElementType> = {
  Clock, TrendingDown, AlertTriangle, AlertCircle,
  FileText, Ship, Package, PackageX, Truck,
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-200 bg-red-50/50 text-red-700',
  warning: 'border-yellow-200 bg-yellow-50/50 text-yellow-700',
  info: 'border-blue-200 bg-blue-50/50 text-blue-700',
};

const BADGE_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
};

interface Props {
  alert: AlertItem;
}

export default function AlertItemComponent({ alert }: Props) {
  const navigate = useNavigate();
  const Icon = ICON_MAP[alert.icon] || AlertCircle;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:opacity-80 transition-opacity ${SEVERITY_STYLE[alert.severity]}`}
      onClick={() => navigate(alert.link)}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{alert.title}</p>
        <p className="text-[10px] opacity-80 truncate">{alert.description}</p>
      </div>
      <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${BADGE_STYLE[alert.severity]}`}>
        {alert.count}
      </span>
    </div>
  );
}
