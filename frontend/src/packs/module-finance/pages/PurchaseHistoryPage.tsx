import { useMemo, useState, useEffect } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, ClipboardList, DollarSign, FileEdit, FileSignature, FilterX, History, Landmark, Search, Send, Ship } from 'lucide-react';

import { useAppStore } from '@/stores/appStore';
import { usePOList, usePriceHistoryList, useLCList, useTTList } from '@/hooks/useProcurement';
import { useBLList } from '@/hooks/useInbound';
import { fetchWithAuth } from '@/lib/api';
import { buildChains, diffAuditFields, eventDeepLink, isValidChainParam, sanitizeAuditLogs, type Chain, type EventKind, type SafeAuditLog } from '@/lib/purchaseHistory';
import EmptyState from '@/components/common/EmptyState';
import { CardB, FilterButton, FilterChips, TileB, type DateRangeValue } from '@/components/command/MockupPrimitives';
import { monthlyCount, flatSparkFromValue } from '@/templates/sparkUtils';
import { CONTRACT_TYPE_LABEL, LC_STATUS_LABEL, PO_STATUS_LABEL } from '@/types/procurement';
import type { PurchaseOrder, PriceHistory, LCRecord, TTRemittance } from '@/types/procurement';
import { BL_STATUS_LABEL } from '@/types/inbound';
import type { BLShipment } from '@/types/inbound';

interface TimelineEvent {
  id: string;
  kind: EventKind;
  date: string; // YYYY-MM-DD
  chain_id: string;
  po_id?: string;
  lc_id?: string;
  bl_id?: string;
  tt_id?: string;
  // Display payload
  title: string;
  subtitle?: string;
  detail?: string;
}

type EventFilter = 'all' | EventKind;

const EVENT_KIND_LABEL: Record<EventKind, string> = {
  po_create: 'PO 생성',
  variant_create: '변경계약',
  price_change: '단가',
  po_update: 'PO 변경',
  po_cancel: '취소',
  lc_open: 'L/C 개설',
  lc_settle: 'L/C 결제',
  bl_event: 'B/L',
  tt_send: 'T/T',
};

const EVENT_KIND_OPTIONS: EventKind[] = [
  'po_create',
  'variant_create',
  'price_change',
  'po_update',
  'lc_open',
  'lc_settle',
  'bl_event',
  'tt_send',
  'po_cancel',
];

function inDateRange(date: string | undefined | null, range: DateRangeValue): boolean {
  if (!range) return true;
  if (!date) return false;
  return date >= range.start && date <= range.end;
}

function latestPO(chain: Chain): PurchaseOrder {
  return chain.pos[chain.pos.length - 1] ?? chain.head;
}

function fmtMw(value?: number): string {
  if (!Number.isFinite(value ?? 0) || !value || value <= 0) return '0.00 MW';
  return `${value.toLocaleString('ko-KR', { minimumFractionDigits: value >= 100 ? 1 : 2, maximumFractionDigits: value >= 100 ? 1 : 2 })} MW`;
}

function formatMonthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return '날짜 미지정';
  const [year, m] = month.split('-');
  return `${year}년 ${Number(m)}월`;
}

function countByKind(events: TimelineEvent[]): Record<EventKind, number> {
  const out = Object.fromEntries(EVENT_KIND_OPTIONS.map((kind) => [kind, 0])) as Record<EventKind, number>;
  for (const evt of events) out[evt.kind] = (out[evt.kind] ?? 0) + 1;
  return out;
}

