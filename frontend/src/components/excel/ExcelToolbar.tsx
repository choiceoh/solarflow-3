// 엑셀 다운로드+업로드 통합 툴바 (Step 29C: 아마란스 내보내기 추가)
// 각 페이지에 <ExcelToolbar type="inbound" /> 형태로 삽입

import { useState } from 'react';
import { AlertTriangle, FileOutput } from 'lucide-react';
import type { TemplateType } from '@/types/excel';
import { useExcel } from '@/hooks/useExcel';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import ExcelDownloadButton from './ExcelDownloadButton';
import ExcelUploadButton from './ExcelUploadButton';
import ImportPreviewDialog from './ImportPreviewDialog';
import ImportResultDialog from './ImportResultDialog';
import AmaranthExportDialog from './AmaranthExportDialog';

interface Props {
  type: TemplateType;
  onImportComplete?: () => void;
}

export default function ExcelToolbar({ type, onImportComplete }: Props) {
  const {
    masterData, loading, error,
    preview, declPreview, importResult,
    downloadTemplate, uploadFile,
    downloadErrors, clearPreview,
    submitImport, clearImportResult,
  } = useExcel(type);

  const [amaranthOpen, setAmaranthOpen] = useState(false);

  // 아마란스 내보내기 대상: inbound, outbound만 활성
  const amaranthType = type === 'inbound' || type === 'outbound' ? type : null;

  return (
    <>
      <div className="flex min-w-max shrink-0 flex-col items-end gap-1">
        <div className="flex shrink-0 items-center gap-2">
          <ExcelDownloadButton
            onClick={downloadTemplate}
            loading={loading}
            disabled={!masterData}
          />
          <ExcelUploadButton
            onFileSelect={uploadFile}
            loading={loading}
            disabled={!masterData}
          />

          {/* 아마란스 내보내기 버튼 */}
          {amaranthType && (
            <Button variant="outline" size="xs" onClick={() => setAmaranthOpen(true)}>
              <FileOutput className="mr-1 h-3 w-3" />
              아마란스 {type === 'inbound' ? '입고' : '출고'}
            </Button>
          )}
          {/* D-067: 매출마감 실물 양식 확보 전까지 매출 내보내기는 비활성 */}
          {type === 'sale' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" size="xs" disabled />}>
                  <FileOutput className="mr-1 h-3 w-3" />
                  아마란스 매출
                </TooltipTrigger>
                <TooltipContent>실물 양식 확인 후 구현</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {error && (
          <span
            className="flex min-w-max shrink-0 items-center gap-1 whitespace-nowrap rounded bg-[var(--sf-neg-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--sf-neg)]"
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
