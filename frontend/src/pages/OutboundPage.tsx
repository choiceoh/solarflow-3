import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useOutboundList, useSaleList } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import OutboundListTable from '@/components/outbound/OutboundListTable';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import OutboundForm from '@/components/outbound/OutboundForm';
import SaleListTable from '@/components/outbound/SaleListTable';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
import { MasterConsole } from '@/components/command/MasterConsole';
import { FilterChips, RailBlock } from '@/components/command/MockupPrimitives';
import {
  OUTBOUND_STATUS_LABEL, USAGE_CATEGORY_LABEL,
  type OutboundStatus, type UsageCategory,
} from '@/types/outbound';
import type { Manufacturer, Partner } from '@/types/masters';
import ExcelToolbar from '@/components/excel/ExcelToolbar';

function FilterText({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}

export default function OutboundPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const [statusFilter, setStatusFilter] = useState('');
  const [usageFilter, setUsageFilter] = useState('');
  const [mfgFilter, setMfgFilter] = useState('');
  const [selectedOutbound, setSelectedOutbound] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'outbound' | 'sales'>('outbound');
  const _loc = useLocation();
  // R1-1: 사이드바 "출고/판매" 클릭 시 목록 복귀 — URL → 상태 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedOutbound(null); }, [_loc.key]);
  const [formOpen, setFormOpen] = useState(false);

  const [customerFilter, setCustomerFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('');

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
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
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
  }, []);

  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 상단에서 법인을 선택해주세요</p>
      </div>
    );
  }

  if (selectedOutbound) {
    return (
      <div className="p-6">
        <OutboundDetailView
          outboundId={selectedOutbound}
          onBack={() => { setSelectedOutbound(null); reloadOutbounds(); reloadSales(); }}
        />
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
  const customerLabel = customerFilter ? (partners.find(p => p.partner_id === customerFilter)?.partner_name ?? customerFilter) : '전체 거래처';
  const monthLabel = monthFilter || '전체 기간';
  const invoiceLabel = invoiceFilter === 'issued' ? '계산서 발행' : invoiceFilter === 'pending' ? '계산서 미발행' : '전체';
  const activeCount = outbounds.filter((outbound) => outbound.status === 'active').length;
  const cancelPendingCount = outbounds.filter((outbound) => outbound.status === 'cancel_pending').length;
  const saleTotal = sales.reduce((sum, sale) => sum + (sale.supply_amount ?? sale.sale?.supply_amount ?? 0), 0);
  const pendingInvoiceCount = sales.filter((sale) => !(sale.tax_invoice_date ?? sale.sale?.tax_invoice_date)).length;
  const recentOutbounds = outbounds.slice(0, 4);

  return (
    <>
      <MasterConsole
        eyebrow="FULFILLMENT"
        title="출고/판매"
        description="출고 진행과 매출·계산서 상태를 같은 운영 화면에서 확인합니다."
        tableTitle={activeTab === 'outbound' ? '출고 관리' : '매출 현황'}
        tableSub={activeTab === 'outbound' ? `${outbounds.length.toLocaleString()}건 · ${statusLabel}` : `${sales.length.toLocaleString()}건 · ${invoiceLabel}`}
        actions={
          <>
            {activeTab === 'outbound' ? <ExcelToolbar type="outbound" /> : <ExcelToolbar type="sale" />}
            {activeTab === 'outbound' ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />새로 등록
              </Button>
            ) : null}
          </>
        }
        toolbar={
          <FilterChips
            options={[
              { key: 'outbound', label: '출고 관리', count: outbounds.length },
              { key: 'sales', label: '매출 현황', count: sales.length },
            ]}
            value={activeTab}
            onChange={(value) => setActiveTab(value as 'outbound' | 'sales')}
          />
        }
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
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'outbound' | 'sales')}>

        <TabsContent value="outbound" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><FilterText text={statusLabel} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {(Object.entries(OUTBOUND_STATUS_LABEL) as [OutboundStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={usageFilter || 'all'} onValueChange={(v) => setUsageFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs"><FilterText text={usageLabel} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 용도</SelectItem>
                  {(Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={mfgFilter || 'all'} onValueChange={(v) => setMfgFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-32 text-xs"><FilterText text={mfgLabel} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 제조사</SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {obLoading ? <LoadingSpinner /> : (
            <OutboundListTable
              items={outbounds}
              onSelect={(ob) => setSelectedOutbound(ob.outbound_id)}
              onNew={() => setFormOpen(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
            <Select value={customerFilter || 'all'} onValueChange={(v) => setCustomerFilter(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-36 text-xs"><FilterText text={customerLabel} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 거래처</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter || 'all'} onValueChange={(v) => setMonthFilter(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-28 text-xs"><FilterText text={monthLabel} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 기간</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={invoiceFilter || 'all'} onValueChange={(v) => setInvoiceFilter(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-32 text-xs"><FilterText text={invoiceLabel} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="issued">계산서 발행</SelectItem>
                <SelectItem value="pending">계산서 미발행</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ExcelToolbar type="sale" />
          </div>

          {saleLoading ? <LoadingSpinner /> : (
            <>
              <SaleSummaryCards items={sales} />
              <SaleListTable items={sales} />
            </>
          )}
        </TabsContent>
      </Tabs>
      </MasterConsole>

      <OutboundForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </>
  );
}
