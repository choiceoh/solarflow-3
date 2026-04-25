import {
  PackageSearch, ScrollText, Truck, PackageCheck,
  ClipboardList, Landmark, Handshake, Tag, HardHat,
  StickyNote, FileSignature,
  type LucideIcon,
} from 'lucide-react';
import type { MenuKey } from '@/config/permissions';

export type ActionId =
  | 'alloc' | 'order' | 'outbound' | 'inbound'
  | 'procurement' | 'lc'
  | 'partner' | 'product' | 'site'
  | 'memo' | 'approval';

export interface QuickAction {
  id: ActionId;
  label: string;
  icon: LucideIcon;
  path: string;      // navigate URL — ?action=alloc | ?new=1 등
  menuKey: MenuKey;
  group: '영업' | '구매' | '마스터' | '도구';
}

export const QUICK_ACTIONS: QuickAction[] = [
  // 영업
  { id: 'alloc',       label: '사용예약',   icon: PackageSearch, path: '/inventory?action=alloc', menuKey: 'inventory',    group: '영업' },
  { id: 'order',       label: '수주 등록',  icon: ScrollText,    path: '/orders?new=1',           menuKey: 'orders',       group: '영업' },
  { id: 'outbound',    label: '출고/판매',  icon: Truck,         path: '/outbound?new=1',         menuKey: 'outbound',     group: '영업' },
  // 구매
  { id: 'inbound',     label: 'B/L 입고',   icon: PackageCheck,  path: '/inbound?new=1',          menuKey: 'inbound',      group: '구매' },
  { id: 'procurement', label: 'P/O 발주',   icon: ClipboardList, path: '/procurement?new=1',      menuKey: 'procurement',  group: '구매' },
  { id: 'lc',          label: 'L/C 개설',   icon: Landmark,      path: '/lc?new=1',               menuKey: 'lc',           group: '구매' },
  // 마스터
  { id: 'partner',     label: '거래처 등록', icon: Handshake,    path: '/masters/partners?new=1', menuKey: 'masters',      group: '마스터' },
  { id: 'product',     label: '품번 등록',  icon: Tag,           path: '/masters/products?new=1', menuKey: 'masters',      group: '마스터' },
  { id: 'site',        label: '현장 등록',  icon: HardHat,       path: '/masters/construction-sites?new=1', menuKey: 'masters', group: '마스터' },
  // 도구
  { id: 'memo',        label: '메모',       icon: StickyNote,    path: '/memo?new=1',             menuKey: 'memo',         group: '도구' },
  { id: 'approval',    label: '결재안',     icon: FileSignature, path: '/approval?new=1',         menuKey: 'approval',     group: '도구' },
];

export const DEFAULT_FAVORITES: ActionId[] = ['alloc', 'order', 'outbound', 'inbound'];
