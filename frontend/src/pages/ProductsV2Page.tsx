// Phase 4: 품번 마스터 — 메타 ListScreen 기반 (운영 기본은 /data?kind=products)

import ListScreen from '@/templates/ListScreen';
import productsConfig from '@/config/screens/products';

export default function ProductsV2Page() {
  return <ListScreen config={productsConfig} />;
}
