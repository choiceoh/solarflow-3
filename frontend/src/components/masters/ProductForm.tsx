import { useEffect, useState } from 'react';
import { useForm, type Resolver, type UseFormRegister, type FieldErrors, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import FormField from '@/components/common/FormField';
import { fetchWithAuth } from '@/lib/api';
import type { Product, Manufacturer } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const PRODUCT_VARIANT_LABEL: Record<string, string> = {
  output_bin: '출력 binning',
  bom_variant: 'BOM 차이',
  cert_variant: '인증 차이',
  label_variant: '라벨 차이',
  packaging_variant: '포장 차이',
  mixed: '복합',
  other: '기타',
};

const schema = z.object({
  product_code: z.string().min(1, '품번코드는 필수입니다'),
  product_name: z.string().min(1, '품명은 필수입니다'),
  manufacturer_id: z.string().min(1, '제조사는 필수입니다'),
  spec_wp: z.coerce.number().positive('양수만 가능합니다'),
  wattage_kw: z.coerce.number().positive('양수만 가능합니다'),
  module_width_mm: z.coerce.number().positive('양수만 가능합니다'),
  module_height_mm: z.coerce.number().positive('양수만 가능합니다'),
  module_depth_mm: z.coerce.number().optional().or(z.literal('')),
  weight_kg: z.coerce.number().optional().or(z.literal('')),
  wafer_platform: z.string().optional(),
  cell_config: z.string().optional(),
  series_name: z.string().optional(),
  product_family_code: z.string().max(80, '80자 이하여야 합니다').optional(),
  product_variant_kind: z.enum(['output_bin', 'bom_variant', 'cert_variant', 'label_variant', 'packaging_variant', 'mixed', 'other']).optional().or(z.literal('')),
  bom_revision: z.string().max(50, '50자 이하여야 합니다').optional(),
  substitution_group_code: z.string().max(80, '80자 이하여야 합니다').optional(),
  module_efficiency: z.coerce.number().positive('양수만 가능합니다').max(100, '100 이하여야 합니다').optional().or(z.literal('')),
  module_type: z.enum(['PERC', 'TOPCON', 'BC']).optional().or(z.literal('')),
  module_grade: z.enum(['1', '2', '3', 'NA']).optional().or(z.literal('')),
  memo: z.string().optional(),
});
export type ProductFormData = z.infer<typeof schema>;

function buildDefaults(editData?: Product | null): ProductFormData {
  if (editData) {
    return {
      product_code: editData.product_code,
      product_name: editData.product_name,
      manufacturer_id: editData.manufacturer_id,
      spec_wp: editData.spec_wp,
      wattage_kw: editData.wattage_kw,
      module_width_mm: editData.module_width_mm,
      module_height_mm: editData.module_height_mm,
      module_depth_mm: editData.module_depth_mm ?? '',
      weight_kg: editData.weight_kg ?? '',
      wafer_platform: editData.wafer_platform ?? '',
      cell_config: editData.cell_config ?? '',
      series_name: editData.series_name ?? '',
      product_family_code: editData.product_family_code ?? '',
      product_variant_kind: editData.product_variant_kind ?? '',
      bom_revision: editData.bom_revision ?? '',
      substitution_group_code: editData.substitution_group_code ?? '',
      module_efficiency: editData.module_efficiency ?? '',
      module_type: editData.module_type ?? '',
      module_grade: editData.module_grade ?? '',
      memo: editData.memo ?? '',
    };
  }
  return {
    product_code: '', product_name: '', manufacturer_id: '',
    spec_wp: '' as unknown as number, wattage_kw: '' as unknown as number,
    module_width_mm: '' as unknown as number, module_height_mm: '' as unknown as number,
    module_depth_mm: '', weight_kg: '',
    wafer_platform: '', cell_config: '', series_name: '',
    product_family_code: '', product_variant_kind: '', bom_revision: '', substitution_group_code: '',
    module_efficiency: '', module_type: '', module_grade: '',
    memo: '',
  };
}

function stripEmpty(data: ProductFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...data };
  if (data.module_depth_mm === '' || data.module_depth_mm === undefined) delete payload.module_depth_mm;
  if (data.weight_kg === '' || data.weight_kg === undefined) delete payload.weight_kg;
  if (data.product_family_code === '' || data.product_family_code === undefined) delete payload.product_family_code;
  if (data.product_variant_kind === '' || data.product_variant_kind === undefined) delete payload.product_variant_kind;
  if (data.bom_revision === '' || data.bom_revision === undefined) delete payload.bom_revision;
  if (data.substitution_group_code === '' || data.substitution_group_code === undefined) delete payload.substitution_group_code;
  if (data.module_efficiency === '' || data.module_efficiency === undefined) delete payload.module_efficiency;
  if (data.module_type === '' || data.module_type === undefined) delete payload.module_type;
  if (data.module_grade === '' || data.module_grade === undefined) delete payload.module_grade;
  return payload;
}

interface FieldsProps {
  register: UseFormRegister<ProductFormData>;
  errors: FieldErrors<ProductFormData>;
  watch: UseFormWatch<ProductFormData>;
  setValue: UseFormSetValue<ProductFormData>;
  manufacturers: Manufacturer[];
}

