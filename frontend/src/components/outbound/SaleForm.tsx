import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import { formatNumber } from '@/lib/utils';
import type { Outbound, Sale } from '@/types/outbound';
import type { Partner } from '@/types/masters';

const schema = z.object({
  customer_id: z.string().min(1, '거래처는 필수입니다'),
  unit_price_wp: z.coerce.number().positive('양수 필수'),
  tax_invoice_date: z.string().optional(),
  tax_invoice_email: z.string().email('이메일 형식').optional().or(z.literal('')),
  erp_closed: z.boolean().optional(),
  erp_closed_date: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  outbound: Outbound;
  editData?: Sale | null;
}

// 비유: Wp단가 하나만 입력하면 EA단가→공급가→부가세→합계가 자동 계산되는 계산기
function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

export default function SaleForm({ open, onOpenChange, onSubmit, outbound, editData }: Props) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [submitError, setSubmitError] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  const unitPriceWp = watch('unit_price_wp') || 0;
  const specWp = outbound.spec_wp ?? 0;
  const quantity = outbound.quantity ?? 0;
  const erpClosed = watch('erp_closed') ?? false;

  // 자동 계산
  const unitPriceEa = unitPriceWp * specWp;
  const supplyAmount = unitPriceEa * quantity;
  const vatAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + vatAmount;

  useEffect(() => {
    fetchWithAuth<Partner[]>('/api/v1/partners')
      .then((list) => setPartners(list.filter((p) => p.is_active && (p.partner_type === 'customer' || p.partner_type === 'both'))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        reset({
          customer_id: editData.customer_id,
          unit_price_wp: editData.unit_price_wp,
          tax_invoice_date: editData.tax_invoice_date?.slice(0, 10) ?? '',
          tax_invoice_email: editData.tax_invoice_email ?? '',
          erp_closed: editData.erp_closed ?? false,
          erp_closed_date: editData.erp_closed_date?.slice(0, 10) ?? '',
          memo: editData.memo ?? '',
        });
      } else {
        reset({
          customer_id: '', unit_price_wp: '' as unknown as number,
          tax_invoice_date: '', tax_invoice_email: '',
          erp_closed: false, erp_closed_date: '', memo: '',
        });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = {
      ...data,
      outbound_id: outbound.outbound_id,
      unit_price_ea: unitPriceEa,
      supply_amount: supplyAmount,
      vat_amount: vatAmount,
      total_amount: totalAmount,
    };
    if (!data.tax_invoice_date) delete payload.tax_invoice_date;
    if (!data.tax_invoice_email) delete payload.tax_invoice_email;
    if (!data.erp_closed) {
      delete payload.erp_closed_date;
    }
    if (!data.erp_closed_date) delete payload.erp_closed_date;
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
          <DialogTitle>{editData ? '매출 수정' : '매출 등록'}</DialogTitle>
        </DialogHeader>
        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>거래처 *</Label>
            <Select value={watch('customer_id') ?? ''} onValueChange={(v) => setValue('customer_id', v ?? '')}>
              <SelectTrigger className="w-full"><Txt text={partners.find(p => p.partner_id === watch('customer_id'))?.partner_name ?? ''} /></SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.partner_id} value={p.partner_id}>{p.partner_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Wp 단가 (원/Wp) *</Label>
            <Input type="number" step="0.01" {...register('unit_price_wp')} />
            {errors.unit_price_wp && <p className="text-xs text-destructive">{errors.unit_price_wp.message}</p>}
          </div>

          {unitPriceWp > 0 && specWp > 0 && (
            <div className="rounded-md border bg-muted/50 p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span>EA단가</span><span>{formatNumber(unitPriceEa)}원 ({unitPriceWp} x {specWp}Wp)</span></div>
              <div className="flex justify-between"><span>공급가</span><span>{formatNumber(supplyAmount)}원 ({formatNumber(unitPriceEa)} x {quantity})</span></div>
              <div className="flex justify-between"><span>부가세 (10%)</span><span>{formatNumber(vatAmount)}원</span></div>
              <div className="flex justify-between font-semibold border-t pt-1"><span>합계</span><span>{formatNumber(totalAmount)}원</span></div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>세금계산서 발행일</Label>
            <Input type="date" {...register('tax_invoice_date')} />
            <p className="text-[10px] text-muted-foreground">출고일과 다를 수 있습니다 (다음달 발행 가능)</p>
          </div>

          <div className="space-y-1.5">
            <Label>세금계산서 이메일</Label>
            <Input type="email" {...register('tax_invoice_email')} placeholder="example@company.com" />
            {errors.tax_invoice_email && <p className="text-xs text-destructive">{errors.tax_invoice_email.message}</p>}
          </div>

          <div className="flex items-center gap-3 rounded-md border p-3">
            <Switch checked={erpClosed} onCheckedChange={(v) => setValue('erp_closed', v)} />
            <Label className="cursor-pointer">ERP 마감</Label>
          </div>

          {erpClosed && (
            <div className="space-y-1.5">
              <Label>ERP 마감일</Label>
              <Input type="date" {...register('erp_closed_date')} />
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
