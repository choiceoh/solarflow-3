// 알림 센터 훅 (Step 31 — useDashboard에서 분리)
// 9가지 알림 계산, 5분 자동 갱신, 법인 변경 시 즉시 재조회

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { fetchCalc, companyQueryUrl } from '@/lib/companyUtils';
import type { InventoryResponse } from '@/types/inventory';
import type { BLShipment } from '@/types/inbound';
import type { Order } from '@/types/orders';
import type { AlertItem } from '@/types/alerts';
import type { LCLimitTimeline, LCMaturityAlert } from '@/types/banking';
import type { Outbound } from '@/types/outbound';

interface CustomerAnalysisAlertItem {
  customer_id?: string;
  customer_name: string;
  outstanding_krw?: number;
  outstanding_amount?: number;
  outstanding_count: number;
  oldest_outstanding_days?: number;
  max_days_overdue?: number;
}

interface CustomerAnalysis {
  items?: CustomerAnalysisAlertItem[];
  customers?: CustomerAnalysisAlertItem[];
  summary?: {
    total_outstanding_krw?: number;
  };
  total_outstanding?: number;
}

interface Sale {
  sale_id: string;
  outbound_id?: string;
  tax_invoice_date?: string;
  sale?: {
    tax_invoice_date?: string;
  };
}

function customerRows(data: CustomerAnalysis): CustomerAnalysisAlertItem[] {
  return data.items ?? data.customers ?? [];
}

function customerOverdueDays(customer: CustomerAnalysisAlertItem) {
  return customer.oldest_outstanding_days ?? customer.max_days_overdue ?? 0;
}

function customerOutstanding(customer: CustomerAnalysisAlertItem) {
  return customer.outstanding_krw ?? customer.outstanding_amount ?? 0;
}

function daysUntil(value: string | undefined, today: Date) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function hasIssuedTaxInvoice(sale: Sale | undefined) {
  return Boolean(sale?.tax_invoice_date ?? sale?.sale?.tax_invoice_date);
}

/*
 * 비유: 헤더 알림은 상황판의 작은 경광등입니다.
 * 각 API 응답 모양이 조금 달라도 여기서 운영 알림 하나의 형태로 정리합니다.
 */
interface LegacyCustomerAnalysis {
  customers: {
    customer_name: string;
    outstanding_amount: number;
    outstanding_count: number;
    max_days_overdue: number;
  }[];
  total_outstanding: number;
}

// D-060: merge 함수들
function mergeMaturity(rs: LCMaturityAlert[]): LCMaturityAlert {
  return { alerts: rs.flatMap((r) => r.alerts || []) };
}
function mergeTimeline(rs: LCLimitTimeline[]): LCLimitTimeline {
  const projMap = new Map<string, number>();
  for (const r of rs) for (const p of r.monthly_projection || []) projMap.set(p.month, (projMap.get(p.month) || 0) + p.projected_available);
  return {
    bank_summaries: rs.flatMap((r) => r.bank_summaries || []),
    timeline_events: rs.flatMap((r) => r.timeline_events || []),
    monthly_projection: Array.from(projMap.entries()).map(([month, projected_available]) => ({ month, projected_available })),
  };
}
function mergeCustomer(rs: CustomerAnalysis[]): CustomerAnalysis {
  return {
    items: rs.flatMap(customerRows),
    summary: {
      total_outstanding_krw: rs.reduce((s, r) => s + (r.summary?.total_outstanding_krw ?? r.total_outstanding ?? 0), 0),
    },
  };
}
// inventory 다중 법인 merge는 엔진에서 처리됨

