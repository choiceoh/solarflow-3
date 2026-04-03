// 엑셀 다운로드+업로드 통합 툴바 (Step 29C: 아마란스 내보내기 추가)
// 각 페이지에 <ExcelToolbar type="inbound" /> 형태로 삽입

import { useState } from 'react';
import { FileOutput } from 'lucide-react';
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
      <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm" onClick={() => setAmaranthOpen(true)}>
            <FileOutput className="mr-1.5 h-4 w-4" />
            아마란스 {type === 'inbound' ? '입고' : '출고'}
          </Button>
        )}
        {type === 'sale' && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button variant="outline" size="sm" disabled>
                  <FileOutput className="mr-1.5 h-4 w-4" />
                  아마란스 매출
                </Button>
              </TooltipTrigger>
              <TooltipContent>실물 양식 확인 후 구현</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {error && <span className="text-xs text-red-600">{error}</span>}
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
