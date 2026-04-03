// 엑셀 업로드 미리보기 다이얼로그 (Step 29B: 확정 등록 활성화)
// 면장 타입: 탭 2개 (면장/원가) — 지적 2 반영

import { useState } from 'react';
import { FileSpreadsheet, Download, X, Upload } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ImportPreview, DeclarationImportPreview, TemplateType } from '@/types/excel';
import {
  FIELDS_MAP, TEMPLATE_LABEL,
  DECLARATION_FIELDS, DECLARATION_COST_FIELDS,
} from '@/types/excel';
import ImportPreviewTable from './ImportPreviewTable';

interface Props {
  type: TemplateType;
  preview: ImportPreview | null;
  declPreview: DeclarationImportPreview | null;
  loading?: boolean;
  onClose: () => void;
  onDownloadErrors: () => void;
  onSubmit: () => void;
}

type FilterMode = 'all' | 'valid' | 'error';

export default function ImportPreviewDialog({
  type, preview, declPreview, loading, onClose, onDownloadErrors, onSubmit,
}: Props) {
  const [filter, setFilter] = useState<FilterMode>('all');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const open = preview !== null || declPreview !== null;
  const label = TEMPLATE_LABEL[type];

  if (!open) return null;

  // 면장: 2시트 탭
  if (type === 'declaration' && declPreview) {
    const declValid = declPreview.declarations.filter((r) => r.valid).length;
    const declError = declPreview.declarations.filter((r) => !r.valid).length;
    const costValid = declPreview.costs.filter((r) => r.valid).length;
    const costError = declPreview.costs.filter((r) => !r.valid).length;
    const totalError = declError + costError;

    return (
      <>
        <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
          <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                {label} 업로드 미리보기
              </DialogTitle>
              <p className="text-xs text-muted-foreground">{declPreview.fileName}</p>
            </DialogHeader>

            <div className="flex gap-2 text-xs">
              <FilterButton mode="all" current={filter} onClick={setFilter}
                label={`전체 ${declPreview.declarations.length + declPreview.costs.length}건`} />
              <FilterButton mode="valid" current={filter} onClick={setFilter}
                label={`유효 ${declValid + costValid}건`} className="text-green-700" />
              <FilterButton mode="error" current={filter} onClick={setFilter}
                label={`에러 ${totalError}건`} className="text-red-700" />
            </div>

            <Tabs defaultValue="declarations" className="flex-1 overflow-hidden flex flex-col">
              <TabsList>
                <TabsTrigger value="declarations">
                  면장 ({declPreview.declarations.length}건)
                </TabsTrigger>
                <TabsTrigger value="costs">
                  원가 ({declPreview.costs.length}건)
                </TabsTrigger>
              </TabsList>
              <TabsContent value="declarations" className="flex-1 overflow-auto mt-2">
                <ImportPreviewTable rows={declPreview.declarations} fields={DECLARATION_FIELDS} filter={filter} />
              </TabsContent>
              <TabsContent value="costs" className="flex-1 overflow-auto mt-2">
                <ImportPreviewTable rows={declPreview.costs} fields={DECLARATION_COST_FIELDS} filter={filter} />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              {totalError > 0 && (
                <Button variant="outline" size="sm" onClick={onDownloadErrors}>
                  <Download className="mr-1.5 h-4 w-4" />에러만 다운로드
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="mr-1.5 h-4 w-4" />취소
              </Button>
              <Button size="sm" disabled={(declValid + costValid) === 0 || loading}
                onClick={() => setConfirmOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" />
                {loading ? '등록 중...' : `확정 등록 (${declValid + costValid}건)`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 확정 확인 다이얼로그 */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>확정 등록</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              유효한 면장 {declValid}건 + 원가 {costValid}건을 등록하시겠습니까?
              {totalError > 0 && ` 에러 ${totalError}건은 건너뜁니다.`}
            </p>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>취소</Button>
              <Button size="sm" onClick={() => { setConfirmOpen(false); onSubmit(); }}>등록</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // 일반 양식
  if (!preview) return null;
  const fields = FIELDS_MAP[type];

  return (
    <>
      <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              {label} 업로드 미리보기
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{preview.fileName}</p>
          </DialogHeader>

          <div className="flex gap-2 text-xs">
            <FilterButton mode="all" current={filter} onClick={setFilter}
              label={`전체 ${preview.totalRows}건`} />
            <FilterButton mode="valid" current={filter} onClick={setFilter}
              label={`유효 ${preview.validRows}건`} className="text-green-700" />
            <FilterButton mode="error" current={filter} onClick={setFilter}
              label={`에러 ${preview.errorRows}건`} className="text-red-700" />
          </div>

          <div className="flex-1 overflow-auto">
            <ImportPreviewTable rows={preview.rows} fields={fields} filter={filter} />
          </div>

          <DialogFooter>
            {preview.errorRows > 0 && (
              <Button variant="outline" size="sm" onClick={onDownloadErrors}>
                <Download className="mr-1.5 h-4 w-4" />에러만 다운로드
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" />취소
            </Button>
            <Button size="sm" disabled={preview.validRows === 0 || loading}
              onClick={() => setConfirmOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              {loading ? '등록 중...' : `확정 등록 (${preview.validRows}건)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 확정 확인 다이얼로그 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>확정 등록</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            유효한 {preview.validRows}건을 등록하시겠습니까?
            {preview.errorRows > 0 && ` 에러 ${preview.errorRows}건은 건너뜁니다.`}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button size="sm" onClick={() => { setConfirmOpen(false); onSubmit(); }}>등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 필터 버튼 컴포넌트
function FilterButton({
  mode, current, onClick, label, className,
}: {
  mode: FilterMode;
  current: FilterMode;
  onClick: (m: FilterMode) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      onClick={() => onClick(mode)}
      className={`px-2 py-1 rounded border text-xs transition-colors ${
        current === mode ? 'bg-primary/10 border-primary font-medium' : 'border-transparent hover:bg-muted'
      } ${className ?? ''}`}
    >
      {label}
    </button>
  );
}
