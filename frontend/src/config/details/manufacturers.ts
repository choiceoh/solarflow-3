// 제조사 master 상세 — bank 패턴 복제.
//
// 메타 인프라 검증 항목:
// - inlineEdit (name_kr / short_name 표시명 변경)
// - priority_rank / domestic_foreign 는 시스템 동작 영향 → form 으로만 변경.

import type { MetaDetailConfig } from '@/templates/types';

const manufacturerDetailConfig: MetaDetailConfig = {
  id: 'manufacturer_detail',
  source: { hookId: 'useManufacturerDetail' },
  header: {
    title: '제조사 상세',
  },
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/manufacturers/:id',
    idField: 'manufacturer_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        {
          key: 'name_kr',
          label: '제조사명 (한글)',
          span: 2,
          inlineEditable: true,
          inlineEditType: 'text',
        },
        {
          key: 'short_name',
          label: '약칭',
          inlineEditable: true,
          inlineEditType: 'text',
        },
        { key: 'priority_rank', label: '표시 순위' },
        { key: 'name_en', label: '제조사명 (영문)', span: 2 },
        { key: 'country', label: '국가' },
        { key: 'domestic_foreign', label: '국내/해외' },
        {
          key: 'is_active',
          label: '활성',
          formatter: 'enum',
          enumKey: 'BANK_ACTIVE_LABEL',
        },
      ],
    },
  ],
};

export default manufacturerDetailConfig;
