// erp-core pack — 모든 테넌트가 공유하는 ERP 공통 기능.
//
// 내용: 재고·수주·출고·수금·마스터·자료실·AI·일괄입력·DB 정합성·설정.
// 새 테넌트는 이 pack 을 거의 항상 활성화. 가시성 정본은 enabled_features.
import {
  Bot,
  Box,
  Database,
  FileSpreadsheet,
  LibraryBig,
  ScrollText,
  Settings,
  ShieldAlert,
  Truck,
  Wallet,
} from 'lucide-react';

import type { Pack } from './types';

export const ERP_CORE_PACK: Pack = {
  id: 'erp-core',
  label: 'ERP 공통',
  description: '재고·수주·출고·수금·마스터·자료실·AI·일괄입력·설정 (모든 테넌트 공통)',
  navItems: [
    { key: 'inventory', label: '가용재고', abbr: '재고', path: '/inventory', icon: Box, menu: 'inventory', group: 'home' },
    { key: 'orders', label: '수주 관리', abbr: '수주', path: '/orders', icon: ScrollText, menu: 'orders', group: '판매', feature: 'tx.order' },
    { key: 'outbound', label: '출고/판매', abbr: '출고', path: '/orders?tab=outbound', icon: Truck, menu: 'outbound', group: '판매', feature: 'tx.outbound' },
    { key: 'receipts', label: '수금 관리', abbr: '수금', path: '/orders?tab=receipts', icon: Wallet, menu: 'receipts', group: '판매', feature: 'tx.receipt' },
    { key: 'import-hub', label: '엑셀 입력', abbr: '입력', path: '/import', icon: FileSpreadsheet, menu: 'import_hub', group: '도구', feature: 'io.import' },
    { key: 'data', label: '마스터', abbr: '기준', path: '/data', icon: Database, menu: 'masters', group: '도구' },
    { key: 'library', label: '자료실', abbr: '자료', path: '/library', icon: LibraryBig, menu: 'library', group: '도구', feature: 'sys.library_post' },
    { key: 'assistant', label: 'AI', abbr: 'AI', path: '/assistant', icon: Bot, menu: 'assistant', group: '도구', feature: 'ai.assistant' },
    { key: 'db-integrity', label: 'DB 정합성', abbr: '정합', path: '/admin/db-integrity', icon: ShieldAlert, menu: 'settings', group: '도구', feature: 'sys.db_integrity' },
    { key: 'settings', label: '설정', abbr: '설정', path: '/settings', icon: Settings, menu: 'settings', group: '도구', feature: 'sys.system_settings' },
  ],
};
