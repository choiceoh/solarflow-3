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
        { key: 'company_code', label: '법인코드', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'business_number', label: '사업자번호', type: 'text' },
      ],
    },
  ],
};

export default companyForm;
