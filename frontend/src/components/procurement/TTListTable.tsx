import { useState, memo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { formatDate, formatUSD, formatNumber, shortMfgName } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import GroupedMiniTable, { type GroupedMiniTableColumn } from '@/components/common/GroupedMiniTable';
import StatusPill from '@/components/common/StatusPill';
import { TT_STATUS_LABEL, TT_STATUS_COLOR, type TTRemittance } from '@/types/procurement';

interface Props {
  items: TTRemittance[];
  onEdit: (tt: TTRemittance) => void;
  onNew: () => void;
  onDelete?: (ttId: string) => Promise<void>;
}

function TTListTable({ items, onEdit, onNew, onDelete }: Props) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  if (items.length === 0) return <EmptyState message="등록된 TT가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

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
    {
      key: 'actions',
      label: '',
      align: 'center',
      headerClassName: 'p-3 w-20',
      className: 'p-3',
      render: (tt) => (
        <div onClick={(e) => e.stopPropagation()}>
          {pendingDeleteId === tt.tt_id ? (
            <div className="flex items-center gap-1 justify-center">
              <button
                className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-muted-foreground hover:bg-muted transition-colors"
                onClick={() => { setPendingDeleteId(null); setDeleteError({}); }}
              >취소</button>
              <button
                disabled={deletingId === tt.tt_id}
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                onClick={async () => {
                  if (!onDelete) return;
                  setDeletingId(tt.tt_id);
                  setDeleteError({});
                  try {
                    await onDelete(tt.tt_id);
                    setPendingDeleteId(null);
                  } catch (err) {
                    setDeleteError({ [tt.tt_id]: err instanceof Error ? err.message : '삭제 실패' });
                    setDeletingId(null);
                  }
                }}
              >{deletingId === tt.tt_id ? '…' : '삭제'}</button>
            </div>
          ) : (
            <div className="flex items-center gap-0.5 justify-center">
              <button
                className="p-1 rounded hover:bg-muted text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
                title="수정" onClick={() => onEdit(tt)}
              >
                <Pencil className="h-3 w-3" />
              </button>
              {onDelete && (
                <button
                  className="p-1 rounded hover:bg-muted text-muted-foreground/40 group-hover:text-red-400 hover:text-red-500 transition-colors"
                  title="삭제"
                  onClick={() => { setPendingDeleteId(tt.tt_id); setDeleteError({}); }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </div>
      ),
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
      onRowClick={(tt) => onEdit(tt)}
      rowTitle="클릭하여 수정"
      renderAfterRow={(tt) => deleteError[tt.tt_id] ? (
        <tr key={`${tt.tt_id}-err`} className="bg-red-50 border-t border-red-200">
          <td colSpan={10} className="px-4 py-2">
            <div className="flex items-center gap-2">
              <span className="text-red-500 shrink-0">⚠</span>
              <span className="text-xs text-red-700 flex-1">{deleteError[tt.tt_id]}</span>
              <button
                className="text-[10px] text-red-400 hover:text-red-600"
                onClick={() => setDeleteError(prev => { const n = { ...prev }; delete n[tt.tt_id]; return n; })}
              >✕</button>
            </div>
          </td>
        </tr>
      ) : null}
    />
  );
}

export default memo(TTListTable);
