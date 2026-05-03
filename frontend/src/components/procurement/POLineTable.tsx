import { memo } from 'react';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatNumber, formatUSD, formatWp } from '@/lib/utils';
import type { POLineItem } from '@/types/procurement';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const PO_LINE_TABLE_ID = 'po-line';

interface Props {
  items: POLineItem[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
  manufacturerName?: string;
}

function pCode(l: POLineItem): string { return l.product_code ?? l.products?.product_code ?? '—'; }
function pName(l: POLineItem): string { return l.product_name ?? l.products?.product_name ?? '—'; }
function pSpec(l: POLineItem): number | undefined { return l.spec_wp ?? l.products?.spec_wp; }

interface BuildOpts {
  manufacturerName?: string;
}

function buildColumns({ manufacturerName }: BuildOpts): ColumnDef<POLineItem>[] {
  return [
    { key: 'manufacturer', label: '제조사', hideable: true, cell: () => manufacturerName ?? '—' },
    { key: 'product_code', label: '품번', hideable: true, className: 'font-mono', cell: (l) => pCode(l), sortAccessor: (l) => pCode(l) },
    { key: 'product_name', label: '품명', hideable: true, cell: (l) => pName(l), sortAccessor: (l) => pName(l) },
    { key: 'spec_wp', label: '규격', hideable: true, align: 'right', cell: (l) => { const s = pSpec(l); return s ? formatWp(s) : '—'; }, sortAccessor: (l) => pSpec(l) ?? 0 },
    { key: 'quantity', label: '수량', align: 'right', cell: (l) => formatNumber(l.quantity), sortAccessor: (l) => l.quantity },
    {
      key: 'payment_type', label: '유/무상', hideable: true,
      cell: (l) => l.payment_type === 'free'
        ? <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">무상</span>
        : <span className="text-[10px] text-muted-foreground">유상</span>,
      sortAccessor: (l) => l.payment_type ?? '',
    },
    {
      key: 'unit_price', label: '단가(¢/Wp)', hideable: true, align: 'right',
      cell: (l) => {
        const spec = pSpec(l);
        const cents = (l.unit_price_usd != null && spec) ? (l.unit_price_usd / spec) * 100 : null;
        return cents != null ? `${cents.toFixed(2)}¢` : '—';
      },
      sortAccessor: (l) => {
        const spec = pSpec(l);
        return (l.unit_price_usd != null && spec) ? (l.unit_price_usd / spec) * 100 : 0;
      },
    },
    { key: 'total_usd', label: '총액(USD)', hideable: true, align: 'right', className: 'font-medium', cell: (l) => l.total_amount_usd != null ? formatUSD(l.total_amount_usd) : '—', sortAccessor: (l) => l.total_amount_usd ?? 0 },
  ];
}

export const PO_LINE_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({}).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function POLineTable({ items, hidden, pinning, onPinningChange, manufacturerName }: Props) {
  return (
    <MetaTable
      tableId={PO_LINE_TABLE_ID}
      columns={buildColumns({ manufacturerName })}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      getRowKey={(l) => l.po_line_id}
      emptyMessage="발주품목이 없습니다"
    />
  );
}

export default memo(POLineTable);
