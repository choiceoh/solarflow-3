// 탑솔라 그룹 모듈 출고현황(카카오톡 공유 양식) → SolarFlow 출고 표준 양식 변환기.
//
// 정책 (D-055/056):
// - 정보 손실 0: 표준 컬럼에 매핑되지 않은 정보는 source_payload(JSONB) 에 원본 그대로 보존.
// - 워크플로우 4 체크박스: 거래명세서/인수검수요청서/결재요청/계산서발행 → boolean 필드.
// - 자유 형식 날짜(`1/12 오후착`): 섹션 마커 `탑솔라 (1월)` + 같은 섹션의 정상 datetime 행에서
//   연도 추론 → ISO 날짜로 보정. 시간 표기는 source_payload 에 보존.
// - 마스터 매칭은 변환기에서 함: 정확/정규화·alias 일치 = 자동, 유사 후보 = ambiguous,
//   매칭 없음 = autoRegisterNeeded. 자동 등록·alias 학습은 다이얼로그가 처리.

import type { ParsedRow } from '@/types/excel';
import type { CompanyAlias, ProductAlias } from '@/types/aliases';
import type { CompanyMatchResult, ProductMatchResult, CompanyLite, ProductLite } from './matching';
import { findCompanyMatch, findProductMatch } from './matching';

// ──────────────────── 매핑 룰 ────────────────────

const SELLER_MAP: Record<string, string> = {
  탑: '탑솔라',
  탑솔라: '탑솔라',
  디원: '디원',
  화신: '화신이엔지',
  화신이엔지: '화신이엔지',
};

const GUBUN_TAG_PATTERNS = ['외판', '단가확인', '확정', '차감', '오후착', '오전착', '시착', '오후', '오전'];

const SECTION_MARKER_RE = /^\s*(탑솔라|디원|화신이엔지)\s*\((\d{1,2})월\s*\)/;
const FREE_DATE_RE = /^(\d{1,2})\/(\d{1,2})/;
const SPARE_RE = /SP\s*(\d+)\s*EA/i;
const PALLET_RE = /(\d+)\s*매/;
const ORDER_CODE_RE = /^([A-Z]+-\d+(?:-\d+)?)/;

// ──────────────────── 타입 ────────────────────

export interface ResolveContext {
  companies: CompanyLite[];
  products: ProductLite[];
  companyAliases: CompanyAlias[];
  productAliases: ProductAlias[];
}

// 행마다 첨부되는 매칭 메타 (다이얼로그가 사용)
export interface RowMatchMeta {
  rowNumber: number;
  rawCompanyText: string;
  rawProductCode: string;
  company: CompanyMatchResult;
  product: ProductMatchResult;
}

export interface ConvertResult {
  rows: ParsedRow[];
  meta: RowMatchMeta[];
  warnings: string[];
  sourceRowCount: number;
  resolvedFromSection: number;  // 자유 형식 날짜를 섹션 컨텍스트로 보정한 행 수
}

interface RawCell {
  value: unknown;
}

interface RawRow {
  cells: RawCell[];
  excelRowNumber: number;
}

// 섹션 컨텍스트 — 같은 섹션 안에서 정상 datetime 의 연도를 캐시하여 자유 형식 보정.
interface SectionContext {
  sellerKey: string;        // '탑솔라' / '디원' / '화신이엔지'
  monthNum: number;         // 1~12
  inferredYear: number | null;
}

// ──────────────────── 셀 정규화 ────────────────────

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

function asFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// 체크박스 셀: ExcelJS 가 boolean 으로 읽거나 'TRUE'/'FALSE' 문자열로 읽을 수 있음.
function asBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'TRUE' || s === 'Y' || s === '1' || s === 'O' || s === '✓';
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ──────────────────── 파싱 보조 ────────────────────

interface ParsedDate {
  iso: string;
  rawText: string;     // 원본 문자열 (시간 표기 보존용)
  confidence: 'exact' | 'inferred' | 'failed';
}

