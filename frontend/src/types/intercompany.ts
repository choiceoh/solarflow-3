// BARO Phase 2: 그룹내 매입 요청 타입

export type IntercompanyStatus =
  | 'pending'
  | 'shipped'
  | 'received'
  | 'rejected'
  | 'cancelled';

export const INTERCOMPANY_STATUS_LABEL: Record<IntercompanyStatus, string> = {
  pending: '요청 대기',
  shipped: '출고됨',
  received: '입고 완료',
  rejected: '거부',
  cancelled: '취소',
};

export interface IntercompanyRequest {
  request_id: string;
  requester_company_id: string;
  target_company_id: string;
  product_id: string;
  quantity: number;
  desired_arrival_date: string | null;
  status: IntercompanyStatus;
  note: string | null;
  outbound_id: string | null;
  requested_by: string | null;
  requested_by_email: string | null;
  responded_by: string | null;
  responded_by_email: string | null;
  responded_at: string | null;
  received_at: string | null;
  cancelled_at: string | null;
  created_at?: string;
  updated_at?: string;
  product_code?: string | null;
  product_name?: string | null;
  requester_company_name?: string | null;
  target_company_name?: string | null;
}

export interface CreateIntercompanyRequestPayload {
  requester_company_id: string;
  target_company_id: string;
  product_id: string;
  quantity: number;
  desired_arrival_date?: string | null;
  note?: string | null;
}
