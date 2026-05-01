// 엑셀 다운로드/업로드 훅 (Step 29A)
// 비유: 총괄 매니저 — 마스터 데이터 로딩 + 양식 생성 + 파싱 + 검증을 일괄 관리

import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type {
  TemplateType, MasterDataForExcel, ImportPreview, DeclarationImportPreview,
  ImportResult,
} from '@/types/excel';
import { DECLARATION_FIELDS, DECLARATION_COST_FIELDS } from '@/types/excel';

type ActiveRow = Record<string, unknown> & { is_active?: boolean };
type OutboundRow = MasterDataForExcel['outbounds'] extends (infer U)[] | undefined ? U : never;

export function useExcel(type: TemplateType) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [declPreview, setDeclPreview] = useState<DeclarationImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const companies = useAppStore((s) => s.companies);

  // 마스터 데이터 로드 — type별로 outbounds 필요 여부 분기
  const needsOutbounds = type === 'sale';
  const masterQuery = useQuery<{
    manufacturers: ActiveRow[];
    products: ActiveRow[];
    partners: ActiveRow[];
    warehouses: ActiveRow[];
    outbounds: ActiveRow[];
  }, Error>({
    queryKey: ['excel-master', needsOutbounds],
    queryFn: async () => {
      const fetches: Promise<ActiveRow[]>[] = [
        fetchWithAuth<ActiveRow[]>('/api/v1/manufacturers'),
        fetchWithAuth<ActiveRow[]>('/api/v1/products'),
        fetchWithAuth<ActiveRow[]>('/api/v1/partners'),
        fetchWithAuth<ActiveRow[]>('/api/v1/warehouses'),
      ];
      if (needsOutbounds) fetches.push(fetchWithAuth<ActiveRow[]>('/api/v1/outbounds?status=active'));
      const [manufacturers, products, partners, warehouses, outbounds = []] = await Promise.all(fetches);
      return { manufacturers, products, partners, warehouses, outbounds };
    },
    staleTime: 5 * 60_000, // 마스터는 자주 안 바뀜
  });

  const masterData: MasterDataForExcel | null = useMemo(() => {
    if (!masterQuery.data) return null;
    const { manufacturers, products, partners, warehouses, outbounds } = masterQuery.data;
    return {
      companies,
      manufacturers: manufacturers.filter((m) => m.is_active) as MasterDataForExcel['manufacturers'],
      products: products.filter((p) => p.is_active) as MasterDataForExcel['products'],
      partners: partners.filter((p) => p.is_active) as MasterDataForExcel['partners'],
      warehouses: warehouses.filter((w) => w.is_active) as MasterDataForExcel['warehouses'],
      outbounds: (outbounds ?? []) as OutboundRow[],
    };
  }, [masterQuery.data, companies]);

  const masterError = masterQuery.error ? '마스터 데이터 로딩 실패' : null;

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

  // 확정 등록
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
        const validRows = preview.rows.filter((r) => r.valid).map((r) => r.data);
        body = { rows: validRows };
      } else {
        return;
      }

      const result = await fetchWithAuth<ImportResult>(`/api/v1/import/${type === 'sale' ? 'sales' : type === 'declaration' ? 'declarations' : type === 'expense' ? 'expenses' : type === 'order' ? 'orders' : type === 'receipt' ? 'receipts' : type}`, {
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

  const clearImportResult = useCallback(() => {
    setImportResult(null);
  }, []);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setDeclPreview(null);
    setError(null);
  }, []);

  return {
    masterData,
    loading: loading || masterQuery.isLoading,
    error: error ?? masterError,
    preview,
    declPreview,
    importResult,
    downloadTemplate,
    uploadFile,
    downloadErrors,
    clearPreview,
    submitImport,
    clearImportResult,
  };
}
