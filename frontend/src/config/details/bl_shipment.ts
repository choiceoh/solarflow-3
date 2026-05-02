// Phase 4 — Inbound Step 2: BL 입고 상세 메타 config (기본정보 탭만)
// BLDetailView 의 "기본 정보 / 선적 일정 / 결제·거래 / 메모" 섹션을 MetaDetail 로.
// 헤더 워크플로우 (status changer, edit, delete) + 다른 탭 (서류/입고품목/부대비용/출고추적) 은 코드 유지.

import type { MetaDetailConfig } from '@/templates/types';

const blShipmentDetail: MetaDetailConfig = {
  id: 'bl_shipment_detail',
  source: { hookId: 'useBLShipmentDetail' },
  header: {
    title: '',  // BLDetailView 가 헤더 자체 렌더 — MetaDetail 헤더는 사용 안 함
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      badgesBlock: { blockId: 'bl_status_badge' },
      actionsBlock: { blockId: 'bl_edit_button' },
      fields: [
        { key: 'inbound_type', label: '입고 구분', formatter: 'enum', enumKey: 'INBOUND_TYPE_LABEL' },
        { key: 'manufacturer_name', label: '공급사' },
        { key: 'po_number', label: 'PO번호', rendererId: 'bl_po_link' },
        { key: 'lc_number', label: 'LC번호', rendererId: 'bl_lc_link' },
        { key: 'currency', label: '통화', rendererId: 'bl_currency_label' },
        { key: 'exchange_rate', label: '환율', formatter: 'number', visibleIf: { field: 'inbound_type', value: 'import' } },
        { key: 'warehouse_name', label: '입고 창고' },
      ],
    },
    {
      title: '선적 일정',
      cols: 4,
      visibleIf: { field: 'inbound_type', value: 'import' },
      fields: [
        { key: 'etd', label: 'ETD', formatter: 'date' },
        { key: 'eta', label: 'ETA', formatter: 'date' },
        { key: 'actual_arrival', label: '실제입항', formatter: 'date' },
        { key: 'port', label: '항구' },
        { key: 'forwarder', label: '포워더' },
        { key: 'invoice_number', label: 'Invoice No.' },
        { key: 'declaration_number', label: '면장번호' },
        { key: 'incoterms', label: '인코텀즈' },
      ],
    },
    {
      title: '입고/납품',
      cols: 4,
      visibleIf: { field: 'inbound_type', value: 'domestic' },
      fields: [
        { key: 'actual_arrival', label: '입고/납품일', formatter: 'date' },
        { key: 'declaration_number', label: '면장번호' },
      ],
    },
    {
      title: '결제 · 거래',
      cols: 4,
      visibleIf: { field: 'payment_terms', value: '__truthy' },
      fields: [
        { key: 'payment_terms', label: '결제조건', span: 2 },
        { key: 'counterpart_company_id', label: '상대법인', span: 2 },
      ],
    },
    {
      title: '메모',
      visibleIf: { field: 'memo', value: '__truthy' },
      contentBlock: { blockId: 'bl_memo_block' },
    },
  ],
};

export default blShipmentDetail;