export function useAlerts(companyId: string | null) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!companyId) { setAlerts([]); setLoading(false); return; }
    setLoading(true);

    // D-060: fetchCalc가 "all"이면 법인별 호출 후 merge
    const results = await Promise.allSettled([
      fetchCalc<LCMaturityAlert>(companyId, '/api/v1/calc/lc-maturity-alert', { days_ahead: 7 }, mergeMaturity),
      fetchCalc<LCLimitTimeline>(companyId, '/api/v1/calc/lc-limit-timeline', { months_ahead: 3 }, mergeTimeline),
      fetchCalc<CustomerAnalysis | LegacyCustomerAnalysis>(companyId, '/api/v1/calc/customer-analysis', {}, (rs) => mergeCustomer(rs as CustomerAnalysis[])),
      fetchCalc<InventoryResponse>(companyId, '/api/v1/calc/inventory', {}),
      // CRUD: "all"이면 company_id 생략
      fetchWithAuth<BLShipment[]>(companyQueryUrl('/api/v1/bls', companyId)),
      fetchWithAuth<Order[]>(companyQueryUrl('/api/v1/orders', companyId)),
      fetchWithAuth<Outbound[]>(companyQueryUrl('/api/v1/outbounds', companyId)),
      fetchWithAuth<Sale[]>(companyQueryUrl('/api/v1/sales', companyId)),
    ]);

    const matResult = results[0];
    const tlResult = results[1];
    const custResult = results[2];
    const invResult = results[3];
    const blResult = results[4];
    const orderResult = results[5];
    const outResult = results[6];
    const saleResult = results[7];

    const items: AlertItem[] = [];
    let id = 0;

    // 1: LC 만기 임박 (7일 이내)
    if (matResult.status === 'fulfilled') {
      const cnt = (matResult.value.alerts || []).filter((a) => a.days_remaining >= 0 && a.days_remaining <= 7).length;
      if (cnt > 0) items.push({ id: String(++id), type: 'lc_maturity', severity: 'critical', icon: 'Clock', title: 'LC 만기 임박', description: `7일 이내 만기 LC ${cnt}건`, count: cnt, link: '/banking?tab=maturity' });
    }

    // 2: LC 한도 부족
    if (tlResult.status === 'fulfilled') {
      const projections = tlResult.value.monthly_projection || [];
      const shortageMonths = projections.filter((p: { projected_available: number }) => p.projected_available < 0);
      if (shortageMonths.length > 0) items.push({ id: String(++id), type: 'lc_shortage', severity: 'critical', icon: 'TrendingDown', title: 'LC 한도 부족', description: `3개월 내 한도 부족 예상 ${shortageMonths.length}개월`, count: shortageMonths.length, link: '/banking?tab=demand' });
    }

    // 3,4: 미수금 주의/연체
    if (custResult.status === 'fulfilled') {
      const customers = customerRows(custResult.value as CustomerAnalysis)
        .filter((c) => customerOutstanding(c) > 0);
      const warn30 = customers.filter((c) => {
        const days = customerOverdueDays(c);
        return days > 30 && days <= 60;
      }).length;
      const crit60 = customers.filter((c) => customerOverdueDays(c) > 60).length;
      if (crit60 > 0) items.push({ id: String(++id), type: 'overdue_critical', severity: 'critical', icon: 'AlertCircle', title: '미수금 연체', description: `60일 초과 거래처 ${crit60}곳`, count: crit60, link: '/orders?tab=matching' });
      if (warn30 > 0) items.push({ id: String(++id), type: 'overdue_warning', severity: 'warning', icon: 'AlertTriangle', title: '미수금 주의', description: `30일 초과 거래처 ${warn30}곳`, count: warn30, link: '/orders?tab=matching' });
    }

    // 5: 계산서 미발행
    let outbounds: Outbound[] = [];
    let sales: Sale[] = [];
    if (outResult.status === 'fulfilled') outbounds = outResult.value;
    if (saleResult.status === 'fulfilled') sales = saleResult.value;
    const salesByOutboundId = new Map(sales.filter((s) => s.outbound_id).map((s) => [s.outbound_id!, s]));
    const noInvoice = outbounds.filter((o) => {
      if (o.status !== 'active') return false;
      const sale = o.sale ?? salesByOutboundId.get(o.outbound_id);
      return !hasIssuedTaxInvoice(sale);
    }).length;
    if (noInvoice > 0) items.push({ id: String(++id), type: 'no_invoice', severity: 'warning', icon: 'FileText', title: '계산서 미발행', description: `출고완료+미발행 ${noInvoice}건`, count: noInvoice, link: '/orders?tab=sales' });

    // 6: 입항 예정
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let blData: BLShipment[] = [];
    if (blResult.status === 'fulfilled') blData = blResult.value;
    const eta7 = blData.filter((bl) => {
      if (bl.status !== 'shipping' || !bl.eta) return false;
      const diff = daysUntil(bl.eta, today);
      if (diff == null) return false;
      return diff >= 0 && diff <= 7;
    }).length;
    if (eta7 > 0) items.push({ id: String(++id), type: 'eta_soon', severity: 'info', icon: 'Ship', title: '입항 예정', description: `7일 이내 입항 ${eta7}건`, count: eta7, link: '/procurement?tab=bl' });

    // 7,8: 장기재고
    if (invResult.status === 'fulfilled') {
      const warnCnt = invResult.value.items.filter((i) => i.long_term_status === 'warning').length;
      const critCnt = invResult.value.items.filter((i) => i.long_term_status === 'critical').length;
      if (critCnt > 0) items.push({ id: String(++id), type: 'longterm_critical', severity: 'critical', icon: 'PackageX', title: '장기재고 심각', description: `365일+ ${critCnt}건`, count: critCnt, link: '/inventory' });
      if (warnCnt > 0) items.push({ id: String(++id), type: 'longterm_warning', severity: 'warning', icon: 'Package', title: '장기재고 주의', description: `180일+ ${warnCnt}건`, count: warnCnt, link: '/inventory' });
    }

    // 9: 출고 예정
    let orderData: Order[] = [];
    if (orderResult.status === 'fulfilled') orderData = orderResult.value;
    const deliverySoon = orderData.filter((o) => {
      if (o.status !== 'received' && o.status !== 'partial') return false;
      if (!o.delivery_due || (o.remaining_qty ?? 0) <= 0) return false;
      const diff = daysUntil(o.delivery_due, today);
      if (diff == null) return false;
      return diff >= 0 && diff <= 7;
    }).length;
    if (deliverySoon > 0) items.push({ id: String(++id), type: 'delivery_soon', severity: 'info', icon: 'Truck', title: '출고 예정', description: `납기 7일 이내 미출고 ${deliverySoon}건`, count: deliverySoon, link: '/orders' });

    // 10: 현장 미등록 수주 (진행 중인 수주에 site_id가 없는 경우)
    const noSite = orderData.filter((o) =>
      (o.status === 'received' || o.status === 'partial') && !o.site_id
    ).length;
    if (noSite > 0) items.push({ id: String(++id), type: 'no_site', severity: 'warning', icon: 'MapPin', title: '현장 미등록 수주', description: `현장 미입력 진행중 수주 ${noSite}건`, count: noSite, link: '/orders' });

    // severity 순 정렬
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    setAlerts(items);
    setLoading(false);
  }, [companyId]);

  // 초기 로드 + 법인 변경 시 재조회
  // 초기/의존성 변경 시 데이터 재조회 — load 내부에서 setLoading/setData를 호출하므로 룰 비활성화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // 5분 자동 갱신
  useEffect(() => {
    if (!companyId) return;
    intervalRef.current = setInterval(load, 5 * 60 * 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [companyId, load]);

  const totalCount = alerts.length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;

  return { alerts, totalCount, criticalCount, loading, reload: load };
}
