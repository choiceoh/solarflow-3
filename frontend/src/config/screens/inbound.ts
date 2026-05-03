// Phase 4 — Inbound Step 1: B/L 입고 관리 메타 config
// 기존 InboundPage.tsx + BLListTable.tsx 의 시각·필터·메트릭을 한 파일로.

import type { ListScreenConfig } from '@/templates/types';

const config: ListScreenConfig = {
  id: 'inbound',
  page: {
    eyebrow: 'INBOUND',
    title: 'B/L 입고 관리',
    description: '해외 수입과 국내 매입 입고를 한 곳에서 관리합니다.',
  },
  source: { hookId: 'useBLListWithAgg' },

  filters: [
    { key: 'inbound_type', label: '구분', type: 'select', optionsFrom: 'enum', enumKey: 'INBOUND_TYPE_LABEL', allLabel: '전체 구분' },
    { key: 'status', label: '상태', type: 'select', optionsFrom: 'enum', enumKey: 'BL_STATUS_LABEL', allLabel: '전체 상태' },
    { key: 'manufacturer_id', label: '제조사', type: 'select', optionsFrom: 'master', masterKey: 'manufacturers', allLabel: '전체 제조사' },
    { key: 'month', label: 'ETD 월', type: 'month', optionsFrom: 'months', monthsBack: 12, allLabel: '전체 기간' },
  ],

  metrics: [
    { label: 'B/L 건수', computerId: 'count', tone: 'solar' },
    { label: '해외직수입', computerId: 'count.bl_import', tone: 'info' },
    { label: '입고 완료', computerId: 'count.bl_completed', tone: 'pos', sub: '정산 가능' },
    { label: '진행중', computerId: 'count.bl_pending', tone: 'warn', sub: '입항/통관/창고' },
  ],

  columns: [
    { key: 'bl_number', label: 'B/L 번호', className: 'font-mono font-semibold' },
    { key: 'company_id', label: '법인', rendererId: 'bl_company_name' },
    { key: 'po_number', label: 'PO', className: 'font-mono' },
    { key: 'lc_number', label: 'LC', className: 'font-mono' },
    { key: 'manufacturer_name', label: '제조사' },
    { key: '_first_product', label: '대표 품목', rendererId: 'bl_first_product' },
    { key: '_total_mw', label: '총 MW', align: 'right', rendererId: 'bl_total_mw' },
    { key: '_avg_cents', label: '평균 ¢/Wp', align: 'right', rendererId: 'bl_avg_cents' },
    { key: 'inbound_type', label: '구분', rendererId: 'inbound_type_pill' },
    { key: 'status', label: '상태', rendererId: 'inbound_status_badge' },
    { key: 'etd', label: 'ETD', formatter: 'date' },
    { key: 'eta', label: 'ETA', formatter: 'date' },
    { key: 'actual_arrival', label: '입항', formatter: 'date' },
    { key: 'warehouse_name', label: '창고' },
    { key: 'invoice_number', label: '인보이스', className: 'font-mono' },
    { key: 'declaration_number', label: '면장번호', className: 'font-mono' },
    { key: 'memo', label: '메모' },
  ],

  onRowClick: { kind: 'detail', detailId: 'bl', idField: 'bl_id' },

  actions: [],

  emptyState: { message: '등록된 입고 건이 없습니다. 엑셀 입력에서 업로드하세요' },

  requiresCompany: true,
};

export default config;
