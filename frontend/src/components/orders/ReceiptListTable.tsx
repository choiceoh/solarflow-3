import { memo } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import MetaTable, { type ColumnDef } from '@/components/common/MetaTable';
import { Button } from '@/components/ui/button';
import { formatDate, formatNumber } from '@/lib/utils';
import type { Receipt } from '@/types/orders';
import type { ColumnVisibilityMeta } from '@/lib/columnVisibility';
import type { ColumnPinningState } from '@/lib/columnPinning';

export const RECEIPT_TABLE_ID = 'receipt-list';

interface Props {
  items: Receipt[];
  hidden: Set<string>;
  pinning?: ColumnPinningState;
  onPinningChange?: (next: ColumnPinningState) => void;
  onStartMatch?: (receipt: Receipt) => void;
}

type MatchStatus = 'full' | 'partial' | 'none';

function getMatchStatus(r: Receipt): MatchStatus {
  const matched = r.matched_total ?? 0;
  if (matched >= r.amount) return 'full';
  if (matched > 0) return 'partial';
  return 'none';
}

function MatchBadge({ receipt }: { receipt: Receipt }) {
  const status = getMatchStatus(receipt);
  const matched = receipt.matched_total ?? 0;
  if (status === 'full') return <span className="sf-pill pos">매칭완료</span>;
  if (status === 'partial') {
    return (
      <span className="sf-pill warn">
        부분매칭 {formatNumber(matched)}/{formatNumber(receipt.amount)}
      </span>
    );
  }
  return <span className="sf-pill ghost">미매칭</span>;
}

function buildColumns(onStartMatch?: (receipt: Receipt) => void): ColumnDef<Receipt>[] {
  const columns: ColumnDef<Receipt>[] = [
    { key: 'receipt_date', label: '입금일', cell: (r) => formatDate(r.receipt_date), sortAccessor: (r) => r.receipt_date ?? '' },
    { key: 'customer_name', label: '거래처', hideable: true, cell: (r) => r.customer_name ?? '—', sortAccessor: (r) => r.customer_name ?? '' },
    {
      key: 'amount', label: '입금액', hideable: true, align: 'right', className: 'tabular-nums font-semibold',
      cell: (r) => <span style={{ color: 'var(--sf-ink)' }}>{formatNumber(r.amount)}원</span>,
      sortAccessor: (r) => r.amount,
    },
    { key: 'bank_account', label: '입금계좌', hideable: true, cell: (r) => r.bank_account ?? '—', sortAccessor: (r) => r.bank_account ?? '' },
    { key: 'match_status', label: '매칭상태', hideable: true, cell: (r) => <MatchBadge receipt={r} />, sortAccessor: (r) => getMatchStatus(r) },
    { key: 'memo', label: '메모', hideable: true, className: 'max-w-[200px] truncate', cell: (r) => r.memo ?? '—', sortAccessor: (r) => r.memo ?? '' },
  ];
  if (onStartMatch) {
    columns.push({
      key: 'match_action',
      label: '매칭',
      align: 'right',
      cell: (r) => {
        const disabled = getMatchStatus(r) === 'full';
        return (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onStartMatch(r)}
          >
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            매칭
          </Button>
        );
      },
      sortAccessor: (r) => getMatchStatus(r),
    });
  }
  return columns;
}

export const RECEIPT_COLUMN_META: ColumnVisibilityMeta[] =
  buildColumns().map(({ key, label, hideable, hiddenByDefault }) => ({ key, label, hideable, hiddenByDefault }));

function ReceiptListTable({ items, hidden, pinning, onPinningChange, onStartMatch }: Props) {
  return (
    <MetaTable
      tableId={RECEIPT_TABLE_ID}
      columns={buildColumns(onStartMatch)}
      hidden={hidden}
      pinning={pinning}
      onPinningChange={onPinningChange}
      items={items}
      getRowKey={(r) => r.receipt_id}
      emptyMessage="등록된 수금이 없습니다"
      pageSize={50}
    />
  );
}

export default memo(ReceiptListTable);
