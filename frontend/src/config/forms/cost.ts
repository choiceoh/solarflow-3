// Phase 4 보강: 면장 원가(CostForm) 메타화 — 가장 복잡한 child 라인 폼
// 기존 CostForm.tsx (249 줄, 직접 zod + 4 자동계산) → 메타 config (~120 줄).
// 17 필드 + 3 Stage 섹션 (FOB/CIF/Landed) + 4 computed + 1 master combobox.
//
// extraPayload.fromContext: ['declaration_id'] — 부모 면장 ID 자동 첨가.
// computed dependsOn 으로 입력 변경 시 즉시 재계산.

import type { MetaFormConfig } from '@/templates/types';

const costForm: MetaFormConfig = {
  id: 'cost_form_v2',
  title: { create: '원가 추가', edit: '원가 수정' },
  // 큰 폼 — 2xl 다이얼로그 (3 컬럼 행 + 4 섹션)
  dialogSize: '2xl',
  extraPayload: {
    fromContext: ['declaration_id'],
  },
  draftAutoSave: true,
  sections: [
    {
      title: '기본 정보',
      tone: 'ink',
      cols: 1,
      fields: [
        {
          key: 'product_id', label: '품목', type: 'select', required: true,
          optionsFrom: 'master',
          masterKey: 'products.search',
          placeholder: '품목 검색 (품번/품명/제조사)',
        },
      ],
    },
    {
      cols: 3,
      fields: [
        { key: 'quantity', label: '수량', type: 'number', required: true, minValue: 1 },
        // 자동: 수량 × spec_wp / 1000
        {
          key: 'capacity_kw', label: '용량 (kW, 자동)', type: 'computed',
          formula: { computerId: 'cost_capacity_kw' },
          dependsOn: ['quantity', 'product_id'],
          formatter: 'number',
        },
        { key: 'exchange_rate', label: '환율', type: 'number', required: true, minValue: 0, placeholder: '예: 1450.30' },
      ],
    },
    {
      title: 'Stage 1: FOB',
      tone: 'solar',
      cols: 3,
      fields: [
        { key: 'fob_unit_usd', label: 'FOB 단가 (cent/Wp)', type: 'number', minValue: 0 },
        { key: 'fob_total_usd', label: 'FOB 합계 ($)', type: 'number', minValue: 0 },
        { key: 'fob_wp_krw', label: 'FOB 원/Wp', type: 'number', minValue: 0 },
      ],
    },
    {
      title: 'Stage 2: CIF',
      tone: 'info',
      cols: 3,
      fields: [
        {
          key: 'cif_total_krw', label: 'CIF 합계 KRW', type: 'number', required: true, minValue: 0,
          numberFormat: 'krw',
        },
        { key: 'cif_unit_usd', label: 'CIF 단가 USD', type: 'number', minValue: 0 },
        { key: 'cif_total_usd', label: 'CIF 합계 USD', type: 'number', minValue: 0 },
      ],
    },
    {
      cols: 1,
      fields: [
        // 자동: cif_total_krw / (수량 × spec_wp)
        {
          key: 'cif_wp_krw', label: 'CIF Wp 단가 (원/Wp, 자동)', type: 'computed',
          formula: { computerId: 'cost_cif_wp_krw' },
          dependsOn: ['cif_total_krw', 'quantity', 'product_id'],
          formatter: 'number',
          description: 'CIF 합계 KRW ÷ (수량 × 제품 spec_wp). product 캐시 동기 lookup.',
        },
      ],
    },
    {
      title: 'Stage 3: Landed',
      tone: 'pos',
      cols: 3,
      fields: [
        { key: 'tariff_rate', label: '관세율 (%)', type: 'number', minValue: 0 },
        { key: 'tariff_amount', label: '관세액', type: 'number', minValue: 0, numberFormat: 'krw' },
        { key: 'vat_amount', label: '부가세 (VAT)', type: 'number', minValue: 0, numberFormat: 'krw' },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'customs_fee', label: '통관수수료', type: 'number', minValue: 0, numberFormat: 'krw' },
        { key: 'incidental_cost', label: '부대비용', type: 'number', minValue: 0, numberFormat: 'krw' },
      ],
    },
    {
      cols: 2,
      fields: [
        // 자동: cif + tariff + customs + incidental (VAT 제외 — 회수 가능)
        {
          key: 'landed_total_krw', label: 'Landed 합계 KRW (자동)', type: 'computed',
          formula: { computerId: 'cost_landed_total_krw' },
          dependsOn: ['cif_total_krw', 'tariff_amount', 'customs_fee', 'incidental_cost'],
          formatter: 'number',
        },
        // 자동: landed_total / (수량 × spec_wp)
        {
          key: 'landed_wp_krw', label: 'Landed Wp 단가 (원/Wp, 자동)', type: 'computed',
          formula: { computerId: 'cost_landed_wp_krw' },
          dependsOn: ['cif_total_krw', 'tariff_amount', 'customs_fee', 'incidental_cost', 'quantity', 'product_id'],
          formatter: 'number',
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

export default costForm;
