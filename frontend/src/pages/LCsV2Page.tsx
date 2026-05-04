// 신용장(LC) 메타 ListScreen 페이지 — 메타 인프라 검증/비교용 (운영 기본은 /procurement).

import ListScreen from '@/templates/ListScreen';
import config from '@/config/screens/lcs';

export default function LCsV2Page() {
  return <ListScreen config={config} />;
}
