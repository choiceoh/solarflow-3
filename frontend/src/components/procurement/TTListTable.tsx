import { memo } from 'react';
import { formatDate, formatUSD, formatNumber, shortMfgName } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import GroupedMiniTable, { type GroupedMiniTableColumn } from '@/components/common/GroupedMiniTable';
import StatusPill from '@/components/common/StatusPill';
import { TT_STATUS_LABEL, TT_STATUS_COLOR, type TTRemittance } from '@/types/procurement';

interface Props {
  items: TTRemittance[];
}

function TTListTable({ items }: Props) {
  if (items.length === 0) return <EmptyState message="등록된 TT가 없습니다" />;

  const columns: GroupedMiniTableColumn<TTRemittance>[] = [
    {
      key: 'remit_date',
      label: '송금일',
      headerClassName: 'p-3',
      className: 'p-3',
      render: (tt) => formatDate(tt.remit_date ?? ''),
    },
    {
      key: 'bank',
      label: '은행',
      headerClassName: 'p-3',
      className: 'p-3 text-muted-foreground',
      render: (tt) => tt.bank_name ?? '—',
    },
    {
      key: 'po_number',
      label: 'PO번호',
      headerClassName: 'p-3',
      className: 'p-3 font-mono font-medium',
      render: (tt) => tt.po_number || '—',
    },
    {
      key: 'manufacturer',
      label: '제조사',
      headerClassName: 'p-3',
      className: 'p-3 text-muted-foreground',
      render: (tt) => shortMfgName(tt.manufacturer_name),
    },
    {
      key: 'amount_usd',
      label: '금액(USD)',
      align: 'right',
      headerClassName: 'p-3 text-foreground',
      className: 'p-3 font-mono font-semibold tabular-nums',
      render: (tt) => formatUSD(tt.amount_usd),
    },
    {
      key: 'amount_krw',
      label: '원화(KRW)',
      align: 'right',
      headerClassName: 'p-3',
      className: 'p-3 tabular-nums text-muted-foreground',
      render: (tt) => tt.amount_krw != null ? `${formatNumber(Math.round(tt.amount_krw))}원` : '—',
    },
    {
      key: 'exchange_rate',
      label: '환율',
      align: 'right',
      headerClassName: 'p-3',
      className: 'p-3 tabular-nums text-muted-foreground',
      render: (tt) => tt.exchange_rate != null
        ? tt.exchange_rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—',
    },
    {
      key: 'purpose',
      label: '목적',
      headerClassName: 'p-3',
      className: 'p-3',
      render: (tt) => tt.purpose ?? '—',
    },
    {
      key: 'status',
      label: '상태',
      align: 'center',
      headerClassName: 'p-3',
      className: 'p-3',
      render: (tt) => <StatusPill label={TT_STATUS_LABEL[tt.status]} colorClassName={TT_STATUS_COLOR[tt.status]} className="px-2" />,
    },
  ];

  return (
    <GroupedMiniTable
      columns={columns}
      data={items}
      getRowKey={(tt) => tt.tt_id}
      emptyMessage="등록된 TT가 없습니다"
      minWidthClassName="min-w-[1000px]"
      tableClassName="text-xs"
      rowClassName="hover:bg-muted/20 transition-colors group"
    />
  );
}

export default memo(TTListTable);
