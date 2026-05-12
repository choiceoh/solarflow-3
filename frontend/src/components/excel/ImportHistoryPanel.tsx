import { Clock3, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';
import type { ImportHistoryEntry, ImportHistoryStatus } from '@/lib/importHistory';

interface Props {
  items: ImportHistoryEntry[];
  onClear: () => void;
}

const STATUS_LABEL: Record<ImportHistoryStatus, string> = {
  preview: '검토',
  success: '완료',
  partial: '일부',
  failed: '실패',
};

const STATUS_CLASS: Record<ImportHistoryStatus, string> = {
  preview: 'sf-pill warn',
  success: 'sf-pill pos',
  partial: 'sf-pill warn',
  failed: 'sf-pill neg',
};

function formatHistoryDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ImportHistoryPanel({ items, onClear }: Props) {
  const recent = items.slice(0, 5);
  const reviewCount = items.filter((item) => item.status === 'preview' && (item.errorRows + item.warningRows) > 0).length;

  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-[var(--ink-3)]" />
          <div>
            <div className="text-sm font-semibold text-[var(--ink)]">업로드 이력</div>
            <div className="text-[11px] text-[var(--ink-3)]">검토 필요 {formatNumber(reviewCount)}건</div>
          </div>
        </div>
        {items.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            aria-label="업로드 이력 비우기"
            title="업로드 이력 비우기"
            onClick={onClear}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="divide-y divide-[var(--line)]">
        {recent.length === 0 ? (
          <div className="px-3 py-4 text-sm text-[var(--ink-3)]">아직 업로드 이력이 없습니다</div>
        ) : recent.map((item) => (
          <div key={item.id} className="grid gap-2 px-3 py-2 md:grid-cols-[minmax(160px,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className={STATUS_CLASS[item.status]}>{STATUS_LABEL[item.status]}</span>
                <span className="truncate text-sm font-medium text-[var(--ink)]">{item.fileName}</span>
              </div>
              <div className="mt-1 text-[11px] text-[var(--ink-3)]">
                {formatHistoryDate(item.createdAt)}
                {' · '}
                정상 {formatNumber(Math.max(0, item.validRows - item.warningRows))}
                {' · '}
                경고 {formatNumber(item.warningRows)}
                {' · '}
                에러 {formatNumber(item.errorRows)}
              </div>
            </div>
            <div className="text-right text-[11px] text-[var(--ink-3)]">
              <div>등록 {formatNumber(item.importedRows)}건</div>
              <div>전체 {formatNumber(item.totalRows)}행</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
