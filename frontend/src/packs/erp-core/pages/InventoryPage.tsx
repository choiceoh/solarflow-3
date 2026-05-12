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
import { useBLDashboard, type BLDashboard } from '@/hooks/useInbound';
import { useOutboundDashboard, type OutboundDashboard } from '@/hooks/useOutbound';
import { useOrderDashboard, type OrderDashboard } from '@/hooks/useOrders';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import { detectCapacityUnit, formatKwUnitOnly, formatKwValueOnly, shortMfgName } from '@/lib/utils';
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
import { KpiStrip } from '@/components/command/KpiStrip';
import { flatSpark } from '@/templates/sparkUtils';
import { useFxSpot } from '@/hooks/usePublicFx';
import { useMetalSpot } from '@/hooks/usePublicMetal';
import type { InventorySummary, ProductForecast } from '@/types/inventory';

function formatAutoKw(kw: number): string {
  if (kw <= 0) return '0 kW';
  if (kw >= 1000) return `${(kw / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} MW`;
  return `${Math.round(kw).toLocaleString('ko-KR')} kW`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

type InventoryTab = 'avail' | 'physical' | 'incoming' | 'forecast' | 'flow';
const INVENTORY_TABS = new Set<string>(['avail', 'physical', 'incoming', 'forecast', 'flow']);
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
  const storeManufacturers = useAppStore((s) => s.manufacturers);
  const loadManufacturers = useAppStore((s) => s.loadManufacturers);
  const manufacturers = useMemo(() => sortManufacturers(storeManufacturers), [storeManufacturers]);
  // D-064 PR 31: products.safety_stock 비교용 — 미달 행 amber 강조
  const products = useAppStore((s) => s.products);
  const loadProductsStore = useAppStore((s) => s.loadProducts);
  useEffect(() => { loadProductsStore(); }, [loadProductsStore]);
  const [mfgFilter, setMfgFilter] = useState<string>('');
  const [wpFilter, setWpFilter] = useState<string>('');
  const [longTermFilter, setLongTermFilter] = useState<LongTermFilter>(() => getLongTermFilter(new URLSearchParams(location.search).get('long_term_status')));
  const [forecastScope, setForecastScope] = useState<ForecastScope>('current');
  const [forecastSearch, setForecastSearch] = useState('');

  // 시장 시세 — 우측 레일에서 표시. 하나라도 실패해도 다른 항목은 표시.
  const { data: usdKrw } = useFxSpot('usdkrw');
  const { data: cnyKrw } = useFxSpot('cnykrw');
  const { data: silver } = useMetalSpot('silver');
  const { data: copper } = useMetalSpot('copper');

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
  useEffect(() => {
    void location.key;
    fetchAllocations();
  }, [fetchAllocations, location.key]);

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
  // '흐름' 탭 — manufacturer 필터를 dashboard 3종에 전달. trend24 (BL/Outbound) 와 totals (Order) 만 사용.
  const flowDashFilters = useMemo(
    () => (mfgFilter ? { manufacturer_id: mfgFilter } : {}),
    [mfgFilter],
  );
  const { dashboard: blDash } = useBLDashboard(flowDashFilters);
  const { dashboard: outboundDash } = useOutboundDashboard(flowDashFilters);
  const { dashboard: orderDash } = useOrderDashboard({});

  // 제조사 선택 시 해당 제조사 재고의 규격(Wp) 목록 추출
  const availableWps = useMemo(() => {
    if (!rawInv || !mfgFilter) return [];
    const set = new Set<number>();
    rawInv.items.forEach((it) => { if (it.spec_wp) set.add(it.spec_wp); });
    return [...set].sort((a, b) => a - b);
  }, [rawInv, mfgFilter]);

  // 제조사 변경 시 규격 필터 초기화 — 사용자 입력(mfgFilter) → 의존 상태 동기화
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    void mfgFilter;
    setWpFilter('');
  }, [mfgFilter]);

  // product_id → { product_code, product_name, spec_wp, manufacturer_name } 맵 (배정 테이블 표시용)
  // rawInv는 필터 미적용 전체 목록이므로 항상 전체 품목 포함
  const productMap = useMemo(() => {
    const m = new Map<string, { product_code: string; product_name: string; spec_wp: number; manufacturer_name: string }>();
    rawInv?.items.forEach((it) => {
      m.set(it.product_id, {
        product_code:      it.product_code,
        product_name:      it.product_name,
        spec_wp:           it.spec_wp,
        manufacturer_name: it.manufacturer_name,
      });
    });
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
  if (!selectedCompanyId) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">좌측 사이드바에서 법인을 선택해주세요</p>
      </div>
    );
  }

  const totalSecuredKwRaw = inventoryStats?.totalSecuredKw ?? 0;
  const stockAvailableKwRaw = inventoryStats?.stockAvailableKw ?? 0;
  const incomingAvailableKwRaw = inventoryStats?.incomingAvailableKw ?? 0;
  const pendingKwRaw = allocationStats.pendingKw;
  // 최종값 기준으로 단위 잠금 — tween 보간 중 단위 점프 방지.
  const totalSecuredUnit = detectCapacityUnit(totalSecuredKwRaw);
  const stockAvailableUnit = detectCapacityUnit(stockAvailableKwRaw);
  const incomingAvailableUnit = detectCapacityUnit(incomingAvailableKwRaw);
  const pendingUnit = detectCapacityUnit(pendingKwRaw);
  const totalSecured = { value: formatKwValueOnly(totalSecuredKwRaw, totalSecuredUnit), unit: formatKwUnitOnly(totalSecuredUnit) };
  const stockAvailable = { value: formatKwValueOnly(stockAvailableKwRaw, stockAvailableUnit), unit: formatKwUnitOnly(stockAvailableUnit) };
  const incomingAvailable = { value: formatKwValueOnly(incomingAvailableKwRaw, incomingAvailableUnit), unit: formatKwUnitOnly(incomingAvailableUnit) };
  const pendingKw = { value: formatKwValueOnly(pendingKwRaw, pendingUnit), unit: formatKwUnitOnly(pendingUnit) };
  const holdKwRaw = allocationStats.holdKw;
  const salePendingKwRaw = allocationStats.salePendingKw;
  const holdUnit = detectCapacityUnit(holdKwRaw);
  const salePendingUnit = detectCapacityUnit(salePendingKwRaw);
  const holdKw = { value: formatKwValueOnly(holdKwRaw, holdUnit), unit: formatKwUnitOnly(holdUnit) };
  const salePendingKw = { value: formatKwValueOnly(salePendingKwRaw, salePendingUnit), unit: formatKwUnitOnly(salePendingUnit) };
  const incomingShareRaw = totalSecuredKwRaw > 0 ? (incomingAvailableKwRaw / totalSecuredKwRaw) * 100 : 0;
  const productCountTotal = inventoryStats?.productCount ?? 0;
  const insufficientProductCount = (fcData?.products ?? []).filter(
    (p) => p.months.some((m) => m.insufficient) || p.unscheduled.sale_kw > 0 || p.unscheduled.construction_kw > 0,
  ).length;
  const longTermProductCount = (invData?.items ?? []).filter(
    (item) => (item.long_term_status === 'warning' || item.long_term_status === 'critical') && item.available_kw > 0,
  ).length;
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
          { key: 'flow', label: '흐름' },
        ]}
      />
    </div>
  );
  const inventoryTitle =
    activeTab === 'physical' ? '품목별 실재고' :
    activeTab === 'incoming' ? '품목별 미착품 / 배정 현황' :
    activeTab === 'forecast' ? '수급 전망' :
    activeTab === 'flow' ? '입출고 흐름' :
    '재고 현황';
  const inventorySub =
    activeTab === 'physical' ? '창고 보유 물리 재고' :
    activeTab === 'incoming' ? 'L/C · B/L 예정분' :
    activeTab === 'forecast' ? `표시 ${forecastProducts.length.toLocaleString('ko-KR')}건 · 현재 관련 ${activeForecastProductCount.toLocaleString('ko-KR')}건` :
    activeTab === 'flow' ? '24개월 입고·출고·재고잔량' :
    '제조사 × 품번 · 단위 MW';
  const inventoryMetrics = [
    {
      lbl: '가용',
      v: totalSecured.value,
      numericValue: totalSecuredKwRaw,
      formatter: (n: number) => formatKwValueOnly(n, totalSecuredUnit),
      u: totalSecured.unit,
      sub: `${inventoryStats?.productCount.toLocaleString('ko-KR') ?? '0'}개 품목`,
      tone: 'solar' as const,
      spark: flatSpark(totalSecuredKwRaw),
      metricId: 'inventory.total_secured',
    },
    {
      lbl: '실재고',
      v: stockAvailable.value,
      numericValue: stockAvailableKwRaw,
      formatter: (n: number) => formatKwValueOnly(n, stockAvailableUnit),
      u: stockAvailable.unit,
      sub: '창고 보유 현재고',
      tone: 'ink' as const,
      spark: flatSpark(stockAvailableKwRaw),
      metricId: 'inventory.physical',
    },
    {
      lbl: '미착품',
      v: incomingAvailable.value,
      numericValue: incomingAvailableKwRaw,
      formatter: (n: number) => formatKwValueOnly(n, incomingAvailableUnit),
      u: incomingAvailable.unit,
      sub: `운송 중 ${incomingRailItems.length.toLocaleString('ko-KR')}건`,
      tone: 'info' as const,
      spark: flatSpark(incomingAvailableKwRaw),
      metricId: 'inventory.incoming',
    },
    {
      lbl: '예약 차감',
      v: pendingKw.value,
      numericValue: pendingKwRaw,
      formatter: (n: number) => formatKwValueOnly(n, pendingUnit),
      u: pendingKw.unit,
      sub: `${allocationStats.pendingCount.toLocaleString('ko-KR')}건 · ${allocationStats.holdCount.toLocaleString('ko-KR')}건 보류`,
      tone: 'warn' as const,
      spark: flatSpark(pendingKwRaw),
      metricId: 'inventory.allocations',
    },
    {
      lbl: '판매 예약',
      v: salePendingKw.value,
      numericValue: salePendingKwRaw,
      formatter: (n: number) => formatKwValueOnly(n, salePendingUnit),
      u: salePendingKw.unit,
      sub: `${allocationStats.salePendingCount.toLocaleString('ko-KR')}건`,
      tone: 'info' as const,
      spark: flatSpark(salePendingKwRaw),
      metricId: 'inventory.sale_pending',
    },
    {
      lbl: '보류',
      v: holdKw.value,
      numericValue: holdKwRaw,
      formatter: (n: number) => formatKwValueOnly(n, holdUnit),
      u: holdKw.unit,
      sub: `${allocationStats.holdCount.toLocaleString('ko-KR')}건 · 사용 검토`,
      tone: 'ink' as const,
      spark: flatSpark(holdKwRaw),
      metricId: 'inventory.hold',
    },
    {
      lbl: '활성 품목',
      v: productCountTotal.toLocaleString('ko-KR'),
      numericValue: productCountTotal,
      formatter: (n: number) => n.toLocaleString('ko-KR'),
      u: '개',
      sub: '가용 보유 SKU',
      tone: 'ink' as const,
      spark: flatSpark(productCountTotal),
      metricId: 'inventory.product_count',
    },
    {
      lbl: '미착 비중',
      v: incomingShareRaw.toFixed(1),
      numericValue: incomingShareRaw,
      formatter: (n: number) => n.toFixed(1),
      u: '%',
      sub: '가용 중 미착 비율',
      tone: 'info' as const,
      spark: flatSpark(incomingShareRaw),
      metricId: 'inventory.incoming_share',
    },
    {
      lbl: '부족 예상 품목',
      v: insufficientProductCount.toLocaleString('ko-KR'),
      numericValue: insufficientProductCount,
      formatter: (n: number) => n.toLocaleString('ko-KR'),
      u: '개',
      sub: '6개월 내 음수 / 미예정',
      tone: insufficientProductCount > 0 ? ('warn' as const) : ('pos' as const),
      spark: flatSpark(insufficientProductCount),
      metricId: 'inventory.insufficient',
    },
    {
      lbl: '장기재고 품목',
      v: longTermProductCount.toLocaleString('ko-KR'),
      numericValue: longTermProductCount,
      formatter: (n: number) => n.toLocaleString('ko-KR'),
      u: '개',
      sub: '180일+ 보유',
      tone: longTermProductCount > 0 ? ('warn' as const) : ('pos' as const),
      spark: flatSpark(longTermProductCount),
      metricId: 'inventory.long_term',
    },
  ];

  return (
    <div className="sf-inventory-shell">
      <div className="sf-inventory-main">
        <KpiStrip metrics={inventoryMetrics} scopeId="inventory" gridClassName="sf-inventory-kpis">
          {(metric) => (
            <TileB
              key={metric.lbl}
              lbl={metric.lbl}
              v={metric.v}
              numericValue={metric.numericValue}
              formatter={metric.formatter}
              u={metric.u}
              sub={metric.sub}
              tone={metric.tone}
              spark={metric.spark}
              metricId={metric.metricId}
            />
          )}
        </KpiStrip>

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
                products={products}
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

        <TabsContent value="flow">
          <FlowTab
            blDash={blDash}
            outboundDash={outboundDash}
            orderDash={orderDash}
            stockAvailableKwRaw={stockAvailableKwRaw}
          />
        </TabsContent>
      </Tabs>
      </div>

      <aside className="sf-inventory-rail dark-scroll">
        <RailBlock title="시장 시세">
          {[
            usdKrw && {
              label: 'USD/KRW',
              value: usdKrw.rate.toLocaleString('en-US', { maximumFractionDigits: 1 }),
              changePct: usdKrw.change_pct,
            },
            cnyKrw && {
              label: 'CNY/KRW',
              value: cnyKrw.rate.toLocaleString('en-US', { maximumFractionDigits: 2 }),
              changePct: cnyKrw.change_pct,
            },
            silver && {
              label: '은 가격',
              value: `$${silver.price_usd.toFixed(2)}`,
              changeAbs: silver.change_usd,
              prevPrice: silver.change_usd != null ? silver.price_usd - silver.change_usd : null,
            },
            copper && {
              label: '구리 가격',
              value: `$${copper.price_usd.toFixed(2)}`,
              changeAbs: copper.change_usd,
              prevPrice: copper.change_usd != null ? copper.price_usd - copper.change_usd : null,
            },
          ].filter((m): m is NonNullable<typeof m> => m != null).map((market) => {
            const pct = 'changePct' in market
              ? market.changePct
              : ('changeAbs' in market && market.changeAbs != null && market.prevPrice && market.prevPrice > 0
                  ? (market.changeAbs / market.prevPrice) * 100
                  : null);
            const up = pct != null && pct >= 0;
            const deltaText = pct != null ? `${up ? '+' : ''}${pct.toFixed(2)}%` : '—';
            return (
              <div key={market.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', fontSize: 11.5 }}>
                <span style={{ color: 'var(--ink-2)' }}>{market.label}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span className="mono tnum" style={{ fontWeight: 500 }}>{market.value}</span>
                  <span className="mono tnum" style={{ fontSize: 10, color: pct == null ? 'var(--ink-3)' : up ? 'var(--pos)' : 'var(--neg)', minWidth: 50, textAlign: 'right' }}>{deltaText}</span>
                </div>
              </div>
            );
          })}
          {!usdKrw && !cnyKrw && !silver && !copper && (
            <div className="text-xs text-[var(--ink-3)]">시세 로드 중…</div>
          )}
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

// FlowTab — 24개월 입출고 흐름 + 재고 walking back.
// 재고잔량(t) = current_stock + Σoutbound(t+1..now) − Σinbound(t+1..now)
// 수주잔량은 historical 재구성이 불가능 (Order 에 completed_at 없음) — 현재 시점 active+partial 만 표시.
function FlowTab({
  blDash,
  outboundDash,
  orderDash,
  stockAvailableKwRaw,
}: {
  blDash: BLDashboard | null;
  outboundDash: OutboundDashboard | null;
  orderDash: OrderDashboard | null;
  stockAvailableKwRaw: number;
}) {
  const chartData = useMemo(() => {
    if (!blDash || !outboundDash) return [];
    // 두 trend24 모두 동일 24개월 윈도우를 서버에서 생성 — month 키로 align.
    const outboundByMonth = new Map(
      outboundDash.trend24.map((p) => [p.month, p.kw_sum]),
    );
    const rows = blDash.trend24.map((p) => ({
      month: p.month,
      inbound: p.kw_sum / 1000, // kW → MW
      outbound: (outboundByMonth.get(p.month) ?? 0) / 1000,
    }));
    // current_stock 을 anchor 로 거꾸로 walking.
    // stock(t) = stock(t+1) + outbound(t+1) − inbound(t+1)
    const inventoryMw: number[] = new Array(rows.length).fill(0);
    inventoryMw[rows.length - 1] = stockAvailableKwRaw / 1000;
    for (let i = rows.length - 2; i >= 0; i--) {
      inventoryMw[i] = inventoryMw[i + 1] + rows[i + 1].outbound - rows[i + 1].inbound;
    }
    return rows.map((r, i) => ({
      ...r,
      inventory: Math.max(0, inventoryMw[i]),
      monthLabel: r.month.slice(2), // YY-MM
    }));
  }, [blDash, outboundDash, stockAvailableKwRaw]);

  const prevMonthInbound = chartData.length >= 2 ? chartData[chartData.length - 2].inbound : 0;
  const prevMonthOutbound = chartData.length >= 2 ? chartData[chartData.length - 2].outbound : 0;
  const currentInventoryMw = stockAvailableKwRaw / 1000;
  const orderBacklogCount =
    (orderDash?.totals.active_count ?? 0) + (orderDash?.totals.partial_count ?? 0);

  const tiles: { label: string; value: string; sub: string; tone: string }[] = [
    {
      label: '재고잔량',
      value: currentInventoryMw.toFixed(2),
      sub: 'MW · 현재 시점',
      tone: 'var(--solar-2)',
    },
    {
      label: '수주잔량',
      value: orderBacklogCount.toLocaleString('ko-KR'),
      sub: `건 · active ${orderDash?.totals.active_count ?? 0} / partial ${orderDash?.totals.partial_count ?? 0}`,
      tone: 'var(--info)',
    },
    {
      label: '직전월 입고',
      value: prevMonthInbound.toFixed(2),
      sub: 'MW',
      tone: 'var(--pos)',
    },
    {
      label: '직전월 출고',
      value: prevMonthOutbound.toFixed(2),
      sub: 'MW',
      tone: 'var(--warn)',
    },
  ];

  if (!blDash || !outboundDash) {
    return (
      <div className="flex items-center justify-center p-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-md border bg-background p-3"
            style={{ borderLeftColor: tile.tone, borderLeftWidth: 3 }}
          >
            <div className="text-[11px] text-muted-foreground">{tile.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-semibold tabular-nums">{tile.value}</span>
              <span className="text-[10px] text-muted-foreground">{tile.sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-md border bg-background p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">24개월 입출고 흐름</div>
            <div className="text-[10.5px] text-muted-foreground">
              입고·출고 bar (MW) + 재고잔량 line (현재 시점 anchor 로 walking back)
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            ※ 재고 walking 은 trend24 의 입출고 누적 차감. 창고이동·재고조정 등은 미반영
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="monthLabel" tick={{ fontSize: 10 }} />
              <YAxis
                yAxisId="flow"
                orientation="left"
                tick={{ fontSize: 10 }}
                width={40}
                label={{
                  value: 'MW',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: 'var(--ink-3)' },
                }}
              />
              <Tooltip
                formatter={(value, name) => [`${Number(value).toFixed(2)} MW`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="flow" dataKey="inbound" name="월별 입고" fill="var(--pos)" />
              <Bar yAxisId="flow" dataKey="outbound" name="월별 출고" fill="var(--warn)" />
              <Line
                yAxisId="flow"
                type="monotone"
                dataKey="inventory"
                name="재고잔량"
                stroke="var(--solar-2)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
