import { cn } from '@/lib/utils';
import { BL_STATUS_LABEL, BL_STATUS_COLOR, type BLStatus } from '@/types/inbound';

export default function InboundStatusBadge({ status }: { status: BLStatus }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
      BL_STATUS_COLOR[status]
    )}>
      {BL_STATUS_LABEL[status]}
    </span>
  );
}
