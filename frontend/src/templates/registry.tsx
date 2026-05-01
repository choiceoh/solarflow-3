// Phase 1 PoC: 화면 템플릿 레지스트리
// 메타데이터(config)에서 ID로 참조되는 모든 런타임 객체를 한 곳에 등록한다.
// 새 도메인이 합류할 때 여기에만 등록하면 새 화면 config가 즉시 동작한다.

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/api';
import { formatDate, formatNumber, formatKw } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Badge } from '@/components/ui/badge';
import OutboundStatusBadge from '@/components/outbound/OutboundStatusBadge';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import OutboundForm from '@/components/outbound/OutboundForm';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import PartnerForm from '@/components/masters/PartnerForm';
import MetaForm from './MetaForm';
import partnerFormConfig from '@/config/forms/partners';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { useOutboundList, useSaleList } from '@/hooks/useOutbound';
import {
  OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL,
  type OutboundStatus, type UsageCategory, type Outbound, type SaleListItem,
} from '@/types/outbound';
import type { Partner } from '@/types/masters';
import type {
  CellRenderer, DataHook, DataHookResult, MetricComputer, ActionHandler,
  FormComponent, DetailComponent, RailBlock, ToolbarExtra,
  Tone, MasterOptionSource, ContentBlock,
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
export const actionHandlers: Record<string, ActionHandler> = {};

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

export const formComponents: Record<string, FormComponent> = {
  outbound_form: OutboundForm as unknown as FormComponent,
  partner_form: PartnerForm as unknown as FormComponent,
  partner_form_v2: PartnerFormV2,
};

export const detailComponents: Record<string, DetailComponent> = {
  outbound: ((props) => <OutboundDetailView outboundId={props.id} onBack={props.onBack} />) as DetailComponent,
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
};

// ─── Master option sources ─────────────────────────────────────────────────
export const masterSources: Record<string, MasterOptionSource> = {
  manufacturers: {
    load: async () => {
      await useAppStore.getState().loadManufacturers();
      return useAppStore.getState().manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr }));
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
};

// ─── Enum dictionaries ─────────────────────────────────────────────────────
export const enumDictionaries: Record<string, Record<string, string>> = {
  OUTBOUND_STATUS_LABEL,
  USAGE_CATEGORY_LABEL: USAGE_CATEGORY_LABEL as Record<string, string>,
  INVOICE_STATUS_LABEL: { issued: '발행', pending: '미발행' },
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
