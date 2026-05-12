// useWmsCounts — WMS 메뉴 사이드바 뱃지용 카운트.
//
// 동작:
//   - /api/v1/picking-lists/summary, /api/v1/cycle-counts/summary 두 endpoint 를
//     5분 주기로 fetch.
//   - 응답 형식이 두 endpoint 동일 ({ pending_count, in_progress_count, open_count })
//     이라 mapping 이 단순.
//   - 어느 한쪽이 실패해도 다른 쪽은 그대로 노출 (Promise.allSettled).
//   - feature flag 로 WMS 가 꺼진 테넌트는 endpoint 가 403 을 반환할 수 있는데,
//     이 경우도 "0건" 으로 처리해 사이드바 표시는 깨끗하게 유지.
//
// 카운트 의미: open_count = pending + in_progress.
// 사용자가 수행해야 할 작업이 남은 picking list / cycle count 수.
// completed/cancelled 는 카운트 외.

import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';

interface WmsSummary {
  pending_count: number;
  in_progress_count: number;
  open_count: number;
}

export interface WmsCounts {
  pickingPending: number;
  cyclePending: number;
}

const FIVE_MIN = 5 * 60 * 1000;

async function loadWmsCounts(): Promise<WmsCounts> {
  const [picking, cycle] = await Promise.allSettled([
    fetchWithAuth<WmsSummary>('/api/v1/picking-lists/summary'),
    fetchWithAuth<WmsSummary>('/api/v1/cycle-counts/summary'),
  ]);
  return {
    pickingPending: picking.status === 'fulfilled' ? picking.value.open_count : 0,
    cyclePending: cycle.status === 'fulfilled' ? cycle.value.open_count : 0,
  };
}

/**
 * WMS 메뉴 카운트 hook. companyId 가 null 이면 (로그인 직후 등) fetch 하지 않음.
 * useAlerts 와 같은 5분 주기로 refresh — 사이드바 뱃지 일관성 유지.
 */
export function useWmsCounts(enabled: boolean) {
  const q = useQuery<WmsCounts, Error>({
    queryKey: ['wms-counts'],
    queryFn: loadWmsCounts,
    enabled,
    refetchInterval: FIVE_MIN,
  });
  return q.data ?? { pickingPending: 0, cyclePending: 0 };
}
