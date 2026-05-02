// Phase 4 — Step 3 follow-up: BL 결제조건 (payment_terms) 파서 추출
// BLForm.tsx 의 ~80줄 PT 헬퍼를 모듈로 분리.
// 다음: BLPaymentTermsWidget 이 이 헬퍼 + 입력 UI 묶어서 MetaForm contentBlock 으로 노출.

// ── 해외직수입 결제조건 ─────────────────────────────────────────────────────
// 계약금 % + 잔금 기간 (30/45/60/90/120/180)
export const IMPORT_BALANCE_DAYS = ['30', '45', '60', '90', '120', '180'] as const;
export type ImportBalanceDay = typeof IMPORT_BALANCE_DAYS[number];

export interface ImportPT {
  hasDeposit: boolean;
  depositMethod: 'tt' | 'lc';
  depositPercent: string;      // 총구매금액 × %
  depositSplits: string[];     // 분할 시 각 행 금액
  balanceDays: ImportBalanceDay;
}

export const defaultImportPT = (): ImportPT => ({
  hasDeposit: false, depositMethod: 'tt', depositPercent: '', depositSplits: [], balanceDays: '90',
});

export function composeImportPT(pt: ImportPT, totalAmount: number): string {
  const bal = `잔금 L/C ${pt.balanceDays}days`;
  if (pt.hasDeposit && pt.depositPercent) {
    const m = pt.depositMethod === 'tt' ? 'T/T' : 'L/C';
    const pct = pt.depositPercent;
    const amt = totalAmount ? Math.round(totalAmount * (parseFloat(pct) / 100)) : 0;
    const splitStr = pt.depositSplits.length
      ? ` (분할 ${pt.depositSplits.filter(Boolean).length}회)` : '';
    return `계약금 ${pct}% ${m} ${amt.toLocaleString('en-US')}${splitStr}, ${bal}`;
  }
  return bal;
}

export function parseImportPT(text: string): ImportPT {
  const dep = text.match(/계약금\s*([\d.]+)%?\s*(T\/T|L\/C)/i);
  const bal = text.match(/L\/C\s*(\d+)\s*days?/i);
  const days = (bal?.[1] ?? '90') as string;
  return {
    hasDeposit: !!dep,
    depositMethod: dep?.[2]?.toUpperCase() === 'L/C' ? 'lc' : 'tt',
    depositPercent: dep?.[1] ?? '',
    depositSplits: [],
    balanceDays: (IMPORT_BALANCE_DAYS.includes(days as ImportBalanceDay) ? days : '90') as ImportBalanceDay,
  };
}

// ── 국내구매 결제조건 ──────────────────────────────────────────────────────
// 선입금(%/금액) + 잔금 3가지 옵션 (days5/manual/month)
export const DOMESTIC_DAYS5 = Array.from({ length: 19 }, (_, i) => String(30 + i * 5)); // 30,35,...,120
export type DomesticBalanceMode = 'days5' | 'manual' | 'month';
export type MonthOffset = '1' | '2' | '3';

export interface DomesticPT {
  prepayMode: 'percent' | 'amount';
  prepayValue: string;          // % 또는 원
  balanceMode: DomesticBalanceMode;
  balanceDays: string;          // days5 또는 manual 일수
  monthOffset: MonthOffset;     // 1/2/3 = 익월말/익익월말/익익익월말
}

export const defaultDomesticPT = (): DomesticPT => ({
  prepayMode: 'amount', prepayValue: '', balanceMode: 'days5', balanceDays: '60', monthOffset: '1',
});

export function monthLabel(o: MonthOffset): string {
  return o === '1' ? '익월말' : o === '2' ? '익익월말' : '익익익월말';
}

export function composeDomesticPT(pt: DomesticPT, totalAmount: number): string {
  const prepayAmt = pt.prepayMode === 'percent'
    ? Math.round(totalAmount * (parseFloat(pt.prepayValue || '0') / 100))
    : parseInt(pt.prepayValue || '0');
  const prepayStr = prepayAmt > 0
    ? `선입금 ${prepayAmt.toLocaleString('ko-KR')}원${pt.prepayMode === 'percent' ? ` (${pt.prepayValue}%)` : ''}`
    : '전액';
  const balStr = pt.balanceMode === 'days5' || pt.balanceMode === 'manual'
    ? `잔금 신용거래 ${pt.balanceDays}일`
    : `잔금 ${monthLabel(pt.monthOffset)}`;
  return `${prepayStr} + ${balStr}`;
}

export function parseDomesticPT(text: string): DomesticPT {
  const amtM = text.match(/선입금\s*([\d,]+)\s*원/);
  const pctM = text.match(/\((\d+(?:\.\d+)?)%\)/);
  const daysM = text.match(/신용거래\s*(\d+)\s*일/);
  const monthM = text.match(/(익익익월말|익익월말|익월말)/);
  const base: DomesticPT = defaultDomesticPT();
  if (amtM) {
    base.prepayValue = pctM ? pctM[1] : amtM[1].replace(/,/g, '');
    base.prepayMode = pctM ? 'percent' : 'amount';
  }
  if (daysM) {
    const d = daysM[1];
    base.balanceMode = DOMESTIC_DAYS5.includes(d) ? 'days5' : 'manual';
    base.balanceDays = d;
  } else if (monthM) {
    base.balanceMode = 'month';
    base.monthOffset = monthM[1] === '익월말' ? '1' : monthM[1] === '익익월말' ? '2' : '3';
  }
  return base;
}
