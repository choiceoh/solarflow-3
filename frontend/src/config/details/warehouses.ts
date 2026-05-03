// 창고 master 상세 — bank 패턴 복제. 단순 master 라 single tab "기본 정보".
//
// 메타 인프라 검증 항목:
// - inlineEdit (warehouse_name / location_name 셀 클릭 → PATCH)
// - 코드 (warehouse_code / location_code) 는 immutable — admin 만 form 으로 변경.

import type { MetaDetailConfig } from '@/templates/types';

const warehouseDetailConfig: MetaDetailConfig = {
  id: 'warehouse_detail',
  source: { hookId: 'useWarehouseDetail' },
  header: {
    title: '창고 상세',
  },
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/warehouses/:id',
    idField: 'warehouse_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'warehouse_code', label: '창고 코드' },
        {
          key: 'warehouse_name',
          label: '창고명',
          span: 2,
          inlineEditable: true,
          inlineEditType: 'text',
        },
        {
          key: 'warehouse_type',
          label: '유형',
          rendererId: 'warehouse_type_badge',
        },
        { key: 'location_code', label: '위치 코드' },
        {
          key: 'location_name',
          label: '위치명',
          span: 2,
          inlineEditable: true,
          inlineEditType: 'text',
        },
        {
          key: 'is_active',
          label: '활성',
          formatter: 'enum',
          enumKey: 'BANK_ACTIVE_LABEL', // 같은 boolean → 활성/비활성 사전 재사용
        },
      ],
    },
  ],
};

export default warehouseDetailConfig;
