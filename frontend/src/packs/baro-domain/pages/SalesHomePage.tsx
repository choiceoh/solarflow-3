import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Inbox, ShieldAlert, Ship, RefreshCw, ArrowRight, Bell } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import type { OpenFollowup } from '@/types/crm';
import type { CreditBoardRow } from '@/types/baro-credit';
import type { BaroIncomingItem } from '@/types/baro-incoming';
import { ACTIVITY_KIND_LABEL } from '@/types/crm';

// SalesHomePage — D-127 영업 일일 홈 (BARO 전용).
//
// 출근 첫 화면. 6명 영업이 본인의 오늘 할 일을 30초 안에 파악하고 행동으로 들어가는 보드.
// PR3 Phase 1: 신규 backend 0 — 기존 sanitized API 3종을 frontend 에서 합성.
//   - 오늘의 미처리 후속      ← /api/v1/me/open-followups
//   - 한도 위험 거래처(60일+)  ← /api/v1/baro/credit-board (in-memory filter)
//   - 신규 입고예정 N건         ← /api/v1/baro/incoming (count, scheduled/shipping)
//
// PR3.5 (별도 backend 필요):
//   - 자동 콜백 추천: 신규 입고 SKU × 직전 12개월 본인 거래처 매칭
//   - 본인 담당 거래처만 필터(현재는 owner_user_id 기반 in-memory 필터 가능하지만
//     credit_board RPC 가 owner 를 안 뱉어 partners join 필요 — PR3.5 에서 보강)

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function isOverdueOrToday(dueIso: string | null | undefined): boolean {
  if (!dueIso) return false;
  return dueIso <= todayISO();
}

function formatKrw(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('ko-KR');
}

interface HomeData {
  followups: OpenFollowup[];
  creditAtRisk: CreditBoardRow[];
  incomingCount: number;
  incomingNextEta: string | null;
}

