import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[SolarFlow] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다.\n' +
    '.env 파일에 환경변수를 설정해주세요.'
  );
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'solarflow-auth',
    },
  }
);

// 탭 복귀 시 세션 선제 갱신 — 방치 후 첫 클릭 블로킹 방지
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    supabase.auth.getSession().catch(() => {
      console.debug('[SolarFlow] 탭 복귀 시 세션 조회 실패 — 다음 API 호출 시 처리됨');
    });
  }
});
