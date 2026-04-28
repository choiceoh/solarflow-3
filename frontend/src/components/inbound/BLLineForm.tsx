import { useEffect, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import type { BLLineItem } from '@/types/inbound';
import type { Product } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return (
    <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">
      {text || placeholder}
    </span>
  );
}

const schema = z.object({
  product_id: z.string().min(1, '품번은 필수입니다'),
  quantity: z.coerce.number().positive('양수만 가능합니다'),
  item_type: z.string().min(1, '구분은 필수입니다'),
  payment_type: z.string().min(1, '유/무상은 필수입니다'),
  invoice_amount_usd: z.coerce.number().optional().or(z.literal('')),
  unit_price_usd_wp: z.coerce.number().optional().or(z.literal('')),
  unit_price_krw_wp: z.coerce.number().optional().or(z.literal('')),
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
  manufacturerId?: string;
}

export default function BLLineForm({ open, onOpenChange, onSubmit, editData, blId, currency, manufacturerId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selProductId, setSelProductId] = useState('');
  const [selItemType, setSelItemType] = useState('');
  const [selPaymentType, setSelPaymentType] = useState('');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가
  const quantity = watch('quantity');
  const selectedProduct = products.find((p) => p.product_id === selProductId);
  const capacityKw = selectedProduct && quantity ? quantity * selectedProduct.wattage_kw : 0;

  // 제조사ID가 있으면 해당 제조사 품번만, 없으면 전체
  useEffect(() => {
    const url = manufacturerId
      ? `/api/v1/products?manufacturer_id=${manufacturerId}`
      : '/api/v1/products';
    fetchWithAuth<Product[]>(url)
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => {});
  }, [manufacturerId]);

  useEffect(() => {
    if (open) {
      if (editData) {
        setSelProductId(editData.product_id);
        setSelItemType(editData.item_type);
        setSelPaymentType(editData.payment_type);
        reset({
          product_id: editData.product_id,
          quantity: editData.quantity,
          item_type: editData.item_type,
          payment_type: editData.payment_type,
          invoice_amount_usd: editData.invoice_amount_usd ?? '',
          unit_price_usd_wp: editData.unit_price_usd_wp ?? '',
          unit_price_krw_wp: editData.unit_price_krw_wp ?? '',
          memo: editData.memo ?? '',
        });
      } else {
        setSelProductId('');
        setSelItemType('');
        setSelPaymentType('');
        reset({
          product_id: '', quantity: '' as unknown as number,
          item_type: '', payment_type: '',
          invoice_amount_usd: '', unit_price_usd_wp: '', unit_price_krw_wp: '',
          memo: '',
        });
      }
    }
  }, [open, editData, reset]);

  const handleProductChange = (v: string | null) => {
    const id = v ?? '';
    setSelProductId(id);
    setValue('product_id', id);
  };
  const handleItemTypeChange = (v: string | null) => {
    const val = v ?? '';
    setSelItemType(val);
    setValue('item_type', val);
  };
  const handlePaymentTypeChange = (v: string | null) => {
    const val = v ?? '';
    setSelPaymentType(val);
    setValue('payment_type', val);
  };

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = {
      ...data,
      bl_id: blId,
      capacity_kw: capacityKw,
      usage_category: 'sale',
    };
    if (data.invoice_amount_usd === '' || data.invoice_amount_usd === undefined) delete payload.invoice_amount_usd;
    if (data.unit_price_usd_wp === '' || data.unit_price_usd_wp === undefined) delete payload.unit_price_usd_wp;
    if (data.unit_price_krw_wp === '' || data.unit_price_krw_wp === undefined) delete payload.unit_price_krw_wp;
    await onSubmit(payload);
    onOpenChange(false);
  };

  const productLabel = selProductId
    ? (() => { const p = products.find(x => x.product_id === selProductId); return p ? `${p.product_code} | ${p.product_name} | ${p.spec_wp}Wp` : ''; })()
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '입고품목 수정' : '입고품목 추가'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>품번 *</Label>
            <Select value={selProductId} onValueChange={handleProductChange}>
              <SelectTrigger className="w-full"><Txt text={productLabel} placeholder="품번 선택" /></SelectTrigger>
              <SelectContent className="min-w-[min(500px,calc(100vw-3rem))]">
                {products.map((p) => (
                  <SelectItem key={p.product_id} value={p.product_id}>
                    {p.product_code} | {p.product_name} | {p.spec_wp}Wp
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
              <Select value={selItemType} onValueChange={handleItemTypeChange}>
                <SelectTrigger className="w-full"><Txt text={selItemType === 'main' ? '본품' : selItemType === 'spare' ? '스페어' : ''} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">본품</SelectItem>
                  <SelectItem value="spare">스페어</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>유/무상 *</Label>
              <Select value={selPaymentType} onValueChange={handlePaymentTypeChange}>
                <SelectTrigger className="w-full"><Txt text={selPaymentType === 'paid' ? '유상' : selPaymentType === 'free' ? '무상' : ''} /></SelectTrigger>
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
              <div className="space-y-1.5">
                <Label>단가(USD/Wp){selPaymentType === 'free' && ' — 무상 해당없음'}</Label>
                <Input type="number" step="0.0001" {...register('unit_price_usd_wp')}
                  readOnly={selPaymentType === 'free'}
                  className={selPaymentType === 'free' ? 'bg-muted text-muted-foreground' : ''}
                />
              </div>
            </div>
          )}
          {currency === 'KRW' && (
            <div className="space-y-1.5">
              <Label>단가(KRW/Wp){selPaymentType === 'free' && ' — 무상 해당없음'}</Label>
              <Input type="number" step="0.01" {...register('unit_price_krw_wp')}
                readOnly={selPaymentType === 'free'}
                className={selPaymentType === 'free' ? 'bg-muted text-muted-foreground' : ''}
              />
            </div>
          )}

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
