import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertTriangle,
  Clock,
  PackageCheck,
  PackageX,
  Search,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import AllocationForm, { type InventoryAllocation } from '@/components/inventory/AllocationForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAppStore } from '@/stores/appStore';
import { useInventory } from '@/hooks/useInventory';
import { useForecast } from '@/hooks/useForecast';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import { shortMfgName } from '@/lib/utils';
import { manufacturerRankByName, sortManufacturers } from '@/lib/manufacturerPriority';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import SkeletonRows from '@/components/common/SkeletonRows';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import InventoryTable from '@/components/inventory/InventoryTable';
import AvailInventoryTable from '@/components/inventory/AvailInventoryTable';
import IncomingTable from '@/components/inventory/IncomingTable';
import ForecastTable from '@/components/inventory/ForecastTable';
import ModuleDemandForecastPanel from '@/components/inventory/ModuleDemandForecastPanel';
import { CardB, CommandTopLine, FilterButton, FilterChips, RailBlock, TileB } from '@/components/command/MockupPrimitives';
import { flatSpark } from '@/templates/sparkUtils';
import type { InventorySummary, ProductForecast } from '@/types/inventory';

function formatAutoKw(kw: number): string {
  if (kw <= 0) return '0 kW';
  if (kw >= 1000) return `${(kw / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MW`;
  return `${Math.round(kw).toLocaleString('ko-KR')} kW`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

type InventoryTab = 'avail' | 'physical' | 'incoming' | 'forecast';
const INVENTORY_TABS = new Set<string>(['avail', 'physical', 'incoming', 'forecast']);
type ForecastScope = 'current' | 'all';
type LongTermFilter = '' | 'warning' | 'critical';

function getInventoryTab(search: string): InventoryTab {
  const tab = new URLSearchParams(search).get('tab');
  return INVENTORY_TABS.has(tab ?? '') ? (tab as InventoryTab) : 'avail';
}

function getLongTermFilter(value: string | null): LongTermFilter {
  return value === 'warning' || value === 'critical' ? value : '';
}

function hasForecastActivity(product: ProductForecast): boolean {
  const hasScheduled = product.months.some((month) => (
    month.opening_kw > 0 ||
    month.incoming_kw > 0 ||
    month.outgoing_sale_kw > 0 ||
    month.outgoing_construction_kw > 0 ||
    month.closing_kw > 0 ||
    month.reserved_kw > 0 ||
    month.allocated_kw > 0 ||
    month.available_kw > 0 ||
    month.insufficient
  ));
  const unscheduled = product.unscheduled;
  return hasScheduled ||
    unscheduled.incoming_kw > 0 ||
    unscheduled.sale_kw > 0 ||
    unscheduled.construction_kw > 0;
}

function matchesForecastSearch(product: ProductForecast, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const haystack = [
    product.product_code,
    product.product_name,
    product.manufacturer_name,
    shortMfgName(product.manufacturer_name),
    String(product.spec_wp),
    `${product.spec_wp}w`,
    `${product.spec_wp}wp`,
    `${product.module_width_mm}x${product.module_height_mm}`,
  ].join(' ').toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export default function InventoryPage() {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<InventoryTab>(() => getInventoryTab(location.search));
  const handleTabChange = useCallback((tab: string) => {
    const nextTab = INVENTORY_TABS.has(tab) ? (tab as InventoryTab) : 'avail';
    setActiveTab(nextTab);

    const params = new URLSearchParams(location.search);
    params.delete('action');
    if (nextTab === 'avail') params.delete('tab');
    else params.set('tab', nextTab);

    const nextSearch = params.toString();
    navigate(`/inventory${nextSearch ? '?' + nextSearch : ''}`, { replace: true });
  }, [location.search, navigate]);
  const handleCardClick = (tab: 'physical' | 'incoming' | 'avail') => {
    handleTabChange(tab);
  };
  const storeManufacturers = useAppStore((s) => s.manufacturers);
  const loadManufacturers = useAppStore((s) => s.loadManufacturers);
  const manufacturers = useMemo(() => sortManufacturers(storeManufacturers), [storeManufacturers]);
  const [mfgFilter, setMfgFilter] = useState<string>('');
  const [wpFilter, setWpFilter] = useState<string>('');
  const [longTermFilter, setLongTermFilter] = useState<LongTermFilter>(() => getLongTermFilter(new URLSearchParams(location.search).get('long_term_status')));
  const [forecastScope, setForecastScope] = useState<ForecastScope>('current');
  const [forecastSearch, setForecastSearch] = useState('');

  // 가용재고 배정
  const [allocations, setAllocations] = useState<InventoryAllocation[]>([]);
  const [allocFormOpen, setAllocFormOpen] = useState(false);
  const [prefilledProductId, setPrefilledProductId] = useState<string | undefined>();
  const [editingAlloc, setEditingAlloc] = useState<InventoryAllocation | undefined>();
  const [allocError, setAllocError] = useState('');

  // 미착품 처리 다이얼로그 (group_id 기반 연관 incoming alloc 처리)
  const [incomingDialog, setIncomingDialog] = useState<{
    open: boolean;
    stockAlloc: InventoryAllocation | null;   // 확정하려는 현재고 배정
    incomingAlloc: InventoryAllocation | null; // 연관된 미착품 배정
  }>({ open: false, stockAlloc: null, incomingAlloc: null });
  const [orderConfirmAlloc, setOrderConfirmAlloc] = useState<InventoryAllocation | null>(null);

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
    ]).then(([pending, hold]) => {
      setAllocations([...pending, ...hold]);
      setAllocError('');
    }).catch((err) => {
      setAllocError(getErrorMessage(err, '예약 목록을 불러오지 못했습니다'));
    });
  }, [selectedCompanyId]);

  // location.key가 바뀔 때마다 (다른 메뉴→재고로 돌아올 때) 배정 목록 갱신
  useEffect(() => { fetchAllocations(); }, [fetchAllocations, location.key]);

  // URL → 상태 동기화
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab(getInventoryTab(location.search));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLongTermFilter(getLongTermFilter(new URLSearchParams(location.search).get('long_term_status')));
  }, [location.search]);

  // ?action=alloc 처리 — TopNav 빠른 등록에서 진입 시 사용예약 모달 자동 오픈 — URL → 상태 동기화
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'alloc') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrefilledProductId(undefined);
      setEditingAlloc(undefined);
      setAllocFormOpen(true);
      // URL에서 action 파라미터 제거 (뒤로 가기 후 재오픈 방지)
      params.delete('action');
      const newSearch = params.toString();
      navigate(`/inventory${newSearch ? '?' + newSearch : ''}`, { replace: true });
    }
  }, [location.search, navigate]);

  // 수주 등록 페이지 이동 헬퍼
  const navigateToOrder = (alloc: InventoryAllocation, linkedAllocId?: string) => {
    const params = new URLSearchParams({
      new: '1',
      alloc_id: alloc.alloc_id,
      company_id: alloc.company_id,
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
    if (alloc.bl_id) params.set('bl_id', alloc.bl_id);
    if (alloc.expected_price_per_wp) params.set('expected_price_per_wp', String(alloc.expected_price_per_wp));
    if (alloc.free_spare_qty && alloc.free_spare_qty > 0) params.set('spare_qty', String(alloc.free_spare_qty));
    navigate(`/orders?${params.toString()}`);
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
      } catch (err) {
        setAllocError(getErrorMessage(err, '연관 미착품 예약을 확인하지 못했습니다'));
        return;
      }
    }
    // group_id 없거나 연관 미착품 없음 → 바로 수주 등록 이동
    setOrderConfirmAlloc(alloc);
  };

  const handleOrderConfirm = () => {
    if (!orderConfirmAlloc) return;
    const alloc = orderConfirmAlloc;
    setOrderConfirmAlloc(null);
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
    try {
      await fetchWithAuth(`/api/v1/inventory/allocations/${incomingAlloc.alloc_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'hold' }),
      });
      setAllocError('');
      fetchAllocations();
      reloadInv();
      navigateToOrder(stockAlloc);
    } catch (err) {
      setAllocError(getErrorMessage(err, '미착품 예약 보류 처리에 실패했습니다'));
    }
  };

  // 미착품 다이얼로그: "삭제" 선택 → incoming 삭제, stock만 수주 등록
  const handleIncomingDelete = async () => {
    const { stockAlloc, incomingAlloc } = incomingDialog;
    if (!stockAlloc || !incomingAlloc) return;
    const ok = await confirmDialog({
      description: '미착품 배정을 삭제합니다. 계속할까요?',
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    setIncomingDialog({ open: false, stockAlloc: null, incomingAlloc: null });
    try {
      await fetchWithAuth(`/api/v1/inventory/allocations/${incomingAlloc.alloc_id}`, {
        method: 'DELETE',
      });
      setAllocError('');
      fetchAllocations();
      reloadInv();
      navigateToOrder(stockAlloc);
    } catch (err) {
      setAllocError(getErrorMessage(err, '미착품 예약 삭제에 실패했습니다'));
    }
  };

  // 보류 — pending → hold (가용재고 차감 해제)
  const handleHoldAlloc = async (allocId: string) => {
    try {
      await fetchWithAuth(`/api/v1/inventory/allocations/${allocId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'hold' }),
      });
      setAllocError('');
      fetchAllocations();
      reloadInv();
    } catch (err) {
      setAllocError(getErrorMessage(err, '예약 보류 처리에 실패했습니다'));
    }
  };

  // 보류 해제 — hold → pending (가용재고 다시 차감)
  const handleResumeAlloc = async (allocId: string) => {
    try {
      await fetchWithAuth(`/api/v1/inventory/allocations/${allocId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'pending' }),
      });
      setAllocError('');
      fetchAllocations();
      reloadInv();
    } catch (err) {
      setAllocError(getErrorMessage(err, '예약 재개 처리에 실패했습니다'));
    }
  };

  const handleDeleteAlloc = async (allocId: string) => {
    const ok = await confirmDialog({
      description: '삭제하면 복원할 수 없습니다. 삭제할까요?',
      variant: 'destructive',
      confirmLabel: '삭제',
    });
    if (!ok) return;
    try {
      await fetchWithAuth(`/api/v1/inventory/allocations/${allocId}`, { method: 'DELETE' });
      setAllocError('');
      fetchAllocations();
      reloadInv();
    } catch (err) {
      setAllocError(getErrorMessage(err, '예약 삭제에 실패했습니다'));
    }
  };

  useEffect(() => {
    loadManufacturers();
  }, [loadManufacturers]);

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

  // 제조사 변경 시 규격 필터 초기화 — 사용자 입력(mfgFilter) → 의존 상태 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleLongTermFilterChange = useCallback((value: string) => {
    const nextFilter = getLongTermFilter(value);
    setLongTermFilter(nextFilter);
    const params = new URLSearchParams(location.search);
    if (nextFilter) params.set('long_term_status', nextFilter);
    else {
      params.delete('long_term_status');
      params.delete('alert');
    }
    const nextSearch = params.toString();
    navigate(`/inventory${nextSearch ? '?' + nextSearch : ''}`, { replace: true });
  }, [location.search, navigate]);

  // 규격/장기재고 필터 적용 — items 필터링 후 summary도 재계산
  const invData = useMemo(() => {
    if (!rawInv) return null;
    let items = rawInv.items;
    if (wpFilter) {
      const wp = parseFloat(wpFilter);
      items = items.filter((it) => it.spec_wp === wp);
    }
    if (longTermFilter) {
      items = items.filter((it) => it.long_term_status === longTermFilter);
    }
    if (!wpFilter && !longTermFilter) return rawInv;
    const summary: InventorySummary = {
      total_physical_kw:  items.reduce((s, it) => s + it.physical_kw,       0),
      total_available_kw: items.reduce((s, it) => s + it.available_kw,      0),
      total_incoming_kw:  items.reduce((s, it) => s + it.incoming_kw,       0),
      total_secured_kw:   items.reduce((s, it) => s + it.total_secured_kw,  0),
    };
    return { ...rawInv, items, summary };
  }, [longTermFilter, rawInv, wpFilter]);

  // 제조사 필터 적용된 배정 목록
  const visibleAllocs = useMemo(() =>
    mfgFilter ? allocations.filter((a) => productMap.has(a.product_id)) : allocations,
  [mfgFilter, allocations, productMap]);

  const workbenchProductIds = useMemo(() => new Set(invData?.items.map((it) => it.product_id) ?? []), [invData]);
  const workbenchAllocs = useMemo(() => (
    workbenchProductIds.size > 0
      ? visibleAllocs.filter((a) => workbenchProductIds.has(a.product_id))
      : visibleAllocs
  ), [visibleAllocs, workbenchProductIds]);

  const inventoryStats = useMemo(() => {
    if (!invData) return null;
    const stockAvailableKw = invData.items.reduce((sum, it) => sum + it.available_kw, 0);
    const incomingAvailableKw = invData.items.reduce((sum, it) => sum + it.available_incoming_kw, 0);
    return {
      totalSecuredKw: stockAvailableKw + incomingAvailableKw,
      stockAvailableKw,
      incomingAvailableKw,
      productCount: invData.items.filter((it) => it.total_secured_kw > 0).length,
    };
  }, [invData]);

  const allocationStats = useMemo(() => {
    const capacityOf = (alloc: InventoryAllocation) => {
      if (alloc.capacity_kw != null) return alloc.capacity_kw;
      const specWp = productMap.get(alloc.product_id)?.spec_wp ?? alloc.spec_wp ?? 0;
      return specWp > 0 ? alloc.quantity * specWp / 1000 : 0;
    };

    return workbenchAllocs.reduce(
      (stats, alloc) => {
        const capacityKw = capacityOf(alloc);
        if (alloc.status === 'pending') {
          stats.pendingCount += 1;
          stats.pendingKw += capacityKw;
          if (alloc.purpose === 'sale' || alloc.purpose === 'other') {
            stats.salePendingCount += 1;
            stats.salePendingKw += capacityKw;
          }
        } else if (alloc.status === 'hold') {
          stats.holdCount += 1;
          stats.holdKw += capacityKw;
        }
        return stats;
      },
      {
        pendingCount: 0,
        pendingKw: 0,
        salePendingCount: 0,
        salePendingKw: 0,
        holdCount: 0,
        holdKw: 0,
      },
    );
  }, [productMap, workbenchAllocs]);

  const forecastProducts = useMemo(() => {
    if (!fcData) return [];
    const wp = wpFilter ? Number(wpFilter) : null;
    return fcData.products.filter((product) => {
      if (wp != null && product.spec_wp !== wp) return false;
      if (forecastScope === 'current' && !hasForecastActivity(product)) return false;
      if (!matchesForecastSearch(product, forecastSearch)) return false;
      return true;
    }).sort((a, b) => {
      const rankDiff = manufacturerRankByName(a.manufacturer_name, manufacturers) - manufacturerRankByName(b.manufacturer_name, manufacturers);
      if (rankDiff !== 0) return rankDiff;
      if (a.spec_wp !== b.spec_wp) return a.spec_wp - b.spec_wp;
      return a.product_name.localeCompare(b.product_name, 'ko');
    });
  }, [fcData, forecastScope, forecastSearch, manufacturers, wpFilter]);

  const activeForecastProductCount = useMemo(
    () => fcData?.products.filter(hasForecastActivity).length ?? 0,
    [fcData],
  );

  const openAllocationForm = (productId?: string) => {
    setPrefilledProductId(productId);
    setEditingAlloc(undefined);
    setAllocFormOpen(true);
  };

  const incomingRailItems = (invData?.items ?? [])
    .filter((item) => item.incoming_kw > 0)
    .sort((a, b) => b.incoming_kw - a.incoming_kw)
    .slice(0, 4);
  const recentRailAllocs = visibleAllocs.slice(0, 6);
  const metricParts = (kw: number) => {
    const text = formatAutoKw(kw);
    const index = text.lastIndexOf(' ');
    return index > 0 ? { value: text.slice(0, index), unit: text.slice(index + 1) } : { value: text, unit: '' };
  };


  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 사이드바에서 법인을 선택해주세요</p>
      </div>
    );
  }

  const totalSecured = metricParts(inventoryStats?.totalSecuredKw ?? 0);
  const stockAvailable = metricParts(inventoryStats?.stockAvailableKw ?? 0);
  const incomingAvailable = metricParts(inventoryStats?.incomingAvailableKw ?? 0);
  const pendingKw = metricParts(allocationStats.pendingKw);
  const inventoryCardControls = (
    <div className="sf-card-controls" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}>
      <FilterButton items={[
        {
          label: '제조사',
          value: mfgFilter,
          onChange: setMfgFilter,
          options: manufacturers.map((m) => ({ value: m.manufacturer_id, label: m.name_kr })),
        },
        {
          label: '규격',
          value: wpFilter,
          onChange: setWpFilter,
          options: availableWps.map((wp) => ({ value: String(wp), label: `${wp}Wp` })),
          disabled: !mfgFilter,
        },
        {
          label: '장기',
          value: longTermFilter,
          onChange: handleLongTermFilterChange,
          options: [
            { value: 'warning', label: '180일+' },
            { value: 'critical', label: '365일+' },
          ],
        },
      ]} />
      <div style={{ flex: 1 }} />
      <FilterChips
        value={activeTab}
        onChange={handleTabChange}
        options={[
          { key: 'avail', label: '가용', count: invData?.items.length ?? 0 },
          { key: 'physical', label: '실재고', count: invData?.items.length ?? 0 },
          { key: 'incoming', label: '미착', count: incomingRailItems.length },
          { key: 'forecast', label: '수급 전망' },
        ]}
      />
    </div>
  );
  const inventoryTitle =
    activeTab === 'physical' ? '품목별 실재고' :
    activeTab === 'incoming' ? '품목별 미착품 / 배정 현황' :
    activeTab === 'forecast' ? '수급 전망' :
    '재고 현황';
  const inventorySub =
    activeTab === 'physical' ? '창고 보유 물리 재고' :
    activeTab === 'incoming' ? 'L/C · B/L 예정분' :
    activeTab === 'forecast' ? `표시 ${forecastProducts.length.toLocaleString('ko-KR')}건 · 현재 관련 ${activeForecastProductCount.toLocaleString('ko-KR')}건` :
    '제조사 × 품번 · 단위 MW';

  return (
    <div className="sf-inventory-shell">
      <div className="sf-inventory-main">
        <div className="sf-command-kpis sf-inventory-kpis">
          <button type="button" onClick={() => handleCardClick('avail')} className="text-left">
            <TileB
              lbl="가용"
              v={totalSecured.value}
              u={totalSecured.unit}
              sub={`${inventoryStats?.productCount.toLocaleString('ko-KR') ?? '0'}개 품목`}
              tone="solar"
              spark={flatSpark(inventoryStats?.totalSecuredKw ?? 0)}
            />
          </button>
          <button type="button" onClick={() => handleCardClick('physical')} className="text-left">
            <TileB lbl="실재고" v={stockAvailable.value} u={stockAvailable.unit} sub="창고 보유 현재고" tone="ink" spark={flatSpark(inventoryStats?.stockAvailableKw ?? 0)} />
          </button>
          <button type="button" onClick={() => handleCardClick('incoming')} className="text-left">
            <TileB
              lbl="미착품"
              v={incomingAvailable.value}
              u={incomingAvailable.unit}
              sub={`운송 중 ${incomingRailItems.length.toLocaleString('ko-KR')}건`}
              tone="info"
              spark={flatSpark(inventoryStats?.incomingAvailableKw ?? 0)}
            />
          </button>
          <TileB
            lbl="예약 차감"
            v={pendingKw.value}
            u={pendingKw.unit}
            sub={`${allocationStats.pendingCount.toLocaleString('ko-KR')}건 · ${allocationStats.holdCount.toLocaleString('ko-KR')}건 보류`}
            tone="warn"
            spark={flatSpark(allocationStats.pendingKw)}
          />
        </div>

        <CommandTopLine title={inventoryTitle} sub={inventorySub} right={inventoryCardControls} />

        {allocError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{allocError}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* 실재고 탭 — 창고 보유 물리적 재고 */}
          <TabsContent value="physical">
            {invError && (
              <Alert variant="destructive" className="mb-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{invError}</AlertDescription>
              </Alert>
            )}
            <CardB title="품목별 실재고" sub="창고 보유 물리 재고" right={inventoryCardControls} headerless>
              {invLoading ? <SkeletonRows rows={8} /> :invData && (
                <>
                  <InventoryTable items={invData.items} />
                  <p className="p-2 text-right text-[10px] text-muted-foreground">계산 시점: {invData.calculated_at}</p>
                </>
              )}
            </CardB>
          </TabsContent>

        {/* 가용재고 — 전체 너비 단일 테이블 (품목 행 클릭 시 배정 내역 펼침) */}
        <TabsContent value="avail">
          {invError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{invError}</AlertDescription>
            </Alert>
          )}
          {/* 품목별 가용재고 + 배정 현황 통합 테이블 */}
          <CardB title="재고 현황" sub="제조사 × 품번 · 단위 MW" right={inventoryCardControls} headerless>
            {invLoading ? <SkeletonRows rows={8} /> :invData ? (
              <AvailInventoryTable
                items={invData.items}
                allocations={visibleAllocs}
                onNewAlloc={(productId) => openAllocationForm(productId)}
                onEdit={(alloc) => { setEditingAlloc(alloc); setPrefilledProductId(undefined); setAllocFormOpen(true); }}
                onConfirm={handleConfirmAlloc}
                onHold={handleHoldAlloc}
                onResume={handleResumeAlloc}
                onDelete={handleDeleteAlloc}
              />
            ) : null}
            {invData && (
              <p className="p-2 text-right text-[10px] text-muted-foreground">
                기준: {invData.calculated_at}
              </p>
            )}
          </CardB>
        </TabsContent>

        <TabsContent value="incoming">
          {invError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{invError}</AlertDescription>
            </Alert>
          )}
          {/* 품목별 미착품 + 배정 현황 */}
          <CardB title="품목별 미착품 / 배정 현황" sub="L/C · B/L 예정분" right={inventoryCardControls} headerless>
            {invLoading ? <SkeletonRows rows={8} /> :invData ? (
              <IncomingTable
                items={invData.items}
                allocations={visibleAllocs}
                onNewAlloc={(productId) => openAllocationForm(productId)}
                onEdit={(alloc) => { setEditingAlloc(alloc); setPrefilledProductId(undefined); setAllocFormOpen(true); }}
                onConfirm={handleConfirmAlloc}
                onHold={handleHoldAlloc}
                onResume={handleResumeAlloc}
                onDelete={handleDeleteAlloc}
              />
            ) : null}
            {invData && (
              <p className="p-2 text-right text-[10px] text-muted-foreground">기준: {invData.calculated_at}</p>
            )}
          </CardB>
        </TabsContent>

        <TabsContent value="forecast">
          {fcError && (
            <Alert variant="destructive" className="mb-3">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{fcError}</AlertDescription>
            </Alert>
          )}
          {fcLoading ? <LoadingSpinner /> : fcData && (
            <div className="space-y-3">
              <ModuleDemandForecastPanel
                companyId={selectedCompanyId}
                inventoryItems={rawInv?.items ?? []}
                manufacturers={manufacturers}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2">
                <div className="inline-flex rounded-full border bg-muted/40 p-1 shadow-sm">
                  <Button
                    type="button"
                    size="xs"
                    variant={forecastScope === 'current' ? 'default' : 'ghost'}
                    className="rounded-full"
                    onClick={() => setForecastScope('current')}
                  >
                    현재 관련 품목
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={forecastScope === 'all' ? 'default' : 'ghost'}
                    className="rounded-full"
                    onClick={() => setForecastScope('all')}
                  >
                    전체 품목
                  </Button>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={forecastSearch}
                    onChange={(e) => setForecastSearch(e.target.value)}
                    className="h-8 pl-8 text-xs"
                    placeholder="제조사, 규격, 품번 검색"
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  표시 {forecastProducts.length.toLocaleString('ko-KR')}건 · 현재 관련 {activeForecastProductCount.toLocaleString('ko-KR')}건
                </div>
              </div>
              <ForecastTable products={forecastProducts} onReserve={openAllocationForm} />
              <p className="text-[10px] text-muted-foreground text-right">계산 시점: {fcData.calculated_at}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>

      <aside className="sf-inventory-rail dark-scroll">
        <RailBlock title="시장 시세" count="14:42 KST">
          {[
            { label: 'USD/KRW', value: '1,773.4', delta: '+0.06%', up: true },
            { label: 'CNY/KRW', value: '244.18', delta: '-0.12%', up: false },
            { label: 'JKO 주가', value: '$28.84', delta: '-1.42%', up: false },
            { label: '폴리실리콘', value: '34.20', delta: '+0.40%', up: true },
          ].map((market) => (
            <div key={market.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', fontSize: 11.5 }}>
              <span style={{ color: 'var(--ink-2)' }}>{market.label}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span className="mono tnum" style={{ fontWeight: 500 }}>{market.value}</span>
                <span className="mono tnum" style={{ fontSize: 10, color: market.up ? 'var(--pos)' : 'var(--neg)', minWidth: 50, textAlign: 'right' }}>{market.delta}</span>
              </div>
            </div>
          ))}
        </RailBlock>

        <RailBlock title="운송 중 선적" count={incomingRailItems.length} accent="var(--solar-3)">
          {incomingRailItems.map((item) => (
            <div key={item.product_id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>{item.manufacturer_name}</span>
                <span className="mono tnum" style={{ fontSize: 10.5, color: 'var(--solar-3)', fontWeight: 600 }}>{formatAutoKw(item.incoming_kw)}</span>
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 2 }}>{item.product_code}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{item.spec_wp}Wp · {item.latest_lc_open ?? 'L/C 확인 중'}</div>
            </div>
          ))}
          {incomingRailItems.length === 0 ? <div className="text-xs text-[var(--ink-3)]">운송 중 미착품이 없습니다.</div> : null}
        </RailBlock>

        <RailBlock title="최근 예약" count={recentRailAllocs.length} last>
          {recentRailAllocs.map((alloc, index) => {
            const product = productMap.get(alloc.product_id);
            return (
              <div key={alloc.alloc_id} style={{ padding: '7px 0', borderBottom: index < recentRailAllocs.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{alloc.alloc_id.slice(0, 8)}</span>
                  <span className={`pill ${alloc.status === 'hold' ? 'info' : 'warn'}`}>{alloc.status === 'hold' ? '보류' : '대기'}</span>
                </div>
                <div style={{ marginTop: 2, color: 'var(--ink-2)', fontSize: 12 }}>{alloc.customer_name ?? alloc.site_name ?? '거래처 미지정'}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>
                  {product?.product_code ?? alloc.product_code ?? '품목 미지정'} · {alloc.quantity.toLocaleString('ko-KR')}장
                </div>
              </div>
            );
          })}
          {recentRailAllocs.length === 0 ? <div className="text-xs text-[var(--ink-3)]">예약 내역이 없습니다.</div> : null}
        </RailBlock>
      </aside>

      <AllocationForm
        open={allocFormOpen}
        onOpenChange={(v) => { setAllocFormOpen(v); if (!v) setEditingAlloc(undefined); }}
        onSaved={() => { fetchAllocations(); reloadInv(); }}
        prefilledProductId={prefilledProductId}
        editData={editingAlloc}
        invItems={rawInv?.items ?? []}
        priceMapProp={priceMap}
      />

      <ConfirmDialog
        open={!!orderConfirmAlloc}
        onOpenChange={(open) => { if (!open) setOrderConfirmAlloc(null); }}
        title="수주로 전환"
        description="판매예약 정보를 수주 등록 화면으로 가져옵니다. 거래처, 품목, 수량, B/L 정보가 자동 입력됩니다."
        confirmLabel="수주 등록"
        onConfirm={handleOrderConfirm}
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
