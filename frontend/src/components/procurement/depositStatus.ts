/* ─────────────────────────────────────────────
   계약금 텍스트 파싱
   "계약금 5% T/T 570,980, 잔금 L/C 90days"
   ───────────────────────────────────────────── */
export interface DepositInfo {
  hasDeposit: boolean;
  depositPercent: number;
  depositAmountUsd: number;
  plannedSplits: number;
}

export function parseDeposit(text?: string): DepositInfo {
  if (!text) return { hasDeposit: false, depositPercent: 0, depositAmountUsd: 0, plannedSplits: 0 };
  const m = text.match(/계약금\s*([\d.]+)%?\s*(?:T\/T|L\/C)\s*([\d,]+)/i);
  const splitM = text.match(/분할\s*(\d+)회/);
  if (!m) return { hasDeposit: false, depositPercent: 0, depositAmountUsd: 0, plannedSplits: 0 };
  return {
    hasDeposit: true,
    depositPercent: parseFloat(m[1]),
    depositAmountUsd: parseFloat(m[2].replace(/,/g, '')),
    plannedSplits: splitM ? parseInt(splitM[1]) : 0,
  };
}
