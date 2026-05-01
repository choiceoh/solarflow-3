// Phase 2 PoC: 거래처 폼 메타데이터 — 기존 PartnerForm을 메타로 표현
// 기존 PartnerForm.tsx는 보존. 이 config는 partner_form_v2로 등록되어 partners-v2 화면에서 사용.

import type { MetaFormConfig } from '@/templates/types';

const partnerForm: MetaFormConfig = {
  id: 'partner_form_v2',
  title: { create: '거래처 등록', edit: '거래처 수정' },
  sections: [
    {
      cols: 1,
      fields: [
        { key: 'partner_name', label: '거래처명', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'partner_type', label: '유형', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'supplier', label: '공급사' },
            { value: 'customer', label: '고객사' },
            { value: 'both', label: '공급+고객' },
          ],
        },
      ],
    },
    {
      cols: 2,
      fields: [
        // Phase 2.3: ERP코드는 admin만 편집 가능 (다른 역할은 자동 readOnly)
        { key: 'erp_code', label: 'ERP코드', type: 'text', editableByRoles: ['admin'] },
        // Phase 2.3: 결제조건은 고객/양방향 거래처에만 노출 (공급사 전용은 숨김)
        {
          key: 'payment_terms', label: '결제조건', type: 'text',
          visibleIf: { field: 'partner_type', value: ['customer', 'both'] },
        },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'contact_name', label: '담당자', type: 'text' },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'contact_phone', label: '연락처', type: 'text' },
        {
          key: 'contact_email', label: '이메일', type: 'text',
          pattern: { regex: '^$|^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$', message: '올바른 이메일 형식이 아닙니다' },
        },
      ],
    },
  ],
};

export default partnerForm;
