// Phase 4: 제품(products / 품번) 마스터 메타 폼
// 기존 ProductForm.tsx (zod 직접 정의 + 13 필드)를 메타로 표현.
// 메타 인프라 최대 복잡도 케이스 — 제조사 masterKey + 6개 number 필드 + textarea.
// 필수 number(spec_wp/wattage_kw/모듈치수)에 minValue=0.001로 양수 강제.

import type { MetaFormConfig } from '@/templates/types';

const productForm: MetaFormConfig = {
  id: 'product_form_v2',
  title: { create: '품번 등록', edit: '품번 수정' },
  sections: [
    {
      cols: 2,
      fields: [
        // 품번코드는 입출고·수주·재고에서 cross-reference 키로 사용 → admin 만 편집
        { key: 'product_code', label: '품번코드', type: 'text', required: true, editableByRoles: ['admin'] },
        { key: 'product_name', label: '품명', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'manufacturer_id', label: '제조사', type: 'select', required: true,
          optionsFrom: 'master', masterKey: 'manufacturers',
        },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'spec_wp', label: '규격(Wp)', type: 'number', required: true, minValue: 0.001 },
        { key: 'wattage_kw', label: '용량(kW)', type: 'number', required: true, minValue: 0.001 },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'module_width_mm', label: '가로(mm)', type: 'number', required: true, minValue: 0.001 },
        { key: 'module_height_mm', label: '세로(mm)', type: 'number', required: true, minValue: 0.001 },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'module_depth_mm', label: '두께(mm)', type: 'number', minValue: 0 },
        { key: 'weight_kg', label: '무게(kg)', type: 'number', minValue: 0 },
      ],
    },
    {
      cols: 2,
      fields: [
        { key: 'wafer_platform', label: '웨이퍼 플랫폼', type: 'text' },
        { key: 'cell_config', label: '셀 구성', type: 'text' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'series_name', label: '시리즈명', type: 'text' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'memo', label: '메모', type: 'textarea' },
      ],
    },
    {
      cols: 1,
      fields: [
        { key: 'is_active', label: '활성', type: 'switch', defaultValue: true },
      ],
    },
  ],
};

export default productForm;
