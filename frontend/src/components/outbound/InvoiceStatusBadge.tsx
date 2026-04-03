import { cn } from '@/lib/utils';
import type { Outbound } from '@/types/outbound';

type InvoiceStatus = 'issued' | 'pending' | 'none';

function getInvoiceStatus(outbound: Outbound): InvoiceStatus {
  if (!outbound.sale) return 'none';
  if (outbound.sale.tax_invoice_date) return 'issued';
  return 'pending';
}

const LABEL: Record<InvoiceStatus, string> = {
  issued: '계산서 발행',
  pending: '계산서 미발행',
  none: '매출 미등록',
};

const COLOR: Record<InvoiceStatus, string> = {
  issued: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  none: 'bg-gray-100 text-gray-500',
};

export default function InvoiceStatusBadge({ outbound }: { outbound: Outbound }) {
  const status = getInvoiceStatus(outbound);
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
      COLOR[status]
    )}>
      {LABEL[status]}
    </span>
  );
}
