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
}
