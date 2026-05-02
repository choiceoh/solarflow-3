// Phase 4 — Step 3 prep 인프라 통합 데모
// child_array (#269) + contentBlock 슬롯 (#268) + fieldCascade (#272) 한 폼에서 모두 사용.

import type { MetaFormConfig } from '@/templates/types';

const config: MetaFormConfig = {
  id: 'meta_features_demo',
  title: { create: '메타 인프라 통합 데모', edit: '메타 인프라 통합 데모 (편집)' },
  dialogSize: 'xl',
  sections: [
    {
      title: '기본 정보',
      cols: 2,
      fields: [
        {
          key: 'po_id',
          label: 'PO 선택',
          type: 'select',
          required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'po-100', label: 'PO-100 (TOPCON 620W, USD)' },
            { value: 'po-200', label: 'PO-200 (HJT 580W, KRW)' },
          ],
          // cascadeId — 선택 시 manufacturer / currency 자동 채움
          cascadeId: 'demo_po_cascade',
        },
        {
          key: 'manufacturer',
          label: '제조사 (자동)',
          type: 'text',
          readOnly: true,
        },
        {
          key: 'currency',
          label: '통화 (자동)',
          type: 'text',
          readOnly: true,
        },
        { key: 'note', label: '메모', type: 'text', placeholder: '자유 입력' },
      ],
    },
    {
      // contentBlock 슬롯 — 임의 React 컴포넌트
      title: '커스텀 위젯 (contentBlock 슬롯)',
      contentBlock: { blockId: 'demo_status_widget' },
    },
    {
      title: '입고 라인 (child_array)',
      fields: [
        {
          key: 'lines',
          type: 'child_array',
          label: '품목 라인',
          addLabel: '+ 라인 추가',
          childCols: 4,
          childFields: [
            { key: 'product_code', label: '품번', type: 'text', placeholder: 'JKO-N620' },
            { key: 'quantity', label: '수량', type: 'number', required: true },
            { key: 'capacity_kw', label: '용량 kW', type: 'number' },
            {
              key: 'item_type', label: '구분', type: 'select',
              staticOptions: [
                { value: 'main', label: '메인' },
                { value: 'spare', label: '스페어' },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export default config;
