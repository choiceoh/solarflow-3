import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, PackageX, PackageCheck, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import AllocationForm, { type InventoryAllocation } from '@/components/inventory/AllocationForm';

function FT({ text }: { text: string }) {
  return <span className="flex flex-1 text-left truncate" data-slot="select-value">{text}</span>;
}
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useInventory } from '@/hooks/useInventory';
import { useForecast } from '@/hooks/useForecast';
import { fetchWithAuth } from '@/lib/api';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import InventorySummaryCards from '@/components/inventory/InventorySummaryCards';
import InventoryTable from '@/components/inventory/InventoryTable';
import AvailInventoryTable from '@/components/inventory/AvailInventoryTable';
import IncomingTable from '@/components/inventory/IncomingTable';
import ForecastTable from '@/components/inventory/ForecastTable';
import type { Manufacturer } from '@/types/masters';
import type { InventorySummary } from '@/types/inventory';


export default function InventoryPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const location = useLocation();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [mfgFilter, setMfgFilter] = useState<string>('');
  const [wpFilter, setWpFilter] = useState<string>('');

  // 가용재고 배정
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [allocFormOpen, setAllocFormOpen] = useState(false);
  const [prefilledProductId, setPrefilledProductId] = useState<string | undefined>();
  const [editingAlloc, setEditingAlloc] = useState<InventoryAllocation | undefined>();

  // 미착품 처리 다이얼로그 (group_id 기반 연관 incoming alloc 처리)
  const [incomingDialog, setIncomingDialog] = useState<{
    open: boolean;
    stockAlloc: InventoryAllocation | null;   // 확정하려는 현재고 배정
    incomingAlloc: InventoryAllocation | null; // 연관된 미착품 배정
  }>({ open: false, stockAlloc: null, incomingAlloc: null });

  // 단가 맵 (product_id → price/Wp) — AllocationForm에 전달
  const [priceMap, setPriceMap] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const url = selectedCompanyId && selectedCompanyId !== 'all'
      ? `/api/v1/price-histories?company_id=${selectedCompanyId}`
      : `/api/v1/price-histories`;
    fetchWithAuth<{ product_id: string; new_price: number; change_date: string }[]>(url)
      .then((list) => {
        const sorted = [...list].sort((a, b) => b.change_date.localeCompare(a.change_date));
        const m = new Map<string, number>();
        for (const ph of sorted) { if (!m.has(ph.product_id)) m.set(ph.product_id, ph.new_price); }
        setPriceMap(m);
      })
      .catch(() => {});
  }, [selectedCompanyId]);

  const fetchAllocations = useCallback(() => {
    if (!selectedCompanyId) return;
    // 'all' 이면 company_id 파라미터 없이 전체 조회, 특정 법인이면 필터링
    const companyParam = selectedCompanyId !== 'all' ? `&company_id=${selectedCompanyId}` : '';
    // pending + hold 모두 조회 (보류 건도 목록에 표시)
    Promise.all([
      fetchWithAuth<InventoryAllocation[]>(`/api/v1/inventory/allocations?status=pending${companyParam}`),
      fetchWithAuth<InventoryAllocation[]>(`/api/v1/inventory/allocations?status=hold${companyParam}`),
    ]).then(([pending, hold]) => setAllocations([...pending, ...hold]))
      .catch(() => {});
  }, [selectedCompanyId]);

  // location.key가 바뀔 때마다 (다른 메뉴→재고로 돌아올 때) 배정 목록 갱신
  useEffect(() => { fetchAllocations(); }, [fetchAllocations, location.key]);

  // 수주 등록 페이지 이동 헬퍼
  const navigateToOrder = (alloc: InventoryAllocation, linkedAllocId?: string) => {
    const params = new URLSearchParams({
      new: '1',
      alloc_id: alloc.alloc_id,
      product_id: alloc.product_id,
      qty: String(alloc.quantity),
      purpose: alloc.purpose,
      source_type: alloc.source_type,
    });
    if (alloc.customer_name) params.set('customer', alloc.customer_name);
    if (alloc.site_name)     params.set('site', alloc.site_name);
    if (alloc.notes) {
      const m = alloc.notes.match(/^\[발주번호:([^\]]+)\]/);
      if (m) params.set('order_no', m[1]);
    }
    if (linkedAllocId) params.set('linked_alloc_id', linkedAllocId);
    window.location.href = `/orders?${params.toString()}`;
  };

  // 확정 → 수주 등록 페이지로 pre-fill 이동
  // group_id가 있으면 연관 미착품 배정 탐색 → 처리 선택 다이얼로그 표시
  const handleConfirmAlloc = async (alloc: InventoryAllocation) => {
    // 현재고 배정 + group_id가 있는 경우: 연관 미착품 확인
    if (alloc.source_type === 'stock' && alloc.group_id) {
      try {
        const related = await fetchWithAuth<InventoryAllocation[]>(
          `/api/v1/inventory/allocations?company_id=${alloc.company_id}&group_id=${alloc.group_id}`
        );
        const linkedIncoming = related.find(
          (r) => r.alloc_id !== alloc.alloc_id &&
                 r.source_type === 'incoming' &&
                 (r.status === 'pending' || r.status === 'hold')
        );
        if (linkedIncoming) {
          setIncomingDialog({ open: true, stockAlloc: alloc, incomingAlloc: linkedIncoming });
          return;
        }
      } catch {
        // 조회 실패 시 무시하고 기존 흐름대로 진행
      }
    }
    // group_id 없거나 연관 미착품 없음 → 바로 수주 등록 이동
    if (!confirm('수주 등록 페이지로 이동합니다.\n예약 정보가 자동으로 입력됩니다.')) return;
    navigateToOrder(alloc);
  };

  // 미착품 다이얼로그: "수주에 포함" 선택
  const handleIncomingInclude = () => {
    const { stockAlloc, incomingAlloc } = incomingDialog;
    if (!stockAlloc || !incomingAlloc) return;
    setIncomingDialog({ open: false, stockAlloc: null, incomingAlloc: null });
    navigateToOrder(stockAlloc, incomingAlloc.alloc_id);
  };

  // 미착품 다이얼로그: "보류" 선택 → incoming을 hold로, stock만 수주 등록
  const handleIncomingHold = async () => {
    const { stockAlloc, incomingAlloc } = incomingDialog;
    if (!stockAlloc || !incomingAlloc) return;
    setIncomingDialog({ open: false, stockAlloc: null, incomingAlloc: null });
    await fetchWithAuth(`/api/v1/inventory/allocations/${incomingAlloc.alloc_id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'hold' }),
    }).catch(() => {});
    fetchAllocations();
    reloadInv();
    navigateToOrder(stockAlloc);
  };

  // 미착품 다이얼로그: "삭제" 선택 → incoming 삭제, stock만 수주 등록
  const handleIncomingDelete = async () => {
    const { stockAlloc, incomingAlloc } = incomingDialog;
    if (!stockAlloc || !incomingAlloc) return;
    if (!confirm('미착품 배정을 삭제합니다. 계속할까요?')) return;
    setIncomingDialog({ open: false, stockAlloc: null, incomingAlloc: null });
    await fetchWithAuth(`/api/v1/inventory/allocations/${incomingAlloc.alloc_id}`, {
      method: 'DELETE',
    }).catch(() => {});
    fetchAllocations();
    reloadInv();
    navigateToOrder(stockAlloc);
  };

  // 보류 — pending → hold (가용재고 차감 해제)
  const handleHoldAlloc = async (allocId: string) => {
    await fetchWithAuth(`/api/v1/inventory/allocations/${allocId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'hold' }),
    }).catch(() => {});
    fetchAllocations();
    reloadInv();
  };

  // 보류 해제 — hold → pending (가용재고 다시 차감)
  const handleResumeAlloc = async (allocId: string) => {
    await fetchWithAuth(`/api/v1/inventory/allocations/${allocId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'pending' }),
    }).catch(() => {});
    fetchAllocations();
    reloadInv();
  };

  const handleDeleteAlloc = async (allocId: string) => {
    if (!confirm('삭제하면 복원할 수 없습니다. 삭제할까요?')) return;
    await fetchWithAuth(`/api/v1/inventory/allocations/${allocId}`, { method: 'DELETE' }).catch(() => {});
    fetchAllocations();
    reloadInv();
  };

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => {});
  }, []);

  const invOpts = mfgFilter ? { manufacturerId: mfgFilter } : {};
  const { data: rawInv, loading: invLoading, error: invError, reload: reloadInv } = useInventory(invOpts);
  const { data: fcData, loading: fcLoading, error: fcError } = useForecast(invOpts);

  // 제조사 선택 시 해당 제조사 재고의 규격(Wp) 목록 추출
  const availableWps = useMemo(() => {
    if (!rawInv || !mfgFilter) return [];
    const set = new Set<number>();
    rawInv.items.forEach((it) => { if (it.spec_wp) set.add(it.spec_wp); });
    return [...set].sort((a, b) => a - b);
  }, [rawInv, mfgFilter]);

  // 제조사 변경 시 규격 필터 초기화
  useEffect(() => { setWpFilter(''); }, [mfgFilter]);

  // product_id → { product_code, product_name, spec_wp, manufacturer_name } 맵 (배정 테이블 표시용)
  // rawInv는 필터 미적용 전체 목록이므로 항상 전체 품목 포함
  const productMap = useMemo(() => {
    const m = new Map<string, { product_code: string; product_name: string; spec_wp: number; manufacturer_name: string }>();
    rawInv?.items.forEach((it) => m.set(it.product_id, {
      product_code:      it.product_code,
      product_name:      it.product_name,
      spec_wp:           it.spec_wp,
      manufacturer_name: it.manufacturer_name,
    }));
    return m;
  }, [rawInv]);

  // 규격 필터 적용 — items 필터링 후 summary도 재계산
  const invData = useMemo(() => {
    if (!rawInv) return null;
    if (!wpFilter) return rawInv;
    const wp = parseFloat(wpFilter);
    const items = rawInv.items.filter((it) => it.spec_wp === wp);
    const summary: InventorySummary = {
      total_physical_kw:  items.reduce((s, it) => s + it.physical_kw,       0),
      total_available_kw: items.reduce((s, it) => s + it.available_kw,      0),
      total_incoming_kw:  items.reduce((s, it) => s + it.incoming_kw,       0),
      total_secured_kw:   items.reduce((s, it) => s + it.total_secured_kw,  0),
    };
    return { ...rawInv, items, summary };
  }, [rawInv, wpFilter]);

  // 제조사 필터 적용된 배정 목록
  const visibleAllocs = useMemo(() =>
    mfgFilter ? allocations.filter((a) => productMap.has(a.product_id)) : allocations,
  [mfgFilter, allocations, productMap]);


  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 사이드바에서 법인을 선택해주세요</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-lg font-semibold">재고 현황</h1>

      <Tabs defaultValue="avail">
        <TabsList>
          <TabsTrigger value="avail">가용재고</TabsTrigger>
          <TabsTrigger value="physical">실재고</TabsTrigger>
          <TabsTrigger value="incoming">미착품</TabsTrigger>
          <TabsTrigger value="forecast">수급 전망</TabsTrigger>
        </TabsList>
        <div className="flex gap-2 mt-3">
          <Select value={mfgFilter || 'all'} onValueChange={(v) => setMfgFilter(v === 'all' ? '' : (v ?? ''))}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <FT text={mfgFilter ? (manufacturers.find(m => m.manufacturer_id === mfgFilter)?.name_kr ?? '') : '제조사'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">제조사 (전체)</SelectItem>
              {manufacturers.map((m) => (
                <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={wpFilter || 'all'} onValueChange={(v) => setWpFilter(v === 'all' ? '' : (v ?? ''))}>
            <SelectTrigger className="h-8 w-28 text-xs" disabled={!mfgFilter}>
              <FT text={wpFilter ? `${wpFilter}Wp` : '규격'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">규격 (전체)</SelectItem>
              {availableWps.map((wp) => (
                <SelectItem key={wp} value={String(wp)}>{wp}Wp</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 실재고 탭 — 창고 보유 물리적 재고 */}
        <TabsContent value="physical">
          {invError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{invError}</AlertDescription>
            </Alert>
          )}
          {invLoading ? <LoadingSpinner /> : invData && (
            <div className="space-y-4">
              <InventorySummaryCards summary={invData.summary} items={invData.items} />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">품목별 실재고</h2>
                <InventoryTable items={invData.items} />
                <p className="text-[10px] text-muted-foreground text-right">계산 시점: {invData.calculated_at}</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* 가용재고 — 전체 너비 단일 테이블 (품목 행 클릭 시 배정 내역 펼침) */}
        <TabsContent value="avail">
          {invError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{invError}</AlertDescription>
            </Alert>
          )}

          {/* KPI 카드 */}
          {invLoading ? <LoadingSpinner /> : invData && (
            <InventorySummaryCards summary={invData.summary} items={invData.items} />
          )}

          {/* 품목별 가용재고 + 배정 현황 통합 테이블 */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">품목별 가용재고 / 배정 현황</h2>
              <Button
                size="sm"
                onClick={() => { setPrefilledProductId(undefined); setEditingAlloc(undefined); setAllocFormOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />사용 예약
              </Button>
            </div>
            {invLoading ? <LoadingSpinner /> : invData ? (
              <AvailInventoryTable
                items={invData.items}
                allocations={visibleAllocs}
                onNewAlloc={(productId) => { setPrefilledProductId(productId); setEditingAlloc(undefined); setAllocFormOpen(true); }}
                onEdit={(alloc) => { setEditingAlloc(alloc); setPrefilledProductId(undefined); setAllocFormOpen(true); }}
                onConfirm={handleConfirmAlloc}
                onHold={handleHoldAlloc}
                onResume={handleResumeAlloc}
                onDelete={handleDeleteAlloc}
              />
            ) : null}
            {invData && (
              <p className="text-[10px] text-muted-foreground text-right">
                기준: {invData.calculated_at}
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="incoming">
          {invError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{invError}</AlertDescription>
            </Alert>
          )}
          {invLoading ? <LoadingSpinner /> : invData && (
            <IncomingTable items={invData.items} summary={invData.summary} />
          )}
        </TabsContent>

        <TabsContent value="forecast">
          {fcError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{fcError}</AlertDescription>
            </Alert>
          )}
          {fcLoading ? <LoadingSpinner /> : fcData && (
            <div className="space-y-2">
              <ForecastTable products={fcData.products} />
              <p className="text-[10px] text-muted-foreground text-right">계산 시점: {fcData.calculated_at}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AllocationForm
        open={allocFormOpen}
        onOpenChange={(v) => { setAllocFormOpen(v); if (!v) setEditingAlloc(undefined); }}
        onSaved={() => { fetchAllocations(); reloadInv(); }}
        prefilledProductId={prefilledProductId}
        editData={editingAlloc}
        invItems={rawInv?.items ?? []}
        priceMapProp={priceMap}
      />

      {/* 미착품 처리 다이얼로그 */}
      <Dialog
        open={incomingDialog.open}
        onOpenChange={(v) => { if (!v) setIncomingDialog({ open: false, stockAlloc: null, incomingAlloc: null }); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageX className="h-4 w-4 text-blue-600" />
              연관 미착품 배정 처리
            </DialogTitle>
          </DialogHeader>

          {incomingDialog.incomingAlloc && (() => {
            const ia = incomingDialog.incomingAlloc!;
            const prod = productMap.get(ia.product_id);
            const kw = ia.capacity_kw ?? (prod ? ia.quantity * prod.spec_wp / 1000 : null);
            return (
              <div className="space-y-3 py-1">
                <p className="text-sm text-muted-foreground">
                  이 현재고 배정과 함께 등록된 <span className="font-semibold text-blue-700">미착품 배정</span>이 있습니다.
                  수주에 함께 포함할지 선택해 주세요.
                </p>
                <div className="rounded-md border bg-blue-50/60 p-3 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">품목</span>
                    <span className="font-medium">{prod?.product_code ?? ia.product_code ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">수량</span>
                    <span className="font-mono">{ia.quantity.toLocaleString()} EA</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">용량</span>
                    <span className="font-mono">
                      {kw ? (kw >= 1000 ? (kw/1000).toFixed(2)+' MW' : Math.round(kw).toLocaleString()+' kW') : '—'}
                    </span>
                  </div>
                  {ia.status === 'hold' && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">상태</span>
                      <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">보류 중</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full justify-start gap-2"
              onClick={handleIncomingInclude}
            >
              <PackageCheck className="h-4 w-4" />
              수주에 포함 — 현재고 + 미착품 함께 수주 등록
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-sky-700 border-sky-200 hover:bg-sky-50"
              onClick={handleIncomingHold}
            >
              <Clock className="h-4 w-4" />
              보류 — 미착품 배정만 보류, 현재고만 수주 등록
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={handleIncomingDelete}
            >
              <PackageX className="h-4 w-4" />
              삭제 — 미착품 배정 취소 후 현재고만 수주 등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
