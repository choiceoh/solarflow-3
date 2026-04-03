// 엑셀 양식 7종 생성 (Step 29A)
// 비유: 양식 공장 — 각 업무별 빈 양식지를 만들어 드롭다운까지 미리 설정
// ExcelJS는 반드시 dynamic import (지적 1 반영)

import type { TemplateType, MasterDataForExcel, FieldDef } from '@/types/excel';
import {
  TEMPLATE_LABEL, INBOUND_FIELDS, OUTBOUND_FIELDS, SALE_FIELDS,
  DECLARATION_FIELDS, DECLARATION_COST_FIELDS, EXPENSE_FIELDS,
  ORDER_FIELDS, RECEIPT_FIELDS,
} from '@/types/excel';
import { INBOUND_TYPE_LABEL, USAGE_CATEGORIES } from '@/types/inbound';
import { EXPENSE_TYPE_LABEL } from '@/types/customs';
import { RECEIPT_METHOD_LABEL, MANAGEMENT_CATEGORY_LABEL, FULFILLMENT_SOURCE_LABEL } from '@/types/orders';

// 드롭다운 범위 설정 헬퍼
function setDropdown(
  sheet: any,
  col: string,
  formula: string,
  maxRow = 1000,
) {
  for (let r = 2; r <= maxRow; r++) {
    sheet.getCell(`${col}${r}`).dataValidation = {
      type: 'list',
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: '유효하지 않은 값',
      error: '코드표에서 선택해주세요',
    };
  }
}

// 코드표 시트에 목록 작성 → 시작 열 인덱스 반환
function writeCodeColumn(
  codeSheet: any,
  colIndex: number,
  header: string,
  values: string[],
): { colLetter: string; lastRow: number } {
  const colLetter = String.fromCharCode(64 + colIndex);
  codeSheet.getCell(`${colLetter}1`).value = header;
  codeSheet.getCell(`${colLetter}1`).font = { bold: true };
  values.forEach((v, i) => {
    codeSheet.getCell(`${colLetter}${i + 2}`).value = v;
  });
  return { colLetter, lastRow: values.length + 1 };
}

