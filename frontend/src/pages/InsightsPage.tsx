// /insights/:metric — KPI 드릴다운 라우트.
// metric URL 파라미터로 INSIGHT_REGISTRY 조회 → 해당 entry 가 자체 컴포넌트를 렌더.
// 등록 안 된 metricId 는 inventory 로 redirect.

import { Navigate, useParams } from 'react-router-dom'
import { getInsight } from '@/lib/insights/registry'

export default function InsightsPage() {
  const { metric } = useParams<{ metric: string }>()
  const entry = getInsight(metric)

  if (!entry) {
    return <Navigate to="/inventory" replace />
  }

  // key 로 metric 고정 — URL 변경 시 컴포넌트 강제 remount (hook 순서 안정).
  return <div key={entry.id}>{entry.render()}</div>
}
