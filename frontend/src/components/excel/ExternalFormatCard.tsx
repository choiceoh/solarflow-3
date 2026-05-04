// 외부 양식 변환 카드 (D-055/056).
// 흐름: 파일 드롭 → 변환(매칭 메타 포함) → 모호 행 인라인 확인 → 자동 등록·alias 학습
// → "검증으로 진행" → 표준 검증 파이프라인.

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Globe, Loader2, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { fetchBlobWithAuth, fetchWithAuth } from '@/lib/api';
import { useExcel } from '@/hooks/useExcel';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { TEMPLATE_LABEL } from '@/types/excel';
import type { ImportResult } from '@/types/excel';
import type { ExternalFormat } from '@/lib/externalFormats/registry';
import type {
  ConvertResult, ResolveContext, RowMatchMeta,
} from '@/lib/externalFormats/topsolarOutbound';
import type { CompanyLite, PartnerLite, ProductLite } from '@/lib/externalFormats/matching';
import {
  autoRegisterCompany, autoRegisterProduct,
  fetchCompanyAliases, fetchProductAliases,
  learnCompanyAlias, learnProductAlias,
} from '@/lib/externalFormats/autoRegister';
import type { ManufacturerLite } from '@/lib/externalFormats/productInference';
import ImportPreviewDialog from './ImportPreviewDialog';
import ImportResultDialog from './ImportResultDialog';
import SaleAutoRegisterDialog from './SaleAutoRegisterDialog';

interface Props {
  format: ExternalFormat;
  onImportComplete?: () => void;
}

interface ConvertedState {
  fileName: string;
  result: ConvertResult;
  ctx: ResolveContext;
  manufacturers: ManufacturerLite[];
}


// 등록된 sync source — format.id ↔ external_format_id 매칭 (D-059 PR 7)
interface RegisteredSync {
  sync_id: string;
  name: string;
  spreadsheet_id: string;
  sheet_gid: number;
  schedule: string;
  enabled: boolean;
  last_synced_at?: string | null;
  last_sync_count?: number | null;
  last_skipped_count?: number | null;
  last_error?: string | null;
}

interface SheetSource {
  spreadsheet_id: string;
  sheet_gid: number;
}