function poEvents(po: PurchaseOrder, chain: Chain): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const date = po.contract_date ?? '';
  if (!date) return events;
  const poLabel = po.po_number ?? po.po_id.slice(0, 8);
  const mwLabel = po.total_mw ? `${po.total_mw.toFixed(2)} MW` : null;
  const typeLabel = CONTRACT_TYPE_LABEL[po.contract_type] ?? po.contract_type;
  if (!po.parent_po_id) {
    events.push({
      id: `po-${po.po_id}`,
      kind: 'po_create',
      date,
      chain_id: chain.chain_id,
      po_id: po.po_id,
      title: `PO 생성 — ${poLabel}`,
      subtitle: [typeLabel, mwLabel, PO_STATUS_LABEL[po.status]].filter(Boolean).join(' · '),
      detail: po.payment_terms ?? po.incoterms,
    });
  } else {
    const parentLabel = chain.pos.find((p) => p.po_id === po.parent_po_id)?.po_number ?? po.parent_po_id.slice(0, 8);
    events.push({
      id: `var-${po.po_id}`,
      kind: 'variant_create',
      date,
      chain_id: chain.chain_id,
      po_id: po.po_id,
      title: `변경계약 등록 — ${poLabel}`,
      subtitle: `원계약 ${parentLabel}${mwLabel ? ` · ${mwLabel}` : ''}`,
      detail: po.payment_terms ?? po.incoterms,
    });
  }
  return events;
}

function priceEvents(phs: PriceHistory[], poIds: Set<string>, chainId: string, mfgId?: string): TimelineEvent[] {
  return phs
    .filter((ph) => {
      if (ph.related_po_id) return poIds.has(ph.related_po_id);
      // 수동 입력(related_po_id null): 체인 제조사가 일치하면 컨텍스트로 노출
      return mfgId && ph.manufacturer_id === mfgId;
    })
    .map((ph) => {
      const product = ph.product_name ?? ph.product_id.slice(0, 8);
      const arrow = ph.previous_price != null
        ? `${ph.previous_price.toFixed(3)} → ${ph.new_price.toFixed(3)}`
        : ph.new_price.toFixed(3);
      const isManual = !ph.related_po_id;
      return {
        id: `ph-${ph.price_history_id}`,
        kind: 'price_change' as const,
        date: ph.change_date,
        chain_id: chainId,
        po_id: ph.related_po_id ?? undefined,
        title: `단가 ${isManual ? '수동 등록' : '등록'} — ${product}`,
        subtitle: `${arrow} USD/Wp${ph.reason ? ` · ${ph.reason}` : ''}${isManual ? ' · [PO 미연결]' : ''}`,
        detail: ph.memo,
      };
    });
}

function lcEvents(lcs: LCRecord[], poIds: Set<string>, chainId: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const lc of lcs) {
    if (!poIds.has(lc.po_id)) continue;
    const lcLabel = lc.lc_number ?? lc.lc_id.slice(0, 8);
    const amountLabel = lc.amount_usd ? `USD ${(lc.amount_usd / 1_000_000).toFixed(2)}M` : '';
    if (lc.open_date) {
      events.push({
        id: `lc-open-${lc.lc_id}`,
        kind: 'lc_open',
        date: lc.open_date,
        chain_id: chainId,
        po_id: lc.po_id,
        lc_id: lc.lc_id,
        title: `L/C 개설 — ${lcLabel}`,
        subtitle: [lc.bank_name ?? '은행 미지정', amountLabel, LC_STATUS_LABEL[lc.status]].filter(Boolean).join(' · '),
      });
    }
    const settleDate = lc.repayment_date ?? lc.settlement_date;
    if (settleDate && (lc.status === 'settled' || lc.repaid)) {
      events.push({
        id: `lc-settle-${lc.lc_id}`,
        kind: 'lc_settle',
        date: settleDate,
        chain_id: chainId,
        po_id: lc.po_id,
        lc_id: lc.lc_id,
        title: `L/C 결제 — ${lcLabel}`,
        subtitle: [lc.bank_name, amountLabel].filter(Boolean).join(' · '),
      });
    }
  }
  return events;
}

