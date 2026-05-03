import { memo } from 'react';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import OutboundStatusBadge from './OutboundStatusBadge';
import { formatDate, formatNumber, formatKw, cn } from '@/lib/utils';
import { USAGE_CATEGORY_LABEL, type Outbound } from '@/types/outbound';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const OUTBOUND_TABLE_ID = 'outbound-list';

interface Props {
  items: Outbound[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
  onSelect: (item: Outbound) => void;
  globalFilter?: string;
}

function buildColumns(): ColumnDef<Outbound>[] {
  return [
    { key: 'outbound_date', label: '출고일', cell: (ob) => formatDate(ob.outbound_date), sortAccessor: (ob) => ob.outbound_date ?? '' },
    { key: 'site_name', label: '현장명', hideable: true, cell: (ob) => ob.site_name ?? '—', sortAccessor: (ob) => ob.site_name ?? '', globalFilterText: (ob) => ob.site_name ?? '' },
    { key: 'product_code', label: '품번', hideable: true, className: 'font-mono', cell: (ob) => ob.product_code ?? '—', sortAccessor: (ob) => ob.product_code ?? '', globalFilterText: (ob) => ob.product_code ?? '' },
    { key: 'product_name', label: '품명', hideable: true, cell: (ob) => ob.product_name ?? '—', sortAccessor: (ob) => ob.product_name ?? '', globalFilterText: (ob) => ob.product_name ?? '' },
    { key: 'spec_wp', label: '규격', hideable: true, cell: (ob) => (ob.spec_wp ? `${ob.spec_wp}` : '—'), sortAccessor: (ob) => ob.spec_wp ?? 0 },
    { key: 'quantity', label: '수량', hideable: true, align: 'right', className: 'tabular-nums', cell: (ob) => formatNumber(ob.quantity), sortAccessor: (ob) => ob.quantity },
    { key: 'capacity_kw', label: '용량', hideable: true, align: 'right', className: 'tabular-nums', cell: (ob) => formatKw(ob.capacity_kw), sortAccessor: (ob) => ob.capacity_kw ?? 0 },
    { key: 'warehouse_name', label: '창고', hideable: true, cell: (ob) => ob.warehouse_name ?? '—', sortAccessor: (ob) => ob.warehouse_name ?? '', globalFilterText: (ob) => ob.warehouse_name ?? '' },
    { key: 'usage_category', label: '용도', hideable: true, cell: (ob) => USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category, sortAccessor: (ob) => USAGE_CATEGORY_LABEL[ob.usage_category] ?? ob.usage_category },
    { key: 'order_number', label: '수주연결', hideable: true, cell: (ob) => ob.order_number ?? '—', sortAccessor: (ob) => ob.order_number ?? '', globalFilterText: (ob) => `${ob.order_number ?? ''} ${ob.erp_outbound_no ?? ''}` },
    {
      key: 'group_trade', label: '그룹거래', hideable: true, hiddenByDefault: true,
      cell: (ob) => ob.group_trade ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="sf-pill info">그룹</span>
          <span className="text-[10px]" style={{ color: 'var(--sf-ink-3)' }}>{ob.target_company_name}</span>
        </span>
      ) : '—',
      sortAccessor: (ob) => ob.group_trade ? 1 : 0,
      globalFilterText: (ob) => ob.target_company_name ?? '',
    },
    {
      key: 'sale_invoice', label: '계산서', hideable: true,
      cell: (ob) => ob.sale ? (
        ob.sale.tax_invoice_date
          ? <span className="sf-pill pos">{formatDate(ob.sale.tax_invoice_date)}</span>
          : <span className="sf-pill warn">미발행</span>
      ) : <span className="sf-pill ghost">미등록</span>,
      sortAccessor: (ob) => ob.sale?.tax_invoice_date ?? (ob.sale ? '0' : ''),
    },
    { key: 'status', label: '상태', cell: (ob) => <OutboundStatusBadge status={ob.status} />, sortAccessor: (ob) => ob.status },
  ];
}

export const OUTBOUND_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns().map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function OutboundListTable({ items, hidden, pinning, onPinningChange, onSelect, globalFilter }: Props) {
  return (
    <MetaTable
      tableId={OUTBOUND_TABLE_ID}
      columns={buildColumns()}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      globalFilter={globalFilter}
      getRowKey={(ob) => ob.outbound_id}
      onRowClick={onSelect}
      rowClassName={(ob) => cn(
        'hover:bg-accent/50',
        ob.status === 'cancel_pending' && 'bg-orange-50',
        ob.status === 'cancelled' && 'bg-gray-50 text-muted-foreground line-through',
      )}
      emptyMessage="등록된 출고가 없습니다"
    />
  );
}

export default memo(OutboundListTable);
