// 엑셀 양식 8종 생성 (Step 29A)
// 비유: 양식 공장 — 각 업무별 빈 양식지를 만들어 드롭다운까지 미리 설정
// ExcelJS는 반드시 dynamic import (지적 1 반영)

import type { TemplateType, MasterDataForExcel, FieldDef } from '@/types/excel';
import {
  TEMPLATE_LABEL, COMPANY_FIELDS, INBOUND_FIELDS, OUTBOUND_FIELDS, SALE_FIELDS,
  DECLARATION_FIELDS, DECLARATION_COST_FIELDS, EXPENSE_FIELDS,
  ORDER_FIELDS, RECEIPT_FIELDS,
} from '@/types/excel';
import { INBOUND_TYPE_LABEL, USAGE_CATEGORIES } from '@/types/inbound';
import { EXPENSE_TYPE_LABEL } from '@/types/customs';
import { RECEIPT_METHOD_LABEL, MANAGEMENT_CATEGORY_LABEL, FULFILLMENT_SOURCE_LABEL } from '@/types/orders';

// ExcelJS 워크시트의 최소 인터페이스 (셀/컬럼 setter)
interface WritableCell {
  value: unknown;
  font?: unknown;
  fill?: unknown;
  border?: unknown;
  dataValidation?: unknown;
  alignment?: unknown;
  note?: unknown;
  numFmt?: string;
  protection?: unknown;
}
interface WritableColumn {
  width?: number;
  numFmt?: string;
  alignment?: unknown;
}
interface WritableRow {
  height?: number;
  font?: unknown;
  fill?: unknown;
  alignment?: unknown;
}
interface SheetWritable {
  views?: unknown[];
  autoFilter?: unknown;
  properties?: { tabColor?: { argb?: string } };
  getCell(addr: string | number, col?: number): WritableCell;
  getColumn(idx: number): WritableColumn;
  getRow(row: number): WritableRow;
  protect?(password: string, options?: unknown): Promise<void>;
}
interface WorkbookWritable {
  creator?: string;
  created?: Date;
  modified?: Date;
  addWorksheet(name: string, options?: unknown): SheetWritable;
}

const UNIFIED_TEMPLATE_ORDER: TemplateType[] = [
  'company',
  'order',
  'outbound',
  'sale',
  'receipt',
  'inbound',
  'declaration',
  'expense',
];

const MAX_TEMPLATE_ROWS = 1000;
const SHEET_PROTECTION_PASSWORD = 'solarflow';
const SHEET_PROTECTION_OPTIONS = {
  selectLockedCells: true,
  selectUnlockedCells: true,
  formatCells: false,
  formatColumns: false,
  formatRows: false,
  insertColumns: false,
  insertRows: true,
  deleteColumns: false,
  deleteRows: true,
  sort: true,
  autoFilter: true,
  spinCount: 500,
};
const HEADER_BORDER = {
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};
const CODE_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
const REQUIRED_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } };
const OPTIONAL_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
const GUIDE_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
const GUIDE_SUBHEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2F1' } };
const EXAMPLE_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };

const POSITIVE_NUMBER_FIELDS = new Set([
  'quantity', 'amount', 'exchange_rate', 'unit_price_wp',
  'unit_price_usd_wp', 'unit_price_krw_wp', 'invoice_amount_usd',
  'cif_total_krw', 'fob_unit_usd', 'fob_total_usd', 'fob_wp_krw',
  'cif_unit_usd', 'cif_total_usd', 'tariff_amount', 'vat_amount',
  'vat', 'customs_fee', 'incidental_cost', 'deposit_rate', 'spare_qty',
]);

const FIELD_HELP: Record<string, string> = {
  bl_number: '같은 B/L No.로 여러 품목을 입력하면 하나의 입고로 묶입니다.',
  inbound_type: '그룹 입고는 "그룹내구매"를 선택하세요.',
  company_name: '시스템에서 표시할 법인명을 입력하세요.',
  company_code: '법인 등록 시에는 새 고유 코드를 입력하고, 운영 데이터에서는 코드표의 법인코드를 선택하세요.',
  business_number: '사업자번호는 선택 입력입니다.',
  manufacturer_name: '코드표의 제조사명을 선택하세요.',
  currency: 'USD 또는 KRW만 사용합니다.',
  exchange_rate: 'KRW 입고는 비워둘 수 있습니다. USD 입고는 적용 환율을 숫자로 입력하세요.',
  product_code: '코드표의 품번코드를 선택하세요.',
  quantity: '쉼표 없이 숫자만 입력하세요.',
  item_type: '본품 또는 스페어를 선택하세요.',
  payment_type: '유상 또는 무상을 선택하세요.',
  usage_category: '출고/입고 목적을 코드표에서 선택하세요.',
  outbound_id: '매출로 연결할 출고 건을 목록에서 선택하세요.',
  customer_name: '코드표의 거래처명을 선택하세요.',
  tax_invoice_email: '여러 메일은 쉼표로 구분하세요.',
  group_trade: '그룹거래면 Y, 아니면 N을 입력합니다.',
  target_company_code: '그룹거래일 때 상대 법인코드를 선택하세요.',
  declaration_number: '면장등록과 원가등록을 연결하는 기준값입니다.',
  month: '부대비용을 B/L 없이 월 단위로 넣을 때 YYYY-MM 형식으로 입력하세요.',
  expense_type: '비용 유형은 코드표에서 선택하세요.',
  receipt_method: '수주 접수 경로를 코드표에서 선택하세요.',
  management_category: '수주 관리구분을 코드표에서 선택하세요.',
  fulfillment_source: '실재고 또는 미착품 중 충당 기준을 선택하세요.',
};

