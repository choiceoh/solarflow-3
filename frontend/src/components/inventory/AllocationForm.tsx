import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ChevronDown, Search, Check, AlertTriangle, Building2, Plus } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { cn, moduleLabel } from '@/lib/utils';
import type { InventoryItem } from '@/types/inventory';
import type { Partner, ConstructionSite, Product } from '@/types/masters';
import type { BLShipment, BLLineItem } from '@/types/inbound';
import { statusLabel } from '@/types/inbound';

/* ─── 타입 ─────────────────────────────────────── */
export interface InventoryAllocation {
  alloc_id: string;
  company_id: string;
  product_id: string;
  product_name?: string;
  product_code?: string;
  spec_wp?: number;
  quantity: number;
  capacity_kw?: number;
  purpose: 'sale' | 'construction' | 'construction_own' | 'construction_epc' | 'other';
  source_type: 'stock' | 'incoming';
  site_id?: string;
  customer_name?: string;
  customer_order_no?: string;  // 고객 발주번호 (notes에서 파싱)
  site_name?: string;
  notes?: string;
  expected_price_per_wp?: number;
  free_spare_qty?: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'hold';
  outbound_id?: string;
  order_id?: string;
  group_id?: string;
  bl_id?: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  prefilledProductId?: string;
  editData?: InventoryAllocation;       // 수정 모드: 기존 배정 데이터
  invItems?: InventoryItem[];
  priceMapProp?: Map<string, number>;
}

/* ─── 상수 ─────────────────────────────────────── */
const PURPOSE_LABEL: Record<string, string> = {
  sale:              '상품판매 예정',
  construction_own:  '공사사용 — 자체 현장',
  construction_epc:  '공사사용 — 타사 EPC',
  other:             '기타',
};
// 레거시 'construction' 표시용 (수정 모드에서 구 데이터 읽기)
const PURPOSE_LABEL_LEGACY: Record<string, string> = {
  ...PURPOSE_LABEL,
  construction: '공사사용 (구 데이터)',
};

/* ─── 헬퍼 ─────────────────────────────────────── */
function eaFromKw(kw: number, specWp: number) {
  return specWp > 0 ? Math.round((kw * 1000) / specWp) : 0;
}
/** kW 값을 1,000kW 기준으로 kW 또는 MW로 자동 포맷 */
function formatCapacityAuto(kw: number): string {
  if (kw >= 1000) return (kw / 1000).toFixed(2) + ' MW';
  return Math.round(kw).toLocaleString('ko-KR') + ' kW';
}

const isFreeSpareAlloc = (a: InventoryAllocation) => a.notes?.startsWith('[무상스페어]') ?? false;

function isLinkedFreeSpare(main: InventoryAllocation, candidate: InventoryAllocation): boolean {
  if (candidate.alloc_id === main.alloc_id || !isFreeSpareAlloc(candidate)) return false;
  if (candidate.company_id !== main.company_id || candidate.product_id !== main.product_id) return false;
  if (candidate.purpose !== main.purpose) return false;
  if (candidate.status !== 'pending' && candidate.status !== 'hold') return false;
  if (main.group_id && candidate.group_id) return main.group_id === candidate.group_id;
  return (
    (candidate.customer_name ?? '') === (main.customer_name ?? '') &&
    (candidate.site_name ?? '') === (main.site_name ?? '') &&
    (candidate.bl_id ?? '') === (main.bl_id ?? '')
  );
}

