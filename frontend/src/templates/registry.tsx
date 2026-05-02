// Phase 1 PoC: 화면 템플릿 레지스트리
// 메타데이터(config)에서 ID로 참조되는 모든 런타임 객체를 한 곳에 등록한다.
// 새 도메인이 합류할 때 여기에만 등록하면 새 화면 config가 즉시 동작한다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Badge } from '@/components/ui/badge';
import OutboundStatusBadge from '@/components/outbound/OutboundStatusBadge';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import OutboundForm from '@/components/outbound/OutboundForm';
import InboundStatusBadge from '@/components/inbound/InboundStatusBadge';
import BLDetailView from '@/components/inbound/BLDetailView';
import BLForm from '@/components/inbound/BLForm';
import { useBLList, useBLDetail } from '@/hooks/useInbound';
import { saveBLShipmentWithLines } from '@/lib/blShipment';
import { INBOUND_TYPE_LABEL, BL_STATUS_LABEL } from '@/types/inbound';
import type { BLShipment, BLLineItem, InboundType, BLStatus } from '@/types/inbound';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import PartnerForm from '@/components/masters/PartnerForm';
import MetaForm from './MetaForm';
import partnerFormConfig from '@/config/forms/partners';
import outboundSimpleFormConfig from '@/config/forms/outbound_simple';
import companyFormConfig from '@/config/forms/companies';
import bankFormConfig from '@/config/forms/banks';
import warehouseFormConfig from '@/config/forms/warehouses';
import manufacturerFormConfig from '@/config/forms/manufacturers';
import productFormConfig from '@/config/forms/products';
import constructionSiteFormConfig from '@/config/forms/construction_sites';
import poLineFormConfig from '@/config/forms/po_line';
import costFormConfig from '@/config/forms/cost';
import blLineFormConfig from '@/config/forms/bl_line';
import receiptFormConfig from '@/config/forms/receipt';
import declarationFormConfig from '@/config/forms/declaration';
import depsDemoFormConfig from '@/config/forms/deps_demo';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { useOutboundList, useSaleList, useOutboundDetail } from '@/hooks/useOutbound';
import { useDeclarationDetail } from '@/hooks/useCustoms';
import {
  OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL,
  type OutboundStatus, type UsageCategory, type Outbound, type SaleListItem,
} from '@/types/outbound';
import type { Partner, Bank, Warehouse, Manufacturer, Product, ConstructionSite } from '@/types/masters';
import type {
  CellRenderer, DataHook, DataHookResult, MetricComputer, ActionHandler,
  FormComponent, DetailComponent, RailBlock, ToolbarExtra,
  Tone, MasterOptionSource, ContentBlock, ComputedFormula, FormRefinement, FormSubmitter,
} from './types';
import { RailBlock as RailBlockUI } from '@/components/command/MockupPrimitives';

