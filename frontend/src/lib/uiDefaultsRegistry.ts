// 운영자가 사이트 단위 default 를 설정할 수 있는 테이블/KPI 화이트리스트.
//
// MetaTable 의 `tableId` 또는 KpiStrip 의 `scopeId` 를 그대로 키로 쓴다.
// 새 테이블을 운영자 설정 대상으로 추가하려면 여기에 한 줄 추가하면 끝.
//
// 운영 규칙: 사용자가 한 번도 컬럼/KPI 를 만지지 않은 경우에만 default 가 적용된다.
// 사용자가 직접 조정한 컬럼은 그 컬럼만 사용자 설정을 우선한다(폭은 키 단위 머지).

import { ORDER_TABLE_ID } from '@/components/orders/OrderListTable';
import { OUTBOUND_TABLE_ID } from '@/components/outbound/OutboundListTable';
import { SALE_TABLE_ID } from '@/components/outbound/SaleListTable';
import { BL_LINE_TABLE_ID } from '@/domains/bl/line-table';
import { DECLARATION_TABLE_ID } from '@/components/customs/DeclarationListTable';

export interface ManagedTable {
  /** MetaTable 의 tableId 값. localStorage 키 prefix 와도 동일. */
  id: string;
  /** 운영자 UI 에 보일 사람용 이름. */
  label: string;
  /** 운영자가 어떤 페이지를 열어서 조정해야 하는지 안내. */
  pagePath: string;
}

export interface ManagedKpiScope {
  /** KpiStrip 의 scopeId 값. */
  id: string;
  label: string;
  pagePath: string;
}

// 1차 적용 대상 — 운영자 피드백을 자주 받는 핵심 5개 테이블.
// 추후 확장은 이 배열에 한 줄씩 추가.
export const MANAGED_TABLES: ManagedTable[] = [
  { id: ORDER_TABLE_ID, label: '수주 리스트', pagePath: '/orders' },
  { id: OUTBOUND_TABLE_ID, label: '출고 리스트', pagePath: '/orders?tab=outbound' },
  { id: SALE_TABLE_ID, label: '매출 리스트', pagePath: '/orders?tab=sale' },
  { id: BL_LINE_TABLE_ID, label: 'B/L 라인 상세', pagePath: '/procurement?tab=bl' },
  { id: DECLARATION_TABLE_ID, label: '면장 리스트', pagePath: '/customs' },
];

// 1차 적용 대상 KPI 섹션. kpiScope 가 이미 코드에 박혀있는 것들 + 매출 요약.
// MasterConsole / KpiStrip 에 scopeId 를 넘기지 않는 섹션은 아직 운영자 설정 대상이 아니다.
export const MANAGED_KPI_SCOPES: ManagedKpiScope[] = [
  { id: 'price-forecast', label: '가격예측 KPI', pagePath: '/price-forecast' },
  { id: 'library', label: '자료실 KPI', pagePath: '/library' },
  { id: 'approval', label: '결재 KPI', pagePath: '/approval' },
  { id: 'import-hub', label: '엑셀 입력 허브 KPI', pagePath: '/import' },
  { id: 'construction-sites', label: '현장 마스터 KPI', pagePath: '/masters/construction-sites' },
];

// localStorage 키 — column hook 들이 쓰는 prefix 와 동일. 운영자 페이지가 사용자의
// 현재 설정을 "캡처" 할 때 직접 읽기 위해 노출.
export const COLORDER_PREFIX = 'sf.colorder.';
export const COLWIDTH_PREFIX = 'sf.colwidth.';
