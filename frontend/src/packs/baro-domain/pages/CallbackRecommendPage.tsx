import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Ship, RefreshCw, MessageSquare, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api';

// CallbackRecommendPage — D-133 자동 콜백 추천 (BARO 전용, PR3.5).
//
// 영업이 본인 담당 거래처 중 "지금 카톡 보낼 만한 곳" 을 30초 안에 정렬.
// 정책: 직전 6개월 매출 활성 + 마지막 매출 30일+ 경과 (다음 발주 시점 가까움).
// 입고예정 SKU 컨텍스트도 함께 표시 — "이 입고를 알려야 할 거래처" 트리거.
//
// PR3.6 분리: SKU-level 정밀 매칭 (sales→outbound→bl_line→product chain),
// 자동 일괄 발송 큐 (PR7.5 카톡 API 통합 후).

interface CallbackIncomingSKU {
  product_id: string;
  product_name: string | null;
  eta: string | null;
  quantity: number;
}

interface CallbackCustomerCandidate {
  partner_id: string;
  partner_name: string;
  contact_phone: string | null;
  last_sale_date: string;
  days_since_last_sale: number;
  sale_count_6mo: number;
  sale_amount_6mo_krw: number;
  reason: string;
}

interface CallbackOwnerGroup {
  owner_user_id: string | null;
  customers: CallbackCustomerCandidate[];
}

interface CallbackResponse {
  incoming_count: number;
  incoming_skus: CallbackIncomingSKU[];
  by_owner: CallbackOwnerGroup[];
  total_customers: number;
}

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

function reasonTone(reason: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (reason.includes('재활성화')) return 'destructive';
  if (reason.includes('주기')) return 'default';
  return 'secondary';
}

export default function CallbackRecommendPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<CallbackResponse | null>(null);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const url = mineOnly
        ? '/api/v1/baro/callback-recommend/?mine=true'
        : '/api/v1/baro/callback-recommend/';
      const [resp, users] = await Promise.all([
        fetchWithAuth<CallbackResponse>(url),
        fetchWithAuth<UserLite[]>('/api/v1/users/').catch(() => [] as UserLite[]),
      ]);
      setData(resp);
      const map = new Map<string, string>();
      for (const u of users ?? []) {
        const name = u.name ?? u.full_name ?? u.email ?? u.user_id;
        map.set(u.user_id, name);
      }
      setUserMap(map);
    } catch (e) {
      console.error('[콜백 추천 로드 실패]', e);
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [mineOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const ownerName = useMemo(
    () => (oid: string | null) => {
      if (!oid) return '미배정';
      return userMap.get(oid) ?? oid.slice(0, 8);
    },
    [userMap],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        콜백 추천 불러오는 중...
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

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">자동 콜백 추천</h1>
          <span className="text-xs text-muted-foreground">
            6개월 매출 활성 + 30일+ 미주문 거래처 {data.total_customers}곳 · 입고예정 {data.incoming_count}건.
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMineOnly((v) => !v)}
            data-active={mineOnly}
            className="rounded border px-2 py-0.5 text-[11px] data-[active=true]:border-primary data-[active=true]:bg-primary/10"
          >
            내 거래처만
          </button>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로 고침
          </Button>
        </div>
      </div>

      {/* 입고예정 SKU 컨텍스트 (상단 알림) */}
      {data.incoming_skus.length > 0 && (
        <section className="rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Ship className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">현재 입고예정</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {data.incoming_skus.length}건
            </Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.incoming_skus.slice(0, 12).map((s, i) => (
              <div
                key={`${s.product_id}-${i}`}
                className="rounded border bg-muted/20 px-2 py-1 text-xs"
              >
                <span className="font-medium">{s.product_name ?? s.product_id.slice(0, 8)}</span>
                <span className="ml-2 text-[10px] text-muted-foreground">
                  {s.quantity}장 · ETA {s.eta ?? '미정'}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            ↓ 아래 거래처에 카톡으로 알리세요 (출하 알림 페이지로 이동).
          </p>
        </section>
      )}

      {/* 영업담당자별 추천 거래처 */}
      <div className="flex-1 overflow-auto">
        {data.by_owner.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            추천 거래처가 없습니다 — 모든 거래처가 최근 30일 내 거래 중이거나 활성 매출이 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {data.by_owner.map((grp) => (
              <section
                key={grp.owner_user_id ?? 'unassigned'}
                className="rounded-md border bg-card p-3"
              >
                <div className="mb-2 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <h2 className="text-sm font-semibold">{ownerName(grp.owner_user_id)}</h2>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {grp.customers.length}곳 추천
                  </Badge>
                </div>
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="py-1 text-left font-normal">거래처</th>
                      <th className="py-1 text-right font-normal">최근 매출</th>
                      <th className="py-1 text-right font-normal">미거래</th>
                      <th className="py-1 text-right font-normal">6mo 매출</th>
                      <th className="py-1 text-left font-normal">사유</th>
                      <th className="py-1 text-left font-normal">연락처</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {grp.customers.map((c) => (
                      <tr key={c.partner_id} className="border-t">
                        <td
                          className="cursor-pointer py-1 font-medium hover:text-primary"
                          onClick={() =>
                            navigate(`/baro/cockpit?partner_id=${encodeURIComponent(c.partner_id)}`)
                          }
                        >
                          {c.partner_name}
                        </td>
                        <td className="py-1 text-right text-muted-foreground">
                          {c.last_sale_date}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          <Badge variant={c.days_since_last_sale >= 90 ? 'destructive' : 'secondary'} className="text-[10px]">
                            {c.days_since_last_sale}일
                          </Badge>
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {formatKrw(c.sale_amount_6mo_krw)}
                        </td>
                        <td className="py-1">
                          <Badge variant={reasonTone(c.reason)} className="text-[10px]">
                            {c.reason}
                          </Badge>
                        </td>
                        <td className="py-1 text-[10px] text-muted-foreground">
                          {c.contact_phone ?? '—'}
                        </td>
                        <td className="py-1 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px]"
                            onClick={() => navigate('/baro/shipment-notice')}
                          >
                            <MessageSquare className="mr-1 h-3 w-3" />
                            알림
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
