import { useEffect, useState } from 'react';
import { HelpCircle, Sparkles, X } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { notify } from '@/lib/notify';

const DISMISSED_KEY = 'sf.inspector.onboarding-dismissed';

const readDismissed = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const writeDismissed = (v: boolean) => {
  if (typeof window === 'undefined') return;
  try {
    if (v) window.localStorage.setItem(DISMISSED_KEY, '1');
    else window.localStorage.removeItem(DISMISSED_KEY);
  } catch {
    /* noop */
  }
};

/**
 * 인스펙터 첫 진입 시 한 번 표시되는 안내 toast.
 * 사용자가 [알겠어요] 또는 X 누르면 localStorage 저장 → 다시 안 보임.
 * 인스펙터 헤더 "도움말 다시 보기" 버튼으로 재표시 가능 (별도).
 */
export const OnboardingHint = () => {
  const editMode = useAppStore((s) => s.editMode);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!editMode) {
      setVisible(false);
      return;
    }
    if (readDismissed()) {
      setVisible(false);
      return;
    }
    // 편집 모드 진입 후 600ms 뒤 표시 (인스펙터 패널이 슬라이드 인 한 다음)
    const showT = window.setTimeout(() => setVisible(true), 600);
    // 표시 후 30초 뒤 자동 dismiss (사용자가 명시 dismiss 안 해도 다음에 안 보임)
    const autoDismissT = window.setTimeout(() => {
      writeDismissed(true);
      setVisible(false);
    }, 30_600);
    return () => {
      window.clearTimeout(showT);
      window.clearTimeout(autoDismissT);
    };
  }, [editMode]);

  const onDismiss = () => {
    setVisible(false);
    writeDismissed(true);
  };

  if (!editMode || !visible) return null;

  return (
    <div
      data-inspector-ui="true"
      className="fixed bottom-5 left-5 z-[120] w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-lg border border-amber-300 bg-white shadow-2xl dark:border-amber-700/40 dark:bg-slate-900"
    >
      <header className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-700/40 dark:bg-amber-900/20">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
          <Sparkles className="h-4 w-4" />
          편집 모드 첫 진입
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
          aria-label="닫기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div className="space-y-2 p-3 text-xs text-slate-700 dark:text-slate-300">
        <p>
          이 화면을 *직접 클릭* 해서 디자인을 조정할 수 있어요. 변경은{' '}
          <span className="font-medium text-amber-900 dark:text-amber-200">미리보기</span> 입니다 —
          새로고침하면 사라지고, 코드는 자동 반영되지 않습니다.
        </p>
        <ul className="space-y-1 text-xs">
          <li>
            <span className="font-medium">화면 위 점</span> — 모서리 ↖ 핸들로 둥글기, 우하단 ↘ 핸들로 안쪽 여백
          </li>
          <li>
            <span className="font-medium">우클릭</span> — 빠른 메뉴 (여백 ↑↓ / 스타일 복사·붙이기)
          </li>
          <li>
            <span className="font-medium">우측 패널</span> — 한국어 액션 칩, 디자인 토큰, 구조 트리, AI 변형
          </li>
          <li>
            <span className="font-medium">단독 보기</span> — 선택 요소만 모달로 (Storybook 처럼)
          </li>
        </ul>
        <p className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          마음에 드는 변경을 코드에 반영하려면 변경 사항 목록의{' '}
          <span className="font-mono">전체 복사</span> → AI 어시스턴트에 붙여넣기.
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
        >
          알겠어요, 다시 안 보기
        </button>
      </div>
    </div>
  );
};

/** 인스펙터 패널 헤더에 노출할 "도움말 다시 보기" 버튼 — dismissed 해제. */
export const OnboardingResetButton = () => {
  const onReset = () => {
    writeDismissed(false);
    // 편집 모드 끄고 다시 켜야 hint 재표시 — 단순화 위해 페이지 새로고침 제안 대신 안내 메시지.
    notify.info('편집 모드를 한 번 종료한 후 다시 켜시면 안내가 다시 보입니다 (Cmd+Shift+E 두 번).');
  };
  return (
    <button
      type="button"
      onClick={onReset}
      className="rounded p-1 text-amber-700/60 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300/60 dark:hover:bg-amber-900/30 dark:hover:text-amber-100"
      title="처음 안내 다시 보기"
      aria-label="처음 안내 다시 보기"
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </button>
  );
};
