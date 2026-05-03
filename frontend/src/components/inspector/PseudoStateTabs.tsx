import { cn } from '@/lib/utils';
import { useAppStore, type InspectorPseudoState } from '@/stores/appStore';

const TABS: Array<{ id: InspectorPseudoState; label: string; hint: string }> = [
  { id: 'default', label: '기본', hint: '평소 상태' },
  { id: 'hover', label: '마우스 위', hint: '커서가 올라간 상태 (hover:)' },
  { id: 'focus', label: '포커스', hint: '키보드 또는 클릭으로 선택된 입력 칸 (focus:)' },
  { id: 'active', label: '눌림', hint: '클릭/탭 중 (active:)' },
  { id: 'disabled', label: '비활성', hint: '비활성화된 버튼/입력 (disabled:)' },
];

/**
 * 인스펙터의 *상태 변종* 토글 — Webflow 의 Pseudo states 패턴.
 * 토글 활성 동안 액션 칩 / 우클릭 메뉴 가 그 prefix 가 붙은 클래스만 편집한다.
 *
 * 예: "마우스 위" + 안쪽 여백 ↑ → "hover:p-5" 추가/교체.
 */
export const PseudoStateTabs = () => {
  const current = useAppStore((s) => s.inspectorPseudoState);
  const setCurrent = useAppStore((s) => s.setInspectorPseudoState);

  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">상태 변종</div>
      <div className="flex flex-wrap gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCurrent(tab.id)}
            title={tab.hint}
            className={cn(
              'rounded border px-2 py-0.5 text-[11px] transition',
              current === tab.id
                ? 'border-amber-500 bg-amber-100 font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {current !== 'default' && (
        <p className="rounded border border-amber-200 bg-amber-50 p-1.5 text-[10px] text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
          이 변종에서만 적용됩니다. 평소 모습은 "기본" 으로 돌아가서 조정하세요.
        </p>
      )}
    </div>
  );
};
