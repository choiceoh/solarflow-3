// baro-domain pack — 바로(주) 영업 / CRM / 매입 / 분석 (D-108).
//
// 내용: 영업 일일 홈, 그룹내 매입, 입고예정, 자체 구매이력, CRM 인박스,
// 거래처 360 cockpit, 견적 빌더, 인버터 가이드, 출하 알림, 거래처 단가표,
// 배차/일정, 미수금/한도, 거래처 RFM, 매출 요약.
// BARO 도메인 외 테넌트는 이 pack 을 비활성화한다.
import {
  BarChart3,
  Bell,
  Calculator,
  Home,
  Inbox,
  PackagePlus,
  ReceiptText,
  ShieldAlert,
  Ship,
  Tags,
  Trophy,
  Truck,
  Users,
  Zap,
} from 'lucide-react';

import type { Pack } from '../types';

export const BARO_DOMAIN_PACK: Pack = {
  id: 'baro-domain',
  label: '바로(주) 도메인',
  description: '영업 홈·CRM·견적·배차·미수·RFM 등 BARO 측 모든 화면 (D-108)',
  navItems: [
    // 홈
    { key: 'baro-home', label: '영업 홈', abbr: '홈', path: '/baro/home', icon: Home, menu: 'baro_home', group: 'home', feature: 'baro.home' },
    // 구매 (BARO 측)
    { key: 'baro-purchase', label: '그룹내 매입', abbr: '매입', path: '/baro/group-purchase', icon: PackagePlus, menu: 'baro_group_purchase', group: '구매', feature: 'intercompany.request.baro' },
    { key: 'baro-incoming', label: '입고예정', abbr: '입고', path: '/baro/incoming', icon: Ship, menu: 'baro_incoming', group: '구매', feature: 'baro.incoming' },
    { key: 'baro-purchase-history', label: '구매이력', abbr: '이력', path: '/baro/purchase-history', icon: ReceiptText, menu: 'baro_purchase_history', group: '구매', feature: 'baro.purchase_history' },
    // 판매 / CRM
    { key: 'crm-inbox', label: '내 미처리 문의', abbr: '문의', path: '/crm/inbox', icon: Inbox, menu: 'crm_inbox', group: '판매', feature: 'crm.partner_activity' },
    { key: 'baro-cockpit', label: '거래처 360', abbr: '360', path: '/baro/cockpit', icon: Users, menu: 'baro_cockpit', group: '판매', feature: 'baro.partner_cockpit' },
    // PR-8: 카탈로그 보강 후 feature 매핑 — D-126/130/131 모두 frontend-only 였으나 카탈로그 등재.
    { key: 'baro-quote', label: '견적 빌더', abbr: '견적', path: '/baro/quote/new', icon: Calculator, menu: 'baro_quote', group: '판매', feature: 'baro.quote' },
    { key: 'baro-inverter', label: '인버터 가이드', abbr: '인버', path: '/baro/inverter-guide', icon: Zap, menu: 'baro_inverter', group: '판매', feature: 'baro.inverter' },
    { key: 'baro-shipment', label: '출하 알림', abbr: '알림', path: '/baro/shipment-notice', icon: Bell, menu: 'baro_shipment', group: '판매', feature: 'baro.shipment_notice' },
    { key: 'baro-price-book', label: '거래처 단가표', abbr: '단가', path: '/baro/price-book', icon: Tags, menu: 'baro_price_book', group: '판매', feature: 'baro.price_book' },
    { key: 'baro-dispatch', label: '배차/일정', abbr: '배차', path: '/baro/dispatch', icon: Truck, menu: 'baro_dispatch', group: '판매', feature: 'baro.dispatch' },
    // 현황
    { key: 'baro-credit', label: '미수금/한도', abbr: '미수', path: '/baro/credit-board', icon: ShieldAlert, menu: 'baro_credit', group: '현황', feature: 'baro.credit_board' },
    { key: 'baro-rfm', label: '거래처 RFM', abbr: 'RFM', path: '/baro/rfm', icon: Trophy, menu: 'baro_rfm', group: '현황', feature: 'baro.rfm' },
    { key: 'baro-sales-summary', label: '매출 요약', abbr: '매출', path: '/baro/sales-summary', icon: BarChart3, menu: 'baro_sales_summary', group: '현황', feature: 'baro.sales_summary' },
    // D-133: 자동 콜백 추천 엔진 (BARO 전용)
    { key: 'baro-callback', label: '콜백 추천', abbr: '콜백', path: '/baro/callback-recommend', icon: Inbox, menu: 'baro_callback', group: '판매', feature: 'baro.callback_recommend' },
  ],
};
