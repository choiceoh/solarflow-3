// 엑셀 파일 파싱 (Step 29A)
// 비유: 서류 접수 창구 — 제출된 엑셀을 JSON으로 변환
// ExcelJS는 반드시 dynamic import (지적 1 반영)

import type {
  TemplateType, ParsedRow, FieldDef,
  ImportPreview, DeclarationImportPreview,
} from '@/types/excel';
import {
  FIELDS_MAP, DECLARATION_FIELDS, DECLARATION_COST_FIELDS, TEMPLATE_LABEL,
} from '@/types/excel';

// ExcelJS 셀 값 형태 (RichText/Formula 등)
type RichTextRun = { text: string };
type RichTextValue = { richText: RichTextRun[] };
type FormulaValue = { result: unknown };

function isRichText(v: object): v is RichTextValue {
  return 'richText' in v && Array.isArray((v as RichTextValue).richText);
}

function isFormulaValue(v: object): v is FormulaValue {
  return 'result' in v;
}

// 셀 값을 문자열로 변환
function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && cell !== null) {
    // ExcelJS RichText 처리
    if (isRichText(cell)) {
      return cell.richText.map((r) => r.text).join('');
    }
    // ExcelJS Date
    if (cell instanceof Date) {
      return cell.toISOString().slice(0, 10);
    }
    // ExcelJS formula result
    if (isFormulaValue(cell)) {
      return String(cell.result ?? '');
    }
  }
  return String(cell);
}

// ExcelJS 워크시트의 최소 인터페이스 (rowCount + getRow.getCell.value)
interface SheetCell { value: unknown }
interface SheetRow { getCell(col: number): SheetCell }
interface SheetLike { rowCount: number; getRow(r: number): SheetRow }

// 시트를 ParsedRow[] 로 변환
function parseSheet(sheet: SheetLike, fields: FieldDef[]): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const rowCount = sheet.rowCount;

  for (let r = 2; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    // 빈 행 건너뛰기
    const hasValue = fields.some((_, i) => {
      const v = row.getCell(i + 1).value;
      return v !== null && v !== undefined && String(v).trim() !== '';
    });
    if (!hasValue) continue;

    const data: Record<string, unknown> = {};
    fields.forEach((f, i) => {
      const raw = row.getCell(i + 1).value;
      if (f.type === 'number') {
        const n = Number(raw);
        data[f.key] = isNaN(n) ? raw : n;
      } else if (f.type === 'date') {
        if (raw instanceof Date) {
          data[f.key] = raw.toISOString().slice(0, 10);
        } else {
          data[f.key] = cellToString(raw);
        }
      } else {
        data[f.key] = cellToString(raw);
      }
    });

    rows.push({ rowNumber: r, data, valid: true, errors: [] });
  }

  return rows;
}

// 일반 양식 파싱
export async function parseExcelFile(
  file: File,
  type: TemplateType,
): Promise<ImportPreview | DeclarationImportPreview> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  // 면장: 2시트 파싱 (지적 2 반영)
  if (type === 'declaration') {
    const declSheet = workbook.getWorksheet('면장등록');
    const costSheet = workbook.getWorksheet('원가등록');

    if (!declSheet || !costSheet) {
      throw new Error('면장 양식에는 "면장등록"과 "원가등록" 시트가 필요합니다');
    }

    const declarations = parseSheet(declSheet, DECLARATION_FIELDS);
    const costs = parseSheet(costSheet, DECLARATION_COST_FIELDS);

    return {
      fileName: file.name,
      declarations,
      costs,
    } satisfies DeclarationImportPreview;
  }

  // 일반 양식
  const fields = FIELDS_MAP[type];
  const expectedSheet = workbook.getWorksheet(`${TEMPLATE_LABEL[type]}등록`);
  const firstSheet = expectedSheet ?? workbook.worksheets[0];
  if (!firstSheet) {
    throw new Error('시트를 찾을 수 없습니다');
  }

  const rows = parseSheet(firstSheet, fields);

  return {
    fileName: file.name,
    totalRows: rows.length,
    validRows: rows.filter((r) => r.valid).length,
    errorRows: rows.filter((r) => !r.valid).length,
    rows,
  } satisfies ImportPreview;
}
