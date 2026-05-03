import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

/**
 * classNameDrafts 를 페이지 로드 후 자동 재적용 — localStorage 영속과 짝.
 *
 * 동작:
 *   - 마운트 후 800ms 지연 (React 렌더 안정화)
 *   - 각 draft 의 selector 로 querySelectorAll → 매칭 element 의 className 교체
 *
 * 한계:
 *   - selector 가 *유니크* 보장 안 됨. 같은 selector 의 모든 인스턴스에 적용됨.
 *     (예: ".sf-card" → 모든 카드. 의도가 *한 카드만* 이라도 모두 적용)
 *   - React re-mount 시 element 가 새로 생기면 className override 사라짐.
 *     이 hook 이 *주기적* 재적용 안 함. 사용자가 새로고침 해야 다시 적용.
 *
 * 따라서 권장 사용:
 *   - admin 디자인 실험 (본인 브라우저 only)
 *   - 영구 반영 원하면 메타 config (ScopePanel "모든 인스턴스" → AI 어시스턴트)
 */
export const useApplyClassNameDrafts = () => {
  const drafts = useAppStore((s) => s.classNameDrafts);

  useEffect(() => {
    if (drafts.length === 0) return;
    const t = window.setTimeout(() => {
      for (const draft of drafts) {
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
  }, [drafts]);
};
