// Phase 4 — Step 3 follow-up: BL 면장 OCR 헬퍼 추출
// 기존 BLForm.tsx 의 ~510줄 OCR 처리 코드 (types + 정규식 + 순수 함수) 를 모듈로 분리.
// 다음 단계: BLOcrWidget 컴포넌트 가 이 헬퍼 + state/UI 를 합쳐 MetaForm contentBlock 에 임베드.
// (BLForm 도 동일 모듈 import 로 DRY)

import type { Product, Manufacturer } from '@/types/masters';

// ── 타입 ────────────────────────────────────────────────────────────────────
export interface OCRFieldCandidate {
  value: string;
  label?: string;
  source_text?: string;
  confidence?: number;
}

export interface CustomsDeclarationOCRLine {
  model_spec?: OCRFieldCandidate;
  quantity?: OCRFieldCandidate;
  unit_price_usd?: OCRFieldCandidate;
  amount_usd?: OCRFieldCandidate;
  payment_type?: OCRFieldCandidate;
}

export interface CustomsDeclarationOCRFields {
  declaration_number?: OCRFieldCandidate;
  declaration_date?: OCRFieldCandidate;
  arrival_date?: OCRFieldCandidate;
  release_date?: OCRFieldCandidate;
  importer?: OCRFieldCandidate;
  forwarder?: OCRFieldCandidate;
  trade_partner?: OCRFieldCandidate;
  exchange_rate?: OCRFieldCandidate;
  cif_amount_krw?: OCRFieldCandidate;
  hs_code?: OCRFieldCandidate;
  customs_office?: OCRFieldCandidate;
  port?: OCRFieldCandidate;
  bl_number?: OCRFieldCandidate;
  invoice_number?: OCRFieldCandidate;
  line_items?: CustomsDeclarationOCRLine[];
}

export interface OCRLine {
  text: string;
  score?: number;
  box?: { x0: number; y0: number; x1: number; y1: number };
}

export interface OCRExtractResponse {
  results: Array<{
    filename: string;
    raw_text?: string;
    lines?: OCRLine[];
    error?: string;
    fields?: { customs_declaration?: CustomsDeclarationOCRFields };
  }>;
}

export const OCR_PRODUCT_NONE = '__ocr_product_none__';

type OCRZone = { x0: number; y0: number; x1: number; y1: number };

// ── 정규식 ──────────────────────────────────────────────────────────────────
export const fallbackDeclarationNoRe = /\b(?:[A-Z]{2,4}\s*)?\d{5}[\s-]?\d{2}[\s-]?[A-Z0-9]{5,9}\b|\b[A-Z]{2,4}\s*\d{8,14}\b/i;
const fallbackDateRe = /\b(20\d{2})[년./\-\s]*(\d{1,2})[월./\-\s]*(\d{1,2})\s*일?\b/;
const fallbackNumberRe = /\d[\d,]*(?:\.\d+)?/g;
const fallbackPcsRe = /([\d,]+)\s*PCS\b/i;
const fallbackItemNoRe = /\(?\s*NO\.\s*\d+\s*\)?/i;
const fallbackImporterRe = /(TOP\s*SOLAR|TOPSOLAR|탑솔라(?:\s*\(?주\)?)?)/i;
const fallbackTradePartnerRe = /([A-Z][A-Z0-9&.,\-\s]{4,90}(?:CO\.?\s*LTD|CO\s+LTD|LIMITED|INC\.?|CORP\.?))/i;
const fallbackModelLikeRe = /(LR\d[-A-Z0-9]*|[A-Z0-9]{2,}[-][A-Z0-9-]{4,})/i;
const ocrModelWpRe = /(?:^|[^0-9])(\d{3,4})\s*(?:M|W|WP)\b/i;
const ocrCapacityWpRe = /([\d,]+)\s*WP\b/i;

