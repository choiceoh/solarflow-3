// 엑셀 다운로드+업로드+아마란스 통합 툴바
// 각 페이지에 <ExcelToolbar type="inbound" /> 형태로 삽입

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, Download, FileOutput, Loader2, Plus, Upload } from 'lucide-react';
import type { TemplateType } from '@/types/excel';
import { useExcel } from '@/hooks/useExcel';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import ImportPreviewDialog from './ImportPreviewDialog';
import ImportResultDialog from './ImportResultDialog';
import AmaranthExportDialog from './AmaranthExportDialog';

interface Props {
  type: TemplateType;
  onImportComplete?: () => void;
  onNew?: () => void;
}

export default function ExcelToolbar({ type, onImportComplete, onNew }: Props) {
  const {
    masterData, loading, error,
    preview, declPreview, importResult,
    downloadTemplate, uploadFile,
    downloadErrors, clearPreview,
    submitImport, clearImportResult,
  } = useExcel(type);
  const excelDisabled = !masterData || loading;

  const [amaranthOpen, setAmaranthOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const amaranthType = type === 'inbound' || type === 'outbound' ? type : null;

  const pickFile = useCallback((file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      alert('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다');
      return;
    }
    uploadFile(file);
  }, [uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  }, [pickFile]);

  return (
    <>
      <div className="flex min-w-max shrink-0 flex-col items-end gap-1">
        <div
          className={cn(
            'inline-flex shrink-0 rounded-md',
            dragOver && 'ring-2 ring-primary ring-offset-2',
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={excelDisabled && !onNew}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <ChevronDown className="h-3 w-3" />}
              작업
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px]">
              {onNew && (
                <>
                  <DropdownMenuItem onClick={onNew}>
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    새로 등록
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={downloadTemplate} disabled={excelDisabled}>
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                {loading ? '생성 중...' : '양식 다운로드'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => inputRef.current?.click()}
                disabled={excelDisabled}
              >
                <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                {loading ? '파싱 중...' : '엑셀 업로드'}
              </DropdownMenuItem>
              {amaranthType && (
                <DropdownMenuItem onClick={() => setAmaranthOpen(true)} disabled={!masterData}>
                  <FileOutput className="h-3.5 w-3.5 text-muted-foreground" />
                  아마란스 {type === 'inbound' ? '입고' : '출고'}
                </DropdownMenuItem>
              )}
              {/* D-067: 매출마감 실물 양식 확보 전까지 비활성 */}
              {type === 'sale' && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger render={<DropdownMenuItem disabled />}>
                      <FileOutput className="h-3.5 w-3.5 text-muted-foreground" />
                      아마란스 매출
                    </TooltipTrigger>
                    <TooltipContent>실물 양식 확인 후 구현</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) pickFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {error && (
          <span
            className="flex min-w-max shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium"
            style={{ background: 'var(--sf-neg-bg)', color: 'var(--sf-neg)' }}
            title={error}
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            {error}
          </span>
        )}
      </div>

      <ImportPreviewDialog
        type={type}
        preview={preview}
        declPreview={declPreview}
        loading={loading}
        onClose={clearPreview}
        onDownloadErrors={downloadErrors}
        onSubmit={submitImport}
      />

      <ImportResultDialog
        result={importResult}
        onClose={() => {
          clearImportResult();
          onImportComplete?.();
        }}
      />

      {amaranthType && (
        <AmaranthExportDialog
          type={amaranthType}
          open={amaranthOpen}
          onClose={() => setAmaranthOpen(false)}
        />
      )}
    </>
  );
}
