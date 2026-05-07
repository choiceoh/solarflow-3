import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Phone, ShieldAlert, ScrollText, Inbox, RefreshCw, Search, Calculator } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fetchWithAuth } from '@/lib/api';
import type { CockpitResponse } from '@/types/baro-cockpit';
import type { Partner } from '@/types/masters';
import { ACTIVITY_KIND_LABEL } from '@/types/crm';

// PartnerCockpitPage — D-125 거래처 360 cockpit (BARO 전용).
//
// 사이드바에서 partner_id 없이 진입 시: 검색/picker 표시.
// partner_id 가 query param 에 있으면: 5개 패널 + stub 2개 표시.
//
// 비유: "전화 응대 한 화면" — 통화 받자마자 미수금/한도/최근매출/CRM 후속이 한눈에.

function formatKrw(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString('ko-KR')}원`;
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function utilizationVariant(
  pct: number | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (pct == null) return 'outline';
  if (pct >= 100) return 'destructive';
  if (pct >= 80) return 'default';
  return 'secondary';
}

function agingVariant(
  days: number | null | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (days == null) return 'outline';
  if (days >= 90) return 'destructive';
  if (days >= 60) return 'default';
  return 'secondary';
}

export default function PartnerCockpitPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const partnerId = searchParams.get('partner_id') ?? '';

  if (partnerId) {
    return (
      <CockpitView
        partnerId={partnerId}
        onClear={() => setSearchParams(new URLSearchParams())}
      />
    );
  }
  return <PartnerPicker onPick={(p) => setSearchParams({ partner_id: p.partner_id })} />;
}

// ---------- Picker ----------

function PartnerPicker({ onPick }: { onPick: (p: Partner) => void }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await fetchWithAuth<Partner[]>('/api/v1/partners/');
        if (alive) setPartners(list);
      } catch (e) {
        console.error('[cockpit picker 로드 실패]', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const customers = partners.filter(
      (p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'),
    );
    if (!q) return customers.slice(0, 50);
    return customers.filter((p) => p.partner_name.toLowerCase().includes(q)).slice(0, 50);
  }, [partners, query]);

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h1 className="text-base font-semibold">거래처 360 cockpit</h1>
        <span className="text-xs text-muted-foreground">
          전화 응대용 — 거래처를 선택하면 신용/최근매출/CRM 후속이 한 화면에.
        </span>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          placeholder="거래처명 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="flex-1 overflow-auto rounded-md border bg-card">
        {loading ? (
          <div className="p-6 text-center text-xs text-muted-foreground">불러오는 중...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {query ? '일치하는 거래처가 없습니다' : '활성 고객 거래처가 없습니다'}
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((p) => (
              <li key={p.partner_id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{p.partner_name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.contact_name ?? '담당자 없음'}
                      {p.contact_phone ? ` · ${p.contact_phone}` : ''}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {p.partner_type === 'both' ? '겸용' : '고객'}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- Cockpit ----------

function CockpitView({ partnerId, onClear }: { partnerId: string; onClear: () => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<CockpitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetchWithAuth<CockpitResponse>(
        `/api/v1/baro/partner-cockpit/${encodeURIComponent(partnerId)}`,
      );
      setData(resp);
    } catch (e) {
      console.error('[cockpit 로드 실패]', e);
      setError(e instanceof Error ? e.message : '거래처 cockpit 로드에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        cockpit 불러오는 중...
      </div>
    );
  }
  if (error || !data || !data.partner) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>{error || '거래처를 찾을 수 없습니다'}</span>
        <Button size="sm" variant="outline" onClick={onClear}>
          거래처 다시 선택
        </Button>
      </div>
    );
  }

  const { partner, credit, recent_sales, open_followups, recent_activities, quote_ready_skus } = data;

  return (
    <div className="flex h-full w-full flex-col gap-3 p-3.5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h1 className="text-base font-semibold">{partner.partner_name}</h1>
          <Badge variant="outline" className="text-[10px]">
            {partner.partner_type === 'both' ? '겸용' : partner.partner_type === 'customer' ? '고객' : '공급사'}
          </Badge>
          {partner.contact_phone && (
            <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Phone className="h-3 w-3" />
              {partner.contact_phone}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onClear}>
            거래처 변경
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/baro/quote/new?partner_id=${encodeURIComponent(partner.partner_id)}`)}
          >
            <Calculator className="mr-1 h-3.5 w-3.5" />
            이 거래처 견적
          </Button>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            새로 고침
          </Button>
        </div>
      </div>

      {/* 신용/한도 */}
      <section className="rounded-md border bg-card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-semibold">신용 / 한도</h2>
        </div>
        {credit ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="미수금" value={formatKrw(credit.outstanding_krw)} />
            <Stat label="한도" value={formatKrw(credit.credit_limit_krw)} />
            <Stat
              label="사용률"
              value={
                <Badge variant={utilizationVariant(credit.utilization_pct)} className="text-[11px] tabular-nums">
                  {formatPct(credit.utilization_pct)}
                </Badge>
              }
            />
            <Stat
              label="최장 미수일"
              value={
                <Badge variant={agingVariant(credit.oldest_unpaid_days)} className="text-[11px] tabular-nums">
                  {credit.oldest_unpaid_days != null ? `${credit.oldest_unpaid_days}일` : '—'}
                </Badge>
              }
            />
            <Stat label="잔여" value={formatKrw(credit.remaining_krw)} />
            <Stat
              label="결제일수"
              value={credit.credit_payment_days != null ? `${credit.credit_payment_days}일` : '—'}
            />
            <Stat label="최근 매출" value={credit.last_sale_date ?? '—'} />
            <Stat label="최근 입금" value={credit.last_receipt_date ?? '—'} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">신용 데이터 없음 (보드에 미등록)</p>
        )}
      </section>

      {/* 미처리 후속 + 최근 활동 + 최근 매출 — 3열 grid */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-3">
        {/* 미처리 문의 */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Inbox className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">미처리 후속</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {open_followups.length}건
            </Badge>
          </div>
          <div className="flex-1 overflow-auto">
            {open_followups.length === 0 ? (
              <p className="text-xs text-muted-foreground">미처리 후속이 없습니다</p>
            ) : (
              <ul className="space-y-1.5">
                {open_followups.map((a) => (
                  <li key={a.activity_id} className="rounded-sm border bg-muted/20 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px]">
                        {ACTIVITY_KIND_LABEL[a.kind]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {a.follow_up_due ? `~${a.follow_up_due}` : '기한 없음'}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-[11px]">{a.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 최근 매출 6개월 */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <ScrollText className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">최근 매출 (6개월)</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {recent_sales.length}건
            </Badge>
          </div>
          <div className="flex-1 overflow-auto">
            {recent_sales.length === 0 ? (
              <p className="text-xs text-muted-foreground">최근 6개월 매출이 없습니다</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-[10px] text-muted-foreground">
                  <tr>
                    <th className="py-1 text-left font-normal">계산서일</th>
                    <th className="py-1 text-right font-normal">수량</th>
                    <th className="py-1 text-right font-normal">단가(W)</th>
                    <th className="py-1 text-right font-normal">금액</th>
                  </tr>
                </thead>
                <tbody>
                  {recent_sales.map((s) => (
                    <tr key={s.sale_id} className="border-t">
                      <td className="py-1 text-muted-foreground">{s.tax_invoice_date ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums">{s.quantity ?? '—'}</td>
                      <td className="py-1 text-right tabular-nums">{s.unit_price_wp.toFixed(0)}</td>
                      <td className="py-1 text-right tabular-nums">{formatKrw(s.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* 최근 활동 timeline */}
        <section className="flex min-h-0 flex-col rounded-md border bg-card p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-sm font-semibold">최근 활동</h2>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {recent_activities.length}건
            </Badge>
          </div>
          <div className="flex-1 overflow-auto">
            {recent_activities.length === 0 ? (
              <p className="text-xs text-muted-foreground">활동 기록이 없습니다</p>
            ) : (
              <ul className="space-y-1.5">
                {recent_activities.map((a) => (
                  <li key={a.activity_id} className="rounded-sm border bg-muted/20 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px]">
                        {ACTIVITY_KIND_LABEL[a.kind]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {a.created_at.slice(0, 10)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px]">{a.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* 견적 가능 SKU — D-126 PR2: partner_price_book 기반 prefill */}
      <section className="rounded-md border bg-card p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Calculator className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-sm font-semibold">견적 가능 SKU</h2>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {quote_ready_skus.length}개 단가 등록
          </Badge>
        </div>
        {quote_ready_skus.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            이 거래처의 단가표가 비어 있습니다 — 마스터 &gt; 거래처 단가표에서 등록하세요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {quote_ready_skus.slice(0, 12).map((s) => (
              <Link
                key={s.product_id}
                to={`/baro/quote/new?partner_id=${encodeURIComponent(partner.partner_id)}`}
                className="group rounded border bg-muted/20 px-2.5 py-2 text-xs transition hover:border-primary"
                title="견적 빌더로 이동"
              >
                <div className="truncate font-medium group-hover:text-primary">
                  {s.product_name}
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>재고 {s.available_qty}</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {Math.round(s.unit_price_krw).toLocaleString('ko-KR')}원
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* incoming_matches 패널은 후속 PR(BL 라인 sanitized 통합) 에서 채움 */}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