const customsOCRZones = {
  declarationNumber: { x0: 180, y0: 250, x1: 430, y1: 315 },
  arrivalDate: { x0: 490, y0: 250, x1: 650, y1: 315 },
  declarationDate: { x0: 980, y0: 250, x1: 1145, y1: 315 },
  blNumber: { x0: 250, y0: 325, x1: 470, y1: 380 },
  importer: { x0: 140, y0: 390, x1: 720, y1: 500 },
  port: { x0: 1180, y0: 490, x1: 1320, y1: 555 },
  tradePartner: { x0: 140, y0: 600, x1: 760, y1: 690 },
  hsCode: { x0: 360, y0: 1025, x1: 660, y1: 1105 },
  exchangeRate: { x0: 1320, y0: 1505, x1: 1465, y1: 1565 },
  cifAmountKRW: { x0: 1320, y0: 1570, x1: 1510, y1: 1635 },
} as const satisfies Record<string, OCRZone>;

// ── 텍스트 정규화 ───────────────────────────────────────────────────────────
export function normalizeOCRMatchText(value: string | undefined) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
}

export function normalizeOCRIdentifier(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

export function normalizeOCRDecimal(value: string | undefined) {
  const cleaned = (value ?? '').replace(/,/g, '').trim();
  return Number.isFinite(Number(cleaned)) ? cleaned : '';
}

export function normalizeOCRDate(value: string | undefined) {
  const match = fallbackDateRe.exec(value ?? '');
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function fallbackPort(text: string) {
  if (text.includes('광양항') || /KRKAN/i.test(text)) return '광양항';
  if (text.includes('부산항') || /KRPUS/i.test(text)) return '부산항';
  if (text.includes('인천항') || /KRINC/i.test(text)) return '인천항';
  if (text.includes('평택항') || /KRPTK/i.test(text)) return '평택항';
  return '';
}

// ── OCR Zone 매칭 ───────────────────────────────────────────────────────────
function ocrLineCenter(line: OCRLine) {
  if (!line.box) return null;
  return { x: (line.box.x0 + line.box.x1) / 2, y: (line.box.y0 + line.box.y1) / 2 };
}

function isInOCRZone(line: OCRLine, zone: OCRZone) {
  const center = ocrLineCenter(line);
  return Boolean(center && center.x >= zone.x0 && center.x <= zone.x1 && center.y >= zone.y0 && center.y <= zone.y1);
}

function findOCRZoneLine(lines: OCRLine[], zone: OCRZone, pattern?: RegExp) {
  return lines.find((line) => isInOCRZone(line, zone) && (!pattern || pattern.test(line.text)));
}

function makeOCRCandidate(value: string, label: string, source: string, confidence?: number): OCRFieldCandidate {
  return { value, label, source_text: source, confidence };
}

// ── Fallback 추출기 (정규식 기반 — OCR 결과에 fields 가 없을 때) ───────────
function fallbackLargestIntegerAmount(lines: OCRLine[]) {
  const zoneLine = findOCRZoneLine(lines, customsOCRZones.cifAmountKRW, /\d[\d,]{7,}/);
  if (zoneLine) {
    const match = zoneLine.text.match(/\d[\d,]{7,}/);
    if (match?.[0]) return makeOCRCandidate(match[0].replace(/,/g, ''), '면장 CIF 원화금액', zoneLine.text, zoneLine.score ?? 0);
  }
  let best = 0; let source = ''; let confidence = 0;
  for (const line of lines) {
    for (const match of line.text.match(fallbackNumberRe) ?? []) {
      if (match.includes('.')) continue;
      const parsed = Number(match.replace(/,/g, ''));
      if (Number.isFinite(parsed) && parsed >= 100_000_000 && parsed > best) {
        best = parsed; source = line.text; confidence = line.score ?? 0;
      }
    }
  }
  return best > 0 ? makeOCRCandidate(String(best), '면장 CIF 원화금액', source, confidence) : undefined;
}

function fallbackExchangeRate(lines: OCRLine[]) {
  const zoneLine = findOCRZoneLine(lines, customsOCRZones.exchangeRate, /\d[\d,]*\.\d+/);
  if (zoneLine) {
    const match = zoneLine.text.match(/\d[\d,]*\.\d+/);
    const normalized = normalizeOCRDecimal(match?.[0]);
    if (normalized) return makeOCRCandidate(normalized, '면장환율', zoneLine.text, zoneLine.score ?? 0);
  }
  for (const line of lines) {
    for (const match of line.text.match(fallbackNumberRe) ?? []) {
      if (!match.includes('.')) continue;
      const normalized = normalizeOCRDecimal(match);
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && parsed >= 500 && parsed <= 2500) {
        return makeOCRCandidate(normalized, '면장환율', line.text, line.score ?? 0);
      }
    }
  }
  return undefined;
}

function fallbackAmountUSD(section: OCRLine[]) {
  const zoneLine = section.find((line) => {
    const center = ocrLineCenter(line);
    return center && center.x >= 1330 && /\d[\d,]*\.\d+/.test(line.text) && !/WP|WTT/i.test(line.text);
  });
  if (zoneLine) {
    const match = zoneLine.text.match(/\d[\d,]*\.\d+/);
    const normalized = normalizeOCRDecimal(match?.[0]);
    if (normalized) return makeOCRCandidate(normalized, '금액(USD)', zoneLine.text, zoneLine.score ?? 0);
  }
  let best = 0; let bestText = ''; let source = ''; let confidence = 0;
  for (const line of section) {
    for (const match of line.text.match(fallbackNumberRe) ?? []) {
      if (!match.includes('.')) continue;
      const normalized = normalizeOCRDecimal(match);
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && parsed >= 100 && parsed > best && !/WP|WTT/i.test(line.text)) {
        best = parsed; bestText = normalized; source = line.text; confidence = line.score ?? 0;
      }
    }
  }
  return bestText ? makeOCRCandidate(bestText, '금액(USD)', source, confidence) : undefined;
}

