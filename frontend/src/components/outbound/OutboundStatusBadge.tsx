import { cn } from '@/lib/utils';
import { OUTBOUND_STATUS_LABEL, OUTBOUND_STATUS_COLOR, type OutboundStatus } from '@/types/outbound';

export default function OutboundStatusBadge({ status }: { status: OutboundStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
      OUTBOUND_STATUS_COLOR[status]
    )}>
      {OUTBOUND_STATUS_LABEL[status]}
    </span>
  );
}
