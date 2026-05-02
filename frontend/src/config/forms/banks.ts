// Phase 4: 은행(banks) 마스터 메타 폼
// 기존 BankForm.tsx (zod 직접 정의 + 9 필드)를 메타로 표현.
// 법인 select는 masterKey='companies' (registry.masterSources)에서 옵션 로드.

import type { MetaFormConfig } from '@/templates/types';

const bankForm: MetaFormConfig = {
  id: 'bank_form_v2',
  title: { create: '은행 등록', edit: '은행 수정' },
  sections: [
    {
      cols: 1,
      fields: [
        {
          key: 'company_id', label: '법인', type: 'select', required: true,
          optionsFrom: 'master', masterKey: 'companies',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'bank_name', label: '은행명', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'lc_limit_usd', label: 'LC 한도(USD)', type: 'number', required: true, minValue: 0 },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'limit_approve_date', label: '승인일', type: 'date' },
        { key: 'limit_expiry_date', label: '승인기한', type: 'date' },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'opening_fee_rate', label: '개설수수료율(%)', type: 'number', minValue: 0 },
        { key: 'acceptance_fee_rate', label: '인수수수료율(%)', type: 'number', minValue: 0 },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'fee_calc_method', label: '수수료 계산방식', type: 'text' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'memo', label: '메모', type: 'textarea' },
      ],
    },
  ],
};

export default bankForm;
