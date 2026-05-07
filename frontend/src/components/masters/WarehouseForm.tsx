import { useEffect } from 'react';
import { useForm, type UseFormRegister, type FieldErrors, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import FormField from '@/components/common/FormField';
import type { Warehouse } from '@/types/masters';

const WH_TYPE_LABEL: Record<string, string> = { port: '항구', factory: '공장', vendor: '업체' };
function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  warehouse_code: z.string().length(4, '4자리 필수'),
  warehouse_name: z.string().min(1, '창고명은 필수입니다'),
  warehouse_type: z.string().min(1, '유형은 필수입니다'),
  location_code: z.string().length(4, '4자리 필수'),
  location_name: z.string().min(1, '장소명은 필수입니다'),
});
export type WarehouseFormData = z.infer<typeof schema>;

function buildDefaults(editData?: Warehouse | null): WarehouseFormData {
  return editData
    ? {
      warehouse_code: editData.warehouse_code,
      warehouse_name: editData.warehouse_name,
      warehouse_type: editData.warehouse_type,
      location_code: editData.location_code,
      location_name: editData.location_name,
    }
    : { warehouse_code: '', warehouse_name: '', warehouse_type: '', location_code: '', location_name: '' };
}

interface FieldsProps {
  register: UseFormRegister<WarehouseFormData>;
  errors: FieldErrors<WarehouseFormData>;
  watch: UseFormWatch<WarehouseFormData>;
  setValue: UseFormSetValue<WarehouseFormData>;
}

function WarehouseFields({ register, errors, watch, setValue }: FieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="창고코드 (4자)" required error={errors.warehouse_code?.message}>
          <Input maxLength={4} {...register('warehouse_code')} />
        </FormField>
        <FormField label="창고명" required error={errors.warehouse_name?.message}>
          <Input {...register('warehouse_name')} />
        </FormField>
      </div>
      <FormField label="유형" required error={errors.warehouse_type?.message}>
        {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
        <Select value={watch('warehouse_type') ?? ''} onValueChange={(v) => setValue('warehouse_type', v ?? '')}>
          <SelectTrigger><Txt text={WH_TYPE_LABEL[watch('warehouse_type') ?? ''] ?? ''} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="port">항구</SelectItem>
            <SelectItem value="factory">공장</SelectItem>
            <SelectItem value="vendor">업체</SelectItem>
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="장소코드 (4자)" required error={errors.location_code?.message}>
          <Input maxLength={4} {...register('location_code')} />
        </FormField>
        <FormField label="장소명" required error={errors.location_name?.message}>
          <Input {...register('location_name')} />
        </FormField>
      </div>
    </>
  );
}

interface FormBodyProps {
  formId: string;
  editData?: Warehouse | null;
  onSubmit: (data: WarehouseFormData) => Promise<void>;
}

export function WarehouseFormBody({ formId, editData, onSubmit }: FormBodyProps) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<WarehouseFormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(editData),
  });

  useEffect(() => { reset(buildDefaults(editData)); }, [editData, reset]);

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <WarehouseFields register={register} errors={errors} watch={watch} setValue={setValue} />
    </form>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WarehouseFormData) => Promise<void>;
  editData?: Warehouse | null;
}

export default function WarehouseForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<WarehouseFormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) reset(buildDefaults(editData));
  }, [open, editData, reset]);

  const handle = async (data: WarehouseFormData) => { await onSubmit(data); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '창고 수정' : '창고 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <WarehouseFields register={register} errors={errors} watch={watch} setValue={setValue} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
