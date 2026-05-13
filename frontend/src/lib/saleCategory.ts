// 매출분석/인사이트가 "외부 판매" 매출만 골라낼 때 쓰는 공통 술어.
//
// 배경 (PR #802 2026-05-12):
//   sales 테이블에는 outbound usage_category 가 sale 이 아닌 행도 들어 있다
//   (construction / sale_spare / construction_damage / maintenance / disposal / other).
//   이들은 supply_amount=0 이지만 capacity_kw·quantity 는 양수라, 매출분석 차트에서
//   0매출 vs 양수원가가 매월 음수 이익을 만들어 적자처럼 보이는 회귀가 발생했다.
//   엔진(/api/calc/margin-analysis) 은 o.usage_category IN ('sale','sale_spare') 로
//   이미 필터링하지만 프론트의 raw sales 집계 경로엔 같은 필터가 없었다.
//
// 왜 whitelist (== 'sale' || == 'sale_spare') 인가:
//   blacklist (`!== 'sale' && !== 'sale_spare'`) 에 `usage_category &&` truthy 가드를
//   붙이면 NULL/undefined 가 통과한다. 마이그 077 의 integrity_check view 가
//   outbounds.usage_category NULL 을 high severity 항목으로 잡고 있어 실제 운영
//   데이터에 NULL 행이 존재한다 (091/094/096/109 마이그에서도 추적). NULL 통과를
//   허용하면 그 정확한 행들이 분석에 다시 새어들어와 음수 이익 버그가 silent 하게
//   회귀한다 — 정확히 이번에 고친 버그.
//
// 적용 안 하는 곳:
//   - SaleListTable / SaleSummaryCards / OrdersPage 처리 큐
//     → 운영자 작업 화면이라 모든 sale 을 보여야 정상.
//   - ModuleDemandForecastPanel
//     → 재고 소진 예측은 외부 판매든 자체 사용이든 출고된 만큼 동일하게 차감해야 정상.

import type { SaleListItem } from "@/types/outbound"

export const EXTERNAL_SALE_CATEGORIES = ["sale", "sale_spare"] as const
export type ExternalSaleCategory = (typeof EXTERNAL_SALE_CATEGORIES)[number]

export function isExternalSale(item: SaleListItem): boolean {
  return item.usage_category === "sale" || item.usage_category === "sale_spare"
}