function fallbackUnitPriceUSD(section: OCRLine[]) {
  const zoneLine = section.find((line) => {
    const center = ocrLineCenter(line);
    return center && center.x >= 1180 && center.x <= 1320 && /\d[\d,]*\.\d+/.test(line.text);
  });
  if (zoneLine) {
    const match = zoneLine.text.match(/\d[\d,]*\.\d+/);
    const normalized = normalizeOCRDecimal(match?.[0]);
    if (normalized && Number(normalized) > 0 && Number(normalized) < 10) {
      return makeOCRCandidate(normalized, '단가(USD)', zoneLine.text, zoneLine.score ?? 0);
    }
  }
  for (const line of section) {
    for (const match of line.text.match(fallbackNumberRe) ?? []) {
      if (!match.includes('.')) continue;
      const normalized = normalizeOCRDecimal(match);
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 10) {
        return makeOCRCandidate(normalized, '단가(USD)', line.text, line.score ?? 0);
      }
    }
  }
  return undefined;
}

function fallbackLineItems(lines: OCRLine[]) {
  const starts = lines
    .map((line, index) => fallbackItemNoRe.test(line.text) ? index : -1)
    .filter((index) => index >= 0);
  const items: CustomsDeclarationOCRLine[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const startLine = lines[starts[i]];
    const startY = startLine.box?.y0;
    const nextStartY = i + 1 < starts.length ? lines[starts[i + 1]].box?.y0 : undefined;
    const section = startY == null
      ? lines.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : lines.length)
      : lines.filter((line) => {
        const y = line.box?.y0;
        if (y == null) return false;
        const endY = nextStartY != null && nextStartY - startY < 220 ? nextStartY : startY + 95;
        return y >= startY - 12 && y < endY;
      });
    const joined = section.map((line) => line.text).join(' ');
    const quantityLine = section.find((line) => fallbackPcsRe.test(line.text));
    const quantityMatch = quantityLine ? fallbackPcsRe.exec(quantityLine.text) : null;
    const specLines = section.filter((line) => /MODULE|SOLAR/i.test(line.text) || fallbackModelLikeRe.test(line.text) || fallbackPcsRe.test(line.text));
    const specSource = specLines.map((line) => line.text).join(' ').trim();
    const item: CustomsDeclarationOCRLine = {
      payment_type: makeOCRCandidate(/FREE|SPARE|N\.C\.V/i.test(joined) ? 'free' : 'paid', '유무상', joined, 0),
    };
    if (specSource) item.model_spec = makeOCRCandidate(specSource, '모델/규격', specSource, Math.max(...specLines.map((line) => line.score ?? 0), 0));
    if (quantityMatch?.[1]) item.quantity = makeOCRCandidate(quantityMatch[1].replace(/,/g, ''), '수량', quantityLine?.text ?? '', quantityLine?.score ?? 0);
    const unitPrice = fallbackUnitPriceUSD(section);
    if (unitPrice) item.unit_price_usd = unitPrice;
    const amount = fallbackAmountUSD(section);
    if (amount) item.amount_usd = amount;
    if (item.model_spec || item.quantity || item.amount_usd) items.push(item);
  }
  return items;
}