function blEvents(bls: BLShipment[], poIds: Set<string>, chainId: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const bl of bls) {
    if (!bl.po_id || !poIds.has(bl.po_id)) continue;
    const date = bl.actual_arrival ?? bl.eta ?? bl.etd ?? '';
    if (!date) continue;
    const portLabel = bl.port ?? '';
    events.push({
      id: `bl-${bl.bl_id}`,
      kind: 'bl_event',
      date,
      chain_id: chainId,
      po_id: bl.po_id,
      bl_id: bl.bl_id,
      title: `B/L ${BL_STATUS_LABEL[bl.status] ?? bl.status} — ${bl.bl_number}`,
      subtitle: [portLabel, bl.forwarder].filter(Boolean).join(' · ') || undefined,
      detail: bl.warehouse_name ? `창고: ${bl.warehouse_name}` : undefined,
    });
  }
  return events;
}

function ttEvents(tts: TTRemittance[], poIds: Set<string>, chainId: string): TimelineEvent[] {
  return tts
    .filter((tt) => poIds.has(tt.po_id) && tt.remit_date)
    .map((tt) => {
      const amount = tt.amount_usd ? `USD ${(tt.amount_usd / 1_000_000).toFixed(2)}M` : '';
      const purpose = tt.purpose ?? '';
      return {
        id: `tt-${tt.tt_id}`,
        kind: 'tt_send' as const,
        date: tt.remit_date as string,
        chain_id: chainId,
        po_id: tt.po_id,
        tt_id: tt.tt_id,
        title: `T/T 송금 — ${amount || tt.tt_id.slice(0, 8)}`,
        subtitle: [purpose, tt.bank_name, tt.status === 'planned' ? '예정' : '완료'].filter(Boolean).join(' · ') || undefined,
      };
    });
}

function auditEvents(audits: SafeAuditLog[], poIds: Set<string>, chainId: string): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const a of audits) {
    if (a.entity_type !== 'purchase_orders' || !poIds.has(a.entity_id) || a.action === 'create') continue;
    const date = (a.created_at ?? '').slice(0, 10);
    if (!date) continue;
    const isCancel = a.action === 'delete' || a.note === 'soft_cancel';
    const user = a.user_email ?? a.user_id ?? '시스템';
    if (isCancel) {
      events.push({
        id: `audit-${a.audit_id}`,
        kind: 'po_cancel',
        date,
        chain_id: chainId,
        po_id: a.entity_id,
        title: 'PO 취소 (soft cancel)',
        subtitle: user,
      });
      continue;
    }
    const diffs = diffAuditFields(a.old_data, a.new_data);
    events.push({
      id: `audit-${a.audit_id}`,
      kind: 'po_update',
      date,
      chain_id: chainId,
      po_id: a.entity_id,
      title: diffs.length > 0 ? `PO 변경 — ${diffs.length}개 필드` : 'PO 필드 변경',
      subtitle: user,
      detail: diffs.length > 0 ? diffs.slice(0, 3).join(' · ') + (diffs.length > 3 ? ` 외 ${diffs.length - 3}건` : '') : undefined,
    });
  }
  return events;
}

interface EventSources {
  phs: PriceHistory[];
  lcs: LCRecord[];
  bls: BLShipment[];
  tts: TTRemittance[];
  audits: SafeAuditLog[];
}

function buildChainEvents(chain: Chain, src: EventSources): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const poIds = new Set(chain.pos.map((p) => p.po_id));
  for (const po of chain.pos) {
    events.push(...poEvents(po, chain));
  }
  events.push(...priceEvents(src.phs, poIds, chain.chain_id, chain.manufacturer_id));
  events.push(...lcEvents(src.lcs, poIds, chain.chain_id));
  events.push(...blEvents(src.bls, poIds, chain.chain_id));
  events.push(...ttEvents(src.tts, poIds, chain.chain_id));
  events.push(...auditEvents(src.audits, poIds, chain.chain_id));
  events.sort((a, b) => b.date.localeCompare(a.date));
  return events;
}

