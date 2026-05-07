import { useEffect } from 'react';
import { useForm, type UseFormRegister, type FieldErrors, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import FormField from '@/components/common/FormField';
import type { Partner } from '@/types/masters';

const PARTNER_TYPE_LABEL: Record<string, string> = { supplier: '공급사', customer: '고객사', both: '공급+고객' };
function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  partner_name: z.string().min(1, '거래처명은 필수입니다'),
  partner_type: z.string().min(1, '유형은 필수입니다'),
  erp_code: z.string().optional(),
  payment_terms: z.string().optional(),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().optional(),
});
export type PartnerFormData = z.infer<typeof schema>;

function buildDefaults(editData?: Partner | null): PartnerFormData {
  return editData
    ? {
      partner_name: editData.partner_name,
      partner_type: editData.partner_type,
      erp_code: editData.erp_code ?? '',
      payment_terms: editData.payment_terms ?? '',
      contact_name: editData.contact_name ?? '',
      contact_phone: editData.contact_phone ?? '',
      contact_email: editData.contact_email ?? '',
    }
    : { partner_name: '', partner_type: '', erp_code: '', payment_terms: '', contact_name: '', contact_phone: '', contact_email: '' };
}

interface FieldsProps {
  register: UseFormRegister<PartnerFormData>;
  errors: FieldErrors<PartnerFormData>;
  watch: UseFormWatch<PartnerFormData>;
  setValue: UseFormSetValue<PartnerFormData>;
}

function PartnerFields({ register, errors, watch, setValue }: FieldsProps) {
  return (
    <>
      <FormField label="거래처명" required error={errors.partner_name?.message}>
        <Input {...register('partner_name')} />
      </FormField>
      <FormField label="유형" required error={errors.partner_type?.message}>
        {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
        <Select value={watch('partner_type') ?? ''} onValueChange={(v) => setValue('partner_type', v ?? '')}>
          <SelectTrigger><Txt text={PARTNER_TYPE_LABEL[watch('partner_type') ?? ''] ?? ''} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="supplier">공급사</SelectItem>
            <SelectItem value="customer">고객사</SelectItem>
            <SelectItem value="both">공급+고객</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="ERP코드"><Input {...register('erp_code')} /></FormField>
        <FormField label="결제조건"><Input {...register('payment_terms')} /></FormField>
      </div>
      <FormField label="담당자"><Input {...register('contact_name')} /></FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="연락처"><Input {...register('contact_phone')} /></FormField>
        <FormField label="이메일"><Input {...register('contact_email')} /></FormField>
      </div>
    </>
  );
}

interface FormBodyProps {
  formId: string;
  editData?: Partner | null;
  onSubmit: (data: PartnerFormData) => Promise<void>;
}

export function PartnerFormBody({ formId, editData, onSubmit }: FormBodyProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<PartnerFormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(editData),
  });

  useEffect(() => { reset(buildDefaults(editData)); }, [editData, reset]);

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <PartnerFields register={register} errors={errors} watch={watch} setValue={setValue} />
    </form>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PartnerFormData) => Promise<void>;
  editData?: Partner | null;
}

export default function PartnerForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<PartnerFormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) reset(buildDefaults(editData));
  }, [open, editData, reset]);

  const handle = async (data: PartnerFormData) => { await onSubmit(data); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '거래처 수정' : '거래처 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <PartnerFields register={register} errors={errors} watch={watch} setValue={setValue} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