function ProductFields({ register, errors, watch, setValue, manufacturers }: FieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="품번코드" required error={errors.product_code?.message}>
          <Input {...register('product_code')} />
        </FormField>
        <FormField label="품명" required error={errors.product_name?.message}>
          <Input {...register('product_name')} />
        </FormField>
      </div>
      <FormField label="제조사" required error={errors.manufacturer_id?.message}>
        <Select value={watch('manufacturer_id') ?? ''} onValueChange={(v) => setValue('manufacturer_id', v ?? '')}>
          {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
          <SelectTrigger><Txt text={manufacturers.find(m => m.manufacturer_id === watch('manufacturer_id'))?.name_kr ?? ''} /></SelectTrigger>
          <SelectContent>
            {manufacturers.map((m) => (
              <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="규격(Wp)" required error={errors.spec_wp?.message}>
          <Input type="number" {...register('spec_wp')} />
        </FormField>
        <FormField label="용량(kW)" required error={errors.wattage_kw?.message}>
          <Input type="number" step="0.001" {...register('wattage_kw')} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="가로(mm)" required error={errors.module_width_mm?.message}>
          <Input type="number" {...register('module_width_mm')} />
        </FormField>
        <FormField label="세로(mm)" required error={errors.module_height_mm?.message}>
          <Input type="number" {...register('module_height_mm')} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="두께(mm)">
          <Input type="number" {...register('module_depth_mm')} />
        </FormField>
        <FormField label="무게(kg)">
          <Input type="number" step="0.1" {...register('weight_kg')} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="웨이퍼 플랫폼">
          <Input {...register('wafer_platform')} />
        </FormField>
        <FormField label="셀 구성">
          <Input {...register('cell_config')} />
        </FormField>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="모듈 효율(%)" error={errors.module_efficiency?.message}>
          <Input type="number" step="0.01" placeholder="예: 22.50" {...register('module_efficiency')} />
        </FormField>
        <FormField label="모듈 종류">
          <Select value={watch('module_type') ?? ''} onValueChange={(v) => setValue('module_type', (v as 'PERC' | 'TOPCON' | 'BC') ?? '')}>
            {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
            <SelectTrigger><Txt text={watch('module_type') ?? ''} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PERC">PERC</SelectItem>
              <SelectItem value="TOPCON">TOPCON</SelectItem>
              <SelectItem value="BC">BC</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="모듈 등급">
          <Select
            value={watch('module_grade') ?? ''}
            onValueChange={(v) => setValue('module_grade', (v as '1' | '2' | '3' | 'NA') ?? '')}
          >
            {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
            <SelectTrigger><Txt text={watch('module_grade') === 'NA' ? '미해당' : watch('module_grade') ? `${watch('module_grade')}등급` : ''} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1등급</SelectItem>
              <SelectItem value="2">2등급</SelectItem>
              <SelectItem value="3">3등급</SelectItem>
              <SelectItem value="NA">미해당(NA)</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>
      <FormField label="시리즈명">
        <Input {...register('series_name')} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="제품군 코드" error={errors.product_family_code?.message}>
          <Input placeholder="예: JKM-N-78HL4-BDV-S" {...register('product_family_code')} />
        </FormField>
        <FormField label="대체그룹" error={errors.substitution_group_code?.message}>
          <Input placeholder="예: JKM-78HL4-BDV" {...register('substitution_group_code')} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="분리 사유" error={errors.product_variant_kind?.message}>
          <Select
            value={watch('product_variant_kind') ?? ''}
            onValueChange={(v) => setValue('product_variant_kind', (v as ProductFormData['product_variant_kind']) ?? '')}
          >
            {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
            <SelectTrigger><Txt text={PRODUCT_VARIANT_LABEL[watch('product_variant_kind') ?? ''] ?? ''} /></SelectTrigger>
            <SelectContent>
              {Object.entries(PRODUCT_VARIANT_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="BOM Rev" error={errors.bom_revision?.message}>
          <Input placeholder="예: BOM-A" {...register('bom_revision')} />
        </FormField>
      </div>
      <FormField label="메모">
        <Textarea {...register('memo')} rows={2} />
      </FormField>
    </>
  );
}

function useManufacturers() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => {});
  }, []);
  return manufacturers;
}

interface FormBodyProps {
  formId: string;
  editData?: Product | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export function ProductFormBody({ formId, editData, onSubmit }: FormBodyProps) {
  const manufacturers = useManufacturers();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProductFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<ProductFormData>,
    defaultValues: buildDefaults(editData),
  });

  useEffect(() => { reset(buildDefaults(editData)); }, [editData, reset]);

  return (
    <form id={formId} onSubmit={handleSubmit(async (data) => onSubmit(stripEmpty(data)))} className="space-y-3">
      <ProductFields register={register} errors={errors} watch={watch} setValue={setValue} manufacturers={manufacturers} />
    </form>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Product | null;
}

export default function ProductForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const manufacturers = useManufacturers();
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<ProductFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<ProductFormData>,
  });

  useEffect(() => {
    if (open) reset(buildDefaults(editData));
  }, [open, editData, reset]);

  const handle = async (data: ProductFormData) => {
    await onSubmit(stripEmpty(data));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '품번 수정' : '품번 등록'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <ProductFields register={register} errors={errors} watch={watch} setValue={setValue} manufacturers={manufacturers} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