// ─── Cell renderers ─────────────────────────────────────────────────────────
export const cellRenderers: Record<string, CellRenderer> = {
  outbound_status_badge: (v) => <OutboundStatusBadge status={v as OutboundStatus} />,
  sale_base_date: (_v, row) => {
    const r = row as SaleListItem;
    return formatDate(r.outbound_date ?? r.order_date ?? '');
  },
  usage_category_label: (v) => USAGE_CATEGORY_LABEL[v as UsageCategory] ?? (v as string),
  outbound_group_trade: (_v, row) => {
    const r = row as Outbound;
    return r.group_trade ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="sf-pill info">그룹</span>
        <span className="text-[10px]" style={{ color: 'var(--sf-ink-3)' }}>{r.target_company_name}</span>
      </span>
    ) : <span>—</span>;
  },
  outbound_invoice_pill: (_v, row) => {
    const r = row as Outbound;
    if (!r.sale) return <span className="sf-pill ghost">미등록</span>;
    return r.sale.tax_invoice_date
      ? <span className="sf-pill pos">{formatDate(r.sale.tax_invoice_date)}</span>
      : <span className="sf-pill warn">미발행</span>;
  },
  sale_kind_pill: (_v, row) => {
    const r = row as SaleListItem;
    return (
      <span className={r.outbound_id ? 'sf-pill pos' : 'sf-pill info'}>
        {r.outbound_id ? '출고' : '수주'}
      </span>
    );
  },
  sale_total_amount: (_v, row) => {
    const r = row as SaleListItem;
    return r.sale.total_amount ? (
      <span className="font-semibold tabular-nums" style={{ color: 'var(--sf-ink)' }}>
        {formatNumber(r.sale.total_amount)}
      </span>
    ) : <span>—</span>;
  },
  sale_invoice_pill: (_v, row) => {
    const r = row as SaleListItem;
    return r.sale.tax_invoice_date
      ? <span className="sf-pill pos">{formatDate(r.sale.tax_invoice_date)}</span>
      : <span className="sf-pill warn">미발행</span>;
  },
  sale_erp_closed_pill: (_v, row) => {
    const r = row as SaleListItem;
    return (
      <span className={r.sale.erp_closed ? 'sf-pill pos' : 'sf-pill ghost'}>
        {r.sale.erp_closed ? '마감' : '미마감'}
      </span>
    );
  },
  partner_type_badge: (v) => {
    const t = v as string;
    const label: Record<string, string> = { supplier: '공급사', customer: '고객사', both: '공급+고객' };
    const variant: Record<string, 'default' | 'secondary' | 'outline'> = {
      supplier: 'secondary', customer: 'default', both: 'outline',
    };
    return <Badge variant={variant[t] ?? 'secondary'}>{label[t] ?? t}</Badge>;
  },
  active_badge: (v) => (
    <span className={v ? 'sf-pill pos' : 'sf-pill ghost'}>{v ? '활성' : '비활성'}</span>
  ),
  // Phase 4: 은행 행에서 법인명 표시 — Go JOIN 결과(companies.company_name) 또는 평면 컬럼
  bank_company_name: (_v, row) => {
    const r = row as Bank;
    return <span>{r.companies?.company_name ?? r.company_name ?? '—'}</span>;
  },
  // Phase 4: 품번 행에서 제조사명 표시 — Go JOIN 결과(manufacturers.name_kr) 또는 평면 컬럼
  product_manufacturer_name: (_v, row) => {
    const r = row as Product;
    return <span>{r.manufacturers?.short_name ?? r.manufacturers?.name_kr ?? r.manufacturer_name ?? '—'}</span>;
  },
  // Phase 4: 현장 유형 (own/epc → 자체/EPC)
  site_type_badge: (v) => {
    const t = v as string;
    return t === 'own'
      ? <Badge variant="outline" className="border-purple-400 text-purple-700 text-[10px]">자체</Badge>
      : <Badge variant="outline" className="border-orange-400 text-orange-700 text-[10px]">EPC</Badge>;
  },
  // Phase 4: 창고 유형 라벨 (port/factory/vendor → 항구/공장/업체)
  warehouse_type_badge: (v) => {
    const t = v as string;
    const label: Record<string, string> = { port: '항구', factory: '공장', vendor: '업체' };
    const variant: Record<string, 'default' | 'secondary' | 'outline'> = {
      port: 'default', factory: 'secondary', vendor: 'outline',
    };
    return <Badge variant={variant[t] ?? 'secondary'}>{label[t] ?? t}</Badge>;
  },
  // Inbound (Step 1): 입고 구분 / 상태
  inbound_type_pill: (v) => (
    <span className="sf-pill ghost">{INBOUND_TYPE_LABEL[v as InboundType] ?? (v as string)}</span>
  ),
  inbound_status_badge: (v) => <InboundStatusBadge status={v as BLStatus} />,
  // Inbound: aggregated 컬럼 (useBLListWithAgg 가 row 에 합쳐주는 _agg 필드 사용)
  bl_first_product: (_v, row) => {
    const r = row as BLShipment & { _agg?: { firstName?: string; firstCode?: string; extraCount?: number } };
    if (!r._agg?.firstName) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="text-[11px]">
        <div className="truncate max-w-[200px]">{r._agg.firstName}</div>
        <div className="text-[10px] text-muted-foreground font-mono">
          {r._agg.firstCode ?? '—'}{r._agg.extraCount ? ` 외 ${r._agg.extraCount}건` : ''}
        </div>
      </div>
    );
  },
  bl_total_mw: (_v, row) => {
    const r = row as BLShipment & { _agg?: { totalMw?: number } };
    const mw = r._agg?.totalMw ?? 0;
    return mw > 0 ? <span className="tabular-nums font-mono">{mw.toFixed(2)}</span> : <span>—</span>;
  },
  bl_avg_cents: (_v, row) => {
    const r = row as BLShipment & { _agg?: { avgCentsPerWp?: number } };
    const c = r._agg?.avgCentsPerWp ?? 0;
    return c > 0 ? <span className="tabular-nums font-mono">{c.toFixed(2)}</span> : <span>—</span>;
  },
  // 법인명 lookup (companies store 에서)
  bl_company_name: (_v, row) => {
    const r = row as BLShipment;
    const companies = useAppStore.getState().companies;
    const name = companies.find((c) => c.company_id === r.company_id)?.company_name;
    return <span>{name ?? '—'}</span>;
  },
  // Inbound Step 2: detail PO/LC 링크 + 통화 라벨
  bl_po_link: (_v, row) => {
    const r = row as BLShipment;
    if (!r.po_id) return <span>—</span>;
    return (
      <button className="text-sm text-primary underline" onClick={() => { window.location.href = `/procurement?po=${r.po_id}`; }}>
        {r.po_number ?? r.po_id.slice(0, 8)}
      </button>
    );
  },
  bl_lc_link: (_v, row) => {
    const r = row as BLShipment;
    if (!r.lc_id) return <span>—</span>;
    return (
      <button className="text-sm text-primary underline" onClick={() => { window.location.href = `/lc?lc=${r.lc_id}`; }}>
        {r.lc_number ?? r.lc_id.slice(0, 8)}
      </button>
    );
  },
  bl_currency_label: (v) => <span>{v === 'USD' ? 'USD (달러)' : 'KRW (원)'}</span>,
};

// 단순 리스트 fetch hook (서버 필터 없음 — 클라이언트 검색만)
function useSimpleList<T>(endpoint: string): { data: T[]; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchWithAuth<T[]>(endpoint)
      .then((list) => { if (!cancelled) setData(list); })
      .catch(() => { /* empty */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, tick]);

  return { data, loading, reload: () => setTick((n) => n + 1) };
}

