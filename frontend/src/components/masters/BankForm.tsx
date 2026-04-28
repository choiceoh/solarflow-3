import { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
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
import type { Bank } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  company_id: z.string().min(1, '법인은 필수입니다'),
  bank_name: z.string().min(1, '은행명은 필수입니다'),
  lc_limit_usd: z.coerce.number().positive('양수만 가능합니다'),
  limit_approve_date: z.string().optional(),
  limit_expiry_date: z.string().optional(),
  opening_fee_rate: z.coerce.number().optional().or(z.literal('')),
  acceptance_fee_rate: z.coerce.number().optional().or(z.literal('')),
  fee_calc_method: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Bank | null;
}

export default function BankForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const companies = useAppStore((s) => s.companies);
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });

  useEffect(() => {
    if (open) {
      if (editData) {
        reset({
          company_id: editData.company_id,
          bank_name: editData.bank_name,
          lc_limit_usd: editData.lc_limit_usd,
          limit_approve_date: editData.limit_approve_date?.slice(0, 10) ?? '',
          limit_expiry_date: editData.limit_expiry_date?.slice(0, 10) ?? '',
          opening_fee_rate: editData.opening_fee_rate ?? '',
          acceptance_fee_rate: editData.acceptance_fee_rate ?? '',
          fee_calc_method: editData.fee_calc_method ?? '',
          memo: editData.memo ?? '',
        });
      } else {
        reset({
          company_id: '', bank_name: '',
          lc_limit_usd: '' as unknown as number,
          limit_approve_date: '', limit_expiry_date: '',
          opening_fee_rate: '', acceptance_fee_rate: '',
          fee_calc_method: '', memo: '',
        });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = { ...data };
    if (data.opening_fee_rate === '' || data.opening_fee_rate === undefined) delete payload.opening_fee_rate;
    if (data.acceptance_fee_rate === '' || data.acceptance_fee_rate === undefined) delete payload.acceptance_fee_rate;
    if (!data.limit_approve_date) delete payload.limit_approve_date;
    if (!data.limit_expiry_date) delete payload.limit_expiry_date;
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '은행 수정' : '은행 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>법인 *</Label>
            <Select value={watch('company_id') ?? ''} onValueChange={(v) => setValue('company_id', v ?? '')}>
              {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
              <SelectTrigger><Txt text={companies.find(c => c.company_id === watch('company_id'))?.company_name ?? ''} /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.company_id && <p className="text-xs text-destructive">{errors.company_id.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>은행명 *</Label>
            <Input {...register('bank_name')} />
            {errors.bank_name && <p className="text-xs text-destructive">{errors.bank_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>LC 한도(USD) *</Label>
            <Input type="number" step="0.01" {...register('lc_limit_usd')} />
            {errors.lc_limit_usd && <p className="text-xs text-destructive">{errors.lc_limit_usd.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>승인일</Label>
              <DateInput value={watch('limit_approve_date') ?? ''} onChange={(v) => setValue('limit_approve_date', v, { shouldDirty: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>승인기한</Label>
              <DateInput value={watch('limit_expiry_date') ?? ''} onChange={(v) => setValue('limit_expiry_date', v, { shouldDirty: true })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>개설수수료율(%)</Label>
              <Input type="number" step="0.01" {...register('opening_fee_rate')} />
            </div>
            <div className="space-y-1.5">
              <Label>인수수수료율(%)</Label>
              <Input type="number" step="0.01" {...register('acceptance_fee_rate')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>수수료 계산방식</Label>
            <Input {...register('fee_calc_method')} />
          </div>
          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea {...register('memo')} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
