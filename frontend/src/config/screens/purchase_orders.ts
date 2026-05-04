// 발주(PO) 목록 — 메타 ListScreen.
// 신규 등록·수정은 도메인 다이얼로그(/procurement → POCreateDialog)에서 처리. 메타 폼 미지원 (라인 N개 동적 폼은 메타 인프라 범위 외).
// 듀얼 product GUI 메타 편집기에서 PO entity로 인지·필터·검색·status 컬럼 가능.

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'purchase_orders',
  page: {
    eyebrow: 'PROCUREMENT',
    title: '발주(PO) 목록',
    description: '발주 계약 — 메타 인프라로 그린 읽기 화면. 신규 등록·라인 편집은 /procurement에서 처리.',
  },
  source: { hookId: 'usePOList' },
  requiresCompany: true,
  filters: [
    {
      key: 'status',
      label: '상태',
      type: 'select',
      optionsFrom: 'enum',
      enumKey: 'PO_STATUS_LABEL',
    },
    {
      key: 'manufacturer_id',
      label: '제조사',
      type: 'select',
      optionsFrom: 'master',
      masterKey: 'manufacturers',
    },
    {
      key: 'contract_type',
      label: '계약유형',
      type: 'select',
      optionsFrom: 'enum',
      enumKey: 'CONTRACT_TYPE_LABEL',
    },
  ],
  searchable: {
    placeholder: 'PO번호, 제조사 검색',
    fields: ['po_number', 'manufacturer_name'],
  },
  metrics: [
    { label: '전체 PO', computerId: 'count', tone: 'solar', spark: 'auto' },
    { label: '진행 MW', unit: 'MW', computerId: 'sum.po_total_mw', tone: 'info', spark: 'auto' },
  ],
  columns: [
    { key: 'po_number', label: '발주번호' },
    { key: 'manufacturer_name', label: '제조사', fallback: '—' },
    { key: 'contract_type', label: '유형', rendererId: 'contract_type_pill' },
    { key: 'contract_date', label: '계약일', formatter: 'date' },
    { key: 'total_qty', label: '수량', align: 'right', className: 'tabular-nums', formatter: 'number' },
    { key: 'total_mw', label: 'MW', align: 'right', className: 'tabular-nums', formatter: 'number' },
    { key: 'status', label: '상태', rendererId: 'po_status_badge' },
  ],
  actions: [],
  // 행 클릭 → 메타 상세 화면 (config/details/purchase_orders.ts)
  onRowClick: { kind: 'detail', detailId: 'purchase_order', idField: 'po_id' },
  emptyState: { message: '등록된 PO가 없습니다 — /procurement에서 신규 등록하세요' },
  tableSubFromTotal: true,
};

export default config;