// ── 합산/병합 ───────────────────────────────────────────────────────────────
export function hasCustomsOCRCandidates(fields: CustomsDeclarationOCRFields) {
  return Boolean(
    fields.declaration_number || fields.declaration_date || fields.arrival_date ||
    fields.release_date || fields.importer || fields.forwarder || fields.trade_partner ||
    fields.exchange_rate || fields.cif_amount_krw || fields.hs_code || fields.customs_office ||
    fields.port || fields.bl_number || fields.invoice_number || fields.line_items?.length
  );
}

export function buildFallbackCustomsOCRFields(result: OCRExtractResponse['results'][number], originalFilename: string) {
  const rawLines: OCRLine[] = result.lines?.length
    ? result.lines
    : (result.raw_text ?? '').split('\n').map((text) => ({ text }));
  const filenameLine = originalFilename || result.filename;
  const lines: OCRLine[] = [
    ...rawLines.filter((line) => line.text?.trim()),
    ...(filenameLine ? [{ text: filenameLine, score: 0.55 }] : []),
  ];
  const allText = lines.map((line) => line.text).join('\n');
  const fields: CustomsDeclarationOCRFields = {};

  const declarationLine = findOCRZoneLine(lines, customsOCRZones.declarationNumber, fallbackDeclarationNoRe)
    ?? lines.find((line) => fallbackDeclarationNoRe.test(line.text));
  const declarationMatch = declarationLine ? fallbackDeclarationNoRe.exec(declarationLine.text) : null;
  if (declarationMatch?.[0]) {
    fields.declaration_number = makeOCRCandidate(normalizeOCRIdentifier(declarationMatch[0]), '면장번호', declarationLine?.text ?? '', declarationLine?.score ?? 0);
  }

  const blLine = findOCRZoneLine(lines, customsOCRZones.blNumber, /[A-Z]{2,}[A-Z0-9/-]{5,35}/i)
    ?? lines.find((line) => /DFS\d{6,}/i.test(line.text))
    ?? lines.find((line) => /B\/?L|AWB/i.test(line.text));
  const blMatch = blLine ? /DFS\d{6,}|[A-Z]{2,}[A-Z0-9/-]{5,35}/i.exec(blLine.text) : null;
  if (blMatch?.[0] && !/UNIPASS|MASTERB/i.test(blMatch[0])) {
    fields.bl_number = makeOCRCandidate(blMatch[0].trim(), 'B/L번호', blLine?.text ?? '', blLine?.score ?? 0);
  }

  const arrivalLine = findOCRZoneLine(lines, customsOCRZones.arrivalDate, fallbackDateRe);
  const arrivalDate = normalizeOCRDate(arrivalLine?.text);
  if (arrivalDate) {
    fields.arrival_date = makeOCRCandidate(arrivalDate, '입항일', arrivalLine?.text ?? '', arrivalLine?.score ?? 0);
  }
  const declarationDateLine = findOCRZoneLine(lines, customsOCRZones.declarationDate, fallbackDateRe);
  const declarationDate = normalizeOCRDate(declarationDateLine?.text);
  if (declarationDate) {
    fields.declaration_date = makeOCRCandidate(declarationDate, '신고일', declarationDateLine?.text ?? '', declarationDateLine?.score ?? 0);
  }

  const dateCandidates = lines
    .map((line) => ({ value: normalizeOCRDate(line.text), line }))
    .filter((item) => item.value);
  if (dateCandidates.length > 0) {
    if (!fields.arrival_date) {
      fields.arrival_date = makeOCRCandidate(dateCandidates[0].value, '입항일', dateCandidates[0].line.text, dateCandidates[0].line.score ?? 0);
    }
    const last = dateCandidates[dateCandidates.length - 1];
    if (!fields.declaration_date) {
      fields.declaration_date = makeOCRCandidate(last.value, '신고일', last.line.text, last.line.score ?? 0);
    }
  }

  const portLine = findOCRZoneLine(lines, customsOCRZones.port, /KR[A-Z]{3}|광양항|부산항|인천항|평택항/i);
  const port = fallbackPort(portLine?.text ?? allText);
  if (port) fields.port = makeOCRCandidate(port, '항구', portLine?.text ?? allText, portLine?.score ?? 0);

  const exchangeRate = fallbackExchangeRate(lines);
  if (exchangeRate) fields.exchange_rate = exchangeRate;

  const cifAmount = fallbackLargestIntegerAmount(lines);
  if (cifAmount) fields.cif_amount_krw = cifAmount;

  const hsLine = findOCRZoneLine(lines, customsOCRZones.hsCode, /\d{4}[.\-\s]?\d{2}/)
    ?? lines.find((line) => /8541[.\-\s]?43|HS|세번|품목번호/i.test(line.text));
  const hsMatch = hsLine ? /(\d{4}[.\-\s]?\d{2}[.\-\s]?\d{4}|\d{10})/.exec(hsLine.text) : null;
  if (hsMatch?.[1]) fields.hs_code = makeOCRCandidate(hsMatch[1].replace(/\D/g, ''), 'HS코드', hsLine?.text ?? '', hsLine?.score ?? 0);

  const tradeLine = findOCRZoneLine(lines, customsOCRZones.tradePartner, fallbackTradePartnerRe)
    ?? lines.find((line) => fallbackTradePartnerRe.test(line.text));
  const tradeMatch = tradeLine ? fallbackTradePartnerRe.exec(tradeLine.text) : null;
  if (tradeMatch?.[1] && !/MASTERB|UNIPASS/i.test(tradeMatch[1])) {
    fields.trade_partner = makeOCRCandidate(tradeMatch[1].trim(), '무역거래처', tradeLine?.text ?? '', tradeLine?.score ?? 0);
  }

  const importerLine = findOCRZoneLine(lines, customsOCRZones.importer, fallbackImporterRe)
    ?? lines.find((line) => fallbackImporterRe.test(line.text));
  const importerMatch = importerLine ? fallbackImporterRe.exec(importerLine.text) : fallbackImporterRe.exec(allText);
  if (importerMatch?.[1]) {
    fields.importer = makeOCRCandidate(importerMatch[1].trim(), '수입자', importerLine?.text ?? allText, importerLine?.score ?? 0.55);
  }

  const lineItems = fallbackLineItems(lines);
  if (lineItems.length > 0) fields.line_items = lineItems;

  return hasCustomsOCRCandidates(fields) ? fields : null;
}

