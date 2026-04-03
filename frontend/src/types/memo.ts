// 메모 타입 (Step 31)

export interface Note {
  note_id: string;
  user_id: string;
  content: string;
  linked_table?: string;
  linked_id?: string;
  created_at: string;
  updated_at: string;
}

export const LINKED_TABLE_LABEL: Record<string, string> = {
  purchase_orders: '발주',
  bl_shipments: '입고(B/L)',
  outbounds: '출고',
  orders: '수주',
  declarations: '면장',
};

export const LINKED_TABLE_ROUTE: Record<string, string> = {
  purchase_orders: '/procurement',
  bl_shipments: '/inbound',
  outbounds: '/outbound',
  orders: '/orders',
  declarations: '/customs',
};
