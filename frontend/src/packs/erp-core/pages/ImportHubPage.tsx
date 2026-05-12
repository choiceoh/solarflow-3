import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Database, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import DocumentOcrWorkbench from '@/components/excel/DocumentOcrWorkbench';
import ExternalFormatCard from '@/components/excel/ExternalFormatCard';
import ImportHistoryPanel from '@/components/excel/ImportHistoryPanel';
import ImportWorkQueuePanel from '@/components/excel/ImportWorkQueuePanel';
import UnifiedImportDialog from '@/components/excel/UnifiedImportDialog';
import UnifiedImportResultDialog from '@/components/excel/UnifiedImportResultDialog';
import { MasterConsole } from '@/components/command/MasterConsole';
import { useAuth } from '@/hooks/useAuth';
import { useUnifiedExcel } from '@/hooks/useUnifiedExcel';
import { EXTERNAL_FORMATS } from '@/lib/externalFormats/registry';
import { notify } from '@/lib/notify';
import type { TemplateType } from '@/types/excel';

const IMPORT_GROUPS: Array<{
  title: string;
  items: Array<{ type: TemplateType; label: string; sub: string }>;
}> = [
  {
    title: '기준정보',
    items: [
      { type: 'company', label: '법인', sub: '법인명 · 법인코드 · 사업자번호' },
    ],
  },
  {
    title: '판매',
    items: [
      { type: 'order', label: '수주', sub: '수주번호 · 거래처 · 품번 · 수량 · 단가' },
      { type: 'outbound', label: '출고', sub: '출고일 · 창고 · 용도 · 수주 연결' },
      { type: 'sale', label: '매출', sub: '출고 연결 · 거래처 · Wp 단가 · 계산서' },
      { type: 'receipt', label: '수금', sub: '입금일 · 거래처 · 금액 · 계좌' },
    ],
  },
  {
    title: '구매/입고',
    items: [
      { type: 'purchase_order', label: '발주(PO)', sub: '발주번호 · 제조사 · 계약유형 · 라인별 단가' },
      { type: 'lc', label: '신용장(LC)', sub: 'L/C No. · 발주참조 · 은행 · 유산스 · 만기' },
      { type: 'tt', label: 'T/T 송금', sub: '발주참조 · 송금일 · 금액 · 환율 · 상태' },
      { type: 'inbound', label: '입고', sub: 'B/L · 품번 · 수량 · 창고 · 원가 기초' },
      { type: 'declaration', label: '면장/원가', sub: '면장번호 · B/L · 원가 라인' },
      { type: 'expense', label: '부대비용', sub: 'B/L 또는 월 · 비용 유형 · 금액' },
    ],
  },
];

