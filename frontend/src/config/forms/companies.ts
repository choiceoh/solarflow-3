// Phase 4: 법인(companies) 마스터 메타 폼
// 기존 CompanyForm.tsx (zod 직접 정의)을 메타로 표현. 3 필드 — 단순 마스터 표본.

import type { MetaFormConfig } from '@/templates/types';

const companyForm: MetaFormConfig = {
  id: 'company_form_v2',
  title: { create: '법인 등록', edit: '법인 수정' },
  sections: [
    {
      cols: 1,
      fields: [
        { key: 'company_name', label: '법인명', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        // 법인코드는 모든 모듈에서 cross-reference 키로 사용 → admin 만 편집
        { key: 'company_code', label: '법인코드', type: 'text', required: true, editableByRoles: ['admin'] },
      ],
    },
    {
      cols: 1,
      fields: [
        // 사업자번호는 세무·법적 식별자 → admin 만 편집
        { key: 'business_number', label: '사업자번호', type: 'text', editableByRoles: ['admin'] },
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

export default companyForm;
