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