export default function ImportHubPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [downloading, setDownloading] = useState(false);
  const [downloadingMaster, setDownloadingMaster] = useState(false);
  const [downloadingSample, setDownloadingSample] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 통합 업로드 — 한 파일로 모든 섹션 동시 처리. PO/LC 코드표(은행·발주번호)도 이 훅이 채운다.
  const unified = useUnifiedExcel();
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  const unifiedDisabled = !unified.masterData || unified.loading;
  const masterData = unified.masterData;
  const loading = unified.loading;
  const reviewCount = unified.history.filter((item) => item.status === 'preview' && (item.errorRows + item.warningRows) > 0).length;
  const latestHistory = unified.history[0];

  const handleUnifiedDownload = useCallback(async () => {
    if (!masterData) return;
    setDownloading(true);
    try {
      const { generateUnifiedTemplate } = await import('@/lib/excelTemplates');
      await generateUnifiedTemplate(masterData);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '통합 거래 양식 다운로드 실패');
    } finally {
      setDownloading(false);
    }
  }, [masterData]);

  // 통합 마스터 양식 다운로드 — 기준정보 6종(법인·제조사·품번·창고·은행·거래처) 한 파일로.
  const handleUnifiedMasterDownload = useCallback(async () => {
    if (!masterData) return;
    setDownloadingMaster(true);
    try {
      const { generateUnifiedMasterTemplate } = await import('@/lib/excelTemplates');
      await generateUnifiedMasterTemplate(masterData);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '통합 마스터 양식 다운로드 실패');
    } finally {
      setDownloadingMaster(false);
    }
  }, [masterData]);

  const handleSamplePackDownload = useCallback(async () => {
    if (!masterData) return;
    setDownloadingSample(true);
    try {
      const { generateImportRehearsalSamplePack } = await import('@/lib/excelTemplates');
      await generateImportRehearsalSamplePack(masterData);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '리허설 샘플팩 다운로드 실패');
    } finally {
      setDownloadingSample(false);
    }
  }, [masterData]);

  const handleExportAll = useCallback(async () => {
    setExporting(true);
    try {
      const { generateUnifiedExport } = await import('@/lib/excelExport');
      await generateUnifiedExport();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '전체 데이터 내보내기 실패');
    } finally {
      setExporting(false);
    }
  }, []);

  const handleUnifiedUploadPick = useCallback((file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      notify.error('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다');
      return;
    }
    unified.uploadFile(file);
  }, [unified]);

  // 통합 훅의 에러 상태를 토스트로 노출 — 다이얼로그 미오픈 상황에서도 보이도록.
  useEffect(() => {
    if (unified.error) notify.error(unified.error);
  }, [unified.error]);

  return (
    <MasterConsole
      eyebrow="IMPORT HUB"
      title="엑셀 입력"
      description="운영 데이터 생성은 엑셀 양식 업로드로 처리합니다."
      tableTitle="입력 양식"
      tableSub="입력자 작업대"
      kpiScope="import-hub"
      actions={isAdmin ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={exporting}
            onClick={handleExportAll}
            title="관리자 전용 — 모든 컬렉션의 거래 데이터를 한 파일로 내보냅니다"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            전체 데이터 내보내기
          </Button>
        </div>
      ) : undefined}
      metrics={[
        { label: '검토 필요', value: String(reviewCount), unit: '건', sub: '업로드 오류·경고', tone: reviewCount > 0 ? 'warn' : 'pos' },
        { label: '최근 등록', value: String(latestHistory?.importedRows ?? 0), unit: '건', sub: latestHistory?.fileName ?? '이력 없음', tone: 'info' },
        { label: '통합 양식', value: '11', unit: '시트', sub: '운영 입력 정본', tone: 'solar' },
        { label: '업무별', value: '보조', sub: '예외 보정용', tone: 'ink' },
      ]}
    >
      <Tabs defaultValue="standard">
        <TabsList variant="line">
          <TabsTrigger value="standard">입력 작업대</TabsTrigger>
          <TabsTrigger value="external">외부 양식 변환</TabsTrigger>
          <TabsTrigger value="ocr">문서 OCR</TabsTrigger>
        </TabsList>

        <TabsContent value="standard" className="mt-6 space-y-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <PrimaryImportPanel
              loading={loading}
              downloading={downloading}
              downloadingMaster={downloadingMaster}
              downloadingSample={downloadingSample}
              disabled={unifiedDisabled}
              masterReady={!!masterData}
              onDownloadUnified={handleUnifiedDownload}
              onDownloadMaster={handleUnifiedMasterDownload}
              onDownloadSample={handleSamplePackDownload}
              onUploadClick={() => unifiedInputRef.current?.click()}
            />
            <ImportHistoryPanel items={unified.history} onClear={unified.clearHistory} />
          </div>

          <input
            ref={unifiedInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUnifiedUploadPick(file);
              e.target.value = '';
            }}
          />

          <ImportWorkQueuePanel history={unified.history} />

          <details className="group rounded-md border border-[var(--line)] bg-[var(--surface)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
              <div>
                <div className="text-sm font-semibold text-[var(--ink)]">업무별 양식</div>
                <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">통합 양식 대신 개별 업무 파일을 다룰 때 사용</div>
              </div>
              <ChevronDown className="h-4 w-4 text-[var(--ink-3)] transition group-open:rotate-180" />
            </summary>
            <div className="border-t border-[var(--line)] p-3">
              <div className="grid gap-6 xl:grid-cols-2 items-start">
                {IMPORT_GROUPS.map((group) => (
                  <section key={group.title} className="space-y-3">
                    <div className="eyebrow pt-1">{group.title}</div>
                    <div className="grid gap-2">
                      {group.items.map((item) => (
                        <div
                          key={item.type}
                          className="flex min-h-[68px] items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--bg-2)]">
                            <FileSpreadsheet className="h-4 w-4 text-[var(--ink-3)]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold text-[var(--ink)]">{item.label}</div>
                            <div className="mt-0.5 truncate text-[11px] text-[var(--ink-3)]">{item.sub}</div>
                          </div>
                          <ExcelToolbar type={item.type} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </details>
        </TabsContent>

        <TabsContent value="external" className="mt-8">
          <section className="space-y-3">
            <div className="grid gap-2">
              {EXTERNAL_FORMATS.map((fmt) => (
                <ExternalFormatCard key={fmt.id} format={fmt} />
              ))}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="ocr" className="mt-8">
          <DocumentOcrWorkbench />
        </TabsContent>
      </Tabs>

      <UnifiedImportDialog
        preview={unified.preview}
        loading={unified.loading}
        onClose={unified.clearPreview}
        onDownloadErrors={unified.downloadErrors}
        onDownloadCorrected={unified.downloadCorrectedWorkbook}
        onCellChange={unified.updatePreviewCell}
        edits={unified.cellEdits}
        onSubmit={unified.submitAll}
      />

      <UnifiedImportResultDialog
        result={unified.submitResult}
        onClose={unified.clearSubmitResult}
      />
    </MasterConsole>
  );
}

interface PrimaryImportPanelProps {
  loading: boolean;
  downloading: boolean;
  downloadingMaster: boolean;
  downloadingSample: boolean;
  disabled: boolean;
  masterReady: boolean;
  onDownloadUnified: () => void;
  onDownloadMaster: () => void;
  onDownloadSample: () => void;
  onUploadClick: () => void;
}

function PrimaryImportPanel({
  loading,
  downloading,
  downloadingMaster,
  downloadingSample,
  disabled,
  masterReady,
  onDownloadUnified,
  onDownloadMaster,
  onDownloadSample,
  onUploadClick,
}: PrimaryImportPanelProps) {
  return (
    <section className="rounded-md border border-[var(--line)] bg-[var(--surface)] p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-[var(--solar-3)]" />
            <div className="text-sm font-semibold text-[var(--ink)]">통합 입력</div>
          </div>
          <div className="mt-1 text-xs leading-5 text-[var(--ink-3)]">
            PO·LC·T/T·입고·매출·수금을 한 파일에서 검증합니다.
          </div>
        </div>
        <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!masterReady || loading || downloading}
            onClick={onDownloadUnified}
          >
            {downloading || loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            양식 다운로드
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={disabled}
            onClick={onUploadClick}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            업로드
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 justify-start gap-1.5"
          disabled={!masterReady || loading || downloadingMaster}
          onClick={onDownloadMaster}
          title="법인·제조사·품번·창고·은행·거래처 6종 시트가 한 파일로"
        >
          {downloadingMaster ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          마스터 양식
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 justify-start gap-1.5"
          disabled={!masterReady || loading || downloadingSample}
          onClick={onDownloadSample}
          title="PO/LC/T/T 정상·경고·오류 행이 섞인 리허설용 파일"
        >
          {downloadingSample ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}
          샘플팩
        </Button>
      </div>
    </section>
  );
}