export function lineItemOCRCompleteness(items: CustomsDeclarationOCRLine[] | undefined) {
  return (items ?? []).reduce((score, item) => score
    + (item.model_spec ? 2 : 0)
    + (item.quantity ? 2 : 0)
    + (item.unit_price_usd ? 1 : 0)
    + (item.amount_usd ? 1 : 0)
    + (item.payment_type ? 1 : 0), 0);
}

export function mergeCustomsOCRFields(primary: CustomsDeclarationOCRFields | undefined | null, fallback: CustomsDeclarationOCRFields | null) {
  if (!primary) return fallback;
  const merged: CustomsDeclarationOCRFields = { ...(fallback ?? {}), ...primary };
  const primaryLineScore = lineItemOCRCompleteness(primary.line_items);
  const fallbackLineScore = lineItemOCRCompleteness(fallback?.line_items);
  if ((fallback?.line_items?.length ?? 0) > (primary.line_items?.length ?? 0) || fallbackLineScore > primaryLineScore) {
    merged.line_items = fallback?.line_items;
  }
  return hasCustomsOCRCandidates(merged) ? merged : null;
}

// ── 거래처/제조사 매칭 ──────────────────────────────────────────────────────
function normalizeOCRPartyText(value: string | undefined) {
  return normalizeOCRMatchText(value).replace(
    /주식회사|유한회사|합자회사|합명회사|사단법인|재단법인|농업회사법인|법인|회사|COLTD|CO|LTD|LIMITED|INCORPORATED|INC|CORPORATION|CORP|COMPANY|PTE|LLC|LLP|PLC|GMBH|HOLDINGS|HOLDING/g,
    ''
  );
}

