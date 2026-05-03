// 개인 표시 단위 설정 — 금액/용량/EA 표시. utils.ts의 formatKRW/formatKw/formatCapacity가
// 이 store의 getState()를 직접 참조해 호출처 수정 없이 단위 적용.
//
// 동기화: App.tsx에서 authStore.user.preferences 변화를 감지해 syncFromUser() 호출.
// 저장: PersonalSettingsPage가 PUT /api/v1/users/me/preferences 호출 후 setPrefs()로 즉시 반영.
import { create } from 'zustand';
import { DEFAULT_PREFERENCES, type UserPreferences } from '@/types/models';

interface PreferencesState {
  prefs: UserPreferences;
  setPrefs: (prefs: UserPreferences) => void;
  syncFromUser: (raw: Partial<UserPreferences> | null | undefined) => void;
}

function mergeWithDefaults(raw: Partial<UserPreferences> | null | undefined): UserPreferences {
  return { ...DEFAULT_PREFERENCES, ...(raw ?? {}) };
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  prefs: DEFAULT_PREFERENCES,
  setPrefs: (prefs) => set({ prefs }),
  syncFromUser: (raw) => set({ prefs: mergeWithDefaults(raw) }),
}));

// 비-React 컨텍스트(utils.ts 등)에서 현재 prefs를 읽기 위한 헬퍼.
export function getCurrentPreferences(): UserPreferences {
  return usePreferencesStore.getState().prefs;
}