// 헤더 스타일 설정
function styleHeaders(sheet: any, fields: FieldDef[]) {
  fields.forEach((f, i) => {
    const cell = sheet.getCell(1, i + 1);
    cell.value = f.required ? `${f.label}*` : f.label;
    cell.font = { bold: true, color: f.required ? { argb: 'FFDC2626' } : undefined };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = { bottom: { style: 'thin' } };
  });
  // 열 너비 자동
  fields.forEach((_, i) => {
    sheet.getColumn(i + 1).width = 18;
  });
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

  // 코드표 데이터 준비
  const companyCodes = masterData.companies.map((c) => c.company_code);
  const mfgNames = masterData.manufacturers.map((m) => m.name_kr);
  const productCodes = masterData.products.map((p) => p.product_code);
  const customerNames = masterData.partners
    .filter((p) => p.partner_type === 'customer' || p.partner_type === 'both')
    .map((p) => p.partner_name);
  const warehouseCodes = masterData.warehouses.map((w) => w.warehouse_code);
  const inboundTypes = Object.values(INBOUND_TYPE_LABEL);
  const usageCategories = Object.values(USAGE_CATEGORIES);
  const expenseTypes = Object.values(EXPENSE_TYPE_LABEL);
  const receiptMethods = Object.values(RECEIPT_METHOD_LABEL);
  const mgmtCategories = Object.values(MANAGEMENT_CATEGORY_LABEL);
  const fulfillmentSources = Object.values(FULFILLMENT_SOURCE_LABEL);

  if (type === 'declaration') {
    // 면장: 시트 3개 (면장등록 + 원가등록 + 코드표)
    const declSheet = workbook.addWorksheet('면장등록');
    const costSheet = workbook.addWorksheet('원가등록');
    const codeSheet = workbook.addWorksheet('코드표');

    styleHeaders(declSheet, DECLARATION_FIELDS);
    styleHeaders(costSheet, DECLARATION_COST_FIELDS);

    // 코드표
    let col = 1;
    const cCo = writeCodeColumn(codeSheet, col++, '법인코드', companyCodes);
    const cProd = writeCodeColumn(codeSheet, col++, '품번코드', productCodes);

    // 면장등록 드롭다운: C(법인)
    setDropdown(declSheet, 'C', `'코드표'!$${cCo.colLetter}$2:$${cCo.colLetter}$${cCo.lastRow}`);
    // 원가등록 드롭다운: B(품번)
    setDropdown(costSheet, 'B', `'코드표'!$${cProd.colLetter}$2:$${cProd.colLetter}$${cProd.lastRow}`);
  } else {
    // 일반 양식: 데이터시트 + 코드표
    const fields = getFieldsForType(type);
    const dataSheet = workbook.addWorksheet(`${label}등록`);
    const codeSheet = workbook.addWorksheet('코드표');

    styleHeaders(dataSheet, fields);

    // 코드표 + 드롭다운 설정
    let col = 1;
    switch (type) {
      case 'inbound': {
        const cType = writeCodeColumn(codeSheet, col++, '입고유형', inboundTypes);
        const cCo = writeCodeColumn(codeSheet, col++, '법인코드', companyCodes);
        const cMfg = writeCodeColumn(codeSheet, col++, '제조사', mfgNames);
        const cCurr = writeCodeColumn(codeSheet, col++, '통화', ['USD', 'KRW']);
        const cWh = writeCodeColumn(codeSheet, col++, '창고코드', warehouseCodes);
        const cProd = writeCodeColumn(codeSheet, col++, '품번코드', productCodes);
        const cItemType = writeCodeColumn(codeSheet, col++, '본품/스페어', ['main', 'spare']);
        const cPayType = writeCodeColumn(codeSheet, col++, '유상/무상', ['paid', 'free']);
        const cUsage = writeCodeColumn(codeSheet, col++, '용도', usageCategories);
        setDropdown(dataSheet, 'B', `'코드표'!$${cType.colLetter}$2:$${cType.colLetter}$${cType.lastRow}`);
        setDropdown(dataSheet, 'C', `'코드표'!$${cCo.colLetter}$2:$${cCo.colLetter}$${cCo.lastRow}`);
        setDropdown(dataSheet, 'D', `'코드표'!$${cMfg.colLetter}$2:$${cMfg.colLetter}$${cMfg.lastRow}`);
        setDropdown(dataSheet, 'E', `'코드표'!$${cCurr.colLetter}$2:$${cCurr.colLetter}$${cCurr.lastRow}`);
        setDropdown(dataSheet, 'L', `'코드표'!$${cWh.colLetter}$2:$${cWh.colLetter}$${cWh.lastRow}`);
        setDropdown(dataSheet, 'O', `'코드표'!$${cProd.colLetter}$2:$${cProd.colLetter}$${cProd.lastRow}`);
        setDropdown(dataSheet, 'Q', `'코드표'!$${cItemType.colLetter}$2:$${cItemType.colLetter}$${cItemType.lastRow}`);
        setDropdown(dataSheet, 'R', `'코드표'!$${cPayType.colLetter}$2:$${cPayType.colLetter}$${cPayType.lastRow}`);
        setDropdown(dataSheet, 'V', `'코드표'!$${cUsage.colLetter}$2:$${cUsage.colLetter}$${cUsage.lastRow}`);
        break;
      }
      case 'outbound': {
        const cCo = writeCodeColumn(codeSheet, col++, '법인코드', companyCodes);
        const cProd = writeCodeColumn(codeSheet, col++, '품번코드', productCodes);
        const cWh = writeCodeColumn(codeSheet, col++, '창고코드', warehouseCodes);
        const cUsage = writeCodeColumn(codeSheet, col++, '용도', usageCategories);
        const cYN = writeCodeColumn(codeSheet, col++, 'Y/N', ['Y', 'N']);
        const cCo2 = writeCodeColumn(codeSheet, col++, '상대법인코드', companyCodes);
        setDropdown(dataSheet, 'B', `'코드표'!$${cCo.colLetter}$2:$${cCo.colLetter}$${cCo.lastRow}`);
        setDropdown(dataSheet, 'C', `'코드표'!$${cProd.colLetter}$2:$${cProd.colLetter}$${cProd.lastRow}`);
        setDropdown(dataSheet, 'E', `'코드표'!$${cWh.colLetter}$2:$${cWh.colLetter}$${cWh.lastRow}`);
        setDropdown(dataSheet, 'F', `'코드표'!$${cUsage.colLetter}$2:$${cUsage.colLetter}$${cUsage.lastRow}`);
        setDropdown(dataSheet, 'K', `'코드표'!$${cYN.colLetter}$2:$${cYN.colLetter}$${cYN.lastRow}`);
        setDropdown(dataSheet, 'L', `'코드표'!$${cCo2.colLetter}$2:$${cCo2.colLetter}$${cCo2.lastRow}`);
        break;
      }
      case 'sale': {
        // 지적 1 반영: outbound_id 코드표 + 거래처 + Y/N
        const outboundLabels = (masterData.outbounds ?? []).map((o) =>
          `${o.outbound_id} | ${o.outbound_date} | ${o.quantity}장 | ${o.site_name ?? ''}`,
        );
        const cOb = writeCodeColumn(codeSheet, col++, 'outbound_id', outboundLabels);
        const cCust = writeCodeColumn(codeSheet, col++, '거래처', customerNames);
        const cYN = writeCodeColumn(codeSheet, col++, 'Y/N', ['Y', 'N']);
        setDropdown(dataSheet, 'A', `'코드표'!$${cOb.colLetter}$2:$${cOb.colLetter}$${cOb.lastRow}`);
        setDropdown(dataSheet, 'B', `'코드표'!$${cCust.colLetter}$2:$${cCust.colLetter}$${cCust.lastRow}`);
        setDropdown(dataSheet, 'F', `'코드표'!$${cYN.colLetter}$2:$${cYN.colLetter}$${cYN.lastRow}`);
        break;
      }
      case 'expense': {
        const cCo = writeCodeColumn(codeSheet, col++, '법인코드', companyCodes);
        const cExpType = writeCodeColumn(codeSheet, col++, '비용유형', expenseTypes);
        setDropdown(dataSheet, 'C', `'코드표'!$${cCo.colLetter}$2:$${cCo.colLetter}$${cCo.lastRow}`);
        setDropdown(dataSheet, 'D', `'코드표'!$${cExpType.colLetter}$2:$${cExpType.colLetter}$${cExpType.lastRow}`);
        break;
      }
      case 'order': {
        const cCo = writeCodeColumn(codeSheet, col++, '법인코드', companyCodes);
        const cCust = writeCodeColumn(codeSheet, col++, '거래처', customerNames);
        const cMethod = writeCodeColumn(codeSheet, col++, '접수방법', receiptMethods);
        const cMgmt = writeCodeColumn(codeSheet, col++, '관리구분', mgmtCategories);
        const cFulfill = writeCodeColumn(codeSheet, col++, '충당소스', fulfillmentSources);
        const cProd = writeCodeColumn(codeSheet, col++, '품번코드', productCodes);
        setDropdown(dataSheet, 'B', `'코드표'!$${cCo.colLetter}$2:$${cCo.colLetter}$${cCo.lastRow}`);
        setDropdown(dataSheet, 'C', `'코드표'!$${cCust.colLetter}$2:$${cCust.colLetter}$${cCust.lastRow}`);
        setDropdown(dataSheet, 'E', `'코드표'!$${cMethod.colLetter}$2:$${cMethod.colLetter}$${cMethod.lastRow}`);
        setDropdown(dataSheet, 'F', `'코드표'!$${cMgmt.colLetter}$2:$${cMgmt.colLetter}$${cMgmt.lastRow}`);
        setDropdown(dataSheet, 'G', `'코드표'!$${cFulfill.colLetter}$2:$${cFulfill.colLetter}$${cFulfill.lastRow}`);
        setDropdown(dataSheet, 'H', `'코드표'!$${cProd.colLetter}$2:$${cProd.colLetter}$${cProd.lastRow}`);
        break;
      }
      case 'receipt': {
        const cCust = writeCodeColumn(codeSheet, col++, '거래처', customerNames);
        setDropdown(dataSheet, 'A', `'코드표'!$${cCust.colLetter}$2:$${cCust.colLetter}$${cCust.lastRow}`);
        break;
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(blob, `SolarFlow_${label}_양식_${today}.xlsx`);
}

function getFieldsForType(type: TemplateType): FieldDef[] {
  switch (type) {
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
