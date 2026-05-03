/**
 * usePermission — 역할 기반 권한 훅
 *
 * 사용 예:
 *   const { canEdit, showMargin, canAccessMenu } = usePermission();
 *   {showMargin && <div>이익률: {margin}%</div>}
 *   {canEdit && <Button>수정</Button>}
 */
import { useAuth } from './useAuth';
import { useAppStore } from '@/stores/appStore';
import {
  canAccessMenu as _canAccessMenu,
  hasFeature as _hasFeature,
  type MenuKey,
  type FeatureKey,
  type Role,
  ROLE_LABELS,
} from '@/config/permissions';

export function usePermission() {
  const { role } = useAuth();
  // 인스펙터 *다른 역할로 미리보기* override — 실제 JWT 가 admin 일 때만 (권한 우회 방지).
  const previewOverride = useAppStore((s) => s.inspectorPreviewRole);
  const effective = role === 'admin' && previewOverride ? (previewOverride as Role) : (role as Role | null);
  const r = effective;

  return {
    role: r,
    roleLabel: r ? (ROLE_LABELS[r] ?? r) : '—',

    canEdit:        _hasFeature(r, 'canEdit'),
    showPrice:      _hasFeature(r, 'showPrice'),
    showMargin:     _hasFeature(r, 'showMargin'),
    showSales:      _hasFeature(r, 'showSales'),
    showOutbound:   _hasFeature(r, 'showOutbound'),
    showReceivable: _hasFeature(r, 'showReceivable'),
    showLcLimit:    _hasFeature(r, 'showLcLimit'),
    manageUsers:    _hasFeature(r, 'manageUsers'),

    canAccessMenu: (menu: MenuKey) => _canAccessMenu(r, menu),
    hasFeature: (feature: FeatureKey) => _hasFeature(r, feature),
  };
}
