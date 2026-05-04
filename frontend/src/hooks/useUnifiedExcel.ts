// 통합 양식 업로드 훅 — 한 파일에 8섹션이 들어 있는 통합 xlsx를 처리한다.
// 비유: 통합 접수창 — 8개 양식별 창구를 통합한 단일 워크플로.
// 부분 실패 허용: 한 섹션이 실패해도 다음 섹션은 계속 시도한다.

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type {
  TemplateType, MasterDataForExcel, ImportResult,
  UnifiedImportPreview, UnifiedSection,
  UnifiedSubmitOutcome, UnifiedSubmitResult,
} from '@/types/excel';
import type { Company } from '@/types/masters';

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

function endpointForType(type: TemplateType): string {
  switch (type) {
    case 'sale': return 'sales';
    case 'declaration': return 'declarations';
    case 'expense': return 'expenses';
    case 'order': return 'orders';
    case 'receipt': return 'receipts';
    default: return type;
  }
}

function skipped(section: UnifiedSection): UnifiedSubmitOutcome {
  return { type: section.type, label: section.label, status: 'skipped' };
}

// 섹션 1개를 등록한다. 의존 순서는 호출자가 보장한다 (UNIFIED_SECTION_ORDER).
async function submitSection(section: UnifiedSection): Promise<UnifiedSubmitOutcome> {
  if (!section.present || section.parseError) return skipped(section);

  // 면장 + 원가
  if (section.type === 'declaration') {
    if (!section.declPreview) return skipped(section);
    const validDecl = section.declPreview.declarations.filter((r) => r.valid).map((r) => r.data);
    const validCosts = section.declPreview.costs.filter((r) => r.valid).map((r) => r.data);
    if (validDecl.length === 0 && validCosts.length === 0) return skipped(section);
    try {
      const result = await fetchWithAuth<ImportResult>('/api/v1/import/declarations', {
        method: 'POST',
        body: JSON.stringify({ declarations: validDecl, costs: validCosts }),
      });
      return { type: section.type, label: section.label, status: 'success', result };
    } catch (e) {
      return {
        type: section.type, label: section.label, status: 'failed',
        error: e instanceof Error ? e.message : '면장 등록 실패',
      };
    }
  }

  // 법인은 row 하나당 POST 한 번 (useExcel과 동일 패턴)
  if (section.type === 'company') {
    if (!section.preview) return skipped(section);
    const validRows = section.preview.rows.filter((r) => r.valid);
    if (validRows.length === 0) return skipped(section);

    const errors: ImportResult['errors'] = [];
    const created: Company[] = [];
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
    const result: ImportResult = {
      success: errors.length === 0,
      imported_count: created.length,
      error_count: errors.length,
      warning_count: 0,
      errors,
      warnings: [],
    };
    return {
      type: section.type, label: section.label,
      status: created.length === 0 ? 'failed' : 'success',
      result,
      ...(created.length === 0 && errors.length > 0
        ? { error: errors[0].message }
        : {}),
    };
  }

  // 일반 양식 — batch POST
  if (!section.preview) return skipped(section);
  const validRows = section.preview.rows.filter((r) => r.valid).map((r) => r.data);
  if (validRows.length === 0) return skipped(section);

  try {
    const result = await fetchWithAuth<ImportResult>(
      `/api/v1/import/${endpointForType(section.type)}`,
      { method: 'POST', body: JSON.stringify({ rows: validRows }) },
    );
    return { type: section.type, label: section.label, status: 'success', result };
  } catch (e) {
    return {
      type: section.type, label: section.label, status: 'failed',
      error: e instanceof Error ? e.message : '등록 실패',
    };
  }
}

export function useUnifiedExcel() {
  const [masterData, setMasterData] = useState<MasterDataForExcel | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<UnifiedImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<UnifiedSubmitResult | null>(null);
  const companies = useAppStore((s) => s.companies);

  useEffect(() => {
    let cancelled = false;
    type ActiveRow = Record<string, unknown> & { is_active?: boolean };
    type OutboundRow = MasterDataForExcel['outbounds'] extends (infer U)[] | undefined ? U : never;
    const fetches: Promise<ActiveRow[]>[] = [
      fetchWithAuth<ActiveRow[]>('/api/v1/manufacturers'),
      fetchWithAuth<ActiveRow[]>('/api/v1/products'),
      fetchWithAuth<ActiveRow[]>('/api/v1/partners'),
      fetchWithAuth<ActiveRow[]>('/api/v1/warehouses'),
      fetchWithAuth<ActiveRow[]>('/api/v1/outbounds?status=active'),
    ];
    Promise.all(fetches).then(([manufacturers, products, partners, warehouses, outbounds]) => {
      if (cancelled) return;
      setMasterData({
        companies,
        manufacturers: manufacturers.filter((m) => m.is_active) as MasterDataForExcel['manufacturers'],
        products: products.filter((p) => p.is_active) as MasterDataForExcel['products'],
        partners: partners.filter((p) => p.is_active) as MasterDataForExcel['partners'],
        warehouses: warehouses.filter((w) => w.is_active) as MasterDataForExcel['warehouses'],
        outbounds: (outbounds ?? []) as OutboundRow[],
      });
    }).catch(() => {
      if (!cancelled) setError('마스터 데이터 로딩 실패');
    });
    return () => { cancelled = true; };
  }, [companies]);

  // 파일 업로드 → 파싱 + 섹션별 검증.
  const uploadFile = useCallback(async (file: File) => {
    if (!masterData) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setSubmitResult(null);
    try {
      const { parseUnifiedExcelFile } = await import('@/lib/excelParser');
      const { validateRows, validateDeclaration } = await import('@/lib/excelValidation');
      const parsed = await parseUnifiedExcelFile(file);

      const validated = parsed.sections.map((section): UnifiedSection => {
        if (!section.present || section.parseError) return section;

        if (section.type === 'declaration' && section.declPreview) {
          const v = validateDeclaration(
            section.declPreview.declarations,
            section.declPreview.costs,
            masterData,
          );
          return {
            ...section,
            declPreview: {
              ...section.declPreview,
              declarations: v.declarations,
              costs: v.costs,
            },
          };
        }

        if (section.preview) {
          const validatedRows = validateRows(section.preview.rows, section.type, masterData);
          return {
            ...section,
            preview: {
              ...section.preview,
              rows: validatedRows,
              validRows: validatedRows.filter((r) => r.valid).length,
              errorRows: validatedRows.filter((r) => !r.valid).length,
            },
          };
        }
        return section;
      });

      setPreview({ ...parsed, sections: validated });
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일 파싱 실패');
    } finally {
      setLoading(false);
    }
  }, [masterData]);

  // 전체 등록 — 섹션 직렬 처리, 부분 실패 허용.
  const submitAll = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const outcomes: UnifiedSubmitOutcome[] = [];
      for (const section of preview.sections) {
        const outcome = await submitSection(section);
        outcomes.push(outcome);
      }
      setSubmitResult({ outcomes });
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setLoading(false);
    }
  }, [preview]);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setError(null);
  }, []);

  const clearSubmitResult = useCallback(() => {
    setSubmitResult(null);
  }, []);

  return {
    masterData,
    loading,
    error,
    preview,
    submitResult,
    uploadFile,
    submitAll,
    clearPreview,
    clearSubmitResult,
  };
}
