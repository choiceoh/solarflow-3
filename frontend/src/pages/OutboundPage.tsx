import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export default function OutboundPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  // 탭 1 필터
  const [statusFilter, setStatusFilter] = useState('');
  const [usageFilter, setUsageFilter] = useState('');
  const [mfgFilter, setMfgFilter] = useState('');
  const [selectedOutbound, setSelectedOutbound] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // 탭 2 필터
  const [customerFilter, setCustomerFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('');

  // 마스터 데이터
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

  // 상세 보기
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

  // 월 목록 (최근 12개월)
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">출고/판매</h1>

      <Tabs defaultValue="outbound">
        <TabsList>
          <TabsTrigger value="outbound">출고 관리</TabsTrigger>
          <TabsTrigger value="sales">매출 현황</TabsTrigger>
        </TabsList>

        {/* 탭 1: 출고 관리 */}
        <TabsContent value="outbound" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="상태" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {(Object.entries(OUTBOUND_STATUS_LABEL) as [OutboundStatus, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={usageFilter || 'all'} onValueChange={(v) => setUsageFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="용도" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 용도</SelectItem>
                  {(Object.entries(USAGE_CATEGORY_LABEL) as [UsageCategory, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={mfgFilter || 'all'} onValueChange={(v) => setMfgFilter(v === 'all' ? '' : (v ?? ''))}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="제조사" /></SelectTrigger>
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

        {/* 탭 2: 매출 현황 */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Select value={customerFilter || 'all'} onValueChange={(v) => setCustomerFilter(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="거래처" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 거래처</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={monthFilter || 'all'} onValueChange={(v) => setMonthFilter(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="월" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 기간</SelectItem>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={invoiceFilter || 'all'} onValueChange={(v) => setInvoiceFilter(v === 'all' ? '' : (v ?? ''))}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="계산서상태" /></SelectTrigger>
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
