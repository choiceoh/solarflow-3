// 신용장(LC) 메타 상세 — 메타 인프라로 그린 읽기·인라인편집 화면.
// 라인(분할 인수) 편집은 별도(/procurement → LCLineEditDialog)에서 처리.

import type { MetaDetailConfig } from '@/templates/types';

const config: MetaDetailConfig = {
  id: 'lc_detail',
  source: { hookId: 'useLCDetail' },
  header: {
    title: 'L/C 상세',
  },
  // PATCH /api/v1/lcs/:id — UpdateLCRequest는 모든 필드 optional이라 partial 지원.
  inlineEdit: {
    enabled: true,
    endpoint: '/api/v1/lcs/:id',
    idField: 'lc_id',
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      fields: [
        {
          key: 'lc_number',
          label: 'L/C No.',
          inlineEditable: true,
          inlineEditType: 'text',
          fallback: '—',
        },
        { key: 'po_id', label: '발주(PO) ID', span: 2 },
        { key: 'status', label: '상태', formatter: 'enum', enumKey: 'LC_STATUS_LABEL' },
        {
          key: 'open_date',
          label: '개설일',
          formatter: 'date',
          inlineEditable: true,
          inlineEditType: 'date',
          fallback: '—',
        },
        { key: 'amount_usd', label: '금액(USD)', formatter: 'currency', suffix: ' USD' },
        { key: 'target_qty', label: '대상 수량', formatter: 'number', fallback: '—' },
        { key: 'target_mw', label: '대상 MW', formatter: 'number', fallback: '—' },
      ],
    },
    {
      title: '유산스 / 만기',
      cols: 4,
      fields: [
        {
          key: 'usance_days',
          label: '유산스(일)',
          formatter: 'number',
          inlineEditable: true,
          inlineEditType: 'number',
          fallback: '—',
        },
        { key: 'usance_type', label: '유산스 유형', fallback: '—' },
        {
          key: 'maturity_date',
          label: '만기일',
          formatter: 'date',
          inlineEditable: true,
          inlineEditType: 'date',
          fallback: '—',
        },
        {
          key: 'settlement_date',
          label: '결제일',
          formatter: 'date',
          inlineEditable: true,
          inlineEditType: 'date',
          fallback: '—',
        },
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

export default config;
