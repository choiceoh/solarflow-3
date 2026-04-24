/**
 * SolarFlow 역할별 권한 정의 (단일 정본)
 *
 * 역할 변경이 필요할 때는 이 파일만 수정하면 됩니다.
 *
 * 역할:
 *   admin     — 시스템관리자 (알렉스김): 전체 + 사용자관리·설정
 *   operator  — 운영팀 (김세미): 전체 (설정 제외)
 *   executive — 경영진: 전체 조회 (민감정보 포함), 입력 없음
 *   manager   — 본부장: 조회 (민감정보 제외)
 *   viewer    — 조회: 재고·가용재고만
 */

export type Role = 'admin' | 'operator' | 'executive' | 'manager' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  admin:     '시스템관리자',
  operator:  '운영팀',
  executive: '경영진',
  manager:   '본부장',
  viewer:    '조회',
};

/** 메뉴 키 목록 */
export type MenuKey =
  | 'procurement'   // P/O 발주
  | 'lc'            // L/C 관리
  | 'inbound'       // B/L 입고
  | 'inventory'     // 재고 현황
  | 'orders'        // 수주 관리
  | 'outbound'      // 출고/판매
  | 'receipts'      // 수금 관리
  | 'dashboard'     // 대시보드
  | 'banking'       // LC 한도/만기
  | 'customs'       // 매출/이익 분석
  | 'masters'       // 마스터 관리
  | 'search'        // 검색
  | 'memo'          // 메모
  | 'approval'      // 결재안
  | 'settings';     // 설정 (admin 전용)

/** 기능 권한 키 */
export type FeatureKey =
  | 'canEdit'           // 데이터 입력·수정·삭제
  | 'showPrice'         // 단가·재고금액·매출원가 (역산 방지: manager/viewer 차단)
  | 'showMargin'        // 이익·이익률·마진율
  | 'showSales'         // 매출 금액 (viewer만 차단)
  | 'showDetail'        // 대시보드 드릴다운 (거래처·품목별 상세)
  | 'showOutbound'      // 출고·판매 현황
  | 'showReceivable'    // 미수금
  | 'showLcLimit'       // L/C 가용한도
  | 'showFullDashboard' // [deprecated] 호환 유지. 신규 코드는 dashboardType 사용
  | 'manageUsers';      // 사용자 관리

/** 대시보드 유형 — 역할별 관점 분리 */
export type DashboardType =
  | 'strategic'    // 경영진·본부장·뷰어: 전략/요약 뷰 (권한 플래그로 마스킹)
  | 'operational'; // 실무자(admin/operator): 오늘의 액션 뷰

interface RolePermission {
  menus: MenuKey[] | 'all';
  features: Partial<Record<FeatureKey, boolean>>;
  dashboardType: DashboardType;
}

export const PERMISSIONS: Record<Role, RolePermission> = {
  admin: {
    menus: 'all',
    // 전략 뷰(요약·차트·재고 건강검진·거래처 매출/이익)를 executive와 동일하게 관찰.
    // 실무 액션(알림 패널 등)은 각 메뉴에서 처리하므로 대시보드 자체는 요약 중심으로 통일.
    dashboardType: 'strategic',
    features: {
      canEdit: true,
      showPrice: true,
      showMargin: true,
      showSales: true,
      showDetail: true,
      showOutbound: true,
      showReceivable: true,
      showLcLimit: true,
      showFullDashboard: true,
      manageUsers: true,
    },
  },
  operator: {
    menus: ['procurement','lc','inbound','inventory','orders','outbound','receipts',
            'dashboard','banking','customs','masters','search','memo','approval'],
    // 대시보드는 전략 뷰 통일. 운영 업무(알림 처리·수주 잔량 등)는 각 메뉴에서 진행.
    dashboardType: 'strategic',
    features: {
      canEdit: true,
      showPrice: true,
      showMargin: true,
      showSales: true,
      showDetail: true,
      showOutbound: true,
      showReceivable: true,
      showLcLimit: true,
      showFullDashboard: true,
      manageUsers: false,
    },
  },
  executive: {
    menus: ['inventory','orders','outbound','receipts','dashboard','banking','customs','search'],
    dashboardType: 'strategic',
    features: {
      canEdit: false,
      showPrice: true,
      showMargin: true,
      showSales: true,
      showDetail: true,
      showOutbound: true,
      showReceivable: true,
      showLcLimit: true,
      showFullDashboard: true,
      manageUsers: false,
    },
  },
  manager: {
    menus: ['inventory','dashboard','search'],
    dashboardType: 'strategic',
    features: {
      canEdit: false,
      showPrice: false,          // 단가·재고금액 차단 (역산 방지)
      showMargin: false,         // 이익·마진 차단
      showSales: true,           // 매출 총액은 허용 (단, 드릴다운 불가)
      showDetail: false,         // 품목·거래처별 상세 차단 (단가 역산 방지)
      showOutbound: false,
      showReceivable: false,     // 미수금 차단
      showLcLimit: false,        // LC 한도 차단
      showFullDashboard: false,
      manageUsers: false,
    },
  },
  viewer: {
    menus: ['inventory','dashboard'],
    dashboardType: 'strategic',
    features: {
      canEdit: false,
      showPrice: false,
      showMargin: false,
      showSales: false,          // 매출도 차단 (재고만 조회)
      showDetail: false,
      showOutbound: false,
      showReceivable: false,
      showLcLimit: false,
      showFullDashboard: false,
      manageUsers: false,
    },
  },
};

/** 메뉴 접근 가능 여부 */
export function canAccessMenu(role: Role | null | undefined, menu: MenuKey): boolean {
  if (!role) return false;
  const p = PERMISSIONS[role];
  if (!p) return false;
  if (p.menus === 'all') return true;
  return p.menus.includes(menu);
}

/** 기능 권한 여부 */
export function hasFeature(role: Role | null | undefined, feature: FeatureKey): boolean {
  if (!role) return false;
  const p = PERMISSIONS[role];
  if (!p) return false;
  return p.features[feature] === true;
}

/** 대시보드 유형 조회 (기본: strategic) */
export function getDashboardType(role: Role | null | undefined): DashboardType {
  if (!role) return 'strategic';
  const p = PERMISSIONS[role];
  return p?.dashboardType ?? 'strategic';
}
