// 통합 양식 등록 결과 다이얼로그.
// 비유: 모든 섹션을 직렬 처리한 뒤 섹션별 성공/실패/스킵을 나열한다.

import { ArrowRight, CheckCircle2, FileSpreadsheet, MinusCircle, ReceiptText, ScrollText, Truck, Wallet, X, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { TemplateType, UnifiedSubmitOutcome, UnifiedSubmitResult } from '@/types/excel';

interface Props {
  result: UnifiedSubmitResult | null;
  onClose: () => void;
}

export default function UnifiedImportResultDialog({ result, onClose }: Props) {
  const navigate = useNavigate();
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
  const successfulTypes = new Set(
    result.outcomes
      .filter((outcome) => outcome.status === 'success' && (outcome.result?.imported_count ?? 0) > 0)
      .map((outcome) => outcome.type),
  );
  const nextActions = buildNextActions(successfulTypes);

  const goNext = (path: string) => {
    onClose();
    navigate(path);
  };

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

          {nextActions.length > 0 ? (
            <section className="mt-3 rounded-md border bg-muted/20 p-3">
              <div className="text-sm font-semibold">다음에 처리할 일</div>
              <div className="mt-1 text-xs text-muted-foreground">
                등록된 데이터 기준으로 바로 이어서 점검할 화면입니다.
              </div>
              <div className="mt-3 grid gap-2">
                {nextActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.path}
                      type="button"
                      onClick={() => goNext(action.path)}
                      className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-primary/5"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-foreground">{action.label}</span>
                        <span className="block truncate text-muted-foreground">{action.sub}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}
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

function buildNextActions(types: Set<TemplateType>) {
  const actions: Array<{
    label: string;
    sub: string;
    path: string;
    icon: typeof Truck;
  }> = [];

  if (types.has('outbound')) {
    actions.push({
      label: '매출 미등록 확인',
      sub: '출고 후 아직 매출 전표가 없는 행을 처리합니다.',
      path: '/orders?tab=outbound&queue=sale_unregistered',
      icon: Truck,
    });
  }
  if (types.has('sale')) {
    actions.push({
      label: '계산서 미발행 처리',
      sub: '매출 등록 후 계산서일이 비어 있는 행을 확인합니다.',
      path: '/orders?tab=sales&invoice=pending',
      icon: ReceiptText,
    });
    actions.push({
      label: '수금 미완료 확인',
      sub: '미수 또는 부분 수금 상태인 매출을 모아 봅니다.',
      path: '/orders?tab=sales&receipt=open',
      icon: Wallet,
    });
  }
  if (types.has('receipt')) {
    actions.push({
      label: '수금매칭 열기',
      sub: '입금 등록 후 미수금과 매칭할 항목을 확인합니다.',
      path: '/orders?tab=matching',
      icon: Wallet,
    });
  }
  if (types.has('purchase_order') || types.has('lc') || types.has('tt')) {
    actions.push({
      label: '구매 계약 확인',
      sub: 'PO, L/C, T/T 연결 상태를 한 화면에서 점검합니다.',
      path: '/procurement',
      icon: ScrollText,
    });
  }
  if (types.has('inbound')) {
    actions.push({
      label: 'B/L 입고 확인',
      sub: '입고 상태와 ERP 등록 대기 건을 확인합니다.',
      path: '/procurement?tab=bl',
      icon: FileSpreadsheet,
    });
  }
  if (types.has('declaration') || types.has('expense')) {
    actions.push({
      label: '면장/원가 확인',
      sub: '면장 원가와 부대비용 연결 상태를 점검합니다.',
      path: '/customs',
      icon: FileSpreadsheet,
    });
  }

  return actions.slice(0, 5);
}

function OutcomeRow({ outcome }: { outcome: UnifiedSubmitOutcome }) {
  const icon = outcome.status === 'success'
    ? <CheckCircle2 className="sf-text-pos h-4 w-4" />
    : outcome.status === 'failed'
      ? <XCircle className="sf-text-neg h-4 w-4" />
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