function buildRecentEvents(chains: Chain[], src: EventSources, limit: number): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const allPoIds = new Set<string>();
  for (const chain of chains) {
    const poIds = new Set(chain.pos.map((p) => p.po_id));
    poIds.forEach((id) => {
      allPoIds.add(id);
    });
    for (const po of chain.pos) events.push(...poEvents(po, chain));
    events.push(...priceEvents(src.phs, poIds, chain.chain_id, chain.manufacturer_id));
    events.push(...lcEvents(src.lcs, poIds, chain.chain_id));
    events.push(...blEvents(src.bls, poIds, chain.chain_id));
    events.push(...ttEvents(src.tts, poIds, chain.chain_id));
    events.push(...auditEvents(src.audits, poIds, chain.chain_id));
  }
  // 회사 전체 뷰: 어떤 체인에도 안 붙는 수동 단가 입력도 별도로 노출
  for (const ph of src.phs) {
    if (ph.related_po_id) continue;
    if (chains.some((c) => c.manufacturer_id === ph.manufacturer_id)) continue; // 이미 위에서 추가됨
    const product = ph.product_name ?? ph.product_id.slice(0, 8);
    const arrow = ph.previous_price != null
      ? `${ph.previous_price.toFixed(3)} → ${ph.new_price.toFixed(3)}`
      : ph.new_price.toFixed(3);
    events.push({
      id: `ph-orphan-${ph.price_history_id}`,
      kind: 'price_change',
      date: ph.change_date,
      chain_id: '',
      title: `단가 수동 등록 — ${product}`,
      subtitle: `${arrow} USD/Wp · [PO 미연결]`,
      detail: ph.memo,
    });
  }
  events.sort((a, b) => b.date.localeCompare(a.date));
  return events.slice(0, limit);
}

function eventIcon(kind: EventKind) {
  switch (kind) {
    case 'po_create': return <ClipboardList className="h-3.5 w-3.5" />;
    case 'variant_create': return <FileSignature className="h-3.5 w-3.5" />;
    case 'price_change': return <DollarSign className="h-3.5 w-3.5" />;
    case 'po_update': return <FileEdit className="h-3.5 w-3.5" />;
    case 'po_cancel': return <Ban className="h-3.5 w-3.5" />;
    case 'lc_open':
    case 'lc_settle': return <Landmark className="h-3.5 w-3.5" />;
    case 'bl_event': return <Ship className="h-3.5 w-3.5" />;
    case 'tt_send': return <Send className="h-3.5 w-3.5" />;
  }
}

function eventTone(kind: EventKind): string {
  switch (kind) {
    case 'po_create': return 'var(--solar-2)';
    case 'variant_create': return 'var(--warn)';
    case 'price_change': return 'var(--info)';
    case 'po_update': return 'var(--ink-3)';
    case 'po_cancel': return 'var(--neg)';
    case 'lc_open': return 'var(--solar-3)';
    case 'lc_settle': return 'var(--pos)';
    case 'bl_event': return 'var(--info)';
    case 'tt_send': return 'var(--solar-2)';
  }
}

const RECENT_LIMIT = 20;

