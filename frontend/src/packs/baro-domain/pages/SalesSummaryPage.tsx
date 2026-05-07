import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Users, TrendingUp, RefreshCw, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api';
import type { SalesSummaryResponse } from '@/types/baro-sales-summary';

// SalesSummaryPage — D-129 BARO 자체 매출 요약 (BARO 전용).
//
// 영업담당자별 / 거래처타입별 / 월별 / Top 거래처 4 cut 으로 매출 분석.
// module 계열 sales-analysis 는 매입원가 기반 마진 다뤄 BARO 차단 (D-108).
//
// PR5.5: 매입원가 (baro_purchase_history) 통합 마진 표시 + 한도 초과 출고 hold flag.

const PARTNER_TYPE_LABEL: Record<string, string> = {
  customer: '고객',
  both: '겸용',
  supplier: '공급사',
};

interface UserLite {
  user_id: string;
  name?: string;
  full_name?: string;
  email?: string;
}

function formatKrw(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString('ko-KR')}만`;
  return v.toLocaleString('ko-KR');
}

export default function SalesSummaryPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<SalesSummaryResponse | null>(null);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [periodMonths, setPeriodMonths] = useState(12);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [summary, users] = await Promise.all([
        fetchWithAuth<SalesSummaryResponse>(`/api/v1/baro/sales-summary/?months=${periodMonths}`),
        fetchWithAuth<UserLite[]>('/api/v1/users/').catch(() => [] as UserLite[]),
      ]);
      setData(summary);
      const map = new Map<string, string>();
      for (const u of users ?? []) {
        const name = u.name ?? u.full_name ?? u.email ?? u.user_id;
        map.set(u.user_id, name);
      }
      setUserMap(map);
    } catch (e) {
      console.error('[매출 요약 로드 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [periodMonths]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthlyAvg = useMemo(() => {
    if (!data || data.period_months === 0) return 0;
    return data.total_amount / data.period_months;
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        매출 요약 불러오는 중...
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

  // 월별 차트 — 단순 막대 비주얼 (recharts 미사용, CSS bar)
  const maxMonthAmount = Math.max(1, ...data.by_month.map((m) => m.amount));

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">BARO 매출 요약</h1>
          <span className="text-xs text-muted-foreground">
            {data.start_date} ~ {data.end_date} · {data.period_months}개월
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPeriodMonths(m)}
              data-active={periodMonths === m}
              className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
            >
              {m}개월
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로 고침
          </Button>
        </div>
      </div>

      {/* Stat 4종 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="총 매출액" value={`${formatKrw(data.total_amount)}원`} />
        <Stat label="매출 건수" value={`${data.total_count.toLocaleString('ko-KR')}건`} />
        <Stat label="거래 거래처" value={`${data.unique_partners}곳`} />
        <Stat label="월평균 매출" value={`${formatKrw(monthlyAvg)}원`} />
      </div>

      {/* 메인 grid: 담당자 / 타입 / 월별 / Top 거래처 */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-2">
        {/* 영업담당자별 */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">영업담당자별</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {data.by_owner.length}명
            </Badge>
          </div>
          <div className="flex-1 overflow-auto">
            {data.by_owner.length === 0 ? (
              <p className="text-xs text-muted-foreground">담당자 매핑 없음</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-[10px] text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-normal">담당자</th>
                    <th className="py-1 text-right font-normal">매출</th>
                    <th className="py-1 text-right font-normal">건수</th>
                    <th className="py-1 text-right font-normal">거래처</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_owner.map((o, i) => {
                    const name = o.owner_user_id ? userMap.get(o.owner_user_id) ?? `담당자 ${i + 1}` : '미배정';
                    return (
                      <tr key={o.owner_user_id ?? `none-${i}`} className="border-t">
                        <td className="py-1 font-medium">{name}</td>
                        <td className="py-1 text-right tabular-nums">{formatKrw(o.amount)}</td>
                        <td className="py-1 text-right tabular-nums">{o.count}</td>
                        <td className="py-1 text-right tabular-nums">{o.partner_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* 거래처 타입별 */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">거래처 유형별</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-[10px] text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-normal">유형</th>
                  <th className="py-1 text-right font-normal">매출</th>
                  <th className="py-1 text-right font-normal">건수</th>
                  <th className="py-1 text-right font-normal">비중</th>
                </tr>
              </thead>
              <tbody>
                {data.by_partner_type.map((t) => {
                  const pct = data.total_amount > 0 ? (t.amount / data.total_amount) * 100 : 0;
                  return (
                    <tr key={t.partner_type} className="border-t">
                      <td className="py-1">
                        <Badge variant="outline" className="text-[10px]">
                          {PARTNER_TYPE_LABEL[t.partner_type] ?? t.partner_type}
                        </Badge>
                      </td>
                      <td className="py-1 text-right tabular-nums">{formatKrw(t.amount)}</td>
                      <td className="py-1 text-right tabular-nums">{t.count}</td>
                      <td className="py-1 text-right tabular-nums">{pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* 월별 추이 (CSS 막대) */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">월별 매출</h2>
          </div>
          <div className="flex-1 overflow-auto">
            {data.by_month.length === 0 ? (
              <p className="text-xs text-muted-foreground">기간 내 매출 없음</p>
            ) : (
              <ul className="space-y-1">
                {data.by_month.map((m) => (
                  <li key={m.month} className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 text-muted-foreground tabular-nums">{m.month}</span>
                    <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/40">
                      <div
                        className="absolute left-0 top-0 h-full bg-primary/40"
                        style={{ width: `${(m.amount / maxMonthAmount) * 100}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-2 text-[10px] tabular-nums">
                        {formatKrw(m.amount)}원 · {m.count}건
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Top 거래처 */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">Top 거래처</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              상위 {data.top_partners.length}곳
            </Badge>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-[10px] text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-normal">#</th>
                  <th className="py-1 text-left font-normal">거래처</th>
                  <th className="py-1 text-right font-normal">매출</th>
                  <th className="py-1 text-right font-normal">건수</th>
                  <th className="w-6 py-1" />
                </tr>
              </thead>
              <tbody>
                {data.top_partners.map((p, i) => (
                  <tr
                    key={p.partner_id}
                    onClick={() =>
                      navigate(`/baro/cockpit?partner_id=${encodeURIComponent(p.partner_id)}`)
                    }
                    className="cursor-pointer border-t hover:bg-muted/40"
                  >
                    <td className="py-1 text-muted-foreground">{i + 1}</td>
                    <td className="py-1 font-medium">{p.partner_name}</td>
                    <td className="py-1 text-right tabular-nums">{formatKrw(p.amount)}</td>
                    <td className="py-1 text-right tabular-nums">{p.count}</td>
                    <td className="py-1">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
