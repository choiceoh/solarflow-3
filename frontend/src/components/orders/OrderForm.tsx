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
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import {
  RECEIPT_METHOD_LABEL, MANAGEMENT_CATEGORY_LABEL, FULFILLMENT_SOURCE_LABEL,
  type Order, type ReceiptMethod, type ManagementCategory, type FulfillmentSource,
} from '@/types/orders';
import type { Product, Partner } from '@/types/masters';

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
  site_name: z.string().optional(),
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Order | null;
}

export default function OrderForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [products, setProducts] = useState<Product[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [inventoryInfo, setInventoryInfo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  const selectedProductId = watch('product_id');
  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const quantity = watch('quantity') || 0;
  const capacityKw = selectedProduct ? quantity * selectedProduct.wattage_kw : 0;
  const fulfillmentSource = watch('fulfillment_source');

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
  }, []);

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
      } else {
        const today = new Date().toISOString().slice(0, 10);
        reset({
          order_number: '', customer_id: '', order_date: today,
          receipt_method: '', management_category: '', fulfillment_source: '',
          product_id: '', quantity: '' as unknown as number, unit_price_wp: '' as unknown as number,
          site_name: '', site_address: '', site_contact: '', site_phone: '',
          payment_terms: '', deposit_rate: '', delivery_due: '', spare_qty: '', memo: '',
        });
      }
    }
  }, [open, editData, reset]);

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
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '수주 수정' : '수주 등록'}</DialogTitle>
        </DialogHeader>
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
            <Label>거래처 *</Label>
            <Select value={watch('customer_id') ?? ''} onValueChange={(v) => setValue('customer_id', v ?? '')}>
              <SelectTrigger><Txt text={partners.find(p => p.partner_id === watch('customer_id'))?.partner_name ?? ''} /></SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>접수방법 *</Label>
              <Select value={watch('receipt_method') ?? ''} onValueChange={(v) => setValue('receipt_method', v ?? '')}>
                <SelectTrigger><Txt text={RECEIPT_METHOD_LABEL[watch('receipt_method') as ReceiptMethod] ?? ''} /></SelectTrigger>
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
              <Select value={watch('management_category') ?? ''} onValueChange={(v) => setValue('management_category', v ?? '')}>
                <SelectTrigger><Txt text={MANAGEMENT_CATEGORY_LABEL[watch('management_category') as ManagementCategory] ?? ''} /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(MANAGEMENT_CATEGORY_LABEL) as [ManagementCategory, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.management_category && <p className="text-xs text-destructive">{errors.management_category.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>충당소스 *</Label>
            <Select value={watch('fulfillment_source') ?? ''} onValueChange={(v) => setValue('fulfillment_source', v ?? '')}>
              <SelectTrigger><Txt text={FULFILLMENT_SOURCE_LABEL[watch('fulfillment_source') as FulfillmentSource] ?? ''} /></SelectTrigger>
              <SelectContent>
                {(Object.entries(FULFILLMENT_SOURCE_LABEL) as [FulfillmentSource, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.fulfillment_source && <p className="text-xs text-destructive">{errors.fulfillment_source.message}</p>}
            {inventoryInfo && <p className="text-[10px] text-blue-600">{inventoryInfo}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>품번 *</Label>
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
            {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
            {selectedProduct && (
              <p className="text-[10px] text-muted-foreground">
                {selectedProduct.product_name} / {selectedProduct.spec_wp}Wp
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>수량 *</Label>
              <Input type="number" {...register('quantity')} />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용량 (kW)</Label>
              <Input value={capacityKw ? capacityKw.toFixed(1) : '—'} readOnly className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label>Wp단가 *</Label>
              <Input type="number" step="0.01" {...register('unit_price_wp')} />
              {errors.unit_price_wp && <p className="text-xs text-destructive">{errors.unit_price_wp.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>현장명</Label><Input {...register('site_name')} /></div>
            <div className="space-y-1.5"><Label>현장 주소</Label><Input {...register('site_address')} /></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>현장 담당자</Label><Input {...register('site_contact')} /></div>
            <div className="space-y-1.5"><Label>현장 전화</Label><Input {...register('site_phone')} /></div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>결제조건</Label><Input {...register('payment_terms')} placeholder="자유기재" /></div>
            <div className="space-y-1.5"><Label>선수금율 (%)</Label><Input type="number" step="0.1" {...register('deposit_rate')} /></div>
            <div className="space-y-1.5"><Label>납기일</Label><DateInput value={watch('delivery_due') ?? ''} onChange={(v) => setValue('delivery_due', v, { shouldDirty: true })} /></div>
          </div>

          <div className="space-y-1.5"><Label>스페어 수량</Label><Input type="number" {...register('spare_qty')} /></div>
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
