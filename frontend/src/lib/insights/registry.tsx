// Insights 드릴다운 페이지 메트릭 레지스트리.
//
// 각 metricId 는 한 KPI 타일에 1:1 매핑되며, 자체 React 컴포넌트로 렌더된다.
// 컴포넌트 내부에서 hook 으로 데이터를 가져와 InsightShell 에 trend + breakdowns 를 넘긴다.
//
// 신규 metric 추가 절차:
//   1) 페이지 KPI 타일에 metricId='outbound.count' 식 prop 부여
//   2) 이 파일에 InsightEntry 추가 (component + breadcrumb 메타)
//   3) GUI 편집기 picker (있으면) 에도 자동 노출 — REGISTRY 키 enumerate

import type { ReactNode } from 'react'
import { OutboundCountInsight } from './metrics/OutboundCountInsight'
import { OutboundKwInsight } from './metrics/OutboundKwInsight'
import { OutboundKwYearInsight } from './metrics/OutboundKwYearInsight'
import { SaleConversionInsight } from './metrics/SaleConversionInsight'

export interface InsightEntry {
  // KPI 타일이 보낼 식별자 (예: 'outbound.count') — URL 에 그대로 들어감.
  id: string
  // 사이드바/breadcrumb 표기용 짧은 라벨.
  shortLabel: string
  // 실제 페이지 본문 컴포넌트 — InsightShell 호출.
  render: () => ReactNode
}

export const INSIGHT_REGISTRY: Record<string, InsightEntry> = {
  'outbound.count': {
    id: 'outbound.count',
    shortLabel: '출고 전체',
    render: () => <OutboundCountInsight />,
  },
  'outbound.kw_prev_month': {
    id: 'outbound.kw_prev_month',
    shortLabel: '전월 출고 용량',
    render: () => <OutboundKwInsight />,
  },
  'outbound.kw_year': {
    id: 'outbound.kw_year',
    shortLabel: '금년 출고 용량',
    render: () => <OutboundKwYearInsight />,
  },
  'outbound.sale_conversion': {
    id: 'outbound.sale_conversion',
    shortLabel: '계산서 연결률',
    render: () => <SaleConversionInsight />,
  },
}

export function getInsight(metricId: string | undefined): InsightEntry | null {
  if (!metricId) return null
  return INSIGHT_REGISTRY[metricId] ?? null
}
