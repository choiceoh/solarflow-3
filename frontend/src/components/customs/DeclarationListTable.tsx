import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatDate } from '@/lib/utils';
import type { Declaration } from '@/types/customs';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const DECLARATION_TABLE_ID = 'declaration-list';

interface Props {
  items: Declaration[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
  onSelect: (d: Declaration) => void;
  onNew: () => void;
}

// D-064 PR 28: ERP 면장 자료(50컬럼) 중 분석에 유용한 17개 신규 컬럼 노출.
// 기본 노출: 원가Wp단가★ / 환율 / CIF / 공급사 / 유상수량.
// 그 외 (LC No, Invoice No, PO, INCOTERMS, 계약가, 관세, 부가세, 무상수량/비율 등) 는 hideable 기본 숨김.
const fmtNum = (v: number | undefined, digits = 0) =>
  v == null ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });
const fmtRate = (v: number | undefined) => (v == null ? '—' : `${(v * (v < 1 ? 100 : 1)).toFixed(1)}%`);

const columns: ColumnDef<Declaration>[] = [
  { key: 'declaration_number', label: '면장번호', className: 'font-medium', cell: (d) => d.declaration_number, sortAccessor: (d) => d.declaration_number },
  { key: 'bl_number', label: 'B/L번호', hideable: true, cell: (d) => d.bl_number || d.bl_id.slice(0, 8), sortAccessor: (d) => d.bl_number || d.bl_id },
  { key: 'supplier_name_kr', label: '공급사', hideable: true, cell: (d) => d.supplier_name_kr || '—', sortAccessor: (d) => d.supplier_name_kr || '' },
  { key: 'company_name', label: '법인', hideable: true, cell: (d) => d.company_name || '—', sortAccessor: (d) => d.company_name || '' },
  { key: 'declaration_date', label: '신고일', hideable: true, cell: (d) => formatDate(d.declaration_date), sortAccessor: (d) => d.declaration_date ?? '' },
  { key: 'arrival_date', label: '입항일', hideable: true, cell: (d) => d.arrival_date ? formatDate(d.arrival_date) : '—', sortAccessor: (d) => d.arrival_date ?? '' },
  { key: 'release_date', label: '반출일', hideable: true, cell: (d) => d.release_date ? formatDate(d.release_date) : '—', sortAccessor: (d) => d.release_date ?? '' },
  { key: 'hs_code', label: 'HS코드', hideable: true, cell: (d) => d.hs_code || '—', sortAccessor: (d) => d.hs_code || '' },
  { key: 'customs_office', label: '세관', hideable: true, cell: (d) => d.customs_office || '—', sortAccessor: (d) => d.customs_office || '' },
  { key: 'port', label: '항구', hideable: true, cell: (d) => d.port || '—', sortAccessor: (d) => d.port || '' },
  // ★ 핵심: 원가 Wp 단가 — 면장의 FIFO 원가 산출 결과
  { key: 'cost_unit_price_wp', label: '원가₩/Wp', hideable: true, cell: (d) => d.cost_unit_price_wp != null ? `${fmtNum(d.cost_unit_price_wp, 2)}` : '—', sortAccessor: (d) => d.cost_unit_price_wp ?? -1 },
  { key: 'exchange_rate', label: '적용환율', hideable: true, cell: (d) => d.exchange_rate != null ? fmtNum(d.exchange_rate, 2) : '—', sortAccessor: (d) => d.exchange_rate ?? -1 },
  { key: 'cif_krw', label: 'CIF (₩)', hideable: true, cell: (d) => d.cif_krw != null ? fmtNum(d.cif_krw) : '—', sortAccessor: (d) => d.cif_krw ?? -1 },
  { key: 'paid_qty', label: '유상수량', hideable: true, cell: (d) => d.paid_qty != null ? fmtNum(d.paid_qty) : '—', sortAccessor: (d) => d.paid_qty ?? -1 },
  { key: 'free_qty', label: '무상수량', hideable: true, hiddenByDefault: true, cell: (d) => d.free_qty != null ? fmtNum(d.free_qty) : '—', sortAccessor: (d) => d.free_qty ?? -1 },
  { key: 'free_ratio', label: '무상비율', hideable: true, hiddenByDefault: true, cell: (d) => fmtRate(d.free_ratio), sortAccessor: (d) => d.free_ratio ?? -1 },
  { key: 'contract_unit_price_usd_wp', label: '계약 USD/Wp', hideable: true, hiddenByDefault: true, cell: (d) => d.contract_unit_price_usd_wp != null ? fmtNum(d.contract_unit_price_usd_wp, 4) : '—', sortAccessor: (d) => d.contract_unit_price_usd_wp ?? -1 },
  { key: 'contract_total_usd', label: '계약 USD', hideable: true, hiddenByDefault: true, cell: (d) => d.contract_total_usd != null ? fmtNum(d.contract_total_usd, 2) : '—', sortAccessor: (d) => d.contract_total_usd ?? -1 },
  { key: 'incoterms', label: 'INCOTERMS', hideable: true, hiddenByDefault: true, cell: (d) => d.incoterms || '—', sortAccessor: (d) => d.incoterms || '' },
  { key: 'customs_amount', label: '관세 (₩)', hideable: true, hiddenByDefault: true, cell: (d) => d.customs_amount != null ? fmtNum(d.customs_amount) : '—', sortAccessor: (d) => d.customs_amount ?? -1 },
  { key: 'vat_amount', label: '부가세 (₩)', hideable: true, hiddenByDefault: true, cell: (d) => d.vat_amount != null ? fmtNum(d.vat_amount) : '—', sortAccessor: (d) => d.vat_amount ?? -1 },
  { key: 'lc_no', label: 'L/C No.', hideable: true, hiddenByDefault: true, cell: (d) => d.lc_no || '—', sortAccessor: (d) => d.lc_no || '' },
  { key: 'invoice_no', label: 'Invoice No.', hideable: true, hiddenByDefault: true, cell: (d) => d.invoice_no || '—', sortAccessor: (d) => d.invoice_no || '' },
  { key: 'po_number', label: '발주PO', hideable: true, hiddenByDefault: true, cell: (d) => d.po_number || '—', sortAccessor: (d) => d.po_number || '' },
  { key: 'erp_inbound_no', label: 'ERP 입고번호', hideable: true, hiddenByDefault: true, cell: (d) => d.erp_inbound_no || '—', sortAccessor: (d) => d.erp_inbound_no || '' },
  { key: 'capacity_kw', label: '용량 (kW)', hideable: true, hiddenByDefault: true, cell: (d) => d.capacity_kw != null ? fmtNum(d.capacity_kw, 2) : '—', sortAccessor: (d) => d.capacity_kw ?? -1 },
];

export const DECLARATION_COLUMN_META: ColumnVisibilityMeta[] =
  columns.map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

export default function DeclarationListTable({ items, hidden, pinning, onPinningChange, onSelect }: Props) {
  return (
    <MetaTable
      tableId={DECLARATION_TABLE_ID}
      columns={columns}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      getRowKey={(d) => d.declaration_id}
      onRowClick={onSelect}
      rowClassName={() => 'hover:bg-muted/50'}
      emptyMessage="등록된 면장이 없습니다"
    />
  );
}