export default function PurchaseHistoryPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // 필터/제조사/기간 변경 시 체인 list 가 자연스럽게 reorder 되도록 자동 애니메이션.
  const [chainsParent] = useAutoAnimate<HTMLUListElement>();
  // chainParam은 외부 URL 조작 방지를 위해 형식 검증 — 허용 외 값은 무시 (= 미선택 상태로 간주)
  const rawChainParam = searchParams.get('chain') ?? '';
  const chainParam = isValidChainParam(rawChainParam) ? rawChainParam : '';

  const [mfgFilter, setMfgFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(null);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const manufacturers = useAppStore((s) => s.manufacturers);
  const loadManufacturers = useAppStore((s) => s.loadManufacturers);

  const { data: pos, loading: posLoading, error: posError, reload: reloadPOs } = usePOList({});
  const { data: phs, loading: phsLoading, error: phsError, reload: reloadPHs } = usePriceHistoryList({});
  const { data: lcs, loading: lcsLoading, error: lcsError, reload: reloadLCs } = useLCList({});
  const { data: bls, loading: blsLoading, error: blsError, reload: reloadBLs } = useBLList({});
  const { data: tts, loading: ttsLoading, error: ttsError, reload: reloadTTs } = useTTList({});

  const [audits, setAudits] = useState<SafeAuditLog[]>([]);
  const [auditsLoading, setAuditsLoading] = useState(false);

  useEffect(() => {
    loadManufacturers();
  }, [loadManufacturers]);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setAuditsLoading(true);
    // 최근 1년치 + limit 1000 — 회사 누적 audit이 커져도 페이지 진입 비용 일정
    const from = new Date();
    from.setFullYear(from.getFullYear() - 1);
    const fromIso = from.toISOString().slice(0, 10);
    // 페이지 이탈 시 in-flight fetch 취소 — 응답이 unmount 후 도착해 setState 경고/메모리 누수 방지
    const controller = new AbortController();
    fetchWithAuth<unknown>(
      `/api/v1/audit-logs?entity_type=purchase_orders&from=${fromIso}&limit=1000`,
      { signal: controller.signal },
    )
      .then((raw) => setAudits(sanitizeAuditLogs(raw)))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setAudits([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setAuditsLoading(false);
      });
    return () => controller.abort();
  }, [selectedCompanyId]);

  const chains = useMemo(() => buildChains(pos), [pos]);

  const filteredChains = useMemo(() => {
    let result = chains;
    if (mfgFilter) result = result.filter((c) => c.manufacturer_id === mfgFilter);
    if (dateRange) {
      result = result.filter((c) => {
        return c.pos.some((p) => inDateRange(p.contract_date, dateRange));
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((c) => {
        const poLabels = c.pos.map((p) => [
          p.po_number ?? p.po_id,
          PO_STATUS_LABEL[p.status],
          CONTRACT_TYPE_LABEL[p.contract_type],
          p.payment_terms ?? '',
          p.incoterms ?? '',
        ].join(' ')).join(' ');
        const mfg = (c.manufacturer_name ?? '').toLowerCase();
        return poLabels.toLowerCase().includes(q) || mfg.includes(q);
      });
    }
    return result;
  }, [chains, mfgFilter, dateRange, search]);

  const selectedChain = useMemo(
    () => (chainParam ? chains.find((c) => c.chain_id === chainParam) ?? null : null),
    [chains, chainParam],
  );

  const sources = useMemo<EventSources>(
    () => ({ phs, lcs, bls, tts, audits }),
    [phs, lcs, bls, tts, audits],
  );

  const rawEvents = useMemo(() => {
    if (selectedChain) return buildChainEvents(selectedChain, sources);
    return buildRecentEvents(filteredChains, sources, 10_000);
  }, [selectedChain, filteredChains, sources]);

  const dateScopedEvents = useMemo(
    () => rawEvents.filter((evt) => inDateRange(evt.date, dateRange)),
    [rawEvents, dateRange],
  );

  const eventKindCounts = useMemo(() => countByKind(dateScopedEvents), [dateScopedEvents]);

  const eventFilterOptions = useMemo(
    () => [
      { key: 'all', label: '전체', count: dateScopedEvents.length },
      ...EVENT_KIND_OPTIONS
        .filter((kind) => eventKindCounts[kind] > 0)
        .map((kind) => ({ key: kind, label: EVENT_KIND_LABEL[kind], count: eventKindCounts[kind] })),
    ],
    [dateScopedEvents.length, eventKindCounts],
  );

  const events = useMemo(
    () => {
      const filtered = dateScopedEvents.filter((evt) => eventFilter === 'all' || evt.kind === eventFilter);
      return selectedChain ? filtered : filtered.slice(0, RECENT_LIMIT);
    },
    [dateScopedEvents, eventFilter, selectedChain],
  );

  const eventGroups = useMemo(() => {
    const groups: { key: string; label: string; events: TimelineEvent[] }[] = [];
    for (const evt of events) {
      const key = evt.date ? evt.date.slice(0, 7) : '__unset__';
      let group = groups.find((g) => g.key === key);
      if (!group) {
        group = { key, label: formatMonthLabel(key), events: [] };
        groups.push(group);
      }
      group.events.push(evt);
    }
    return groups;
  }, [events]);

  const chainStats = useMemo(() => {
    const out = new Map<string, { eventCount: number; latestEventDate?: string; lcCount: number; blCount: number; ttCount: number }>();
    for (const chain of chains) {
      const chainEvents = buildChainEvents(chain, sources);
      out.set(chain.chain_id, {
        eventCount: chainEvents.length,
        latestEventDate: chainEvents[0]?.date,
        lcCount: chainEvents.filter((evt) => evt.kind === 'lc_open' || evt.kind === 'lc_settle').length,
        blCount: chainEvents.filter((evt) => evt.kind === 'bl_event').length,
        ttCount: chainEvents.filter((evt) => evt.kind === 'tt_send').length,
      });
    }
    return out;
  }, [chains, sources]);

  const variantCount = useMemo(() => chains.reduce((sum, c) => sum + (c.pos.length - 1), 0), [chains]);
  const chainsWithVariants = useMemo(() => chains.filter((c) => c.pos.length > 1).length, [chains]);

  const loading = posLoading || phsLoading || lcsLoading || blsLoading || ttsLoading || auditsLoading;
  // 5개 훅 중 하나라도 실패하면 메인 컨텐츠 대신 에러 EmptyState. reloadAll 은 모두 재시도.
  const loadError = posError ?? phsError ?? lcsError ?? blsError ?? ttsError;
  const reloadAll = async () => {
    await Promise.all([reloadPOs(), reloadPHs(), reloadLCs(), reloadBLs(), reloadTTs()]);
  };

  const handleSelectChain = (chainId: string | null) => {
    if (!chainId) {
      searchParams.delete('chain');
    } else {
      searchParams.set('chain', chainId);
    }
    setSearchParams(searchParams, { replace: true });
  };

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  const fmtCount = (n: number) => String(Math.round(n));
  const metrics = [
    { lbl: '계약 체인', v: String(chains.length), numericValue: chains.length, formatter: fmtCount, u: '건', sub: `${chainsWithVariants}건은 변경계약 포함`, tone: 'solar' as const, spark: monthlyCount(chains, (c) => c.head.contract_date), metricId: 'purchase.chains' },
    { lbl: '변경계약', v: String(variantCount), numericValue: variantCount, formatter: fmtCount, u: '건', sub: '체인 내 추가 PO', tone: 'warn' as const, spark: monthlyCount(chains.flatMap((c) => c.pos.slice(1)), (p) => p.contract_date), metricId: 'purchase.variants' },
    { lbl: '단가 변동', v: String(phs.length), numericValue: phs.length, formatter: fmtCount, u: '건', sub: '제조사별 USD/Wp', tone: 'info' as const, spark: monthlyCount(phs, (p) => p.change_date), metricId: 'purchase.price_changes' },
    { lbl: '최근 이벤트', v: String(events.length), numericValue: events.length, formatter: fmtCount, u: '건', sub: selectedChain ? '선택 체인 기준' : '전체 회사 최근', tone: 'ink' as const, spark: monthlyCount(events, (e) => e.date), metricId: 'purchase.recent_events' },
  ];

  return (
    <div className="sf-page sf-purchase-history-page min-h-[calc(100vh-5rem)]">
      <div className="sf-command-kpis">
        {metrics.map((m) => (
          <TileB key={m.lbl} lbl={m.lbl} v={m.v} numericValue={m.numericValue} formatter={m.formatter} u={m.u} sub={m.sub} tone={m.tone} spark={m.spark ?? flatSparkFromValue(m.v)} metricId={m.metricId} />
        ))}
      </div>

      <div className="sf-purchase-history-grid">
        {/* 좌측: 계약 체인 리스트 */}
        <CardB
          title="계약 체인"
          sub={`${filteredChains.length} / ${chains.length}건`}
          right={
            <FilterButton
              items={[
                {
                  kind: 'date_range',
                  label: '기간',
                  value: dateRange,
                  onChange: setDateRange,
                },
                {
                  label: '제조사',
                  value: mfgFilter,
                  onChange: setMfgFilter,
                  options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
                },
              ]}
            />
          }
        >
          <div className="sf-ph-search-row">
            <div className="sf-ph-search-input">
              <Search aria-hidden="true" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="PO 번호 또는 제조사"
                aria-label="계약 체인 검색"
              />
            </div>
          </div>
          {loadError ? (
            <EmptyState
              tone="error"
              message="구매 이력을 불러오지 못했습니다"
              description={loadError}
              actionLabel="다시 시도"
              onAction={reloadAll}
            />
          ) : loading ? (
            <div aria-label="계약 체인 로딩 중">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="sf-ph-skeleton-row" />
              ))}
            </div>
          ) : filteredChains.length === 0 ? (
            <div className="sf-ph-empty">
              <History aria-hidden="true" />
              <div className="text-xs">{chains.length === 0 ? 'PO가 없습니다' : '검색 결과 없음'}</div>
            </div>
          ) : (
            <ul ref={chainsParent} className="sf-ph-chain-list" role="listbox" aria-label="계약 체인 목록">
              {filteredChains.map((chain) => {
                const isActive = chain.chain_id === chainParam;
                const variantN = chain.pos.length - 1;
                const headLabel = chain.head.po_number ?? chain.head.po_id.slice(0, 8);
                const current = latestPO(chain);
                const stat = chainStats.get(chain.chain_id);
                return (
                  <li key={chain.chain_id} role="option" aria-selected={isActive}>
                    <button
                      type="button"
                      onClick={() => handleSelectChain(isActive ? null : chain.chain_id)}
                      className="sf-ph-chain-row"
                      data-active={isActive}
                      aria-label={`${headLabel} ${chain.manufacturer_name ?? ''} 체인 선택${variantN > 0 ? `, 변경계약 ${variantN}건` : ''}`}
                    >
                      <div className="sf-ph-chain-head">
                        <span className="mono sf-ph-chain-num">{headLabel}</span>
                        {variantN > 0 && (
                          <span className="mono sf-ph-chain-variant-badge">
                            v{variantN + 1} ({chain.pos.length}건)
                          </span>
                        )}
                      </div>
                      <div className="sf-ph-chain-mfg">{chain.manufacturer_name ?? '제조사 미지정'}</div>
                      <div className="sf-ph-chain-meta">
                        <span>{PO_STATUS_LABEL[current.status]}</span>
                        <span>{CONTRACT_TYPE_LABEL[current.contract_type]}</span>
                        <span>{fmtMw(current.total_mw)}</span>
                      </div>
                      <div className="sf-ph-chain-foot">
                        <span className="mono">최근 {stat?.latestEventDate ?? chain.latest_contract_date ?? '—'}</span>
                        <span className="mono">
                          이벤트 {stat?.eventCount ?? 0} · LC {stat?.lcCount ?? 0} · BL {stat?.blCount ?? 0} · TT {stat?.ttCount ?? 0}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardB>

        {/* 우측: 통합 타임라인 */}
        <CardB
          title={selectedChain ? `${selectedChain.head.po_number ?? selectedChain.chain_id.slice(0, 8)} 타임라인` : '회사 전체 최근 활동'}
          sub={selectedChain
            ? `${events.length} / ${rawEvents.length}건 이벤트 · ${selectedChain.manufacturer_name ?? '제조사 미지정'}`
            : `최근 ${events.length} / ${rawEvents.length}건 (전 체인)`}
          right={
            selectedChain && (
              <button
                type="button"
                onClick={() => handleSelectChain(null)}
                className="sf-ph-clear-btn"
              >
                선택 해제
              </button>
            )
          }
        >
          <div className="sf-ph-timeline-toolbar">
            <FilterChips
              options={eventFilterOptions}
              value={eventFilter}
              onChange={(value) => setEventFilter(value as EventFilter)}
            />
            {(eventFilter !== 'all' || dateRange) && (
              <button
                type="button"
                className="sf-ph-reset-btn"
                onClick={() => {
                  setEventFilter('all');
                  setDateRange(null);
                }}
              >
                <FilterX aria-hidden="true" />
                필터 해제
              </button>
            )}
          </div>
          {selectedChain && (
            <div className="sf-ph-chain-summary">
              {(() => {
                const current = latestPO(selectedChain);
                const stat = chainStats.get(selectedChain.chain_id);
                return (
                  <>
                    <div>
                      <div className="eyebrow">현재 계약</div>
                      <div className="sf-ph-summary-value">{current.po_number ?? current.po_id.slice(0, 8)}</div>
                      <div className="sf-ph-summary-sub">{PO_STATUS_LABEL[current.status]} · {CONTRACT_TYPE_LABEL[current.contract_type]}</div>
                    </div>
                    <div>
                      <div className="eyebrow">계약 규모</div>
                      <div className="sf-ph-summary-value">{fmtMw(current.total_mw)}</div>
                      <div className="sf-ph-summary-sub">{(current.total_qty ?? 0).toLocaleString('ko-KR')}장</div>
                    </div>
                    <div>
                      <div className="eyebrow">연결 이력</div>
                      <div className="sf-ph-summary-value">{stat?.eventCount ?? 0}건</div>
                      <div className="sf-ph-summary-sub">LC {stat?.lcCount ?? 0} · BL {stat?.blCount ?? 0} · TT {stat?.ttCount ?? 0}</div>
                    </div>
                    <div>
                      <div className="eyebrow">최근 이벤트</div>
                      <div className="sf-ph-summary-value">{stat?.latestEventDate ?? '—'}</div>
                      <div className="sf-ph-summary-sub">{selectedChain.manufacturer_name ?? '제조사 미지정'}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
          {loading ? (
            <div aria-label="타임라인 로딩 중">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="sf-ph-skeleton-row" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="sf-ph-empty">
              <History aria-hidden="true" />
              <div className="text-xs">표시할 이벤트가 없습니다</div>
            </div>
          ) : (
            <div className="sf-ph-timeline-groups" aria-label="구매 이력 이벤트">
              {eventGroups.map((group) => (
                <section key={group.key} className="sf-ph-month-group">
                  <div className="sf-ph-month-divider">
                    <span>{group.label}</span>
                    <span className="mono">{group.events.length}건</span>
                  </div>
                  <ol className="sf-ph-timeline">
                    {group.events.map((evt) => {
                      const link = eventDeepLink(evt);
                      const Tag = link ? 'button' : 'div';
                      const tagProps = link
                        ? { type: 'button' as const, onClick: () => navigate(link), 'aria-label': `${evt.title}, ${evt.date}, ${link}로 이동` }
                        : { 'aria-label': `${evt.title}, ${evt.date}` };
                      return (
                        <li key={evt.id}>
                          <Tag
                            {...tagProps}
                            className="sf-ph-event-row"
                            data-link={link != null}
                            title={link ? `${link}로 이동` : undefined}
                          >
                            <div
                              className="sf-ph-event-icon"
                              style={{ border: `1.5px solid ${eventTone(evt.kind)}`, color: eventTone(evt.kind) }}
                            >
                              {eventIcon(evt.kind)}
                            </div>
                            <div className="sf-ph-event-body">
                              <div className="sf-ph-event-title-row">
                                <div className="sf-ph-event-title">{evt.title}</div>
                                <div className="sf-ph-event-side">
                                  <span className="sf-ph-event-kind">{EVENT_KIND_LABEL[evt.kind]}</span>
                                  <span className="mono sf-ph-event-date">{evt.date}</span>
                                </div>
                              </div>
                              {evt.subtitle && <div className="sf-ph-event-subtitle">{evt.subtitle}</div>}
                              {evt.detail && <div className="sf-ph-event-detail">{evt.detail}</div>}
                            </div>
                          </Tag>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              ))}
            </div>
          )}
        </CardB>
      </div>
    </div>
  );
}
