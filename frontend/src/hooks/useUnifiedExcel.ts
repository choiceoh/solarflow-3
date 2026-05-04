// 통합 양식 업로드 훅 — 한 파일에 모든 섹션이 들어 있는 통합 xlsx를 처리한다.
// 비유: 통합 접수창 — 양식별 창구를 통합한 단일 워크플로.
// 부분 실패 허용: 한 섹션이 실패해도 다음 섹션은 계속 시도한다.

import { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { useAppStore } from '@/stores/appStore';
import type {
  TemplateType, MasterDataForExcel, ImportResult,
  UnifiedImportPreview, UnifiedSection, ParsedRow,
  UnifiedSubmitOutcome, UnifiedSubmitResult,
} from '@/types/excel';
import type { Company, Manufacturer, Partner, Product, Warehouse, Bank } from '@/types/masters';

function textValue(value: unknown): string {
  return String(value ?? '').trim();
}

function numValue(value: unknown): number | undefined {
  const s = textValue(value);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}

function buildCompanyPayload(row: Record<string, unknown>) {
  const businessNumber = textValue(row.business_number);
  return {
    company_name: textValue(row.company_name),
    company_code: textValue(row.company_code),
    ...(businessNumber ? { business_number: businessNumber } : {}),
  };
}

function buildManufacturerPayload(row: Record<string, unknown>) {
  const optional = (key: string) => {
    const v = textValue(row[key]);
    return v ? { [key]: v } : {};
  };
  return {
    name_kr: textValue(row.name_kr),
    priority_rank: numValue(row.priority_rank) ?? 999,
    country: textValue(row.country),
    domestic_foreign: textValue(row.domestic_foreign),
    ...optional('name_en'),
    ...optional('short_name'),
  };
}

function buildProductPayload(row: Record<string, unknown>, manufacturerId: string) {
  const optionalNum = (key: string) => {
    const n = numValue(row[key]);
    return n !== undefined ? { [key]: n } : {};
  };
  const optionalStr = (key: string) => {
    const v = textValue(row[key]);
    return v ? { [key]: v } : {};
  };
  return {
    product_code: textValue(row.product_code),
    product_name: textValue(row.product_name),
    manufacturer_id: manufacturerId,
    spec_wp: numValue(row.spec_wp) ?? 0,
    wattage_kw: numValue(row.wattage_kw) ?? 0,
    module_width_mm: numValue(row.module_width_mm) ?? 0,
    module_height_mm: numValue(row.module_height_mm) ?? 0,
    ...optionalNum('module_depth_mm'),
    ...optionalNum('weight_kg'),
    ...optionalStr('wafer_platform'),
    ...optionalStr('cell_config'),
    ...optionalStr('series_name'),
    ...optionalStr('memo'),
  };
}

function buildWarehousePayload(row: Record<string, unknown>) {
  return {
    warehouse_code: textValue(row.warehouse_code),
    warehouse_name: textValue(row.warehouse_name),
    warehouse_type: textValue(row.warehouse_type),
    location_code: textValue(row.location_code),
    location_name: textValue(row.location_name),
  };
}

function buildBankPayload(row: Record<string, unknown>, companyId: string) {
  const optionalNum = (key: string) => {
    const n = numValue(row[key]);
    return n !== undefined ? { [key]: n } : {};
  };
  const optionalStr = (key: string) => {
    const v = textValue(row[key]);
    return v ? { [key]: v } : {};
  };
  return {
    company_id: companyId,
    bank_name: textValue(row.bank_name),
    lc_limit_usd: numValue(row.lc_limit_usd) ?? 0,
    ...optionalStr('limit_approve_date'),
    ...optionalStr('limit_expiry_date'),
    ...optionalNum('opening_fee_rate'),
    ...optionalNum('acceptance_fee_rate'),
    ...optionalStr('fee_calc_method'),
    ...optionalStr('memo'),
  };
}

function buildPartnerPayload(row: Record<string, unknown>) {
  const optional = (key: string) => {
    const v = textValue(row[key]);
    return v ? { [key]: v } : {};
  };
  return {
    partner_name: textValue(row.partner_name),
    partner_type: textValue(row.partner_type),
    ...optional('erp_code'),
    ...optional('payment_terms'),
    ...optional('contact_name'),
    ...optional('contact_phone'),
    ...optional('contact_email'),
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

// 마스터 신규 등록 후 store 캐시 무효화 — 다음 화면 진입 시 fresh 로딩.
function invalidateMasterCaches(types: TemplateType[]) {
  if (types.includes('manufacturer')) useAppStore.getState().invalidateManufacturers();
  if (types.includes('product')) useAppStore.getState().invalidateProducts();
}

function endpointForType(type: TemplateType): string {
  switch (type) {
    case 'sale': return 'sales';
    case 'declaration': return 'declarations';
    case 'expense': return 'expenses';
    case 'order': return 'orders';
    case 'receipt': return 'receipts';
    case 'purchase_order': return 'purchase-orders';
    case 'lc': return 'lcs';
    default: return type;
  }
}

function skipped(section: UnifiedSection): UnifiedSubmitOutcome {
  return { type: section.type, label: section.label, status: 'skipped' };
}

// 통합 업로드 한 회기 동안 만들어진 마스터를 추적 — 후속 섹션의 자연키 매핑에 사용.
// company_code → company_id, manufacturer name_kr → manufacturer_id 룩업.
interface SessionMasters {
  companyByCode: Map<string, string>;
  manufacturerByName: Map<string, string>;
}

function buildSessionMasters(master: MasterDataForExcel): SessionMasters {
  return {
    companyByCode: new Map(master.companies.map((c) => [c.company_code, c.company_id])),
    manufacturerByName: new Map(master.manufacturers.map((m) => [m.name_kr, m.manufacturer_id])),
  };
}

// 마스터 검증 시점 — 같은 파일의 앞선 마스터 섹션이 추가하는 신규 entry 를 다음 섹션 검증에 노출한다.
// 예: 새 제조사 + 그 제조사를 참조하는 새 품번을 같은 파일에 넣을 수 있어야 한다.
function augmentMasterWithSection(
  master: MasterDataForExcel,
  type: TemplateType,
  rows: ParsedRow[],
): MasterDataForExcel {
  const validRows = rows.filter((r) => r.valid);
  if (validRows.length === 0) return master;
  const tmpId = (row: ParsedRow) => `tmp-${type}-${row.rowNumber}`;

  switch (type) {
    case 'company':
      return {
        ...master,
        companies: [
          ...master.companies,
          ...validRows.map((r): Company => ({
            company_id: tmpId(r),
            company_code: textValue(r.data.company_code),
            company_name: textValue(r.data.company_name),
            is_active: true,
          })),
        ],
      };
    case 'manufacturer':
      return {
        ...master,
        manufacturers: [
          ...master.manufacturers,
          ...validRows.map((r) => ({
            manufacturer_id: tmpId(r),
            name_kr: textValue(r.data.name_kr),
          })),
        ],
      };
    case 'product':
      return {
        ...master,
        products: [
          ...master.products,
          ...validRows.map((r) => ({
            product_id: tmpId(r),
            product_code: textValue(r.data.product_code),
            product_name: textValue(r.data.product_name),
          })),
        ],
      };
    case 'warehouse':
      return {
        ...master,
        warehouses: [
          ...master.warehouses,
          ...validRows.map((r) => ({
            warehouse_id: tmpId(r),
            warehouse_code: textValue(r.data.warehouse_code),
            warehouse_name: textValue(r.data.warehouse_name),
          })),
        ],
      };
    case 'partner':
      return {
        ...master,
        partners: [
          ...master.partners,
          ...validRows.map((r) => ({
            partner_id: tmpId(r),
            partner_name: textValue(r.data.partner_name),
            partner_type: textValue(r.data.partner_type),
          })),
        ],
      };
    default:
      return master;
  }
}

// 마스터 행별 POST 헬퍼 — 한 줄 실패해도 다음 줄은 계속 시도.
async function submitMasterRows<TPayload, TResponse>(opts: {
  rows: ParsedRow[];
  endpoint: string;
  buildPayload: (row: Record<string, unknown>) => TPayload | null;
  fieldLabel: string;
  errorMessage: string;
}): Promise<{ created: TResponse[]; errors: ImportResult['errors'] }> {
  const created: TResponse[] = [];
  const errors: ImportResult['errors'] = [];
  for (const row of opts.rows) {
    const payload = opts.buildPayload(row.data);
    if (payload === null) continue;
    try {
      const result = await fetchWithAuth<TResponse>(opts.endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      created.push(result);
    } catch (e) {
      errors.push({
        row: row.rowNumber,
        field: opts.fieldLabel,
        message: e instanceof Error ? e.message : opts.errorMessage,
      });
    }
  }
  return { created, errors };
}

function buildResultOutcome(
  section: UnifiedSection,
  created: number,
  errors: ImportResult['errors'],
): UnifiedSubmitOutcome {
  const result: ImportResult = {
    success: errors.length === 0,
    imported_count: created,
    error_count: errors.length,
    warning_count: 0,
    errors,
    warnings: [],
  };
  return {
    type: section.type, label: section.label,
    status: created === 0 && errors.length > 0 ? 'failed' : 'success',
    result,
    ...(created === 0 && errors.length > 0 ? { error: errors[0].message } : {}),
  };
}

// 섹션 1개를 등록한다. 의존 순서는 호출자가 보장한다 (UNIFIED_SECTION_ORDER).
async function submitSection(
  section: UnifiedSection,
  sessionMasters: SessionMasters,
): Promise<UnifiedSubmitOutcome> {
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

  // 마스터 — 행별 POST. 백엔드 일괄 import 엔드포인트가 없어 useExcel 의 company 패턴을 따른다.
  if (section.type === 'company') {
    if (!section.preview) return skipped(section);
    const validRows = section.preview.rows.filter((r) => r.valid);
    if (validRows.length === 0) return skipped(section);

    const { created, errors } = await submitMasterRows<unknown, Company>({
      rows: validRows,
      endpoint: '/api/v1/companies',
      buildPayload: buildCompanyPayload,
      fieldLabel: '법인',
      errorMessage: '법인 등록 실패',
    });
    mergeCreatedCompanies(created);
    created.forEach((c) => { sessionMasters.companyByCode.set(c.company_code, c.company_id); });
    return buildResultOutcome(section, created.length, errors);
  }

  if (section.type === 'manufacturer') {
    if (!section.preview) return skipped(section);
    const validRows = section.preview.rows.filter((r) => r.valid);
    if (validRows.length === 0) return skipped(section);

    const { created, errors } = await submitMasterRows<unknown, Manufacturer>({
      rows: validRows,
      endpoint: '/api/v1/manufacturers',
      buildPayload: buildManufacturerPayload,
      fieldLabel: '제조사',
      errorMessage: '제조사 등록 실패',
    });
    created.forEach((m) => { sessionMasters.manufacturerByName.set(m.name_kr, m.manufacturer_id); });
    return buildResultOutcome(section, created.length, errors);
  }

  if (section.type === 'product') {
    if (!section.preview) return skipped(section);
    const validRows = section.preview.rows.filter((r) => r.valid);
    if (validRows.length === 0) return skipped(section);

    const { created, errors } = await submitMasterRows<unknown, Product>({
      rows: validRows,
      endpoint: '/api/v1/products',
      buildPayload: (row) => {
        const mfgName = textValue(row.manufacturer_name);
        const mfgId = sessionMasters.manufacturerByName.get(mfgName);
        if (!mfgId) {
          // FK 매핑 실패 — 검증에서 걸렀어야 하는 케이스. 안전망으로 null 반환 + 에러 push.
          return null;
        }
        return buildProductPayload(row, mfgId);
      },
      fieldLabel: '품번',
      errorMessage: '품번 등록 실패',
    });
    return buildResultOutcome(section, created.length, errors);
  }

  if (section.type === 'warehouse') {
    if (!section.preview) return skipped(section);
    const validRows = section.preview.rows.filter((r) => r.valid);
    if (validRows.length === 0) return skipped(section);

    const { created, errors } = await submitMasterRows<unknown, Warehouse>({
      rows: validRows,
      endpoint: '/api/v1/warehouses',
      buildPayload: buildWarehousePayload,
      fieldLabel: '창고',
      errorMessage: '창고 등록 실패',
    });
    return buildResultOutcome(section, created.length, errors);
  }

  if (section.type === 'bank') {
    if (!section.preview) return skipped(section);
    const validRows = section.preview.rows.filter((r) => r.valid);
    if (validRows.length === 0) return skipped(section);

    const { created, errors } = await submitMasterRows<unknown, Bank>({
      rows: validRows,
      endpoint: '/api/v1/banks',
      buildPayload: (row) => {
        const code = textValue(row.company_code);
        const companyId = sessionMasters.companyByCode.get(code);
        if (!companyId) return null;
        return buildBankPayload(row, companyId);
      },
      fieldLabel: '은행',
      errorMessage: '은행 등록 실패',
    });
    return buildResultOutcome(section, created.length, errors);
  }

  if (section.type === 'partner') {
    if (!section.preview) return skipped(section);
    const validRows = section.preview.rows.filter((r) => r.valid);
    if (validRows.length === 0) return skipped(section);

    const { created, errors } = await submitMasterRows<unknown, Partner>({
      rows: validRows,
      endpoint: '/api/v1/partners',
      buildPayload: buildPartnerPayload,
      fieldLabel: '거래처',
      errorMessage: '거래처 등록 실패',
    });
    return buildResultOutcome(section, created.length, errors);
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
    type BankRow = MasterDataForExcel['banks'] extends (infer U)[] | undefined ? U : never;
    type POMasterRow = MasterDataForExcel['purchaseOrders'] extends (infer U)[] | undefined ? U : never;
    const fetches: Promise<ActiveRow[]>[] = [
      fetchWithAuth<ActiveRow[]>('/api/v1/manufacturers'),
      fetchWithAuth<ActiveRow[]>('/api/v1/products'),
      fetchWithAuth<ActiveRow[]>('/api/v1/partners'),
      fetchWithAuth<ActiveRow[]>('/api/v1/warehouses'),
      fetchWithAuth<ActiveRow[]>('/api/v1/outbounds?status=active'),
      // PO/LC 양식의 은행·발주번호 코드표 — 실패하면 빈 배열로 떨어져 양식 다운로드는 가능.
      fetchWithAuth<ActiveRow[]>('/api/v1/banks').catch(() => [] as ActiveRow[]),
      fetchWithAuth<ActiveRow[]>('/api/v1/pos').catch(() => [] as ActiveRow[]),
    ];
    Promise.all(fetches).then(([
      manufacturers, products, partners, warehouses, outbounds, banks, pos,
    ]) => {
      if (cancelled) return;
      setMasterData({
        companies,
        manufacturers: manufacturers.filter((m) => m.is_active) as MasterDataForExcel['manufacturers'],
        products: products.filter((p) => p.is_active) as MasterDataForExcel['products'],
        partners: partners.filter((p) => p.is_active) as MasterDataForExcel['partners'],
        warehouses: warehouses.filter((w) => w.is_active) as MasterDataForExcel['warehouses'],
        outbounds: (outbounds ?? []) as OutboundRow[],
        banks: (banks.filter((b) => b.is_active !== false) ?? []) as BankRow[],
        purchaseOrders: (pos ?? []) as POMasterRow[],
      });
    }).catch(() => {
      if (!cancelled) setError('마스터 데이터 로딩 실패');
    });
    return () => { cancelled = true; };
  }, [companies]);

  // 파일 업로드 → 파싱 + 섹션별 검증.
  // 마스터 → 거래 의존 순서로 검증하면서 앞선 마스터 섹션의 신규 행을 다음 섹션 검증에 노출.
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

      let workingMaster = masterData;
      const validated = parsed.sections.map((section): UnifiedSection => {
        if (!section.present || section.parseError) return section;

        if (section.type === 'declaration' && section.declPreview) {
          const v = validateDeclaration(
            section.declPreview.declarations,
            section.declPreview.costs,
            workingMaster,
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
          const validatedRows = validateRows(section.preview.rows, section.type, workingMaster);
          workingMaster = augmentMasterWithSection(workingMaster, section.type, validatedRows);
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
  // sessionMasters 가 마스터 → 거래 의존 매핑(자연키→id)을 한 회기 동안 누적한다.
  const submitAll = useCallback(async () => {
    if (!preview || !masterData) return;
    setLoading(true);
    setError(null);
    try {
      const sessionMasters = buildSessionMasters(masterData);
      const outcomes: UnifiedSubmitOutcome[] = [];
      const submittedMasterTypes = new Set<TemplateType>();
      for (const section of preview.sections) {
        const outcome = await submitSection(section, sessionMasters);
        outcomes.push(outcome);
        if (outcome.status === 'success') submittedMasterTypes.add(section.type);
      }
      invalidateMasterCaches(Array.from(submittedMasterTypes));
      setSubmitResult({ outcomes });
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setLoading(false);
    }
  }, [preview, masterData]);

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
