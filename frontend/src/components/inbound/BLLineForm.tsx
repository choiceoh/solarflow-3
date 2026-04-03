import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import { USAGE_CATEGORIES, type BLLineItem } from '@/types/inbound';
import type { Product } from '@/types/masters';

const schema = z.object({
  product_id: z.string().min(1, '품번은 필수입니다'),
  quantity: z.coerce.number().positive('양수만 가능합니다'),
  item_type: z.string().min(1, '구분은 필수입니다'),
  payment_type: z.string().min(1, '유/무상은 필수입니다'),
  invoice_amount_usd: z.coerce.number().optional().or(z.literal('')),
  unit_price_usd_wp: z.coerce.number().optional().or(z.literal('')),
  unit_price_krw_wp: z.coerce.number().optional().or(z.literal('')),
  usage_category: z.string().min(1, '용도는 필수입니다'),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BLLineItem | null;
  blId: string;
  currency: 'USD' | 'KRW';
}

export default function BLLineForm({ open, onOpenChange, onSubmit, editData, blId, currency }: Props) {
  const [products, setProducts] = useState<Product[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  const selectedProductId = watch('product_id');
  const quantity = watch('quantity');
  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const capacityKw = selectedProduct && quantity ? quantity * selectedProduct.wattage_kw : 0;

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      if (editData) {
        reset({
          product_id: editData.product_id,
          quantity: editData.quantity,
          item_type: editData.item_type,
          payment_type: editData.payment_type,
          invoice_amount_usd: editData.invoice_amount_usd ?? '',
          unit_price_usd_wp: editData.unit_price_usd_wp ?? '',
          unit_price_krw_wp: editData.unit_price_krw_wp ?? '',
          usage_category: editData.usage_category,
          memo: editData.memo ?? '',
        });
      } else {
        reset({
          product_id: '', quantity: '' as unknown as number,
          item_type: '', payment_type: '',
          invoice_amount_usd: '', unit_price_usd_wp: '', unit_price_krw_wp: '',
          usage_category: '', memo: '',
        });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = {
      ...data,
      bl_id: blId,
      capacity_kw: capacityKw,
    };
    if (data.invoice_amount_usd === '' || data.invoice_amount_usd === undefined) delete payload.invoice_amount_usd;
    if (data.unit_price_usd_wp === '' || data.unit_price_usd_wp === undefined) delete payload.unit_price_usd_wp;
    if (data.unit_price_krw_wp === '' || data.unit_price_krw_wp === undefined) delete payload.unit_price_krw_wp;
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '라인아이템 수정' : '라인아이템 추가'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>품번 *</Label>
            <Select value={watch('product_id') ?? ''} onValueChange={(v) => setValue('product_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
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
              <p className="text-[10px] text-muted-foreground">{selectedProduct.manufacturer_name} · {selectedProduct.spec_wp}Wp</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>수량 *</Label>
              <Input type="number" {...register('quantity')} />
              {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>용량(kW)</Label>
              <Input value={capacityKw ? capacityKw.toFixed(1) : ''} readOnly className="bg-muted" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>구분 *</Label>
              <Select value={watch('item_type') ?? ''} onValueChange={(v) => setValue('item_type', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">본품</SelectItem>
                  <SelectItem value="spare">스페어</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>유/무상 *</Label>
              <Select value={watch('payment_type') ?? ''} onValueChange={(v) => setValue('payment_type', v ?? '')}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">유상</SelectItem>
                  <SelectItem value="free">무상</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {currency === 'USD' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Invoice 금액(USD)</Label><Input type="number" step="0.01" {...register('invoice_amount_usd')} /></div>
              <div className="space-y-1.5"><Label>단가(USD/Wp)</Label><Input type="number" step="0.0001" {...register('unit_price_usd_wp')} /></div>
            </div>
          )}
          {currency === 'KRW' && (
            <div className="space-y-1.5"><Label>단가(KRW/Wp)</Label><Input type="number" step="0.01" {...register('unit_price_krw_wp')} /></div>
          )}

          <div className="space-y-1.5">
            <Label>용도 *</Label>
            <Select value={watch('usage_category') ?? ''} onValueChange={(v) => setValue('usage_category', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                {Object.entries(USAGE_CATEGORIES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.usage_category && <p className="text-xs text-destructive">{errors.usage_category.message}</p>}
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
