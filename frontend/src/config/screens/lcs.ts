// 신용장(LC) 목록 — 메타 ListScreen.
// 신규 등록·라인 편집은 도메인 다이얼로그(/procurement → LCCreateDialog / LCLineEditDialog).
// 듀얼 product GUI 메타 편집기에서 LC entity 인지·필터·status 컬럼.

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'lcs',
  page: {
    eyebrow: 'PROCUREMENT',
    title: '신용장(L/C) 목록',
    description: 'L/C 개설 내역 — 메타 인프라로 그린 읽기 화면. 신규 등록·라인 분할은 /procurement에서 처리.',
  },
  source: { hookId: 'useLCList' },
  requiresCompany: true,
  filters: [
    {
      key: 'status',
      label: '상태',
      type: 'select',
      optionsFrom: 'enum',
      enumKey: 'LC_STATUS_LABEL',
    },
    {
      key: 'bank_id',
      label: '은행',
      type: 'select',
      optionsFrom: 'master',
      masterKey: 'banks.byCompany',
    },
  ],
  searchable: {
    placeholder: 'L/C No, PO번호, 은행 검색',
    fields: ['lc_number', 'po_number', 'bank_name'],
  },
  metrics: [
    { label: '전체 LC', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '개설 USD', unit: 'M USD', computerId: 'sum.lc_amount_usd_million', tone: 'info', spark: 'auto' },
  ],
  columns: [
    { key: 'lc_number', label: 'L/C No.', fallback: '—' },
    { key: 'po_number', label: '발주번호', fallback: '—' },
    { key: 'bank_name', label: '은행', fallback: '—' },
    { key: 'open_date', label: '개설일', formatter: 'date' },
    { key: 'amount_usd', label: '금액(USD)', align: 'right', className: 'tabular-nums', formatter: 'number' },
    { key: 'usance_days', label: '유산스(일)', align: 'right', className: 'tabular-nums', fallback: '—' },
    { key: 'maturity_date', label: '만기일', formatter: 'date' },
    { key: 'status', label: '상태' },
  ],
  actions: [],
  emptyState: { message: '등록된 L/C가 없습니다 — /procurement에서 신규 등록하세요' },
  tableSubFromTotal: true,
};

export default config;
