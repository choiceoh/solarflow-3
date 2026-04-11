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
import type { PriceHistory, PurchaseOrder } from '@/types/procurement';
import type { Manufacturer, Product } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const REASON_OPTIONS = ['최초계약', '계약변경'] as const;

const schema = z.object({
  manufacturer_id: z.string().min(1, '제조사는 필수입니다'),
  product_id: z.string().min(1, '품번은 필수입니다'),
  change_date: z.string().min(1, '변경일은 필수입니다'),
  previous_price: z.coerce.number().optional().or(z.literal('')),
  new_price: z.coerce.number().positive('양수만 가능합니다'),
  reason_select: z.string().optional(),
  reason_text: z.string().optional(),
  related_po_id: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: Record<string, unknown>) => Promise<void>; editData?: PriceHistory | null; }

export default function PriceHistoryForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [submitError, setSubmitError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  const selectedMfgId = watch('manufacturer_id');
  const selectedProductId = watch('product_id');
  const reasonSelect = watch('reason_select');
  const [prevPriceHint, setPrevPriceHint] = useState<string>('');

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers').then((l) => setManufacturers(l.filter((m) => m.is_active))).catch(() => {});
    fetchWithAuth<Product[]>('/api/v1/products').then((l) => setProducts(l.filter((p) => p.is_active))).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?company_id=${selectedCompanyId}`).then(setPos).catch(() => {});
    }
  }, [selectedCompanyId]);

  const filteredProducts = selectedMfgId ? products.filter((p) => p.manufacturer_id === selectedMfgId) : products;

  // reason 파싱: 기존 데이터에서 Select 옵션이면 select에, 아니면 text에 배치
  const parseReason = (reason?: string) => {
    if (!reason) return { select: '', text: '' };
    if ((REASON_OPTIONS as readonly string[]).includes(reason)) return { select: reason, text: '' };
    return { select: '', text: reason };
  };

  // 품목 선택 시 최근 단가 자동 조회 (신규 등록 시)
  useEffect(() => {
    if (!open || editData || !selectedProductId) { setPrevPriceHint(''); return; }
    fetchWithAuth<{ price_history_id: string; new_price: number; change_date: string }[]>(
      `/api/v1/price-histories?product_id=${selectedProductId}`
    ).then((list) => {
      if (list.length > 0) {
        const latest = list[0];
        setValue('previous_price', latest.new_price);
        setPrevPriceHint(`최근 단가 $${latest.new_price.toFixed(4)} (${latest.change_date.slice(0, 10)}) 자동입력`);
      } else {
        setPrevPriceHint('');
      }
    }).catch(() => setPrevPriceHint(''));
  }, [open, editData, selectedProductId, setValue]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        const { select, text } = parseReason(editData.reason);
        reset({ manufacturer_id: editData.manufacturer_id, product_id: editData.product_id, change_date: editData.change_date.slice(0, 10), previous_price: editData.previous_price ?? '', new_price: editData.new_price, reason_select: select, reason_text: text, related_po_id: editData.related_po_id ?? '', memo: editData.memo ?? '' });
      } else {
        reset({ manufacturer_id: '', product_id: '', change_date: '', previous_price: '', new_price: '' as unknown as number, reason_select: '', reason_text: '', related_po_id: '', memo: '' });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = {
      manufacturer_id: data.manufacturer_id,
      product_id: data.product_id,
      change_date: data.change_date,
      new_price: data.new_price,
    };
    if (data.previous_price !== '' && data.previous_price !== undefined) payload.previous_price = data.previous_price;
    // reason: Select 값 우선, 자유기재가 있으면 자유기재 우선
    const reason = data.reason_text?.trim() || data.reason_select || undefined;
    if (reason) payload.reason = reason;
    if (data.related_po_id) payload.related_po_id = data.related_po_id;
    if (data.memo) payload.memo = data.memo;
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editData ? '단가이력 수정' : '단가이력 등록'}</DialogTitle></DialogHeader>
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>제조사 *</Label>
            <Select value={watch('manufacturer_id') ?? ''} onValueChange={(v) => { setValue('manufacturer_id', v ?? ''); setValue('product_id', ''); }}><SelectTrigger className="w-full"><Txt text={manufacturers.find((m) => m.manufacturer_id === watch('manufacturer_id'))?.name_kr || ''} /></SelectTrigger>
              <SelectContent>{manufacturers.map((m) => <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>)}</SelectContent>
            </Select>{errors.manufacturer_id && <p className="text-xs text-destructive">{errors.manufacturer_id.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>품명 *</Label>
            <Select value={selectedProductId ?? ''} onValueChange={(v) => setValue('product_id', v ?? '')}><SelectTrigger className="w-full"><Txt text={(() => { const p = filteredProducts.find((p) => p.product_id === selectedProductId); return p ? `${p.product_name}${p.spec_wp ? ` (${p.spec_wp}Wp)` : ''}` : ''; })()} /></SelectTrigger>
              <SelectContent>{filteredProducts.map((p) => <SelectItem key={p.product_id} value={p.product_id}>{p.product_name}{p.spec_wp ? ` (${p.spec_wp}Wp)` : ''}</SelectItem>)}</SelectContent>
            </Select>{errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
          </div>
          <div className="space-y-1.5"><Label>변경일 *</Label><DateInput value={watch('change_date') ?? ''} onChange={(v) => setValue('change_date', v, { shouldDirty: true })} />{errors.change_date && <p className="text-xs text-destructive">{errors.change_date.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>이전단가(USD/Wp)</Label>
              <Input type="number" step="0.0001" {...register('previous_price')} />
              {prevPriceHint && <p className="text-xs text-blue-600">{prevPriceHint}</p>}
            </div>
            <div className="space-y-1.5"><Label>변경단가(USD/Wp) *</Label><Input type="number" step="0.0001" {...register('new_price')} />{errors.new_price && <p className="text-xs text-destructive">{errors.new_price.message}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>사유 (선택)</Label>
              <Select value={reasonSelect ?? ''} onValueChange={(v) => setValue('reason_select', v ?? '')}><SelectTrigger className="w-full"><Txt text={reasonSelect || ''} /></SelectTrigger>
                <SelectContent>
                  {REASON_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>사유 (직접입력)</Label><Input {...register('reason_text')} placeholder="자유기재" /></div>
          </div>
          <div className="space-y-1.5">
            <Label>관련 PO</Label>
            <Select value={watch('related_po_id') ?? ''} onValueChange={(v) => setValue('related_po_id', v === 'none' ? '' : (v ?? ''))}>
              <SelectTrigger className="w-full"><Txt text={(() => { const v = watch('related_po_id'); if (!v || v === 'none') return ''; const p = pos.find((p) => p.po_id === v); return p?.po_number || v.slice(0, 8); })()} placeholder="선택 (선택사항)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">선택안함</SelectItem>
                {pos.map((p) => <SelectItem key={p.po_id} value={p.po_id}>{p.po_number || p.po_id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
