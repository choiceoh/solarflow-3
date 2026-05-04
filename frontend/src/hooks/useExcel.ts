// 엑셀 다운로드/업로드 훅 (Step 29A)
// 비유: 총괄 매니저 — 마스터 데이터 로딩 + 양식 생성 + 파싱 + 검증을 일괄 관리

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type {
  TemplateType, MasterDataForExcel, ImportPreview, DeclarationImportPreview,
  ImportResult, ParsedRow,
} from '@/types/excel';
import type { Company } from '@/types/masters';
import { DECLARATION_FIELDS, DECLARATION_COST_FIELDS } from '@/types/excel';

function textValue(value: unknown): string {
  return String(value ?? '').trim();
}

function buildCompanyPayload(row: Record<string, unknown>) {
  const businessNumber = textValue(row.business_number);
  return {
    company_name: textValue(row.company_name),
    company_code: textValue(row.company_code),
    ...(businessNumber ? { business_number: businessNumber } : {}),
  };
}

function mergeCreatedCompanies(created: Company[]) {
  if (created.length === 0) return;
  useAppStore.setState((state) => {
    const byId = new Map(state.companies.map((company) => [company.company_id, company]));
    created.forEach((company) => {
      if (company.is_active) byId.set(company.company_id, company);
    });
    return { companies: Array.from(byId.values()), companiesLoaded: true };
  });
}

