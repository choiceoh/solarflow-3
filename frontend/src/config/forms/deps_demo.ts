// Phase 4 보강: MetaForm 의존성·동적 옵션 시연 폼 (저장 없음 — UI 데모 전용)
// 두 기능 동시 시연:
//   1) visibleIf — has_warranty=true 시 warranty_months 노출
//      domestic_filter !== '전체' 시 manufacturer_id 노출
//   2) optionsDependsOn — manufacturer_id 옵션이 domestic_filter 값에 따라 필터됨
//      (manufacturers.byDomestic master 소스가 context.domestic_foreign 사용)

import type { MetaFormConfig } from '@/templates/types';

const depsDemo: MetaFormConfig = {
  id: 'deps_demo',
  title: { create: '의존성 데모', edit: '의존성 데모' },
  sections: [
    {
      cols: 1,
      fields: [
        { key: 'product_name', label: '제품명', type: 'text', required: true, placeholder: '예: 데모 모듈' },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'domestic_filter', label: '제조사 범위',
          type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: '전체', label: '전체' },
            { value: '국내', label: '국내만' },
            { value: '해외', label: '해외만' },
          ],
          defaultValue: '전체',
        },
      ],
    },
    {
      cols: 1,
      fields: [
        // 동적 옵션 — domestic_filter 값에 따라 옵션 변경
        // visibleIf — 전체일 때도 노출하되, 옵션이 동적으로 바뀌는지 시연
        {
          key: 'manufacturer_id', label: '제조사', type: 'select', required: true,
          optionsFrom: 'master',
          masterKey: 'manufacturers.byDomestic',
          optionsDependsOn: ['domestic_filter'],
        },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'has_warranty', label: '보증 포함', type: 'switch', defaultValue: false },
      ],
    },
    {
      cols: 1,
      fields: [
        // 의존성 필드 — has_warranty=true 일 때만 노출
        {
          key: 'warranty_months', label: '보증 개월 수', type: 'number', minValue: 1, maxValue: 240,
          visibleIf: { field: 'has_warranty', value: 'true' },
        },
      ],
    },
  ],
};

export default depsDemo;
