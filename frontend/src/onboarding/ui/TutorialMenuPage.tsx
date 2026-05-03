import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, GraduationCap, PlayCircle } from 'lucide-react';
import { ALL_FLOWS } from '../flows';
import { startTourHref } from '../engine/useTourFromUrl';
import { useOnboardingProgress } from '../engine/useOnboardingProgress';
import { useSandboxStatus } from '../engine/useSandboxStatus';

/**
 * 사이드바 🎓 튜토리얼 — Q6·Q7 결정 (multi-flow shell).
 *
 * ALL_FLOWS의 모든 흐름을 카드 목록으로 노출. 새 흐름 추가 시 자동 반영.
 * 완료한 흐름은 ✓ 표시 (현재는 localStorage; PR #2 이후 DB와 합집합).
 *
 * PR #2-D: 박물관 표본 셋업 여부 자동 감지 → 미셋업 시 셋업 안내 배너.
 * 셋업 완료 시 흐름이 진짜 표본 데이터로 동작 가능 (후속 PR에서 자동 폼 open).
 */
export const TutorialMenuPage = () => {
  const { isCompleted } = useOnboardingProgress();
  const sandboxStatus = useSandboxStatus();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-700">
        <GraduationCap className="h-5 w-5 text-amber-600" />
        <div>
          <h1 className="text-base font-semibold">튜토리얼</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            업무 흐름을 한 번 따라가면서 화면 위치·용어를 익히는 코스. 진행 도중 닫아도 다시 와서
            이어볼 수 있어요.
          </p>
        </div>
      </header>

      {!sandboxStatus.loading && !sandboxStatus.hasAny ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">박물관 표본 데이터가 아직 셋업되지 않았어요</div>
            <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
              튜토리얼은 풍선 안내까지는 동작하지만, 실제 표본 데이터로 폼을 만져보는 부분은
              운영자가 시드 셋업을 해야 합니다.{' '}
              <span className="font-mono">harness/ONBOARDING_SANDBOX.md</span> 절차로 1회 셋업 후 다시
              방문하세요.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {ALL_FLOWS.map((flow) => {
          const done = isCompleted(flow.id);
          return (
            <Link
              key={flow.id}
              to={startTourHref(flow)}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-amber-300 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-amber-700/40 dark:hover:bg-amber-900/10"
            >
              <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {done ? <CheckCircle2 className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {flow.label}
                  </h2>
                  {done ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      완료
                    </span>
                  ) : null}
                  <span className="sf-mono text-[10px] text-slate-400">
                    {flow.steps.length}단계
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {flow.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <p className="text-[11px] text-slate-400">
        실제 도메인 흐름(PO·LC·BL·면장·원가, BARO 영업)은 곧 추가됩니다.
      </p>
    </div>
  );
};

export default TutorialMenuPage;
