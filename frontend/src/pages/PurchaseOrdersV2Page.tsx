// 발주(PO) 메타 ListScreen 페이지 — 메타 인프라 검증/비교용 (운영 기본은 /procurement).

import ListScreen from '@/templates/ListScreen';
import config from '@/config/screens/purchase_orders';

export default function PurchaseOrdersV2Page() {
  return <ListScreen config={config} />;
}
