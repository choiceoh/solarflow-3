import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent } from '@/components/ui/tabs';

import { useAppStore } from '@/stores/appStore';
import { usePOList, useLCList, useTTList } from '@/hooks/useProcurement';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import SkeletonRows from '@/components/common/SkeletonRows';
import POListTable from '@/components/procurement/POListTable';
import PODetailView from '@/components/procurement/PODetailView';
import LCListTable from '@/components/procurement/LCListTable';
import TTListTable from '@/components/procurement/TTListTable';
import DepositStatusPanel from '@/components/procurement/DepositStatusPanel';
import ExcelToolbar from '@/components/excel/ExcelToolbar';
import { PO_STATUS_LABEL, CONTRACT_TYPE_LABEL, CONTRACT_TYPES_ACTIVE, LC_STATUS_LABEL, TT_STATUS_LABEL } from '@/types/procurement';
import type { PurchaseOrder, POStatus, LCStatus, TTStatus } from '@/types/procurement';
import type { Manufacturer, Bank } from '@/types/masters';
import { useBLList } from '@/hooks/useInbound';
import { useFxTimeseries } from '@/hooks/usePublicFx';
import BLListTable from '@/components/inbound/BLListTable';
import BLDetailView from '@/components/inbound/BLDetailView';
import { INBOUND_TYPE_LABEL, BL_STATUS_LABEL, type InboundType, type BLStatus } from '@/types/inbound';
import { CardB, CommandTopLine, FilterButton, FilterChips, RailBlock, Sparkline, TileB } from '@/components/command/MockupPrimitives';
import { BreakdownRows } from '@/components/command/BreakdownRows';
import { flatSparkFromValue, monthlyTrend, monthlyCount } from '@/templates/sparkUtils';

const PROCUREMENT_TABS = new Set(['po', 'tt', 'lc', 'bl']);

const fxNumberFmt = new Intl.NumberFormat('en-US');

const PROC_TAB_OPTIONS = [
  { key: 'po', label: 'PO' },
  { key: 'tt', label: '계약금' },
  { key: 'lc', label: 'LC' },
  { key: 'bl', label: 'B/L' },
];

type ProcurementMetric = {
  lbl: string;
  v: string;
  u?: string;
  sub?: string;
  tone: 'solar' | 'ink' | 'info' | 'warn' | 'pos';
  delta?: string;
  spark?: number[];
};

function fmtUsdM(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return (value / 1_000_000).toFixed(value >= 10_000_000 ? 1 : 2);
}

function fmtMw(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0.00';
  return value.toFixed(value >= 100 ? 1 : 2);
}

