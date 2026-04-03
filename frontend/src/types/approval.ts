// 결재안 자동 생성 6유형 타입 (Step 30)

export type ApprovalType = 1 | 2 | 3 | 4 | 5 | 6;

export const APPROVAL_TYPE_LABEL: Record<ApprovalType, string> = {
  1: '수입 모듈대금',
  2: 'CIF 비용/제경비',
  3: '판매 세금계산서',
  4: '운송비 월정산',
  5: '계약금 지출',
  6: '공사 현장 운송료',
};

export const APPROVAL_TYPE_DESC: Record<ApprovalType, string> = {
  1: 'LC 기반 수입대금 결재 (은행/품명/금액/수수료)',
  2: 'B/L 기반 CIF 비용 결재 (부두/통관/운송 등)',
  3: '매출 세금계산서 발행 결재 (거래처/기간)',
  4: '운송사 월 정산 결재',
  5: 'PO 계약금/중도금 지출 결재',
  6: '공사 현장 운송료 결재',
};

// 유형 1 수입 모듈대금
export interface Type1Data {
  lcId: string;
  poId: string;
  bankName: string;
  lcNumber: string;
  poNumber: string;
  manufacturerName: string;
  lines: { productName: string; quantity: number; unitPriceUsd: number; totalUsd: number; specWp: number }[];
  lcAmountUsd: number;
  exchangeRate: number;
  amountKrw: number;
  vat: number; // CIF x 0.1 (수입통관 부가세)
  lcFee: number;
  telegraph: number;
  totalKrw: number;
  etd?: string;
  eta?: string;
  usanceDays?: number;
  maturityDate?: string;
  paymentTerms?: string;
  incoterms?: string;
}

// 유형 2 CIF 비용/제경비
export interface Type2Data {
  blId: string;
  blNumber: string;
  manufacturerName: string;
  contractInfo: string;
  productSummary: string;
  etd?: string;
  eta?: string;
  port?: string;
  expenses: { type: string; label: string; amount: number; vat: number; total: number }[];
  totalAmount: number;
  totalVat: number;
  grandTotal: number;
}

// 유형 3 판매 세금계산서
export interface Type3Data {
  customerName: string;
  from: string;
  to: string;
  items: {
    siteName: string;
    productName: string;
    quantity: number;
    unitPriceEa: number;
    unitPriceWp: number;
    supplyAmount: number;
    spareQty: number;
  }[];
  totalSupply: number;
  totalVat: number;
  grandTotal: number;
}

// 유형 4 운송비 월정산
export interface Type4Data {
  vendor: string;
  month: string;
  expenses: { blNumber?: string; amount: number; vat: number; total: number; memo?: string }[];
  totalAmount: number;
  totalVat: number;
  grandTotal: number;
  manualDetails: string; // 차량별 상세 (수동 입력)
}

// 유형 5 계약금 지출
export interface Type5Data {
  poId: string;
  poNumber: string;
  manufacturerName: string;
  contractType: string;
  contractDate?: string;
  lines: { productName: string; quantity: number; unitPriceUsd: number; totalUsd: number }[];
  totalUsd: number;
  exchangeRate: number;
  totalKrw: number;
  depositRate: number; // 수동 입력
  depositAmount: number;
  ttHistory: { date: string; amountUsd: number; amountKrw: number; purpose: string }[];
  paidTotal: number;
  remaining: number;
  installments: number; // 수동 입력
  paymentTerms?: string;
  incoterms?: string;
}

// 유형 6 공사 현장 운송료
export interface Type6Data {
  from: string;
  to: string;
  items: {
    siteName: string;
    productName: string;
    quantity: number;
    transportCost: number; // 수동 입력
    memo: string;
  }[];
  totalTransport: number;
}

// expense_type → 아마란스 결재안 라벨 매핑
export const EXPENSE_APPROVAL_LABEL: Record<string, string> = {
  dock_charge: '부두발생비용',
  shuttle: '셔틀및부대',
  customs_fee: '통관수수료',
  transport: '운송료',
  storage: '보관료',
  handling: '핸들링',
  surcharge: '주말출고할증',
  lc_fee: 'LC개설수수료',
  lc_acceptance: 'LC인수수수료',
  telegraph: '전신료',
  other: '기타',
};
