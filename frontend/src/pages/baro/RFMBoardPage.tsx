import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Heart, Sparkles, AlertTriangle, MoonStar, Ban, RefreshCw, ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api';
import {
  type RFMRow,
  type RFMSegment,
  SEGMENT_LABEL,
  SEGMENT_DESCRIPTION,
  SEGMENT_TONE,
} from '@/types/baro-rfm';

// RFMBoardPage — D-128 거래처 RFM/세그먼트 보드 (BARO 전용).
//
// 200거래처를 한 화면에 분류. champion / loyal / new / at_risk / lost / inactive.
// 영업 6명이 본인 담당 거래처의 우선순위를 정렬하기 위한 도구.
//
// PR4.5 분리:
//   - 동적 분위수(quartile) 기반 분류 (현재는 단순 임계값)
//   - 본인 담당 거래처만 필터 (현재는 전체 노출)
//   - 자동 재활성화 큐 → 1-click 카톡 (PR3.5 의 발송 채널 통합 후)

const SEGMENT_ICON: Record<RFMSegment, React.ComponentType<{ className?: string }>> = {
  champion: Trophy,
  loyal: Heart,
  new: Sparkles,
  at_risk: AlertTriangle,
  lost: MoonStar,
  inactive: Ban,
};

const SEGMENT_ORDER: RFMSegment[] = ['champion', 'loyal', 'new', 'at_risk', 'lost', 'inactive'];

function formatKrw(v: number | null | undefined): string {
  if (v == null) return '—';
  if (v >= 1_0000_0000) return `${(v / 1_0000_0000).toFixed(1)}억`;
  if (v >= 10000) return `${Math.round(v / 10000).toLocaleString('ko-KR')}만`;
  return v.toLocaleString('ko-KR');
}

export default function RFMBoardPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<RFMRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeSegment, setActiveSegment] = useState<RFMSegment | 'all'>('all');
  const [sortBy, setSortBy] = useState<'amount' | 'recency' | 'frequency'>('amount');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWithAuth<RFMRow[]>('/api/v1/baro/rfm/');
      setRows(data ?? []);
    } catch (e) {
      console.error('[RFM 보드 로드 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 세그먼트별 카운트 + 매출 합
  const segmentSummary = useMemo(() => {
    const acc: Record<RFMSegment, { count: number; amount: number }> = {
      champion: { count: 0, amount: 0 },
      loyal: { count: 0, amount: 0 },
      new: { count: 0, amount: 0 },
      at_risk: { count: 0, amount: 0 },
      lost: { count: 0, amount: 0 },
      inactive: { count: 0, amount: 0 },
    };
    for (const r of rows) {
      acc[r.segment].count += 1;
      acc[r.segment].amount += r.sale_amount_12mo_krw;
    }
    return acc;
  }, [rows]);

  const filtered = useMemo(() => {
    const f = activeSegment === 'all' ? rows : rows.filter((r) => r.segment === activeSegment);
    const sorted = [...f].sort((a, b) => {
      if (sortBy === 'amount') return b.sale_amount_12mo_krw - a.sale_amount_12mo_krw;
      if (sortBy === 'frequency') return b.sale_count_12mo - a.sale_count_12mo;
      // recency: 작은 days 가 최근. null 은 뒤로.
      const ad = a.days_since_last_sale ?? Number.POSITIVE_INFINITY;
      const bd = b.days_since_last_sale ?? Number.POSITIVE_INFINITY;
      return ad - bd;
    });
    return sorted;
  }, [rows, activeSegment, sortBy]);

  const reactivationCount = segmentSummary.at_risk.count;
  const reactivationAmount = segmentSummary.at_risk.amount;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        RFM 보드 불러오는 중...
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>{error}</span>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">거래처 RFM 보드</h1>
          <span className="text-xs text-muted-foreground">
            12개월 매출 기반 분류 — 활성 거래처 {rows.length}곳.
          </span>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          새로 고침
        </Button>
      </div>

      {/* 재활성화 큐 알림 */}
      {reactivationCount > 0 && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span className="font-medium">재활성화 큐:</span>
            <span>
              한동안 미주문이지만 매출 이력 큰 거래처 <strong>{reactivationCount}곳</strong> · 총
              매출 <strong>{formatKrw(reactivationAmount)}원</strong>
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveSegment('at_risk')}
          >
            보기
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      )}

      {/* 세그먼트 탭 */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
        <SegmentTab
          label="전체"
          count={rows.length}
          active={activeSegment === 'all'}
          onClick={() => setActiveSegment('all')}
        />
        {SEGMENT_ORDER.map((seg) => {
          const Icon = SEGMENT_ICON[seg];
          return (
            <SegmentTab
              key={seg}
              label={SEGMENT_LABEL[seg]}
              count={segmentSummary[seg].count}
              tone={SEGMENT_TONE[seg].bg}
              icon={<Icon className="h-3 w-3" />}
              active={activeSegment === seg}
              onClick={() => setActiveSegment(seg)}
            />
          );
        })}
      </div>

      {/* 정렬 컨트롤 */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">정렬:</span>
        {(['amount', 'recency', 'frequency'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSortBy(s)}
            data-active={sortBy === s}
            className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
          >
            {s === 'amount' ? '매출' : s === 'recency' ? '최근성' : '빈도'}
          </button>
        ))}
        {activeSegment !== 'all' && (
          <span className="ml-auto text-[11px] text-muted-foreground">
            {SEGMENT_DESCRIPTION[activeSegment]}
          </span>
        )}
      </div>

      {/* 본 표 */}
      <div className="flex-1 overflow-auto rounded-md border bg-card">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="py-1.5 px-2 text-left font-normal">거래처</th>
              <th className="py-1.5 px-2 text-left font-normal">세그먼트</th>
              <th className="py-1.5 px-2 text-right font-normal">12mo 매출</th>
              <th className="py-1.5 px-2 text-right font-normal">건수</th>
              <th className="py-1.5 px-2 text-right font-normal">최근 매출</th>
              <th className="py-1.5 px-2 text-right font-normal">미거래일</th>
              <th className="w-6 px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  해당 세그먼트의 거래처가 없습니다
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const tone = SEGMENT_TONE[r.segment];
                return (
                  <tr
                    key={r.partner_id}
                    onClick={() =>
                      navigate(`/baro/cockpit?partner_id=${encodeURIComponent(r.partner_id)}`)
                    }
                    className="cursor-pointer border-t transition hover:bg-muted/40"
                  >
                    <td className="py-1.5 px-2 font-medium">{r.partner_name}</td>
                    <td className="py-1.5 px-2">
                      <Badge variant={tone.badge} className="text-[10px]">
                        {SEGMENT_LABEL[r.segment]}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {formatKrw(r.sale_amount_12mo_krw)}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{r.sale_count_12mo}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground">
                      {r.last_sale_date ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">
                      {r.days_since_last_sale != null ? `${r.days_since_last_sale}일` : '—'}
                    </td>
                    <td className="py-1.5 px-2">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SegmentTab({
  label,
  count,
  tone,
  icon,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone?: string;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left text-xs transition ${
        active
          ? 'border-primary bg-primary/10'
          : tone
            ? tone
            : 'border-muted hover:border-primary/50'
      }`}
    >
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums">{count}곳</span>
    </button>
  );
}
