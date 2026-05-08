// erp-core pack — ERP 운영 테넌트가 공유하는 공통 기능.
//
// 내용: 재고·수주·출고·수금·마스터·자료실·AI·일괄입력·DB 정합성·WMS·설정.
// study 같은 비-ERP 테넌트는 이 pack 을 상속하지 않는다. 가시성 정본은 enabled_features.
import {
  Bot,
  Box,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  LibraryBig,
  ListChecks,
  MapPin,
  ScrollText,
  Settings,
  ShieldAlert,
  Target,
  Truck,
  Wallet,
} from 'lucide-react';

import { ERP_TENANTS, MODULE_TENANTS } from '@/lib/tenantScope';
import type { Pack } from '../types';

export const ERP_CORE_PACK: Pack = {
  id: 'erp-core',
  label: 'ERP 공통',
  description: '재고·수주·출고·수금·마스터·자료실·AI·일괄입력·WMS·설정 (ERP 운영 테넌트 공통)',
  navItems: [
    { key: 'inventory', label: '가용재고', abbr: '재고', path: '/inventory', icon: Box, menu: 'inventory', group: 'home', tenants: ERP_TENANTS },
    { key: 'orders', label: '수주 관리', abbr: '수주', path: '/orders', icon: ScrollText, menu: 'orders', group: '판매', feature: 'tx.order', tenants: ERP_TENANTS },
    { key: 'outbound', label: '출고/판매', abbr: '출고', path: '/orders?tab=outbound', icon: Truck, menu: 'outbound', group: '판매', feature: 'tx.outbound', tenants: ERP_TENANTS },
    { key: 'receipts', label: '수금 관리', abbr: '수금', path: '/orders?tab=receipts', icon: Wallet, menu: 'receipts', group: '판매', feature: 'tx.receipt', tenants: ERP_TENANTS },
    // WMS (D-139~142) — 창고 운영 4단계
    { key: 'wms-picking', label: '피킹 작업', abbr: '피킹', path: '/wms/picking', icon: ListChecks, menu: 'wms_picking', group: '구매', feature: 'tx.picking_list', tenants: ERP_TENANTS },
    { key: 'wms-receiving', label: '입고 검수', abbr: '검수', path: '/wms/receiving', icon: ClipboardCheck, menu: 'wms_receiving', group: '구매', feature: 'tx.receiving_log', tenants: ERP_TENANTS },
    { key: 'wms-cycle-count', label: '재고실사', abbr: '실사', path: '/wms/cycle-count', icon: Target, menu: 'wms_cycle_count', group: '현황', feature: 'tx.cycle_count', tenants: ERP_TENANTS },
    // 도구
    { key: 'import-hub', label: '엑셀 입력', abbr: '입력', path: '/import', icon: FileSpreadsheet, menu: 'import_hub', group: '도구', feature: 'io.import', tenants: MODULE_TENANTS },
    { key: 'data', label: '마스터', abbr: '기준', path: '/data', icon: Database, menu: 'masters', group: '도구', tenants: ERP_TENANTS },
    { key: 'wms-locations', label: '창고 위치', abbr: '위치', path: '/wms/locations', icon: MapPin, menu: 'wms_locations', group: '도구', feature: 'master.warehouse_location', tenants: ERP_TENANTS },
    { key: 'library', label: '자료실', abbr: '자료', path: '/library', icon: LibraryBig, menu: 'library', group: '도구', feature: 'sys.library_post', tenants: ERP_TENANTS },
    { key: 'assistant', label: 'AI', abbr: 'AI', path: '/assistant', icon: Bot, menu: 'assistant', group: '도구', feature: 'ai.assistant', tenants: ERP_TENANTS },
    { key: 'db-integrity', label: 'DB 정합성', abbr: '정합', path: '/admin/db-integrity', icon: ShieldAlert, menu: 'settings', group: '도구', feature: 'sys.db_integrity', tenants: ERP_TENANTS },
    { key: 'settings', label: '설정', abbr: '설정', path: '/settings', icon: Settings, menu: 'settings', group: '도구', feature: 'sys.system_settings', tenants: ERP_TENANTS },
  ],
};
