import { memo } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatNumber, formatUSD, formatWp } from '@/lib/utils';
import type { POLineItem } from '@/types/procurement';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

export const PO_LINE_TABLE_ID = 'po-line';

interface Props {
  items: POLineItem[];
  hidden: Set<string>;
  onEdit: (line: POLineItem) => void;
  manufacturerName?: string;
}

function pCode(l: POLineItem): string { return l.product_code ?? l.products?.product_code ?? '—'; }
function pName(l: POLineItem): string { return l.product_name ?? l.products?.product_name ?? '—'; }
function pSpec(l: POLineItem): number | undefined { return l.spec_wp ?? l.products?.spec_wp; }

interface BuildOpts {
  onEdit: (line: POLineItem) => void;
  manufacturerName?: string;
}

function buildColumns({ onEdit, manufacturerName }: BuildOpts): ColumnDef<POLineItem>[] {
  return [
    { key: 'manufacturer', label: '제조사', hideable: true, cell: () => manufacturerName ?? '—' },
    { key: 'product_code', label: '품번', hideable: true, className: 'font-mono', cell: (l) => pCode(l) },
    { key: 'product_name', label: '품명', hideable: true, cell: (l) => pName(l) },
    { key: 'spec_wp', label: '규격', hideable: true, align: 'right', cell: (l) => { const s = pSpec(l); return s ? formatWp(s) : '—'; } },
    { key: 'quantity', label: '수량', align: 'right', cell: (l) => formatNumber(l.quantity) },
    {
      key: 'payment_type', label: '유/무상', hideable: true,
      cell: (l) => l.payment_type === 'free'
        ? <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">무상</span>
        : <span className="text-[10px] text-muted-foreground">유상</span>,
    },
    {
      key: 'unit_price', label: '단가(¢/Wp)', hideable: true, align: 'right',
      cell: (l) => {
        const spec = pSpec(l);
        const cents = (l.unit_price_usd != null && spec) ? (l.unit_price_usd / spec) * 100 : null;
        return cents != null ? `${cents.toFixed(2)}¢` : '—';
      },
    },
    { key: 'total_usd', label: '총액(USD)', hideable: true, align: 'right', className: 'font-medium', cell: (l) => l.total_amount_usd != null ? formatUSD(l.total_amount_usd) : '—' },
    {
      key: 'actions', label: '', headerClassName: 'w-10',
      cell: (l) => (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(l)} disabled={l.payment_type === 'free'}>
          <Pencil className="h-3 w-3" />
        </Button>
      ),
    },
  ];
}

export const PO_LINE_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({ onEdit: () => {} }).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function POLineTable({ items, hidden, onEdit, manufacturerName }: Props) {
  return (
    <MetaTable
      columns={buildColumns({ onEdit, manufacturerName })}
      hidden={hidden}
      items={items}
      getRowKey={(l) => l.po_line_id}
      emptyMessage="발주품목이 없습니다"
    />
  );
}

export default memo(POLineTable);
