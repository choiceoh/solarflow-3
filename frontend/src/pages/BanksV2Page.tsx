// Phase 4: 은행 마스터 — 메타 ListScreen 기반
// 운영 기본 흐름은 /data?kind=banks 그대로. 이 페이지는 메타 인프라 검증/비교용.

import ListScreen from '@/templates/ListScreen';
import banksConfig from '@/config/screens/banks';

export default function BanksV2Page() {
  return <ListScreen config={banksConfig} />;
}
