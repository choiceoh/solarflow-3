import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '@/stores/appStore';

/**
 * classNameDrafts 를 페이지 로드 후 자동 재적용 — localStorage 영속과 짝.
 *
 * 동작:
 *   - 마운트 후 800ms 지연 (React 렌더 안정화)
 *   - 각 draft 의 selector 로 querySelectorAll → 매칭 element 의 className 교체
 *   - **path 격리**: draft.path 가 현재 pathname 과 같을 때만 적용 (다른 화면 영향 차단)
 *
 * 한계:
 *   - selector 가 *유니크* 보장 안 됨. 같은 selector + 같은 path 의 모든 인스턴스에 적용됨.
 *   - React re-mount 시 element 가 새로 생기면 className override 사라짐.
 *     이 hook 이 *주기적* 재적용 안 함. 사용자가 새로고침 해야 다시 적용.
 *   - SPA 라우팅 (history.push) 으로 pathname 변경 시 다시 적용됨.
 */
export const useApplyClassNameDrafts = () => {
  const drafts = useAppStore((s) => s.classNameDrafts);
  const location = useLocation();

  useEffect(() => {
    const currentPath = location.pathname;
    const matching = drafts.filter((d) => d.path === currentPath);
    if (matching.length === 0) return;
    const t = window.setTimeout(() => {
      for (const draft of matching) {
        try {
          const els = document.querySelectorAll(draft.selector);
          els.forEach((el) => {
            if (el instanceof HTMLElement) el.className = draft.after;
          });
        } catch {
          // selector 가 invalid 한 경우 — 무시
        }
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [drafts, location.pathname]);
};
