import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpenCheck,
  Clock3,
  GraduationCap,
  Layers3,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchWithAuth } from '@/lib/api';
import { formatError } from '@/lib/notify';
import { cn } from '@/lib/utils';

type DomainStatus = 'draft' | 'active' | 'archived';
type PlanStatus = 'draft' | 'active' | 'retired';
type AssessmentKind = 'none' | 'quiz' | 'checklist' | 'submission' | 'manager_review';

interface StudyLearningDomain {
  domain_id: string;
  domain_key: string;
  title: string;
  summary: string;
  owner_role: string;
  display_order: number;
  status: DomainStatus;
}

interface StudyLearningPlan {
  plan_id: string;
  plan_key: string;
  title: string;
  audience: string;
  objective: string;
  duration_days: number;
  status: PlanStatus;
}

interface StudyLearningStep {
  step_id: string;
  plan_id: string;
  domain_id?: string | null;
  line_no: number;
  title: string;
  description: string;
  expected_minutes: number;
  required: boolean;
  assessment_kind: AssessmentKind;
  resource_url?: string | null;
}

type StudyLearningPlanWithSteps = StudyLearningPlan & {
  steps: StudyLearningStep[];
};

const ASSESSMENT_LABEL: Record<AssessmentKind, string> = {
  none: '확인 없음',
  quiz: '퀴즈',
  checklist: '체크리스트',
  submission: '과제 제출',
  manager_review: '담당자 리뷰',
};

const STATUS_LABEL: Record<DomainStatus | PlanStatus, string> = {
  draft: '초안',
  active: '활성',
  archived: '보관',
  retired: '종료',
};

function minutesLabel(minutes: number): string {
  if (!minutes) return '-';
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function statusVariant(status: DomainStatus | PlanStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'active') return 'default';
  if (status === 'draft') return 'secondary';
  return 'outline';
}

export default function StudyLearningPage() {
  const [domains, setDomains] = useState<StudyLearningDomain[]>([]);
  const [plans, setPlans] = useState<StudyLearningPlan[]>([]);
  const [selectedPlanID, setSelectedPlanID] = useState('');
  const [planDetail, setPlanDetail] = useState<StudyLearningPlanWithSteps | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedDomains, loadedPlans] = await Promise.all([
        fetchWithAuth<StudyLearningDomain[]>('/api/v1/study/domains?status=active'),
        fetchWithAuth<StudyLearningPlan[]>('/api/v1/study/plans?status=active'),
      ]);
      setDomains(loadedDomains);
      setPlans(loadedPlans);
      setSelectedPlanID((current) => {
        if (current && loadedPlans.some((plan) => plan.plan_id === current)) return current;
        return loadedPlans[0]?.plan_id ?? '';
      });
    } catch (err) {
      setError(formatError(err));
      setDomains([]);
      setPlans([]);
      setPlanDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedPlanID) {
      setPlanDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchWithAuth<StudyLearningPlanWithSteps>(`/api/v1/study/plans/${selectedPlanID}`)
      .then((detail) => {
        if (!cancelled) setPlanDetail(detail);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(formatError(err));
          setPlanDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlanID]);

  const domainByID = useMemo(
    () => new Map(domains.map((domain) => [domain.domain_id, domain])),
    [domains],
  );

  const steps = planDetail?.steps ?? [];
  const totalMinutes = steps.reduce((sum, step) => sum + step.expected_minutes, 0);
  const requiredCount = steps.filter((step) => step.required).length;
  const assessmentCount = steps.filter((step) => step.assessment_kind !== 'none').length;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        학습 플랜 불러오는 중...
      </div>
    );
  }

  if (error && plans.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>{error}</span>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <GraduationCap className="h-4 w-4 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">TopWorks Study</h1>
            <p className="truncate text-xs text-muted-foreground">신입사원 온보딩 학습 플랜</p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          새로 고침
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryBox icon={<Layers3 className="h-3.5 w-3.5" />} label="학습 도메인" value={`${domains.length}개`} />
        <SummaryBox icon={<BookOpenCheck className="h-3.5 w-3.5" />} label="활성 플랜" value={`${plans.length}개`} />
        <SummaryBox icon={<Clock3 className="h-3.5 w-3.5" />} label="예상 시간" value={minutesLabel(totalMinutes)} />
        <SummaryBox icon={<ShieldCheck className="h-3.5 w-3.5" />} label="필수 단계" value={`${requiredCount}/${steps.length}`} />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[290px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col gap-3">
          <section className="min-h-0 rounded-md border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">학습 도메인</h2>
              <Badge variant="outline">{domains.length}</Badge>
            </div>
            <div className="space-y-2 overflow-auto pr-1">
              {domains.map((domain) => (
                <div key={domain.domain_id} className="rounded-sm border bg-background p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{domain.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{domain.owner_role}</div>
                    </div>
                    <Badge variant={statusVariant(domain.status)} className="text-[10px]">
                      {STATUS_LABEL[domain.status]}
                    </Badge>
                  </div>
                  {domain.summary ? (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{domain.summary}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">플랜</h2>
              <Badge variant="outline">{plans.length}</Badge>
            </div>
            <div className="space-y-1.5">
              {plans.map((plan) => {
                const selected = plan.plan_id === selectedPlanID;
                return (
                  <button
                    key={plan.plan_id}
                    type="button"
                    onClick={() => setSelectedPlanID(plan.plan_id)}
                    className={cn(
                      'w-full rounded-sm border p-2 text-left transition',
                      selected ? 'border-primary bg-primary/5' : 'bg-background hover:border-primary/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{plan.title}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{plan.duration_days}일</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{plan.audience}</p>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        <main className="min-h-0 rounded-md border bg-card">
              {plans.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  활성 학습 플랜 없음
                </div>
              ) : !planDetail || detailLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  플랜 상세 불러오는 중...
                </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex items-center gap-2">
                      <Badge variant={statusVariant(planDetail.status)}>{STATUS_LABEL[planDetail.status]}</Badge>
                      <span className="text-xs text-muted-foreground">{planDetail.plan_key}</span>
                    </div>
                    <h2 className="text-lg font-semibold">{planDetail.title}</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{planDetail.objective}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <Metric label="기간" value={`${planDetail.duration_days}일`} />
                    <Metric label="단계" value={`${steps.length}개`} />
                    <Metric label="평가" value={`${assessmentCount}개`} />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto p-4">
                <ol className="space-y-2">
                  {steps.map((step) => {
                    const domain = step.domain_id ? domainByID.get(step.domain_id) : undefined;
                    return (
                      <li key={step.step_id} className="rounded-md border bg-background p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-mono text-[11px]">STEP {String(step.line_no).padStart(2, '0')}</span>
                              {domain ? <span>{domain.title}</span> : null}
                            </div>
                            <h3 className="text-sm font-semibold">{step.title}</h3>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                          </div>
                          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                            <Badge variant="outline" className="gap-1">
                              <Clock3 className="h-3 w-3" />
                              {minutesLabel(step.expected_minutes)}
                            </Badge>
                            <Badge variant={step.required ? 'default' : 'secondary'}>
                              {step.required ? '필수' : '선택'}
                            </Badge>
                            <Badge variant={step.assessment_kind === 'none' ? 'outline' : 'secondary'}>
                              {ASSESSMENT_LABEL[step.assessment_kind]}
                            </Badge>
                          </div>
                        </div>
                        {step.resource_url ? (
                          <a
                            href={step.resource_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline"
                          >
                            자료 열기
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function SummaryBox({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-16 rounded-sm border bg-background px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
    </div>
  );
}
