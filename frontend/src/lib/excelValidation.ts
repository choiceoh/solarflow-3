// 엑셀 업로드 검증 8종 (Step 29A)
// 비유: 검수 라인 — 각 행을 규칙에 맞는지 하나하나 확인

import type {
  TemplateType, ParsedRow, RowError, FieldDef, MasterDataForExcel,
} from '@/types/excel';
import {
  FIELDS_MAP, DECLARATION_FIELDS, DECLARATION_COST_FIELDS,
} from '@/types/excel';
import { INBOUND_TYPE_LABEL, USAGE_CATEGORIES } from '@/types/inbound';
import { EXPENSE_TYPE_LABEL } from '@/types/customs';
import { RECEIPT_METHOD_LABEL, MANAGEMENT_CATEGORY_LABEL, FULFILLMENT_SOURCE_LABEL } from '@/types/orders';
import { CONTRACT_TYPES_ACTIVE } from '@/types/procurement';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function buildNormalizer(
  labels: Record<string, string>,
  extras: Record<string, string> = {},
): Record<string, string> {
  const normalizer: Record<string, string> = {};
  Object.entries(labels).forEach(([key, label]) => {
    normalizer[key] = key;
    normalizer[label] = key;
  });
  Object.entries(extras).forEach(([label, key]) => {
    normalizer[label] = key;
  });
  return normalizer;
}

// 사람이 고르는 한글 표시값을 서버가 받는 코드값으로 정규화한다.
const NORMALIZED_VALUES: Record<string, Record<string, string>> = {
  inbound_type: buildNormalizer(INBOUND_TYPE_LABEL, {
    domestic_foreign: 'domestic_foreign',
    국내유통사: 'domestic_foreign',
  }),
  currency: { USD: 'USD', KRW: 'KRW', usd: 'USD', krw: 'KRW' },
  item_type: { main: 'main', spare: 'spare', 본품: 'main', 스페어: 'spare' },
  payment_type: { paid: 'paid', free: 'free', 유상: 'paid', 무상: 'free' },
  usage_category: buildNormalizer(USAGE_CATEGORIES),
  expense_type: buildNormalizer(EXPENSE_TYPE_LABEL),
  receipt_method: buildNormalizer(RECEIPT_METHOD_LABEL),
  management_category: buildNormalizer(MANAGEMENT_CATEGORY_LABEL),
  fulfillment_source: buildNormalizer(FULFILLMENT_SOURCE_LABEL),
  group_trade: { Y: 'Y', N: 'N', y: 'Y', n: 'N' },
  erp_closed: { Y: 'Y', N: 'N', y: 'Y', n: 'N' },
  // D-055: 출고 워크플로우 체크박스 4개 — 표준 양식 Y/N 입력
  tx_statement_ready: { Y: 'Y', N: 'N', y: 'Y', n: 'N' },
  inspection_request_sent: { Y: 'Y', N: 'N', y: 'Y', n: 'N' },
  approval_requested: { Y: 'Y', N: 'N', y: 'Y', n: 'N' },
  tax_invoice_issued: { Y: 'Y', N: 'N', y: 'Y', n: 'N' },
  // PO 계약유형 — 한글 라벨('스팟','프레임')과 코드값('spot','frame')을 모두 받는다.
  // CONTRACT_TYPES_ACTIVE만 허용 — 레거시(annual 등)는 신규 등록 차단.
  contract_type: Object.fromEntries(
    CONTRACT_TYPES_ACTIVE.flatMap((t) => [
      [t.value, t.value],
      [t.label, t.value],
    ]),
  ),
  // 마스터 — 거래처 유형. PartnerForm 의 PARTNER_TYPE_LABEL 기준.
  partner_type: {
    supplier: 'supplier', customer: 'customer', both: 'both',
    공급사: 'supplier', 고객사: 'customer', '공급+고객': 'both',
  },
  // 마스터 — 창고 유형. WarehouseForm 의 WH_TYPE_LABEL 기준.
  warehouse_type: {
    port: 'port', factory: 'factory', vendor: 'vendor',
    항구: 'port', 공장: 'factory', 업체: 'vendor',
  },
  // 마스터 — 제조사 국내/해외. 코드값 자체가 한글.
  domestic_foreign: { 국내: '국내', 해외: '해외' },
};