// 구글 시트 URL → spreadsheet_id, gid 추출.
// 입력 예: https://docs.google.com/spreadsheets/d/{ID}/edit?gid={GID}#gid={GID}
function parseGoogleSheetUrl(url: string): { id: string; gid: number } | null {
  const idMatch = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(url);
  if (!idMatch) return null;
  const gidMatch = /[#?&]gid=(\d+)/.exec(url);
  return { id: idMatch[1], gid: gidMatch ? parseInt(gidMatch[1], 10) : 0 };
}

export default function ExternalFormatCard({ format, onImportComplete }: Props) {
  const excel = useExcel(format.targetType);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState<ConvertedState | null>(null);
  // D-059: 구글 시트 URL 변환 진입점
  const [sheetUrl, setSheetUrl] = useState('');
  const [fetchingSheet, setFetchingSheet] = useState(false);
  // D-059 PR 7: 카드의 format.id 와 매칭되는 등록된 시트 (1시간 cron + 즉시 trigger)
  const [registeredSync, setRegisteredSync] = useState<RegisteredSync | null>(null);
  const [runningSync, setRunningSync] = useState(false);
  // D-057: 출고 등록 완료 후 매출 자동 등록을 위해 변환 결과 보관
  const [pendingSaleSource, setPendingSaleSource] = useState<ConvertedState | null>(null);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);

  const disabled = !excel.masterData || excel.loading || converting;
  const targetLabel = TEMPLATE_LABEL[format.targetType];

  // 출고 importResult 도착 시 매출 다이얼로그 트리거 — 외부 양식 출처 + imported_ids 있을 때.
  // 안전 조건: imported_ids 의 길이가 valid 행 수와 정확히 같아야 매출 매핑이 안전.
  // 부분 실패(일부 행만 INSERT 성공)는 매출 자동 등록을 건너뛰고 일반 결과 다이얼로그만 표시.
  useEffect(() => {
    if (!excel.importResult || !pendingSaleSource || format.targetType !== 'outbound') return;
    const ids = excel.importResult.imported_ids ?? [];
    const validCount = (excel.preview?.rows ?? []).filter((r) => r.valid).length;
    if (excel.importResult.success && ids.length > 0 && ids.length === validCount) {
      setSaleDialogOpen(true);
    } else if (ids.length !== validCount && validCount > 0) {
      notify.warning(`출고 ${ids.length}/${validCount}건만 성공 — 매출 자동 등록 건너뜀`);
    }
  }, [excel.importResult, excel.preview, pendingSaleSource, format.targetType]);

  const handleFile = useCallback(async (file: File, sheetSource?: SheetSource) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      notify.error('엑셀 파일(.xlsx, .xls)만 변환할 수 있습니다');
      return;
    }
    if (!excel.masterData) {
      notify.error('마스터 데이터 로딩 전입니다');
      return;
    }
    setConverting(true);
    try {
      const companies: CompanyLite[] = excel.masterData.companies.map((c) => ({
        company_id: c.company_id, company_code: c.company_code, company_name: c.company_name,
      }));
      const products: ProductLite[] = excel.masterData.products.map((p) => ({
        product_id: p.product_id, product_code: p.product_code, product_name: p.product_name,
      }));
      const manufacturers: ManufacturerLite[] = excel.masterData.manufacturers.map((m) => ({
        manufacturer_id: m.manufacturer_id,
        name_kr: m.name_kr,
      }));
      const [companyAliases, productAliases] = await Promise.all([
        fetchCompanyAliases(),
        fetchProductAliases(),
      ]);
      const ctx: ResolveContext = {
        companies, products, companyAliases, productAliases,
        sourceMeta: sheetSource,  // D-059: 시트 출처면 dedup 키 첨부
      };
      const result = await format.convert(file, ctx);
      setConverted({ fileName: file.name, result, ctx, manufacturers });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '변환 실패');
    } finally {
      setConverting(false);
    }
  }, [format, excel.masterData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // D-059: 구글 시트 URL → 백엔드 proxy 로 xlsx 다운로드 → File 만들어 변환 트리거
  const handleSheetUrl = useCallback(async () => {
    const parsed = parseGoogleSheetUrl(sheetUrl.trim());
    if (!parsed) {
      notify.error('유효한 구글 시트 URL이 아닙니다 (/spreadsheets/d/{ID}?gid={GID} 형식)');
      return;
    }
    setFetchingSheet(true);
    try {
      const url = `/api/v1/external-format/google-sheet?spreadsheet_id=${encodeURIComponent(parsed.id)}&gid=${parsed.gid}`;
      const res = await fetchBlobWithAuth(url);
      if (!res.ok) {
        throw new Error(`시트 다운로드 실패 (${res.status})`);
      }
      const blob = await res.blob();
      const file = new File([blob], `google-sheet-${parsed.id.slice(0, 8)}.xlsx`, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      await handleFile(file, { spreadsheet_id: parsed.id, sheet_gid: parsed.gid });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '구글 시트 가져오기 실패');
    } finally {
      setFetchingSheet(false);
    }
  }, [sheetUrl, handleFile]);


  // 등록된 sync source 중 이 카드의 format.id 와 매칭되는 것 찾기
  useEffect(() => {
    let cancelled = false;
    fetchWithAuth<RegisteredSync[]>('/api/v1/external-sync-sources')
      .then((all) => {
        if (cancelled) return;
        const list = (all as unknown as Array<RegisteredSync & { external_format_id: string }>) ?? [];
        const match = list.find((s) => s.external_format_id === format.id);
        setRegisteredSync(match ?? null);
      })
      .catch(() => {/* 401·네트워크 무시 — 카드 자체는 동작해야 함 */});
    return () => { cancelled = true; };
  }, [format.id]);

  // 등록된 시트 즉시 동기화 trigger (URL 입력 없이 카드의 버튼만으로)
  const triggerRegisteredSync = useCallback(async () => {
    if (!registeredSync) return;
    setRunningSync(true);
    try {
      await fetchWithAuth(`/api/v1/external-sync-sources/${registeredSync.sync_id}/run`, {
        method: 'POST',
      });
      notify.success(`${registeredSync.name} 동기화 시작 — 백그라운드 실행 중. 잠시 후 마지막 동기화 시각이 갱신됩니다`);
      // 5초 후 last_synced_at 갱신 polling 1회
      setTimeout(() => {
        fetchWithAuth<RegisteredSync[]>('/api/v1/external-sync-sources')
          .then((all) => {
            const list = (all as unknown as Array<RegisteredSync & { external_format_id: string }>) ?? [];
            const next = list.find((s) => s.external_format_id === format.id);
            if (next) setRegisteredSync(next);
          })
          .catch(() => {});
      }, 5000);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '동기화 trigger 실패');
    } finally {
      setRunningSync(false);
    }
  }, [registeredSync, format.id]);

  const proceedToValidation = useCallback(() => {
    if (!converted) return;
    excel.injectRows(converted.result.rows, converted.fileName);
    // 변환 결과를 보관 — 출고 등록 완료 후 매출 자동 등록에서 source_payload 활용
    setPendingSaleSource(converted);
    setConverted(null);
  }, [converted, excel]);

  const closeSaleDialog = useCallback((saleResult?: ImportResult) => {
    setSaleDialogOpen(false);
    setPendingSaleSource(null);
    excel.clearImportResult();
    if (saleResult) {
      notify.success(`매출 ${saleResult.imported_count}건 등록 완료`);
    }
    onImportComplete?.();
  }, [excel, onImportComplete]);

  const closeConverted = useCallback(() => setConverted(null), []);

  return (
    <>
      <div className={cn(
        'rounded-md border bg-[var(--surface)] transition',
        dragOver ? 'border-primary ring-2 ring-primary ring-offset-2' : 'border-[var(--line)]',
      )}>
      <div
        className="flex min-h-[68px] items-center gap-3 px-3 py-2"
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


      {/* D-059 PR 7: 등록된 시트가 있으면 즉시 동기화 버튼 노출 */}
      {registeredSync && (
        <div className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-2 bg-[var(--bg-2)]">
          <Globe className="h-3.5 w-3.5 text-[var(--ink-3)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[var(--ink)]">
              {registeredSync.name}
              <span className="ml-1.5 text-[10px] text-[var(--ink-3)] font-normal">
                ({registeredSync.schedule === 'hourly' ? '자동 1시간' : '수동만'})
              </span>
            </div>
            <div className="text-[10px] text-[var(--ink-3)]">
              {registeredSync.last_synced_at
                ? `마지막 동기화: ${new Date(registeredSync.last_synced_at).toLocaleString('ko-KR')}`
                : '아직 동기화 기록 없음'}
              {registeredSync.last_sync_count !== null && registeredSync.last_sync_count !== undefined && (
                <span> · 최근 imported {registeredSync.last_sync_count} / skipped {registeredSync.last_skipped_count ?? 0}</span>
              )}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            disabled={runningSync || !registeredSync.enabled}
            onClick={triggerRegisteredSync}
          >
            {runningSync ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
            {runningSync ? '동기화 중...' : '지금 동기화'}
          </Button>
        </div>
      )}

      {/* D-059: 구글 시트 URL 입력 — 백엔드 proxy 로 다운로드 후 같은 변환 흐름 */}
      <div className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-2 bg-[var(--bg-2)]">
        <Globe className="h-3.5 w-3.5 text-[var(--ink-3)] shrink-0" />
        <input
          type="text"
          value={sheetUrl}
          onChange={(e) => setSheetUrl(e.target.value)}
          placeholder="구글 시트 URL 붙여넣기 (공개 권한 필요)"
          className="flex-1 bg-transparent text-[12px] text-[var(--ink)] placeholder:text-[var(--ink-3)] focus:outline-none"
          disabled={fetchingSheet || disabled}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSheetUrl(); }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[11px]"
          disabled={!sheetUrl.trim() || fetchingSheet || disabled}
          onClick={handleSheetUrl}
        >
          {fetchingSheet ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
          {fetchingSheet ? '가져오는 중...' : '시트에서 가져오기'}
        </Button>
      </div>
      </div>

      {converted && (
        <ConvertResultDialog
          open
          state={converted}
          targetLabel={targetLabel}
          onClose={closeConverted}
          onProceed={proceedToValidation}
          onUpdate={(next) => setConverted(next)}
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

      {/* 매출 자동 등록 다이얼로그가 떠 있을 때는 출고 결과 다이얼로그 표시 안 함 — 매출 다이얼로그가 결과 통합 책임 */}
      {!saleDialogOpen && (
        <ImportResultDialog
          result={excel.importResult}
          onClose={() => {
            excel.clearImportResult();
            setPendingSaleSource(null);
            onImportComplete?.();
          }}
        />
      )}

      {pendingSaleSource && excel.importResult && (
        <SaleAutoRegisterDialog
          open={saleDialogOpen}
          outboundRows={(excel.preview?.rows ?? pendingSaleSource.result.rows).filter((r) => r.valid)}
          importedOutboundIds={excel.importResult.imported_ids ?? []}
          partners={(excel.masterData?.partners ?? [])
            .filter((p) => p.partner_type === 'customer' || p.partner_type === 'both')
            .map((p) => ({
              partner_id: p.partner_id,
              partner_name: p.partner_name,
              partner_type: p.partner_type,
            })) as PartnerLite[]}
          onClose={() => closeSaleDialog()}
          onCompleted={(r) => closeSaleDialog(r)}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────
// 변환 결과 다이얼로그 — 모호 행 인라인 확인 + 자동 등록
// ─────────────────────────────────────────────────────

interface ResultProps {
  open: boolean;
  state: ConvertedState;
  targetLabel: string;
  onClose: () => void;
  onProceed: () => void;
  onUpdate: (next: ConvertedState) => void;
}

function ConvertResultDialog({ open, state, targetLabel, onClose, onProceed, onUpdate }: ResultProps) {
  const { result, ctx, manufacturers, fileName } = state;
  const [busy, setBusy] = useState(false);

  const ambiguousCompany = result.meta.filter((m) => m.company.level === 'fuzzy');
  const ambiguousProduct = result.meta.filter((m) => m.product.level === 'fuzzy');
  const newCompany = result.meta.filter((m) => m.company.level === 'none' && m.rawCompanyText);
  const newProduct = result.meta.filter((m) => m.product.level === 'none' && m.rawProductCode);

  const totalActions = ambiguousCompany.length + ambiguousProduct.length
    + newCompany.length + newProduct.length;
  const canProceed = totalActions === 0;

  // 회사: ambiguous 행에서 사용자가 후보를 선택 → row.data 갱신 + alias 학습
  const resolveCompanyFuzzy = useCallback(async (rowNum: number, candidate: CompanyLite | null) => {
    setBusy(true);
    try {
      const target = result.meta.find((m) => m.rowNumber === rowNum);
      if (!target) return;
      let canonical: CompanyLite | null = candidate;
      if (!canonical) {
        // [신규 등록] 클릭 시 — 자동 등록
        canonical = await autoRegisterCompany(target.rawCompanyText);
      } else {
        // [같음] 선택 시 — alias 학습
        await learnCompanyAlias(canonical.company_id, target.rawCompanyText);
      }
      // 같은 raw 텍스트의 모든 행에 일괄 반영
      const newCtx: ResolveContext = {
        ...ctx,
        companies: candidate ? ctx.companies : [...ctx.companies, canonical],
      };
      const next: ConvertedState = {
        ...state,
        ctx: newCtx,
        result: applyCompanyResolution(result, target.rawCompanyText, canonical),
      };
      onUpdate(next);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '회사 매핑 실패');
    } finally {
      setBusy(false);
    }
  }, [result, ctx, state, onUpdate]);

  const resolveProductFuzzy = useCallback(async (rowNum: number, candidate: ProductLite | null) => {
    setBusy(true);
    try {
      const target = result.meta.find((m) => m.rowNumber === rowNum);
      if (!target) return;
      let canonical: ProductLite | null = candidate;
      if (!canonical) {
        canonical = await autoRegisterProduct(target.rawProductCode, manufacturers);
      } else {
        await learnProductAlias(canonical.product_id, target.rawProductCode);
      }
      const newCtx: ResolveContext = {
        ...ctx,
        products: candidate ? ctx.products : [...ctx.products, canonical],
      };
      const next: ConvertedState = {
        ...state,
        ctx: newCtx,
        result: applyProductResolution(result, target.rawProductCode, canonical),
      };
      onUpdate(next);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '품번 매핑 실패');
    } finally {
      setBusy(false);
    }
  }, [result, ctx, state, manufacturers, onUpdate]);

  // 모든 'none' 행 일괄 자동 등록
  const autoRegisterAllNew = useCallback(async () => {
    setBusy(true);
    try {
      let res = result;
      let nextCtx = ctx;
      // 회사 dedup
      const uniqueCompanyTexts = new Set<string>(newCompany.map((m) => m.rawCompanyText));
      for (const text of uniqueCompanyTexts) {
        try {
          const created = await autoRegisterCompany(text);
          nextCtx = { ...nextCtx, companies: [...nextCtx.companies, created] };
          res = applyCompanyResolution(res, text, created);
        } catch (e) {
          notify.error(`${text} 자동 등록 실패: ${e instanceof Error ? e.message : ''}`);
        }
      }
      // 품번 dedup
      const uniqueProductCodes = new Set<string>(newProduct.map((m) => m.rawProductCode));
      for (const code of uniqueProductCodes) {
        try {
          const created = await autoRegisterProduct(code, manufacturers);
          nextCtx = { ...nextCtx, products: [...nextCtx.products, created] };
          res = applyProductResolution(res, code, created);
        } catch (e) {
          notify.error(`${code} 자동 등록 실패: ${e instanceof Error ? e.message : ''}`);
        }
      }
      onUpdate({ ...state, ctx: nextCtx, result: res });
    } finally {
      setBusy(false);
    }
  }, [result, ctx, newCompany, newProduct, manufacturers, state, onUpdate]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            변환 결과 — {targetLabel} 표준 양식
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{fileName}</p>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-pos-bg)', color: 'var(--sf-pos)' }}>
            변환 {result.rows.length}행
          </span>
          {result.resolvedFromSection > 0 && (
            <span className="rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-info-bg)', color: 'var(--sf-info)' }}>
              자유 날짜 보정 {result.resolvedFromSection}건
            </span>
          )}
          {result.filledFromAbove > 0 && (
            <span className="rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-info-bg)', color: 'var(--sf-info)' }}>
              메타 forward-fill {result.filledFromAbove}건
            </span>
          )}
          {ambiguousCompany.length + ambiguousProduct.length > 0 && (
            <span className="flex items-center gap-1 rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-warn-bg)', color: 'var(--sf-warn)' }}>
              <AlertTriangle className="h-3 w-3" />
              유사 후보 확인 {ambiguousCompany.length + ambiguousProduct.length}건
            </span>
          )}
          {newCompany.length + newProduct.length > 0 && (
            <span className="flex items-center gap-1 rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-info-bg)', color: 'var(--sf-info)' }}>
              <Plus className="h-3 w-3" />
              신규 등록 대기 {newCompany.length + newProduct.length}건
            </span>
          )}
          {result.warnings.length > 0 && (
            <span className="rounded px-2 py-1 font-medium" style={{ background: 'var(--sf-warn-bg)', color: 'var(--sf-warn)' }}>
              누락 행 {result.warnings.length}건
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {ambiguousCompany.length === 0 && ambiguousProduct.length === 0
              && newCompany.length === 0 && newProduct.length === 0 && (
            <div className="rounded border border-[var(--line)] bg-[var(--sf-pos-bg)] p-3 text-[12px]" style={{ color: 'var(--sf-pos)' }}>
              <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
              모든 행이 자동 매핑되었습니다. 다음 단계의 표준 검증으로 진행하세요.
            </div>
          )}

          {ambiguousCompany.length > 0 && (
            <FuzzySection
              title={`회사 유사 후보 (${ambiguousCompany.length}건)`}
              metas={ambiguousCompany}
              busy={busy}
              kind="company"
              onResolve={resolveCompanyFuzzy as (n: number, c: unknown | null) => Promise<void>}
            />
          )}

          {ambiguousProduct.length > 0 && (
            <FuzzySection
              title={`품번 유사 후보 (${ambiguousProduct.length}건)`}
              metas={ambiguousProduct}
              busy={busy}
              kind="product"
              onResolve={resolveProductFuzzy as (n: number, c: unknown | null) => Promise<void>}
            />
          )}

          {(newCompany.length > 0 || newProduct.length > 0) && (
            <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-3">
              <div className="mb-2 text-sm font-semibold">신규 등록 대기</div>
              {newCompany.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs text-[var(--ink-3)] mb-1">회사 {new Set(newCompany.map((m) => m.rawCompanyText)).size}건</div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(newCompany.map((m) => m.rawCompanyText))).map((t) => (
                      <span key={t} className="sf-pill ghost text-[11px]">{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {newProduct.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs text-[var(--ink-3)] mb-1">품번 {new Set(newProduct.map((m) => m.rawProductCode)).size}건</div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(newProduct.map((m) => m.rawProductCode))).map((c) => (
                      <span key={c} className="sf-pill ghost text-[11px] font-mono">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              <Button size="sm" onClick={autoRegisterAllNew} disabled={busy} className="mt-1">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                일괄 자동 등록
              </Button>
              <p className="mt-1.5 text-[10px] text-[var(--ink-3)]">
                품번 자동 등록은 prefix 룰(TSM/LR/JKM/RSM)로 제조사·wattage 추론. 추론 실패 시 마스터 화면에서 사후 보정 필요.
              </p>
            </div>
          )}

          {result.warnings.length > 0 && (
            <details className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-3 text-[12px]">
              <summary className="cursor-pointer font-medium">필수 누락 행 ({result.warnings.length}건)</summary>
              <ul className="mt-2 space-y-1 font-mono">
                {result.warnings.slice(0, 20).map((w, i) => (
                  <li key={i} className="text-[var(--ink-2)]">• {w}</li>
                ))}
                {result.warnings.length > 20 && (
                  <li className="text-[var(--ink-3)]">... 그 외 {result.warnings.length - 20}건</li>
                )}
              </ul>
            </details>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>취소</Button>
          <Button type="button" onClick={onProceed} disabled={busy || !canProceed || result.rows.length === 0}>
            {targetLabel} 검증으로 진행
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────
// 헬퍼: 매칭 해결 결과를 result 에 일괄 반영
// ─────────────────────────────────────────────────────

function applyCompanyResolution(
  result: ConvertResult,
  rawText: string,
  canonical: CompanyLite,
): ConvertResult {
  const newRows = result.rows.slice();
  const newMeta = result.meta.map((m) => {
    if (m.rawCompanyText === rawText) {
      const idx = m.rowNumber - 1;
      newRows[idx] = {
        ...newRows[idx],
        data: { ...newRows[idx].data, company_code: canonical.company_code },
      };
      return {
        ...m,
        company: { level: 'exact' as const, matched: canonical, normalizedKey: m.company.normalizedKey },
      };
    }
    return m;
  });
  return { ...result, rows: newRows, meta: newMeta };
}

function applyProductResolution(
  result: ConvertResult,
  rawCode: string,
  canonical: ProductLite,
): ConvertResult {
  const newRows = result.rows.slice();
  const newMeta = result.meta.map((m) => {
    if (m.rawProductCode === rawCode) {
      const idx = m.rowNumber - 1;
      newRows[idx] = {
        ...newRows[idx],
        data: { ...newRows[idx].data, product_code: canonical.product_code },
      };
      return {
        ...m,
        product: { level: 'exact' as const, matched: canonical, normalizedKey: m.product.normalizedKey },
      };
    }
    return m;
  });
  return { ...result, rows: newRows, meta: newMeta };
}

// ─────────────────────────────────────────────────────
// 모호 후보 섹션 — 같은 raw 텍스트끼리 묶어 한 번에 결정
// ─────────────────────────────────────────────────────

interface FuzzyProps<T> {
  title: string;
  metas: RowMatchMeta[];
  busy: boolean;
  kind: 'company' | 'product';
  onResolve: (rowNum: number, candidate: T | null) => Promise<void>;
}

function FuzzySection<T extends CompanyLite | ProductLite>({
  title, metas, busy, kind, onResolve,
}: FuzzyProps<T>) {
  // raw 텍스트별로 묶어 한 번만 보여줌 (한 번 결정하면 모든 행에 적용됨)
  const grouped = new Map<string, RowMatchMeta>();
  for (const m of metas) {
    const k = kind === 'company' ? m.rawCompanyText : m.rawProductCode;
    if (!grouped.has(k)) grouped.set(k, m);
  }

  return (
    <div className="rounded border border-[var(--line)] bg-[var(--bg-2)] p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {Array.from(grouped.values()).map((m) => {
          const raw = kind === 'company' ? m.rawCompanyText : m.rawProductCode;
          const candidates = (kind === 'company' ? m.company.candidates : m.product.candidates) as T[];
          return (
            <div key={raw} className="flex flex-wrap items-center gap-2 rounded border border-[var(--line)] bg-[var(--surface)] p-2">
              <span className={cn('text-[12px]', kind === 'product' && 'font-mono')}>
                <span className="text-[var(--ink-3)]">원본:</span>{' '}
                <span className="font-semibold text-[var(--ink)]">{raw}</span>
              </span>
              <span className="text-[var(--ink-3)] text-[11px]">→</span>
              {candidates?.map((c) => {
                const id = kind === 'company' ? (c as CompanyLite).company_id : (c as ProductLite).product_id;
                const label = kind === 'company'
                  ? `${(c as CompanyLite).company_name} (${(c as CompanyLite).company_code})`
                  : (c as ProductLite).product_code;
                return (
                  <Button
                    key={id}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={busy}
                    onClick={() => onResolve(m.rowNumber, c)}
                  >
                    {label} 동일
                  </Button>
                );
              })}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={busy}
                onClick={() => onResolve(m.rowNumber, null)}
              >
                <Plus className="h-3 w-3" /> 신규 등록
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
