import { memo } from 'react';
import { Pencil, ReceiptText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import OutboundStatusBadge from './OutboundStatusBadge';
import { formatDate, formatNumber, formatKw, cn } from '@/lib/utils';
import { USAGE_CATEGORY_LABEL, type Outbound } from '@/types/outbound';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

export const OUTBOUND_TABLE_ID = 'outbound-list';

interface Props {
  items: Outbound[];
  hidden: Set<string>;
  onSelect: (item: Outbound) => void;
  onNew: () => void;
  onInvoice?: (item: Outbound) => void;
}

function buildColumns({ onInvoice }: { onInvoice?: (item: Outbound) => void }): ColumnDef<Outbound>[] {
  return [
    { key: 'outbound_date', label: '출고일', cell: (ob) => formatDate(ob.outbound_date) },
    { key: 'product_code', label: '품번', hideable: true, className: 'font-mono', cell: (ob) => ob.product_code ?? '—' },
    { key: 'product_name', label: '품명', hideable: true, cell: (ob) => ob.product_name ?? '—' },
    { key: 'spec_wp', label: '규격', hideable: true, cell: (ob) => (ob.spec_wp ? `${ob.spec_wp}` : '—') },
    { key: 'quantity', label: '수량', hideable: true, align: 'right', className: 'tabular-nums', cell: (ob) => formatNumber(ob.quantity) },
    { key: 'capacity_kw', label: '용량', hideable: true, align: 'right', className: 'tabular-nums', cell: (ob) => formatKw(ob.capacity_kw) },
    { key: 'warehouse_name', label: '창고', hideable: true, cell: (ob) => ob.warehouse_name ?? '—' },
    { key: 'usage_category', label: '용도', hideable: true, cell: (ob) => USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category },
    { key: 'site_name', label: '현장명', hideable: true, cell: (ob) => ob.site_name ?? '—' },
    { key: 'order_number', label: '수주연결', hideable: true, cell: (ob) => ob.order_number ?? '—' },
    {
      key: 'group_trade', label: '그룹거래', hideable: true, hiddenByDefault: true,
      cell: (ob) => ob.group_trade ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="sf-pill info">그룹</span>
          <span className="text-[10px]" style={{ color: 'var(--sf-ink-3)' }}>{ob.target_company_name}</span>
        </span>
      ) : '—',
    },
    {
      key: 'sale_invoice', label: '계산서', hideable: true,
      cell: (ob) => ob.sale ? (
        ob.sale.tax_invoice_date
          ? <span className="sf-pill pos">{formatDate(ob.sale.tax_invoice_date)}</span>
          : <span className="sf-pill warn">미발행</span>
      ) : <span className="sf-pill ghost">미등록</span>,
    },
    { key: 'status', label: '상태', cell: (ob) => <OutboundStatusBadge status={ob.status} /> },
    {
      key: 'actions', label: '작업', align: 'right',
      cell: (ob) => (
        onInvoice && ob.status !== 'cancelled' && ['sale', 'sale_spare'].includes(ob.usage_category) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={(e) => { e.stopPropagation(); onInvoice(ob); }}
          >
            {ob.sale ? <Pencil className="mr-1 h-3 w-3" /> : <ReceiptText className="mr-1 h-3 w-3" />}
            {ob.sale ? '수정' : '등록'}
          </Button>
        ) : <span className="text-muted-foreground">—</span>
      ),
    },
  ];
}

export const OUTBOUND_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({}).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function OutboundListTable({ items, hidden, onSelect, onNew, onInvoice }: Props) {
  return (
    <MetaTable
      tableId={OUTBOUND_TABLE_ID}
      columns={buildColumns({ onInvoice })}
      hidden={hidden}
      items={items}
      getRowKey={(ob) => ob.outbound_id}
      onRowClick={onSelect}
      rowClassName={(ob) => cn(
        'hover:bg-accent/50',
        ob.status === 'cancel_pending' && 'bg-orange-50',
        ob.status === 'cancelled' && 'bg-gray-50 text-muted-foreground line-through',
      )}
      emptyMessage="등록된 출고가 없습니다"
      emptyAction={{ label: '새로 등록', onClick: onNew }}
    />
  );
}

export default memo(OutboundListTable);
