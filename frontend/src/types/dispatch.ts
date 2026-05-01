// BARO Phase 4: 배차 타입

export type DispatchStatus = 'planned' | 'dispatched' | 'completed' | 'cancelled';

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  planned: '계획',
  dispatched: '출발',
  completed: '완료',
  cancelled: '취소',
};

export interface DispatchRoute {
  route_id: string;
  route_date: string;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  status: DispatchStatus;
  memo: string | null;
  tenant_scope: string;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateDispatchRoutePayload {
  route_date: string;
  vehicle_type?: string | null;
  vehicle_plate?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  memo?: string | null;
}