// 허용값 맵 (감리 규칙: map 방식, if-else 나열 금지)
const ALLOWED_VALUES: Record<string, Record<string, boolean>> = Object.fromEntries(
  Object.entries(NORMALIZED_VALUES).map(([field, values]) => [
    field,
    Object.fromEntries(Object.keys(values).map((k) => [k, true])),
  ]),
);

function normalizeAllowedValue(field: string, value: string): string {
  return NORMALIZED_VALUES[field]?.[value] ?? value;
}

// 코드 존재 검증 대상 필드 → 마스터 데이터 키 매핑
const CODE_FIELD_MAP: Record<string, keyof MasterDataForExcel> = {
  company_code: 'companies',
  manufacturer_name: 'manufacturers',
  product_code: 'products',
  customer_name: 'partners',
  warehouse_code: 'warehouses',
  target_company_code: 'companies',
  // LC 양식 — 은행 마스터 존재 검증.
  bank_name: 'banks',
};

// 마스터 양식이 직접 생성하는 필드 — 자기 자신을 검증 대상에서 제외.
// 예: 법인 등록의 company_code 는 새로 만드는 값이라 "기존 법인에 없음" 으로 잡으면 안 된다.
const SELF_CREATED_FK_FIELDS: Partial<Record<TemplateType, Set<string>>> = {
  company: new Set(['company_code']),
  product: new Set(['product_code']),
  warehouse: new Set(['warehouse_code']),
  bank: new Set(['bank_name']),
};

// 양수 검증 대상 필드 (감리 규칙: 물리적으로 양수인 필드 <= 0 체크)
const POSITIVE_FIELDS: Record<string, boolean> = {
  quantity: true, amount: true, exchange_rate: true, unit_price_wp: true,
  unit_price_usd_wp: true, unit_price_krw_wp: true, invoice_amount_usd: true,
  cif_total_krw: true, fob_unit_usd: true, fob_total_usd: true, fob_wp_krw: true,
  cif_unit_usd: true, cif_total_usd: true, tariff_amount: true, vat_amount: true,
  vat: true, customs_fee: true, incidental_cost: true, deposit_rate: true,
  spare_qty: true,
  // PO/LC 추가
  amount_usd: true, target_qty: true, usance_days: true,
  // 마스터 추가 — 품번 스펙·치수와 은행 한도, 제조사 표시순위
  spec_wp: true, wattage_kw: true,
  module_width_mm: true, module_height_mm: true, module_depth_mm: true, weight_kg: true,
  lc_limit_usd: true, priority_rank: true,
};

// 마스터 데이터에서 유효 코드 셋 생성
function buildCodeSet(master: MasterDataForExcel, key: keyof MasterDataForExcel): Set<string> {
  const items = (master[key] ?? []) as Array<Record<string, unknown>>;
  const set = new Set<string>();
  const addIfString = (v: unknown) => {
    if (typeof v === 'string' && v) set.add(v);
  };
  for (const item of items) {
    // 코드와 이름 모두 허용
    addIfString(item.company_code);
    addIfString(item.company_name);
    addIfString(item.name_kr);
    addIfString(item.product_code);
    addIfString(item.product_name);
    addIfString(item.partner_name);
    addIfString(item.warehouse_code);
    addIfString(item.warehouse_name);
    addIfString(item.bank_name);
  }
  return set;
}

