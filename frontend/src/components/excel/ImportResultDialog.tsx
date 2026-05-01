// Import 결과 다이얼로그 (Step 29B)
// 비유: 일괄 등록 후 성공/에러/경고 결과를 보여주는 결과 창

import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ImportResult } from '@/types/excel';

interface Props {
  result: ImportResult | null;
  onClose: () => void;
}

export default function ImportResultDialog({ result, onClose }: Props) {
  if (!result) return null;

  const { imported_count, error_count, warning_count, errors, warnings } = result;

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>등록 결과</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-auto">
          {/* 성공 배너 */}
          {imported_count > 0 && (
            <div className="sf-banner pos">
              <CheckCircle2 className="sf-banner-icon h-4 w-4" />
              <span className="sf-banner-body">{imported_count}건 등록 완료</span>
            </div>
          )}

          {/* 에러 배너 + 표 */}
          {error_count > 0 && (
            <div className="sf-banner neg flex-col items-stretch">
              <div className="flex items-center gap-2.5">
                <XCircle className="sf-banner-icon h-4 w-4" />
                <span className="sf-banner-body font-semibold">{error_count}건 에러</span>
              </div>
              <table className="sf-mono mt-2 w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--sf-neg)]">
                    <th className="sf-eyebrow py-1 pr-2 text-left">행</th>
                    <th className="sf-eyebrow py-1 pr-2 text-left">필드</th>
                    <th className="sf-eyebrow py-1 text-left">메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgb(184 51 31 / 0.18)' }}>
                      <td className="py-1 pr-2 tabular-nums">{e.row}</td>
                      <td className="py-1 pr-2">{e.field}</td>
                      <td className="py-1">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 경고 배너 + 표 */}
          {warning_count > 0 && (
            <div className="sf-banner warn flex-col items-stretch">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="sf-banner-icon h-4 w-4" />
                <span className="sf-banner-body font-semibold">{warning_count}건 경고</span>
              </div>
              <table className="sf-mono mt-2 w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--sf-warn)]">
                    <th className="sf-eyebrow py-1 pr-2 text-left">행</th>
                    <th className="sf-eyebrow py-1 pr-2 text-left">필드</th>
                    <th className="sf-eyebrow py-1 text-left">메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {warnings.map((w, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgb(168 101 24 / 0.18)' }}>
                      <td className="py-1 pr-2 tabular-nums">{w.row}</td>
                      <td className="py-1 pr-2">{w.field}</td>
                      <td className="py-1">{w.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 요약 */}
          <p className="sf-mono text-center text-[11px] text-[var(--sf-ink-3)]">
            <span className="tabular-nums text-[var(--sf-pos)]">{imported_count}</span>건 등록 ·{' '}
            <span className="tabular-nums text-[var(--sf-neg)]">{error_count}</span>건 에러 ·{' '}
            <span className="tabular-nums text-[var(--sf-warn)]">{warning_count}</span>건 경고
          </p>
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