export function useExcel(type: TemplateType) {
  const [masterData, setMasterData] = useState<MasterDataForExcel | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [declPreview, setDeclPreview] = useState<DeclarationImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const companies = useAppStore((s) => s.companies);

  // 마스터 데이터 로드
  useEffect(() => {
    let cancelled = false;
    type ActiveRow = Record<string, unknown> & { is_active?: boolean };
    type OutboundRow = MasterDataForExcel['outbounds'] extends (infer U)[] | undefined ? U : never;
    type BankRow = MasterDataForExcel['banks'] extends (infer U)[] | undefined ? U : never;
    type POMasterRow = MasterDataForExcel['purchaseOrders'] extends (infer U)[] | undefined ? U : never;
    const fetches: Promise<ActiveRow[]>[] = [
      fetchWithAuth<ActiveRow[]>('/api/v1/manufacturers'),
      fetchWithAuth<ActiveRow[]>('/api/v1/products'),
      fetchWithAuth<ActiveRow[]>('/api/v1/partners'),
      fetchWithAuth<ActiveRow[]>('/api/v1/warehouses'),
    ];
    // 매출 양식: outbound 목록도 필요 (지적 1 반영)
    if (type === 'sale') {
      fetches.push(fetchWithAuth<ActiveRow[]>('/api/v1/outbounds?status=active'));
    }
    // LC 양식: 은행 + 발주번호 코드표 필요. PO 양식: 발주번호 자동 노출은 안 하지만 구조 일관성 유지.
    const needsBanks = type === 'lc';
    const needsPos = type === 'lc';
    if (needsBanks) fetches.push(fetchWithAuth<ActiveRow[]>('/api/v1/banks').catch(() => [] as ActiveRow[]));
    if (needsPos) fetches.push(fetchWithAuth<ActiveRow[]>('/api/v1/pos').catch(() => [] as ActiveRow[]));
    Promise.all(fetches).then((results) => {
      if (cancelled) return;
      const [manufacturers, products, partners, warehouses] = results;
      let cursor = 4;
      const outbounds = type === 'sale' ? results[cursor++] : undefined;
      const banks = needsBanks ? results[cursor++] : undefined;
      const pos = needsPos ? results[cursor++] : undefined;
      setMasterData({
        companies,
        manufacturers: manufacturers.filter((m) => m.is_active) as MasterDataForExcel['manufacturers'],
        products: products.filter((p) => p.is_active) as MasterDataForExcel['products'],
        partners: partners.filter((p) => p.is_active) as MasterDataForExcel['partners'],
        warehouses: warehouses.filter((w) => w.is_active) as MasterDataForExcel['warehouses'],
        outbounds: (outbounds ?? []) as OutboundRow[],
        banks: banks ? (banks.filter((b) => b.is_active !== false) as BankRow[]) : undefined,
        purchaseOrders: pos as POMasterRow[] | undefined,
      });
    }).catch(() => {
      if (!cancelled) setError('마스터 데이터 로딩 실패');
    });
    return () => { cancelled = true; };
  }, [companies, type]);

  // 양식 다운로드
  const downloadTemplate = useCallback(async () => {
    if (!masterData) return;
    setLoading(true);
    try {
      const { generateTemplate } = await import('@/lib/excelTemplates');
      await generateTemplate(type, masterData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '양식 다운로드 실패');
    } finally {
      setLoading(false);
    }
  }, [type, masterData]);

  // 파일 업로드 → 파싱 → 검증
  const uploadFile = useCallback(async (file: File) => {
    if (!masterData) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setDeclPreview(null);
    try {
      const { parseExcelFile } = await import('@/lib/excelParser');
      const result = await parseExcelFile(file, type);

      if (type === 'declaration') {
        const declResult = result as DeclarationImportPreview;
        const { validateDeclaration } = await import('@/lib/excelValidation');
        const validated = validateDeclaration(declResult.declarations, declResult.costs, masterData);
        setDeclPreview({
          fileName: declResult.fileName,
          declarations: validated.declarations,
          costs: validated.costs,
        });
      } else {
        const importResult = result as ImportPreview;
        const { validateRows } = await import('@/lib/excelValidation');
        const validated = validateRows(importResult.rows, type, masterData);
        setPreview({
          fileName: importResult.fileName,
          totalRows: validated.length,
          validRows: validated.filter((r) => r.valid).length,
          errorRows: validated.filter((r) => !r.valid).length,
          rows: validated,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 파싱 실패');
    } finally {
      setLoading(false);
    }
  }, [type, masterData]);

  // 외부 양식 변환기 등에서 ParsedRow[] 를 직접 주입 — 파일 파싱을 건너뛰고 검증부터 시작.
  // 변환 단계는 자기 다이얼로그에서 끝내고, 마스터 매칭(법인·품번·창고 코드 검증)은 기존 파이프라인에 위임한다.
  const injectRows = useCallback(async (rows: ParsedRow[], fileName: string) => {
    if (!masterData) return;
    if (type === 'declaration') {
      setError('면장 양식은 외부 변환 주입을 지원하지 않습니다');
      return;
    }
    setLoading(true);
    setError(null);
    setDeclPreview(null);
    try {
      const { validateRows } = await import('@/lib/excelValidation');
      const validated = validateRows(rows, type, masterData);
      setPreview({
        fileName,
        totalRows: validated.length,
        validRows: validated.filter((r) => r.valid).length,
        errorRows: validated.filter((r) => !r.valid).length,
        rows: validated,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '변환 행 검증 실패');
    } finally {
      setLoading(false);
    }
  }, [type, masterData]);

  // 에러 행 다운로드
  const downloadErrors = useCallback(async () => {
    if (type === 'declaration' && declPreview) {
      const { downloadErrorRows } = await import('@/lib/excelTemplates');
      const errorDecls = declPreview.declarations.filter((r) => !r.valid);
      const errorCosts = declPreview.costs.filter((r) => !r.valid);
      if (errorDecls.length > 0) {
        await downloadErrorRows(errorDecls, DECLARATION_FIELDS, '면장등록_에러');
      }
      if (errorCosts.length > 0) {
        await downloadErrorRows(errorCosts, DECLARATION_COST_FIELDS, '원가등록_에러');
      }
    } else if (preview) {
      const { downloadErrorRows } = await import('@/lib/excelTemplates');
      const { FIELDS_MAP, TEMPLATE_LABEL } = await import('@/types/excel');
      await downloadErrorRows(preview.rows, FIELDS_MAP[type], `${TEMPLATE_LABEL[type]}_에러`);
    }
  }, [type, preview, declPreview]);

  // 확정 등록 (Step 29B)
  // 비유: 검수 완료된 행들을 Go API로 일괄 전송
  const submitImport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let body: unknown;
      if (type === 'declaration' && declPreview) {
        const validDecl = declPreview.declarations.filter((r) => r.valid).map((r) => r.data);
        const validCosts = declPreview.costs.filter((r) => r.valid).map((r) => r.data);
        body = { declarations: validDecl, costs: validCosts };
      } else if (preview) {
        if (type === 'company') {
          const errors: ImportResult['errors'] = [];
          const created: Company[] = [];
          const validRows = preview.rows.filter((r) => r.valid);

          for (const row of validRows) {
            try {
              const company = await fetchWithAuth<Company>('/api/v1/companies', {
                method: 'POST',
                body: JSON.stringify(buildCompanyPayload(row.data)),
              });
              created.push(company);
            } catch (e) {
              errors.push({
                row: row.rowNumber,
                field: '법인',
                message: e instanceof Error ? e.message : '법인 등록 실패',
              });
            }
          }

          mergeCreatedCompanies(created);
          setImportResult({
            success: errors.length === 0,
            imported_count: created.length,
            error_count: errors.length,
            warning_count: 0,
            errors,
            warnings: [],
          });
          setPreview(null);
          setDeclPreview(null);
          return;
        }
        const validRows = preview.rows.filter((r) => r.valid).map((r) => r.data);
        body = { rows: validRows };
      } else {
        return;
      }

      const endpoint =
        type === 'sale' ? 'sales' :
        type === 'declaration' ? 'declarations' :
        type === 'expense' ? 'expenses' :
        type === 'order' ? 'orders' :
        type === 'receipt' ? 'receipts' :
        type === 'purchase_order' ? 'purchase-orders' :
        type === 'lc' ? 'lcs' :
        type;
      const result = await fetchWithAuth<ImportResult>(`/api/v1/import/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setImportResult(result);
      setPreview(null);
      setDeclPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setLoading(false);
    }
  }, [type, preview, declPreview]);

  // Import 결과 초기화
  const clearImportResult = useCallback(() => {
    setImportResult(null);
  }, []);

  // 미리보기 초기화
  const clearPreview = useCallback(() => {
    setPreview(null);
    setDeclPreview(null);
    setError(null);
  }, []);

  return {
    masterData,
    loading,
    error,
    preview,
    declPreview,
    importResult,
    downloadTemplate,
    uploadFile,
    injectRows,
    downloadErrors,
    clearPreview,
    submitImport,
    clearImportResult,
  };
}
