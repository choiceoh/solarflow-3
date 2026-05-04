// Phase 1 PoC: 출고관리 페이지 config (메타데이터 단일 진입점)
// 기존 OutboundPage.tsx (233줄, 도메인 로직과 UI 혼재)를 이 파일 하나로 표현한다.
// 새 라우트 /outbound-v2 에서만 사용 — 기존 /outbound는 그대로 유지.

import type { ListScreenConfig, TabbedListConfig } from '@/templates/types';

const outboundList: ListScreenConfig = {
  id: 'outbound',
  page: { eyebrow: '', title: '', description: '' },  // 탭 안에서는 페이지 헤더 미사용
  source: { hookId: 'useOutboundList' },
  filters: [
    { key: 'status', label: '상태', type: 'select', optionsFrom: 'enum', enumKey: 'OUTBOUND_STATUS_LABEL', allLabel: '전체 상태' },
    { key: 'usage_category', label: '용도', type: 'select', optionsFrom: 'enum', enumKey: 'USAGE_CATEGORY_LABEL', allLabel: '전체 용도' },
    { key: 'manufacturer_id', label: '제조사', type: 'select', optionsFrom: 'master', masterKey: 'manufacturers', allLabel: '전체 제조사' },
  ],
  toolbarExtras: [
    { extraId: 'excel_toolbar', props: { type: 'outbound' } },
  ],
  metrics: [],   // 메트릭은 탭 묶음 레벨에서 공통
  columns: [
    { key: 'outbound_date', label: '출고일', formatter: 'date' },
    { key: 'usage_category', label: '용도', rendererId: 'usage_category_label' },
    { key: 'site_name', label: '현장명' },
    { key: 'spec_wp', label: '규격' },
    { key: 'capacity_kw', label: '용량', align: 'right', formatter: 'kw' },
    { key: 'product_code', label: '품번', className: 'font-mono' },
    { key: 'product_name', label: '품명' },
    { key: 'quantity', label: '수량', align: 'right', formatter: 'number' },
    { key: 'warehouse_name', label: '창고' },
    { key: 'order_number', label: '수주연결' },
    { key: '_group_trade', label: '그룹거래', rendererId: 'outbound_group_trade' },
    { key: '_invoice', label: '계산서', rendererId: 'outbound_invoice_pill' },
    // D-055: 워크플로우 4개 + 외부 양식 출처
    { key: '_workflow', label: '진행', rendererId: 'outbound_workflow_pills' },
    { key: '_source', label: '출처', rendererId: 'outbound_source_badge' },
    { key: 'status', label: '상태', rendererId: 'outbound_status_badge' },
  ],
  rowAppearance: [
    { whenEquals: { field: 'status', value: 'cancel_pending' }, className: 'bg-orange-50' },
    { whenEquals: { field: 'status', value: 'cancelled' }, className: 'bg-gray-50 text-muted-foreground line-through' },
  ],
  onRowClick: { kind: 'detail', detailId: 'outbound', idField: 'outbound_id' },
  actions: [],
  emptyState: { message: '등록된 출고가 없습니다. 엑셀 입력에서 업로드하세요' },
};

const saleList: ListScreenConfig = {
  id: 'sale',
  page: { eyebrow: '', title: '', description: '' },
  source: { hookId: 'useSaleList' },
  filters: [
    { key: 'customer_id', label: '거래처', type: 'select', optionsFrom: 'master', masterKey: 'partners.customer', allLabel: '전체 거래처' },
    { key: 'month', label: '기간', type: 'month', optionsFrom: 'months', monthsBack: 12, allLabel: '전체 기간' },
    {
      key: 'invoice_status', label: '계산서', type: 'select', optionsFrom: 'static',
      staticOptions: [
        { value: 'issued', label: '발행' },
        { value: 'pending', label: '미발행' },
      ],
      allLabel: '전체',
    },
  ],
  toolbarExtras: [{ extraId: 'excel_toolbar', props: { type: 'sale' } }],
  metrics: [],
  columns: [
    { key: '_base_date', label: '기준일', rendererId: 'sale_base_date' },
    { key: 'sale.customer_name', label: '거래처' },
    { key: '_kind', label: '구분', rendererId: 'sale_kind_pill' },
    { key: 'product_name', label: '품명' },
    { key: 'spec_wp', label: '규격' },
    { key: 'quantity', label: '수량', align: 'right', formatter: 'number' },
    { key: 'sale.unit_price_wp', label: 'Wp단가', align: 'right', formatter: 'number' },
    { key: 'sale.supply_amount', label: '공급가', align: 'right', formatter: 'number' },
    { key: 'sale.vat_amount', label: '부가세', align: 'right', formatter: 'number' },
    { key: '_total', label: '합계', align: 'right', rendererId: 'sale_total_amount' },
    { key: '_invoice', label: '계산서일', rendererId: 'sale_invoice_pill' },
    { key: '_erp', label: 'ERP마감', rendererId: 'sale_erp_closed_pill' },
  ],
  emptyState: { message: '매출 데이터가 없습니다' },
};

const config: TabbedListConfig = {
  id: 'outbound_page',
  page: {
    eyebrow: 'FULFILLMENT',
    title: '출고/판매',
    description: '출고 진행과 매출·계산서 상태를 같은 운영 화면에서 확인합니다.',
  },
  metrics: [
    {
      label: '출고 건수', computerId: 'count', sourceTabKey: 'outbound',
      tone: 'solar', spark: 'auto', subFromFilter: 'status',
    },
    {
      label: '정상 출고', computerId: 'count.outbound_active', sourceTabKey: 'outbound',
      tone: 'pos', spark: 'auto', subFromFilter: 'usage_category',
    },
    {
      label: '취소 대기', computerId: 'count.outbound_cancel_pending', sourceTabKey: 'outbound',
      tone: { computerId: 'tone.cancel_pending' }, spark: 'auto', subFromFilter: 'manufacturer_id',
    },
    {
      label: '매출 합계', computerId: 'sum.supply_amount_billion', sourceTabKey: 'sale',
      unit: '억',
      tone: { computerId: 'tone.invoice_pending' }, spark: 'auto', subFromComputer: 'sub.sale_invoice_pending',
    },
  ],
  rail: [
    {
      blockId: 'recent_items',
      sourceTabKey: 'outbound',
      props: {
        title: '최근 출고',
        accent: 'var(--solar-3)',
        limit: 4,
        primaryFields: ['erp_outbound_no', 'order_number'],
        idField: 'outbound_id',
        metaRender: 'outbound',
      },
    },
    {
      blockId: 'static_text',
      props: {
        title: '필터 상태',
        text: '출고 필터와 매출 필터는 탭별로 유지되어 빠르게 왕복할 수 있습니다.',
      },
    },
  ],
  tabs: [
    { key: 'outbound', label: '출고 관리', list: outboundList },
    {
      key: 'sale', label: '매출 현황', list: saleList,
      aboveTable: { blockId: 'sale_summary_cards' },
    },
  ],
};

export default config;
