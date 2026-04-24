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
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import {
  RECEIPT_METHOD_LABEL, MANAGEMENT_CATEGORY_LABEL, FULFILLMENT_SOURCE_LABEL,
  type Order, type ReceiptMethod, type ManagementCategory, type FulfillmentSource,
} from '@/types/orders';
import type { Product, Partner, ConstructionSite } from '@/types/masters';

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

export interface OrderPrefillData {
  product_id?: string;
  quantity?: number;
  management_category?: string; // purpose → management_category 매핑
  fulfillment_source?: string;  // source_type → fulfillment_source 매핑
  customer_hint?: string;       // 거래처명으로 partner_id 자동 매칭 시도
  site_name?: string;
  order_number?: string;        // 고객 발주번호
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Order | null;
  prefillData?: OrderPrefillData | null;
}

// 정수 천단위 포맷
function fmtInt(v: number | string | undefined): string {
  if (v === '' || v === undefined || v === null) return '';
  const n = typeof v === 'string' ? parseInt(v.replace(/[^0-9]/g, ''), 10) : Math.round(Number(v));
  return isNaN(n) ? '' : n.toLocaleString('ko-KR');
}

export default function OrderForm({ open, onOpenChange, onSubmit, editData, prefillData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [sites, setSites] = useState<ConstructionSite[]>([]);
  const [inventoryInfo, setInventoryInfo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  // 천단위 표시용 display state
  const [qtyDisplay, setQtyDisplay] = useState('');
  const [spareQtyDisplay, setSpareQtyDisplay] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  const selectedProductId = watch('product_id');
  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const quantity = watch('quantity') || 0;
  const capacityKw = selectedProduct ? quantity * selectedProduct.wattage_kw : 0;
  const fulfillmentSource = watch('fulfillment_source');
  // 가용재고 배정 → 수주 자동 입력 모드 (일부 필드 잠금 + amber 표시)
  const isPrefill = !!(prefillData && !editData);

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
    if (selectedCompanyId && selectedCompanyId !== 'all') {
      fetchWithAuth<ConstructionSite[]>(`/api/v1/construction-sites?company_id=${selectedCompanyId}`)
        .then(setSites).catch(() => {});
    }
  }, [selectedCompanyId]);

  // 충당소스 변경 시 재고 정보 표시
  useEffect(() => {
    if (!fulfillmentSource || !selectedCompanyId) { setInventoryInfo(null); return; }
    fetchWithAuth<{ available_kw?: number; incoming_kw?: number }>('/api/v1/calc/inventory', {
      method: 'POST',
      body: JSON.stringify({ company_id: selectedCompanyId }),
    }).then((result) => {
      if (fulfillmentSource === 'stock') {
        setInventoryInfo(`현재 가용재고: ${(result.available_kw ?? 0).toFixed(1)} kW`);
      } else {
        setInventoryInfo(`가용 미착품: ${(result.incoming_kw ?? 0).toFixed(1)} kW`);
      }
    }).catch(() => setInventoryInfo(null));
  }, [fulfillmentSource, selectedCompanyId]);

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
          unit_price_wp: '' as unknown as number,
          site_id: '',
          site_name: prefillData.site_name ?? '',
          site_address: '', site_contact: '', site_phone: '',
          payment_terms: '', deposit_rate: '', delivery_due: '', spare_qty: '', memo: '',
        });
        setQtyDisplay(prefillData.quantity ? prefillData.quantity.toLocaleString('ko-KR') : '');
        setSpareQtyDisplay('');
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
      }
    }
  }, [open, editData, prefillData, reset]);

  // prefill: 거래처 이름 → partner_id 자동 매칭 (partners 로드 완료 후)
  useEffect(() => {
    if (!open || !prefillData?.customer_hint || !partners.length || editData) return;
    // 이미 customer_id가 설정된 경우 덮어쓰지 않음
    if (watch('customer_id')) return;
    const matched = partners.find((p) => p.partner_name === prefillData.customer_hint);
    if (matched) setValue('customer_id', matched.partner_id, { shouldValidate: true });
  }, [prefillData?.customer_hint, partners, open, editData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = {
      ...data,
      company_id: selectedCompanyId,
      capacity_kw: capacityKw,
    };
    if (!data.order_number) delete payload.order_number;
    if (data.deposit_rate === '' || data.deposit_rate === undefined) delete payload.deposit_rate;
    if (data.spare_qty === '' || data.spare_qty === undefined) delete payload.spare_qty;
    if (!data.delivery_due) delete payload.delivery_due;
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '수주 수정' : '수주 등록'}</DialogTitle>
        </DialogHeader>
        {isPrefill && (
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 space-y-1">
            <div className="font-medium flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              가용재고 배정에서 자동 입력 — 일부 항목 잠금
            </div>
            <div className="text-blue-600 leading-relaxed">
              <span className="inline-flex items-center gap-0.5 text-[10px] bg-slate-200/80 text-slate-600 rounded px-1.5 py-0.5 mr-1">배정고정</span>
              표시 항목은 변경할 수 없습니다. &nbsp;
              <span className="text-amber-600 font-semibold">주황 테두리</span> 필드를 새로 입력하세요.
            </div>
            {prefillData.customer_hint && (
              <div>예약 거래처: <span className="font-semibold">{prefillData.customer_hint}</span></div>
            )}
          </div>
        )}
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
            />
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm select-none">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  <span className="flex-1 truncate">{MANAGEMENT_CATEGORY_LABEL[watch('management_category') as ManagementCategory] ?? '—'}</span>
                  <span className="text-[10px] text-muted-foreground/70 bg-slate-200/60 px-1.5 py-0.5 rounded shrink-0">배정고정</span>
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
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm select-none">
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded',
                  fulfillmentSource === 'stock'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700',
                )}>
                  {FULFILLMENT_SOURCE_LABEL[fulfillmentSource as FulfillmentSource] ?? '—'}
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground/70 bg-slate-200/60 px-1.5 py-0.5 rounded shrink-0">배정고정</span>
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
                {inventoryInfo && <p className="text-[10px] text-blue-600">{inventoryInfo}</p>}
              </>
            )}
            {errors.fulfillment_source && !isPrefill && <p className="text-xs text-destructive">{errors.fulfillment_source.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>품번 *</Label>
            {isPrefill ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm select-none">
                <Lock className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                <span className="flex-1 truncate">
                  {selectedProduct ? `${selectedProduct.product_code} — ${selectedProduct.product_name}` : '—'}
                </span>
                <span className="text-[10px] text-muted-foreground/70 bg-slate-200/60 px-1.5 py-0.5 rounded shrink-0">배정고정</span>
              </div>
            ) : (
              <Select value={watch('product_id') ?? ''} onValueChange={(v) => setValue('product_id', v ?? '')}>
                <SelectTrigger><Txt text={(() => { const p = products.find(p => p.product_id === watch('product_id')); return p ? `${p.product_code} — ${p.product_name}` : ''; })()} /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.product_id} value={p.product_id}>
                      {p.product_code} — {p.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {errors.product_id && !isPrefill && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
            {selectedProduct && (
              <div className="rounded-md border p-2 bg-muted/30 text-xs grid grid-cols-3 gap-2">
                <div><div className="text-muted-foreground">제조사</div><div className="font-medium">{selectedProduct.manufacturer_name ?? '—'}</div></div>
                <div><div className="text-muted-foreground">품명</div><div className="font-medium truncate">{selectedProduct.product_name}</div></div>
                <div><div className="text-muted-foreground">규격</div><div className="font-medium">{selectedProduct.spec_wp}Wp</div></div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>수량 *</Label>
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
                <p className="text-[10px] text-muted-foreground">배정 수량 자동 입력 — 변경 가능</p>
              )}
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용량 (kW)</Label>
              <Input value={capacityKw ? capacityKw.toFixed(1) : '—'} readOnly className="bg-muted" />
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
            <Label className="flex items-center gap-1">
              공사현장
              {!watch('site_id') && (
                <span className="text-[10px] text-amber-600 font-normal ml-1">
                  ⚠ 미입력 — 나중에 꼭 보완하세요
                </span>
              )}
            </Label>
            <ConstructionSiteCombobox
              sites={sites}
              value={watch('site_id') ?? ''}
              companyId={selectedCompanyId}
              onChange={(siteId, siteName) => {
                setValue('site_id', siteId, { shouldDirty: true });
                setValue('site_name', siteName, { shouldDirty: true });
              }}
              onCreated={(site) => setSites(prev => [...prev, site])}
              placeholder="현장 검색 또는 신규 등록…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-muted-foreground text-xs">현장 주소</Label><Input {...register('site_address')} placeholder="납품 주소" /></div>
            <div className="space-y-1.5"><Label className="text-muted-foreground text-xs">현장 담당자 / 전화</Label>
              <div className="flex gap-2">
                <Input {...register('site_contact')} placeholder="담당자" />
                <Input {...register('site_phone')} placeholder="전화" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>결제조건</Label><Input {...register('payment_terms')} placeholder="자유기재" /></div>
            <div className="space-y-1.5"><Label>선수금율 (%)</Label><Input type="number" step="0.1" {...register('deposit_rate')} /></div>
            <div className="space-y-1.5"><Label>납기일</Label><DateInput value={watch('delivery_due') ?? ''} onChange={(v) => setValue('delivery_due', v, { shouldDirty: true })} /></div>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
