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

    // 기능 권한
    canEdit:           _hasFeature(r, 'canEdit'),
    showPrice:         _hasFeature(r, 'showPrice'),
    showMargin:        _hasFeature(r, 'showMargin'),
    showOutbound:      _hasFeature(r, 'showOutbound'),
    showReceivable:    _hasFeature(r, 'showReceivable'),
    showLcLimit:       _hasFeature(r, 'showLcLimit'),
    showFullDashboard: _hasFeature(r, 'showFullDashboard'),
    manageUsers:       _hasFeature(r, 'manageUsers'),

    // 메뉴 접근
    canAccessMenu: (menu: MenuKey) => _canAccessMenu(r, menu),

    // 범용 기능 체크
    hasFeature: (feature: FeatureKey) => _hasFeature(r, feature),
  };
}
