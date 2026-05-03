import { GraduationCap } from 'lucide-react';

/**
 * 박물관 표본 데이터 폼 상단에 표시되는 안내 배너 — Q2 결정.
 * 신입이 진짜 폼을 보고 있지만 입력은 실제 회사 데이터에 영향 0임을 알림.
 *
 * PR #301 OnboardingHint·FirstLoginToast와 같은 amber 톤으로 통일.
 */
export const SandboxBanner = () => (
  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
    <GraduationCap className="mt-0.5 h-4 w-4 shrink-0" />
    <div>
      <div className="font-medium">박물관 표본 — 보기 전용</div>
      <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
        이 데이터는 튜토리얼용 가짜 표본입니다. 입력해도 실제 운영 데이터에 영향이 없어요. 진짜
        입력은 사이드바 [+ 신규] 메뉴에서 시작하세요.
      </p>
    </div>
  </div>
);
