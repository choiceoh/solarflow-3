// 은행 master 상세 — Phase 4 메타 인프라 의 첫 풀 도메인 적용 (bank-meta 브랜치 약속).
//
// 이 config 가 실제로 검증하는 신규 메타 인프라 항목:
// - tabs[]            (기본 정보 + L/C 사용 현황 두 탭)
// - inlineEdit        (수수료/메모 셀 클릭 → PATCH)
//   ※ backend 의 PATCH /api/v1/banks/:id 가 부분 업데이트 지원해야 함
// - maskByRoles       (LC 한도는 viewer/manager 에 ●●●●●● 표시)  ← form 측에서 적용 필요
// - permissionGuardId (admin 만 LC 한도 편집)                     ← form 측에서 적용 필요
//
// detail 자체는 입력 없이 표시 위주이므로 maskByRoles / permissionGuardId 는
// 실제론 form 에 살아 있다. detail 에선 inlineEditable 셀에서 admin 만 편집
// 가능한 정도가 demo. 본격 보안은 BankForm 에서 검증.

import type { MetaDetailConfig } from '@/templates/types';

const bankDetailConfig: MetaDetailConfig = {
  id: 'bank_detail',
  source: { hookId: 'useBankDetail' },
  header: {
    title: '은행 상세',
  },
  // 메타 인프라 확장: 인라인 편집 — 행 클릭 → input → blur/Enter 시 PATCH
  // PATCH /api/v1/banks/:id 가 partial 지원해야 함. 미지원 시 backend 추가 필요.
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/banks/:id',
    idField: 'bank_id',
  },
  // sections + tabs 둘 다 정의 — runtime 은 tabs 우선. sections 는 fallback.
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'bank_name', label: '은행명', span: 2 },
        { key: 'companies.company_name', label: '법인', fallback: '—' },
        { key: 'is_active', label: '활성', formatter: 'enum', enumKey: 'BANK_ACTIVE_LABEL' },
      ],
    },
  ],
  tabs: [
    {
      key: 'basic',
      label: '기본 정보',
      sections: [
        {
          title: '기본',
          cols: 4,
          fields: [
            { key: 'bank_name', label: '은행명', span: 2 },
            { key: 'companies.company_name', label: '법인' },
            {
              key: 'is_active',
              label: '활성',
              formatter: 'enum',
              enumKey: 'BANK_ACTIVE_LABEL',
            },
          ],
        },
        {
          title: 'L/C 한도',
          cols: 4,
          fields: [
            // lc_limit_usd — admin 외에는 마스킹 (form 의 maskByRoles 와 별개로
            // detail field 에는 maskByRoles 가 type 정의에 없음. detail 은 단순 표시.
            // 보안은 form 측에서 + 백엔드 RLS 가 정통).
            {
              key: 'lc_limit_usd',
              label: 'L/C 한도 (USD)',
              formatter: 'currency',
              suffix: ' USD',
              span: 2,
            },
            { key: 'limit_approve_date', label: '승인일', formatter: 'date' },
            { key: 'limit_expiry_date', label: '승인기한', formatter: 'date' },
          ],
        },
        {
          title: '수수료',
          cols: 4,
          fields: [
            // 인라인 편집 — admin 이 자주 변경
            {
              key: 'opening_fee_rate',
              label: '개설수수료율 (%)',
              formatter: 'number',
              suffix: '%',
              inlineEditable: true,
              inlineEditType: 'number',
            },
            {
              key: 'acceptance_fee_rate',
              label: '인수수수료율 (%)',
              formatter: 'number',
              suffix: '%',
              inlineEditable: true,
              inlineEditType: 'number',
            },
            { key: 'fee_calc_method', label: '계산 방법', span: 2 },
          ],
        },
        {
          title: '비고',
          fields: [
            {
              key: 'memo',
              label: '메모',
              inlineEditable: true,
              inlineEditType: 'text',
              fallback: '메모 없음 — 클릭하여 추가',
            },
          ],
        },
      ],
    },
    {
      key: 'lc_usage',
      label: 'L/C 사용 현황',
      sections: [
        {
          title: 'L/C 사용 요약',
          contentBlock: { blockId: 'bank_lc_usage_placeholder' },
        },
      ],
    },
  ],
  defaultTab: 'basic',
};

export default bankDetailConfig;
