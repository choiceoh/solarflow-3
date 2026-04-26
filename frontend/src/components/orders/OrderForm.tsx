import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { PartnerCombobox } from '@/components/common/PartnerCombobox';
import { ConstructionSiteCombobox } from '@/components/common/ConstructionSiteCombobox';
import { Lock } from 'lucide-react';
import { cn, moduleLabel } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import {
  RECEIPT_METHOD_LABEL, MANAGEMENT_CATEGORY_LABEL, FULFILLMENT_SOURCE_LABEL,
  type Order, type ReceiptMethod, type ManagementCategory, type FulfillmentSource,
} from '@/types/orders';
import type { Product, Partner, ConstructionSite, Manufacturer } from '@/types/masters';
import type { BLShipment, BLLineItem } from '@/types/inbound';
import type { InventoryResponse } from '@/types/inventory';
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

const PAYMENT_TERM_PRESETS = [
  { label: '현금 100%', terms: '현금 100%', depositRate: 100 },
  { label: '현금 50% + 신용 60일', terms: '현금 50% + 신용 60일', depositRate: 50 },
  { label: '현금 30% + 신용 60일', terms: '현금 30% + 신용 60일', depositRate: 30 },
  { label: '현금 50% + 신용 30일', terms: '현금 50% + 신용 30일', depositRate: 50 },
  { label: '신용 30일', terms: '신용 30일', depositRate: 0 },
  { label: '신용 60일', terms: '신용 60일', depositRate: 0 },
  { label: '신용 90일', terms: '신용 90일', depositRate: 0 },
  { label: '익월말', terms: '익월말', depositRate: 0 },
  { label: '익익월말', terms: '익익월말', depositRate: 0 },
];

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
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onPrefillCancel?: () => void;
  editData?: Order | null;
  prefillData?: OrderPrefillData | null;
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

