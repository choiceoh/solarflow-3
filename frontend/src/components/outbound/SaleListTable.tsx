import { memo } from 'react';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatDate, formatNumber, cn } from '@/lib/utils';
import type { SaleListItem } from '@/types/outbound';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const SALE_TABLE_ID = 'sale-list';

interface Props {
  items: SaleListItem[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
  onInvoice?: (item: SaleListItem) => void;
  globalFilter?: string;
  // 다중 선택 — 미발행 매출만 선택 가능하도록 selectableRow가 false면 체크박스 비활성
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  isRowSelectable?: (item: SaleListItem) => boolean;
}

function buildColumns({
  onInvoice,
  selectedIds,
  onSelectedIdsChange,
  isRowSelectable,
  visibleItems,
}: {
  onInvoice?: (item: SaleListItem) => void;
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (next: Set<string>) => void;
  isRowSelectable?: (item: SaleListItem) => boolean;
  visibleItems?: SaleListItem[];
}): ColumnDef<SaleListItem>[] {
  const selectionEnabled = !!onSelectedIdsChange;
  const selectableVisible = selectionEnabled && visibleItems
    ? visibleItems.filter((item) => !isRowSelectable || isRowSelectable(item))
    : [];
  const allChecked = selectableVisible.length > 0 && selectableVisible.every((item) => selectedIds?.has(item.sale_id));
  const someChecked = !allChecked && selectableVisible.some((item) => selectedIds?.has(item.sale_id));
  const cols: ColumnDef<SaleListItem>[] = [];
  if (selectionEnabled) {
    cols.push({
      key: '_select',
      label: '',
      minWidth: 32,
      maxWidth: 32,
      headerCell: () => (
        <input
          type="checkbox"
          aria-label="전체 선택"
          checked={allChecked}
          ref={(el) => { if (el) el.indeterminate = someChecked; }}
          onChange={(e) => {
            if (!onSelectedIdsChange) return;
            const next = new Set(selectedIds ?? []);
            if (e.target.checked) {
              for (const item of selectableVisible) next.add(item.sale_id);
            } else {
              for (const item of selectableVisible) next.delete(item.sale_id);
            }
            onSelectedIdsChange(next);
          }}
          className="size-3.5 cursor-pointer"
        />
      ),
      cell: (item) => {
        const selectable = !isRowSelectable || isRowSelectable(item);
        if (!selectable) return null;
        const checked = selectedIds?.has(item.sale_id) ?? false;
        return (
          <input
            type="checkbox"
            aria-label={`${item.sale_id} 선택`}
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (!onSelectedIdsChange) return;
              const next = new Set(selectedIds ?? []);
              if (e.target.checked) next.add(item.sale_id); else next.delete(item.sale_id);
              onSelectedIdsChange(next);
            }}
            className="size-3.5 cursor-pointer"
          />
        );
      },
    });
  }
  cols.push(
    { key: 'date', label: '기준일', cell: (item) => formatDate(item.outbound_date ?? item.order_date ?? ''), sortAccessor: (item) => item.outbound_date ?? item.order_date ?? '' },
    { key: 'customer_name', label: '거래처', hideable: true, cell: (item) => item.sale.customer_name ?? '—', sortAccessor: (item) => item.sale.customer_name ?? '', globalFilterText: (item) => item.sale.customer_name ?? '' },
    {
      key: 'kind', label: '구분', hideable: true,
      cell: (item) => (
        <span className={item.outbound_id ? 'sf-pill pos' : 'sf-pill info'}>
          {item.outbound_id ? '출고' : '수주'}
        </span>
      ),
      sortAccessor: (item) => item.outbound_id ? 1 : 0,
    },
    { key: 'manufacturer_name', label: '제조사', hideable: true, cell: (item) => item.manufacturer_name ?? '—', sortAccessor: (item) => item.manufacturer_name ?? '', globalFilterText: (item) => item.manufacturer_name ?? '' },
    { key: 'product_name', label: '품명', hideable: true, cell: (item) => item.product_name ?? '—', sortAccessor: (item) => item.product_name ?? '', globalFilterText: (item) => item.product_name ?? '' },
    { key: 'spec_wp', label: '규격', hideable: true, cell: (item) => item.spec_wp ? `${item.spec_wp}` : '—', sortAccessor: (item) => item.spec_wp ?? 0 },
    { key: 'quantity', label: '수량', hideable: true, align: 'right', className: 'tabular-nums', cell: (item) => formatNumber(item.quantity), sortAccessor: (item) => item.quantity },
    {
      key: 'unit_price_ea', label: '단가(장)', hideable: true, align: 'right', className: 'tabular-nums',
      cell: (item) => {
        const ea = item.sale.unit_price_ea ?? (item.sale.unit_price_wp != null && item.spec_wp ? item.sale.unit_price_wp * item.spec_wp : null);
        return ea != null ? formatNumber(ea) : '—';
      },
      sortAccessor: (item) => item.sale.unit_price_ea ?? (item.sale.unit_price_wp != null && item.spec_wp ? item.sale.unit_price_wp * item.spec_wp : 0),
    },
    { key: 'unit_price_wp', label: 'Wp단가', hideable: true, hiddenByDefault: true, align: 'right', className: 'tabular-nums', cell: (item) => item.sale.unit_price_wp != null ? item.sale.unit_price_wp.toFixed(1) : '—', sortAccessor: (item) => item.sale.unit_price_wp ?? 0 },
    { key: 'supply_amount', label: '공급가', hideable: true, align: 'right', className: 'tabular-nums', cell: (item) => item.sale.supply_amount ? formatNumber(item.sale.supply_amount) : '—', sortAccessor: (item) => item.sale.supply_amount ?? 0 },
    { key: 'vat_amount', label: '부가세', hideable: true, align: 'right', className: 'tabular-nums', cell: (item) => item.sale.vat_amount ? formatNumber(item.sale.vat_amount) : '—', sortAccessor: (item) => item.sale.vat_amount ?? 0 },
    {
      key: 'total_amount', label: '합계', hideable: true, align: 'right', className: 'tabular-nums font-semibold',
      cell: (item) => (
        <span style={{ color: 'var(--sf-ink)' }}>
          {item.sale.total_amount ? formatNumber(item.sale.total_amount) : '—'}
        </span>
      ),
      sortAccessor: (item) => item.sale.total_amount ?? 0,
    },
    {
      key: 'tax_invoice_date', label: '계산서일', hideable: true,
      sortAccessor: (item) => item.sale.tax_invoice_date ?? '',
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
      sortAccessor: (item) => item.sale.erp_closed ? 1 : 0,
    },
  );
  return cols;
}

export const SALE_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({}).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function SaleListTable({ items, hidden, pinning, onPinningChange, onInvoice, globalFilter, selectedIds, onSelectedIdsChange, isRowSelectable }: Props) {
  return (
    <MetaTable
      tableId={SALE_TABLE_ID}
      columns={buildColumns({ onInvoice, selectedIds, onSelectedIdsChange, isRowSelectable, visibleItems: items })}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      globalFilter={globalFilter}
      getRowKey={(item) => item.sale_id}
      emptyMessage="매출 데이터가 없습니다"
    />
  );
}

export default memo(SaleListTable);
