// Baro RFM 보드 (D-128) — /api/v1/baro/rfm 응답 타입
//
// 백엔드 baro_rfm.go RFMRow 와 1:1 매핑.

export type RFMSegment = 'champion' | 'loyal' | 'new' | 'at_risk' | 'lost' | 'inactive';

export interface RFMRow {
  partner_id: string;
  partner_name: string;
  partner_type: string;
  owner_user_id: string | null;
  last_sale_date: string | null;
  days_since_last_sale: number | null;
  sale_count_12mo: number;
  sale_amount_12mo_krw: number;
  segment: RFMSegment;
}

export const SEGMENT_LABEL: Record<RFMSegment, string> = {
  champion: '챔피언',
  loyal: '단골',
  new: '신규',
  at_risk: '위험',
  lost: '침체',
  inactive: '휴면',
};

export const SEGMENT_DESCRIPTION: Record<RFMSegment, string> = {
  champion: '최근 30일 + 5건+ + 1억+ 매출. 핵심 거래처.',
  loyal: '최근 60일 + 3건+ 자주 사는 단골.',
  new: '최근 30일 시작 (2건 이하). 관계 형성 단계.',
  at_risk: '90일+ 미주문 + 5천만+ 매출 이력. 재활성화 후보.',
  lost: '그 외 침체. 영업 콜백 우선순위 낮음.',
  inactive: '12개월 매출 0건. 휴면 거래처.',
};

// Tailwind tone classes per segment — 색상 의미 매핑
export const SEGMENT_TONE: Record<
  RFMSegment,
  { badge: 'default' | 'secondary' | 'destructive' | 'outline'; bg: string }
> = {
  champion: { badge: 'default', bg: 'border-green-200 bg-green-50/50' },
  loyal: { badge: 'secondary', bg: 'border-blue-200 bg-blue-50/50' },
  new: { badge: 'outline', bg: 'border-blue-200 bg-blue-50/30' },
  at_risk: { badge: 'destructive', bg: 'border-amber-200 bg-amber-50/50' },
  lost: { badge: 'outline', bg: 'border-gray-200 bg-gray-50/50' },
  inactive: { badge: 'outline', bg: 'border-gray-200 bg-gray-50/30' },
};
