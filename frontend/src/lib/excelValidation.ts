// 엑셀 업로드 검증 7종 (Step 29A)
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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// 허용값 맵 (감리 규칙: map 방식, if-else 나열 금지)
const ALLOWED_VALUES: Record<string, Record<string, boolean>> = {
  inbound_type: Object.fromEntries(
    [...Object.keys(INBOUND_TYPE_LABEL), ...Object.values(INBOUND_TYPE_LABEL)].map((k) => [k, true]),
  ),
  currency: { USD: true, KRW: true },
  item_type: { main: true, spare: true, '본품': true, '스페어': true },
  payment_type: { paid: true, free: true, '유상': true, '무상': true },
  usage_category: Object.fromEntries(
    [...Object.keys(USAGE_CATEGORIES), ...Object.values(USAGE_CATEGORIES)].map((k) => [k, true]),
  ),
  expense_type: Object.fromEntries(
    [...Object.keys(EXPENSE_TYPE_LABEL), ...Object.values(EXPENSE_TYPE_LABEL)].map((k) => [k, true]),
  ),
  receipt_method: Object.fromEntries(
    [...Object.keys(RECEIPT_METHOD_LABEL), ...Object.values(RECEIPT_METHOD_LABEL)].map((k) => [k, true]),
  ),
  management_category: Object.fromEntries(
    [...Object.keys(MANAGEMENT_CATEGORY_LABEL), ...Object.values(MANAGEMENT_CATEGORY_LABEL)].map((k) => [k, true]),
  ),
  fulfillment_source: Object.fromEntries(
    [...Object.keys(FULFILLMENT_SOURCE_LABEL), ...Object.values(FULFILLMENT_SOURCE_LABEL)].map((k) => [k, true]),
  ),
  group_trade: { Y: true, N: true, y: true, n: true },
  erp_closed: { Y: true, N: true, y: true, n: true },
};

// 코드 존재 검증 대상 필드 → 마스터 데이터 키 매핑
const CODE_FIELD_MAP: Record<string, keyof MasterDataForExcel> = {
  company_code: 'companies',
  manufacturer_name: 'manufacturers',
  product_code: 'products',
  customer_name: 'partners',
  warehouse_code: 'warehouses',
  target_company_code: 'companies',
};

// 양수 검증 대상 필드 (감리 규칙: 물리적으로 양수인 필드 <= 0 체크)
const POSITIVE_FIELDS: Record<string, boolean> = {
  quantity: true, amount: true, exchange_rate: true, unit_price_wp: true,
  unit_price_usd_wp: true, unit_price_krw_wp: true, invoice_amount_usd: true,
  cif_total_krw: true, fob_unit_usd: true, fob_total_usd: true, fob_wp_krw: true,
  cif_unit_usd: true, cif_total_usd: true, tariff_amount: true, vat_amount: true,
  vat: true, customs_fee: true, incidental_cost: true, deposit_rate: true,
  spare_qty: true,
};

// 마스터 데이터에서 유효 코드 셋 생성
function buildCodeSet(master: MasterDataForExcel, key: keyof MasterDataForExcel): Set<string> {
  const items = master[key] as any[];
  const set = new Set<string>();
  for (const item of items) {
    // 코드와 이름 모두 허용
    if (item.company_code) set.add(item.company_code);
    if (item.company_name) set.add(item.company_name);
    if (item.name_kr) set.add(item.name_kr);
    if (item.product_code) set.add(item.product_code);
    if (item.product_name) set.add(item.product_name);
    if (item.partner_name) set.add(item.partner_name);
    if (item.warehouse_code) set.add(item.warehouse_code);
    if (item.warehouse_name) set.add(item.warehouse_name);
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

    // 2. 코드 존재 체크
    if (field.key in CODE_FIELD_MAP) {
      const masterKey = CODE_FIELD_MAP[field.key];
      const codeSet = buildCodeSet(master, masterKey);
      if (!codeSet.has(strVal)) {
        const label = field.key === 'manufacturer_name' ? '제조사' :
          field.key === 'customer_name' ? '거래처' :
          field.key === 'product_code' ? '품번' :
          field.key === 'warehouse_code' ? '창고' : '법인';
        errors.push({ field: field.label, message: `존재하지 않는 ${label}입니다` });
      }
    }

    // 3. 양수 체크
    if (field.type === 'number' && field.key in POSITIVE_FIELDS) {
      const n = Number(val);
      if (!isNaN(n) && n <= 0) {
        errors.push({ field: field.label, message: '양수여야 합니다' });
      }
    }

    // 4. 허용값 체크
    if (field.key in ALLOWED_VALUES) {
      if (!ALLOWED_VALUES[field.key][strVal]) {
        errors.push({ field: field.label, message: '허용되지 않는 값입니다' });
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

  // 6. 매출: outbound_id에서 UUID 부분만 추출 (코드표 드롭다운에 "UUID | 날짜 | 수량 | 현장명" 형식)
  if (type === 'sale' && row.data['outbound_id']) {
    const obVal = String(row.data['outbound_id']).trim();
    // 파이프 구분자가 있으면 첫 부분(UUID)만 사용
    if (obVal.includes('|')) {
      row.data['outbound_id'] = obVal.split('|')[0].trim();
    }
  }

  // 7. 부대비용: B/L 또는 월 중 하나는 필수
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

// 전체 검증
export function validateRows(
  rows: ParsedRow[],
  type: TemplateType,
  master: MasterDataForExcel,
  fieldOverride?: FieldDef[],
): ParsedRow[] {
  const fields = fieldOverride ?? FIELDS_MAP[type];
  return rows.map((row) => validateRow(row, fields, master, type));
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
