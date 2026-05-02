import { memo } from 'react';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatDate, formatNumber, cn } from '@/lib/utils';
import type { SaleListItem } from '@/types/outbound';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

export const SALE_TABLE_ID = 'sale-list';

interface Props {
  items: SaleListItem[];
  hidden: Set<string>;
  onInvoice?: (item: SaleListItem) => void;
}

function buildColumns({ onInvoice }: { onInvoice?: (item: SaleListItem) => void }): ColumnDef<SaleListItem>[] {
  return [
    { key: 'date', label: '기준일', cell: (item) => formatDate(item.outbound_date ?? item.order_date ?? '') },
    {
      key: 'kind', label: '구분', hideable: true,
      cell: (item) => (
        <span className={item.outbound_id ? 'sf-pill pos' : 'sf-pill info'}>
          {item.outbound_id ? '출고' : '수주'}
        </span>
      ),
    },
    { key: 'customer_name', label: '거래처', hideable: true, cell: (item) => item.sale.customer_name ?? '—' },
    { key: 'product_name', label: '품명', hideable: true, cell: (item) => item.product_name ?? '—' },
    { key: 'spec_wp', label: '규격', hideable: true, cell: (item) => item.spec_wp ? `${item.spec_wp}` : '—' },
    { key: 'quantity', label: '수량', hideable: true, align: 'right', className: 'tabular-nums', cell: (item) => formatNumber(item.quantity) },
    { key: 'unit_price_wp', label: 'Wp단가', hideable: true, align: 'right', className: 'tabular-nums', cell: (item) => formatNumber(item.sale.unit_price_wp) },
    { key: 'supply_amount', label: '공급가', hideable: true, align: 'right', className: 'tabular-nums', cell: (item) => item.sale.supply_amount ? formatNumber(item.sale.supply_amount) : '—' },
    { key: 'vat_amount', label: '부가세', hideable: true, align: 'right', className: 'tabular-nums', cell: (item) => item.sale.vat_amount ? formatNumber(item.sale.vat_amount) : '—' },
    {
      key: 'total_amount', label: '합계', hideable: true, align: 'right', className: 'tabular-nums font-semibold',
      cell: (item) => (
        <span style={{ color: 'var(--sf-ink)' }}>
          {item.sale.total_amount ? formatNumber(item.sale.total_amount) : '—'}
        </span>
      ),
    },
    {
      key: 'tax_invoice_date', label: '계산서일', hideable: true,
      cell: (item) => item.sale.tax_invoice_date ? (
        <button
          type="button"
          onClick={() => onInvoice?.(item)}
          disabled={!onInvoice}
          className={cn('sf-pill pos', onInvoice && 'cursor-pointer', !onInvoice && 'cursor-default')}
          title="계산서 수정"
        >
          {formatDate(item.sale.tax_invoice_date)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onInvoice?.(item)}
          disabled={!onInvoice}
          className={cn('sf-pill warn', onInvoice && 'cursor-pointer', !onInvoice && 'cursor-default')}
          title="계산서 발행"
        >
          미발행
        </button>
      ),
    },
    {
      key: 'erp_closed', label: 'ERP마감', hideable: true,
      cell: (item) => (
        <span className={item.sale.erp_closed ? 'sf-pill pos' : 'sf-pill ghost'}>
          {item.sale.erp_closed ? '마감' : '미마감'}
        </span>
      ),
    },
  ];
}

export const SALE_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({}).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function SaleListTable({ items, hidden, onInvoice }: Props) {
  return (
    <MetaTable
      columns={buildColumns({ onInvoice })}
      hidden={hidden}
      items={items}
      getRowKey={(item) => item.sale_id}
      emptyMessage="매출 데이터가 없습니다"
    />
  );
}

export default memo(SaleListTable);
