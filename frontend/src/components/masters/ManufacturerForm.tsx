import { useEffect } from 'react';
import { useForm, type UseFormRegister, type FieldErrors, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import FormField from '@/components/common/FormField';
import type { Manufacturer } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  name_kr: z.string().min(1, '제조사명(한)은 필수입니다'),
  name_en: z.string().optional(),
  short_name: z.string().max(20, '약칭은 20자 이내').optional(),
  priority_rank: z.number().int().min(1, '표시순위는 1 이상'),
  country: z.string().min(1, '국가는 필수입니다'),
  domestic_foreign: z.string().min(1, '국내/해외 구분은 필수입니다'),
});
export type ManufacturerFormData = z.infer<typeof schema>;

function buildDefaults(editData?: Manufacturer | null): ManufacturerFormData {
  return editData
    ? {
      name_kr: editData.name_kr,
      name_en: editData.name_en ?? '',
      short_name: editData.short_name ?? '',
      priority_rank: editData.priority_rank ?? 999,
      country: editData.country,
      domestic_foreign: editData.domestic_foreign,
    }
    : { name_kr: '', name_en: '', short_name: '', priority_rank: 999, country: '', domestic_foreign: '' };
}

interface FieldsProps {
  register: UseFormRegister<ManufacturerFormData>;
  errors: FieldErrors<ManufacturerFormData>;
  watch: UseFormWatch<ManufacturerFormData>;
  setValue: UseFormSetValue<ManufacturerFormData>;
}

function ManufacturerFields({ register, errors, watch, setValue }: FieldsProps) {
  return (
    <>
      <FormField label="제조사명(한)" required error={errors.name_kr?.message}>
        <Input {...register('name_kr')} />
      </FormField>
      <FormField label="제조사명(영)">
        <Input {...register('name_en')} />
      </FormField>
      <FormField
        label={<>약칭 <span className="text-muted-foreground font-normal text-xs">(화면 표시용 · 예: 진코, 론지, 트리나)</span></>}
        error={errors.short_name?.message}
      >
        <Input {...register('short_name')} placeholder="예: 진코" maxLength={20} />
      </FormField>
      <FormField
        label={<>표시순위 <span className="text-muted-foreground font-normal text-xs">(낮을수록 드롭다운 위에 표시)</span></>}
        required
        error={errors.priority_rank?.message}
      >
        <Input type="number" min={1} {...register('priority_rank', { valueAsNumber: true })} placeholder="예: 10" />
      </FormField>
      <FormField label="국가" required error={errors.country?.message}>
        <Input {...register('country')} />
      </FormField>
      <FormField label="국내/해외" required error={errors.domestic_foreign?.message}>
        {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
        <Select value={watch('domestic_foreign') ?? ''} onValueChange={(v) => setValue('domestic_foreign', v ?? '')}>
          <SelectTrigger><Txt text={watch('domestic_foreign') ?? ''} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="국내">국내</SelectItem>
            <SelectItem value="해외">해외</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
    </>
  );
}

interface FormBodyProps {
  formId: string;
  editData?: Manufacturer | null;
  onSubmit: (data: ManufacturerFormData) => Promise<void>;
}

export function ManufacturerFormBody({ formId, editData, onSubmit }: FormBodyProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ManufacturerFormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(editData),
  });

  useEffect(() => { reset(buildDefaults(editData)); }, [editData, reset]);

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <ManufacturerFields register={register} errors={errors} watch={watch} setValue={setValue} />
    </form>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ManufacturerFormData) => Promise<void>;
  editData?: Manufacturer | null;
}

export default function ManufacturerForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<ManufacturerFormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) reset(buildDefaults(editData));
  }, [open, editData, reset]);

  const handle = async (data: ManufacturerFormData) => {
    await onSubmit(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editData ? '제조사 수정' : '제조사 등록'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-4">
          <ManufacturerFields register={register} errors={errors} watch={watch} setValue={setValue} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
