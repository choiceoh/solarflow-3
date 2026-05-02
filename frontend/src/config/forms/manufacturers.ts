// Phase 4: 제조사(manufacturers) 마스터 메타 폼
// 기존 ManufacturerForm.tsx (zod 직접 정의 + 6 필드)를 메타로 표현.

import type { MetaFormConfig } from '@/templates/types';

const manufacturerForm: MetaFormConfig = {
  id: 'manufacturer_form_v2',
  title: { create: '제조사 등록', edit: '제조사 수정' },
  sections: [
    {
      cols: 1,
      fields: [
        { key: 'name_kr', label: '제조사명(한)', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'name_en', label: '제조사명(영)', type: 'text' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'short_name', label: '약칭 (화면 표시용 · 예: 진코, 론지, 트리나)', type: 'text', maxLength: 20 },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'priority_rank', label: '표시순위 (낮을수록 드롭다운 위에 표시)', type: 'number',
          required: true, minValue: 1, defaultValue: 999,
        },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'country', label: '국가', type: 'text', required: true },
        {
          key: 'domestic_foreign', label: '국내/해외', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: '국내', label: '국내' },
            { value: '해외', label: '해외' },
          ],
        },
      ],
    },
  ],
};

export default manufacturerForm;
