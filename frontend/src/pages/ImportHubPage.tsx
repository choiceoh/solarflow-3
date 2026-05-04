import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import ExternalFormatCard from '@/components/excel/ExternalFormatCard';
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
  const [exporting, setExporting] = useState(false);

  // 통합 업로드 — 한 파일로 모든 섹션 동시 처리. PO/LC 코드표(은행·발주번호)도 이 훅이 채운다.
  const unified = useUnifiedExcel();
  const unifiedInputRef = useRef<HTMLInputElement>(null);
  const unifiedDisabled = !unified.masterData || unified.loading;
  const masterData = unified.masterData;
  const loading = unified.loading;

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
      tableSub="통합 양식 + 업무별 검증 업로드"
      actions={(
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={!masterData || loading || downloadingMaster}
            onClick={handleUnifiedMasterDownload}
            title="법인·제조사·품번·창고·은행·거래처 6종 시트가 한 파일로"
          >
            {downloadingMaster ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            통합 마스터 다운로드
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!masterData || loading || downloading}
            onClick={handleUnifiedDownload}
          >
            {downloading || loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            통합 양식 다운로드
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            disabled={unifiedDisabled}
            onClick={() => unifiedInputRef.current?.click()}
            title="통합 양식 한 파일로 모든 섹션을 한 번에 업로드합니다"
          >
            {unified.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            통합 양식 업로드
          </Button>
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
          {isAdmin && (
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
          )}
        </div>
      )}
      metrics={[
        { label: '통합 양식', value: '1', unit: '파일', sub: '10개 시트', tone: 'solar', spark: [1, 2, 3, 5, 8, 10] },
        { label: '업무 양식', value: '10', unit: '종', sub: '업로드 검증', tone: 'info' },
        { label: '웹 입력', value: 'PO/LC', unit: '신규', sub: '다이얼로그 등록', tone: 'pos' },
        { label: '연결 보정', value: '매칭', sub: '관계·상태 관리', tone: 'ink' },
      ]}
    >
      <Tabs defaultValue="standard">
        <TabsList variant="line">
          <TabsTrigger value="standard">표준 양식</TabsTrigger>
          <TabsTrigger value="external">외부 양식 변환</TabsTrigger>
        </TabsList>

        <TabsContent value="standard" className="mt-8">
          <div className="grid gap-6 xl:grid-cols-2">
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
      </Tabs>

      <UnifiedImportDialog
        preview={unified.preview}
        loading={unified.loading}
        onClose={unified.clearPreview}
        onSubmit={unified.submitAll}
      />

      <UnifiedImportResultDialog
        result={unified.submitResult}
        onClose={unified.clearSubmitResult}
      />
    </MasterConsole>
  );
}