function isUsefulOCRPartyToken(value: string) {
  if (!value) return false;
  return /[가-힣]/.test(value) ? value.length >= 2 : value.length >= 3;
}

function ocrPartyVariants(value: string | undefined) {
  return Array.from(new Set([
    normalizeOCRMatchText(value),
    normalizeOCRPartyText(value),
  ])).filter(isUsefulOCRPartyToken);
}

export function scoreOCRPartyCandidate(rawValue: string | undefined, candidateValues: Array<string | undefined>) {
  const rawVariants = ocrPartyVariants(rawValue);
  let best = 0;
  for (const raw of rawVariants) {
    for (const candidateValue of candidateValues) {
      for (const candidate of ocrPartyVariants(candidateValue)) {
        if (raw === candidate) best = Math.max(best, 1000 + candidate.length);
        else if (raw.includes(candidate)) best = Math.max(best, 700 + candidate.length);
        else if (candidate.includes(raw)) best = Math.max(best, 500 + raw.length);
      }
    }
  }
  return best;
}

export function manufacturerOCRAliases(manufacturer: Pick<Manufacturer, 'name_kr' | 'name_en' | 'short_name'>) {
  const base = [manufacturer.name_kr, manufacturer.name_en, manufacturer.short_name].filter((value): value is string => Boolean(value));
  const joined = normalizeOCRMatchText(base.join(' '));
  const aliases: string[] = [];
  if (/론지|롱기|LONGI/.test(joined)) aliases.push('LONGI', 'LONGISOLAR', 'LONGISOLARTECHNOLOGY');
  if (/진코|JINKO/.test(joined)) aliases.push('JINKO', 'JINKOSOLAR');
  if (/트리나|TRINA/.test(joined)) aliases.push('TRINA', 'TRINASOLAR');
  if (/JA|제이에이|징아오|JASOLAR/.test(joined)) aliases.push('JA', 'JASOLAR');
  if (/캐나디안|CANADIAN/.test(joined)) aliases.push('CANADIAN', 'CANADIANSOLAR');
  if (/라이젠|RISEN/.test(joined)) aliases.push('RISEN', 'RISENSOLAR');
  if (/한화|HANWHA|QCELL|QCELLS/.test(joined)) aliases.push('HANWHA', 'QCELLS', 'HANWHAQCELLS');
  if (/선텍|SUNTECH/.test(joined)) aliases.push('SUNTECH');
  return Array.from(new Set([...base, ...aliases]));
}

// ── 품목 매칭 ───────────────────────────────────────────────────────────────
export function extractOCRSpecWp(item: CustomsDeclarationOCRLine) {
  const text = item.model_spec?.value ?? '';
  const direct = ocrModelWpRe.exec(text);
  if (direct?.[1]) return Number(direct[1]);
  const quantity = parseOCRNumber(item.quantity?.value);
  const capacityMatch = ocrCapacityWpRe.exec(text);
  const capacity = capacityMatch?.[1] ? parseOCRNumber(capacityMatch[1]) : NaN;
  if (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(capacity) && capacity > 0) {
    return Math.round(capacity / quantity);
  }
  return 0;
}

