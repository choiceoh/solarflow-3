import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Truck, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppStore } from '@/stores/appStore';
import { useOutboundList, useSaleList } from '@/hooks/useOutbound';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import OutboundListTable from '@/components/outbound/OutboundListTable';
import OutboundDetailView from '@/components/outbound/OutboundDetailView';
import OutboundForm from '@/components/outbound/OutboundForm';
import SaleListTable from '@/components/outbound/SaleListTable';
import SaleSummaryCards from '@/components/outbound/SaleSummaryCards';
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

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">출고/판매</h1>

      <Tabs defaultValue="outbound">
        <TabsList>
          <TabsTrigger value="outbound"><Truck className="h-3.5 w-3.5" />출고 관리</TabsTrigger>
          <TabsTrigger value="sales"><TrendingUp className="h-3.5 w-3.5" />매출 현황</TabsTrigger>
        </TabsList>

        <TabsContent value="outbound" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
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
            <div className="flex items-center gap-2">
              <ExcelToolbar type="outbound" />
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />새로 등록
              </Button>
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
          <div className="flex items-center justify-between">
          <div className="flex gap-2">
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

      <OutboundForm open={formOpen} onOpenChange={setFormOpen} onSubmit={handleCreate} />
    </div>
  );
}
