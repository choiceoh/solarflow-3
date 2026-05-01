// Phase 2.5 PoC: 출고 상세 — 메타 한계선 데모용 부분 메타화
// ───────────────────────────────────────────────────────────────────────────
// OutboundDetailView.tsx (261줄) 분석 결과 메타로 깨끗하게 표현 가능한 영역은
// 데이터 표시 섹션(이 파일)이 약 60%. 나머지는 코드 영역에 남긴다.
//
// 메타 가능 (이 파일):
//   - 기본 정보 (출고일·용도·ERP번호·수주연결)
//   - 제품·수량·창고 (품번·품명·규격·수량·용량·스페어·창고)
//   - 현장·연결 (현장명·현장주소 + 그룹거래 visibleIf)
//   - B/L 연결 (contentBlock 슬롯 — bl_items 다중 행 렌더링)
//   - 메모 (텍스트 + visibleIf: 값 있을 때만)
//
// 메타 불가 — 코드 영역 (래핑 페이지 또는 별도 슬롯):
//   - 헤더 워크플로우 (OutboundCancelFlow + 취소처리 confirm)
//   - 편집 모드 토글 (인라인 OutboundForm 표시)
//   - 매출 패널 (3 모드: 미등록·등록됨·편집중)
//   - 운송비 패널 (OutboundTransportCostPanel — BL 라인별 원가 계산)
//   - 첨부 메모 위젯 (LinkedMemoWidget)
//   - 평균 원가/Wp 계산 (avgCostPerWp side effect)
//
// 결론: Detail은 Form보다 메타 친화적. 단순 데이터 표시는 100% 메타 가능,
// 워크플로우/외부 패널/모드 토글은 코드에 남기는 게 자연스럽다.
// ───────────────────────────────────────────────────────────────────────────

import type { MetaDetailConfig } from '@/templates/types';

const outboundDetailSimple: MetaDetailConfig = {
  id: 'outbound_detail_simple',
  source: { hookId: 'useOutboundDetail' },
  header: {
    title: '출고 상세 (메타 한계선 데모)',
    // 워크플로우 액션은 코드 영역. PoC에서는 슬롯 미사용.
  },
  sections: [
    {
      title: '기본 정보',
      cols: 4,
      // status 배지 슬롯은 outbound_status_badges 같은 contentBlock으로 등록 가능.
      // 이번 PoC에서는 생략 (코드 영역으로 분류)
      fields: [
        { key: 'outbound_date', label: '출고일', formatter: 'date' },
        { key: 'usage_category', label: '용도', formatter: 'enum', enumKey: 'USAGE_CATEGORY_LABEL' },
        { key: 'erp_outbound_no', label: 'ERP 출고번호' },
        { key: 'order_number', label: '수주연결' },
      ],
    },
    {
      title: '제품 · 수량 · 창고',
      cols: 4,
      fields: [
        { key: 'product_code', label: '품번' },
        { key: 'product_name', label: '품명', span: 2 },
        { key: 'spec_wp', label: '규격', suffix: 'Wp' },
        { key: 'quantity', label: '수량', formatter: 'number' },
        { key: 'capacity_kw', label: '용량', formatter: 'kw' },
        { key: 'spare_qty', label: '스페어' },
        { key: 'warehouse_name', label: '창고' },
      ],
    },
    {
      title: '현장 · 연결',
      cols: 4,
      fields: [
        { key: 'site_name', label: '현장명' },
        { key: 'site_address', label: '현장 주소', span: 3 },
        {
          key: 'target_company_name', label: '상대법인 (그룹거래)', span: 4,
          visibleIf: { field: 'group_trade', value: 'true' },
        },
      ],
    },
    {
      title: 'B/L 연결 (분할선적)',
      visibleIf: { field: 'bl_items', value: '__truthy' },
      contentBlock: { blockId: 'outbound_bl_items_section' },
    },
    {
      title: '메모',
      visibleIf: { field: 'memo', value: '__truthy' },
      contentBlock: { blockId: 'outbound_memo_section' },
    },
  ],
};

export default outboundDetailSimple;
