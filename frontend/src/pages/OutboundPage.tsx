import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useOutboundList, useSaleList } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import SkeletonRows from '@/components/common/SkeletonRows';
import OutboundListTable, { OUTBOUND_TABLE_ID, OUTBOUND_COLUMN_META } from '@/components/outbound/OutboundListTable';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useColumnPinning } from '@/lib/columnPinning';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import OutboundForm from '@/components/outbound/OutboundForm';
import SaleListTable, { SALE_TABLE_ID, SALE_COLUMN_META } from '@/components/outbound/SaleListTable';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterButton, FilterChips, RailBlock } from '@/components/command/MockupPrimitives';
import {
  OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL,
  type OutboundStatus, type UsageCategory,
} from '@/types/outbound';
import type { Partner } from '@/types/masters';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

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
  const _loc = useLocation();
  // R1-1: 사이드바 "출고/판매" 클릭 시 목록 복귀 — URL → 상태 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedOutbound(null); }, [_loc.key]);
  const [formOpen, setFormOpen] = useState(false);

  const [customerFilter, setCustomerFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('');

  const manufacturers = useAppStore((s) => s.manufacturers);
  const loadManufacturers = useAppStore((s) => s.loadManufacturers);
  const [partners, setPartners] = useState<Partner[]>([]);

  const outboundFilters: { status?: string; usage_category?: string; manufacturer_id?: string } = {};
  if (statusFilter) outboundFilters.status = statusFilter;
  if (usageFilter) outboundFilters.usage_category = usageFilter;
  if (mfgFilter) outboundFilters.manufacturer_id = mfgFilter;

  const saleFilters: { customer_id?: string; month?: string; invoice_status?: string } = {};
  if (customerFilter) saleFilters.customer_id = customerFilter;
  if (monthFilter) saleFilters.month = monthFilter;
  if (invoiceFilter) saleFilters.invoice_status = invoiceFilter;

  const { data: outbounds, loading: obLoading, reload: reloadOutbounds } = useOutboundList(outboundFilters);
  const { data: sales, loading: saleLoading, reload: reloadSales } = useSaleList(saleFilters);

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


  const handleCreate = async (formData: Record<string, unknown>) => {
    await fetchWithAuth('/api/v1/outbounds', { method: 'POST', body: JSON.stringify(formData) });
    reloadOutbounds();
  };

  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  // 필터 라벨 계산 (한글 표시 보장)
  const statusLabel = statusFilter ? (OUTBOUND_STATUS_LABEL[statusFilter as OutboundStatus] ?? statusFilter) : '전체 상태';
  const usageLabel = usageFilter ? ((USAGE_CATEGORY_LABEL as Record<string, string>)[usageFilter] ?? usageFilter) : '전체 용도';
  const mfgLabel = mfgFilter ? (manufacturers.find(m => m.manufacturer_id === mfgFilter)?.name_kr ?? mfgFilter) : '전체 제조사';
  const invoiceLabel = invoiceFilter === 'issued' ? '계산서 발행' : invoiceFilter === 'pending' ? '계산서 미발행' : '전체';
  const activeCount = outbounds.filter((outbound) => outbound.status === 'active').length;
  const cancelPendingCount = outbounds.filter((outbound) => outbound.status === 'cancel_pending').length;
  const saleTotal = sales.reduce((sum, sale) => sum + (sale.supply_amount ?? sale.sale?.supply_amount ?? 0), 0);
  const pendingInvoiceCount = sales.filter((sale) => !(sale.tax_invoice_date ?? sale.sale?.tax_invoice_date)).length;
  const recentOutbounds = outbounds.slice(0, 4);

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
          <ExcelToolbar type="outbound" onNew={() => setFormOpen(true)} />
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
              label: '기간',
              value: monthFilter,
              onChange: setMonthFilter,
              options: months.map((m) => ({ value: m, label: m })),
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
          { key: 'outbound', label: '출고 관리', count: outbounds.length },
          { key: 'sales', label: '매출 현황', count: sales.length },
        ]}
        value={activeTab}
        onChange={(value) => { setActiveTab(value as 'outbound' | 'sales'); setSearchText(''); }}
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
        tableSub={activeTab === 'outbound' ? `${outbounds.length.toLocaleString()}건 · ${statusLabel}` : `${sales.length.toLocaleString()}건 · ${invoiceLabel}`}
        toolbar={outboundCardControls}
        metrics={[
          { label: '출고 건수', value: outbounds.length.toLocaleString(), sub: statusLabel, tone: 'solar', spark: [14, 18, 16, 23, outbounds.length || 1] },
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
        <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as 'outbound' | 'sales'); setSearchText(''); }}>

        <TabsContent value="outbound" className="space-y-4 mt-4">
          {obLoading ? <SkeletonRows rows={6} /> : (
            <OutboundListTable
              items={outbounds}
              hidden={outboundColVis.hidden}
              pinning={outboundColPin.pinning}
              onPinningChange={outboundColPin.setPinning}
              onSelect={(ob) => setSelectedOutbound(ob.outbound_id)}
              onNew={() => setFormOpen(true)}
              globalFilter={searchText}
            />
          )}
        </TabsContent>

        <TabsContent value="sales" className="space-y-4 mt-4">
          {saleLoading ? <SkeletonRows rows={6} /> : (
            <>
              <SaleSummaryCards items={sales} />
              <SaleListTable items={sales} hidden={saleColVis.hidden} pinning={saleColPin.pinning} onPinningChange={saleColPin.setPinning} globalFilter={searchText} />
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

      <OutboundForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </>
  );
}
