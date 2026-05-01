// Phase 1.5 PoC: 메타데이터 기반 거래처 마스터 페이지
// 기존 /masters/partners 와 비교하기 위해 /masters/partners-v2 로 분리한다.

import ListScreen from '@/templates/ListScreen';
import partnersConfig from '@/config/screens/partners';

export default function PartnerV2Page() {
  return <ListScreen config={partnersConfig} />;
}
