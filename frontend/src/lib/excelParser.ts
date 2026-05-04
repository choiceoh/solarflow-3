// 엑셀 파일 파싱 (Step 29A)
// 비유: 서류 접수 창구 — 제출된 엑셀을 JSON으로 변환
// 헤더 이름 매칭(D-병합로직) — 사용자가 컬럼을 추가/재배치해도 헤더 이름으로 필드 위치를 찾는다.
// ExcelJS는 반드시 dynamic import (지적 1 반영)

import type {
  TemplateType, ParsedRow, FieldDef,
  ImportPreview, DeclarationImportPreview,
  UnifiedImportPreview, UnifiedSection,
} from '@/types/excel';
import {
  FIELDS_MAP, DECLARATION_FIELDS, DECLARATION_COST_FIELDS, TEMPLATE_LABEL,
} from '@/types/excel';

const UNIFIED_SECTION_ORDER: TemplateType[] = [
  'company', 'order', 'outbound', 'sale', 'receipt',
  'inbound', 'declaration', 'expense',
];

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

// 헤더 행에서 "라벨 → 컬럼인덱스" 맵 생성.
// 라벨 끝의 `*` (필수 표시)와 양 끝 공백을 제거해 정규화한다.
// 사용자가 컬럼 위치를 옮기거나, 자기 작업용 컬럼을 추가해도 이름만 일치하면 매칭된다.
function buildHeaderMap(sheet: SheetLike): Map<string, number> {
  const map = new Map<string, number>();
  const headerRow = sheet.getRow(1);
  // 컬럼 수 상한 — FieldDef가 가장 많은 양식이 ~30컬럼이므로 60이면 충분.
  const MAX_COL_PROBE = 60;
  for (let c = 1; c <= MAX_COL_PROBE; c++) {
    const raw = headerRow.getCell(c).value;
    const text = cellToString(raw).trim().replace(/\*$/, '').trim();
    if (text && !map.has(text)) {
      map.set(text, c);
    }
  }
  return map;
}

// 시트를 ParsedRow[]로 변환 — 헤더 이름으로 필드별 컬럼을 해석.
function parseSheet(sheet: SheetLike, fields: FieldDef[]): ParsedRow[] {
  const headerMap = buildHeaderMap(sheet);

  // 각 필드의 실제 컬럼 위치를 헤더 라벨로 해석한다.
  const fieldCols = fields.map((f) => ({
    field: f,
    col: headerMap.get(f.label.trim()),
  }));

  const missingRequired = fieldCols
    .filter((fc) => fc.field.required && fc.col === undefined)
    .map((fc) => fc.field.label);
  if (missingRequired.length > 0) {
    throw new Error(`필수 헤더가 시트에 없습니다: ${missingRequired.join(', ')}`);
  }

  const rows: ParsedRow[] = [];
  const rowCount = sheet.rowCount;

  for (let r = 2; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    // 빈 행 건너뛰기 — 매칭된 컬럼만 본다 (해석 못한 필드는 false 처리).
    const hasValue = fieldCols.some(({ col }) => {
      if (col === undefined) return false;
      const v = row.getCell(col).value;
      return v !== null && v !== undefined && String(v).trim() !== '';
    });
    if (!hasValue) continue;

    const data: Record<string, unknown> = {};
    fieldCols.forEach(({ field, col }) => {
      if (col === undefined) {
        data[field.key] = undefined;
        return;
      }
      const raw = row.getCell(col).value;
      if (field.type === 'number') {
        const n = Number(raw);
        data[field.key] = isNaN(n) ? raw : n;
      } else if (field.type === 'date') {
        if (raw instanceof Date) {
          data[field.key] = raw.toISOString().slice(0, 10);
        } else {
          data[field.key] = cellToString(raw);
        }
      } else {
        data[field.key] = cellToString(raw);
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

// 통합 양식 파싱 — 한 파일에서 8개 섹션을 모두 읽는다.
// 시트가 없는 섹션은 present:false, 헤더 누락 등 파싱 실패는 parseError로 보고한다.
export async function parseUnifiedExcelFile(file: File): Promise<UnifiedImportPreview> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const sections: UnifiedSection[] = UNIFIED_SECTION_ORDER.map((type) => {
    const label = TEMPLATE_LABEL[type];

    if (type === 'declaration') {
      const declSheet = workbook.getWorksheet('면장등록');
      const costSheet = workbook.getWorksheet('원가등록');
      if (!declSheet && !costSheet) {
        return { type, label, present: false };
      }
      try {
        const declarations = declSheet ? parseSheet(declSheet, DECLARATION_FIELDS) : [];
        const costs = costSheet ? parseSheet(costSheet, DECLARATION_COST_FIELDS) : [];
        return {
          type, label, present: true,
          declPreview: { fileName: file.name, declarations, costs },
        };
      } catch (e) {
        return {
          type, label, present: true,
          parseError: e instanceof Error ? e.message : '파싱 실패',
        };
      }
    }

    const sheet = workbook.getWorksheet(`${label}등록`);
    if (!sheet) {
      return { type, label, present: false };
    }
    try {
      const fields = FIELDS_MAP[type];
      const rows = parseSheet(sheet, fields);
      return {
        type, label, present: true,
        preview: {
          fileName: file.name,
          totalRows: rows.length,
          validRows: rows.filter((r) => r.valid).length,
          errorRows: rows.filter((r) => !r.valid).length,
          rows,
        },
      };
    } catch (e) {
      return {
        type, label, present: true,
        parseError: e instanceof Error ? e.message : '파싱 실패',
      };
    }
  });

  return { fileName: file.name, sections };
}