const TYPE_GUIDE: Record<TemplateType, string> = {
  company: '법인명과 법인코드를 먼저 등록하면 다른 업무 양식에서 법인코드를 선택할 수 있습니다.',
  order: '수주 입력 후 출고, 매출, 수금으로 이어집니다.',
  outbound: '수주번호를 넣으면 수주와 연결되고, 그룹거래는 상대법인코드를 함께 입력합니다.',
  sale: '출고 선택값을 고르면 출고 수량과 제품 정보로 매출 금액이 계산됩니다.',
  receipt: '거래처별 입금 내역을 넣고 이후 미수금 매칭에 사용합니다.',
  inbound: 'B/L No.가 같은 행은 한 입고 건으로 묶입니다. 그룹 입고는 입고유형에서 그룹내구매를 고릅니다.',
  declaration: '면장등록의 면장번호와 원가등록의 면장번호(참조)가 같아야 원가가 연결됩니다.',
  expense: 'B/L No. 또는 월(YYYY-MM) 중 하나는 반드시 입력합니다.',
};

interface CodeColumnRef {
  colLetter: string;
  lastRow: number;
  count: number;
  nextCol: number;
}

function setWorkbookMeta(workbook: WorkbookWritable) {
  workbook.creator = 'SolarFlow';
  const now = new Date();
  workbook.created = now;
  workbook.modified = now;
}

function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function setTabColor(sheet: SheetWritable, argb: string) {
  sheet.properties = { ...(sheet.properties ?? {}), tabColor: { argb } };
}

async function protectSheet(sheet: SheetWritable) {
  if (!sheet.protect) return;
  await sheet.protect(SHEET_PROTECTION_PASSWORD, SHEET_PROTECTION_OPTIONS);
}

function codeFormula(codeRef: string, ref: CodeColumnRef): string | null {
  if (ref.count === 0) return null;
  return `${codeRef}!$${ref.colLetter}$2:$${ref.colLetter}$${ref.lastRow}`;
}

// 드롭다운 범위 설정 헬퍼
function setDropdown(
  sheet: SheetWritable,
  col: string,
  formula: string,
  required = false,
  maxRow = MAX_TEMPLATE_ROWS,
) {
  for (let r = 2; r <= maxRow; r++) {
    sheet.getCell(`${col}${r}`).dataValidation = {
      type: 'list',
      allowBlank: !required,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: '유효하지 않은 값',
      error: '코드표의 목록에서 선택해주세요.',
      showInputMessage: true,
      promptTitle: '선택값',
      prompt: '셀 오른쪽의 목록에서 값을 선택하세요.',
    };
  }
}

function setDropdownFromRef(
  sheet: SheetWritable,
  col: string,
  codeRef: string,
  ref: CodeColumnRef,
  required = false,
) {
  const formula = codeFormula(codeRef, ref);
  if (formula) setDropdown(sheet, col, formula, required);
}

// 코드표 시트에 목록 작성 → 시작 열 인덱스 반환
function writeCodeColumn(
  codeSheet: SheetWritable,
  colIndex: number,
  header: string,
  values: string[],
  descriptions: string[] = [],
): CodeColumnRef {
  const colLetter = columnLetter(colIndex);
  codeSheet.getCell(`${colLetter}1`).value = header;
  codeSheet.getCell(`${colLetter}1`).font = { bold: true, color: { argb: 'FF075985' } };
  codeSheet.getCell(`${colLetter}1`).fill = CODE_HEADER_FILL;
  codeSheet.getCell(`${colLetter}1`).border = HEADER_BORDER;
  codeSheet.getCell(`${colLetter}1`).alignment = { horizontal: 'center', vertical: 'middle' };
  values.forEach((v, i) => {
    codeSheet.getCell(`${colLetter}${i + 2}`).value = v;
  });
  if (values.length === 0) {
    const emptyCell = codeSheet.getCell(`${colLetter}2`);
    emptyCell.value = '등록된 값 없음';
    emptyCell.font = { italic: true, color: { argb: 'FF94A3B8' } };
  }
  codeSheet.getColumn(colIndex).width = Math.max(16, Math.min(36, header.length + 12));

  let nextCol = colIndex + 1;
  if (descriptions.length > 0) {
    const descColLetter = columnLetter(nextCol);
    const descHeader = `${header} 설명`;
    codeSheet.getCell(`${descColLetter}1`).value = descHeader;
    codeSheet.getCell(`${descColLetter}1`).font = { bold: true, color: { argb: 'FF334155' } };
    codeSheet.getCell(`${descColLetter}1`).fill = OPTIONAL_HEADER_FILL;
    codeSheet.getCell(`${descColLetter}1`).border = HEADER_BORDER;
    codeSheet.getCell(`${descColLetter}1`).alignment = { horizontal: 'center', vertical: 'middle' };
    descriptions.forEach((desc, i) => {
      codeSheet.getCell(`${descColLetter}${i + 2}`).value = desc;
    });
    codeSheet.getColumn(nextCol).width = 28;
    nextCol += 1;
  }

  return {
    colLetter,
    lastRow: Math.max(values.length + 1, 2),
    count: values.length,
    nextCol,
  };
}

function finishCodeSheet(codeSheet: SheetWritable, lastCol: number) {
  if (lastCol <= 0) return;
  codeSheet.views = [{ state: 'frozen', ySplit: 1 }];
  codeSheet.autoFilter = `A1:${columnLetter(lastCol)}1`;
  setTabColor(codeSheet, 'FF94A3B8');
  codeSheet.getRow(1).height = 24;
}

function columnWidth(field: FieldDef): number {
  if (field.key.includes('memo') || field.key.includes('address')) return 34;
  if (field.key.includes('email')) return 30;
  if (field.key.includes('outbound_id')) return 48;
  if (field.key.includes('number') || field.key.includes('code')) return 20;
  if (field.type === 'date') return 14;
  if (field.type === 'number') return 16;
  return Math.max(16, Math.min(26, field.label.length + 10));
}

function columnFormat(field: FieldDef): string | undefined {
  if (field.type === 'date') return 'yyyy-mm-dd';
  if (field.type !== 'number') return undefined;
  if (field.key.includes('rate') || field.key.includes('price') || field.key.includes('wp')) return '#,##0.00';
  return '#,##0';
}

function fieldNote(field: FieldDef): string {
  const basics = [
    field.required ? '필수 입력' : '선택 입력',
    field.type === 'date' ? '날짜는 YYYY-MM-DD 형식' : '',
    field.type === 'number' ? '숫자는 쉼표 없이 입력' : '',
    FIELD_HELP[field.key] ?? '',
  ].filter(Boolean);
  return basics.join('\n');
}

