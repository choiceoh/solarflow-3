// Phase 4 PoC: 탑에너지 (계열사) 테넌트 오버레이
// 시연 목적 — 같은 코드 베이스에서 다른 도메인 표현 가능함을 입증.
// 실제 운영에선 백엔드 별 데이터 + UI 라벨 차별화로 풀어낼 수 있음.

import type { TenantOverrides } from './index';

export const topEnergyOverrides: TenantOverrides = {
  screens: {
    // 법인 마스터 — 계열사 명칭 변경 + 컬럼 일부 교체
    companies: {
      page: {
        eyebrow: 'TOPENERGY · MASTER',
        title: '계열사 관리',
        description: '탑에너지 그룹 — 계열사 기준정보. 사업자번호 + 계열코드. 모든 모듈에 반영됩니다.',
      },
      // 컬럼 변경 — 'company_code' 라벨을 '계열코드'로
      columns: [
        { key: 'company_name', label: '계열사명', sortable: true },
        { key: 'company_code', label: '계열코드', className: 'font-mono', sortable: true },
        { key: 'business_number', label: '사업자번호', className: 'font-mono', hideable: true },
        { key: 'is_active', label: '상태', rendererId: 'active_badge', sortable: true },
      ],
    },
    // 은행 — title 만 변경
    banks: {
      page: {
        eyebrow: 'TOPENERGY · MASTER',
        title: '계열사 은행 관리',
        description: '탑에너지 — 그룹 LC 한도 통합 관리. 활성 은행만 한도 집계에 반영됩니다.',
      },
    },
    // 발전소 — 명칭 변경
    construction_sites: {
      page: {
        eyebrow: 'TOPENERGY · MASTER',
        title: '에너지 자산 관리',
        description: '탑에너지 — 계열 발전소 자산 + 설비용량(MW) + 운영 일정.',
      },
    },
  },
  forms: {
    // 법인 폼 제목 변경
    company_form_v2: {
      title: { create: '계열사 등록', edit: '계열사 수정' },
    },
    // 발전소 폼 제목 변경
    construction_site_form_v2: {
      title: { create: '에너지 자산 등록', edit: '에너지 자산 수정' },
    },
  },
};
