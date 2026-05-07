import { useEffect } from 'react';
import { useForm, type Resolver, type UseFormRegister, type FieldErrors, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import FormField from '@/components/common/FormField';
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
export type BankFormData = z.infer<typeof schema>;

function buildDefaults(editData?: Bank | null): BankFormData {
  if (editData) {
    return {
      company_id: editData.company_id,
      bank_name: editData.bank_name,
      lc_limit_usd: editData.lc_limit_usd,
      limit_approve_date: editData.limit_approve_date?.slice(0, 10) ?? '',
      limit_expiry_date: editData.limit_expiry_date?.slice(0, 10) ?? '',
      opening_fee_rate: editData.opening_fee_rate ?? '',
      acceptance_fee_rate: editData.acceptance_fee_rate ?? '',
      fee_calc_method: editData.fee_calc_method ?? '',
      memo: editData.memo ?? '',
    };
  }
  return {
    company_id: '', bank_name: '',
    lc_limit_usd: '' as unknown as number,
    limit_approve_date: '', limit_expiry_date: '',
    opening_fee_rate: '', acceptance_fee_rate: '',
    fee_calc_method: '', memo: '',
  };
}

function stripEmpty(data: BankFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...data };
  if (data.opening_fee_rate === '' || data.opening_fee_rate === undefined) delete payload.opening_fee_rate;
  if (data.acceptance_fee_rate === '' || data.acceptance_fee_rate === undefined) delete payload.acceptance_fee_rate;
  if (!data.limit_approve_date) delete payload.limit_approve_date;
  if (!data.limit_expiry_date) delete payload.limit_expiry_date;
  return payload;
}

interface FieldsProps {
  register: UseFormRegister<BankFormData>;
  errors: FieldErrors<BankFormData>;
  watch: UseFormWatch<BankFormData>;
  setValue: UseFormSetValue<BankFormData>;
}

function BankFields({ register, errors, watch, setValue }: FieldsProps) {
  const companies = useAppStore((s) => s.companies);
  return (
    <>
      <FormField label="법인" required error={errors.company_id?.message}>
        <Select value={watch('company_id') ?? ''} onValueChange={(v) => setValue('company_id', v ?? '')}>
          {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
          <SelectTrigger><Txt text={companies.find(c => c.company_id === watch('company_id'))?.company_name ?? ''} /></SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="은행명" required error={errors.bank_name?.message}>
        <Input {...register('bank_name')} />
      </FormField>
      <FormField label="LC 한도(USD)" required error={errors.lc_limit_usd?.message}>
        <Input type="number" step="0.01" {...register('lc_limit_usd')} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="승인일">
          <DateInput value={watch('limit_approve_date') ?? ''} onChange={(v) => setValue('limit_approve_date', v, { shouldDirty: true })} />
        </FormField>
        <FormField label="승인기한">
          <DateInput value={watch('limit_expiry_date') ?? ''} onChange={(v) => setValue('limit_expiry_date', v, { shouldDirty: true })} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="개설수수료율(%)">
          <Input type="number" step="0.01" {...register('opening_fee_rate')} />
        </FormField>
        <FormField label="인수수수료율(%)">
          <Input type="number" step="0.01" {...register('acceptance_fee_rate')} />
        </FormField>
      </div>
      <FormField label="수수료 계산방식">
        <Input {...register('fee_calc_method')} />
      </FormField>
      <FormField label="메모">
        <Textarea {...register('memo')} rows={2} />
      </FormField>
    </>
  );
}

interface FormBodyProps {
  formId: string;
  editData?: Bank | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export function BankFormBody({ formId, editData, onSubmit }: FormBodyProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<BankFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<BankFormData>,
    defaultValues: buildDefaults(editData),
  });

  useEffect(() => { reset(buildDefaults(editData)); }, [editData, reset]);

  return (
    <form id={formId} onSubmit={handleSubmit(async (data) => onSubmit(stripEmpty(data)))} className="space-y-3">
      <BankFields register={register} errors={errors} watch={watch} setValue={setValue} />
    </form>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Bank | null;
}

export default function BankForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<BankFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<BankFormData>,
  });

  useEffect(() => {
    if (open) reset(buildDefaults(editData));
  }, [open, editData, reset]);

  const handle = async (data: BankFormData) => {
    await onSubmit(stripEmpty(data));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '은행 수정' : '은행 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <BankFields register={register} errors={errors} watch={watch} setValue={setValue} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