export function extractOCRModelTokens(value: string | undefined) {
  const normalized = normalizeOCRMatchText(value);
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(/[A-Z]{1,4}\d[A-Z0-9]*/g)) {
    if (match[0].length >= 3) tokens.add(match[0]);
  }
  for (const match of normalized.matchAll(/\d{2,4}[A-Z]{2,}[A-Z0-9]*/g)) {
    if (match[0].length >= 4) tokens.add(match[0]);
  }
  return Array.from(tokens);
}

export function parseOCRNumber(value: string | undefined) {
  if (!value) return NaN;
  return Number(value.replace(/,/g, ''));
}

export function formatOCRProductLabel(product: Product | null | undefined) {
  if (!product) return '';
  const manufacturer = product.manufacturers?.short_name
    || product.manufacturers?.name_kr
    || product.manufacturer_name
    || '';
  const prefix = manufacturer ? `${manufacturer} · ` : '';
  const spec = product.spec_wp ? ` · ${product.spec_wp}Wp` : '';
  return `${prefix}${product.product_code} ${product.product_name}${spec}`;
}

export function selectableOCRProducts(item: CustomsDeclarationOCRLine, productSource: Product[], matchedProduct: Product | null) {
  const specWp = extractOCRSpecWp(item);
  const tokens = extractOCRModelTokens(item.model_spec?.value);
  const rows = productSource
    .map((product) => {
      const haystack = normalizeOCRMatchText(`${product.product_code} ${product.product_name} ${product.series_name ?? ''}`);
      let score = 0;
      if (specWp > 0 && product.spec_wp === specWp) score += 500;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 120;
      }
      return { product, score };
    })
    .filter(({ product, score }) => score > 0 || product.product_id === matchedProduct?.product_id)
    .sort((a, b) => b.score - a.score || formatOCRProductLabel(a.product).localeCompare(formatOCRProductLabel(b.product), 'ko'))
    .map(({ product }) => product);

  if (rows.length === 0) {
    rows.push(...productSource
      .slice()
      .sort((a, b) => formatOCRProductLabel(a).localeCompare(formatOCRProductLabel(b), 'ko'))
      .slice(0, 80));
  }
  if (matchedProduct && !rows.some((product) => product.product_id === matchedProduct.product_id)) {
    rows.unshift(matchedProduct);
  }
  return rows.slice(0, 80);
}

// 품목 자동 매칭 — model_spec 기반 점수 매겨 최고점 product 반환.
// selMfgId 가 있으면 같은 제조사 가산점.
export function findProductForOCRLine(
  item: CustomsDeclarationOCRLine,
  productSource: Product[],
  selMfgId?: string,
): Product | null {
  const raw = normalizeOCRMatchText(item.model_spec?.value);
  if (!raw) return null;
  const specWp = extractOCRSpecWp(item);
  const rawTokens = extractOCRModelTokens(item.model_spec?.value);
  let bestProduct: Product | null = null;
  let bestScore = 0;

  for (const product of productSource) {
    const code = normalizeOCRMatchText(product.product_code);
    const name = normalizeOCRMatchText(product.product_name);
    const productTokens = new Set(extractOCRModelTokens(`${product.product_code} ${product.product_name}`));
    let score = 0;

    if (code && raw.includes(code)) score += 1000 + code.length;
    if (name && raw.includes(name)) score += 900 + name.length;
    if (code && raw.length >= 6 && code.includes(raw)) score += 700;
    if (name && raw.length >= 6 && name.includes(raw)) score += 650;
    if (specWp > 0 && product.spec_wp === specWp) score += 500;

    for (const token of rawTokens) {
      if (productTokens.has(token) || code.includes(token) || name.includes(token)) score += 120;
    }
    if (selMfgId && product.manufacturer_id === selMfgId) score += 80;
    if (score > bestScore) {
      bestProduct = product;
      bestScore = score;
    }
  }
  return bestProduct;
}
