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
import type { Receipt } from '@/types/orders';
import type { Partner } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  customer_id: z.string().min(1, '거래처는 필수입니다'),
  receipt_date: z.string().min(1, '입금일은 필수입니다'),
  amount: z.coerce.number().positive('양수 필수'),
  bank_account: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Receipt | null;
}

export default function ReceiptForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [amountDisplay, setAmountDisplay] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

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
          receipt_date: editData.receipt_date?.slice(0, 10) ?? '',
          amount: editData.amount,
          bank_account: editData.bank_account ?? '',
          memo: editData.memo ?? '',
        });
        setAmountDisplay(editData.amount ? Math.round(editData.amount).toLocaleString('ko-KR') : '');
      } else {
        const today = new Date().toISOString().slice(0, 10);
        reset({ customer_id: '', receipt_date: today, amount: '' as unknown as number, bank_account: '', memo: '' });
        setAmountDisplay('');
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = { ...data, company_id: selectedCompanyId };
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '수금 수정' : '수금 등록'}</DialogTitle>
        </DialogHeader>
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
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
              <Label>입금일 *</Label>
              <DateInput value={watch('receipt_date') ?? ''} onChange={(v) => setValue('receipt_date', v, { shouldDirty: true })} />
              {errors.receipt_date && <p className="text-xs text-destructive">{errors.receipt_date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>입금액 *</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  const num = raw ? parseInt(raw, 10) : undefined;
                  setAmountDisplay(num !== undefined ? num.toLocaleString('ko-KR') : '');
                  setValue('amount', (num ?? '') as unknown as number, { shouldDirty: true });
                }}
                placeholder="0"
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5"><Label>입금계좌</Label><Input {...register('bank_account')} /></div>
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
