// Phase 4: 창고 마스터 — 메타 ListScreen 기반 (운영 기본은 /data?kind=warehouses)

import ListScreen from '@/templates/ListScreen';
import warehousesConfig from '@/config/screens/warehouses';

export default function WarehousesV2Page() {
  return <ListScreen config={warehousesConfig} />;
}
