import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { ConstructionSiteCombobox } from '@/components/common/ConstructionSiteCombobox';
import { Check, ChevronDown, Lock, Search } from 'lucide-react';
import { cn, moduleLabel } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { confirmDialog } from '@/lib/dialogs';
import {
  RECEIPT_METHOD_LABEL, MANAGEMENT_CATEGORY_LABEL, FULFILLMENT_SOURCE_LABEL,
  type Order, type ReceiptMethod, type ManagementCategory, type FulfillmentSource,
} from '@/types/orders';
import type { Product, Partner, ConstructionSite, Manufacturer } from '@/types/masters';
import type { BLShipment, BLLineItem } from '@/types/inbound';
import type { InventoryItem, InventoryResponse } from '@/types/inventory';
import { statusLabel } from '@/types/inbound';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  order_number: z.string().optional(),
  customer_id: z.string().min(1, '거래처는 필수입니다'),
  order_date: z.string().min(1, '수주일은 필수입니다'),
  receipt_method: z.string().min(1, '접수방법은 필수입니다'),
  management_category: z.string().min(1, '관리구분은 필수입니다'),
  fulfillment_source: z.string().min(1, '충당소스는 필수입니다'),
  product_id: z.string().min(1, '품번은 필수입니다'),
  quantity: z.coerce.number().positive('양수 필수'),
  unit_price_wp: z.coerce.number().positive('양수 필수'),
  site_id: z.string().optional(),   // 공사현장 마스터 FK (nullable)
  site_name: z.string().optional(), // site_id에서 자동 채워지거나 레거시 직접 입력
  site_address: z.string().optional(),
  site_contact: z.string().optional(),
  site_phone: z.string().optional(),
  payment_terms: z.string().optional(),
  deposit_rate: z.coerce.number().optional().or(z.literal('')),
  delivery_due: z.string().optional(),
  spare_qty: z.coerce.number().optional().or(z.literal('')),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

type AvailabilityInfo = {
  stockKw: number;
  incomingKw: number;
  stockEa: number;
  incomingEa: number;
};

type BlCostInfo = {
  usdWp?: number;
  krwWp?: number;
  hasLine?: boolean;
};

type ProductInventoryOption = AvailabilityInfo & {
  product: Product;
  label: string;
  searchText: string;
};

type PaymentDueMode = 'days' | 'next_month_end' | 'next_next_month_end' | 'manual';

const PAYMENT_DUE_MODE_LABEL: Record<PaymentDueMode, string> = {
  days: '출고일 기준',
  next_month_end: '익월말',
  next_next_month_end: '익익월말',
  manual: '직접입력',
};

export interface OrderPrefillData {
  alloc_id?: string;
  company_id?: string;
  product_id?: string;
  quantity?: number;
  management_category?: string; // purpose → management_category 매핑
  fulfillment_source?: string;  // source_type → fulfillment_source 매핑
  customer_hint?: string;       // 거래처명으로 partner_id 자동 매칭 시도
  site_name?: string;
  order_number?: string;        // 고객 발주번호
  bl_id?: string;               // 사용예약에서 이어받은 BL (원가 추적용)
  expected_price_per_wp?: number;
  spare_qty?: number;
}

interface Props {
  // dialog 모드에서만 의미. inline 모드에서는 무시되며 부모가 마운트로 가시성을 제어.
  open?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onPrefillCancel?: () => void;
  editData?: Order | null;
  prefillData?: OrderPrefillData | null;
  variant?: 'dialog' | 'inline';
}

// 정수 천단위 포맷
function fmtInt(v: number | string | undefined): string {
  if (v === '' || v === undefined || v === null) return '';
  const n = typeof v === 'string' ? parseInt(v.replace(/[^0-9]/g, ''), 10) : Math.round(Number(v));
  return isNaN(n) ? '' : n.toLocaleString('ko-KR');
}

function formatUsdWp(v?: number): string {
  return v != null ? `$${v.toFixed(4)}/Wp` : '—';
}

function formatKrwWp(v?: number): string {
  return v != null ? `₩${v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}/Wp` : '—';
}

