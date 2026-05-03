import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatCapacity, formatNumber } from '@/lib/utils';
import type { BLLineItem } from '@/types/inbound';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const BL_LINE_TABLE_ID = 'bl-line';

interface Props {
  items: BLLineItem[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
  currency: 'USD' | 'KRW';
  manufacturerName?: string;
}

function pCode(l: BLLineItem) { return l.product_code ?? l.products?.product_code ?? '—'; }
function pName(l: BLLineItem) { return l.product_name ?? l.products?.product_name ?? '—'; }
function pSpec(l: BLLineItem) { return l.products?.spec_wp; }

interface BuildOpts {
  currency: 'USD' | 'KRW';
  manufacturerName?: string;
}

function buildColumns({ currency, manufacturerName }: BuildOpts): ColumnDef<BLLineItem>[] {
  return [
    {
      key: 'manufacturer_spec', label: '제조사/규격', hideable: true,
      cell: (line) => manufacturerName && pSpec(line) != null
        ? `${manufacturerName} ${pSpec(line)}W`
        : manufacturerName ?? (pSpec(line) != null ? `${pSpec(line)}W` : '—'),
      sortAccessor: (line) => pSpec(line) ?? 0,
    },
    { key: 'product_code', label: '품번', hideable: true, className: 'font-mono', cell: (l) => pCode(l), sortAccessor: (l) => pCode(l) },
    { key: 'product_name', label: '품명', hideable: true, cell: (l) => pName(l), sortAccessor: (l) => pName(l) },
    { key: 'quantity', label: '수량', align: 'right', className: 'tabular-nums', cell: (l) => formatNumber(l.quantity), sortAccessor: (l) => l.quantity },
    { key: 'capacity_kw', label: '용량(kW)', hideable: true, align: 'right', className: 'tabular-nums', cell: (l) => formatCapacity(l.capacity_kw, l.quantity), sortAccessor: (l) => l.capacity_kw ?? 0 },
    { key: 'capacity_mw', label: '용량(MW)', hideable: true, align: 'right', className: 'tabular-nums', cell: (l) => l.capacity_kw != null ? (l.capacity_kw / 1000).toFixed(3) : '—', sortAccessor: (l) => l.capacity_kw ?? 0 },
    {
      key: 'item_type', label: '구분', hideable: true,
      cell: (l) => (
        <span className={l.item_type === 'main' ? 'sf-pill ghost' : 'sf-pill solar'}>
          {l.item_type === 'main' ? '본품' : '스페어'}
        </span>
      ),
      sortAccessor: (l) => l.item_type ?? '',
    },
    {
      key: 'payment_type', label: '유/무상', hideable: true,
      cell: (l) => (
        <span className={l.payment_type === 'paid' ? 'sf-pill ghost' : 'sf-pill pos'}>
          {l.payment_type === 'paid' ? '유상' : '무상'}
        </span>
      ),
      sortAccessor: (l) => l.payment_type ?? '',
    },
    {
      key: 'unit_price', label: currency === 'USD' ? '단가(USD/Wp)' : '단가(KRW/Wp)', hideable: true, align: 'right', className: 'tabular-nums',
      cell: (l) => currency === 'USD'
        ? (l.unit_price_usd_wp != null ? `$${l.unit_price_usd_wp.toFixed(4)}` : '—')
        : (l.unit_price_krw_wp != null ? `${formatNumber(l.unit_price_krw_wp)}원` : '—'),
      sortAccessor: (l) => (currency === 'USD' ? l.unit_price_usd_wp : l.unit_price_krw_wp) ?? 0,
    },
  ];
}

export const BL_LINE_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns({ currency: 'USD' }).map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

export default function BLLineTable({ items, hidden, pinning, onPinningChange, currency, manufacturerName }: Props) {
  return (
    <MetaTable
      tableId={BL_LINE_TABLE_ID}
      columns={buildColumns({ currency, manufacturerName })}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      getRowKey={(l) => l.bl_line_id}
      emptyMessage="입고품목이 없습니다"
    />
  );
}
