// 품번(products) master 상세 — bank/manufacturer 패턴 복제.
// 라인 N개나 복잡 위젯 없는 단일행 마스터라 메타 인프라가 풀 커버.
// PATCH /api/v1/products/:id 가 partial update 지원해야 인라인 편집 동작.

import type { MetaDetailConfig } from '@/templates/types';

const productDetailConfig: MetaDetailConfig = {
  id: 'product_detail',
  source: { hookId: 'useProductDetail' },
  header: {
    title: '품번 상세',
  },
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/products/:id',
    idField: 'product_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'product_code', label: '품번코드', span: 2 },
        {
          key: 'product_name',
          label: '제품명',
          span: 2,
          inlineEditable: true,
          inlineEditType: 'text',
        },
        { key: 'manufacturers.name_kr', label: '제조사', fallback: '—', span: 2 },
        { key: 'series_name', label: '시리즈명', inlineEditable: true, inlineEditType: 'text', fallback: '—' },
        {
          key: 'is_active',
          label: '활성',
          formatter: 'enum',
          enumKey: 'BANK_ACTIVE_LABEL',
        },
      ],
    },
    {
      title: '규격',
      cols: 4,
      fields: [
        { key: 'spec_wp', label: '정격 출력(Wp)', formatter: 'number', suffix: ' Wp' },
        { key: 'wattage_kw', label: '출력(kW)', formatter: 'number' },
        { key: 'module_width_mm', label: '폭(mm)', formatter: 'number' },
        { key: 'module_height_mm', label: '높이(mm)', formatter: 'number' },
        { key: 'module_depth_mm', label: '두께(mm)', formatter: 'number', fallback: '—' },
        { key: 'weight_kg', label: '무게(kg)', formatter: 'number', fallback: '—' },
      ],
    },
    {
      title: '구성',
      cols: 4,
      fields: [
        { key: 'wafer_platform', label: '웨이퍼', fallback: '—' },
        { key: 'cell_config', label: '셀 구성', fallback: '—' },
      ],
    },
    {
      title: '비고',
      cols: 1,
      fields: [
        {
          key: 'memo',
          label: '메모',
          inlineEditable: true,
          inlineEditType: 'text',
          fallback: '메모 없음 — 클릭하여 추가',
        },
      ],
    },
  ],
};

export default productDetailConfig;
