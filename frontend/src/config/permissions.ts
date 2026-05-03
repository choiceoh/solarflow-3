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
  | 'banking'       // LC 한도/만기
  | 'customs'       // 매출/이익 분석
  | 'purchase_history' // 구매 이력 read-only 통합 타임라인 (현황 그룹)
  | 'import_hub'    // 엑셀 입력 허브
  | 'masters'       // 마스터 관리
  | 'approval'      // 결재안
  | 'assistant'     // AI 업무 도우미
  | 'crm_inbox'     // CRM: 내 미처리 문의
  | 'settings'      // 설정 (모든 역할 — 탭별 가시성으로 분리)
  | 'ui_editor'     // UI 메타 config 편집기 (admin 전용)
  // BARO 테넌트 전용 메뉴
  | 'baro_group_purchase'   // BARO: 그룹내 매입 요청 등록
  | 'baro_dispatch'         // BARO: 배차/일정 보드
  | 'baro_credit'           // BARO: 거래처 미수금/한도 보드
  | 'baro_price_book'       // BARO: 거래처별 단가표
  | 'baro_inbox';           // 탑솔라: 바로 매입요청 inbox

/** 기능 권한 키 */
export type FeatureKey =
  | 'canEdit'           // 데이터 입력·수정·삭제
  | 'showPrice'         // 단가·재고금액·매출원가 (역산 방지: manager/viewer 차단)
  | 'showMargin'        // 이익·이익률·마진율
  | 'showSales'         // 매출 금액 (viewer만 차단)
  | 'showOutbound'      // 출고·판매 현황
  | 'showReceivable'    // 미수금
  | 'showLcLimit'       // L/C 가용한도
  | 'manageUsers';      // 사용자 관리

interface RolePermission {
  menus: MenuKey[] | 'all';
  features: Partial<Record<FeatureKey, boolean>>;
}

export const PERMISSIONS: Record<Role, RolePermission> = {
  admin: {
    menus: 'all',
    features: {
      canEdit: true,
      showPrice: true,
      showMargin: true,
      showSales: true,
      showOutbound: true,
      showReceivable: true,
      showLcLimit: true,
      manageUsers: true,
    },
  },
  operator: {
    menus: ['procurement','lc','inbound','inventory','orders','outbound','receipts',
            'banking','customs','purchase_history','import_hub','masters','approval','assistant','crm_inbox',
            'baro_group_purchase','baro_dispatch','baro_credit','baro_price_book','baro_inbox',
            'settings'],
    features: {
      canEdit: true,
      showPrice: true,
      showMargin: true,
      showSales: true,
      showOutbound: true,
      showReceivable: true,
      showLcLimit: true,
      manageUsers: false,
    },
  },
  executive: {
    menus: ['inventory','orders','outbound','receipts','banking','customs','purchase_history','assistant','crm_inbox',
            'baro_credit','settings'],
    features: {
      canEdit: false,
      showPrice: true,
      showMargin: true,
      showSales: true,
      showOutbound: true,
      showReceivable: true,
      showLcLimit: true,
      manageUsers: false,
    },
  },
  manager: {
    menus: ['inventory','assistant','settings'],
    features: {
      canEdit: false,
      showPrice: false,          // 단가·재고금액 차단 (역산 방지)
      showMargin: false,         // 이익·마진 차단
      showSales: true,           // 매출 총액은 허용 (단, 드릴다운 불가)
      showOutbound: false,
      showReceivable: false,     // 미수금 차단
      showLcLimit: false,        // LC 한도 차단
      manageUsers: false,
    },
  },
  viewer: {
    menus: ['inventory','settings'],
    features: {
      canEdit: false,
      showPrice: false,
      showMargin: false,
      showSales: false,          // 매출도 차단 (재고만 조회)
      showOutbound: false,
      showReceivable: false,
      showLcLimit: false,
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
