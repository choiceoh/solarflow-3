// 발주(PO) 메타 상세 — 메타 인프라로 그린 읽기·인라인편집 화면.
// 라인 N개·LC·TT 등 복잡 위젯은 별도(/procurement → PODetailView)에서 다루고,
// 본 메타 상세는 헤더값(계약일·인코텀즈·결제조건·메모) 등 인라인 편집에 집중.

import type { MetaDetailConfig } from '@/templates/types';

const config: MetaDetailConfig = {
  id: 'purchase_order_detail',
  source: { hookId: 'usePODetail' },
  header: {
    title: 'PO 상세',
  },
  // PATCH /api/v1/pos/:id — UpdatePurchaseOrderRequest는 모든 필드 optional이라 partial 지원.
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/pos/:id',
    idField: 'po_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        { key: 'po_number', label: '발주번호', span: 2 },
        { key: 'manufacturer_name', label: '제조사', fallback: '—' },
        { key: 'status', label: '상태', formatter: 'enum', enumKey: 'PO_STATUS_LABEL' },
        {
          key: 'contract_type',
          label: '계약유형',
          formatter: 'enum',
          enumKey: 'CONTRACT_TYPE_LABEL',
        },
        {
          key: 'contract_date',
          label: '계약일',
          formatter: 'date',
          inlineEditable: true,
          inlineEditType: 'date',
        },
        {
          key: 'incoterms',
          label: '인코텀즈',
          inlineEditable: true,
          inlineEditType: 'text',
          fallback: '—',
        },
        {
          key: 'payment_terms',
          label: '결제조건',
          inlineEditable: true,
          inlineEditType: 'text',
          fallback: '—',
        },
      ],
    },
    {
      title: '계약 기간 / 수량',
      cols: 4,
      fields: [
        {
          key: 'contract_period_start',
          label: '계약 시작일',
          formatter: 'date',
          inlineEditable: true,
          inlineEditType: 'date',
          fallback: '—',
        },
        {
          key: 'contract_period_end',
          label: '계약 종료일',
          formatter: 'date',
          inlineEditable: true,
          inlineEditType: 'date',
          fallback: '—',
        },
        { key: 'total_qty', label: '수량', formatter: 'number', fallback: '—' },
        { key: 'total_mw', label: 'MW', formatter: 'number', fallback: '—' },
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
    {
      title: '라인 (품목 명세)',
      contentBlock: { blockId: 'po_lines_block' },
    },
  ],
};

export default config;