function parseDate(v: unknown, sectionYear: number | null, sectionMonth: number | null): ParsedDate {
  if (v === null || v === undefined || v === '') {
    return { iso: '', rawText: '', confidence: 'failed' };
  }
  if (v instanceof Date) {
    return { iso: formatDate(v), rawText: v.toISOString(), confidence: 'exact' };
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { iso: s, rawText: s, confidence: 'exact' };
  }
  // 자유 형식: M/D — 섹션 컨텍스트로 보정
  const m = FREE_DATE_RE.exec(s);
  if (m && sectionYear) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const useMonth = sectionMonth ?? month;
      // 섹션 월과 자유 월이 다르면 자유 월 채택 (사용자 표기 신뢰)
      const finalMonth = month === useMonth ? month : month;
      return {
        iso: `${sectionYear}-${String(finalMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        rawText: s,
        confidence: 'inferred',
      };
    }
  }
  return { iso: '', rawText: s, confidence: 'failed' };
}

function parseSpare(remarks: string): { spareQty: number | null; palletCount: number | null } {
  const sp = SPARE_RE.exec(remarks);
  const pallet = PALLET_RE.exec(remarks);
  return {
    spareQty: sp ? Number(sp[1]) : null,
    palletCount: pallet ? Number(pallet[1]) : null,
  };
}

function parseSectionLabel(s: string): { seller: string; month: number } | null {
  const m = SECTION_MARKER_RE.exec(s);
  if (!m) return null;
  return { seller: m[1], month: parseInt(m[2], 10) };
}

function normalizeSeller(
  gubunCell: string,
  currentSection: SectionContext | null,
): { name: string | null; tagNote: string } {
  const raw = gubunCell.trim();
  const tagNote = GUBUN_TAG_PATTERNS.some((t) => raw.includes(t)) ? raw : '';
  const tokens = raw.split(/[/]/).map((t) => t.trim()).filter(Boolean);
  for (const t of tokens) {
    if (SELLER_MAP[t]) return { name: SELLER_MAP[t], tagNote };
    for (const k of Object.keys(SELLER_MAP)) {
      if (t.startsWith(k)) return { name: SELLER_MAP[k], tagNote };
    }
  }
  if (currentSection && SELLER_MAP[currentSection.sellerKey]) {
    return { name: SELLER_MAP[currentSection.sellerKey], tagNote };
  }
  return { name: null, tagNote };
}

function isSkipRow(cells: RawCell[]): boolean {
  const g = asString(cells[0]?.value);
  if (g === '구분' || g === '합 계' || g === '합계') return true;
  const empty = [1, 2, 3, 6, 7].every((i) => {
    const v = cells[i]?.value;
    return v === null || v === undefined || v === '';
  });
  return empty;
}

// ──────────────────── 본 변환기 ────────────────────

export async function convertTopsolarOutbound(
  file: File,
  ctx: ResolveContext,
): Promise<ConvertResult> {
  const ExcelJS = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) throw new Error('시트가 비어있습니다');

  // 18 컬럼 모두 읽기 (col 14-17 워크플로우 체크박스 포함)
  const rawRows: RawRow[] = [];
  ws.eachRow({ includeEmpty: false }, (row, idx) => {
    const cells: RawCell[] = [];
    for (let c = 1; c <= 18; c += 1) {
      cells.push({ value: readCell(row.getCell(c).value) });
    }
    rawRows.push({ cells, excelRowNumber: idx });
  });

  // 1차 패스: 섹션 컨텍스트 캐시 (자유 형식 날짜 보정용)
  // 같은 섹션 안에서 정상 datetime 의 연도를 캐치하여 자유 형식 행에 적용.
  const sectionByKey = new Map<string, SectionContext>();
  let scanSection: { seller: string; month: number } | null = null;
  for (const raw of rawRows) {
    const cell0 = asString(raw.cells[0]?.value);
    const section = parseSectionLabel(cell0);
    if (section) {
      scanSection = section;
      const key = `${section.seller}-${section.month}`;
      if (!sectionByKey.has(key)) {
        sectionByKey.set(key, { sellerKey: section.seller, monthNum: section.month, inferredYear: null });
      }
      continue;
    }
    if (!scanSection) continue;
    if (isSkipRow(raw.cells)) continue;
    const cell1 = raw.cells[1]?.value;
    if (cell1 instanceof Date) {
      const key = `${scanSection.seller}-${scanSection.month}`;
      const ctx2 = sectionByKey.get(key);
      if (ctx2 && ctx2.inferredYear === null) {
        ctx2.inferredYear = cell1.getFullYear();
      }
    }
  }

  // 2차 패스: 행 변환 + 매칭 메타 첨부
  const out: ParsedRow[] = [];
  const meta: RowMatchMeta[] = [];
  const warnings: string[] = [];
  let resolvedFromSection = 0;
  let currentSection: SectionContext | null = null;

  for (const raw of rawRows) {
    const { cells, excelRowNumber } = raw;

    const sectionLabel = asString(cells[0]?.value);
    const section = parseSectionLabel(sectionLabel);
    if (section) {
      const key = `${section.seller}-${section.month}`;
      currentSection = sectionByKey.get(key) ?? {
        sellerKey: section.seller,
        monthNum: section.month,
        inferredYear: null,
      };
      continue;
    }

    if (isSkipRow(cells)) continue;

    const outRowNum = out.length + 1;
    const { name: sellerName, tagNote } = normalizeSeller(asString(cells[0]?.value), currentSection);

    const dateParsed = parseDate(
      cells[1]?.value,
      currentSection?.inferredYear ?? null,
      currentSection?.monthNum ?? null,
    );
    if (dateParsed.confidence === 'inferred') resolvedFromSection += 1;

    const rawCustomer = asString(cells[2]?.value);
    const siteName = asString(cells[3]?.value);
    const siteAddr = asString(cells[4]?.value);
    const rawOrder = asString(cells[5]?.value);
    const productCode = asString(cells[6]?.value);
    const qty = asInt(cells[7]?.value);
    const capacityCell = asFloat(cells[8]?.value);
    const remarks = asString(cells[9]?.value);
    const unitPrice = asFloat(cells[10]?.value);
    const supplyAmount = asFloat(cells[11]?.value);
    const vatAmount = asFloat(cells[12]?.value);
    const totalAmount = asFloat(cells[13]?.value);
    // col 14-17: 워크플로우 체크박스 4개
    const txStatement = asBool(cells[14]?.value);
    const inspectReq = asBool(cells[15]?.value);
    const approvalReq = asBool(cells[16]?.value);
    const taxInvoice = asBool(cells[17]?.value);

    // 수주번호 코드 분리
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

    const { spareQty, palletCount } = parseSpare(remarks);
    const memoBits = [tagNote, orderExtra, remarks].filter(Boolean);
    const memo = memoBits.join(' | ');

    // 매칭
    const companyMatch = findCompanyMatch(sellerName ?? '', ctx.companies, ctx.companyAliases);
    const productMatch = findProductMatch(productCode, ctx.products, ctx.productAliases);

    // exact 매칭이면 코드 채움. 아니면 임시로 raw 텍스트 (다이얼로그가 해결 후 갱신)
    const companyCode = companyMatch.level === 'exact' && companyMatch.matched
      ? companyMatch.matched.company_code
      : (sellerName ?? '');
    const finalProductCode = productMatch.level === 'exact' && productMatch.matched
      ? productMatch.matched.product_code
      : productCode;

    // source_payload — 표준 컬럼에 매핑되지 않거나 부분 손실 가능한 정보 보존
    const sourcePayload: Record<string, unknown> = {
      excel_row: excelRowNumber,
      gubun_raw: asString(cells[0]?.value),
      section_seller: currentSection?.sellerKey ?? null,
      section_month: currentSection?.monthNum ?? null,
      date_raw: dateParsed.rawText,
      date_confidence: dateParsed.confidence,
      customer_name: rawCustomer,
      order_number_raw: rawOrder,
      remarks_raw: remarks,
      pallet_count: palletCount,
      capacity_kw_source: capacityCell,
      // 매출 정보 — 출고에는 안 들어가지만 PR 4 의 매출 동시 등록에서 사용
      unit_price_wp: unitPrice,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
    };

    const data: Record<string, unknown> = {
      outbound_date: dateParsed.iso,
      company_code: companyCode,
      product_code: finalProductCode,
      quantity: qty ?? '',
      warehouse_code: '',
      usage_category: 'sale',
      order_number: orderCode,
      site_name: siteName,
      site_address: siteAddr,
      spare_qty: spareQty ?? '',
      memo,
      // D-055 워크플로우 4종
      tx_statement_ready: txStatement ? 'Y' : 'N',
      inspection_request_sent: inspectReq ? 'Y' : 'N',
      approval_requested: approvalReq ? 'Y' : 'N',
      tax_invoice_issued: taxInvoice ? 'Y' : 'N',
      // D-055 source_payload (객체 그대로 백엔드 jsonb 로 직렬화)
      source_payload: sourcePayload,
    };

    out.push({
      rowNumber: outRowNum,
      data,
      valid: true,
      errors: [],
    });

    meta.push({
      rowNumber: outRowNum,
      rawCompanyText: sellerName ?? asString(cells[0]?.value),
      rawProductCode: productCode,
      company: companyMatch,
      product: productMatch,
    });

    const missing: string[] = [];
    if (!sellerName) missing.push('법인');
    if (!dateParsed.iso) missing.push('출고일');
    if (!productCode) missing.push('품번');
    if (qty === null) missing.push('수량');
    if (missing.length > 0) {
      warnings.push(
        `엑셀 ${excelRowNumber}행 → 변환 ${outRowNum}행: 필수 누락 [${missing.join(', ')}]`,
      );
    }
  }

  return {
    rows: out,
    meta,
    warnings,
    sourceRowCount: rawRows.length,
    resolvedFromSection,
  };
}
