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
import type { POLineItem } from '@/types/procurement';
import type { Product } from '@/types/masters';

const schema = z.object({
  product_id: z.string().min(1, '품번은 필수입니다'),
  quantity: z.coerce.number().positive('양수만 가능합니다'),
  unit_price_usd: z.coerce.number().optional().or(z.literal('')),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  onSubmit: (d: Record<string, unknown>) => Promise<void>;
  editData?: POLineItem | null; poId: string;
}

export default function POLineForm({ open, onOpenChange, onSubmit, editData, poId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const selectedProductId = watch('product_id');
  const quantity = watch('quantity');
  const unitPrice = watch('unit_price_usd');
  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const totalUsd = selectedProduct && quantity && unitPrice ? quantity * selectedProduct.spec_wp * (typeof unitPrice === 'number' ? unitPrice : 0) : 0;

  useEffect(() => {
    fetchWithAuth<Product[]>('/api/v1/products').then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      if (editData) {
        reset({ product_id: editData.product_id, quantity: editData.quantity, unit_price_usd: editData.unit_price_usd ?? '', memo: editData.memo ?? '' });
      } else {
        reset({ product_id: '', quantity: '' as unknown as number, unit_price_usd: '', memo: '' });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = { ...data, po_id: poId };
    if (data.unit_price_usd === '' || data.unit_price_usd === undefined) delete payload.unit_price_usd;
    else if (selectedProduct) payload.total_amount_usd = data.quantity * selectedProduct.spec_wp * (typeof data.unit_price_usd === 'number' ? data.unit_price_usd : 0);
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '라인 수정' : '라인 추가'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>품번 *</Label>
            <Select value={watch('product_id') ?? ''} onValueChange={(v) => setValue('product_id', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>{products.map((p) => <SelectItem key={p.product_id} value={p.product_id}>{p.product_code} — {p.product_name}</SelectItem>)}</SelectContent>
            </Select>
            {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>수량 *</Label><Input type="number" {...register('quantity')} />{errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}</div>
            <div className="space-y-1.5"><Label>USD/Wp 단가</Label><Input type="number" step="0.0001" {...register('unit_price_usd')} /></div>
          </div>
          {totalUsd > 0 && <p className="text-xs text-muted-foreground">예상 총액: ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
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