function daysUntil(date?: string) {
  if (!date) return null;
  const at = new Date(date);
  if (Number.isNaN(at.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  at.setHours(0, 0, 0, 0);
  return Math.ceil((at.getTime() - today.getTime()) / 86_400_000);
}

export default function ProcurementPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = new URLSearchParams(location.search).get('tab') ?? 'po';
  const [activeTab, setActiveTab] = useState(PROCUREMENT_TABS.has(initialTab) ? initialTab : 'po');

  // 단가 탭은 /purchase-history로 통합 — query param ?tab=price 진입 시 새 페이지로 리다이렉트
  useEffect(() => {
    if (new URLSearchParams(location.search).get('tab') === 'price') {
      navigate('/purchase-history', { replace: true });
    }
  }, [location.search, navigate]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  // 계약금 탭용 전체 PO 목록 (필터 없음) — usePOList hook으로 관리하여 취소 처리 시 reloadPoList()로 동기화
  const { data: poList, reload: reloadPoList } = usePOList({});

  const [poStatusFilter, setPoStatusFilter] = useState('');
  const [poMfgFilter, setPoMfgFilter] = useState('');
  const [poTypeFilter, setPoTypeFilter] = useState('');
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  // R1-1: 사이드바 "발주/결제" 클릭 시 슬라이드 패널 닫기
  useEffect(() => { setSelectedPO(null); }, [location.key]);
  useEffect(() => {
    const nextTab = new URLSearchParams(location.search).get('tab') ?? 'po';
    if (PROCUREMENT_TABS.has(nextTab)) setActiveTab(nextTab);
  }, [location.search]);
  // /purchase-history → /procurement?po_id=... 딥링크: pos 로드 후 자동 선택.
  // po_id는 URL을 통해 외부에서 조작 가능하므로 형식 검증 후에만 매칭 시도.
  useEffect(() => {
    const targetId = new URLSearchParams(location.search).get('po_id');
    if (!targetId || poList.length === 0) return;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(targetId)) return;
    const target = poList.find((p) => p.po_id === targetId);
    if (target) setSelectedPO(target);
  }, [location.search, poList]);
  const poFilters: Record<string, string> = {};
  if (poStatusFilter) poFilters.status = poStatusFilter;
  if (poMfgFilter) poFilters.manufacturer_id = poMfgFilter;
  if (poTypeFilter) poFilters.contract_type = poTypeFilter;
  const { data: pos, loading: poLoading, reload: reloadPO } = usePOList(poFilters);

  const [lcAggVersion, setLcAggVersion] = useState(0);
  const [lcStatusFilter, setLcStatusFilter] = useState('');
  const [lcBankFilter, setLcBankFilter] = useState('');
  const [lcMfgFilter, setLcMfgFilter] = useState('');
  const lcFilters: Record<string, string> = {};
  if (lcStatusFilter) lcFilters.status = lcStatusFilter;
  if (lcBankFilter) lcFilters.bank_id = lcBankFilter;
  const { data: lcs, loading: lcLoading, reload: reloadLC } = useLCList(lcFilters);

  const [ttStatusFilter, setTtStatusFilter] = useState('');
  const [ttPoFilter, setTtPoFilter] = useState('');
  const ttFilters: Record<string, string> = {};
  if (ttStatusFilter) ttFilters.status = ttStatusFilter;
  if (ttPoFilter) ttFilters.po_id = ttPoFilter;
  const { data: tts, loading: ttLoading } = useTTList(ttFilters);

  // BL 탭
  const [blTypeFilter, setBlTypeFilter] = useState('');
  const [blStatusFilter, setBlStatusFilter] = useState('');
  const [blMfgFilter, setBlMfgFilter] = useState('');
  const [selectedBL, setSelectedBL] = useState<string | null>(null);
  const [blsVersion, setBlsVersion] = useState(0);
  const blFilters: { inbound_type?: string; status?: string; manufacturer_id?: string } = {};
  if (blTypeFilter) blFilters.inbound_type = blTypeFilter;
  if (blStatusFilter) blFilters.status = blStatusFilter;
  if (blMfgFilter) blFilters.manufacturer_id = blMfgFilter;
  const { data: bls, loading: blLoading, reload: reloadBL } = useBLList(blFilters);

  const [depositMfgFilter, setDepositMfgFilter] = useState('');

  // 우측 슬라이드 패널 — 드래그 리사이즈
  const [panelWidth, setPanelWidth] = useState(900);
  const panelRef = useRef<HTMLDivElement>(null);

  function onDragHandleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    function onMove(ev: MouseEvent) {
      const delta = startX - ev.clientX;
      setPanelWidth(Math.max(520, Math.min(window.innerWidth - 60, startW + delta)));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ESC 키로 패널 닫기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedPO) { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPO]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`)
        .then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => {});
    }
  }, [selectedCompanyId]);

  // USD/KRW 30일 시계열 — LC 탭 우측 레일. 다른 탭에서는 fetch 생략.
  const { data: fx } = useFxTimeseries('usdkrw', 30, activeTab === 'lc');

  // ⚠️ 모든 useMemo는 early return(아래 selectedCompanyId 분기) 이전이어야 함 — Hook 순서 규칙
  const poRows = useMemo(
    () => pos.map(p => {
      const mfg = manufacturers.find(m => m.manufacturer_id === p.manufacturer_id);
      return { ...p, manufacturer_name: mfg?.short_name?.trim() || mfg?.name_kr || p.manufacturer_name || '—' };
    }),
    [pos, manufacturers],
  );
  const lcRows = useMemo(
    () => lcMfgFilter ? lcs.filter(lc => poList.find(p => p.po_id === lc.po_id)?.manufacturer_id === lcMfgFilter) : lcs,
    [lcMfgFilter, lcs, poList],
  );
  const blRows = useMemo(
    () => bls.map(bl => ({
      ...bl,
      manufacturer_name: bl.manufacturer_name ?? manufacturers.find(m => m.manufacturer_id === bl.manufacturer_id)?.name_kr ?? '—',
    })),
    [bls, manufacturers],
  );

  const poActiveCount = useMemo(() => poRows.filter(po => !['completed', 'cancelled'].includes(po.status)).length, [poRows]);
  const poTotalMw = useMemo(() => poRows.reduce((sum, po) => sum + (po.total_mw ?? 0), 0), [poRows]);
  const poShippingCount = useMemo(() => poRows.filter(po => po.status === 'shipping' || po.status === 'in_progress').length, [poRows]);
  const lcTotalUsd = useMemo(() => lcRows.reduce((sum, lc) => sum + (lc.amount_usd ?? 0), 0), [lcRows]);
  const lcOpenedCount = useMemo(() => lcRows.filter(lc => lc.status === 'opened' || lc.status === 'docs_received').length, [lcRows]);
  const lcMaturitySoon = useMemo(
    () => lcRows.filter(lc => {
      const d = daysUntil(lc.maturity_date);
      return d != null && d >= 0 && d <= 30 && lc.status !== 'settled' && lc.status !== 'cancelled';
    }),
    [lcRows],
  );
  const blActiveCount = useMemo(() => blRows.filter(bl => !['completed', 'erp_done'].includes(bl.status)).length, [blRows]);
  const blShippingCount = useMemo(() => blRows.filter(bl => bl.status === 'shipping' || bl.status === 'arrived').length, [blRows]);
  const blCustomsCount = useMemo(() => blRows.filter(bl => bl.status === 'customs').length, [blRows]);
  const ttCompletedUsd = useMemo(() => tts.filter(tt => tt.status === 'completed').reduce((sum, tt) => sum + (tt.amount_usd ?? 0), 0), [tts]);

  if (!selectedCompanyId) {
    return <div className="flex items-center justify-center p-12"><p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p></div>;
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate(tab === 'po' ? '/procurement' : `/procurement?tab=${tab}`, { replace: true });
  };

  const handleSettleLC = async (lc: import('@/types/procurement').LCRecord, repaymentDate: string) => {
    await fetchWithAuth(`/api/v1/lcs/${lc.lc_id}`, { method: 'PUT', body: JSON.stringify({ repaid: true, repayment_date: repaymentDate, status: 'settled' }) });
    reloadLC();
  };

  const selectedRailPO = selectedPO ?? poRows[0] ?? null;

  const pageTitle =
    activeTab === 'lc' ? 'L/C 개설 · 한도' :
    activeTab === 'bl' ? 'B/L · 입고 진행' :
    activeTab === 'tt' ? '계약금 · T/T 송금' :
    'P/O 발주 관리';
  const pageSub =
    activeTab === 'lc' ? `${lcRows.length}건 · USD ${fmtUsdM(lcTotalUsd)}M` :
    activeTab === 'bl' ? `${blRows.length}건 · 진행 ${blActiveCount}건` :
    activeTab === 'tt' ? `${tts.length}건 · 완료 USD ${fmtUsdM(ttCompletedUsd)}M` :
    `${poRows.length}건 · ${fmtMw(poTotalMw)} MW`;
  // KPI sparkline 시계열 — 데이터 범위 기반 (최근 6개월 캡, sparkUtils 참고).
  const lcOpenSpark = monthlyCount(lcRows, (l) => l.open_date);
  const lcAmountSpark = monthlyTrend(lcRows, (l) => l.open_date, (l) => (l.amount_usd ?? 0) / 1_000_000);
  const blDateOf = (b: typeof blRows[number]) => b.actual_arrival ?? b.eta ?? b.etd ?? null;
  const blAllSpark = monthlyCount(blRows, blDateOf);
  const ttSpark = monthlyCount(tts, (t) => t.remit_date);
  const ttAmountSpark = monthlyTrend(tts.filter(t => t.status === 'completed'), (t) => t.remit_date, (t) => (t.amount_usd ?? 0) / 1_000_000);
  const poSpark = monthlyCount(poRows, (p) => p.contract_date);

  const metrics: ProcurementMetric[] =
    activeTab === 'lc' ? [
      { lbl: 'L/C 전체', v: String(lcRows.length), u: '건', sub: `사용중 ${lcOpenedCount}건`, tone: 'solar' as const, spark: lcOpenSpark },
      { lbl: '개설 금액', v: fmtUsdM(lcTotalUsd), u: 'M$', sub: '활성 필터 기준', tone: 'warn' as const, spark: lcAmountSpark },
      { lbl: '만기 30일', v: String(lcMaturitySoon.length), u: '건', sub: lcMaturitySoon[0]?.lc_number ?? '긴급 만기 없음', tone: 'info' as const },
      { lbl: '은행', v: String(new Set(lcRows.map(lc => lc.bank_id)).size), u: '곳', sub: '한도 사용처', tone: 'ink' as const },
    ] :
    activeTab === 'bl' ? [
      { lbl: 'B/L 전체', v: String(blRows.length), u: '건', sub: `진행 ${blActiveCount}건`, tone: 'solar' as const, spark: blAllSpark },
      { lbl: '선적/입항', v: String(blShippingCount), u: '건', sub: '해상 운송 구간', tone: 'info' as const, spark: monthlyCount(blRows.filter(b => b.status === 'shipping' || b.status === 'arrived'), blDateOf) },
      { lbl: '통관중', v: String(blCustomsCount), u: '건', sub: '면장 확인 필요', tone: 'warn' as const, spark: monthlyCount(blRows.filter(b => b.status === 'customs'), blDateOf) },
      { lbl: '해외직수입', v: String(blRows.filter(bl => bl.inbound_type === 'import').length), u: '건', sub: 'OCR 자동입력 대상', tone: 'pos' as const, spark: monthlyCount(blRows.filter(bl => bl.inbound_type === 'import'), blDateOf) },
    ] :
    activeTab === 'tt' ? [
      { lbl: 'T/T 이력', v: String(tts.length), u: '건', sub: '계약금/잔금 송금', tone: 'solar' as const, spark: ttSpark },
      { lbl: '완료 금액', v: fmtUsdM(ttCompletedUsd), u: 'M$', sub: 'completed 기준', tone: 'pos' as const, spark: ttAmountSpark },
      { lbl: '대기', v: String(tts.filter(tt => tt.status === 'planned').length), u: '건', sub: '송금 예정', tone: 'warn' as const, spark: monthlyCount(tts.filter(t => t.status === 'planned'), (t) => t.remit_date) },
      { lbl: 'PO 연결', v: String(new Set(tts.map(tt => tt.po_id)).size), u: '건', sub: '계약금 집계 대상', tone: 'ink' as const },
    ] : [
      { lbl: '진행 P/O', v: String(poActiveCount), u: '건', sub: `${fmtMw(poTotalMw)} MW · 전체 ${poRows.length}건`, tone: 'solar' as const, spark: poSpark },
      { lbl: 'L/C 연결', v: String(lcOpenedCount), u: '건', sub: `USD ${fmtUsdM(lcTotalUsd)}M`, tone: 'info' as const, spark: lcOpenSpark },
      { lbl: '운송중', v: String(poShippingCount), u: '건', sub: '입고 전환 대기', tone: 'warn' as const, spark: monthlyCount(poRows.filter(p => p.status === 'shipping' || p.status === 'in_progress'), (p) => p.contract_date) },
      { lbl: '계약 유형', v: String(new Set(poRows.map(po => po.contract_type)).size), u: '종', sub: 'spot/frame 관리', tone: 'pos' as const },
    ];

  const procurementCardControls = (
    <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
      {activeTab === 'po' && (
        <>
          <FilterButton items={[
            {
              label: '상태',
              value: poStatusFilter,
              onChange: setPoStatusFilter,
              options: (Object.entries(PO_STATUS_LABEL) as [POStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '제조사',
              value: poMfgFilter,
              onChange: setPoMfgFilter,
              options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
            },
            {
              label: '유형',
              value: poTypeFilter,
              onChange: setPoTypeFilter,
              options: CONTRACT_TYPES_ACTIVE.map(({ value, label }) => ({ value, label })),
            },
          ]} />
          <Button size="xs" variant="outline" onClick={() => navigate('/purchase-history')}><History className="mr-1 h-3 w-3" />구매 이력</Button>
        </>
      )}
      {activeTab === 'lc' && (
        <>
          <FilterButton items={[
            {
              label: '상태',
              value: lcStatusFilter,
              onChange: setLcStatusFilter,
              options: (Object.entries(LC_STATUS_LABEL) as [LCStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '은행',
              value: lcBankFilter,
              onChange: setLcBankFilter,
              options: banks.map((b) => ({ value: b.bank_id, label: b.bank_name })),
            },
            {
              label: '제조사',
              value: lcMfgFilter,
              onChange: setLcMfgFilter,
              options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
            },
          ]} />
        </>
      )}
      {activeTab === 'bl' && (
        <>
          <FilterButton items={[
            {
              label: '입고 구분',
              value: blTypeFilter,
              onChange: setBlTypeFilter,
              options: (Object.entries(INBOUND_TYPE_LABEL) as [InboundType, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '입고 현황',
              value: blStatusFilter,
              onChange: setBlStatusFilter,
              options: (Object.entries(BL_STATUS_LABEL) as [BLStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '제조사',
              value: blMfgFilter,
              onChange: setBlMfgFilter,
              options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
            },
          ]} />
          <ExcelToolbar
            type="inbound"
            onImportComplete={() => { reloadBL(); setBlsVersion(v => v + 1); }}
          />
        </>
      )}
      <div style={{ flex: 1 }} />
      <FilterChips options={PROC_TAB_OPTIONS} value={activeTab} onChange={handleTabChange} />
    </div>
  );

  return (
    <div className="sf-page sf-procurement-page min-h-[calc(100vh-5rem)] transition-shadow">

      {/* BL 상세 — 탭 바깥에서 전체 화면으로 표시 */}
      {selectedBL && (
        <div className="fixed inset-0 z-50 bg-background overflow-auto">
          <div className="p-6">
            <BLDetailView blId={selectedBL} onBack={() => { setSelectedBL(null); reloadBL(); }} />
          </div>
        </div>
      )}

      <div className="sf-procurement-layout">
        <section className="sf-procurement-main">
          <div className="sf-command-kpis">
            {metrics.map((metric) => (
              <TileB
                key={metric.lbl}
                lbl={metric.lbl}
                v={metric.v}
                u={metric.u}
                sub={metric.sub}
                tone={metric.tone}
                delta={metric.delta}
                spark={metric.spark ?? flatSparkFromValue(metric.v)}
              />
            ))}
          </div>

          <CommandTopLine title={pageTitle} sub={pageSub} right={procurementCardControls} />

          <CardB
            title={pageTitle}
            sub={pageSub}
            right={procurementCardControls}
            headerless
          >
            <div className="sf-command-tab-body">
              <Tabs value={activeTab} onValueChange={handleTabChange}>

        <TabsContent value="po">
          {poLoading ? <SkeletonRows rows={8} /> : (
            <POListTable
              items={poRows}
              onDetail={setSelectedPO}
              onSelectBL={setSelectedBL}
              aggVersion={lcAggVersion}
            />
          )}
        </TabsContent>

        <TabsContent value="lc">
          {lcLoading ? <SkeletonRows rows={8} /> : (
            <LCListTable
              items={lcRows}
              onSettle={handleSettleLC}
              onSelectBL={setSelectedBL}
              blsVersion={blsVersion}
            />
          )}
        </TabsContent>

        <TabsContent value="tt" className="space-y-5">
          {/* 계약금 현황 — PO별 계약금 자동 집계 */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">계약금 현황</h2>
              <div className="flex-1" />
              <FilterButton items={[
                {
                  label: '제조사',
                  value: depositMfgFilter,
                  onChange: setDepositMfgFilter,
                  options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
                },
              ]} />
            </div>
            <DepositStatusPanel
              pos={depositMfgFilter ? poList.filter(p => p.manufacturer_id === depositMfgFilter) : poList}
              tts={tts}
            />
          </div>

          {/* 구분선 */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">T/T 송금 이력</h2>
              <div className="flex-1" />
              <FilterButton items={[
                {
                  label: '상태',
                  value: ttStatusFilter,
                  onChange: setTtStatusFilter,
                  options: (Object.entries(TT_STATUS_LABEL) as [TTStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
                },
                {
                  label: 'PO',
                  value: ttPoFilter,
                  onChange: setTtPoFilter,
                  options: poList.map((p) => ({ value: p.po_id, label: p.po_number || p.po_id.slice(0, 8) })),
                },
              ]} />
            </div>
            {ttLoading ? <LoadingSpinner /> : <TTListTable items={tts} />}
          </div>
        </TabsContent>

        <TabsContent value="bl" className="space-y-3">
          {blLoading ? <SkeletonRows rows={8} /> : (
            <BLListTable items={blRows} onSelect={(bl) => setSelectedBL(bl.bl_id)} />
          )}
        </TabsContent>

              </Tabs>
            </div>
          </CardB>
        </section>

        <aside className="sf-procurement-rail card">
          {activeTab === 'po' && (
            <>
              <RailBlock title="선택 P/O" count={selectedRailPO?.po_number ?? '—'}>
                {selectedRailPO ? (
                  <div>
                    <div className="text-[13px] font-bold text-[var(--ink)]">{selectedRailPO.manufacturer_name ?? '제조사 미지정'}</div>
                    <div className="mono mt-1 text-[10.5px] text-[var(--ink-3)]">
                      {selectedRailPO.po_number ?? selectedRailPO.po_id.slice(0, 8)} · {fmtMw(selectedRailPO.total_mw ?? 0)} MW
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <div className="eyebrow">계약일</div>
                        <div className="mono mt-1 text-[var(--ink-2)]">{selectedRailPO.contract_date ?? '—'}</div>
                      </div>
                      <div>
                        <div className="eyebrow">상태</div>
                        <div className="mt-1 text-[var(--ink-2)]">{PO_STATUS_LABEL[selectedRailPO.status]}</div>
                      </div>
                      <div>
                        <div className="eyebrow">유형</div>
                        <div className="mt-1 text-[var(--ink-2)]">{CONTRACT_TYPE_LABEL[selectedRailPO.contract_type]}</div>
                      </div>
                      <div>
                        <div className="eyebrow">수량</div>
                        <div className="mono mt-1 text-[var(--ink-2)]">{(selectedRailPO.total_qty ?? 0).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[var(--ink-3)]">선택할 P/O가 없습니다.</div>
                )}
              </RailBlock>
              <RailBlock title="진행 단계" count={`${poActiveCount} active`}>
                {[
                  ['작성/계약', poRows.filter(po => po.status === 'draft' || po.status === 'contracted').length],
                  ['L/C/선적', poRows.filter(po => po.status === 'in_progress' || po.status === 'shipping').length],
                  ['완료', poRows.filter(po => po.status === 'completed').length],
                ].map(([label, count]) => (
                  <div key={label} className="mb-2 last:mb-0">
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-[var(--ink-2)]">{label}</span>
                      <span className="mono text-[var(--ink-3)]">{count}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded bg-[var(--line)]">
                      <div className="h-full bg-[var(--solar-2)]" style={{ width: `${poRows.length ? (Number(count) / poRows.length) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </RailBlock>
              <RailBlock title="JKO · 12주 단가" last>
                <Sparkline data={[418, 416, 412, 408, 406, 402, 400, 398, 394, 392, 388, 384]} w={220} h={42} color="var(--solar-2)" area />
                <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                  <span>현재 <span className="font-bold text-[var(--ink)]">384</span> KRW/Wp</span>
                  <span className="font-bold text-[var(--neg)]">-8.1%</span>
                </div>
              </RailBlock>
            </>
          )}

          {activeTab === 'lc' && (
            <>
              <RailBlock title="은행별 L/C" count={`${new Set(lcRows.map(lc => lc.bank_id)).size} banks`}>
                {banks.slice(0, 5).map((bank) => {
                  const bankLcs = lcRows.filter(lc => lc.bank_id === bank.bank_id);
                  const amount = bankLcs.reduce((sum, lc) => sum + (lc.amount_usd ?? 0), 0);
                  if (bankLcs.length === 0) return null;
                  return (
                    <div key={bank.bank_id} className="mb-3 last:mb-0">
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-[12px] font-semibold text-[var(--ink)]">{bank.bank_name}</span>
                        <span className="mono text-[10.5px] text-[var(--ink-3)]">{fmtUsdM(amount)} M$</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded bg-[var(--line)]">
                        <div className="h-full bg-[var(--solar-2)]" style={{ width: `${lcTotalUsd ? Math.min(100, (amount / lcTotalUsd) * 100) : 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </RailBlock>
              <RailBlock title="만기 30일 이내" count={lcMaturitySoon.length}>
                {lcMaturitySoon.slice(0, 5).map((lc, index) => (
                  <div key={lc.lc_id} className={`grid grid-cols-[1fr_auto] gap-2 py-2 text-[11.5px] ${index ? 'border-t border-[var(--line)]' : ''}`}>
                    <span className="mono font-semibold text-[var(--ink-2)]">{lc.lc_number ?? lc.lc_id.slice(0, 8)}</span>
                    <span className="mono font-bold text-[var(--warn)]">D-{daysUntil(lc.maturity_date)}</span>
                    <span className="text-[var(--ink-3)]">{lc.bank_name ?? '은행 미지정'}</span>
                    <span className="mono text-[var(--ink-3)]">{fmtUsdM(lc.amount_usd)}M$</span>
                  </div>
                ))}
                {lcMaturitySoon.length === 0 && <div className="text-xs text-[var(--ink-3)]">임박 만기가 없습니다.</div>}
              </RailBlock>
              <RailBlock title={`USD/KRW · ${fx?.series.length ?? 30}일`} last>
                {fx && fx.series.length > 0 ? (
                  <>
                    <Sparkline
                      data={fx.series.map((p) => p.rate)}
                      w={220}
                      h={42}
                      color="var(--solar-2)"
                      area
                    />
                    <div className="mono mt-2 flex justify-between text-[10.5px] text-[var(--ink-3)]">
                      <span>
                        현재{' '}
                        <span className="font-bold text-[var(--ink)]">
                          {fx.latest != null ? fxNumberFmt.format(Math.round(fx.latest * 10) / 10) : '—'}
                        </span>
                      </span>
                      {fx.change_pct != null && (
                        <span className={`font-bold ${fx.change_pct >= 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}`}>
                          {fx.change_pct >= 0 ? '+' : ''}{fx.change_pct.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-[var(--ink-3)]">환율 로드 중…</div>
                )}
              </RailBlock>
            </>
          )}

          {activeTab === 'bl' && (
            <>
              <RailBlock title="입고 상태" count={`${blActiveCount} active`}>
                <BreakdownRows
                  items={(['scheduled', 'shipping', 'arrived', 'customs', 'completed'] as BLStatus[]).map((status) => ({
                    key: status,
                    label: BL_STATUS_LABEL[status],
                    count: blRows.filter(bl => bl.status === status).length,
                  }))}
                />
              </RailBlock>
              <RailBlock title="주요 항구" last>
                <BreakdownRows
                  items={Object.entries(blRows.reduce<Record<string, number>>((acc, bl) => {
                    const key = bl.port || '미지정';
                    acc[key] = (acc[key] ?? 0) + 1;
                    return acc;
                  }, {})).slice(0, 5).map(([port, count]) => ({
                    key: port,
                    label: port,
                    count,
                  }))}
                />
              </RailBlock>
            </>
          )}

          {activeTab === 'tt' && (
            <RailBlock title="구매 데이터 연결" count={`${tts.length} T/T`} last>
              <div className="space-y-2 text-[11.5px] text-[var(--ink-2)]">
                <div className="flex justify-between"><span>P/O</span><span className="mono">{poRows.length}</span></div>
                <div className="flex justify-between"><span>L/C</span><span className="mono">{lcRows.length}</span></div>
                <div className="flex justify-between"><span>B/L</span><span className="mono">{blRows.length}</span></div>
              </div>
            </RailBlock>
          )}
        </aside>
      </div>

      {/* 딤 오버레이 — 클릭하면 패널 닫기 */}
      {selectedPO && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity"
          onClick={() => { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
        />
      )}

      {/* PO 우측 슬라이드 패널 — 왼쪽 드래그 핸들로 폭 조절 */}
      <div
        ref={panelRef}
        className={[
          'fixed inset-y-0 right-0 z-50 flex flex-col bg-background border-l shadow-2xl',
          'transition-transform duration-200 ease-out',
          selectedPO ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        style={{ width: panelWidth }}
      >
        {/* 왼쪽 드래그 핸들 */}
        <div
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-10 group select-none"
          onMouseDown={onDragHandleMouseDown}
          title="드래그하여 패널 너비 조절"
        >
          <div className="h-full w-full transition-colors group-hover:bg-primary/20 group-active:bg-primary/30" />
          {/* 가운데 그립 점 */}
          <div className="absolute top-1/2 left-0 -translate-y-1/2 flex flex-col gap-1 items-center w-2">
            {[0,1,2].map(i => (
              <div key={i} className="w-0.5 h-3 rounded-full bg-border group-hover:bg-primary/40" />
            ))}
          </div>
        </div>

        {/* 상단 헤더 — 너비 표시 + 닫기 버튼 */}
        <div className="flex items-center justify-between border-b px-6 py-2.5 shrink-0 bg-muted/30">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {Math.round(panelWidth)}px
          </span>
          <div className="flex items-center gap-1">
            {/* 너비 프리셋 버튼 */}
            {[600, 800, 1000, 1200].map(w => (
              <button
                key={w}
                onClick={() => setPanelWidth(w)}
                className={[
                  'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                  Math.abs(panelWidth - w) < 50
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {w}px
              </button>
            ))}
            <button
              onClick={() => { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
              className="ml-2 rounded p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="닫기 (ESC)"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* 스크롤 가능한 콘텐츠 */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedPO && (
            <PODetailView
              po={selectedPO}
              onBack={() => { setSelectedPO(null); reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
              onReload={() => { reloadPO(); reloadPoList(); setLcAggVersion(v => v + 1); }}
              allPos={pos}
            />
          )}
        </div>
      </div>
    </div>
  );
}
