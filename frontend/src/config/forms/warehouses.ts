// Phase 4: 창고(warehouses) 마스터 메타 폼
// 기존 WarehouseForm.tsx (zod 직접 정의 + 5 필드)를 메타로 표현.
// 4자리 코드 검증은 minLength=maxLength=4로 표현.

import type { MetaFormConfig } from '@/templates/types';

const warehouseForm: MetaFormConfig = {
  id: 'warehouse_form_v2',
  title: { create: '창고 등록', edit: '창고 수정' },
  sections: [
    {
      cols: 2,
      fields: [
        // 4자 코드는 입출고·재고 추적의 cross-reference 키 → admin 만 편집
        { key: 'warehouse_code', label: '창고코드 (4자)', type: 'text', required: true, minLength: 4, maxLength: 4, editableByRoles: ['admin'] },
        { key: 'warehouse_name', label: '창고명', type: 'text', required: true },
      ],
    },
    {
      cols: 1,
      fields: [
        {
          key: 'warehouse_type', label: '유형', type: 'select', required: true,
          optionsFrom: 'static',
          staticOptions: [
            { value: 'port', label: '항구' },
            { value: 'factory', label: '공장' },
            { value: 'vendor', label: '업체' },
          ],
        },
      ],
    },
    {
      cols: 2,
      fields: [
        // 4자 코드는 입출고·재고 추적의 cross-reference 키 → admin 만 편집
        { key: 'location_code', label: '장소코드 (4자)', type: 'text', required: true, minLength: 4, maxLength: 4, editableByRoles: ['admin'] },
        { key: 'location_name', label: '장소명', type: 'text', required: true },
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

export default warehouseForm;