export default function SalesHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [followups, credits, incoming] = await Promise.all([
        fetchWithAuth<OpenFollowup[]>('/api/v1/me/open-followups').catch(() => [] as OpenFollowup[]),
        fetchWithAuth<CreditBoardRow[]>('/api/v1/baro/credit-board').catch(() => [] as CreditBoardRow[]),
        fetchWithAuth<BaroIncomingItem[]>('/api/v1/baro/incoming').catch(() => [] as BaroIncomingItem[]),
      ]);

      const creditAtRisk = (credits ?? [])
        .filter((c) => (c.oldest_unpaid_days ?? 0) >= 60 || (c.utilization_pct ?? 0) >= 100)
        .sort((a, b) => (b.oldest_unpaid_days ?? 0) - (a.oldest_unpaid_days ?? 0))
        .slice(0, 8);

      const incomingScheduled = (incoming ?? []).filter(
        (i) => i.status === 'scheduled' || i.status === 'shipping' || i.status === 'arrived',
      );
      const nextEta = incomingScheduled
        .map((i) => i.eta)
        .filter((e): e is string => Boolean(e))
        .sort()[0] ?? null;

      setData({
        followups: followups ?? [],
        creditAtRisk,
        incomingCount: incomingScheduled.length,
        incomingNextEta: nextEta,
      });
    } catch (e) {
      console.error('[영업 홈 로드 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dueToday = useMemo(
    () => (data?.followups ?? []).filter((f) => isOverdueOrToday(f.follow_up_due)),
    [data],
  );
  const dueLater = useMemo(
    () => (data?.followups ?? []).filter((f) => !isOverdueOrToday(f.follow_up_due)),
    [data],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        영업 홈 불러오는 중...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>{error || '데이터 없음'}</span>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          다시 시도
        </Button>
      </div>
    );
  }

  const greeting = `${user?.name ?? '영업'}님, 오늘 ${todayISO()}`;

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">{greeting}</h1>
          <span className="text-xs text-muted-foreground">
            오늘의 후속·한도 위험·입고예정을 한 화면에.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          새로 고침
        </Button>
      </div>

      {/* 요약 stat 4종 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={<Inbox className="h-3.5 w-3.5" />}
          label="오늘의 후속"
          value={`${dueToday.length}건`}
          tone={dueToday.length > 0 ? 'amber' : 'green'}
          onClick={() => navigate('/crm/inbox')}
        />
        <SummaryCard
          icon={<Bell className="h-3.5 w-3.5" />}
          label="이후 예정 후속"
          value={`${dueLater.length}건`}
          tone="blue"
          onClick={() => navigate('/crm/inbox')}
        />
        <SummaryCard
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
          label="한도/연체 위험"
          value={`${data.creditAtRisk.length}곳`}
          tone={data.creditAtRisk.length > 0 ? 'red' : 'green'}
          onClick={() => navigate('/baro/credit-board')}
        />
        <SummaryCard
          icon={<Ship className="h-3.5 w-3.5" />}
          label="신규 입고예정"
          value={`${data.incomingCount}건`}
          subValue={data.incomingNextEta ? `최단 ETA ${data.incomingNextEta}` : '예정 없음'}
          tone="blue"
          onClick={() => navigate('/baro/incoming')}
        />
      </div>

      {/* 메인 grid: 후속 / 한도 위험 / 입고 예정 안내 */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-3">
        {/* 오늘 후속 (overdue/today) */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Inbox className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">오늘 답변할 후속</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {dueToday.length}
            </Badge>
          </div>
          <div className="flex-1 overflow-auto">
            {dueToday.length === 0 ? (
              <p className="text-xs text-muted-foreground">오늘 마감 후속 없음 ✓</p>
            ) : (
              <ul className="space-y-1.5">
                {dueToday.map((f) => (
                  <li key={f.activity_id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/baro/cockpit?partner_id=${encodeURIComponent(f.partner_id)}`)}
                      className="group w-full rounded-sm border bg-muted/20 p-2 text-left text-xs transition hover:border-primary"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {f.partner?.partner_name ?? '거래처 미상'}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {ACTIVITY_KIND_LABEL[f.kind]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{f.body}</p>
                      <div className="mt-0.5 flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">
                          마감 {f.follow_up_due ?? '—'}
                        </span>
                        <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 한도/연체 위험 거래처 */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">한도/연체 위험</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {data.creditAtRisk.length}
            </Badge>
          </div>
          <div className="flex-1 overflow-auto">
            {data.creditAtRisk.length === 0 ? (
              <p className="text-xs text-muted-foreground">위험 거래처 없음 ✓</p>
            ) : (
              <ul className="space-y-1.5">
                {data.creditAtRisk.map((c) => {
                  const overdue = (c.oldest_unpaid_days ?? 0) >= 60;
                  const overLimit = (c.utilization_pct ?? 0) >= 100;
                  return (
                    <li key={c.partner_id}>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/baro/cockpit?partner_id=${encodeURIComponent(c.partner_id)}`)
                        }
                        className="group w-full rounded-sm border bg-muted/20 p-2 text-left text-xs transition hover:border-primary"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.partner_name}</span>
                          <div className="flex items-center gap-1">
                            {overLimit && (
                              <Badge variant="destructive" className="text-[10px]">한도초과</Badge>
                            )}
                            {overdue && (
                              <Badge variant="destructive" className="text-[10px]">
                                {c.oldest_unpaid_days}일
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>미수 {formatKrw(c.outstanding_krw)}원</span>
                          <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* 신규 입고 안내 추천 — Phase 1 stub: 입고예정 진입 링크 */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Ship className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">신규 입고 안내</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {data.incomingCount}건
            </Badge>
          </div>
          <div className="flex flex-1 flex-col gap-2 overflow-auto text-xs text-muted-foreground">
            {data.incomingCount === 0 ? (
              <p>예정된 입고 없음.</p>
            ) : (
              <>
                <p>
                  공급예정 {data.incomingCount}건. 최단 ETA {data.incomingNextEta ?? '—'}.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/baro/incoming')}
                  className="self-start"
                >
                  입고예정 보드 열기
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </>
            )}
            <div className="mt-auto rounded-sm border border-dashed border-muted-foreground/30 p-2 text-[10px] leading-relaxed">
              <strong>PR3.5 예정:</strong> 신규 입고 SKU × 직전 12개월 매입 거래처 매칭으로
              "이 입고를 알려야 할 거래처 N곳" 자동 추천 + 1-click 일괄 카톡 발송.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  subValue,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  tone: 'green' | 'blue' | 'amber' | 'red';
  onClick?: () => void;
}) {
  const toneClass = {
    green: 'border-green-200 bg-green-50/50',
    blue: 'border-blue-200 bg-blue-50/50',
    amber: 'border-amber-200 bg-amber-50/50',
    red: 'border-red-200 bg-red-50/50',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-md border px-3 py-2 text-left transition hover:border-primary ${toneClass}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {subValue && <div className="text-[10px] text-muted-foreground">{subValue}</div>}
    </button>
  );
}
