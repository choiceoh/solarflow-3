// Phase 4 보강: BL 라인 아이템(BLLineForm) 메타화
// 기존 BLLineForm.tsx (225 줄, 직접 zod) → 메타 config (~70 줄)
//
// 단순화 영역 (메타 한계선):
//   - 통화별 (USD/KRW) 조건부 노출 → 모든 단가 필드 표시 (운영자가 적절 입력)
//   - 무상(payment_type=free) 시 단가 readOnly → 일반 readOnly 만 (조건부 readOnly 미지원)
//   - manufacturer_id 로 product 필터 → products.search (전체 검색, 운영자가 식별)

import type { MetaFormConfig } from '@/templates/types';

const blLineForm: MetaFormConfig = {
  id: 'bl_line_form_v2',
  title: { create: '입고품목 추가', edit: '입고품목 수정' },
  dialogSize: 'lg',
  extraPayload: {
    fromContext: ['bl_id'],
    static: { usage_category: 'sale' },
  },
  draftAutoSave: true,
  sections: [
    {
      cols: 1,
      fields: [
        {
          key: 'product_id', label: '품번', type: 'select', required: true,
          optionsFrom: 'master',
          masterKey: 'products.search',
          placeholder: '품번/품명/제조사로 검색',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'quantity', label: '수량', type: 'number', required: true, minValue: 0.001 },
        // 자동: 수량 × spec_wp / 1000 (재사용 — cost_capacity_kw 와 동일 공식)
        {
          key: 'capacity_kw', label: '용량 (kW, 자동)', type: 'computed',
          formula: { computerId: 'cost_capacity_kw' },
          dependsOn: ['quantity', 'product_id'],
          formatter: 'number',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        {
          key: 'item_type', label: '구분', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'main', label: '본품' },
            { value: 'spare', label: '스페어' },
          ],
          defaultValue: 'main',
        },
        {
          key: 'payment_type', label: '유/무상', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'paid', label: '유상' },
            { value: 'free', label: '무상' },
          ],
          defaultValue: 'paid',
        },
      ],
    },
    {
      title: '단가',
      tone: 'info',
      cols: 1,
      fields: [
        {
          key: 'invoice_amount_usd', label: 'Invoice 금액 (USD)', type: 'number', minValue: 0,
          description: 'USD 통화 BL 일 때 입력. 무상 시 비워두기.',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        {
          key: 'unit_price_usd_wp', label: '단가 (USD/Wp)', type: 'number', minValue: 0,
          description: 'USD 통화 BL.',
        },
        {
          key: 'unit_price_krw_wp', label: '단가 (KRW/Wp)', type: 'number', minValue: 0,
          description: 'KRW 통화 BL.',
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

export default blLineForm;