// 단일 행 검증
function validateRow(
  row: ParsedRow,
  fields: FieldDef[],
  master: MasterDataForExcel,
  type: TemplateType,
): ParsedRow {
  const errors: RowError[] = [];

  for (const field of fields) {
    const val = row.data[field.key];
    const strVal = val === null || val === undefined ? '' : String(val).trim();

    // 1. 필수 체크
    if (field.required && strVal === '') {
      errors.push({ field: field.label, message: '필수 항목입니다' });
      continue;
    }

    if (strVal === '') continue;

    // 2. 코드 존재 체크 — 자기가 생성하는 필드는 제외 (마스터 양식 자기 self-FK 회피).
    if (field.key in CODE_FIELD_MAP && !SELF_CREATED_FK_FIELDS[type]?.has(field.key)) {
      const masterKey = CODE_FIELD_MAP[field.key];
      const codeSet = buildCodeSet(master, masterKey);
      if (!codeSet.has(strVal)) {
        const label = field.key === 'manufacturer_name' ? '제조사' :
          field.key === 'customer_name' ? '거래처' :
          field.key === 'product_code' ? '품번' :
          field.key === 'warehouse_code' ? '창고' :
          field.key === 'bank_name' ? '은행' : '법인';
        errors.push({ field: field.label, message: `존재하지 않는 ${label}입니다` });
      }
    }

    // 3. 숫자/양수 체크
    if (field.type === 'number') {
      const n = Number(val);
      if (Number.isNaN(n)) {
        errors.push({ field: field.label, message: '숫자여야 합니다' });
        continue;
      }
      if (field.key in POSITIVE_FIELDS && n <= 0) {
        errors.push({ field: field.label, message: '양수여야 합니다' });
      }
    }

    // 4. 허용값 체크
    if (field.key in ALLOWED_VALUES) {
      if (!ALLOWED_VALUES[field.key][strVal]) {
        errors.push({ field: field.label, message: '허용되지 않는 값입니다' });
      } else {
        row.data[field.key] = normalizeAllowedValue(field.key, strVal);
      }
    }

    // 5. 날짜 형식 체크
    if (field.type === 'date' && strVal !== '') {
      if (!DATE_PATTERN.test(strVal)) {
        errors.push({ field: field.label, message: '날짜 형식 오류 (YYYY-MM-DD)' });
      }
    }

    // 5-1. 월 형식 체크 (부대비용의 month 필드)
    if (field.key === 'month' && strVal !== '') {
      if (!MONTH_PATTERN.test(strVal)) {
        errors.push({ field: field.label, message: '월 형식 오류 (YYYY-MM)' });
      }
    }
  }

  // 6. 법인 등록: 서버 모델의 길이 제한을 업로드 전에 먼저 보여준다.
  if (type === 'company') {
    const name = String(row.data['company_name'] ?? '').trim();
    const code = String(row.data['company_code'] ?? '').trim();
    if (name.length > 100) {
      errors.push({ field: '법인명', message: '100자를 초과할 수 없습니다' });
    }
    if (code.length > 10) {
      errors.push({ field: '법인코드', message: '10자를 초과할 수 없습니다' });
    }
  }

  // 7. 매출: outbound_id에서 UUID 부분만 추출 (코드표 드롭다운에 "UUID | 날짜 | 수량 | 현장명" 형식)
  if (type === 'sale' && row.data['outbound_id']) {
    const obVal = String(row.data['outbound_id']).trim();
    // 파이프 구분자가 있으면 첫 부분(UUID)만 사용
    if (obVal.includes('|')) {
      row.data['outbound_id'] = obVal.split('|')[0].trim();
    }
  }

  // 8. 부대비용: B/L 또는 월 중 하나는 필수
  if (type === 'expense') {
    const bl = String(row.data['bl_number'] ?? '').trim();
    const month = String(row.data['month'] ?? '').trim();
    if (bl === '' && month === '') {
      errors.push({ field: 'B/L No. / 월', message: 'B/L 또는 월 중 하나는 필수입니다' });
    }
  }

  return {
    ...row,
    valid: errors.length === 0,
    errors,
  };
}

