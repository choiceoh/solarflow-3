import { cn } from '@/lib/utils';
import { FULFILLMENT_SOURCE_LABEL, FULFILLMENT_SOURCE_COLOR, type FulfillmentSource } from '@/types/orders';

export default function FulfillmentSourceBadge({ source }: { source: FulfillmentSource }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
      FULFILLMENT_SOURCE_COLOR[source]
    )}>
      {FULFILLMENT_SOURCE_LABEL[source]}
    </span>
  );
}
