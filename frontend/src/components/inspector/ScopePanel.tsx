import { Sparkles, Target, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import type { InspectorTarget } from '@/stores/appStore';

interface ScopePanelProps {
  target: InspectorTarget;
  draft: string;
}

/**
 * Scope 분리 — Webflow class-system 패턴.
 * - 이 인스턴스만: DOM 직접 변경 (현재 동작). 새로고침 시 reset (미리보기).
 * - 모든 인스턴스: 어시스턴트 호출 → 메타 config 변경 제안 → 모든 사용자 즉시 반영 (영속).
 */
export const ScopePanel = ({ target, draft }: ScopePanelProps) => {
  const setAssistantDrawerOpen = useAppStore((s) => s.setAssistantDrawerOpen);
  const setAssistantDrawerInitialPrompt = useAppStore((s) => s.setAssistantDrawerInitialPrompt);

  const onAskForGlobal = () => {
    // M-2: 어시스턴트 drawer 자동 open + prompt prefill
    const prompt =
      `현재 선택된 요소(${target.tagName.toLowerCase()})의 className 을 "${draft}" 로 변경했습니다. ` +
      `이걸 모든 인스턴스에 영구 반영해주세요 — 메타 config 갱신 (read_ui_config / propose_ui_config_update).`;
    setAssistantDrawerInitialPrompt(prompt);
    setAssistantDrawerOpen(true);
  };

  const isModified = draft !== target.className;

  return (
    <section className="space-y-1.5 rounded border border-blue-200 bg-blue-50/50 p-2 dark:border-blue-900/40 dark:bg-blue-900/10">
      <header className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-900 dark:text-blue-200">
        <Target className="h-3 w-3" />
        변경 범위
      </header>
      <div className="grid grid-cols-2 gap-1">
        <ScopeCard
          icon={<Target className="h-3.5 w-3.5" />}
          label="이 인스턴스만"
          subLabel="DOM 직접 변경"
          desc="새로고침 시 reset (미리보기). 액션 칩·핸들·우클릭 메뉴가 기본 동작."
          active={true}
        />
        <ScopeCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="모든 인스턴스"
          subLabel="메타 config 영속"
          desc="모든 사용자 즉시 반영. AI 어시스턴트 통해서만."
          actionLabel={isModified ? 'AI 에 부탁' : 'AI 어시스턴트로'}
          actionDisabled={!isModified}
          onAction={onAskForGlobal}
        />
      </div>
    </section>
  );
};

interface ScopeCardProps {
  icon: React.ReactNode;
  label: string;
  subLabel: string;
  desc: string;
  active?: boolean;
  actionLabel?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
}

const ScopeCard = ({ icon, label, subLabel, desc, active = false, actionLabel, actionDisabled, onAction }: ScopeCardProps) => (
  <div
    className={cn(
      'flex flex-col gap-1 rounded border p-1.5 text-[11px]',
      active
        ? 'border-blue-500 bg-white dark:border-blue-600 dark:bg-slate-900'
        : 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40',
    )}
  >
    <div className="flex items-center gap-1 font-medium text-slate-800 dark:text-slate-200">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div className="text-[9px] text-slate-500">{subLabel}</div>
    <p className="text-[10px] leading-snug text-slate-600 dark:text-slate-400">{desc}</p>
    {actionLabel && (
      <button
        type="button"
        onClick={onAction}
        disabled={actionDisabled}
        className="mt-auto flex items-center justify-center gap-1 rounded border border-purple-300 bg-white px-2 py-0.5 text-[10px] text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-purple-700/40 dark:bg-slate-800 dark:text-purple-300"
      >
        <Sparkles className="h-2.5 w-2.5" />
        {actionLabel}
      </button>
    )}
  </div>
);