function formatKwField(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  return v.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatCapacityAuto(kw: number): string {
  if (!Number.isFinite(kw) || kw <= 0) return '0 kW';
  if (kw >= 1000) {
    return `${(kw / 1000).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MW`;
  }
  return `${kw.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kW`;
}

function normalizeRate(value: unknown): number | undefined {
  if (value === '' || value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : undefined;
}

function formatRate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildPaymentTerms(rateValue: unknown, mode: PaymentDueMode, daysText: string): string {
  const rate = normalizeRate(rateValue);
  if (rate != null && rate >= 100) return '현금 100%';

  let credit = '';
  if (mode === 'next_month_end') credit = '익월말';
  if (mode === 'next_next_month_end') credit = '익익월말';
  if (mode === 'days') {
    const days = Number(daysText.replace(/[^0-9]/g, ''));
    if (Number.isFinite(days) && days > 0) credit = `출고일+${days}일`;
  }

  if (rate != null && rate > 0) {
    return credit ? `현금 ${formatRate(rate)}% + 잔금 ${credit}` : `현금 ${formatRate(rate)}%`;
  }
  return credit;
}

function paymentModeFromTerms(terms?: string | null): PaymentDueMode {
  if (!terms) return 'days';
  if (terms.includes('익익월말')) return 'next_next_month_end';
  if (terms.includes('익월말')) return 'next_month_end';
  if (/(\+|신용)\s*\d+\s*일|출고일/.test(terms)) return 'days';
  return 'manual';
}

function creditDaysFromTerms(terms?: string | null): string {
  if (!terms) return '';
  const match = terms.match(/(?:출고일\+|신용\s*)(\d+)\s*일/);
  return match?.[1] ?? '';
}

function eaFromKw(kw: number, specWp?: number): number {
  return specWp && specWp > 0 ? Math.round((kw * 1000) / specWp) : 0;
}

function normalizeBusinessName(value?: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/주식회사|\(주\)|㈜|\(유\)|유한회사|\.|,|-/g, '');
}

function findPartnerByHint(partners: Partner[], hint?: string): Partner | undefined {
  const raw = hint?.trim();
  if (!raw) return undefined;
  const exact = partners.find((p) => p.partner_name.trim() === raw);
  if (exact) return exact;

  const normalizedHint = normalizeBusinessName(raw);
  const normalizedMatches = partners.filter((p) => normalizeBusinessName(p.partner_name) === normalizedHint);
  if (normalizedMatches.length === 1) return normalizedMatches[0];

  const fuzzyMatches = partners.filter((p) => {
    const candidate = normalizeBusinessName(p.partner_name);
    return candidate.includes(normalizedHint) || normalizedHint.includes(candidate);
  });
  return fuzzyMatches.length === 1 ? fuzzyMatches[0] : undefined;
}

function ProductInventoryCombobox({
  options,
  value,
  onChange,
  disabled = false,
  error = false,
  placeholder = '품목 검색',
}: {
  options: ProductInventoryOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.product.product_id === value);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.searchText.includes(needle));
  }, [options, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 드롭다운 open 시 활성 인덱스 초기화 (open prop 동기화)
    setActiveIndex(0);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 필터링 결과에 따라 활성 인덱스 클램프 (filtered.length 동기화)
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [activeIndex, filtered.length]);

  function selectOption(option: ProductInventoryOption) {
    onChange(option.product.product_id);
    setOpen(false);
    setSearch('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setSearch('');
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((idx) => (idx + 1) % filtered.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((idx) => (idx - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      selectOption(filtered[activeIndex] ?? filtered[0]);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-invalid={error}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setSearch('');
          }
        }}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60',
          error && 'border-destructive ring-3 ring-destructive/20',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex-1 truncate text-left">{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md"
          onKeyDown={handleKeyDown}
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="제조사, 규격, 품번, 모델명 검색"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-sm text-muted-foreground">가용 재고가 있는 품목이 없습니다.</div>
            ) : (
              filtered.map((option, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = value === option.product.product_id;
                return (
                  <button
                    key={option.product.product_id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => selectOption(option)}
                    className={cn(
                      'flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors',
                      isActive && 'bg-accent text-accent-foreground',
                      isSelected && !isActive && 'bg-accent/40',
                    )}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{option.label}</span>
                      <span className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <span>
                          실재고 <b className="text-green-700">{formatCapacityAuto(option.stockKw)}</b>
                          <span className="ml-1">{option.stockEa.toLocaleString('ko-KR')} EA</span>
                        </span>
                        <span>
                          미착품 <b className="text-blue-700">{formatCapacityAuto(option.incomingKw)}</b>
                          <span className="ml-1">{option.incomingEa.toLocaleString('ko-KR')} EA</span>
                        </span>
                      </span>
                    </span>
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

export default function OrderForm({ open = true, onOpenChange, onSubmit, onPrefillCancel, editData, prefillData, variant = 'dialog' }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const companies = useAppStore((s) => s.companies);
  const loadCompanies = useAppStore((s) => s.loadCompanies);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [formCompanyId, setFormCompanyId] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [blId, setBlId] = useState('');
  const [bls, setBls] = useState<BLShipment[]>([]);
  const [blCostMap, setBlCostMap] = useState<Map<string, BlCostInfo>>(new Map());
  const [resolvedPrefillCompanyId, setResolvedPrefillCompanyId] = useState<string | null>(null);
  // 천단위 표시용 display state
  const [qtyDisplay, setQtyDisplay] = useState('');
  const [spareQtyDisplay, setSpareQtyDisplay] = useState('');
  const [paymentDueMode, setPaymentDueMode] = useState<PaymentDueMode>('days');
  const [creditDaysDisplay, setCreditDaysDisplay] = useState('');

  const { register, handleSubmit, reset, setValue, watch, getValues, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

  const selectedProductId = watch('product_id');
  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const quantity = watch('quantity') || 0;
  const spareQty = Number(watch('spare_qty')) || 0;
  const capacityKw = selectedProduct ? quantity * selectedProduct.wattage_kw : 0;
  const fulfillmentSource = watch('fulfillment_source');
  const productMfg = (p?: Product | null) => {
    if (p?.manufacturers?.short_name || p?.manufacturers?.name_kr) return p.manufacturers;
    return manufacturers.find((m) => m.manufacturer_id === p?.manufacturer_id) ?? p?.manufacturer_name;
  };
  const productModuleText = (p?: Product | null) => p ? moduleLabel(productMfg(p), p.spec_wp) : '—';
  const productOptionText = (p?: Product | null) => p ? `${productModuleText(p)} | ${p.product_code} | ${p.product_name}` : '';
  const syncPaymentTerms = (
    nextMode = paymentDueMode,
    nextDays = creditDaysDisplay,
    nextRate: unknown = getValues('deposit_rate'),
  ) => {
    if (nextMode === 'manual') return;
    setValue('payment_terms', buildPaymentTerms(nextRate, nextMode, nextDays), { shouldDirty: true });
  };
  // 가용재고 배정 → 수주 자동 입력 모드 (일부 필드 잠금 + amber 표시)
  const isPrefill = !!(prefillData && !editData);
  const prefillCompanyId = prefillData?.company_id && prefillData.company_id !== 'all'
    ? prefillData.company_id
    : null;
  const editCompanyId = editData?.company_id && editData.company_id !== 'all'
    ? editData.company_id
    : null;
  const selectedCompanyValue = selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : null;
  const formCompanyValue = formCompanyId && formCompanyId !== 'all' ? formCompanyId : null;
  const effectiveCompanyId = editCompanyId || (isPrefill
    ? (prefillCompanyId || resolvedPrefillCompanyId || selectedCompanyValue)
    : (formCompanyValue || selectedCompanyValue));
  const effectiveCompanyName = effectiveCompanyId
    ? (companies.find((company) => company.company_id === effectiveCompanyId)?.company_name ?? '—')
    : '';
  const inventoryByProductId = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    inventoryItems.forEach((item) => map.set(item.product_id, item));
    return map;
  }, [inventoryItems]);
  const productInventoryOptions = useMemo<ProductInventoryOption[]>(() => (
    products
      .map((product) => {
        const item = inventoryByProductId.get(product.product_id);
        const stockKw = item?.available_kw ?? 0;
        const incomingKw = item?.available_incoming_kw ?? 0;
        const specWp = product.spec_wp ?? item?.spec_wp;
        const label = productOptionText(product);
        return {
          product,
          label,
          searchText: [
            label,
            product.product_code,
            product.product_name,
            productModuleText(product),
            String(product.spec_wp ?? ''),
            product.manufacturer_name ?? '',
            product.manufacturers?.short_name ?? '',
            product.manufacturers?.name_kr ?? '',
            product.manufacturers?.name_en ?? '',
          ].join(' ').toLowerCase(),
          stockKw,
          incomingKw,
          stockEa: eaFromKw(stockKw, specWp),
          incomingEa: eaFromKw(incomingKw, specWp),
        };
      })
      .filter((option) => (
        isPrefill ||
        !!editData ||
        option.product.product_id === selectedProductId ||
        option.stockKw > 0 ||
        option.incomingKw > 0
      ))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- productOptionText/productModuleText는 매 렌더 재생성되는 내부 헬퍼이므로 deps 추가 시 무한 루프
  ), [products, inventoryByProductId, isPrefill, editData, selectedProductId, manufacturers]);
  const selectedInventoryOption = productInventoryOptions.find((option) => option.product.product_id === selectedProductId);
  const inventoryInfo: AvailabilityInfo | null = useMemo(() => (
    selectedInventoryOption
      ? {
        stockKw: selectedInventoryOption.stockKw,
        incomingKw: selectedInventoryOption.incomingKw,
        stockEa: selectedInventoryOption.stockEa,
        incomingEa: selectedInventoryOption.incomingEa,
      }
      : null
  ), [selectedInventoryOption]);
  const currentSourceKw = fulfillmentSource === 'incoming'
    ? inventoryInfo?.incomingKw ?? 0
    : inventoryInfo?.stockKw ?? 0;
  const currentSourceEa = fulfillmentSource === 'incoming'
    ? inventoryInfo?.incomingEa ?? 0
    : inventoryInfo?.stockEa ?? 0;
  const sourceBls = useMemo(() => {
    if (!selectedProductId || !fulfillmentSource) return [];
    const allowedStatuses = fulfillmentSource === 'incoming'
      ? ['shipping', 'arrived', 'customs']
      : ['completed', 'erp_done'];
    return bls.filter((bl) => allowedStatuses.includes(bl.status) && blCostMap.get(bl.bl_id)?.hasLine);
  }, [bls, blCostMap, fulfillmentSource, selectedProductId]);
  const prefillResetKey = prefillData
    ? [
      prefillData.alloc_id,
      prefillData.company_id,
      prefillData.product_id,
      prefillData.quantity,
      prefillData.management_category,
      prefillData.fulfillment_source,
      prefillData.customer_hint,
      prefillData.site_name,
      prefillData.order_number,
      prefillData.bl_id,
      prefillData.expected_price_per_wp,
      prefillData.spare_qty,
    ].map((v) => v ?? '').join('\u001f')
    : '';

  useEffect(() => {
    setResolvedPrefillCompanyId(null);
    if (!open || !isPrefill || prefillCompanyId || !prefillData?.alloc_id) return;
    let cancelled = false;
    fetchWithAuth<{ company_id?: string }>(`/api/v1/inventory/allocations/${prefillData.alloc_id}`)
      .then((alloc) => {
        if (!cancelled && alloc.company_id) setResolvedPrefillCompanyId(alloc.company_id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, isPrefill, prefillData?.alloc_id, prefillCompanyId]);

  useEffect(() => {
    void loadCompanies();
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active)))
      .catch(() => {});
    if (effectiveCompanyId && effectiveCompanyId !== 'all') {
      fetchWithAuth<ConstructionSite[]>(`/api/v1/construction-sites?company_id=${effectiveCompanyId}`)
        .then(setSites).catch(() => {});
    } else {
      setSites([]);
    }
  }, [effectiveCompanyId, loadCompanies]);

  useEffect(() => {
    if (!effectiveCompanyId || effectiveCompanyId === 'all') {
      setInventoryItems([]);
      return;
    }
    let cancelled = false;
    fetchWithAuth<InventoryResponse>('/api/v1/calc/inventory', {
      method: 'POST',
      body: JSON.stringify({ company_id: effectiveCompanyId }),
    })
      .then((result) => {
        if (!cancelled) setInventoryItems(result.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setInventoryItems([]);
      });
    return () => { cancelled = true; };
  }, [effectiveCompanyId]);

  // 품번 선택 시 해당 제조사의 입고완료 BL 목록 로드
  useEffect(() => {
    if (!selectedProduct?.manufacturer_id) { setBls([]); return; }
    fetchWithAuth<BLShipment[]>(`/api/v1/bls?manufacturer_id=${selectedProduct.manufacturer_id}`)
      .then((list) => setBls((list ?? []).filter((b) => ['shipping', 'arrived', 'customs', 'completed', 'erp_done'].includes(b.status))))
      .catch(() => setBls([]));
  }, [selectedProduct?.manufacturer_id]);

  // B/L별 해당 품목의 원가 단가 조회 (수주에서 원가 추적 확인용)
  useEffect(() => {
    if (!selectedProductId || bls.length === 0) {
      setBlCostMap(new Map());
      return;
    }

    let cancelled = false;
    Promise.all(
      bls.map((bl) =>
        fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${bl.bl_id}/lines`)
          .then((lines): [string, BlCostInfo] => {
            const line = lines.find((l) => l.product_id === selectedProductId);
            const usdWp = line?.unit_price_usd_wp;
            const krwWp = line?.unit_price_krw_wp ?? (
              usdWp != null && bl.exchange_rate ? usdWp * bl.exchange_rate : undefined
            );
            return [bl.bl_id, { usdWp, krwWp, hasLine: !!line }];
          })
          .catch((): [string, BlCostInfo] => [bl.bl_id, { hasLine: false }]),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setBlCostMap(new Map(entries.filter(([, cost]) => cost.hasLine)));
    });

    return () => { cancelled = true; };
  }, [bls, selectedProductId]);

  // 예약 전환이 미착품으로 넘어왔어도 현재 실재고가 충분하면 실재고를 우선합니다.
  useEffect(() => {
    if (!open || !isPrefill || !selectedProductId || fulfillmentSource !== 'incoming' || capacityKw <= 0 || !inventoryInfo) return;
    if (inventoryInfo.stockKw + 0.001 >= capacityKw) {
      setValue('fulfillment_source', 'stock', { shouldDirty: true });
    }
  }, [open, isPrefill, selectedProductId, fulfillmentSource, capacityKw, inventoryInfo, setValue]);

  useEffect(() => {
    if (!open || isPrefill || editData || !selectedProductId || fulfillmentSource || !inventoryInfo) return;
    if (inventoryInfo.stockKw > 0) {
      setValue('fulfillment_source', 'stock', { shouldDirty: true, shouldValidate: true });
    } else if (inventoryInfo.incomingKw > 0) {
      setValue('fulfillment_source', 'incoming', { shouldDirty: true, shouldValidate: true });
    }
  }, [open, isPrefill, editData, selectedProductId, fulfillmentSource, inventoryInfo, setValue]);

  useEffect(() => {
    if (!open || editData || isPrefill) return;
    setBlId('');
  }, [open, editData, isPrefill, selectedProductId, fulfillmentSource]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        setFormCompanyId(editData.company_id ?? '');
        reset({
          order_number: editData.order_number ?? '',
          customer_id: editData.customer_id,
          order_date: editData.order_date?.slice(0, 10) ?? '',
          receipt_method: editData.receipt_method,
          management_category: editData.management_category,
          fulfillment_source: editData.fulfillment_source,
          product_id: editData.product_id,
          quantity: editData.quantity,
          unit_price_wp: editData.unit_price_wp,
          site_id: editData.site_id ?? '',
          site_name: editData.site_name ?? '',
          site_address: editData.site_address ?? '',
          site_contact: editData.site_contact ?? '',
          site_phone: editData.site_phone ?? '',
          payment_terms: editData.payment_terms ?? '',
          deposit_rate: editData.deposit_rate ?? '',
          delivery_due: editData.delivery_due?.slice(0, 10) ?? '',
          spare_qty: editData.spare_qty ?? '',
          memo: editData.memo ?? '',
        });
        setQtyDisplay(fmtInt(editData.quantity));
        setSpareQtyDisplay(fmtInt(editData.spare_qty));
        setBlId(editData.bl_id ?? '');
        setPaymentDueMode(paymentModeFromTerms(editData.payment_terms));
        setCreditDaysDisplay(creditDaysFromTerms(editData.payment_terms));
      } else if (prefillData) {
        setFormCompanyId(prefillCompanyId ?? '');
        // 가용재고 배정에서 넘어온 경우 — 품목/수량/관리구분/충당소스/발주번호 자동 입력
        const today = new Date().toISOString().slice(0, 10);
        reset({
          order_number: prefillData.order_number ?? '',
          customer_id: '', order_date: today,
          receipt_method: '',
          management_category: prefillData.management_category ?? '',
          fulfillment_source: prefillData.fulfillment_source ?? '',
          product_id: prefillData.product_id ?? '',
          quantity: prefillData.quantity ?? ('' as unknown as number),
          unit_price_wp: prefillData.expected_price_per_wp ?? ('' as unknown as number),
          site_id: '',
          site_name: prefillData.site_name ?? '',
          site_address: '', site_contact: '', site_phone: '',
          payment_terms: '', deposit_rate: '', delivery_due: '', spare_qty: prefillData.spare_qty ?? '', memo: '',
        });
        setQtyDisplay(prefillData.quantity ? prefillData.quantity.toLocaleString('ko-KR') : '');
        setSpareQtyDisplay(prefillData.spare_qty ? prefillData.spare_qty.toLocaleString('ko-KR') : '');
        setBlId(prefillData.bl_id ?? '');
        setPaymentDueMode('days');
        setCreditDaysDisplay('');
      } else {
        setFormCompanyId(selectedCompanyValue ?? '');
        const today = new Date().toISOString().slice(0, 10);
        reset({
          order_number: '', customer_id: '', order_date: today,
          receipt_method: '', management_category: '', fulfillment_source: '',
          product_id: '', quantity: '' as unknown as number, unit_price_wp: '' as unknown as number,
          site_id: '', site_name: '', site_address: '', site_contact: '', site_phone: '',
          payment_terms: '', deposit_rate: '', delivery_due: '', spare_qty: '', memo: '',
        });
        setQtyDisplay('');
        setSpareQtyDisplay('');
        setBlId('');
        setPaymentDueMode('days');
        setCreditDaysDisplay('');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- prefillData는 prefillResetKey로 동기화 (변경 시점만 trigger)
  }, [open, editData, prefillResetKey, prefillCompanyId, reset, selectedCompanyValue]);

  // prefill: 거래처 이름 → partner_id 자동 매칭 (partners 로드 완료 후)
  useEffect(() => {
    if (!open || !prefillData?.customer_hint || !partners.length || editData) return;
    // 이미 customer_id가 설정된 경우 덮어쓰지 않음
    if (getValues('customer_id')) return;
    const matched = findPartnerByHint(partners, prefillData.customer_hint);
    if (matched) setValue('customer_id', matched.partner_id, { shouldValidate: true, shouldDirty: true });
  }, [prefillData?.alloc_id, prefillData?.customer_hint, partners, open, editData, getValues, setValue]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    if (!effectiveCompanyId || effectiveCompanyId === 'all') {
      setSubmitError(editData
        ? '수주 법인을 확인할 수 없습니다. 수주 상세를 새로고침한 뒤 다시 시도해주세요.'
        : isPrefill
          ? '수주 법인을 확인할 수 없습니다. 가용재고 화면에서 다시 수주 전환을 시작해주세요.'
          : '상단에서 수주 법인을 먼저 선택해주세요.');
      return;
    }

    let fulfillmentSourceForSave = data.fulfillment_source;
    if (isPrefill && selectedProductId) {
      try {
        const inv = await fetchWithAuth<InventoryResponse>('/api/v1/calc/inventory', {
          method: 'POST',
          body: JSON.stringify({ company_id: effectiveCompanyId }),
        });
        const item = inv.items.find((it) => it.product_id === selectedProductId);
        const stockKw = item?.available_kw ?? 0;
        if (data.fulfillment_source === 'incoming' && stockKw + 0.001 >= capacityKw) {
          fulfillmentSourceForSave = 'stock';
          setValue('fulfillment_source', 'stock', { shouldDirty: true });
        } else if (data.fulfillment_source === 'stock' && stockKw + 0.001 < capacityKw) {
          const incomingKw = item?.available_incoming_kw ?? 0;
          const useIncoming = await confirmDialog({
            title: '실재고 부족 — 미착품으로 등록할까요?',
            description:
              `필요: ${formatKwField(capacityKw)} kW / 가용 실재고: ${formatKwField(stockKw)} kW\n\n` +
              '확인을 누르면 미착품 기준으로 수주 등록하고, 예약의 충당소스도 미착품으로 전환합니다.\n' +
              '취소를 누르면 등록을 중단합니다.',
            confirmLabel: '미착품으로 등록',
          });
          if (!useIncoming) {
            setSubmitError('실재고 부족으로 수주 등록을 중단했습니다. 가용재고에서 예약을 조정한 뒤 다시 진행해주세요.');
            return;
          }
          if (incomingKw + 0.001 < capacityKw) {
            setSubmitError(`미착품 가용량도 부족합니다. 가용 미착품: ${formatKwField(incomingKw)} kW`);
            return;
          }
          fulfillmentSourceForSave = 'incoming';
          setValue('fulfillment_source', 'incoming', { shouldDirty: true });
        }
      } catch {
        setSubmitError('수주시점 재고 확인에 실패했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
    }

    if (!editData && selectedProduct && capacityKw > 0) {
      const availableKw = fulfillmentSourceForSave === 'incoming'
        ? inventoryInfo?.incomingKw ?? 0
        : inventoryInfo?.stockKw ?? 0;
      if (availableKw + 0.001 < capacityKw) {
        setSubmitError(
          `${FULFILLMENT_SOURCE_LABEL[fulfillmentSourceForSave as FulfillmentSource] ?? '선택한 충당소스'} 가용량이 부족합니다. ` +
          `필요: ${formatCapacityAuto(capacityKw)} / 가용: ${formatCapacityAuto(availableKw)}`,
        );
        return;
      }
    }

    if (selectedProduct && ['stock', 'incoming'].includes(fulfillmentSourceForSave) && !blId) {
      setSubmitError(sourceBls.length === 0
        ? '선택한 품목과 충당소스에 연결 가능한 B/L이 없습니다. 입고/선적 데이터를 먼저 확인해주세요.'
        : 'B/L 연결은 원가 추적을 위해 필수입니다.');
      return;
    }

    const payload: Record<string, unknown> = {
      ...data,
      company_id: effectiveCompanyId,
      capacity_kw: capacityKw,
      fulfillment_source: fulfillmentSourceForSave,
      status: editData?.status ?? 'received',
    };
    if (blId) payload.bl_id = blId;
    if (!data.order_number) delete payload.order_number;
    if (data.deposit_rate === '' || data.deposit_rate === undefined) delete payload.deposit_rate;
    if (data.spare_qty === '' || data.spare_qty === undefined || Number(data.spare_qty) <= 0) delete payload.spare_qty;
    if (!data.delivery_due) delete payload.delivery_due;
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  const requestOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isPrefill) onPrefillCancel?.();
    onOpenChange(nextOpen);
  };

  const isInline = variant === 'inline';

  const body = (
    <>
        <form onSubmit={handleSubmit(handle)} className={isInline ? '' : 'flex min-h-0 flex-1 flex-col'}>
          <div className={isInline ? 'space-y-4' : 'flex-1 space-y-4 overflow-y-auto px-5 py-4'}>
          {isPrefill && (
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-medium">가용재고 예약에서 수주 전환</div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-slate-600">
                {prefillData.customer_hint && <span>거래처 <b>{prefillData.customer_hint}</b></span>}
                <span>관리구분 <b>{MANAGEMENT_CATEGORY_LABEL[watch('management_category') as ManagementCategory] ?? '—'}</b></span>
                <span>충당소스 <b>{FULFILLMENT_SOURCE_LABEL[fulfillmentSource as FulfillmentSource] ?? '—'}</b></span>
              </div>
            </div>
          )}
          {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
          {!isPrefill && (
            <div className="space-y-3 rounded-md border bg-slate-50/70 p-3">
              <div>
                <Label className="font-medium">재고 기준 선택</Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  수주 신규등록은 품목을 먼저 선택한 뒤 가용 실재고와 가용 미착품을 확인합니다.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>판매법인 *</Label>
                {editData ? (
                  <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm select-none">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    <span className="truncate">{effectiveCompanyName || '—'}</span>
                  </div>
                ) : (
                  <Select
                    value={effectiveCompanyId ?? ''}
                    onValueChange={(v) => {
                      setFormCompanyId(v ?? '');
                      setValue('product_id', '', { shouldDirty: true, shouldValidate: true });
                      setValue('fulfillment_source', '', { shouldDirty: true, shouldValidate: true });
                      setValue('quantity', '' as unknown as number, { shouldDirty: true, shouldValidate: true });
                      setQtyDisplay('');
                      setBlId('');
                    }}
                  >
                    <SelectTrigger>
                      <Txt text={effectiveCompanyName} placeholder="법인 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.company_id} value={company.company_id}>
                          {company.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!effectiveCompanyId && (
                  <p className="text-[11px] text-amber-700">먼저 판매법인을 선택하면 해당 법인의 가용재고만 표시됩니다.</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>충당소스 *</Label>
                  <Select
                    value={watch('fulfillment_source') ?? ''}
                    disabled={!effectiveCompanyId}
                    onValueChange={(v) => setValue('fulfillment_source', v ?? '', { shouldValidate: true, shouldDirty: true })}
                  >
                    <SelectTrigger><Txt text={FULFILLMENT_SOURCE_LABEL[watch('fulfillment_source') as FulfillmentSource] ?? ''} /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(FULFILLMENT_SOURCE_LABEL) as [FulfillmentSource, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.fulfillment_source && <p className="text-xs text-destructive">{errors.fulfillment_source.message}</p>}
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label>품번/규격 검색 *</Label>
                  <ProductInventoryCombobox
                    options={productInventoryOptions}
                    value={watch('product_id') ?? ''}
                    onChange={(v) => {
                      setValue('product_id', v, { shouldValidate: true, shouldDirty: true });
                      setBlId('');
                    }}
                    disabled={!effectiveCompanyId}
                    error={!!errors.product_id}
                    placeholder={effectiveCompanyId ? '제조사, 규격, 품번, 모델명으로 검색' : '법인 선택 후 품목 검색'}
                  />
                  {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
                </div>
              </div>

              {selectedProduct ? (
                <>
                  <div className="grid grid-cols-1 gap-2 rounded-md border bg-background px-3 py-2 text-xs sm:grid-cols-2">
                    <div>
                      <div className="text-muted-foreground">가용 실재고</div>
                      <div className="font-semibold text-green-700">{formatCapacityAuto(inventoryInfo?.stockKw ?? 0)}</div>
                      <div className="text-[10px] text-muted-foreground">{(inventoryInfo?.stockEa ?? 0).toLocaleString('ko-KR')} EA</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">가용 미착품</div>
                      <div className="font-semibold text-blue-700">{formatCapacityAuto(inventoryInfo?.incomingKw ?? 0)}</div>
                      <div className="text-[10px] text-muted-foreground">{(inventoryInfo?.incomingEa ?? 0).toLocaleString('ko-KR')} EA</div>
                    </div>
                    {fulfillmentSource && (
                      <div className="sm:col-span-2 text-[11px] text-muted-foreground">
                        선택 기준 가용: <b>{formatCapacityAuto(currentSourceKw)}</b> · {currentSourceEa.toLocaleString('ko-KR')} EA
                      </div>
                    )}
                  </div>

                  {fulfillmentSource && (
                    <div className="space-y-1.5">
                      <Label>
                        B/L 연결
                        <span className="ml-1 text-xs font-normal text-muted-foreground">(원가 추적용, 필수)</span>
                      </Label>
                      <Select value={blId || '_none'} onValueChange={(v) => setBlId(v === '_none' ? '' : (v ?? ''))}>
                        <SelectTrigger className="w-full">
                          <span className={`flex flex-1 text-left truncate ${blId ? '' : 'text-muted-foreground'}`}>
                            {blId ? (() => {
                              const bl = bls.find(b => b.bl_id === blId);
                              if (!bl) return blId.slice(0, 8);
                              const date = bl.actual_arrival?.slice(0, 10) ?? bl.eta?.slice(0, 10) ?? '—';
                              const stKo = statusLabel(bl.inbound_type, bl.status);
                              return `${productModuleText(selectedProduct)} | ${bl.bl_number} | ${date} | ${stKo}`;
                            })() : (sourceBls.length ? 'B/L 선택' : '연결 가능한 B/L 없음')}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {sourceBls.map((b) => {
                            const date = b.actual_arrival?.slice(0, 10) ?? b.eta?.slice(0, 10) ?? '—';
                            const stKo = statusLabel(b.inbound_type, b.status);
                            const isCompleted = ['completed', 'erp_done'].includes(b.status);
                            return (
                              <SelectItem key={b.bl_id} value={b.bl_id}>
                                <span className={`text-xs font-medium mr-1.5 ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}>[{stKo}]</span>
                                {productModuleText(selectedProduct)} | {b.bl_number} | {date}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {sourceBls.length === 0 && (
                        <p className="text-[11px] text-amber-700">선택한 품목과 충당소스에 맞는 B/L 후보가 없습니다.</p>
                      )}
                      {blId && (() => {
                        const bl = bls.find(b => b.bl_id === blId);
                        if (!bl) return null;
                        const cost = blCostMap.get(bl.bl_id);
                        return (
                          <div className="flex flex-wrap gap-x-4 gap-y-1 rounded border bg-blue-50 px-3 py-1.5 text-[10px] text-blue-700">
                            <span className="font-semibold">원화원가: {formatKrwWp(cost?.krwWp)}</span>
                            <span>수입단가: {formatUsdWp(cost?.usdWp)}</span>
                            <span>항구: {bl.port ?? '—'}</span>
                            <span>포워더: {bl.forwarder ?? '—'}</span>
                            <span>ETA: {bl.eta?.slice(0, 10) ?? '—'}</span>
                            {bl.exchange_rate && <span>환율: {bl.exchange_rate.toLocaleString('ko-KR')}</span>}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>유상 수량 *</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        disabled={!selectedProduct}
                        value={qtyDisplay}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const num = raw ? parseInt(raw, 10) : undefined;
                          setQtyDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                          setValue('quantity', (num ?? '') as unknown as number, { shouldDirty: true, shouldValidate: true });
                        }}
                        placeholder="0"
                      />
                      {spareQty > 0 && (
                        <p className="text-[10px] text-orange-600">
                          무상 {spareQty.toLocaleString('ko-KR')} EA 별도 · 총 공급 {(Number(quantity) + spareQty).toLocaleString('ko-KR')} EA
                        </p>
                      )}
                      {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label>용량</Label>
                      <div className="flex h-9 items-center justify-end rounded-md border bg-background px-3 text-sm font-medium tabular-nums text-slate-800">
                        {selectedProduct ? formatCapacityAuto(capacityKw) : '품목 선택 후 자동 계산'}
                      </div>
                      <p className="text-[10px] text-muted-foreground">유상 수량 기준 자동 계산</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Wp단가 *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        disabled={!selectedProduct}
                        {...register('unit_price_wp')}
                      />
                      {errors.unit_price_wp && <p className="text-xs text-destructive">{errors.unit_price_wp.message}</p>}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-dashed bg-background px-3 py-4 text-center text-sm text-muted-foreground">
                  품목을 선택하면 가용 실재고, 가용 미착품, B/L 후보와 수량 입력이 열립니다.
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>발주번호</Label>
              <Input {...register('order_number')} placeholder="없으면 비워두세요" />
            </div>
            <div className="space-y-1.5">
              <Label>수주일 *</Label>
              <DateInput value={watch('order_date') ?? ''} onChange={(v) => setValue('order_date', v, { shouldDirty: true })} />
              {errors.order_date && <p className="text-xs text-destructive">{errors.order_date.message}</p>}
            </div>
          </div>

          {!isPrefill && (
            <>
              <div className="space-y-1.5">
                <Label>거래처 *</Label>
                <PartnerCombobox
                  partners={partners}
                  value={watch('customer_id') ?? ''}
                  onChange={(v) => setValue('customer_id', v, { shouldValidate: true, shouldDirty: true })}
                  error={!!errors.customer_id}
                  creatable
                  createType="customer"
                  onCreated={(partner) => setPartners((prev) => [...prev, partner])}
                />
                {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>접수방법 *</Label>
                  <Select value={watch('receipt_method') ?? ''} onValueChange={(v) => setValue('receipt_method', v ?? '', { shouldValidate: true, shouldDirty: true })}>
                    <SelectTrigger>
                      <Txt text={RECEIPT_METHOD_LABEL[watch('receipt_method') as ReceiptMethod] ?? ''} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(RECEIPT_METHOD_LABEL) as [ReceiptMethod, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.receipt_method && <p className="text-xs text-destructive">{errors.receipt_method.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>관리구분 *</Label>
                  <Select value={watch('management_category') ?? ''} onValueChange={(v) => setValue('management_category', v ?? '', { shouldValidate: true, shouldDirty: true })}>
                    <SelectTrigger>
                      <Txt text={MANAGEMENT_CATEGORY_LABEL[watch('management_category') as ManagementCategory] ?? ''} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(MANAGEMENT_CATEGORY_LABEL) as [ManagementCategory, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.management_category && <p className="text-xs text-destructive">{errors.management_category.message}</p>}
                </div>
              </div>
            </>
          )}

          {isPrefill && (
            <>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              거래처 *
              {isPrefill && !watch('customer_id') && (
                <span className="text-amber-600 text-[10px] font-normal">← 입력 필요</span>
              )}
            </Label>
            <PartnerCombobox
              partners={partners}
              value={watch('customer_id') ?? ''}
              onChange={(v) => setValue('customer_id', v, { shouldValidate: true })}
              error={!!errors.customer_id}
              creatable
              createType="customer"
              onCreated={(partner) => setPartners((prev) => [...prev, partner])}
            />
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                접수방법 *
                {isPrefill && !watch('receipt_method') && (
                  <span className="text-amber-600 text-[10px] font-normal">← 입력 필요</span>
                )}
              </Label>
              <Select value={watch('receipt_method') ?? ''} onValueChange={(v) => setValue('receipt_method', v ?? '')}>
                <SelectTrigger className={cn(
                  isPrefill && !watch('receipt_method') && 'ring-2 ring-amber-400/70 border-amber-400',
                )}>
                  <Txt text={RECEIPT_METHOD_LABEL[watch('receipt_method') as ReceiptMethod] ?? ''} />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(RECEIPT_METHOD_LABEL) as [ReceiptMethod, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.receipt_method && <p className="text-xs text-destructive">{errors.receipt_method.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>관리구분 *</Label>
              {isPrefill ? (
                <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm select-none">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  <span className="flex-1 truncate">{MANAGEMENT_CATEGORY_LABEL[watch('management_category') as ManagementCategory] ?? '—'}</span>
                </div>
              ) : (
                <Select value={watch('management_category') ?? ''} onValueChange={(v) => setValue('management_category', v ?? '')}>
                  <SelectTrigger><Txt text={MANAGEMENT_CATEGORY_LABEL[watch('management_category') as ManagementCategory] ?? ''} /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(MANAGEMENT_CATEGORY_LABEL) as [ManagementCategory, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {errors.management_category && !isPrefill && <p className="text-xs text-destructive">{errors.management_category.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>충당소스 *</Label>
            {isPrefill ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm select-none">
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded',
                  fulfillmentSource === 'stock'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700',
                )}>
                  {FULFILLMENT_SOURCE_LABEL[fulfillmentSource as FulfillmentSource] ?? '—'}
                </span>
              </div>
            ) : (
              <>
                <Select value={watch('fulfillment_source') ?? ''} onValueChange={(v) => setValue('fulfillment_source', v ?? '')}>
                  <SelectTrigger><Txt text={FULFILLMENT_SOURCE_LABEL[watch('fulfillment_source') as FulfillmentSource] ?? ''} /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(FULFILLMENT_SOURCE_LABEL) as [FulfillmentSource, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
            {inventoryInfo && (
              <div className="grid grid-cols-1 gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs sm:grid-cols-2">
                <div>
                  <div className="text-muted-foreground">가용 실재고</div>
                  <div className="font-semibold text-green-700">{formatCapacityAuto(inventoryInfo.stockKw)}</div>
                  <div className="text-[10px] text-muted-foreground">{inventoryInfo.stockEa.toLocaleString('ko-KR')} EA</div>
                </div>
                <div>
                  <div className="text-muted-foreground">가용 미착품</div>
                  <div className="font-semibold text-blue-700">{formatCapacityAuto(inventoryInfo.incomingKw)}</div>
                  <div className="text-[10px] text-muted-foreground">{inventoryInfo.incomingEa.toLocaleString('ko-KR')} EA</div>
                </div>
              </div>
            )}
            {errors.fulfillment_source && !isPrefill && <p className="text-xs text-destructive">{errors.fulfillment_source.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>품번 *</Label>
            {isPrefill ? (
              selectedProduct && (
                <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/20 p-2 text-xs sm:grid-cols-3">
                  <div><div className="text-muted-foreground">제조사/규격</div><div className="font-medium">{productModuleText(selectedProduct)}</div></div>
                  <div><div className="text-muted-foreground">품번</div><div className="font-medium truncate">{selectedProduct.product_code}</div></div>
                  <div><div className="text-muted-foreground">모델명</div><div className="font-medium truncate">{selectedProduct.product_name}</div></div>
                </div>
              )
            ) : (
              <Select value={watch('product_id') ?? ''} onValueChange={(v) => setValue('product_id', v ?? '')}>
                <SelectTrigger><Txt text={(() => { const p = products.find(p => p.product_id === watch('product_id')); return productOptionText(p); })()} /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.product_id} value={p.product_id}>
                      {productOptionText(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.product_id && !isPrefill && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
            {selectedProduct && !isPrefill && (
              <div className="grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-2 text-xs sm:grid-cols-3">
                <div><div className="text-muted-foreground">제조사/규격</div><div className="font-medium">{productModuleText(selectedProduct)}</div></div>
                <div><div className="text-muted-foreground">품번</div><div className="font-medium truncate">{selectedProduct.product_code}</div></div>
                <div><div className="text-muted-foreground">모델명</div><div className="font-medium truncate">{selectedProduct.product_name}</div></div>
              </div>
            )}
          </div>

          {/* B/L 연결 — 원가 추적용, 품번 선택 후 표시 */}
          {selectedProduct && bls.length > 0 && (
            <div className="space-y-1.5">
              <Label>
                B/L 연결
                <span className="ml-1 text-muted-foreground font-normal text-xs">(원가 추적용, 필수)</span>
              </Label>
              <Select value={blId || '_none'} onValueChange={(v) => setBlId(v === '_none' ? '' : (v ?? ''))}>
                <SelectTrigger className="w-full">
                  <span className={`flex flex-1 text-left truncate ${blId ? '' : 'text-muted-foreground'}`}>
                    {blId ? (() => {
                      const bl = bls.find(b => b.bl_id === blId);
                      if (!bl) return blId.slice(0, 8);
                      const date = bl.actual_arrival?.slice(0, 10) ?? bl.eta?.slice(0, 10) ?? '—';
                      const stKo = statusLabel(bl.inbound_type, bl.status);
                      return `${productModuleText(selectedProduct)} | ${bl.bl_number} | ${date} | ${stKo}`;
                    })() : 'B/L 선택 안함'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">선택 안함</SelectItem>
                  {bls.map((b) => {
                    const date = b.actual_arrival?.slice(0, 10) ?? b.eta?.slice(0, 10) ?? '—';
                    const stKo = statusLabel(b.inbound_type, b.status);
                    const isCompleted = ['completed', 'erp_done'].includes(b.status);
                    return (
                      <SelectItem key={b.bl_id} value={b.bl_id}>
                        <span className={`text-xs font-medium mr-1.5 ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}>[{stKo}]</span>
                        {productModuleText(selectedProduct)} | {b.bl_number} | {date}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {blId && (() => {
                const bl = bls.find(b => b.bl_id === blId);
                if (!bl) return null;
                const cost = blCostMap.get(bl.bl_id);
                return (
                  <div className="rounded border bg-blue-50 px-3 py-1.5 text-[10px] text-blue-700 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="font-semibold">원화원가: {formatKrwWp(cost?.krwWp)}</span>
                    <span>수입단가: {formatUsdWp(cost?.usdWp)}</span>
                    <span>항구: {bl.port ?? '—'}</span>
                    <span>포워더: {bl.forwarder ?? '—'}</span>
                    <span>ETA: {bl.eta?.slice(0, 10) ?? '—'}</span>
                    {bl.exchange_rate && <span>환율: {bl.exchange_rate.toLocaleString('ko-KR')}</span>}
                  </div>
                );
              })()}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>유상 수량 *</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={qtyDisplay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  const num = raw ? parseInt(raw, 10) : undefined;
                  setQtyDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                  setValue('quantity', (num ?? '') as unknown as number, { shouldDirty: true });
                }}
                placeholder="0"
              />
              {isPrefill && (
                <p className="text-[10px] text-muted-foreground">예약 유상 수량 자동 입력 — 변경 가능</p>
              )}
              {spareQty > 0 && (
                <p className="text-[10px] text-orange-600">
                  무상 {spareQty.toLocaleString('ko-KR')} EA 별도 · 총 공급 {(Number(quantity) + spareQty).toLocaleString('ko-KR')} EA
                </p>
              )}
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용량</Label>
              <div className="flex h-9 items-center justify-end rounded-md border bg-slate-50 px-3 text-sm font-medium tabular-nums text-slate-800">
                {selectedProduct ? formatCapacityAuto(capacityKw) : '품목 선택 후 자동 계산'}
              </div>
              <p className="text-[10px] text-muted-foreground">유상 수량 기준 자동 계산</p>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Wp단가 *
                {isPrefill && !watch('unit_price_wp') && (
                  <span className="text-amber-600 text-[10px] font-normal">← 입력 필요</span>
                )}
              </Label>
              <Input
                type="number"
                step="0.01"
                {...register('unit_price_wp')}
                className={cn(
                  isPrefill && !watch('unit_price_wp') && 'ring-2 ring-amber-400/70 border-amber-400',
                )}
              />
              {errors.unit_price_wp && <p className="text-xs text-destructive">{errors.unit_price_wp.message}</p>}
            </div>
          </div>

            </>
          )}

          {/* 공사현장 선택 */}
          <div className="space-y-1.5">
            <Label>공사현장 <span className="text-xs font-normal text-muted-foreground">(선택)</span></Label>
            <ConstructionSiteCombobox
              sites={sites}
              value={watch('site_id') ?? ''}
              displayName={watch('site_name') ?? ''}
              companyId={effectiveCompanyId}
              onChange={(siteId, siteName) => {
                setValue('site_id', siteId, { shouldDirty: true });
                setValue('site_name', siteName, { shouldDirty: true });
              }}
              onCreated={(site) => setSites(prev => [...prev, site])}
              placeholder="현장 검색 또는 신규 등록…"
            />
            <p className="text-[10px] text-muted-foreground">현장 검색을 위해 공사현장을 입력할 수 있습니다.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-muted-foreground text-xs">현장 주소</Label><Input {...register('site_address')} placeholder="납품 주소" /></div>
            <div className="space-y-1.5"><Label className="text-muted-foreground text-xs">현장 담당자 / 전화</Label>
              <div className="flex gap-2">
                <Input {...register('site_contact')} placeholder="담당자" />
                <Input {...register('site_phone')} placeholder="전화" />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <Label className="font-medium">결제/납기 조건</Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>현금 비율 (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={watch('deposit_rate') ?? ''}
                  onChange={(e) => {
                    const next = e.target.value === '' ? '' : Number(e.target.value);
                    setValue('deposit_rate', next as FormData['deposit_rate'], { shouldDirty: true });
                    syncPaymentTerms(paymentDueMode, creditDaysDisplay, next);
                  }}
                  placeholder="예: 50"
                />
                <p className="text-[10px] text-muted-foreground">조건 기록용 · 실제 입금은 수금 탭에서 매칭</p>
              </div>
              <div className="space-y-1.5">
                <Label>신용 조건</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(PAYMENT_DUE_MODE_LABEL) as PaymentDueMode[]).map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      variant={paymentDueMode === mode ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 px-2 text-[11px]"
                      onClick={() => {
                        setPaymentDueMode(mode);
                        syncPaymentTerms(mode, creditDaysDisplay);
                      }}
                    >
                      {PAYMENT_DUE_MODE_LABEL[mode]}
                    </Button>
                  ))}
                </div>
                {paymentDueMode === 'days' ? (
                  <Input
                    className="mt-1.5"
                    inputMode="numeric"
                    value={creditDaysDisplay}
                    onChange={(e) => {
                      const next = e.target.value.replace(/[^0-9]/g, '');
                      setCreditDaysDisplay(next);
                      syncPaymentTerms('days', next);
                    }}
                    placeholder="출고일 + 일수"
                  />
                ) : (
                  <p className="mt-1.5 rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                    {paymentDueMode === 'manual' ? '결제조건 칸에 직접 입력' : `${PAYMENT_DUE_MODE_LABEL[paymentDueMode]} 기준으로 문구 자동 작성`}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>납기일</Label>
                <DateInput value={watch('delivery_due') ?? ''} onChange={(v) => setValue('delivery_due', v, { shouldDirty: true })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>결제조건</Label>
              <Input
                {...register('payment_terms')}
                placeholder="예: 현금 50% + 잔금 출고일+60일"
                onChange={(e) => {
                  setValue('payment_terms', e.target.value, { shouldDirty: true });
                  if (paymentDueMode !== 'manual') setPaymentDueMode('manual');
                }}
              />
              <p className="text-[10px] text-muted-foreground">현금 비율과 신용 조건으로 자동 작성되며, 필요하면 직접 수정할 수 있습니다.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>스페어 수량</Label>
            <Input
              type="text"
              inputMode="numeric"
              value={spareQtyDisplay}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                const num = raw ? parseInt(raw, 10) : undefined;
                setSpareQtyDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                setValue('spare_qty', (num ?? '') as unknown as number, { shouldDirty: true });
              }}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>

          </div>
          <div className={isInline ? 'flex justify-end gap-2 pt-2' : 'shrink-0 flex justify-end gap-2 border-t bg-background px-5 py-3'}>
            <Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </div>
        </form>
    </>
  );

  if (isInline) {
    return <div className="space-y-3">{body}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>{editData ? '수주 수정' : '수주 등록'}</DialogTitle>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
