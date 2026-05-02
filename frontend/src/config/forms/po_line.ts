// Phase 4 보강: PO 라인 아이템 폼 메타화 (POLineForm.tsx 변환)
// child 라인 폼의 첫 메타 변환 — extraPayload + computed 활용 시연.
//
// 기존 POLineForm.tsx (102 줄) → 메타 config (~55 줄) + 코드 영역(stripEmpty 처리만 페이지가)

import type { MetaFormConfig } from '@/templates/types';

const poLineForm: MetaFormConfig = {
  id: 'po_line_form_v2',
  title: { create: '라인 추가', edit: '라인 수정' },
  // 부모 PO 의 id 를 페이지 props 로 전달 → payload 에 자동 첨가
  extraPayload: {
    fromContext: ['po_id'],
  },
  dialogSize: 'md',
  sections: [
    {
      cols: 1,
      fields: [
        // 품번 — products.search masterSource (combobox + 디바운스)
        // resolveLabel 로 편집 모드 prefill, search 부수효과로 product 캐시 채움.
        {
          key: 'product_id', label: '품번', type: 'select', required: true,
          optionsFrom: 'master',
          masterKey: 'products.search',
          placeholder: '품번 코드/이름/제조사 약칭으로 검색',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'quantity', label: '수량', type: 'number', required: true, minValue: 0.001 },
        {
          key: 'unit_price_usd', label: 'USD/Wp 단가', type: 'number', minValue: 0,
          placeholder: '예: 0.116',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        // 자동 계산: quantity * 제품 spec_wp * unit_price_usd
        // dependsOn 으로 변경 추적, formula 가 productCacheById 로 spec_wp lookup
        {
          key: 'total_amount_usd', label: '예상 총액 (USD, 자동)', type: 'computed',
          formula: { computerId: 'po_line_total_amount_usd' },
          dependsOn: ['quantity', 'unit_price_usd', 'product_id'],
          formatter: 'number',
          description: '품번 × 수량 × USD/Wp 단가 — 제품 spec_wp 자동 lookup.',
        },
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

export default poLineForm;
