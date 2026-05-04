import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { SortingState } from '@tanstack/react-table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { useAppStore } from '@/stores/appStore';
import { useOutboundList, useOutboundSummary, useSaleList } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import SkeletonRows from '@/components/common/SkeletonRows';
import OutboundListTable, { OUTBOUND_TABLE_ID, OUTBOUND_COLUMN_META } from '@/components/outbound/OutboundListTable';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import SaleListTable, { SALE_TABLE_ID, SALE_COLUMN_META } from '@/components/outbound/SaleListTable';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterButton, FilterChips, RailBlock, type DateRangeValue } from '@/components/command/MockupPrimitives';
import type { SaleListItem } from '@/types/outbound';
import {
  OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL,
  type OutboundStatus, type UsageCategory,
} from '@/types/outbound';
import type { Partner } from '@/types/masters';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

// 출고 테이블 기본 페이지 사이즈. 100 으로 잡으면 한 화면에 적당히 보이고 페이지 호출 횟수도 줄어든다.
const OUTBOUND_PAGE_SIZE = 100;
// 검색어 입력 디바운스 — 타이핑 중 매 키스트로크마다 백엔드 호출하지 않게 350ms 지연.
const SEARCH_DEBOUNCE_MS = 350;

export default function OutboundPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const [statusFilter, setStatusFilter] = useState('');
  const [usageFilter, setUsageFilter] = useState('');
  const [mfgFilter, setMfgFilter] = useState('');
  const [selectedOutbound, setSelectedOutbound] = useState<string | null>(null);
  const outboundColVis = useColumnVisibility(OUTBOUND_TABLE_ID, OUTBOUND_COLUMN_META);
  const outboundColPin = useColumnPinning(OUTBOUND_TABLE_ID);
  const saleColVis = useColumnVisibility(SALE_TABLE_ID, SALE_COLUMN_META);
  const saleColPin = useColumnPinning(SALE_TABLE_ID);
  const [activeTab, setActiveTab] = useState<'outbound' | 'sales'>('outbound');
  const [searchText, setSearchText] = useState('');
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());
  const [bulkInvoiceOpen, setBulkInvoiceOpen] = useState(false);
  const [bulkInvoiceDate, setBulkInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bulkInvoiceSubmitting, setBulkInvoiceSubmitting] = useState(false);
  const _loc = useLocation();
  // R1-1: 사이드바 "출고/판매" 클릭 시 목록 복귀 — URL → 상태 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedOutbound(null); }, [_loc.key]);

  const [customerFilter, setCustomerFilter] = useState('');
  const [saleDateRange, setSaleDateRange] = useState<DateRangeValue>(null);
  const [invoiceFilter, setInvoiceFilter] = useState('');

  const manufacturers = useAppStore((s) => s.manufacturers);
  const loadManufacturers = useAppStore((s) => s.loadManufacturers);
  const [partners, setPartners] = useState<Partner[]>([]);

  // ─── 출고 — 서버사이드 페이지·검색·정렬 상태 ────────────────────────────
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(OUTBOUND_PAGE_SIZE);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'outbound_date', desc: true }]);
  // 입력 중인 검색어와 디바운스된 서버 쿼리어 분리 — 타이핑마다 호출 안 함.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    if (activeTab !== 'outbound') return;
    const t = setTimeout(() => setDebouncedSearch(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText, activeTab]);

  // 필터/검색 변경 시 페이지를 0 으로 리셋 — autoResetPageIndex 가 server 모드에서 비활성이라 직접 처리.
  useEffect(() => {
    setPageIndex(0);
  }, [statusFilter, usageFilter, mfgFilter, debouncedSearch]);

  const sortKey = sorting[0]?.id;
  const sortOrder: 'asc' | 'desc' = sorting[0]?.desc === false ? 'asc' : 'desc';

  const {
    items: outbounds,
    totalCount: outboundsTotal,
    loading: obLoading,
    reload: reloadOutbounds,
  } = useOutboundList({
    status: statusFilter || undefined,
    usage_category: usageFilter || undefined,
    manufacturer_id: mfgFilter || undefined,
    q: debouncedSearch || undefined,
    sort: sortKey || undefined,
    order: sortKey ? sortOrder : undefined,
    pageIndex,
    pageSize,
  });

  const { summary } = useOutboundSummary({
    status: statusFilter || undefined,
    usage_category: usageFilter || undefined,
    manufacturer_id: mfgFilter || undefined,
    q: debouncedSearch || undefined,
  });

  // 매출 탭은 Phase 2 범위 외 — 기존 클라이언트 필터 그대로 유지.
  const { data: allSales, loading: saleLoading, reload: reloadSales } = useSaleList();
  const sales = useMemo(() => allSales.filter((s) => {
    if (customerFilter && s.customer_id !== customerFilter) return false
    const taxDate = s.tax_invoice_date ?? s.sale?.tax_invoice_date ?? null
    if (saleDateRange) {
      if (!taxDate) return false
      if (taxDate < saleDateRange.start || taxDate > saleDateRange.end) return false
    }
    if (invoiceFilter === 'issued' && !taxDate) return false
    if (invoiceFilter === 'pending' && taxDate) return false
    return true
  }), [allSales, customerFilter, saleDateRange, invoiceFilter]);

  useEffect(() => {
    loadManufacturers();
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
  }, [loadManufacturers]);

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  const isSalePending = (item: SaleListItem) =>
    !(item.tax_invoice_date ?? item.sale?.tax_invoice_date);

  const selectedPendingSales = sales.filter((sale) => selectedSaleIds.has(sale.sale_id) && isSalePending(sale));

  const handleBulkInvoice = async () => {
    if (selectedPendingSales.length === 0) return;
    setBulkInvoiceSubmitting(true);
    const results = await Promise.allSettled(
      selectedPendingSales.map((item) =>
        fetchWithAuth(`/api/v1/sales/${item.sale_id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...item.sale, tax_invoice_date: bulkInvoiceDate }),
        })
      )
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    setBulkInvoiceSubmitting(false);
    if (failed === 0) {
      notify.success(`계산서 ${ok}건 발행 완료`);
    } else if (ok === 0) {
      notify.error(`계산서 발행 실패 — ${failed}건 모두 실패`);
    } else {
      notify.warning(`계산서 ${ok}건 발행 / ${failed}건 실패`);
    }
    setBulkInvoiceOpen(false);
    setSelectedSaleIds(new Set());
    reloadSales();
  };

  // 필터 라벨 계산 (한글 표시 보장)
  const statusLabel = statusFilter ? (OUTBOUND_STATUS_LABEL[statusFilter as OutboundStatus] ?? statusFilter) : '전체 상태';
  const usageLabel = usageFilter ? ((USAGE_CATEGORY_LABEL as Record<string, string>)[usageFilter] ?? usageFilter) : '전체 용도';
  const mfgLabel = mfgFilter ? (manufacturers.find(m => m.manufacturer_id === mfgFilter)?.name_kr ?? mfgFilter) : '전체 제조사';
  const invoiceLabel = invoiceFilter === 'issued' ? '계산서 발행' : invoiceFilter === 'pending' ? '계산서 미발행' : '전체';
  // 출고 KPI 는 서버 집계(useOutboundSummary) 사용 — summary 가 아직 안 왔으면 0 으로 표기.
  const totalOutbounds = summary?.total ?? outboundsTotal;
  const activeCount = summary?.active_count ?? 0;
  const cancelPendingCount = summary?.cancel_pending_count ?? 0;
  const outboundSaleTotal = summary?.sale_amount_sum ?? 0;
  const outboundPendingInvoiceCount = summary?.invoice_pending_count ?? 0;
  // 매출 탭 KPI 는 클라이언트 합계 그대로.
  const saleTotal = sales.reduce((sum, sale) => sum + (sale.supply_amount ?? sale.sale?.supply_amount ?? 0), 0);
  const pendingInvoiceCount = sales.filter((sale) => !(sale.tax_invoice_date ?? sale.sale?.tax_invoice_date)).length;
  // 최근 출고는 첫 페이지 + outbound_date desc 기본 정렬일 때 자연스럽게 최근 4건.
  const recentOutbounds = pageIndex === 0 ? outbounds.slice(0, 4) : [];

  const searchPlaceholder = activeTab === 'outbound' ? '품번/품명/현장/창고/수주번호/ERP번호 검색' : '거래처/품명 검색';
  const outboundCardControls = (
    <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-64 rounded-md border border-input bg-background pl-7 pr-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/45"
        />
      </div>
      {activeTab === 'outbound' ? (
        <>
          <FilterButton items={[
            {
              label: '상태',
              value: statusFilter,
              onChange: setStatusFilter,
              options: (Object.entries(OUTBOUND_STATUS_LABEL) as [OutboundStatus, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '용도',
              value: usageFilter,
              onChange: setUsageFilter,
              options: (Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              label: '제조사',
              value: mfgFilter,
              onChange: setMfgFilter,
              options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
            },
          ]} />
          <ExcelToolbar type="outbound" />
        </>
      ) : (
        <>
          <FilterButton items={[
            {
              label: '거래처',
              value: customerFilter,
              onChange: setCustomerFilter,
              options: partners.map((p) => ({ value: p.partner_id, label: p.partner_name })),
            },
            {
              kind: 'date_range',
              label: '기간',
              value: saleDateRange,
              onChange: setSaleDateRange,
            },
            {
              label: '계산서',
              value: invoiceFilter,
              onChange: setInvoiceFilter,
              options: [
                { value: 'issued', label: '발행' },
                { value: 'pending', label: '미발행' },
              ],
            },
          ]} />
          <ExcelToolbar type="sale" />
        </>
      )}
      <div style={{ flex: 1 }} />
      <FilterChips
        options={[
          { key: 'outbound', label: '출고 관리', count: totalOutbounds },
          { key: 'sales', label: '매출 현황', count: sales.length },
        ]}
        value={activeTab}
        onChange={(value) => { setActiveTab(value as 'outbound' | 'sales'); setSearchText(''); setSelectedSaleIds(new Set()); }}
      />
    </div>
  );

  return (
    <>
      <div className={selectedOutbound ? 'hidden' : 'contents'}>
      <MasterConsole
        eyebrow="FULFILLMENT"
        title="출고/판매"
        description="출고 진행과 매출·계산서 상태를 같은 운영 화면에서 확인합니다."
        tableTitle={activeTab === 'outbound' ? '출고 관리' : '매출 현황'}
        tableSub={activeTab === 'outbound' ? `${totalOutbounds.toLocaleString()}건 · ${statusLabel}` : `${sales.length.toLocaleString()}건 · ${invoiceLabel}`}
        toolbar={outboundCardControls}
        metrics={activeTab === 'outbound' ? [
          { label: '출고 건수', value: totalOutbounds.toLocaleString(), sub: statusLabel, tone: 'solar', spark: [14, 18, 16, 23, totalOutbounds || 1] },
          { label: '정상 출고', value: activeCount.toLocaleString(), sub: usageLabel, tone: 'pos' },
          { label: '취소 대기', value: cancelPendingCount.toLocaleString(), sub: mfgLabel, tone: cancelPendingCount > 0 ? 'warn' : 'info' },
          { label: '매출 합계', value: (outboundSaleTotal / 100_000_000).toFixed(2), unit: '억', sub: `${outboundPendingInvoiceCount}건 계산서 대기`, tone: outboundPendingInvoiceCount > 0 ? 'warn' : 'ink' },
        ] : [
          { label: '출고 건수', value: totalOutbounds.toLocaleString(), sub: statusLabel, tone: 'solar', spark: [14, 18, 16, 23, totalOutbounds || 1] },
          { label: '정상 출고', value: activeCount.toLocaleString(), sub: usageLabel, tone: 'pos' },
          { label: '취소 대기', value: cancelPendingCount.toLocaleString(), sub: mfgLabel, tone: cancelPendingCount > 0 ? 'warn' : 'info' },
          { label: '매출 합계', value: (saleTotal / 100_000_000).toFixed(2), unit: '억', sub: `${pendingInvoiceCount}건 계산서 대기`, tone: pendingInvoiceCount > 0 ? 'warn' : 'ink' },
        ]}
        rail={
          <>
            <RailBlock title="최근 출고" accent="var(--solar-3)" count={recentOutbounds.length}>
              <div className="space-y-2">
                {recentOutbounds.map((outbound) => (
                  <div key={outbound.outbound_id} className="rounded border border-[var(--line)] bg-[var(--bg-2)] px-2.5 py-2">
                    <div className="truncate text-[12px] font-semibold text-[var(--ink)]">{outbound.erp_outbound_no ?? outbound.order_number ?? outbound.outbound_id.slice(0, 8)}</div>
                    <div className="mono mt-1 text-[10px] text-[var(--ink-4)]">{OUTBOUND_STATUS_LABEL[outbound.status] ?? outbound.status} · {outbound.quantity?.toLocaleString?.() ?? 0}장</div>
                  </div>
                ))}
              </div>
            </RailBlock>
            <RailBlock title="필터 상태" count={activeTab === 'outbound' ? statusLabel : invoiceLabel}>
              <div className="text-[11px] leading-5 text-[var(--ink-3)]">
                출고 필터와 매출 필터는 탭별로 유지되어 빠르게 왕복할 수 있습니다.
              </div>
            </RailBlock>
          </>
        }
      >
        <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as 'outbound' | 'sales'); setSearchText(''); setSelectedSaleIds(new Set()); }}>

        <TabsContent value="outbound" className="space-y-4 mt-4">
          {obLoading ? <SkeletonRows rows={6} /> : (
            <OutboundListTable
              items={outbounds}
              hidden={outboundColVis.hidden}
              pinning={outboundColPin.pinning}
              onPinningChange={outboundColPin.setPinning}
              onSelect={(ob) => setSelectedOutbound(ob.outbound_id)}
              serverMode={{
                pageIndex,
                pageSize,
                totalRowCount: outboundsTotal,
                onPageChange: ({ pageIndex: nextIdx, pageSize: nextSize }) => {
                  setPageIndex(nextIdx);
                  setPageSize(nextSize);
                },
                sorting,
                onSortingChange: setSorting,
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="sales" className="space-y-4 mt-4">
          {saleLoading ? <SkeletonRows rows={6} /> : (
            <>
              <SaleSummaryCards items={sales} />
              {selectedSaleIds.size > 0 && (
                <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <span className="font-medium">{selectedSaleIds.size}건 선택됨</span>
                  <span className="text-xs text-muted-foreground">
                    (발행 가능 {selectedPendingSales.length}건 / 이미 발행됨 {selectedSaleIds.size - selectedPendingSales.length}건)
                  </span>
                  <div className="flex-1" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedSaleIds(new Set())}>선택 해제</Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={selectedPendingSales.length === 0}
                    onClick={() => setBulkInvoiceOpen(true)}
                  >
                    계산서 일괄 발행
                  </Button>
                </div>
              )}
              <SaleListTable
                items={sales}
                hidden={saleColVis.hidden}
                pinning={saleColPin.pinning}
                onPinningChange={saleColPin.setPinning}
                globalFilter={searchText}
                selectedIds={selectedSaleIds}
                onSelectedIdsChange={setSelectedSaleIds}
                isRowSelectable={isSalePending}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
      </MasterConsole>
      </div>

      {selectedOutbound && (
        <div className="p-6">
          <OutboundDetailView
            outboundId={selectedOutbound}
            onBack={() => { setSelectedOutbound(null); reloadOutbounds(); reloadSales(); }}
          />
        </div>
      )}

      <Dialog open={bulkInvoiceOpen} onOpenChange={setBulkInvoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>계산서 일괄 발행</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              미발행 매출 <b>{selectedPendingSales.length}</b>건에 동일 발행일을 적용합니다.
            </p>
            <div className="space-y-1.5">
              <Label>발행일 *</Label>
              <DateInput value={bulkInvoiceDate} onChange={setBulkInvoiceDate} />
            </div>
            {selectedPendingSales.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded border bg-muted/30 px-2 py-1 text-xs">
                {selectedPendingSales.slice(0, 8).map((item) => (
                  <div key={item.sale_id} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate">{item.sale.customer_name ?? '—'} · {item.product_name ?? '—'}</span>
                    <span className="tabular-nums shrink-0">{(item.sale.total_amount ?? 0).toLocaleString('ko-KR')}원</span>
                  </div>
                ))}
                {selectedPendingSales.length > 8 && (
                  <div className="pt-1 text-muted-foreground">…외 {selectedPendingSales.length - 8}건</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkInvoiceOpen(false)}>취소</Button>
            <Button
              type="button"
              disabled={bulkInvoiceSubmitting || !bulkInvoiceDate || selectedPendingSales.length === 0}
              onClick={handleBulkInvoice}
            >
              {bulkInvoiceSubmitting ? '발행 중...' : `${selectedPendingSales.length}건 발행`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
