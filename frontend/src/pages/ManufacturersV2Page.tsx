// Phase 4: 제조사 마스터 — 메타 ListScreen 기반 (운영 기본은 /data?kind=manufacturers)

import ListScreen from '@/templates/ListScreen';
import manufacturersConfig from '@/config/screens/manufacturers';

export default function ManufacturersV2Page() {
  return <ListScreen config={manufacturersConfig} />;
}