// 마스터 단일키 중복 검증 설정 — 파일 내 / 마스터 기존값 중복 모두 차단.
// bank는 (company_code, bank_name) 복합키라 별도 처리.
const MASTER_DUP_CONFIG: Partial<Record<TemplateType, {
  key: string;
  label: string;
  existing: (m: MasterDataForExcel) => Set<string>;
}>> = {
  company: {
    key: 'company_code', label: '법인코드',
    existing: (m) => new Set(m.companies.map((c) => c.company_code)),
  },
  manufacturer: {
    key: 'name_kr', label: '제조사명(한)',
    existing: (m) => new Set(m.manufacturers.map((mf) => mf.name_kr)),
  },
  product: {
    key: 'product_code', label: '품번코드',
    existing: (m) => new Set(m.products.map((p) => p.product_code)),
  },
  warehouse: {
    key: 'warehouse_code', label: '창고코드',
    existing: (m) => new Set(m.warehouses.map((w) => w.warehouse_code)),
  },
  partner: {
    key: 'partner_name', label: '거래처명',
    existing: (m) => new Set(m.partners.map((p) => p.partner_name)),
  },
};

function applySingleKeyDupCheck(
  rows: ParsedRow[],
  cfg: { key: string; label: string; existing: (m: MasterDataForExcel) => Set<string> },
  master: MasterDataForExcel,
): ParsedRow[] {
  const existing = cfg.existing(master);
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const value = String(row.data[cfg.key] ?? '').trim();
    if (!value) return row;

    const errors = [...row.errors];
    if (existing.has(value)) {
      errors.push({ field: cfg.label, message: `이미 등록된 ${cfg.label}입니다` });
    }
    const firstRow = seen.get(value);
    if (firstRow) {
      errors.push({ field: cfg.label, message: `${firstRow}행과 중복된 ${cfg.label}입니다` });
    } else {
      seen.set(value, row.rowNumber);
    }
    return { ...row, valid: errors.length === 0, errors };
  });
}

// 은행 — (법인코드, 은행명) 복합 중복 검증.
function applyBankDupCheck(rows: ParsedRow[], master: MasterDataForExcel): ParsedRow[] {
  const companyById = new Map(master.companies.map((c) => [c.company_id, c.company_code]));
  const existing = new Set(
    (master.banks ?? []).map((b) => `${companyById.get(b.company_id) ?? ''}|${b.bank_name}`),
  );
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const company = String(row.data['company_code'] ?? '').trim();
    const bank = String(row.data['bank_name'] ?? '').trim();
    if (!company || !bank) return row;

    const compoundKey = `${company}|${bank}`;
    const errors = [...row.errors];
    if (existing.has(compoundKey)) {
      errors.push({ field: '은행', message: '이미 등록된 (법인 × 은행) 조합입니다' });
    }
    const firstRow = seen.get(compoundKey);
    if (firstRow) {
      errors.push({ field: '은행', message: `${firstRow}행과 중복된 (법인 × 은행) 조합입니다` });
    } else {
      seen.set(compoundKey, row.rowNumber);
    }
    return { ...row, valid: errors.length === 0, errors };
  });
}

// 전체 검증
export function validateRows(
  rows: ParsedRow[],
  type: TemplateType,
  master: MasterDataForExcel,
  fieldOverride?: FieldDef[],
): ParsedRow[] {
  const fields = fieldOverride ?? FIELDS_MAP[type];
  const checked = rows.map((row) => validateRow(row, fields, master, type));

  if (type === 'bank') return applyBankDupCheck(checked, master);

  const dupConfig = MASTER_DUP_CONFIG[type];
  if (!dupConfig) return checked;
  return applySingleKeyDupCheck(checked, dupConfig, master);
}

// 면장 검증 (2시트 분리)
export function validateDeclaration(
  declarations: ParsedRow[],
  costs: ParsedRow[],
  master: MasterDataForExcel,
): { declarations: ParsedRow[]; costs: ParsedRow[] } {
  return {
    declarations: declarations.map((row) =>
      validateRow(row, DECLARATION_FIELDS, master, 'declaration'),
    ),
    costs: costs.map((row) =>
      validateRow(row, DECLARATION_COST_FIELDS, master, 'declaration'),
    ),
  };
}
