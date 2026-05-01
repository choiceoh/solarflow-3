/**
 * usePermission — 역할 기반 권한 훅
 *
 * 사용 예:
 *   const { canEdit, showMargin, canAccessMenu } = usePermission();
 *   {showMargin && <div>이익률: {margin}%</div>}
 *   {canEdit && <Button>수정</Button>}
 */
import { useAuth } from './useAuth';
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
  const r = role as Role | null;

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