export default function OrderForm({ open, onOpenChange, onSubmit, onPrefillCancel, editData, prefillData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [inventoryInfo, setInventoryInfo] = useState<AvailabilityInfo | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [blId, setBlId] = useState('');
  const [bls, setBls] = useState<BLShipment[]>([]);
  const [blCostMap, setBlCostMap] = useState<Map<string, { usdWp?: number; krwWp?: number }>>(new Map());
  const [resolvedPrefillCompanyId, setResolvedPrefillCompanyId] = useState<string | null>(null);
  // 천단위 표시용 display state
  const [qtyDisplay, setQtyDisplay] = useState('');
  const [spareQtyDisplay, setSpareQtyDisplay] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, getValues, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
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
  // 가용재고 배정 → 수주 자동 입력 모드 (일부 필드 잠금 + amber 표시)
  const isPrefill = !!(prefillData && !editData);
  const prefillCompanyId = prefillData?.company_id && prefillData.company_id !== 'all'
    ? prefillData.company_id
    : null;
  const editCompanyId = editData?.company_id && editData.company_id !== 'all'
    ? editData.company_id
    : null;
  const selectedCompanyValue = selectedCompanyId && selectedCompanyId !== 'all' ? selectedCompanyId : null;
  const effectiveCompanyId = editCompanyId || (isPrefill
    ? (prefillCompanyId || resolvedPrefillCompanyId || selectedCompanyValue)
    : selectedCompanyValue);
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
  }, [effectiveCompanyId]);

  // 품번 선택 시 해당 제조사의 입고완료 BL 목록 로드
  useEffect(() => {
    if (!selectedProduct?.manufacturer_id) { setBls([]); return; }
    fetchWithAuth<BLShipment[]>(`/api/v1/bls?manufacturer_id=${selectedProduct.manufacturer_id}`)
      .then((list) => setBls((list ?? []).filter((b) => ['completed', 'erp_done', 'arrived', 'customs'].includes(b.status))))
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
          .then((lines): [string, { usdWp?: number; krwWp?: number }] => {
            const line = lines.find((l) => l.product_id === selectedProductId);
            const usdWp = line?.unit_price_usd_wp;
            const krwWp = line?.unit_price_krw_wp ?? (
              usdWp != null && bl.exchange_rate ? usdWp * bl.exchange_rate : undefined
            );
            return [bl.bl_id, { usdWp, krwWp }];
          })
          .catch((): [string, { usdWp?: number; krwWp?: number }] => [bl.bl_id, {}]),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setBlCostMap(new Map(entries.filter(([, cost]) => cost.usdWp != null || cost.krwWp != null)));
    });

    return () => { cancelled = true; };
  }, [bls, selectedProductId]);

  // 선택 품목의 충당 가능량 표시
  useEffect(() => {
    if (!effectiveCompanyId || !selectedProductId) { setInventoryInfo(null); return; }
    fetchWithAuth<InventoryResponse>('/api/v1/calc/inventory', {
      method: 'POST',
      body: JSON.stringify({ company_id: effectiveCompanyId }),
    }).then((result) => {
      const item = result.items.find((it) => it.product_id === selectedProductId);
      const stockKw = item?.available_kw ?? 0;
      const incomingKw = item?.available_incoming_kw ?? 0;
      const specWp = selectedProduct?.spec_wp ?? item?.spec_wp;
      setInventoryInfo({
        stockKw,
        incomingKw,
        stockEa: eaFromKw(stockKw, specWp),
        incomingEa: eaFromKw(incomingKw, specWp),
      });
    }).catch(() => setInventoryInfo(null));
  }, [effectiveCompanyId, selectedProductId, selectedProduct?.spec_wp]);

  // 예약/기존 수주가 미착품으로 들어왔어도 현재 실재고가 충분하면 실재고를 우선합니다.
  useEffect(() => {
    if (!open || !effectiveCompanyId || !selectedProductId || fulfillmentSource !== 'incoming' || capacityKw <= 0) return;
    let cancelled = false;
    fetchWithAuth<InventoryResponse>('/api/v1/calc/inventory', {
      method: 'POST',
      body: JSON.stringify({ company_id: effectiveCompanyId }),
    }).then((result) => {
      if (cancelled) return;
      const item = result.items.find((it) => it.product_id === selectedProductId);
      const stockKw = item?.available_kw ?? 0;
      if (stockKw + 0.001 >= capacityKw) {
        setValue('fulfillment_source', 'stock', { shouldDirty: true });
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open, effectiveCompanyId, selectedProductId, fulfillmentSource, capacityKw, setValue]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
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
      } else if (prefillData) {
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
      } else {
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
      }
    }
  }, [open, editData, prefillResetKey, reset]);

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
          const useIncoming = window.confirm(
            `현재 가용 실재고가 부족합니다.\n` +
            `필요: ${formatKwField(capacityKw)} kW / 가용 실재고: ${formatKwField(stockKw)} kW\n\n` +
            `확인을 누르면 미착품 기준으로 수주 등록하고, 예약의 충당소스도 미착품으로 전환합니다.\n` +
            `취소를 누르면 등록을 중단합니다.`,
          );
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

    if (fulfillmentSourceForSave === 'stock' && selectedProduct && bls.length > 0 && !blId) {
      setSubmitError('B/L 연결은 실재고 원가 추적을 위해 필수입니다.');
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

  return (
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-5 py-4">
          <DialogTitle>{editData ? '수주 수정' : '수주 등록'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
              <Label>용량 (kW)</Label>
              <Input value={formatKwField(capacityKw)} readOnly className="bg-muted text-right tabular-nums" />
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="font-medium">결제/납기 조건</Label>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_TERM_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setValue('payment_terms', preset.terms, { shouldDirty: true });
                      setValue('deposit_rate', preset.depositRate as unknown as FormData['deposit_rate'], { shouldDirty: true });
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-1">
                <Label>결제조건</Label>
                <Input {...register('payment_terms')} placeholder="예: 현금 50% + 신용 60일 / 익월말" />
                <p className="text-[10px] text-muted-foreground">목록에 없으면 직접 입력</p>
              </div>
              <div className="space-y-1.5">
                <Label>현금/선수금율 (%)</Label>
                <Input type="number" step="0.1" {...register('deposit_rate')} />
                <p className="text-[10px] text-muted-foreground">조건 기록용 · 실제 입금은 수금 탭에서 매칭</p>
              </div>
              <div className="space-y-1.5"><Label>납기일</Label><DateInput value={watch('delivery_due') ?? ''} onChange={(v) => setValue('delivery_due', v, { shouldDirty: true })} /></div>
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
          <DialogFooter className="shrink-0 border-t bg-background px-5 py-3">
            <Button type="button" variant="outline" onClick={() => requestOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
