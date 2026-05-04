// 탑솔라 그룹 모듈 출고현황(카카오톡 공유 양식) → SolarFlow 출고 표준 양식 변환기
//
// 입력: 월별 누적, 섹션 마커(`탑솔라 (1월)` 등)와 헤더 반복 행이 섞인 자유 양식 xlsx
// 출력: SolarFlow OUTBOUND_FIELDS 형식 ParsedRow[] (검증·미리보기 파이프라인에 그대로 주입 가능)
//
// 설계 메모: 변환기는 마스터 매칭(법인·품번·창고)을 하지 않는다.
// → 한글/모델명 그대로 채우고, useExcel.injectRows() → validateRows() 가 마스터와 대조해서 에러 행을 잡아준다.

import type { ParsedRow } from '@/types/excel';

// 탑솔라 그룹 3사 (구분 → 법인코드)
// 실제 SolarFlow 마스터의 company_code 와 일치해야 검증 통과.
// 일치 안 하면 검증 단계에서 잡히므로, 변환기는 한글 라벨을 그대로 채워둔다.
const SELLER_MAP: Record<string, string> = {
  탑: '탑솔라',
  탑솔라: '탑솔라',
  디원: '디원',
  화신: '화신이엔지',
  화신이엔지: '화신이엔지',
};

// 구분 셀에 섞이는 부가 태그 — seller 식별 후 메모로 보존
const GUBUN_TAG_PATTERNS = ['외판', '단가확인', '확정', '차감', '오후착', '오전착', '시착'];

const SECTION_MARKER_RE = /^\s*(탑솔라|디원|화신이엔지)\s*\(/;
const FREE_DATE_RE = /^(\d{1,2})\/(\d{1,2})/;
const SPARE_RE = /SP\s*(\d+)\s*EA/i;
const ORDER_CODE_RE = /^([A-Z]+-\d+(?:-\d+)?)/;

export interface ConvertResult {
  rows: ParsedRow[];
  warnings: string[];
  sourceRowCount: number;
}

interface RawCell {
  value: unknown;
}

interface RawRow {
  cells: RawCell[];
  excelRowNumber: number;
}

// ExcelJS 셀 값 → 문자열·숫자·날짜 정규화
function readCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const v = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
  }
  return value;
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return formatDate(v);
  return String(v).trim();
}

function asInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(v: unknown): { iso: string; note: string } {
  if (v === null || v === undefined || v === '') return { iso: '', note: '' };
  if (v instanceof Date) return { iso: formatDate(v), note: '' };
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { iso: s, note: '' };
  if (FREE_DATE_RE.test(s)) return { iso: '', note: `원본 날짜: ${s}` };
  return { iso: '', note: `원본 날짜: ${s}` };
}

function parseSpare(remarks: string): number | null {
  const m = SPARE_RE.exec(remarks);
  return m ? Number(m[1]) : null;
}

function parseSectionLabel(s: string): string | null {
  const m = SECTION_MARKER_RE.exec(s);
  return m ? m[1] : null;
}

function normalizeSeller(
  gubunCell: string,
  currentSection: string | null,
): { code: string | null; tagNote: string } {
  const raw = gubunCell.trim();
  const tagNote = GUBUN_TAG_PATTERNS.some((t) => raw.includes(t)) ? raw : '';

  // '탑 / 확정', '외판/탑' 같은 슬래시 분리
  const tokens = raw.split(/[/]/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (SELLER_MAP[t]) return { code: SELLER_MAP[t], tagNote };
    for (const k of Object.keys(SELLER_MAP)) {
      if (t.startsWith(k)) return { code: SELLER_MAP[k], tagNote };
    }
  }
  if (currentSection && SELLER_MAP[currentSection]) {
    return { code: SELLER_MAP[currentSection], tagNote };
  }
  return { code: null, tagNote };
}

function isSkipRow(cells: RawCell[]): boolean {
  const g = asString(cells[0]?.value);
  if (g === '구분' || g === '합 계' || g === '합계') return true;
  // 핵심 컬럼이 모두 비면 빈 행
  const empty = [1, 2, 3, 6, 7].every((i) => {
    const v = cells[i]?.value;
    return v === null || v === undefined || v === '';
  });
  return empty;
}

export async function convertTopsolarOutbound(file: File): Promise<ConvertResult> {
  const ExcelJS = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('시트가 비어있습니다');

  const rawRows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    const cells: RawCell[] = [];
    for (let c = 1; c <= 14; c += 1) {
      cells.push({ value: readCell(row.getCell(c).value) });
    }
    rawRows.push({ cells, excelRowNumber: idx });
  });

  const out: ParsedRow[] = [];
  const warnings: string[] = [];
  let currentSection: string | null = null;

  for (const raw of rawRows) {
    const { cells, excelRowNumber } = raw;

    // 섹션 마커 (`탑솔라 (1월)`)
    const sectionLabel = asString(cells[0]?.value);
    const section = parseSectionLabel(sectionLabel);
    if (section) {
      currentSection = section;
      continue;
    }

    if (isSkipRow(cells)) continue;

    const outRowNum = out.length + 1;
    const { code: seller, tagNote } = normalizeSeller(asString(cells[0]?.value), currentSection);
    const { iso: dateIso, note: dateNote } = parseDate(cells[1]?.value);
    const productCode = asString(cells[6]?.value);
    const qty = asInt(cells[7]?.value);

    // 수주번호: col 5에 'BRB-260277-1 차감' 처럼 부가 텍스트가 붙기도 함
    const rawOrder = asString(cells[5]?.value);
    let orderCode = '';
    let orderExtra = '';
    if (rawOrder) {
      const m = ORDER_CODE_RE.exec(rawOrder);
      if (m) {
        orderCode = m[1];
        orderExtra = rawOrder.slice(m[1].length).trim();
      } else {
        orderCode = rawOrder;
      }
    }

    const siteName = asString(cells[3]?.value);
    const siteAddr = asString(cells[4]?.value);
    const remarks = asString(cells[9]?.value);
    const spare = parseSpare(remarks);
    const memoBits = [tagNote, dateNote, orderExtra, remarks].filter(Boolean);
    const memo = memoBits.join(' | ');

    const data: Record<string, unknown> = {
      outbound_date: dateIso,
      company_code: seller ?? '',
      product_code: productCode,
      quantity: qty ?? '',
      warehouse_code: '',
      usage_category: 'sale',
      order_number: orderCode,
      site_name: siteName,
      site_address: siteAddr,
      spare_qty: spare ?? '',
      memo,
    };

    out.push({
      rowNumber: outRowNum,
      data,
      valid: true,
      errors: [],
    });

    const missing: string[] = [];
    if (!seller) missing.push('법인코드');
    if (!dateIso) missing.push('출고일');
    if (!productCode) missing.push('품번');
    if (qty === null) missing.push('수량');
    if (missing.length > 0) {
      warnings.push(
        `엑셀 ${excelRowNumber}행 → 변환 ${outRowNum}행: 필수 누락 [${missing.join(', ')}]`,
      );
    }
  }

  return { rows: out, warnings, sourceRowCount: rawRows.length };
}
