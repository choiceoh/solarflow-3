// 외부 양식 변환 카드 — '엑셀 입력' 페이지의 "외부 양식 변환" 탭에서 사용.
// 흐름: 파일 드롭/선택 → 변환 다이얼로그(미리보기·경고) → "검증으로 진행" → 표준 검증 파이프라인.

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useExcel } from '@/hooks/useExcel';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { TEMPLATE_LABEL } from '@/types/excel';
import type { ExternalFormat } from '@/lib/externalFormats/registry';
import type { ConvertResult } from '@/lib/externalFormats/topsolarOutbound';
import ImportPreviewDialog from './ImportPreviewDialog';
import ImportResultDialog from './ImportResultDialog';

interface Props {
  format: ExternalFormat;
  onImportComplete?: () => void;
}

interface ConvertedState {
  fileName: string;
  result: ConvertResult;
}

export default function ExternalFormatCard({ format, onImportComplete }: Props) {
  const excel = useExcel(format.targetType);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState<ConvertedState | null>(null);

  const disabled = !excel.masterData || excel.loading || converting;
  const targetLabel = TEMPLATE_LABEL[format.targetType];

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      notify.error('엑셀 파일(.xlsx, .xls)만 변환할 수 있습니다');
      return;
    }
    setConverting(true);
    try {
      const result = await format.convert(file);
      setConverted({ fileName: file.name, result });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '변환 실패');
    } finally {
      setConverting(false);
    }
  }, [format]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const proceedToValidation = useCallback(() => {
    if (!converted) return;
    excel.injectRows(converted.result.rows, converted.fileName);
    setConverted(null);
  }, [converted, excel]);

  const closeConverted = useCallback(() => setConverted(null), []);

  return (
    <>
      <div
        className={cn(
          'flex min-h-[68px] items-center gap-3 rounded-md border bg-[var(--surface)] px-3 py-2 transition',
          dragOver
            ? 'border-primary ring-2 ring-primary ring-offset-2'
            : 'border-[var(--line)]',
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--bg-2)]">
          <FileSpreadsheet className="h-4 w-4 text-[var(--ink-3)]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[var(--ink)]">{format.label}</div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--ink-3)]">{format.sub}</div>
          <div className="mt-0.5 text-[10px] text-[var(--ink-3)]">
            변환 대상: <span className="font-medium">{targetLabel}</span> 표준 양식
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {converting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {converting ? '변환 중...' : '파일 변환'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
      </div>

      {converted && (
        <ConvertResultDialog
          open
          fileName={converted.fileName}
          result={converted.result}
          targetLabel={targetLabel}
          onClose={closeConverted}
          onProceed={proceedToValidation}
        />
      )}

      <ImportPreviewDialog
        type={format.targetType}
        preview={excel.preview}
        declPreview={excel.declPreview}
        loading={excel.loading}
        onClose={excel.clearPreview}
        onDownloadErrors={excel.downloadErrors}
        onSubmit={excel.submitImport}
      />

      <ImportResultDialog
        result={excel.importResult}
        onClose={() => {
          excel.clearImportResult();
          onImportComplete?.();
        }}
      />
    </>
  );
}

interface ResultProps {
  open: boolean;
  fileName: string;
  result: ConvertResult;
  targetLabel: string;
  onClose: () => void;
  onProceed: () => void;
}

function ConvertResultDialog({
  open, fileName, result, targetLabel, onClose, onProceed,
}: ResultProps) {
  const { rows, warnings } = result;
  const [showAllWarnings, setShowAllWarnings] = useState(false);
  const visibleWarnings = showAllWarnings ? warnings : warnings.slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            변환 결과 — {targetLabel} 표준 양식
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{fileName}</p>
        </DialogHeader>

        <div className="flex gap-2 text-xs">
          <span
            className="rounded px-2 py-1 font-medium"
            style={{ background: 'var(--sf-pos-bg)', color: 'var(--sf-pos)' }}
          >
            변환 {rows.length}행
          </span>
          {warnings.length > 0 && (
            <span
              className="flex items-center gap-1 rounded px-2 py-1 font-medium"
              style={{ background: 'var(--sf-warn-bg)', color: 'var(--sf-warn)' }}
            >
              <AlertTriangle className="h-3 w-3" />
              검토 필요 {warnings.length}건
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto rounded border border-[var(--line)] bg-[var(--bg-2)] p-3 text-[12px]">
          {warnings.length === 0 ? (
            <p className="text-[var(--ink-3)]">필수 컬럼 누락 없이 변환되었습니다. 다음 단계의 표준 검증에서 마스터(법인·품번·창고) 매칭이 진행됩니다.</p>
          ) : (
            <>
              <p className="mb-2 text-[var(--ink-2)]">
                아래 행은 자동 매핑이 부분적으로 실패했습니다. 검증 단계에서 누락 컬럼을 직접 채울 수 있습니다.
              </p>
              <ul className="space-y-1 font-mono">
                {visibleWarnings.map((w, i) => (
                  <li key={i} className="text-[var(--ink-2)]">• {w}</li>
                ))}
              </ul>
              {warnings.length > 10 && !showAllWarnings && (
                <button
                  type="button"
                  className="mt-2 text-[11px] text-primary underline"
                  onClick={() => setShowAllWarnings(true)}
                >
                  나머지 {warnings.length - 10}건 더 보기
                </button>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>취소</Button>
          <Button type="button" onClick={onProceed} disabled={rows.length === 0}>
            {targetLabel} 검증으로 진행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
