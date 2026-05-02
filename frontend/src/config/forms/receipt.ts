// Phase 4 보강: 수금(ReceiptForm) 메타화
// 기존 ReceiptForm.tsx (135 줄, PartnerCombobox 사용) → 메타 config (~50 줄)

import type { MetaFormConfig } from '@/templates/types';

const receiptForm: MetaFormConfig = {
  id: 'receipt_form_v2',
  title: { create: '수금 등록', edit: '수금 수정' },
  dialogSize: 'lg',
  extraPayload: {
    fromStore: { company_id: 'selectedCompanyId' },
  },
  draftAutoSave: true,
  sections: [
    {
      cols: 1,
      fields: [
        {
          key: 'customer_id', label: '거래처', type: 'select', required: true,
          optionsFrom: 'master',
          masterKey: 'partners.customer',
          placeholder: '거래처 선택',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'receipt_date', label: '입금일', type: 'date', required: true, defaultValue: '@today' },
        {
          key: 'amount', label: '입금액', type: 'number', required: true, minValue: 1,
          numberFormat: 'krw',
          placeholder: '0',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'bank_account', label: '입금계좌', type: 'text' },
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

export default receiptForm;
