// 통합 양식 등록 결과 다이얼로그.
// 비유: 8섹션을 직렬 처리한 뒤 섹션별 성공/실패/스킵을 나열한다.

import { CheckCircle2, MinusCircle, X, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UnifiedSubmitOutcome, UnifiedSubmitResult } from '@/types/excel';

interface Props {
  result: UnifiedSubmitResult | null;
  onClose: () => void;
}

export default function UnifiedImportResultDialog({ result, onClose }: Props) {
  if (!result) return null;

  const totals = result.outcomes.reduce(
    (acc, o) => {
      if (o.status === 'success') acc.success += 1;
      else if (o.status === 'failed') acc.failed += 1;
      else acc.skipped += 1;
      acc.imported += o.result?.imported_count ?? 0;
      acc.errorRows += o.result?.error_count ?? 0;
      return acc;
    },
    { success: 0, failed: 0, skipped: 0, imported: 0, errorRows: 0 },
  );

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>통합 등록 결과</DialogTitle>
          <p className="text-xs text-muted-foreground">
            성공 {totals.success} · 실패 {totals.failed} · 건너뜀 {totals.skipped}
            {' · '}
            등록 {totals.imported}건 · 행 단위 에러 {totals.errorRows}건
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          <ul className="divide-y border rounded-md">
            {result.outcomes.map((o) => (
              <OutcomeRow key={o.type} outcome={o} />
            ))}
          </ul>
        </div>

        <DialogFooter>
          <Button size="sm" onClick={onClose}>
            <X className="mr-1.5 h-4 w-4" />닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutcomeRow({ outcome }: { outcome: UnifiedSubmitOutcome }) {
  const icon = outcome.status === 'success'
    ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--sf-pos)' }} />
    : outcome.status === 'failed'
      ? <XCircle className="h-4 w-4" style={{ color: 'var(--sf-neg)' }} />
      : <MinusCircle className="h-4 w-4 text-muted-foreground" />;

  const detail = (() => {
    if (outcome.status === 'skipped') return '시트 없음 또는 등록할 행 없음';
    if (outcome.status === 'failed') {
      return outcome.error ?? '등록 실패';
    }
    const r = outcome.result;
    if (!r) return '등록 완료';
    const parts: string[] = [`등록 ${r.imported_count}건`];
    if (r.error_count > 0) parts.push(`에러 ${r.error_count}건`);
    if (r.warning_count > 0) parts.push(`경고 ${r.warning_count}건`);
    return parts.join(' · ');
  })();

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      {icon}
      <span className="font-medium min-w-[60px]">{outcome.label}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </li>
  );
}
