import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { cn, formatDate, formatUSD, formatNumber } from '@/lib/utils';
import EmptyState from '@/components/common/EmptyState';
import { TT_STATUS_LABEL, TT_STATUS_COLOR, type TTRemittance } from '@/types/procurement';

interface Props {
  items: TTRemittance[];
  onEdit: (tt: TTRemittance) => void;
  onNew: () => void;
  onDelete?: (ttId: string) => Promise<void>;
}

export default function TTListTable({ items, onEdit, onNew, onDelete }: Props) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  if (items.length === 0) return <EmptyState message="등록된 TT가 없습니다" actionLabel="새로 등록" onAction={onNew} />;

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="p-3 text-left font-medium text-muted-foreground">PO번호</th>
            <th className="p-3 text-left font-medium text-muted-foreground">제조사</th>
            <th className="p-3 text-left font-medium text-muted-foreground">송금일</th>
            <th className="p-3 text-right font-medium">금액(USD)</th>
            <th className="p-3 text-right font-medium text-muted-foreground">원화(KRW)</th>
            <th className="p-3 text-right font-medium text-muted-foreground">환율</th>
            <th className="p-3 text-left font-medium text-muted-foreground">목적</th>
            <th className="p-3 text-center font-medium text-muted-foreground">상태</th>
            <th className="p-3 text-left font-medium text-muted-foreground">은행</th>
            <th className="p-3 w-20" />
          </tr>
        </thead>
        <tbody>
          {items.map((tt) => (
            <>
              <tr
                key={tt.tt_id}
                className="border-t hover:bg-muted/20 transition-colors cursor-pointer group"
                onClick={() => onEdit(tt)}
                title="클릭하여 수정"
              >
                <td className="p-3 font-mono font-medium">{tt.po_number || '—'}</td>
                <td className="p-3 text-muted-foreground">{tt.manufacturer_name ?? '—'}</td>
                <td className="p-3">{formatDate(tt.remit_date ?? '')}</td>
                <td className="p-3 text-right font-mono font-semibold tabular-nums">{formatUSD(tt.amount_usd)}</td>
                <td className="p-3 text-right tabular-nums text-muted-foreground">
                  {tt.amount_krw != null ? `${formatNumber(Math.round(tt.amount_krw))}원` : '—'}
                </td>
                <td className="p-3 text-right tabular-nums text-muted-foreground">
                  {tt.exchange_rate != null ? tt.exchange_rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                </td>
                <td className="p-3">{tt.purpose ?? '—'}</td>
                <td className="p-3 text-center">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TT_STATUS_COLOR[tt.status])}>
                    {TT_STATUS_LABEL[tt.status]}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">{tt.bank_name ?? '—'}</td>
                <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
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
                </td>
              </tr>
              {deleteError[tt.tt_id] && (
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
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
