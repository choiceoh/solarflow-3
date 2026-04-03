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

        <div className="space-y-3 flex-1 overflow-auto">
          {/* 성공 배너 */}
          {imported_count > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {imported_count}건 등록 완료
            </div>
          )}

          {/* 에러 배너 */}
          {error_count > 0 && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-red-800 mb-2">
                <XCircle className="h-4 w-4 shrink-0" />
                {error_count}건 에러
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-red-200">
                    <th className="text-left py-1 pr-2 font-medium">행</th>
                    <th className="text-left py-1 pr-2 font-medium">필드</th>
                    <th className="text-left py-1 font-medium">메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {errors.map((e, i) => (
                    <tr key={i} className="border-b border-red-100 last:border-0">
                      <td className="py-1 pr-2 text-red-700">{e.row}</td>
                      <td className="py-1 pr-2 text-red-700">{e.field}</td>
                      <td className="py-1 text-red-600">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 경고 배너 */}
          {warning_count > 0 && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2">
              <div className="flex items-center gap-2 text-sm text-yellow-800 mb-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {warning_count}건 경고
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-yellow-200">
                    <th className="text-left py-1 pr-2 font-medium">행</th>
                    <th className="text-left py-1 pr-2 font-medium">필드</th>
                    <th className="text-left py-1 font-medium">메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {warnings.map((w, i) => (
                    <tr key={i} className="border-b border-yellow-100 last:border-0">
                      <td className="py-1 pr-2 text-yellow-700">{w.row}</td>
                      <td className="py-1 pr-2 text-yellow-700">{w.field}</td>
                      <td className="py-1 text-yellow-600">{w.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 요약 */}
          <p className="text-xs text-muted-foreground text-center">
            {imported_count}건 등록, {error_count}건 에러, {warning_count}건 경고
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
