import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { formatDate } from '@/lib/utils';
import type { Declaration } from '@/types/customs';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';

export const DECLARATION_TABLE_ID = 'declaration-list';

interface Props {
  items: Declaration[];
  hidden: Set<string>;
  onSelect: (d: Declaration) => void;
  onNew: () => void;
}

const columns: ColumnDef<Declaration>[] = [
  { key: 'declaration_number', label: '면장번호', className: 'font-medium', cell: (d) => d.declaration_number },
  { key: 'bl_number', label: 'B/L번호', hideable: true, cell: (d) => d.bl_number || d.bl_id.slice(0, 8) },
  { key: 'company_name', label: '법인', hideable: true, cell: (d) => d.company_name || '—' },
  { key: 'declaration_date', label: '신고일', hideable: true, cell: (d) => formatDate(d.declaration_date) },
  { key: 'arrival_date', label: '입항일', hideable: true, cell: (d) => d.arrival_date ? formatDate(d.arrival_date) : '—' },
  { key: 'release_date', label: '반출일', hideable: true, cell: (d) => d.release_date ? formatDate(d.release_date) : '—' },
  { key: 'hs_code', label: 'HS코드', hideable: true, cell: (d) => d.hs_code || '—' },
  { key: 'customs_office', label: '세관', hideable: true, cell: (d) => d.customs_office || '—' },
  { key: 'port', label: '항구', hideable: true, cell: (d) => d.port || '—' },
];

export const DECLARATION_COLUMN_META: ColumnVisibilityMeta[] =
  columns.map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

export default function DeclarationListTable({ items, hidden, onSelect }: Props) {
  return (
    <MetaTable
      columns={columns}
      hidden={hidden}
      items={items}
      getRowKey={(d) => d.declaration_id}
      onRowClick={onSelect}
      rowClassName={() => 'hover:bg-muted/50'}
      emptyMessage="등록된 면장이 없습니다"
    />
  );
}
