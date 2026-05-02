// Phase 4: 발전소 마스터 — 메타 ListScreen 기반 (마지막 마스터)
// 기존 /masters/construction-sites 의 인라인 공급이력 expand 기능은 제외 — 표준 CRUD 만 메타화.
// 운영 흐름은 기존 페이지 유지, 비교/검증용으로 v2.

import ListScreen from '@/templates/ListScreen';
import constructionSitesConfig from '@/config/screens/construction_sites';

export default function ConstructionSitesV2Page() {
  return <ListScreen config={constructionSitesConfig} />;
}
