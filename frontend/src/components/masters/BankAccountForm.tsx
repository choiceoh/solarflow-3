import { useEffect } from 'react';
import { useForm, type Resolver, type UseFormRegister, type FieldErrors, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import FormField from '@/components/common/FormField';
import { useAppStore } from '@/stores/appStore';
import type { BankAccount } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return (
    <span
      className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`}
      data-slot="select-value"
    >
      {text || placeholder}
    </span>
  );
}

const CURRENCIES = ['KRW', 'USD', 'EUR', 'CNY', 'JPY'] as const;

const schema = z.object({
  company_id: z.string().min(1, '법인은 필수입니다'),
  bank_name: z.string().min(1, '은행명은 필수입니다').max(50, '50자를 초과할 수 없습니다'),
  branch_name: z.string().optional(),
  account_number: z.string().min(1, '계좌번호는 필수입니다').max(50, '50자를 초과할 수 없습니다'),
  account_holder: z.string().min(1, '예금주는 필수입니다').max(50, '50자를 초과할 수 없습니다'),
  currency: z.string().length(3, '3자리 통화 코드여야 합니다'),
  swift_code: z.string().optional(),
  memo: z.string().optional(),
  is_default: z.boolean().optional(),
});
export type BankAccountFormData = z.infer<typeof schema>;

function buildDefaults(editData?: BankAccount | null): BankAccountFormData {
  if (editData) {
    return {
      company_id: editData.company_id,
      bank_name: editData.bank_name,
      branch_name: editData.branch_name ?? '',
      account_number: editData.account_number,
      account_holder: editData.account_holder,
      currency: editData.currency,
      swift_code: editData.swift_code ?? '',
      memo: editData.memo ?? '',
      is_default: editData.is_default,
    };
  }
  return {
    company_id: '',
    bank_name: '',
    branch_name: '',
    account_number: '',
    account_holder: '',
    currency: 'KRW',
    swift_code: '',
    memo: '',
    is_default: false,
  };
}

function stripEmpty(data: BankAccountFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...data };
  if (!data.branch_name) delete payload.branch_name;
  if (!data.swift_code) delete payload.swift_code;
  if (!data.memo) delete payload.memo;
  return payload;
}

interface FieldsProps {
  register: UseFormRegister<BankAccountFormData>;
  errors: FieldErrors<BankAccountFormData>;
  watch: UseFormWatch<BankAccountFormData>;
  setValue: UseFormSetValue<BankAccountFormData>;
}

function BankAccountFields({ register, errors, watch, setValue }: FieldsProps) {
  const companies = useAppStore((s) => s.companies);
  const currency = watch('currency');
  const isForeign = currency && currency !== 'KRW';
  return (
    <>
      <FormField label="법인" required error={errors.company_id?.message}>
        <Select value={watch('company_id') ?? ''} onValueChange={(v) => setValue('company_id', v ?? '')}>
          {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
          <SelectTrigger>
            <Txt text={companies.find((c) => c.company_id === watch('company_id'))?.company_name ?? ''} />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="은행명" required error={errors.bank_name?.message}>
          <Input {...register('bank_name')} placeholder="예: 신한은행" />
        </FormField>
        <FormField label="지점명">
          <Input {...register('branch_name')} placeholder="예: 강남지점" />
        </FormField>
      </div>
      <FormField label="계좌번호" required error={errors.account_number?.message}>
        <Input {...register('account_number')} placeholder="예: 110-000-000000" />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="예금주" required error={errors.account_holder?.message}>
          <Input {...register('account_holder')} />
        </FormField>
        <FormField label="통화" required error={errors.currency?.message}>
          {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
          <Select value={watch('currency') ?? 'KRW'} onValueChange={(v) => setValue('currency', v ?? 'KRW')}>
            <SelectTrigger>
              <Txt text={watch('currency') ?? 'KRW'} />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
      {isForeign && (
        <FormField label="SWIFT 코드" error={errors.swift_code?.message}>
          <Input {...register('swift_code')} placeholder="예: SHBKKRSE" />
        </FormField>
      )}
      <FormField label="메모">
        <Textarea {...register('memo')} rows={2} />
      </FormField>
      <FormField label="">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={!!watch('is_default')}
            onCheckedChange={(v) => setValue('is_default', v === true)}
          />
          <span>기본 계좌로 지정 (수금 등록 시 자동 선택 후보)</span>
        </label>
      </FormField>
    </>
  );
}

interface FormBodyProps {
  formId: string;
  editData?: BankAccount | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export function BankAccountFormBody({ formId, editData, onSubmit }: FormBodyProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<BankAccountFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<BankAccountFormData>,
    defaultValues: buildDefaults(editData),
  });

  useEffect(() => { reset(buildDefaults(editData)); }, [editData, reset]);

  return (
    <form id={formId} onSubmit={handleSubmit(async (data) => onSubmit(stripEmpty(data)))} className="space-y-3">
      <BankAccountFields register={register} errors={errors} watch={watch} setValue={setValue} />
    </form>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BankAccount | null;
}

export default function BankAccountForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<BankAccountFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<BankAccountFormData>,
  });

  useEffect(() => {
    if (open) reset(buildDefaults(editData));
  }, [open, editData, reset]);

  const handle = async (data: BankAccountFormData) => {
    await onSubmit(stripEmpty(data));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '계좌 수정' : '계좌 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <BankAccountFields register={register} errors={errors} watch={watch} setValue={setValue} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