/* ─── 품목 검색 콤보박스 ─────────────────────────── */
interface ProductComboboxProps {
  items: InventoryItem[];
  value: string;
  onChange: (id: string) => void;
  priceMap: Map<string, number>;
}
function ProductCombobox({ items, value, onChange, priceMap }: ProductComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = items.find((it) => it.product_id === value);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter((it) =>
      it.manufacturer_name.toLowerCase().includes(q) ||
      it.product_name.toLowerCase().includes(q) ||
      String(it.spec_wp).includes(q) ||
      (it.product_code ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('');
      }
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent h-9 py-2 pr-2 pl-2.5 text-sm transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex-1 text-left truncate">
          {selected
            ? `${moduleLabel(selected.manufacturer_name, selected.spec_wp)} | ${selected.product_name}`
            : '품목 검색 (제조사·규격·품명)'}
        </span>
        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-md overflow-hidden">
          {/* 검색 입력 */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="진코, 640, NEG72..."
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
            />
          </div>
          {/* 목록 */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground text-center">결과 없음</div>
            ) : (
              filtered.map((it) => {
                const stockEa    = eaFromKw(it.available_kw,          it.spec_wp);
                const incomingEa = eaFromKw(it.available_incoming_kw, it.spec_wp);
                const price      = priceMap.get(it.product_id);
                return (
                  <button
                    key={it.product_id}
                    type="button"
                    onClick={() => { onChange(it.product_id); setOpen(false); setSearch(''); }}
                    className={cn(
                      'flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-accent transition-colors',
                      value === it.product_id && 'bg-accent/40',
                    )}
                  >
                    <span className="size-3.5 mt-0.5 shrink-0 flex items-center">
                      {value === it.product_id && <Check className="size-3.5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">
                        {moduleLabel(it.manufacturer_name, it.spec_wp)} · {it.product_name}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        <span className="text-green-600">현재고 {stockEa.toLocaleString()}EA</span>
                        <span className="mx-1.5">·</span>
                        <span className="text-blue-600">미착 {incomingEa.toLocaleString()}EA</span>
                        {price && <span className="ml-1.5 text-muted-foreground">${price.toFixed(4)}/Wp</span>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 현장 검색 콤보박스 (construction_own / construction_epc) ─── */
interface SiteComboboxProps {
  sites: ConstructionSite[];
  value: string;     // site_id
  onChange: (id: string) => void;
  siteType: 'own' | 'epc';
  companyId: string;
  onCreated: (site: ConstructionSite) => void;
}
function SiteCombobox({ sites, value, onChange, siteType, companyId, onCreated }: SiteComboboxProps) {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState('');
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [newLoc, setNewLoc]       = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError]     = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLInputElement>(null);

  const selected = sites.find((s) => s.site_id === value);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return sites;
    return sites.filter(
      (s) => s.name.toLowerCase().includes(q) || (s.location ?? '').toLowerCase().includes(q),
    );
  }, [sites, search]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch(''); setCreating(false);
        setCreateError('');
      }
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateLoading(true); setCreateError('');
    try {
      const site = await fetchWithAuth<ConstructionSite>('/api/v1/construction-sites', {
        method: 'POST',
        body: JSON.stringify({
          company_id: companyId,
          name:       newName.trim(),
          location:   newLoc.trim() || undefined,
          site_type:  siteType,
        }),
      });
      onCreated(site);
      onChange(site.site_id);
      setOpen(false); setCreating(false); setNewName(''); setNewLoc('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : '등록 실패');
    } finally {
      setCreateLoading(false);
    }
  };

  const typeLabel = siteType === 'own'
    ? <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-100 text-purple-700 font-medium">자체</span>
    : <span className="px-1.5 py-0.5 rounded text-[9px] bg-orange-100 text-orange-700 font-medium">EPC</span>;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent h-9 py-2 pr-2 pl-2.5 text-sm transition-colors outline-none',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex-1 text-left truncate">
          {selected ? (
            <>
              {selected.name}
              {selected.location && (
                <span className="text-muted-foreground ml-1.5 text-xs">· {selected.location}</span>
              )}
            </>
          ) : '현장 검색 또는 신규 등록'}
        </span>
        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-md overflow-hidden">
          {/* 검색 입력 */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="발전소명, 지명으로 검색..."
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-muted-foreground"
            />
          </div>
          {/* 목록 */}
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2.5 text-sm text-muted-foreground text-center">등록된 현장 없음</div>
            )}
            {filtered.map((site) => (
              <button
                key={site.site_id}
                type="button"
                onClick={() => { onChange(site.site_id); setOpen(false); setSearch(''); }}
                className={cn(
                  'flex w-full items-start gap-2 px-2.5 py-2 text-left hover:bg-accent transition-colors',
                  value === site.site_id && 'bg-accent/40',
                )}
              >
                <span className="size-3.5 mt-0.5 shrink-0 flex items-center">
                  {value === site.site_id && <Check className="size-3.5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{site.name}</div>
                  {site.location && (
                    <div className="text-[10px] text-muted-foreground">{site.location}</div>
                  )}
                </div>
                {site.capacity_mw != null && (
                  <span className="text-[10px] text-muted-foreground shrink-0">{site.capacity_mw} MW</span>
                )}
              </button>
            ))}
          </div>
          {/* 신규 등록 */}
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 px-2.5 py-2 text-sm text-primary hover:bg-accent/50 border-t transition-colors"
            >
              <Plus className="size-3.5" />
              새 현장 직접 등록...
            </button>
          ) : (
            <div className="border-t p-2.5 space-y-2 bg-muted/20">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                {typeLabel} 신규 현장 등록
              </div>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="발전소명 *"
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring"
              />
              <input
                value={newLoc}
                onChange={(e) => setNewLoc(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="지명 (예: 전남 영광군 갈동리)"
                className="w-full rounded border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring"
              />
              {createError && (
                <div className="text-xs text-destructive">{createError}</div>
              )}
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || createLoading}
                  className="flex-1 rounded bg-primary text-primary-foreground text-xs py-1.5 font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {createLoading ? '등록 중...' : '등록'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setNewLoc(''); setCreateError(''); }}
                  className="rounded border border-input px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── 메인 컴포넌트 ─────────────────────────────── */
function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return (
    <span className={cn('flex flex-1 text-left truncate', !text && 'text-muted-foreground')} data-slot="select-value">
      {text || placeholder}
    </span>
  );
}

export default function AllocationForm({
  open, onOpenChange, onSaved, prefilledProductId, editData, invItems = [], priceMapProp,
}: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const companies         = useAppStore((s) => s.companies);
  const setCompanyId      = useAppStore((s) => s.setCompanyId);
  const priceMap = priceMapProp ?? new Map<string, number>();
  const effectiveCompanyId = editData?.company_id || selectedCompanyId;

  /* 상태 */
  const [purpose,           setPurpose]           = useState<'sale' | 'construction_own' | 'construction_epc' | 'other'>('sale');
  const [productId,         setProductId]         = useState('');
  const [qtyMode,           setQtyMode]           = useState<'ea' | 'kw' | 'mw'>('ea');
  const [qtyRaw,            setQtyRaw]            = useState('');   // EA: 정수, kW/MW: 소수 문자열
  const [expectedPrice,     setExpectedPrice]     = useState('');   // Wp당 예상 판매가 (₩/Wp)
  const [freeSpareQty,      setFreeSpareQty]      = useState('');   // 무상스페어 수량 (EA)
  const [customerPartnerId, setCustomerPartnerId] = useState('');
  const [customerOrderNo,   setCustomerOrderNo]   = useState('');  // 고객 발주번호 (수주 등록 시 연동)
  const [siteName,          setSiteName]          = useState('');
  const [selectedSiteId,    setSelectedSiteId]    = useState('');  // 현장 FK (construction_own|epc)
  const [sites,             setSites]             = useState<ConstructionSite[]>([]);
  const [notes,             setNotes]             = useState('');
  const [error,             setError]             = useState('');
  const [saving,            setSaving]            = useState(false);
  const [partners,          setPartners]          = useState<Partner[]>([]);
  const [selectedBlId,      setSelectedBlId]      = useState('');  // BL 연결 (원가 추적용)
  const [bls,               setBls]               = useState<BLShipment[]>([]);
  // bl_id → 원화원가/Wp (KRW), bl_id → 수입단가/Wp (USD)
  const [blPriceMap,    setBlPriceMap]    = useState<Map<string, number>>(new Map());
  const [blUsdPriceMap, setBlUsdPriceMap] = useState<Map<string, number>>(new Map());
  const [products,          setProducts]          = useState<Product[]>([]);
  const [linkedFreeSpares,  setLinkedFreeSpares]  = useState<InventoryAllocation[]>([]);

  const noCompany = !editData && (!selectedCompanyId || selectedCompanyId === 'all');

  /* 법인별 재고 보유 여부 (noCompany 모드에서 법인 선택 시 비어있는 법인 비활성화) */
  const [companyHasInv, setCompanyHasInv] = useState<Map<string, boolean>>(new Map());
  useEffect(() => {
    if (!open || !noCompany || companies.length === 0) return;
    Promise.all(
      companies.map((c) =>
        fetchWithAuth<{ summary: { total_secured_kw: number } }>('/api/v1/calc/inventory', {
          method: 'POST',
          body: JSON.stringify({ company_id: c.company_id }),
        })
          .then((r) => [c.company_id, (r.summary?.total_secured_kw ?? 0) > 0] as [string, boolean])
          .catch(() => [c.company_id, false] as [string, boolean])
      )
    ).then((entries) => setCompanyHasInv(new Map(entries)));
  }, [open, noCompany, companies]);

  /* 거래처 목록 + 품목 목록 */
  useEffect(() => {
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active)))
      .catch(() => {});
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active)))
      .catch(() => {});
  }, []);

  /* 품목 선택 시 해당 제조사의 BL 목록 로드 */
  useEffect(() => {
    if (!productId) { setBls([]); return; }
    const mfgId = products.find((p) => p.product_id === productId)?.manufacturer_id;
    if (!mfgId) { setBls([]); return; }
    fetchWithAuth<BLShipment[]>(`/api/v1/bls?manufacturer_id=${mfgId}`)
      .then((list) => {
        const relevant = (list ?? []).filter((b) =>
          ['scheduled', 'shipping', 'arrived', 'customs', 'completed', 'erp_done'].includes(b.status)
        );
        setBls(relevant);
      })
      .catch(() => setBls([]));
  }, [productId, products]);

  /* BL 목록이 바뀌면 모든 BL의 해당 품목 단가를 병렬 조회 → blPriceMap(KRW) + blUsdPriceMap(USD) 갱신 */
  useEffect(() => {
    if (!productId || bls.length === 0) {
      setBlPriceMap(new Map()); setBlUsdPriceMap(new Map()); return;
    }
    Promise.all(
      bls.map((bl) =>
        fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`)
          .then((lines): [string, number | null, number | null] => {
            const line = lines.find(
              (l) => l.product_id === productId &&
                     (l.unit_price_usd_wp != null || l.unit_price_krw_wp != null)
            );
            if (!line) return [bl.bl_id, null, null];
            const usd = line.unit_price_usd_wp ?? null;
            let krw: number | null = null;
            if (usd != null && bl.exchange_rate) krw = usd * bl.exchange_rate;
            else if (line.unit_price_krw_wp != null) krw = line.unit_price_krw_wp;
            return [bl.bl_id, krw, usd];
          })
          .catch((): [string, number | null, number | null] => [bl.bl_id, null, null])
      )
    ).then((entries) => {
      const krwMap = new Map<string, number>();
      const usdMap = new Map<string, number>();
      for (const [id, krw, usd] of entries) {
        if (krw != null) krwMap.set(id, krw);
        if (usd != null) usdMap.set(id, usd);
      }
      setBlPriceMap(krwMap);
      setBlUsdPriceMap(usdMap);
    });
  }, [bls, productId]);

  /* 공사 현장 목록 — purpose가 construction_own/epc이고 법인이 선택된 경우만 로드 */
  useEffect(() => {
    if (noCompany || (purpose !== 'construction_own' && purpose !== 'construction_epc')) {
      setSites([]);
      return;
    }
    const typeParam = purpose === 'construction_own' ? 'own' : 'epc';
    fetchWithAuth<ConstructionSite[]>(
      `/api/v1/construction-sites?company_id=${effectiveCompanyId}&site_type=${typeParam}&is_active=true`,
    )
      .then((list) => setSites(list))
      .catch(() => setSites([]));
  }, [effectiveCompanyId, purpose, noCompany]);

  /* 폼 초기화 — 신규 또는 수정 */
  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    if (editData) {
      // 수정 모드: 기존 값 채우기 (레거시 'construction' → 'construction_own' 폴백)
      const rawPurpose = editData.purpose ?? 'sale';
      const mappedPurpose = rawPurpose === 'construction'
        ? 'construction_own'
        : rawPurpose as 'sale' | 'construction_own' | 'construction_epc' | 'other';
      setPurpose(mappedPurpose);
      setSelectedSiteId(editData.site_id ?? '');
      setProductId(editData.product_id ?? '');
      setQtyMode('ea');
      setQtyRaw(String(editData.quantity ?? ''));
      setExpectedPrice(editData.expected_price_per_wp != null ? String(editData.expected_price_per_wp) : '');
      setFreeSpareQty(editData.free_spare_qty && editData.free_spare_qty > 0 ? String(editData.free_spare_qty) : '');
      setLinkedFreeSpares([]);
      setSiteName(editData.site_name ?? '');
      setSelectedBlId(editData.bl_id ?? '');
      // notes에서 [발주번호:X] 파싱
      const rawNotes = editData.notes ?? '';
      const orderNoMatch = rawNotes.match(/^\[발주번호:([^\]]*)\]\s*/);
      if (orderNoMatch) {
        setCustomerOrderNo(orderNoMatch[1]);
        setNotes(rawNotes.slice(orderNoMatch[0].length));
      } else {
        setCustomerOrderNo('');
        setNotes(rawNotes);
      }
      // customer_name → partner_id 역조회 (partners 로드 후 처리)
      setCustomerPartnerId('');  // partners 로드 후 useEffect에서 재설정
    } else {
      // 신규 모드
      setPurpose('sale');
      setProductId(prefilledProductId ?? '');
      setQtyMode('ea');
      setQtyRaw('');
      setExpectedPrice('');
      setFreeSpareQty('');
      setLinkedFreeSpares([]);
      setCustomerPartnerId('');
      setCustomerOrderNo('');
      setSiteName('');
      setSelectedSiteId('');
      setSelectedBlId('');
      setNotes('');
    }
  }, [open, prefilledProductId, editData]);

  /* 수정 모드: 메인 예약에 딸린 무상스페어 배정을 함께 불러오기 */
  useEffect(() => {
    if (!open || !editData) return;

    fetchWithAuth<InventoryAllocation[]>(
      `/api/v1/inventory/allocations?company_id=${editData.company_id}&product_id=${editData.product_id}`,
    )
      .then((list) => {
        const spares = (list ?? []).filter((a) => isLinkedFreeSpare(editData, a));
        setLinkedFreeSpares(spares);
        if (spares.length > 0) {
          const totalQty = spares.reduce((sum, a) => sum + a.quantity, 0);
          setFreeSpareQty(String(totalQty));
        }
      })
      .catch(() => {
        setLinkedFreeSpares([]);
      });
  }, [open, editData]);

  /* 수정 모드: partners 로드 후 customer_name → partner_id 역조회 */
  useEffect(() => {
    if (open && editData?.customer_name && partners.length > 0) {
      const matched = partners.find((p) => p.partner_name === editData.customer_name);
      if (matched) setCustomerPartnerId(matched.partner_id);
    }
  }, [open, editData, partners]);

  /* 선택된 BL 객체 — bls가 로드되기 전엔 undefined (IIFE 대신 memo로 안정화) */
  const selectedBl = useMemo(
    () => bls.find((b) => b.bl_id === selectedBlId),
    [bls, selectedBlId],
  );

  /* 배정 가능한 품목만 (현재고 or 미착품이 있는 것) */
  const allocatableItems = useMemo(
    () => invItems.filter((it) => it.available_kw > 0 || it.available_incoming_kw > 0),
    [invItems],
  );

  const selectedItem = allocatableItems.find((it) => it.product_id === productId);

  /* 입력값을 EA로 정규화 */
  const inputEa = useMemo(() => {
    if (!selectedItem) return 0;
    if (qtyMode === 'ea') return parseInt(qtyRaw, 10) || 0;
    const val = parseFloat(qtyRaw);
    if (isNaN(val) || val <= 0) return 0;
    if (qtyMode === 'kw') return Math.round((val * 1_000) / selectedItem.spec_wp);
    return Math.round((val * 1_000_000) / selectedItem.spec_wp);   // mw
  }, [qtyMode, qtyRaw, selectedItem]);

  /* 배정 계획 자동 계산 */
  const allocationPlan = useMemo(() => {
    if (!selectedItem || inputEa <= 0) return null;
    const stockAvail    = eaFromKw(selectedItem.available_kw,          selectedItem.spec_wp);
    const incomingAvail = eaFromKw(selectedItem.available_incoming_kw, selectedItem.spec_wp);

    if (inputEa <= stockAvail) {
      return { stockEa: inputEa, incomingEa: 0, shortfallEa: 0, type: 'stock_only' as const };
    } else if (inputEa <= stockAvail + incomingAvail) {
      return { stockEa: stockAvail, incomingEa: inputEa - stockAvail, shortfallEa: 0, type: 'split' as const };
    } else {
      return {
        stockEa: stockAvail, incomingEa: incomingAvail,
        shortfallEa: inputEa - stockAvail - incomingAvail,
        type: 'insufficient' as const,
      };
    }
  }, [selectedItem, inputEa]);

  /* EA 입력값 표시 (천단위 콤마) */
  const qtyDisplayEa = qtyMode === 'ea' && qtyRaw
    ? parseInt(qtyRaw, 10).toLocaleString('ko-KR')
    : '';

  /* 저장 */
  const handleSave = async () => {
    setError('');
    if (!effectiveCompanyId || effectiveCompanyId === 'all') {
      setError('좌측 상단에서 법인을 먼저 선택해주세요'); return;
    }
    if (!productId)        { setError('품목을 선택해주세요'); return; }
    if (!allocationPlan)   { setError('수량 또는 용량을 입력해주세요'); return; }
    if (allocationPlan.type === 'insufficient') {
      setError(`재고가 ${allocationPlan.shortfallEa.toLocaleString()}EA 부족합니다`); return;
    }
    if (purpose === 'sale' && !customerPartnerId) {
      setError('상품판매 예정은 거래처명이 필수입니다'); return;
    }

    const isConstruction = purpose === 'construction_own' || purpose === 'construction_epc';
    if (isConstruction && !selectedSiteId) {
      setError('공사사용 예약은 공사 현장을 선택해야 합니다'); return;
    }
    if (selectedItem && bls.length > 0 && !selectedBlId) {
      setError('원가 추적을 위해 B/L 연결을 선택해주세요'); return;
    }

    const partnerName = partners.find((p) => p.partner_id === customerPartnerId)?.partner_name;
    const parsedPrice = parseFloat(expectedPrice);
    const parsedSpare = purpose === 'sale' ? parseInt(freeSpareQty, 10) : NaN;
    // 발주번호를 notes 앞에 태그 형태로 저장
    const notesWithOrderNo = customerOrderNo.trim()
      ? `[발주번호:${customerOrderNo.trim()}]${notes ? ' ' + notes : ''}`
      : (notes || undefined);
    // 현장 이름: construction은 sites에서, 기타는 직접 입력
    const resolvedSiteName = isConstruction
      ? (sites.find((s) => s.site_id === selectedSiteId)?.name || siteName || undefined)
      : (purpose !== 'sale' ? (siteName || undefined) : undefined);
    const base = {
      company_id:              effectiveCompanyId,
      product_id:              productId,
      purpose,
      customer_name:           purpose === 'sale' ? (partnerName ?? undefined) : undefined,
      site_name:               resolvedSiteName,
      site_id:                 isConstruction ? (selectedSiteId || undefined) : undefined,
      notes:                   notesWithOrderNo,
      expected_price_per_wp:   !isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : undefined,
      free_spare_qty:          !isNaN(parsedSpare) && parsedSpare > 0 ? parsedSpare : 0,
      bl_id:                   selectedBlId || undefined,
    };

    setSaving(true);
    try {
      if (editData) {
        /* ── 수정 모드: PUT ── */
        const totalEa = allocationPlan.stockEa + allocationPlan.incomingEa;
        await fetchWithAuth(`/api/v1/inventory/allocations/${editData.alloc_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...base,
            quantity:    totalEa,
            capacity_kw: totalEa * (selectedItem!.spec_wp / 1000),
            source_type: editData.source_type,  // 출처는 유지
          }),
        });

        const spareEa = !isNaN(parsedSpare) && parsedSpare > 0 ? parsedSpare : 0;
        const spareNotes = '[무상스페어]' + (base.notes ? ' ' + base.notes : '');

        if (spareEa > 0) {
          const [primarySpare, ...duplicateSpares] = linkedFreeSpares;
          const sparePayload = {
            ...base,
            quantity:       spareEa,
            capacity_kw:    spareEa * (selectedItem!.spec_wp / 1000),
            source_type:    editData.source_type,
            free_spare_qty: 0,
            notes:          spareNotes,
            status:         primarySpare?.status ?? editData.status,
            ...(editData.group_id ? { group_id: editData.group_id } : {}),
          };

          if (primarySpare) {
            await fetchWithAuth(`/api/v1/inventory/allocations/${primarySpare.alloc_id}`, {
              method: 'PUT',
              body: JSON.stringify(sparePayload),
            });
          } else {
            await fetchWithAuth('/api/v1/inventory/allocations', {
              method: 'POST',
              body: JSON.stringify(sparePayload),
            });
          }

          await Promise.all(
            duplicateSpares.map((spare) =>
              fetchWithAuth(`/api/v1/inventory/allocations/${spare.alloc_id}`, { method: 'DELETE' }),
            ),
          );
        } else if (linkedFreeSpares.length > 0) {
          await Promise.all(
            linkedFreeSpares.map((spare) =>
              fetchWithAuth(`/api/v1/inventory/allocations/${spare.alloc_id}`, { method: 'DELETE' }),
            ),
          );
        }
      } else {
        /* ── 신규 모드: POST ── */
        // stock+incoming 분할 시 동일 group_id 부여 (B안: 그룹 기반 연관 탐색)
        const groupId = allocationPlan.type === 'split' ? crypto.randomUUID() : undefined;

        /* 현재고 배정 */
        if (allocationPlan.stockEa > 0) {
          await fetchWithAuth('/api/v1/inventory/allocations', {
            method: 'POST',
            body: JSON.stringify({
              ...base,
              quantity:    allocationPlan.stockEa,
              capacity_kw: allocationPlan.stockEa * (selectedItem!.spec_wp / 1000),
              source_type: 'stock',
              ...(groupId ? { group_id: groupId } : {}),
            }),
          });
        }
        /* 미착품 배정 (분할 시) */
        if (allocationPlan.incomingEa > 0) {
          await fetchWithAuth('/api/v1/inventory/allocations', {
            method: 'POST',
            body: JSON.stringify({
              ...base,
              quantity:    allocationPlan.incomingEa,
              capacity_kw: allocationPlan.incomingEa * (selectedItem!.spec_wp / 1000),
              source_type: 'incoming',
              ...(groupId ? { group_id: groupId } : {}),
            }),
          });
        }
        /* 무상스페어 자동 생성 */
        if (!isNaN(parsedSpare) && parsedSpare > 0) {
          await fetchWithAuth('/api/v1/inventory/allocations', {
            method: 'POST',
            body: JSON.stringify({
              ...base,
              quantity:       parsedSpare,
              capacity_kw:    parsedSpare * (selectedItem!.spec_wp / 1000),
              source_type:    allocationPlan.stockEa > 0 ? 'stock' : 'incoming',
              free_spare_qty: 0,
              notes:          '[무상스페어]' + (base.notes ? ' ' + base.notes : ''),
              ...(groupId ? { group_id: groupId } : {}),
            }),
          });
        }
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  /* ─── 렌더 ──────────────────────────────────── */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
        {/* 고정 헤더 */}
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle>{editData ? '사용 예약 수정' : '가용재고 사용 예약'}</DialogTitle>
        </DialogHeader>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

        {/* 법인 미선택 시 인라인 선택기 */}
        {noCompany && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
              <Building2 className="size-3.5 shrink-0" />
              예약할 법인을 선택해주세요
            </div>
            <Select value={selectedCompanyId || 'all'} onValueChange={(v) => setCompanyId(v)}>
              <SelectTrigger className="h-8 w-full text-sm bg-white">
                <Txt text={companies.find(c => c.company_id === selectedCompanyId)?.company_name ?? '법인 선택'} placeholder="법인 선택" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => {
                  const hasInv = companyHasInv.size === 0 || companyHasInv.get(c.company_id) !== false;
                  return (
                    <SelectItem
                      key={c.company_id}
                      value={c.company_id}
                      disabled={!hasInv}
                    >
                      <span className={hasInv ? '' : 'text-muted-foreground'}>
                        {c.company_name}
                      </span>
                      {!hasInv && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">(재고 없음)</span>
                      )}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="space-y-4">

          {/* ① 용도 */}
          <div className="space-y-1.5">
            <Label>용도 *</Label>
            <Select
              value={purpose}
              onValueChange={(v) => {
                const next = (v ?? 'sale') as typeof purpose;
                setPurpose(next);
                // 현장 관련 초기화 (purpose 변경 시)
                setSelectedSiteId('');
                setSiteName('');
              }}
            >
              <SelectTrigger className="w-full">
                <Txt text={PURPOSE_LABEL_LEGACY[purpose] ?? purpose} />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PURPOSE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
                {/* 레거시 데이터가 있을 경우만 표시 */}
                {editData?.purpose === 'construction' && (
                  <SelectItem value="construction">공사사용 (구 데이터)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* ② 품목 검색 */}
          <div className="space-y-1.5">
            <Label>품목 *</Label>
            {allocatableItems.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                배정 가능한 재고가 없습니다
              </div>
            ) : (
              <ProductCombobox
                items={allocatableItems}
                value={productId}
                onChange={(id) => { setProductId(id); setQtyRaw(''); }}
                priceMap={priceMap}
              />
            )}

            {/* 선택 품목 재고 요약 */}
            {selectedItem && (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-xs grid grid-cols-3 gap-2">
                <div className="text-center">
                  <div className="text-muted-foreground mb-0.5">현재고 가용</div>
                  <div className="font-semibold text-green-700">
                    {eaFromKw(selectedItem.available_kw, selectedItem.spec_wp).toLocaleString()} EA
                  </div>
                  <div className="text-muted-foreground">{(selectedItem.available_kw / 1000).toFixed(2)} MW</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground mb-0.5">미착품 가용</div>
                  <div className="font-semibold text-blue-700">
                    {eaFromKw(selectedItem.available_incoming_kw, selectedItem.spec_wp).toLocaleString()} EA
                  </div>
                  <div className="text-muted-foreground">{(selectedItem.available_incoming_kw / 1000).toFixed(2)} MW</div>
                </div>
                <div className="text-center">
                  <div className="text-muted-foreground mb-0.5">총 확보</div>
                  <div className="font-semibold text-purple-700">
                    {eaFromKw(selectedItem.total_secured_kw, selectedItem.spec_wp).toLocaleString()} EA
                  </div>
                  <div className="text-muted-foreground">{(selectedItem.total_secured_kw / 1000).toFixed(2)} MW</div>
                </div>
              </div>
            )}
          </div>

          {/* ③ 수량 / 용량 입력 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                {{ ea: '수량 (EA)', kw: '용량 (kW)', mw: '용량 (MW)' }[qtyMode]} *
              </Label>
              {/* 3단 토글: EA → kW → MW → EA */}
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-input bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
                onClick={() => {
                  const nextMode = ({ ea: 'kw', kw: 'mw', mw: 'ea' } as const)[qtyMode];
                  if (selectedItem && inputEa > 0) {
                    if (nextMode === 'ea') setQtyRaw(String(inputEa));
                    else if (nextMode === 'kw') setQtyRaw(((inputEa * selectedItem.spec_wp) / 1_000).toFixed(1));
                    else setQtyRaw(((inputEa * selectedItem.spec_wp) / 1_000_000).toFixed(3));
                  }
                  setQtyMode(nextMode);
                }}
              >
                {{ ea: 'EA → kW', kw: 'kW → MW', mw: 'MW → EA' }[qtyMode]}
              </button>
            </div>

            <div className="flex gap-2">
              {qtyMode === 'ea' ? (
                <Input
                  type="text"
                  inputMode="numeric"
                  value={qtyDisplayEa}
                  onChange={(e) => setQtyRaw(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="예) 33,000"
                  className="flex-1"
                />
              ) : (
                <Input
                  type="text"
                  inputMode="decimal"
                  value={qtyRaw}
                  onChange={(e) => setQtyRaw(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder={qtyMode === 'kw' ? '예) 600' : '예) 21.5'}
                  className="flex-1"
                />
              )}
              {/* 반대 단위 자동 표시 */}
              <div className="h-9 flex items-center rounded-md border bg-muted px-3 text-sm font-medium whitespace-nowrap min-w-[90px] justify-center">
                {selectedItem && inputEa > 0
                  ? qtyMode !== 'ea'
                    ? `${inputEa.toLocaleString('ko-KR')} EA`
                    : formatCapacityAuto(inputEa * selectedItem.spec_wp / 1000)
                  : <span className="text-muted-foreground font-normal text-xs">—</span>}
              </div>
            </div>
          </div>

          {/* ③-b B/L 연결 (원가 추적용, 필수) */}
          {selectedItem && bls.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                B/L 연결
                <span className="ml-1 text-muted-foreground font-normal text-xs">(원가 추적용, 필수)</span>
              </Label>
              <Select
                value={selectedBlId || '_none'}
                onValueChange={(v) => setSelectedBlId(v === '_none' ? '' : (v ?? ''))}
              >
                <SelectTrigger className="w-full">
                  <Txt
                    text={selectedBl
                      ? (() => {
                          const modLabel = moduleLabel(selectedItem?.manufacturer_name, selectedItem?.spec_wp);
                          const dateLabel = selectedBl.actual_arrival
                            ? `입항일: ${selectedBl.actual_arrival.slice(0, 10)}`
                            : `ETA: ${selectedBl.eta?.slice(0, 10) ?? '—'}`;
                          const stKo = ['completed','erp_done'].includes(selectedBl.status) ? '입고완료' : statusLabel(selectedBl.inbound_type, selectedBl.status);
                          const usdStr = blUsdPriceMap.has(selectedBlId)
                            ? ` | $${blUsdPriceMap.get(selectedBlId)!.toFixed(4)}/Wp`
                            : '';
                          return `[${stKo}] ${modLabel} | ${selectedBl.bl_number} | ${dateLabel}${usdStr}`;
                        })()
                      : ''}
                    placeholder="B/L을 선택해주세요"
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선택 안함</SelectItem>
                  {bls.map((b) => {
                    const modLabel = moduleLabel(selectedItem?.manufacturer_name, selectedItem?.spec_wp);
                    const dateLabel = b.actual_arrival
                      ? `입항일: ${b.actual_arrival.slice(0, 10)}`
                      : `ETA: ${b.eta?.slice(0, 10) ?? '—'}`;
                    const isCompleted = ['completed', 'erp_done'].includes(b.status);
                    const stKo = isCompleted ? '입고완료' : statusLabel(b.inbound_type, b.status);
                    return (
                      <SelectItem key={b.bl_id} value={b.bl_id}>
                        <span className={cn('text-xs font-medium mr-1.5', isCompleted ? 'text-green-600' : 'text-blue-600')}>
                          [{stKo}]
                        </span>
                        {modLabel} | {b.bl_number} | {dateLabel}
                        {blUsdPriceMap.has(b.bl_id) && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground">
                            ${blUsdPriceMap.get(b.bl_id)!.toFixed(4)}/Wp
                          </span>
                        )}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedBl && (() => {
                const bl = selectedBl;
                return (
                  <div className="rounded border bg-blue-50 px-3 py-1.5 text-[10px] text-blue-700 flex flex-wrap gap-x-4 gap-y-1">
                    {blUsdPriceMap.has(selectedBlId)
                      ? <span>수입단가: ${blUsdPriceMap.get(selectedBlId)!.toFixed(4)}/Wp</span>
                      : null}
                    <span>항구: {bl.port ?? '—'}</span>
                    <span>포워더: {bl.forwarder ?? '—'}</span>
                    {bl.exchange_rate && <span>환율: {bl.exchange_rate.toLocaleString('ko-KR')}</span>}
                    {blPriceMap.has(selectedBlId) && (
                      <span className="font-semibold text-blue-800">
                        원화원가: ₩{blPriceMap.get(selectedBlId)!.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/Wp
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ④ 배정 계획 (자동) */}
          {allocationPlan && selectedItem && (
            <div className={cn(
              'rounded-md border px-3 py-2.5 space-y-2',
              allocationPlan.type === 'insufficient' ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-muted/20',
            )}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">배정 계획</div>

              {allocationPlan.stockEa > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-medium">현재고</span>
                    <span className="font-medium">{allocationPlan.stockEa.toLocaleString()} EA</span>
                  </div>
                  <span className="text-muted-foreground text-xs">{formatCapacityAuto(allocationPlan.stockEa * selectedItem.spec_wp / 1000)}</span>
                </div>
              )}
              {allocationPlan.incomingEa > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">미착품</span>
                    <span className="font-medium">{allocationPlan.incomingEa.toLocaleString()} EA</span>
                  </div>
                  <span className="text-muted-foreground text-xs">{formatCapacityAuto(allocationPlan.incomingEa * selectedItem.spec_wp / 1000)}</span>
                </div>
              )}
              {allocationPlan.type !== 'stock_only' && (
                <div className="border-t pt-1.5 flex items-center justify-between text-sm font-semibold">
                  <span>합계</span>
                  <span>{inputEa.toLocaleString()} EA · {formatCapacityAuto(inputEa * selectedItem.spec_wp / 1000)}</span>
                </div>
              )}
              {allocationPlan.type === 'insufficient' && (
                <div className="flex items-center gap-1.5 text-xs text-destructive font-medium pt-0.5">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  현재고 + 미착품 합산 초과 — {allocationPlan.shortfallEa.toLocaleString()}EA 부족
                </div>
              )}
            </div>
          )}

          {/* ⑤ 거래처 / 현장 / 발주번호 */}
          {(purpose === 'construction_own' || purpose === 'construction_epc') ? (
            /* 공사 현장 선택 모드 */
            <div className="space-y-1.5">
              <Label>
                공사 현장 <span className="text-destructive">*</span>
              </Label>
              <SiteCombobox
                sites={sites}
                value={selectedSiteId}
                onChange={setSelectedSiteId}
                siteType={purpose === 'construction_own' ? 'own' : 'epc'}
                companyId={effectiveCompanyId ?? ''}
                onCreated={(site) => setSites((prev) => [...prev, site])}
              />
              {!selectedSiteId && (
                <p className="text-[11px] text-muted-foreground">
                  현장을 선택하거나 새로 등록하면 공급 이력으로 자동 연결됩니다
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {purpose === 'sale' ? (
                <>
                  <div className="space-y-1.5">
                    <Label>거래처명 <span className="text-destructive">*</span></Label>
                    <PartnerCombobox
                      partners={partners}
                      value={customerPartnerId}
                      onChange={setCustomerPartnerId}
                      placeholder="거래처 검색"
                      creatable
                      createType="customer"
                      onCreated={(partner) => setPartners((prev) => [...prev, partner])}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>현장명 <span className="text-muted-foreground text-xs">(선택)</span></Label>
                    <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="현장 이름" />
                  </div>
                </>
              ) : (
                /* other 또는 레거시 construction */
                <>
                  <div className="space-y-1.5">
                    <Label>현장명</Label>
                    <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="현장 이름" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>거래처명 <span className="text-muted-foreground text-xs">(선택)</span></Label>
                    <PartnerCombobox
                      partners={partners}
                      value={customerPartnerId}
                      onChange={setCustomerPartnerId}
                      placeholder="거래처 검색"
                      creatable
                      createType="customer"
                      onCreated={(partner) => setPartners((prev) => [...prev, partner])}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ⑤-b 발주번호 (판매 예정 시만) */}
          {purpose === 'sale' && (
            <div className="space-y-1.5">
              <Label>
                고객 발주번호
                <span className="ml-1 text-muted-foreground font-normal text-xs">(선택 — 수주 등록 시 자동 반영)</span>
              </Label>
              <Input
                value={customerOrderNo}
                onChange={(e) => setCustomerOrderNo(e.target.value)}
                placeholder="예) PO-2026-001"
              />
            </div>
          )}

          {/* ⑥ Wp당 예상 판매가 (판매 예정 시만 표시) */}
          {purpose === 'sale' && (
            <div className="space-y-1.5">
              <Label>
                Wp당 예상 판매가
                <span className="ml-1 text-muted-foreground font-normal text-xs">(₩/Wp, 선택)</span>
              </Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">₩</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={expectedPrice}
                    onChange={(e) => setExpectedPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="예) 250"
                    className="pl-6"
                  />
                </div>
                {/* 자동 계산: 총 예상 금액 */}
                {selectedItem && inputEa > 0 && expectedPrice && !isNaN(parseFloat(expectedPrice)) && parseFloat(expectedPrice) > 0 && (
                  <div className="h-9 flex items-center rounded-md border bg-muted px-3 text-xs whitespace-nowrap font-medium">
                    ₩{(inputEa * selectedItem.spec_wp * parseFloat(expectedPrice)).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ⑦ 무상스페어 (판매 예정 시만 표시) */}
          {purpose === 'sale' && (
            <div className="space-y-1.5">
              <Label>
                무상스페어 수량
                <span className="ml-1 text-muted-foreground font-normal text-xs">(EA, 선택 — 거래처 공급의무량)</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={freeSpareQty ? parseInt(freeSpareQty, 10).toLocaleString('ko-KR') : ''}
                  onChange={(e) => setFreeSpareQty(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="예) 5"
                  className="flex-1"
                />
                {selectedItem && freeSpareQty && parseInt(freeSpareQty, 10) > 0 && (
                  <div className="h-9 flex items-center rounded-md border bg-muted px-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatCapacityAuto(parseInt(freeSpareQty, 10) * selectedItem.spec_wp / 1000)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ⑧ 메모 */}
          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="특이사항, 조건 등" />
          </div>
        </div>
        </div>{/* 스크롤 영역 끝 */}

        {/* 고정 푸터 */}
        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            onClick={handleSave}
            disabled={saving || allocationPlan?.type === 'insufficient'}
          >
            {saving ? '저장 중...' : editData ? '수정 저장' : '예약 등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
