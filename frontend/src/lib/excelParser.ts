// 엑셀 파일 파싱 (Step 29A)
// 비유: 서류 접수 창구 — 제출된 엑셀을 JSON으로 변환
// ExcelJS는 반드시 dynamic import (지적 1 반영)

import type {
  TemplateType, ParsedRow, FieldDef,
  ImportPreview, DeclarationImportPreview,
} from '@/types/excel';
import {
  FIELDS_MAP, DECLARATION_FIELDS, DECLARATION_COST_FIELDS,
} from '@/types/excel';

// 셀 값을 문자열로 변환
function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object' && cell !== null) {
    // ExcelJS RichText 처리
    if ('richText' in (cell as any)) {
      return ((cell as any).richText as any[]).map((r: any) => r.text).join('');
    }
    // ExcelJS Date
    if (cell instanceof Date) {
      return cell.toISOString().slice(0, 10);
    }
    // ExcelJS formula result
    if ('result' in (cell as any)) {
      return String((cell as any).result ?? '');
    }
  }
  return String(cell);
}

// 시트를 ParsedRow[] 로 변환
function parseSheet(sheet: any, fields: FieldDef[]): ParsedRow[] {
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
  const firstSheet = workbook.worksheets[0];
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
