// Phase 4: 법인 마스터 — 메타 ListScreen 기반
// 운영 기본 흐름은 /data?kind=companies 그대로. 이 페이지는 메타 인프라 검증/비교용.

import ListScreen from '@/templates/ListScreen';
import companiesConfig from '@/config/screens/companies';

export default function CompaniesV2Page() {
  return <ListScreen config={companiesConfig} />;
}
