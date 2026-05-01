// Phase 1 PoC: 메타데이터 기반 출고관리 페이지
// 기존 /outbound 와 비교하기 위해 /outbound-v2 로 분리해서 운영한다.

import TabbedListScreen from '@/templates/TabbedListScreen';
import outboundConfig from '@/config/screens/outbound';

export default function OutboundV2Page() {
  return <TabbedListScreen config={outboundConfig} />;
}
