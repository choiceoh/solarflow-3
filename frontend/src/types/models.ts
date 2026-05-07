// UserProfile — 사용자 프로필 타입 (Go UserProfileResponse와 1:1 대응)
// 컬럼명은 실제 DB 기준 (D-055 참조)
export interface UserProfile {
  user_id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  persona: string | null; // D-112: 사이드바 탭 key. NULL이면 default_tab fallback
  preferences: Partial<UserPreferences> | null;
  // PR-2 ([#577]) 에서 노출. omitempty 라 옛 응답엔 없을 수 있어 모두 optional.
  // PR-3b 부터 sidebar/route 가시성 정본으로 사용.
  tenant_id?: string;
  tenant_display_name?: string;
  enabled_features?: string[];
}

// 표시 단위 — 개인 설정 (PersonalSettingsPage > 표시 단위 섹션)
export type AmountUnit = 'auto' | 'won' | 'thousand' | 'manwon' | 'million' | 'eok';
export type CapacityUnit = 'auto' | 'kw' | 'mw';

export interface UserPreferences {
  amount_unit: AmountUnit;
  capacity_unit: CapacityUnit;
  show_ea: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  amount_unit: 'auto',
  capacity_unit: 'auto',
  show_ea: true,
};
