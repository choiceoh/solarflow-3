// module-finance pack — 해외 수입 / 신용장 / 통관 / 원가 / 금융 (D-108/D-119 module 계열).
//
// 내용: P/O 발주, L/C 개설, B/L 입고, 면장/원가, 그룹내 매입 inbox(module 측),
// L/C 한도, 매출 분석, 구매 이력, 가격예측, 결재안.
// 외국 모듈을 직접 수입하지 않는 도메인은 이 pack 을 끄면 sidebar 에서 사라진다.
import {
  BarChart3,
  Calculator,
  ClipboardList,
  FileSignature,
  History,
  Inbox,
  Landmark,
  Ship,
  TrendingUp,
} from 'lucide-react';

import { MODULE_TENANTS } from '@/lib/tenantScope';
import type { Pack } from '../types';

export const MODULE_FINANCE_PACK: Pack = {
  id: 'module-finance',
  label: '수입 / 금융 (module 계열)',
  description: '해외 모듈 P/O · L/C · B/L · 면장 · 원가 · 한도 · 매출분석 (D-108/D-119 module 계열)',
  navItems: [
    { key: 'po', label: 'P/O 발주', abbr: 'PO', path: '/procurement', icon: ClipboardList, menu: 'procurement', group: '구매', feature: 'tx.po' },
    { key: 'lc', label: 'L/C 개설', abbr: 'LC', path: '/procurement?tab=lc', icon: Landmark, menu: 'lc', group: '구매', feature: 'tx.lc' },
    { key: 'bl', label: 'B/L 입고', abbr: 'BL', path: '/procurement?tab=bl', icon: Ship, menu: 'inbound', group: '구매', feature: 'tx.bl' },
    { key: 'customs', label: '면장/원가', abbr: '면장', path: '/customs', icon: Calculator, menu: 'inbound', group: '구매', feature: 'tx.declaration' },
    { key: 'baro-inbox', label: '그룹 요청', abbr: '그룹', path: '/group-trade/baro-inbox', icon: Inbox, menu: 'baro_inbox', group: '구매', feature: 'intercompany.request.inbox' },
    { key: 'banking', label: 'L/C 한도', abbr: '한도', path: '/banking', icon: Landmark, menu: 'banking', group: '현황', feature: 'master.bank' },
    { key: 'analysis', label: '매출 분석', abbr: '분석', path: '/sales-analysis', icon: BarChart3, menu: 'customs', group: '현황', feature: 'calc.margin_analysis' },
    { key: 'purchase-history', label: '구매 이력', abbr: '이력', path: '/purchase-history', icon: History, menu: 'purchase_history', group: '현황', feature: 'tx.price_history' },
    { key: 'price-forecast', label: '가격예측', abbr: '가격', path: '/price-forecast', icon: TrendingUp, menu: 'price_forecast', group: '현황', feature: 'tx.price_benchmark' },
    // 결재안 — 카탈로그 미정의 — tenants fallback (module 계열만).
    { key: 'approval', label: '결재안', abbr: '결재', path: '/approval', icon: FileSignature, menu: 'approval', group: '도구', tenants: MODULE_TENANTS, isWip: true },
  ],
};