function applyColumnInputHints(sheet: SheetWritable, fields: FieldDef[]) {
  fields.forEach((field, i) => {
    if (field.type !== 'number') return;
    const col = columnLetter(i + 1);
    const positive = POSITIVE_NUMBER_FIELDS.has(field.key);
    for (let r = 2; r <= MAX_TEMPLATE_ROWS; r++) {
      sheet.getCell(`${col}${r}`).dataValidation = {
        type: 'decimal',
        operator: positive ? 'greaterThan' : 'greaterThanOrEqual',
        formulae: [0],
        allowBlank: !field.required,
        showErrorMessage: true,
        errorTitle: '숫자 입력 확인',
        error: positive ? '0보다 큰 숫자를 입력해주세요.' : '0 이상의 숫자를 입력해주세요.',
        showInputMessage: true,
        promptTitle: '숫자 입력',
        prompt: positive ? '0보다 큰 숫자를 입력하세요.' : '숫자를 입력하세요.',
      };
    }
  });
}

function unlockEntryCells(sheet: SheetWritable, fields: FieldDef[]) {
  for (let col = 1; col <= fields.length; col++) {
    const colLetter = columnLetter(col);
    for (let row = 2; row <= MAX_TEMPLATE_ROWS; row++) {
      sheet.getCell(`${colLetter}${row}`).protection = { locked: false };
    }
  }
}

// 헤더 스타일 설정
function styleHeaders(sheet: SheetWritable, fields: FieldDef[]) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = `A1:${columnLetter(fields.length)}1`;
  setTabColor(sheet, 'FF2563EB');
  sheet.getRow(1).height = 28;
  fields.forEach((f, i) => {
    const cell = sheet.getCell(1, i + 1);
    cell.value = f.required ? `${f.label}*` : f.label;
    cell.font = {
      bold: true,
      color: f.required ? { argb: 'FFB91C1C' } : { argb: 'FF334155' },
    };
    cell.fill = f.required ? REQUIRED_HEADER_FILL : OPTIONAL_HEADER_FILL;
    cell.border = HEADER_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.note = fieldNote(f);
  });
  fields.forEach((field, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = columnWidth(field);
    col.numFmt = columnFormat(field);
    col.alignment = { vertical: 'middle', wrapText: false };
  });
  applyColumnInputHints(sheet, fields);
  unlockEntryCells(sheet, fields);
}

function writeGuideRow(sheet: SheetWritable, row: number, values: unknown[]) {
  values.forEach((value, i) => {
    const cell = sheet.getCell(row, i + 1);
    cell.value = value;
    cell.alignment = { vertical: 'top', wrapText: true };
  });
}

