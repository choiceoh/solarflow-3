// Phase 4: 발전소(construction-sites) 마스터 메타 폼 — 마지막 마스터 도메인
// 기존 ConstructionSitesPage 의 SiteFormDialog (8 필드) 를 메타로 표현.
// company_id 는 페이지가 직접 합치던 패턴 → extraPayload.fromStore 로 자동 첨가.

import type { MetaFormConfig } from '@/templates/types';

const constructionSiteForm: MetaFormConfig = {
  id: 'construction_site_form_v2',
  title: { create: '새 현장 등록', edit: '현장 수정' },
  // Phase 4 보강: 외부 컨텍스트 자동 첨가 (selectedCompanyId → company_id)
  extraPayload: {
    fromStore: { company_id: 'selectedCompanyId' },
  },
  // 다이얼로그 크기 — 3컬럼 행 표현 위해 lg
  dialogSize: 'lg',
  // 신규 등록 시 입력 보호 — 페이지 떠나도 복구
  draftAutoSave: true,
  sections: [
    {
      title: '기본 정보',
      tone: 'ink',
      cols: 1,
      fields: [
        { key: 'name', label: '발전소명', type: 'text', required: true, placeholder: '예) 영광 갈동 태양광 1호기' },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'location', label: '지명', type: 'text', placeholder: '예) 전남 영광군 갈동리' },
        {
          key: 'site_type', label: '현장 유형', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'own', label: '자체 현장' },
            { value: 'epc', label: '타사 EPC' },
          ],
          defaultValue: 'own',
        },
      ],
    },
    {
      title: '용량 · 일정',
      tone: 'solar',
      cols: 3,
      fields: [
        { key: 'capacity_mw', label: '설비용량 (MW)', type: 'number', minValue: 0, placeholder: '예) 5.0' },
        { key: 'started_at', label: '착공일', type: 'date' },
        { key: 'completed_at', label: '준공일', type: 'date' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'notes', label: '메모', type: 'text', placeholder: '특이사항 등' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'is_active', label: '활성', type: 'switch', defaultValue: true },
      ],
    },
  ],
};

export default constructionSiteForm;
