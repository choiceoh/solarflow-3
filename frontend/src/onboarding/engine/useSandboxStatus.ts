import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';

/**
 * 박물관 표본 데이터 셋업 여부 자동 감지 — Q12·Q13 결정의 후속.
 *
 * 운영자가 ONBOARDING_SANDBOX.md 절차로 시드 셋업했는지 frontend가 확인.
 * 셋업 안 된 상태에서 신입이 흐름을 시작하면 풍선만 보이고 실제 표본 데이터는
 * 없는 어색한 경험 → 사이드바 🎓 메뉴에서 미리 안내.
 *
 * 가벼운 ping: `?include_sandbox=true&limit=1`로 1건 존재 여부만 확인.
 *
 * 후속 PR (#2-E~): tour 진입 시 자동으로 sandbox row의 ID를 fetch해서
 * URL 쿼리에 합성 → 페이지가 자동 폼/상세 open.
 */
export type SandboxResource = 'partners' | 'pos' | 'lcs' | 'bls' | 'declarations' | 'cost-details';

const RESOURCE_PATH: Record<SandboxResource, string> = {
  partners: '/api/v1/partners',
  pos: '/api/v1/pos',
  lcs: '/api/v1/lcs',
  bls: '/api/v1/bls',
  declarations: '/api/v1/declarations',
  'cost-details': '/api/v1/cost-details',
};

export interface SandboxStatus {
  loading: boolean;
  /** 1건이라도 있으면 true. 운영자 셋업 완료 신호. */
  hasAny: boolean;
  /** 자원별 ping 결과 — 어떤 자원이 빠졌는지 알려주기 위해. */
  byResource: Partial<Record<SandboxResource, boolean>>;
}

/**
 * 핵심 자원(partners + pos)만 ping해서 빠른 응답.
 * 전체 6개 자원 검사는 비싸고, 운영자가 흐름 1세트를 셋업하면 둘 다 있음.
 */
export const useSandboxStatus = (resources: SandboxResource[] = ['partners', 'pos']): SandboxStatus => {
  const [status, setStatus] = useState<SandboxStatus>({
    loading: true,
    hasAny: false,
    byResource: {},
  });

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const result: Partial<Record<SandboxResource, boolean>> = {};
      await Promise.all(
        resources.map(async (res) => {
          try {
            const data = await fetchWithAuth<unknown[]>(`${RESOURCE_PATH[res]}?include_sandbox=true&limit=1`);
            result[res] = Array.isArray(data) && data.some((row) => (row as { is_sandbox?: boolean })?.is_sandbox === true);
          } catch {
            result[res] = false;
          }
        }),
      );
      if (cancelled) return;
      setStatus({ loading: false, hasAny: Object.values(result).some(Boolean), byResource: result });
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [resources]);

  return status;
};