function addGuideSheet(workbook: WorkbookWritable, types: TemplateType[]): SheetWritable {
  const sheet = workbook.addWorksheet('작성안내');
  setTabColor(sheet, 'FF0F766E');
  sheet.views = [{ state: 'frozen', ySplit: 4 }];
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 42;
  sheet.getColumn(3).width = 44;
  sheet.getColumn(4).width = 26;

  writeGuideRow(sheet, 1, ['SolarFlow 엑셀 입력 안내', '', '', '']);
  const title = sheet.getCell('A1');
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  title.fill = GUIDE_HEADER_FILL;

  writeGuideRow(sheet, 3, ['구분', '작성 방법', '확인할 것', '비고']);
  for (let c = 1; c <= 4; c++) {
    const cell = sheet.getCell(3, c);
    cell.font = { bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = GUIDE_SUBHEADER_FILL;
    cell.border = HEADER_BORDER;
  }

  const guideRows = [
    ['필수값', '붉은색 헤더와 * 표시는 필수 입력입니다.', '빈 값이면 업로드 미리보기에서 오류가 납니다.', ''],
    ['선택값', '셀에 목록 버튼이 보이면 코드표에서 선택합니다.', '시트 이름은 바꾸지 마세요.', ''],
    ['날짜', '날짜는 YYYY-MM-DD 형식으로 입력합니다.', '예: 2026-05-03', '월 단위 비용은 YYYY-MM'],
    ['숫자', '수량, 금액, 단가는 숫자만 입력합니다.', '쉼표는 넣지 않아도 됩니다.', ''],
    ['보호', '등록 시트의 헤더(1행)만 잠금. 데이터·코드표·안내는 자유롭게 편집 가능합니다.', '컬럼 순서를 바꾸거나 작업용 컬럼을 추가해도 헤더 이름으로 매칭합니다.', ''],
    ['업로드', '업로드 시 헤더 이름으로 컬럼을 자동 매칭하고 미리보기 검증을 거칩니다.', '필수 헤더가 빠지면 명확한 오류로 안내합니다.', ''],
  ];
  guideRows.forEach((row, i) => {
    writeGuideRow(sheet, 4 + i, row);
  });

  const start = 11;
  writeGuideRow(sheet, start, ['시트', '작성 포인트', '흐름', '']);
  for (let c = 1; c <= 3; c++) {
    const cell = sheet.getCell(start, c);
    cell.font = { bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = GUIDE_SUBHEADER_FILL;
    cell.border = HEADER_BORDER;
  }
  types.forEach((type, i) => {
    writeGuideRow(sheet, start + i + 1, [
      TEMPLATE_LABEL[type],
      TYPE_GUIDE[type],
      type === 'declaration' ? '입고 -> 면장/원가' : '수주 -> 출고 -> 매출 -> 수금 / 입고 -> 면장 -> 부대비용',
      '',
    ]);
  });
  return sheet;
}

function firstCustomerName(masterData: MasterDataForExcel): string {
  return masterData.partners.find((p) => p.partner_type === 'customer' || p.partner_type === 'both')?.partner_name
    ?? '거래처명 선택';
}

function firstOutboundLabel(masterData: MasterDataForExcel): string {
  const outbound = masterData.outbounds?.[0];
  if (!outbound) return '출고 목록에서 선택';
  return `${outbound.outbound_id} | ${outbound.outbound_date} | ${outbound.quantity}장 | ${outbound.site_name ?? ''}`;
}

function exampleValue(field: FieldDef, masterData: MasterDataForExcel, type?: TemplateType): unknown {
  if (type === 'company' && field.key === 'company_code') return 'NEWCO';

  const examples: Record<string, unknown> = {
    bl_number: 'BL-2026-001',
    inbound_type: '그룹내구매',
    company_name: '탑솔라',
    company_code: masterData.companies[0]?.company_code ?? '법인코드 선택',
    business_number: '000-00-00000',
    manufacturer_name: masterData.manufacturers[0]?.name_kr ?? '제조사 선택',
    currency: 'KRW',
    exchange_rate: 1350,
    etd: '2026-05-03',
    eta: '2026-05-10',
    actual_arrival: '2026-05-11',
    port: '부산항',
    forwarder: '포워더명',
    warehouse_code: masterData.warehouses[0]?.warehouse_code ?? '창고코드 선택',
    invoice_number: 'INV-2026-001',
    memo: '특이사항 입력',
    product_code: masterData.products[0]?.product_code ?? '품번코드 선택',
    quantity: 100,
    item_type: '본품',
    payment_type: '유상',
    invoice_amount_usd: 25000,
    unit_price_usd_wp: 0.09,
    unit_price_krw_wp: 120,
    usage_category: '상품판매',
    line_memo: '라인별 메모',
    outbound_date: '2026-05-12',
    order_number: 'SO-2026-001',
    site_name: '○○ 태양광 현장',
    site_address: '서울시 중구 예시로 1',
    spare_qty: 2,
    group_trade: 'N',
    target_company_code: masterData.companies[1]?.company_code ?? '상대법인코드 선택',
    erp_outbound_no: 'ERP-OUT-001',
    outbound_id: firstOutboundLabel(masterData),
    customer_name: firstCustomerName(masterData),
    unit_price_wp: 145,
    tax_invoice_date: '2026-05-15',
    tax_invoice_email: 'account@example.com',
    erp_closed: 'N',
    erp_closed_date: '2026-05-31',
    declaration_number: 'DEC-2026-001',
    declaration_date: '2026-05-13',
    arrival_date: '2026-05-11',
    release_date: '2026-05-14',
    hs_code: '8541.43',
    customs_office: '부산세관',
    fob_unit_usd: 0.08,
    fob_total_usd: 22000,
    fob_wp_krw: 108,
    cif_total_krw: 32000000,
    cif_unit_usd: 0.1,
    cif_total_usd: 24000,
    tariff_rate: 0,
    tariff_amount: 0,
    vat_amount: 3200000,
    customs_fee: 150000,
    incidental_cost: 200000,
    month: '2026-05',
    expense_type: '통관수수료',
    amount: 100000,
    vat: 10000,
    vendor: '거래처명',
    order_date: '2026-05-03',
    receipt_method: '발주서',
    management_category: '상품판매',
    fulfillment_source: '실재고',
    site_contact: '홍길동',
    site_phone: '010-0000-0000',
    payment_terms: '계약금 10%, 잔금 90%',
    deposit_rate: 10,
    delivery_due: '2026-06-10',
    receipt_date: '2026-05-20',
    bank_account: '국민 000000-00-000000',
  };
  return examples[field.key] ?? '';
}

function writeExampleBlock(
  sheet: SheetWritable,
  startRow: number,
  title: string,
  fields: FieldDef[],
  masterData: MasterDataForExcel,
  type?: TemplateType,
): number {
  const titleCell = sheet.getCell(startRow, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: 'FF92400E' } };
  titleCell.fill = EXAMPLE_HEADER_FILL;
  titleCell.alignment = { vertical: 'middle' };

  const noteCell = sheet.getCell(startRow, 2);
  noteCell.value = '참고 전용입니다. 업로드는 등록 시트에서 진행합니다.';
  noteCell.font = { color: { argb: 'FF64748B' } };
  noteCell.fill = EXAMPLE_HEADER_FILL;

  const headerRow = startRow + 1;
  const valueRow = startRow + 2;
  fields.forEach((field, i) => {
    const col = i + 1;
    const header = sheet.getCell(headerRow, col);
    header.value = field.required ? `${field.label}*` : field.label;
    header.font = {
      bold: true,
      color: field.required ? { argb: 'FFB91C1C' } : { argb: 'FF334155' },
    };
    header.fill = field.required ? REQUIRED_HEADER_FILL : OPTIONAL_HEADER_FILL;
    header.border = HEADER_BORDER;
    header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    header.note = fieldNote(field);

    const value = sheet.getCell(valueRow, col);
    value.value = exampleValue(field, masterData, type);
    value.border = HEADER_BORDER;
    value.alignment = { vertical: 'middle', wrapText: false };
    value.numFmt = columnFormat(field);

    const column = sheet.getColumn(col);
    column.width = Math.max(column.width ?? 0, columnWidth(field));
  });

  sheet.getRow(startRow).height = 22;
  sheet.getRow(headerRow).height = 26;
  return valueRow + 3;
}

function addExampleSheet(
  workbook: WorkbookWritable,
  types: TemplateType[],
  masterData: MasterDataForExcel,
): SheetWritable {
  const sheet = workbook.addWorksheet('작성예시');
  setTabColor(sheet, 'FFF59E0B');
  sheet.views = [{ state: 'frozen', ySplit: 3 }];

  writeGuideRow(sheet, 1, ['작성예시', '이 시트는 참고 전용입니다. 실제 업로드 데이터는 각 등록 시트에 입력하세요.']);
  const title = sheet.getCell('A1');
  title.font = { bold: true, size: 16, color: { argb: 'FF92400E' } };
  title.fill = EXAMPLE_HEADER_FILL;
  sheet.getCell('B1').fill = EXAMPLE_HEADER_FILL;
  sheet.getCell('B1').font = { color: { argb: 'FF64748B' } };

  let row = 4;
  types.forEach((type) => {
    if (type === 'declaration') {
      row = writeExampleBlock(sheet, row, '면장등록 예시', DECLARATION_FIELDS, masterData);
      row = writeExampleBlock(sheet, row, '원가등록 예시', DECLARATION_COST_FIELDS, masterData);
      return;
    }
    row = writeExampleBlock(sheet, row, `${TEMPLATE_LABEL[type]}등록 예시`, getFieldsForType(type), masterData, type);
  });

  return sheet;
}

// 양식 생성 메인 함수
export async function generateTemplate(
  type: TemplateType,
  masterData: MasterDataForExcel,
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const { saveAs } = await import('file-saver');

  const workbook = new ExcelJS.Workbook();
  const label = TEMPLATE_LABEL[type];
  setWorkbookMeta(workbook);
  // 안내·예시·코드표는 잠그지 않는다 — 헤더 이름 매칭(excelParser.ts)으로 업로드가 견고해서
  // 사용자가 자유롭게 수정해도 무방. 잠금은 데이터 시트 헤더 행에만 남긴다.
  addGuideSheet(workbook, [type]);
  addExampleSheet(workbook, [type], masterData);
  await addTemplateSheets(workbook, type, masterData);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(blob, `SolarFlow_${label}_양식_${today}.xlsx`);
}

export async function generateUnifiedTemplate(
  masterData: MasterDataForExcel,
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const { saveAs } = await import('file-saver');

  const workbook = new ExcelJS.Workbook();
  setWorkbookMeta(workbook);
  // 안내·예시·코드표는 잠그지 않는다 — 헤더 이름 매칭으로 업로드가 견고하므로
  // 사용자가 메모를 적거나 코드표를 확장해도 무방.
  addGuideSheet(workbook, UNIFIED_TEMPLATE_ORDER);
  addExampleSheet(workbook, UNIFIED_TEMPLATE_ORDER, masterData);
  // 통합 코드표 — 16개 코드 컬럼을 한 시트에 모아 모든 데이터 시트가 공용 참조한다.
  // (단일 다운로드 generateTemplate은 기존 per-type 코드표 유지)
  const codeSheetName = '코드표';
  const refs = addUnifiedCodeSheet(workbook, codeSheetName, masterData);
  for (const type of UNIFIED_TEMPLATE_ORDER) {
    await addUnifiedDataSheet(workbook, type, refs, codeSheetName);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(blob, `SolarFlow_통합입력양식_${today}.xlsx`);
}

// 통합 코드표 컬럼 참조 모음 — 모든 데이터 시트가 이 객체로 dropdown range를 잡는다.
interface UnifiedCodeRefs {
  company: CodeColumnRef;
  manufacturer: CodeColumnRef;
  product: CodeColumnRef;
  customer: CodeColumnRef;
  warehouse: CodeColumnRef;
  outbound: CodeColumnRef;
  currency: CodeColumnRef;
  inboundType: CodeColumnRef;
  usage: CodeColumnRef;
  itemType: CodeColumnRef;
  payType: CodeColumnRef;
  yn: CodeColumnRef;
  expenseType: CodeColumnRef;
  receiptMethod: CodeColumnRef;
  mgmtCategory: CodeColumnRef;
  fulfillmentSource: CodeColumnRef;
}

// 통합 코드표 시트 1개 생성 — per-type 분할 대신 16개 컬럼을 한 시트에 모은다.
// 마스터 데이터(법인·제조사·품번·거래처·창고·출고선택)가 먼저, 그 뒤 enum 코드.
function addUnifiedCodeSheet(
  workbook: WorkbookWritable,
  sheetName: string,
  masterData: MasterDataForExcel,
): UnifiedCodeRefs {
  const codeSheet = workbook.addWorksheet(sheetName);

  const companyCodes = masterData.companies.map((c) => c.company_code);
  const companyNames = masterData.companies.map((c) => c.company_name);
  const mfgNames = masterData.manufacturers.map((m) => m.name_kr);
  const productCodes = masterData.products.map((p) => p.product_code);
  const productDescriptions = masterData.products.map((p) =>
    [p.product_name, p.spec_wp ? `${p.spec_wp}Wp` : undefined].filter(Boolean).join(' / '),
  );
  const customerPartners = masterData.partners
    .filter((p) => p.partner_type === 'customer' || p.partner_type === 'both');
  const customerNames = customerPartners.map((p) => p.partner_name);
  const customerDescriptions = customerPartners.map((p) => p.partner_type);
  const warehouseCodes = masterData.warehouses.map((w) => w.warehouse_code);
  const warehouseNames = masterData.warehouses.map((w) => w.warehouse_name);
  const outboundLabels = (masterData.outbounds ?? []).map((o) =>
    `${o.outbound_id} | ${o.outbound_date} | ${o.quantity}장 | ${o.site_name ?? ''}`,
  );

  let col = 1;
  const company = writeCodeColumn(codeSheet, col, '법인코드', companyCodes, companyNames);
  col = company.nextCol;
  const manufacturer = writeCodeColumn(codeSheet, col, '제조사', mfgNames);
  col = manufacturer.nextCol;
  const product = writeCodeColumn(codeSheet, col, '품번코드', productCodes, productDescriptions);
  col = product.nextCol;
  const customer = writeCodeColumn(codeSheet, col, '거래처', customerNames, customerDescriptions);
  col = customer.nextCol;
  const warehouse = writeCodeColumn(codeSheet, col, '창고코드', warehouseCodes, warehouseNames);
  col = warehouse.nextCol;
  const outbound = writeCodeColumn(codeSheet, col, '출고 선택', outboundLabels);
  col = outbound.nextCol;
  const currency = writeCodeColumn(codeSheet, col, '통화', ['USD', 'KRW']);
  col = currency.nextCol;
  const inboundType = writeCodeColumn(
    codeSheet, col, '입고유형',
    Object.values(INBOUND_TYPE_LABEL), Object.keys(INBOUND_TYPE_LABEL),
  );
  col = inboundType.nextCol;
  const usage = writeCodeColumn(
    codeSheet, col, '용도',
    Object.values(USAGE_CATEGORIES), Object.keys(USAGE_CATEGORIES),
  );
  col = usage.nextCol;
  const itemType = writeCodeColumn(codeSheet, col, '본품/스페어', ['본품', '스페어'], ['main', 'spare']);
  col = itemType.nextCol;
  const payType = writeCodeColumn(codeSheet, col, '유상/무상', ['유상', '무상'], ['paid', 'free']);
  col = payType.nextCol;
  const yn = writeCodeColumn(codeSheet, col, 'Y/N', ['Y', 'N'], ['예', '아니오']);
  col = yn.nextCol;
  const expenseType = writeCodeColumn(
    codeSheet, col, '비용유형',
    Object.values(EXPENSE_TYPE_LABEL), Object.keys(EXPENSE_TYPE_LABEL),
  );
  col = expenseType.nextCol;
  const receiptMethod = writeCodeColumn(
    codeSheet, col, '접수방법',
    Object.values(RECEIPT_METHOD_LABEL), Object.keys(RECEIPT_METHOD_LABEL),
  );
  col = receiptMethod.nextCol;
  const mgmtCategory = writeCodeColumn(
    codeSheet, col, '관리구분',
    Object.values(MANAGEMENT_CATEGORY_LABEL), Object.keys(MANAGEMENT_CATEGORY_LABEL),
  );
  col = mgmtCategory.nextCol;
  const fulfillmentSource = writeCodeColumn(
    codeSheet, col, '충당소스',
    Object.values(FULFILLMENT_SOURCE_LABEL), Object.keys(FULFILLMENT_SOURCE_LABEL),
  );
  col = fulfillmentSource.nextCol;

  finishCodeSheet(codeSheet, col - 1);

  return {
    company, manufacturer, product, customer, warehouse, outbound,
    currency, inboundType, usage, itemType, payType, yn,
    expenseType, receiptMethod, mgmtCategory, fulfillmentSource,
  };
}

// 통합 양식 전용 데이터 시트 — 코드표는 외부에서 참조 (시트별 코드표 생성 안 함).
async function addUnifiedDataSheet(
  workbook: WorkbookWritable,
  type: TemplateType,
  refs: UnifiedCodeRefs,
  codeSheetName: string,
): Promise<void> {
  const codeRef = `'${codeSheetName}'`;
  const label = TEMPLATE_LABEL[type];

  if (type === 'company') {
    const dataSheet = workbook.addWorksheet('법인등록');
    styleHeaders(dataSheet, COMPANY_FIELDS);
    await protectSheet(dataSheet);
    return;
  }

  if (type === 'declaration') {
    const declSheet = workbook.addWorksheet('면장등록');
    const costSheet = workbook.addWorksheet('원가등록');
    styleHeaders(declSheet, DECLARATION_FIELDS);
    styleHeaders(costSheet, DECLARATION_COST_FIELDS);
    setDropdownFromRef(declSheet, 'C', codeRef, refs.company, true);
    setDropdownFromRef(costSheet, 'B', codeRef, refs.product, true);
    await protectSheet(declSheet);
    await protectSheet(costSheet);
    return;
  }

  const fields = getFieldsForType(type);
  const dataSheet = workbook.addWorksheet(`${label}등록`);
  styleHeaders(dataSheet, fields);

  switch (type) {
    case 'inbound':
      setDropdownFromRef(dataSheet, 'B', codeRef, refs.inboundType, true);
      setDropdownFromRef(dataSheet, 'C', codeRef, refs.company, true);
      setDropdownFromRef(dataSheet, 'D', codeRef, refs.manufacturer, true);
      setDropdownFromRef(dataSheet, 'E', codeRef, refs.currency, true);
      setDropdownFromRef(dataSheet, 'L', codeRef, refs.warehouse);
      setDropdownFromRef(dataSheet, 'O', codeRef, refs.product, true);
      setDropdownFromRef(dataSheet, 'Q', codeRef, refs.itemType, true);
      setDropdownFromRef(dataSheet, 'R', codeRef, refs.payType, true);
      setDropdownFromRef(dataSheet, 'V', codeRef, refs.usage, true);
      break;
    case 'outbound':
      setDropdownFromRef(dataSheet, 'B', codeRef, refs.company, true);
      setDropdownFromRef(dataSheet, 'C', codeRef, refs.product, true);
      setDropdownFromRef(dataSheet, 'E', codeRef, refs.warehouse, true);
      setDropdownFromRef(dataSheet, 'F', codeRef, refs.usage, true);
      setDropdownFromRef(dataSheet, 'K', codeRef, refs.yn);
      // 상대법인코드 — 법인코드와 동일 마스터 참조 (D-039 그룹내거래)
      setDropdownFromRef(dataSheet, 'L', codeRef, refs.company);
      break;
    case 'sale':
      setDropdownFromRef(dataSheet, 'A', codeRef, refs.outbound, true);
      setDropdownFromRef(dataSheet, 'B', codeRef, refs.customer, true);
      setDropdownFromRef(dataSheet, 'F', codeRef, refs.yn);
      break;
    case 'expense':
      setDropdownFromRef(dataSheet, 'C', codeRef, refs.company, true);
      setDropdownFromRef(dataSheet, 'D', codeRef, refs.expenseType, true);
      break;
    case 'order':
      setDropdownFromRef(dataSheet, 'B', codeRef, refs.company, true);
      setDropdownFromRef(dataSheet, 'C', codeRef, refs.customer, true);
      setDropdownFromRef(dataSheet, 'E', codeRef, refs.receiptMethod, true);
      setDropdownFromRef(dataSheet, 'F', codeRef, refs.mgmtCategory, true);
      setDropdownFromRef(dataSheet, 'G', codeRef, refs.fulfillmentSource, true);
      setDropdownFromRef(dataSheet, 'H', codeRef, refs.product, true);
      break;
    case 'receipt':
      setDropdownFromRef(dataSheet, 'A', codeRef, refs.customer, true);
      break;
  }
  await protectSheet(dataSheet);
}

async function addTemplateSheets(
  workbook: WorkbookWritable,
  type: TemplateType,
  masterData: MasterDataForExcel,
  codeSheetName = '코드표',
): Promise<void> {
  const label = TEMPLATE_LABEL[type];
  const codeRef = `'${codeSheetName}'`;

  // 코드표 데이터 준비
  const companyCodes = masterData.companies.map((c) => c.company_code);
  const companyNames = masterData.companies.map((c) => c.company_name);
  const mfgNames = masterData.manufacturers.map((m) => m.name_kr);
  const productCodes = masterData.products.map((p) => p.product_code);
  const productDescriptions = masterData.products.map((p) =>
    [p.product_name, p.spec_wp ? `${p.spec_wp}Wp` : undefined].filter(Boolean).join(' / '),
  );
  const customerPartners = masterData.partners
    .filter((p) => p.partner_type === 'customer' || p.partner_type === 'both');
  const customerNames = customerPartners.map((p) => p.partner_name);
  const customerDescriptions = customerPartners.map((p) => p.partner_type);
  const warehouseCodes = masterData.warehouses.map((w) => w.warehouse_code);
  const warehouseNames = masterData.warehouses.map((w) => w.warehouse_name);
  const inboundTypes = Object.values(INBOUND_TYPE_LABEL);
  const inboundTypeCodes = Object.keys(INBOUND_TYPE_LABEL);
  const usageCategories = Object.values(USAGE_CATEGORIES);
  const usageCategoryCodes = Object.keys(USAGE_CATEGORIES);
  const expenseTypes = Object.values(EXPENSE_TYPE_LABEL);
  const expenseTypeCodes = Object.keys(EXPENSE_TYPE_LABEL);
  const receiptMethods = Object.values(RECEIPT_METHOD_LABEL);
  const receiptMethodCodes = Object.keys(RECEIPT_METHOD_LABEL);
  const mgmtCategories = Object.values(MANAGEMENT_CATEGORY_LABEL);
  const mgmtCategoryCodes = Object.keys(MANAGEMENT_CATEGORY_LABEL);
  const fulfillmentSources = Object.values(FULFILLMENT_SOURCE_LABEL);
  const fulfillmentSourceCodes = Object.keys(FULFILLMENT_SOURCE_LABEL);

  if (type === 'company') {
    const dataSheet = workbook.addWorksheet('법인등록');
    styleHeaders(dataSheet, COMPANY_FIELDS);
    await protectSheet(dataSheet);
    return;
  }

  if (type === 'declaration') {
    // 면장: 시트 3개 (면장등록 + 원가등록 + 코드표)
    const declSheet = workbook.addWorksheet('면장등록');
    const costSheet = workbook.addWorksheet('원가등록');
    const codeSheet = workbook.addWorksheet(codeSheetName);

    styleHeaders(declSheet, DECLARATION_FIELDS);
    styleHeaders(costSheet, DECLARATION_COST_FIELDS);

    // 코드표
    let col = 1;
    const cCo = writeCodeColumn(codeSheet, col, '법인코드', companyCodes, companyNames);
    col = cCo.nextCol;
    const cProd = writeCodeColumn(codeSheet, col, '품번코드', productCodes, productDescriptions);
    col = cProd.nextCol;
    finishCodeSheet(codeSheet, col - 1);

    // 면장등록 드롭다운: C(법인)
    setDropdownFromRef(declSheet, 'C', codeRef, cCo, true);
    // 원가등록 드롭다운: B(품번)
    setDropdownFromRef(costSheet, 'B', codeRef, cProd, true);
    await protectSheet(declSheet);
    await protectSheet(costSheet);
    // 코드표는 잠그지 않는다 (사용자 자유 편집 허용 — 헤더 이름 매칭으로 업로드는 안전)
  } else {
    // 일반 양식: 데이터시트 + 코드표
    const fields = getFieldsForType(type);
    const dataSheet = workbook.addWorksheet(`${label}등록`);
    const codeSheet = workbook.addWorksheet(codeSheetName);

    styleHeaders(dataSheet, fields);

    // 코드표 + 드롭다운 설정
    let col = 1;
    switch (type) {
      case 'inbound': {
        const cType = writeCodeColumn(codeSheet, col, '입고유형', inboundTypes, inboundTypeCodes);
        col = cType.nextCol;
        const cCo = writeCodeColumn(codeSheet, col, '법인코드', companyCodes, companyNames);
        col = cCo.nextCol;
        const cMfg = writeCodeColumn(codeSheet, col, '제조사', mfgNames);
        col = cMfg.nextCol;
        const cCurr = writeCodeColumn(codeSheet, col, '통화', ['USD', 'KRW']);
        col = cCurr.nextCol;
        const cWh = writeCodeColumn(codeSheet, col, '창고코드', warehouseCodes, warehouseNames);
        col = cWh.nextCol;
        const cProd = writeCodeColumn(codeSheet, col, '품번코드', productCodes, productDescriptions);
        col = cProd.nextCol;
        const cItemType = writeCodeColumn(codeSheet, col, '본품/스페어', ['본품', '스페어'], ['main', 'spare']);
        col = cItemType.nextCol;
        const cPayType = writeCodeColumn(codeSheet, col, '유상/무상', ['유상', '무상'], ['paid', 'free']);
        col = cPayType.nextCol;
        const cUsage = writeCodeColumn(codeSheet, col, '용도', usageCategories, usageCategoryCodes);
        col = cUsage.nextCol;
        setDropdownFromRef(dataSheet, 'B', codeRef, cType, true);
        setDropdownFromRef(dataSheet, 'C', codeRef, cCo, true);
        setDropdownFromRef(dataSheet, 'D', codeRef, cMfg, true);
        setDropdownFromRef(dataSheet, 'E', codeRef, cCurr, true);
        setDropdownFromRef(dataSheet, 'L', codeRef, cWh);
        setDropdownFromRef(dataSheet, 'O', codeRef, cProd, true);
        setDropdownFromRef(dataSheet, 'Q', codeRef, cItemType, true);
        setDropdownFromRef(dataSheet, 'R', codeRef, cPayType, true);
        setDropdownFromRef(dataSheet, 'V', codeRef, cUsage, true);
        break;
      }
      case 'outbound': {
        const cCo = writeCodeColumn(codeSheet, col, '법인코드', companyCodes, companyNames);
        col = cCo.nextCol;
        const cProd = writeCodeColumn(codeSheet, col, '품번코드', productCodes, productDescriptions);
        col = cProd.nextCol;
        const cWh = writeCodeColumn(codeSheet, col, '창고코드', warehouseCodes, warehouseNames);
        col = cWh.nextCol;
        const cUsage = writeCodeColumn(codeSheet, col, '용도', usageCategories, usageCategoryCodes);
        col = cUsage.nextCol;
        const cYN = writeCodeColumn(codeSheet, col, 'Y/N', ['Y', 'N'], ['예', '아니오']);
        col = cYN.nextCol;
        const cCo2 = writeCodeColumn(codeSheet, col, '상대법인코드', companyCodes, companyNames);
        col = cCo2.nextCol;
        setDropdownFromRef(dataSheet, 'B', codeRef, cCo, true);
        setDropdownFromRef(dataSheet, 'C', codeRef, cProd, true);
        setDropdownFromRef(dataSheet, 'E', codeRef, cWh, true);
        setDropdownFromRef(dataSheet, 'F', codeRef, cUsage, true);
        setDropdownFromRef(dataSheet, 'K', codeRef, cYN);
        setDropdownFromRef(dataSheet, 'L', codeRef, cCo2);
        break;
      }
      case 'sale': {
        // 지적 1 반영: outbound_id 코드표 + 거래처 + Y/N
        const outboundLabels = (masterData.outbounds ?? []).map((o) =>
          `${o.outbound_id} | ${o.outbound_date} | ${o.quantity}장 | ${o.site_name ?? ''}`,
        );
        const cOb = writeCodeColumn(codeSheet, col, '출고 선택', outboundLabels);
        col = cOb.nextCol;
        const cCust = writeCodeColumn(codeSheet, col, '거래처', customerNames, customerDescriptions);
        col = cCust.nextCol;
        const cYN = writeCodeColumn(codeSheet, col, 'Y/N', ['Y', 'N'], ['예', '아니오']);
        col = cYN.nextCol;
        setDropdownFromRef(dataSheet, 'A', codeRef, cOb, true);
        setDropdownFromRef(dataSheet, 'B', codeRef, cCust, true);
        setDropdownFromRef(dataSheet, 'F', codeRef, cYN);
        break;
      }
      case 'expense': {
        const cCo = writeCodeColumn(codeSheet, col, '법인코드', companyCodes, companyNames);
        col = cCo.nextCol;
        const cExpType = writeCodeColumn(codeSheet, col, '비용유형', expenseTypes, expenseTypeCodes);
        col = cExpType.nextCol;
        setDropdownFromRef(dataSheet, 'C', codeRef, cCo, true);
        setDropdownFromRef(dataSheet, 'D', codeRef, cExpType, true);
        break;
      }
      case 'order': {
        const cCo = writeCodeColumn(codeSheet, col, '법인코드', companyCodes, companyNames);
        col = cCo.nextCol;
        const cCust = writeCodeColumn(codeSheet, col, '거래처', customerNames, customerDescriptions);
        col = cCust.nextCol;
        const cMethod = writeCodeColumn(codeSheet, col, '접수방법', receiptMethods, receiptMethodCodes);
        col = cMethod.nextCol;
        const cMgmt = writeCodeColumn(codeSheet, col, '관리구분', mgmtCategories, mgmtCategoryCodes);
        col = cMgmt.nextCol;
        const cFulfill = writeCodeColumn(codeSheet, col, '충당소스', fulfillmentSources, fulfillmentSourceCodes);
        col = cFulfill.nextCol;
        const cProd = writeCodeColumn(codeSheet, col, '품번코드', productCodes, productDescriptions);
        col = cProd.nextCol;
        setDropdownFromRef(dataSheet, 'B', codeRef, cCo, true);
        setDropdownFromRef(dataSheet, 'C', codeRef, cCust, true);
        setDropdownFromRef(dataSheet, 'E', codeRef, cMethod, true);
        setDropdownFromRef(dataSheet, 'F', codeRef, cMgmt, true);
        setDropdownFromRef(dataSheet, 'G', codeRef, cFulfill, true);
        setDropdownFromRef(dataSheet, 'H', codeRef, cProd, true);
        break;
      }
      case 'receipt': {
        const cCust = writeCodeColumn(codeSheet, col, '거래처', customerNames, customerDescriptions);
        col = cCust.nextCol;
        setDropdownFromRef(dataSheet, 'A', codeRef, cCust, true);
        break;
      }
    }
    finishCodeSheet(codeSheet, col - 1);
    await protectSheet(dataSheet);
    // 코드표는 잠그지 않는다 (헤더 이름 매칭으로 업로드 안전)
  }
}

function getFieldsForType(type: TemplateType): FieldDef[] {
  switch (type) {
    case 'company': return COMPANY_FIELDS;
    case 'inbound': return INBOUND_FIELDS;
    case 'outbound': return OUTBOUND_FIELDS;
    case 'sale': return SALE_FIELDS;
    case 'declaration': return DECLARATION_FIELDS;
    case 'expense': return EXPENSE_FIELDS;
    case 'order': return ORDER_FIELDS;
    case 'receipt': return RECEIPT_FIELDS;
  }
}

// 에러 행만 다운로드
export async function downloadErrorRows(
  rows: import('@/types/excel').ParsedRow[],
  fields: FieldDef[],
  label: string,
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const { saveAs } = await import('file-saver');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('에러 데이터');

  // 헤더 + 에러사유 열
  const headers = fields.map((f) => f.label);
  headers.push('에러 사유');
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

  const errorRows = rows.filter((r) => !r.valid);
  for (const row of errorRows) {
    const values = fields.map((f) => row.data[f.key] ?? '');
    values.push(row.errors.map((e) => `${e.field}: ${e.message}`).join('; '));
    sheet.addRow(values);
  }

  // 열 너비
  for (let i = 1; i <= headers.length; i++) {
    sheet.getColumn(i).width = 18;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(blob, `SolarFlow_${label}_에러_${today}.xlsx`);
}
