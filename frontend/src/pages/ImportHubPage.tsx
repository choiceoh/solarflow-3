import { useCallback, useState } from 'react';
import { Database, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { MasterConsole } from '@/components/command/MasterConsole';
import { useAuth } from '@/hooks/useAuth';
import { useExcel } from '@/hooks/useExcel';
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
      { type: 'inbound', label: '입고', sub: 'B/L · 품번 · 수량 · 창고 · 원가 기초' },
      { type: 'declaration', label: '면장/원가', sub: '면장번호 · B/L · 원가 라인' },
      { type: 'expense', label: '부대비용', sub: 'B/L 또는 월 · 비용 유형 · 금액' },
    ],
  },
];

export default function ImportHubPage() {
  const { masterData, loading } = useExcel('sale');
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [downloading, setDownloading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleUnifiedDownload = useCallback(async () => {
    if (!masterData) return;
    setDownloading(true);
    try {
      const { generateUnifiedTemplate } = await import('@/lib/excelTemplates');
      await generateUnifiedTemplate(masterData);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '통합 양식 다운로드 실패');
    } finally {
      setDownloading(false);
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
            className="h-8 gap-1.5"
            disabled={!masterData || loading || downloading}
            onClick={handleUnifiedDownload}
          >
            {downloading || loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            통합 양식 다운로드
          </Button>
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
        { label: '통합 양식', value: '1', unit: '파일', sub: '8개 시트', tone: 'solar', spark: [1, 2, 3, 5, 8] },
        { label: '업무 양식', value: '8', unit: '종', sub: '업로드 검증', tone: 'info' },
        { label: '웹 입력', value: '0', unit: 'CTA', sub: '조회/분석 중심', tone: 'pos' },
        { label: '연결 보정', value: '매칭', sub: '관계·상태 관리', tone: 'ink' },
      ]}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {IMPORT_GROUPS.map((group) => (
          <section key={group.title} className="space-y-3">
            <div className="eyebrow">{group.title}</div>
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
    </MasterConsole>
  );
}