// ─── Data hooks (어댑터: Record<string,string> → 타입드 hook) ──────────────
export const dataHooks: Record<string, DataHook> = {
  useOutboundList: (f) => useOutboundList({
    status: f.status || undefined,
    usage_category: f.usage_category || undefined,
    manufacturer_id: f.manufacturer_id || undefined,
  }) as unknown as DataHookResult,
  useSaleList: (f) => useSaleList({
    customer_id: f.customer_id || undefined,
    month: f.month || undefined,
    invoice_status: f.invoice_status || undefined,
  }) as unknown as DataHookResult,
  usePartnerList: () => useSimpleList<Partner>('/api/v1/partners') as unknown as DataHookResult,
  useCompanyList: () => useSimpleList<Record<string, unknown>>('/api/v1/companies') as unknown as DataHookResult,
  useBankList: () => useSimpleList<Bank>('/api/v1/banks') as unknown as DataHookResult,
  useWarehouseList: () => useSimpleList<Warehouse>('/api/v1/warehouses') as unknown as DataHookResult,
  useManufacturerList: () => useSimpleList<Manufacturer>('/api/v1/manufacturers') as unknown as DataHookResult,
  useProductList: () => useSimpleList<Product>('/api/v1/products') as unknown as DataHookResult,
  // Phase 4: 발전소 — selectedCompanyId 로 서버 필터 (requiresCompany=true)
  useConstructionSiteList: () => {
    const companyId = useAppStore((s) => s.selectedCompanyId);
    const url = companyId && companyId !== 'all'
      ? `/api/v1/construction-sites?company_id=${companyId}`
      : '/api/v1/construction-sites';
    return useSimpleList<ConstructionSite>(url) as unknown as DataHookResult;
  },
  // Inbound (Step 1): BL list + 라인 합계 (totalMw / avgCentsPerWp / 첫 라인) 클라이언트 합산
  // N+1 issue — BL 많으면 느려짐. follow-up 으로 server-side aggregation 검토.
  useBLListWithAgg: (f) => {
    const baseHook = useBLList({
      inbound_type: f.inbound_type || undefined,
      status: f.status || undefined,
      manufacturer_id: f.manufacturer_id || undefined,
    });
    const [aggMap, setAggMap] = useState<Record<string, { firstName?: string; firstCode?: string; extraCount: number; avgCentsPerWp: number; totalMw: number }>>({});
    useEffect(() => {
      const items = baseHook.data;
      if (!items || items.length === 0) { setAggMap({}); return; }
      let cancelled = false;
      (async () => {
        const result: typeof aggMap = {};
        await Promise.all(items.map(async (bl) => {
          try {
            const lines = await fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`).catch(() => [] as BLLineItem[]);
            const totalInvoice = (lines ?? []).reduce((s, l) => s + (l.invoice_amount_usd ?? 0), 0);
            const totalWp = (lines ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0) * 1000, 0);
            const first = (lines ?? [])[0];
            result[bl.bl_id] = {
              firstName: first?.product_name ?? first?.products?.product_name,
              firstCode: first?.product_code ?? first?.products?.product_code,
              extraCount: Math.max(0, (lines?.length ?? 0) - 1),
              avgCentsPerWp: totalWp > 0 ? (totalInvoice / totalWp) * 100 : 0,
              totalMw: (lines ?? []).reduce((s, l) => s + (l.capacity_kw ?? 0), 0) / 1000,
            };
          } catch { /* skip */ }
        }));
        if (!cancelled) setAggMap(result);
      })();
      return () => { cancelled = true; };
    }, [baseHook.data]);
    // ETD 기간 필터: f.month (YYYY-MM) 가 있으면 client-side 추가 필터링
    // useMemo 로 reference 안정화 — 매 render 새 배열 만들면 ListScreen 무한 루프
    const monthFilter = f.month;
    const enriched = useMemo(() => {
      const items = monthFilter
        ? baseHook.data.filter((bl) => bl.etd?.startsWith(monthFilter))
        : baseHook.data;
      return items.map((bl) => ({ ...bl, _agg: aggMap[bl.bl_id] }));
    }, [baseHook.data, aggMap, monthFilter]);
    return { data: enriched, loading: baseHook.loading, reload: baseHook.reload } as unknown as DataHookResult;
  },
};

// ─── Detail data hooks (단건 fetch by id) ─────────────────────────────────
export type DetailDataHook = (id: string) => { data: unknown; loading: boolean };
export const detailDataHooks: Record<string, DetailDataHook> = {
  useOutboundDetail: (id) => useOutboundDetail(id) as unknown as { data: unknown; loading: boolean },
  useDeclarationDetail: (id) => useDeclarationDetail(id) as unknown as { data: unknown; loading: boolean },
  // Inbound Step 2
  useBLShipmentDetail: (id) => useBLDetail(id) as unknown as { data: unknown; loading: boolean },
};

// ─── Metric computers ──────────────────────────────────────────────────────
export const metricComputers: Record<string, MetricComputer> = {
  count: (items) => items.length.toLocaleString(),
  'count.outbound_active': (items) =>
    (items as Outbound[]).filter((i) => i.status === 'active').length.toLocaleString(),
  'count.outbound_cancel_pending': (items) =>
    (items as Outbound[]).filter((i) => i.status === 'cancel_pending').length.toLocaleString(),
  'sum.supply_amount_billion': (items) => {
    const sum = (items as SaleListItem[]).reduce(
      (s, i) => s + (i.supply_amount ?? i.sale?.supply_amount ?? 0), 0,
    );
    return (sum / 100_000_000).toFixed(2);
  },
  'count.sale_invoice_pending': (items) =>
    (items as SaleListItem[]).filter((i) => !(i.tax_invoice_date ?? i.sale?.tax_invoice_date)).length.toLocaleString(),
  'count.partner_active': (items) =>
    (items as Partner[]).filter((p) => p.is_active).length.toLocaleString(),
  'count.partner_customer': (items) =>
    (items as Partner[]).filter((p) => p.partner_type === 'customer' || p.partner_type === 'both').length.toLocaleString(),
  'count.partner_supplier': (items) =>
    (items as Partner[]).filter((p) => p.partner_type === 'supplier' || p.partner_type === 'both').length.toLocaleString(),
  // Phase 4: 은행 마스터 — 활성 은행 수 + LC 한도 총합(백만USD)
  'count.bank_active': (items) =>
    (items as Bank[]).filter((b) => b.is_active).length.toLocaleString(),
  'sum.bank_lc_limit_million': (items) => {
    const sum = (items as Bank[])
      .filter((b) => b.is_active)
      .reduce((s, b) => s + (b.lc_limit_usd ?? 0), 0);
    return (sum / 1_000_000).toFixed(1);
  },
  // Phase 4: 창고
  'count.warehouse_active': (items) =>
    (items as Warehouse[]).filter((w) => w.is_active).length.toLocaleString(),
  // Phase 4: 제조사
  'count.manufacturer_active': (items) =>
    (items as Manufacturer[]).filter((m) => m.is_active).length.toLocaleString(),
  // domestic_foreign 값이 영문(domestic/foreign) 또는 한글(국내/해외)로 들어오는 케이스를 모두 처리
  'count.manufacturer_domestic': (items) =>
    (items as Manufacturer[]).filter((m) => m.domestic_foreign === '국내' || m.domestic_foreign === 'domestic').length.toLocaleString(),
  'count.manufacturer_foreign': (items) =>
    (items as Manufacturer[]).filter((m) => m.domestic_foreign === '해외' || m.domestic_foreign === 'foreign').length.toLocaleString(),
  // Phase 4: 품번
  'count.product_active': (items) =>
    (items as Product[]).filter((p) => p.is_active).length.toLocaleString(),
  // Inbound (Step 1)
  'count.bl_import': (items) =>
    (items as BLShipment[]).filter((b) => b.inbound_type === 'import').length.toLocaleString(),
  'count.bl_completed': (items) =>
    (items as BLShipment[]).filter((b) => b.status === 'completed').length.toLocaleString(),
  'count.bl_pending': (items) =>
    (items as BLShipment[]).filter((b) => b.status !== 'completed').length.toLocaleString(),
  // Phase 4: 발전소
  'count.site_active': (items) =>
    (items as ConstructionSite[]).filter((s) => s.is_active).length.toLocaleString(),
  'count.site_own': (items) =>
    (items as ConstructionSite[]).filter((s) => s.site_type === 'own').length.toLocaleString(),
  'count.site_epc': (items) =>
    (items as ConstructionSite[]).filter((s) => s.site_type === 'epc').length.toLocaleString(),
  'sum.site_capacity_mw': (items) => {
    const sum = (items as ConstructionSite[]).reduce((s, it) => s + (it.capacity_mw ?? 0), 0);
    return sum.toFixed(2);
  },
};

// ─── Sub computers (메트릭 sub 텍스트 동적 생성) ───────────────────────────
export const subComputers: Record<string, MetricComputer> = {
  'sub.sale_invoice_pending': (items) => {
    const n = (items as SaleListItem[]).filter(
      (i) => !(i.tax_invoice_date ?? i.sale?.tax_invoice_date),
    ).length;
    return `${n}건 계산서 대기`;
  },
};

// ─── Tone computers (동적 톤 결정) ────────────────────────────────────────
export const toneComputers: Record<string, (items: unknown[]) => Tone> = {
  'tone.cancel_pending': (items) =>
    (items as Outbound[]).filter((i) => i.status === 'cancel_pending').length > 0 ? 'warn' : 'info',
  'tone.invoice_pending': (items) =>
    (items as SaleListItem[]).filter((i) => !(i.tax_invoice_date ?? i.sale?.tax_invoice_date)).length > 0 ? 'warn' : 'ink',
};

// ─── Spark computers (sparkline 시드 데이터) ───────────────────────────────
export const sparkComputers: Record<string, (items: unknown[]) => number[]> = {
  'spark.outbound_count': (items) => [14, 18, 16, 23, items.length || 1],
};

// ─── Action handlers ───────────────────────────────────────────────────────
// 전역 actionHandlers 레지스트리 — 페이지에서 useActionHandler hook 으로 등록/해제.
// 이전에는 CustomEvent dispatch 로 페이지 콜백 호출했으나 디버깅 어렵고 leak 가능 →
// 페이지가 hook 으로 자기 콜백 등록하면 직접 호출됨.
export const actionHandlers: Record<string, ActionHandler> = {};

// 페이지 내 컴포넌트가 actionHandler 를 등록 (마운트 동안만 활성).
// 의존성 deps 같은 게 필요 없도록 ref 로 최신 closure 추적.
export function useActionHandler(id: string, handler: ActionHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    const wrapped: ActionHandler = (row) => handlerRef.current(row);
    actionHandlers[id] = wrapped;
    return () => {
      // 같은 id 로 등록된 게 우리 wrapper 인 경우만 해제
      if (actionHandlers[id] === wrapped) delete actionHandlers[id];
    };
  }, [id]);
}

// ─── Forms / Detail components ─────────────────────────────────────────────
// 메타 폼 래퍼 — config를 클로저로 받아 FormComponent 시그니처에 맞춤
const PartnerFormV2: FormComponent = (props) => (
  <MetaForm
    config={partnerFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// PoC: 출고 폼 메타 한계선 데모 — 단순 필드 7개만. 실제 출고 등록에 충분치 않음
// (수량·창고·품번 등은 코드 OutboundForm에 남김). 메타화 가능 영역 입증용
const OutboundFormSimple: FormComponent = (props) => (
  <MetaForm
    config={outboundSimpleFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// 법인 메타 폼 (Phase 4 신규 도메인 적용)
const CompanyFormV2: FormComponent = (props) => (
  <MetaForm
    config={companyFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// 은행 메타 폼 (Phase 4)
const BankFormV2: FormComponent = (props) => (
  <MetaForm
    config={bankFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// 창고 메타 폼 (Phase 4)
const WarehouseFormV2: FormComponent = (props) => (
  <MetaForm
    config={warehouseFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// 제조사 메타 폼 (Phase 4)
const ManufacturerFormV2: FormComponent = (props) => (
  <MetaForm
    config={manufacturerFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// 품번 메타 폼 (Phase 4 — 13 필드, masterKey=manufacturers, 메타 인프라 최대 복잡도)
const ProductFormV2: FormComponent = (props) => (
  <MetaForm
    config={productFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// Phase 4: 발전소 메타 폼 (마지막 마스터 도메인)
const ConstructionSiteFormV2: FormComponent = (props) => (
  <MetaForm
    config={constructionSiteFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// Phase 4 보강: PO 라인 메타 폼 (child 라인 폼 첫 변환)
const POLineFormV2: FormComponent = (props) => (
  <MetaForm
    config={poLineFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
    extraContext={(props as { extraContext?: Record<string, unknown> }).extraContext}
  />
);

// Phase 4 보강: 면장 원가 메타 폼 (CostForm 변환 — 17 필드, 4 computed, 3 stage)
const CostFormV2: FormComponent = (props) => (
  <MetaForm
    config={costFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
    extraContext={(props as { extraContext?: Record<string, unknown> }).extraContext}
  />
);

// Phase 4 보강: BL 라인 메타 폼 (BLLineForm 변환)
const BLLineFormV2: FormComponent = (props) => (
  <MetaForm
    config={blLineFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
    extraContext={(props as { extraContext?: Record<string, unknown> }).extraContext}
  />
);

// Phase 4 보강: 수금 메타 폼 (ReceiptForm 변환)
const ReceiptFormV2: FormComponent = (props) => (
  <MetaForm
    config={receiptFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// Phase 4 보강: 면장 메타 폼 (DeclarationForm 변환)
const DeclarationFormV2: FormComponent = (props) => (
  <MetaForm
    config={declarationFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// Phase 4 보강: 의존성·동적 옵션 시연 폼 (UI 데모 전용 — 저장 안 함)
const DepsDemoForm: FormComponent = (props) => (
  <MetaForm
    config={depsDemoFormConfig}
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData}
  />
);

// Inbound (Step 2 follow-up): BLForm 등록 — submitterId='bl_save' 와 함께 사용
const BLFormWrapper: FormComponent = (props) => (
  <BLForm
    open={props.open}
    onOpenChange={props.onOpenChange}
    onSubmit={props.onSubmit}
    editData={props.editData as BLShipment | null}
  />
);

export const formComponents: Record<string, FormComponent> = {
  outbound_form: OutboundForm as unknown as FormComponent,
  outbound_form_simple: OutboundFormSimple,    // 메타 한계선 데모용
  partner_form: PartnerForm as unknown as FormComponent,
  partner_form_v2: PartnerFormV2,
  company_form_v2: CompanyFormV2,              // Phase 4: 법인 마스터 메타 폼
  bank_form_v2: BankFormV2,                    // Phase 4: 은행 마스터 메타 폼
  warehouse_form_v2: WarehouseFormV2,          // Phase 4: 창고 마스터 메타 폼
  manufacturer_form_v2: ManufacturerFormV2,    // Phase 4: 제조사 마스터 메타 폼
  product_form_v2: ProductFormV2,              // Phase 4: 품번 마스터 메타 폼 (13 필드)
  construction_site_form_v2: ConstructionSiteFormV2, // Phase 4: 발전소 메타 폼 (마지막 마스터)
  po_line_form_v2: POLineFormV2,               // Phase 4 보강: PO 라인 (child 라인 폼 첫 변환)
  cost_form_v2: CostFormV2,                    // Phase 4 보강: 면장 원가 (가장 복잡한 child 라인 폼)
  bl_line_form_v2: BLLineFormV2,               // Phase 4 보강: BL 라인 아이템
  receipt_form_v2: ReceiptFormV2,              // Phase 4 보강: 수금
  declaration_form_v2: DeclarationFormV2,      // Phase 4 보강: 면장
  deps_demo: DepsDemoForm,                     // Phase 4 보강: 의존성·동적 옵션 데모
  bl_form: BLFormWrapper,                       // Phase 4 — Inbound: B/L 입고 (submitterId='bl_save')
};

// Phase 4 보강: 폼 저장 함수 — endpoint POST/PUT 으로 표현 안 되는 multi-step 저장
export const formSubmitters: Record<string, FormSubmitter> = {
  // BL: parent (BLShipment) + child (lines) 묶음 저장
  bl_save: async (data) => {
    await saveBLShipmentWithLines(data);
  },
};

export const detailComponents: Record<string, DetailComponent> = {
  outbound: ((props) => <OutboundDetailView outboundId={props.id} onBack={props.onBack} />) as DetailComponent,
  // Inbound (Step 1): BLDetailView 래퍼 — props {blId, onBack} → DetailComponent {id, onBack}
  bl: ((props) => <BLDetailView blId={props.id} onBack={props.onBack} />) as DetailComponent,
};

// ─── Rail blocks ───────────────────────────────────────────────────────────
export const railBlocks: Record<string, RailBlock> = {
  recent_items: ({ items, config }) => {
    const c = config as {
      title: string; accent?: string; limit?: number;
      primaryFields: string[];               // fallback chain
      idField: string;                        // 키
      metaRender?: 'outbound';
    };
    const list = items.slice(0, c.limit ?? 4);
    return (
      <RailBlockUI title={c.title} accent={c.accent ?? 'var(--solar-3)'} count={list.length}>
        <div className="space-y-2">
          {list.map((row, idx) => {
            const r = row as Record<string, unknown>;
            const primary = c.primaryFields
              .map((f) => r[f])
              .find((v) => v != null && v !== '') as string | undefined
              ?? String(r[c.idField] ?? '').slice(0, 8);
            const ob = row as Outbound;
            return (
              <div key={(r[c.idField] as string) ?? idx} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{primary}</div>
                {c.metaRender === 'outbound' ? (
                  <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">
                    {OUTBOUND_STATUS_LABEL[ob.status] ?? ob.status} · {ob.quantity?.toLocaleString?.() ?? 0}장
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </RailBlockUI>
    );
  },
  partner_type_breakdown: ({ items, config }) => {
    const c = config as { title: string };
    const list = items as Partner[];
    const customer = list.filter((p) => p.partner_type === 'customer' || p.partner_type === 'both').length;
    const supplier = list.filter((p) => p.partner_type === 'supplier' || p.partner_type === 'both').length;
    const both = list.filter((p) => p.partner_type === 'both').length;
    return (
      <RailBlockUI title={c.title} accent="var(--solar-3)" count={`${customer + supplier}`}>
        <div className="space-y-2 text-[12px]">
          <div className="flex justify-between"><span className="text-[var(--ink-3)]">고객사</span><span className="mono font-semibold">{customer}</span></div>
          <div className="flex justify-between"><span className="text-[var(--ink-3)]">공급사</span><span className="mono font-semibold">{supplier}</span></div>
          <div className="flex justify-between"><span className="text-[var(--ink-3)]">양방향</span><span className="mono font-semibold">{both}</span></div>
        </div>
      </RailBlockUI>
    );
  },
  partner_recent: ({ items, config }) => {
    const c = config as { title: string; limit?: number };
    const labels: Record<string, string> = { supplier: '공급사', customer: '고객사', both: '공급+고객' };
    const list = (items as Partner[]).slice(0, c.limit ?? 4);
    return (
      <RailBlockUI title={c.title} count={list.length}>
        <div className="space-y-2">
          {list.map((p) => (
            <div key={p.partner_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
              <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{p.partner_name}</div>
              <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">
                {labels[p.partner_type] ?? p.partner_type} · {p.erp_code ?? 'ERP 미지정'}
              </div>
            </div>
          ))}
        </div>
      </RailBlockUI>
    );
  },
  static_text: ({ filters, config }) => {
    const c = config as { title: string; countFromFilter?: string; text: string };
    const count = c.countFromFilter ? filters[c.countFromFilter] || '전체' : undefined;
    return (
      <RailBlockUI title={c.title} count={count}>
        <div className="text-[11px] leading-5 text-[var(--ink-3)]">{c.text}</div>
      </RailBlockUI>
    );
  },
};

// ─── Toolbar extras ────────────────────────────────────────────────────────
export const toolbarExtras: Record<string, ToolbarExtra> = {
  excel_toolbar: ({ config, openForm }) => {
    const c = config as { type: 'outbound' | 'sale' | 'inbound'; createFormId?: string };
    return (
      <ExcelToolbar
        type={c.type}
        onNew={c.createFormId ? () => openForm(c.createFormId!) : undefined}
      />
    );
  },
};

// ─── Content blocks (탭 콘텐츠 위에 끼워넣는 블록) ─────────────────────────
export const contentBlocks: Record<string, ContentBlock> = {
  sale_summary_cards: ({ items }) => <SaleSummaryCards items={items as never} />,
  // Inbound Step 2: 기본 정보 섹션 헤더의 status badge
  bl_status_badge: ({ items }) => {
    const r = items[0] as BLShipment;
    return <InboundStatusBadge status={r.status} />;
  },
  // Inbound Step 2: 기본 정보 섹션 헤더의 수정 버튼 — actionHandlers['bl_detail_edit'] 호출
  bl_edit_button: () => (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded border border-input bg-background px-2.5 py-1 text-xs hover:bg-muted"
      onClick={() => actionHandlers.bl_detail_edit?.()}
    >
      ✏️ 수정
    </button>
  ),
  // Inbound Step 2: 메모 섹션 본문
  bl_memo_block: ({ items }) => {
    const r = items[0] as BLShipment;
    if (!r.memo) return null;
    return <p className="whitespace-pre-wrap text-sm text-foreground">{r.memo}</p>;
  },
  // Phase 2.5: 출고 상세의 B/L 연결 다중 행 (MetaDetail의 contentBlock 슬롯용)
  outbound_bl_items_section: ({ items }) => {
    const ob = items[0] as Outbound;
    if (!ob.bl_items?.length) return null;
    return (
      <div className="space-y-1.5">
        {ob.bl_items.map((item) => (
          <div
            key={item.outbound_bl_item_id}
            className="flex items-center gap-3 rounded border bg-blue-50 px-3 py-2 text-xs text-blue-800"
          >
            <span className="font-mono font-medium">{item.bl_number ?? item.bl_id.slice(0, 8)}</span>
            <span className="text-blue-500">·</span>
            <span>{item.quantity.toLocaleString('ko-KR')} EA</span>
          </div>
        ))}
      </div>
    );
  },
  // Phase 2.5: 출고 상세의 메모 (pre-wrap 텍스트)
  outbound_memo_section: ({ items }) => {
    const ob = items[0] as Outbound;
    if (!ob.memo) return null;
    return <p className="text-sm whitespace-pre-wrap break-words">{ob.memo}</p>;
  },
};

// Phase 4 — 제품 라이트 캐시: products.search 가 호출될 때마다 갱신.
// computed formula 등 동기 lookup 이 필요한 곳에서 사용.
const productCacheById = new Map<string, Product>();

// ─── Master option sources ─────────────────────────────────────────────────
export const masterSources: Record<string, MasterOptionSource> = {
  manufacturers: {
    load: async () => {
      await useAppStore.getState().loadManufacturers();
      return useAppStore.getState().manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr }));
    },
  },
  // Phase 4 보강: 동적 옵션 시연 — context.domestic_filter 또는 .domestic_foreign 으로 필터
  // (값이 '전체'/비어있으면 전체 반환). 영문(domestic/foreign) / 한글(국내/해외) 데이터 혼재 처리.
  'manufacturers.byDomestic': {
    load: async (ctx) => {
      await useAppStore.getState().loadManufacturers();
      const want = (ctx?.domestic_filter ?? ctx?.domestic_foreign) as string | undefined;
      const list = useAppStore.getState().manufacturers;
      const filtered = (!want || want === '전체')
        ? list
        : list.filter((m) => {
          if (want === '국내' || want === 'domestic') return m.domestic_foreign === '국내' || m.domestic_foreign === 'domestic';
          if (want === '해외' || want === 'foreign') return m.domestic_foreign === '해외' || m.domestic_foreign === 'foreign';
          return true;
        });
      return filtered.map((m) => ({ value: m.manufacturer_id, label: m.name_kr }));
    },
  },
  companies: {
    load: async () => {
      await useAppStore.getState().loadCompanies();
      return useAppStore.getState().companies.map((c) => ({ value: c.company_id, label: c.company_name }));
    },
  },
  // Phase 4 보강: 서버 측 검색 시연 — 대용량 옵션 처리 패턴
  // search 가 정의돼 있어 MetaForm 이 combobox 모드로 전환됨.
  // 실제 운영에서는 백엔드 query 파라미터로 검색 (예: /api/v1/products?search=jko)
  // 현재 mock 은 전체 반환 → 클라이언트에서 필터 (대용량 데이터셋 시뮬레이션).
  // Phase 4 보강 — 부수효과로 productCacheById 채움 (computed formula 가 spec_wp 등 조회)
  'products.search': {
    load: async () => {
      const list = await fetchWithAuth<Product[]>('/api/v1/products');
      list.forEach((p) => productCacheById.set(p.product_id, p));
      return list
        .filter((p) => p.is_active)
        .slice(0, 20)
        .map((p) => ({ value: p.product_id, label: `${p.product_code} · ${p.product_name}` }));
    },
    search: async (query) => {
      // 운영 백엔드 예시: `/api/v1/products?search=${encodeURIComponent(query)}&limit=20`
      const list = await fetchWithAuth<Product[]>('/api/v1/products');
      list.forEach((p) => productCacheById.set(p.product_id, p));
      const lower = query.trim().toLowerCase();
      return list
        .filter((p) => p.is_active)
        .filter((p) => !lower
          || p.product_name.toLowerCase().includes(lower)
          || p.product_code.toLowerCase().includes(lower)
          || (p.manufacturers?.short_name ?? '').toLowerCase().includes(lower))
        .slice(0, 20)
        .map((p) => ({ value: p.product_id, label: `${p.product_code} · ${p.product_name}` }));
    },
    resolveLabel: async (value) => {
      // 운영: `/api/v1/products/${value}` 단일 조회. mock 은 list 에서 검색.
      const list = await fetchWithAuth<Product[]>('/api/v1/products');
      list.forEach((p) => productCacheById.set(p.product_id, p));
      const found = list.find((p) => p.product_id === value);
      return found ? `${found.product_code} · ${found.product_name}` : null;
    },
  },
  'partners.customer': {
    load: async () => {
      const list = await fetchWithAuth<Partner[]>('/api/v1/partners');
      return list
        .filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))
        .map((p) => ({ value: p.partner_id, label: p.partner_name }));
    },
  },
  // Phase 4 보강: BL 마스터 (DeclarationForm 메타화용) — selectedCompanyId 로 필터
  'bls.byCompany': {
    load: async () => {
      const companyId = useAppStore.getState().selectedCompanyId;
      const url = companyId && companyId !== 'all'
        ? `/api/v1/bls?company_id=${companyId}`
        : '/api/v1/bls';
      const list = await fetchWithAuth<BLShipment[]>(url);
      return list.map((b) => ({
        value: b.bl_id,
        label: b.bl_number + (b.manufacturer_name ? ` · ${b.manufacturer_name}` : ''),
      }));
    },
  },
};

// ─── Enum dictionaries ─────────────────────────────────────────────────────
export const enumDictionaries: Record<string, Record<string, string>> = {
  OUTBOUND_STATUS_LABEL,
  USAGE_CATEGORY_LABEL: USAGE_CATEGORY_LABEL as Record<string, string>,
  INVOICE_STATUS_LABEL: { issued: '발행', pending: '미발행' },
  // Inbound (Step 1)
  INBOUND_TYPE_LABEL: INBOUND_TYPE_LABEL as Record<string, string>,
  BL_STATUS_LABEL: BL_STATUS_LABEL as Record<string, string>,
};

// ─── Phase 4 보강: Computed formulas (계산 필드용) ─────────────────────────
// FieldConfig.formula.computerId 가 이 키를 참조. 동기 함수만 (입력 시점마다 호출).
// values: 현재 폼의 모든 필드 값 (computed 자기 자신 포함)
// context: MetaForm extraContext (페이지가 주입한 외부 값)
export const computedFormulas: Record<string, ComputedFormula> = {
  // 곱하기 — quantity * unit_price 같은 단순 계산
  'multiply_qty_price': (values) => {
    const q = Number(values.quantity);
    const p = Number(values.unit_price);
    if (!Number.isFinite(q) || !Number.isFinite(p)) return undefined;
    return Math.round(q * p * 100) / 100;
  },
  // 미터 합 — module_width_mm + module_height_mm (데모용)
  'sum_module_dims': (values) => {
    const w = Number(values.module_width_mm);
    const h = Number(values.module_height_mm);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return undefined;
    return w + h;
  },
  // PO 라인 총액 — quantity * spec_wp (제품 캐시 lookup) * unit_price_usd (USD/Wp)
  // products.search 가 mount 시점에 캐시 채워둔 상태여야 함 (combobox 자동 호출).
  'po_line_total_amount_usd': (values) => {
    const q = Number(values.quantity);
    const u = Number(values.unit_price_usd);
    const productId = String(values.product_id ?? '');
    if (!Number.isFinite(q) || !Number.isFinite(u) || !productId) return undefined;
    const product = productCacheById.get(productId);
    if (!product) return undefined;
    return Math.round(q * product.spec_wp * u * 100) / 100;
  },
  // 면장 원가 — 용량 kW (= 수량 * spec_wp / 1000)
  'cost_capacity_kw': (values) => {
    const q = Number(values.quantity);
    const productId = String(values.product_id ?? '');
    if (!Number.isFinite(q) || !productId) return undefined;
    const product = productCacheById.get(productId);
    if (!product) return undefined;
    return Math.round(q * product.spec_wp / 10) / 100; // 소수점 2자리 (kW)
  },
  // 면장 원가 — CIF Wp 단가 (KRW / Wp) = cif_total_krw / (수량 * spec_wp)
  'cost_cif_wp_krw': (values) => {
    const q = Number(values.quantity);
    const cif = Number(values.cif_total_krw);
    const productId = String(values.product_id ?? '');
    if (!Number.isFinite(q) || !Number.isFinite(cif) || q <= 0 || !productId) return undefined;
    const product = productCacheById.get(productId);
    if (!product || product.spec_wp <= 0) return undefined;
    return Math.round((cif / (q * product.spec_wp)) * 100) / 100;
  },
  // 면장 원가 — Landed 합계 KRW = cif_total + tariff + customs_fee + incidental
  'cost_landed_total_krw': (values) => {
    const cif = Number(values.cif_total_krw) || 0;
    const tariff = Number(values.tariff_amount) || 0;
    const customs = Number(values.customs_fee) || 0;
    const incidental = Number(values.incidental_cost) || 0;
    const total = cif + tariff + customs + incidental;
    return total > 0 ? total : undefined;
  },
  // 면장 원가 — Landed Wp 단가 (KRW / Wp) = landed_total / (수량 * spec_wp)
  'cost_landed_wp_krw': (values) => {
    const q = Number(values.quantity);
    const productId = String(values.product_id ?? '');
    if (!Number.isFinite(q) || q <= 0 || !productId) return undefined;
    const product = productCacheById.get(productId);
    if (!product || product.spec_wp <= 0) return undefined;
    const landed = (Number(values.cif_total_krw) || 0)
      + (Number(values.tariff_amount) || 0)
      + (Number(values.customs_fee) || 0)
      + (Number(values.incidental_cost) || 0);
    if (landed <= 0) return undefined;
    return Math.round((landed / (q * product.spec_wp)) * 100) / 100;
  },
};

// ─── Phase 4 보강 Tier 3: Form refinements (cross-field 검증) ─────────────
// MetaFormConfig.refine 의 ruleId 가 이 키를 참조. 통과=true, 실패=false.
export const formRefinements: Record<string, FormRefinement> = {
  // 데모: quantity * unit_price <= 1억 (대규모 거래 차단 정책 시뮬레이션)
  'limit_total_under_100m': (values) => {
    const q = Number(values.quantity);
    const p = Number(values.unit_price);
    if (!Number.isFinite(q) || !Number.isFinite(p)) return true; // 미입력은 OK
    return q * p <= 100_000_000;
  },
  // 데모: warranty_months 가 12 의 배수여야 (1년 단위 정책)
  'warranty_year_aligned': (values) => {
    if (values.has_warranty !== true) return true;
    const m = Number(values.warranty_months);
    if (!Number.isFinite(m)) return true;
    return m % 12 === 0;
  },
};

// ─── Formatters ────────────────────────────────────────────────────────────
export function applyFormatter(formatter: string | undefined, value: unknown): string {
  if (value == null || value === '') return '';
  switch (formatter) {
    case 'date': return formatDate(value as string);
    case 'number': return formatNumber(value as number);
    case 'kw': return formatKw(value as number);
    case 'currency': return formatNumber(value as number);
    default: return String(value);
  }
}

// ─── 점 표기 필드 접근 ──────────────────────────────────────────────────────
export function getFieldValue(row: Record<string, unknown>, key: string): unknown {
  if (!key.includes('.')) return row[key];
  return key.split('.').reduce<unknown>((acc, k) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[k];
  }, row);
}

// ─── 최근 12개월 옵션 생성 ──────────────────────────────────────────────────
export function generateMonths(monthsBack: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value: key, label: key });
  }
  return out;
}

// SaleSummaryCards를 매출 탭 콘텐츠 위에 그리기 위한 보조 export (PoC 한정)
export { SaleSummaryCards };
