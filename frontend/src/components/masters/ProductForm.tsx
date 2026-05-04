import { useEffect, useState } from 'react';
import { useForm, type Resolver, type UseFormRegister, type FieldErrors, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import type { Product, Manufacturer } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

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
    module_efficiency: '', module_type: '', module_grade: '',
    memo: '',
  };
}

function stripEmpty(data: ProductFormData): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...data };
  if (data.module_depth_mm === '' || data.module_depth_mm === undefined) delete payload.module_depth_mm;
  if (data.weight_kg === '' || data.weight_kg === undefined) delete payload.weight_kg;
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
        <div className="space-y-1.5">
          <Label>품번코드 *</Label>
          <Input {...register('product_code')} />
          {errors.product_code && <p className="text-xs text-destructive">{errors.product_code.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>품명 *</Label>
          <Input {...register('product_name')} />
          {errors.product_name && <p className="text-xs text-destructive">{errors.product_name.message}</p>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>제조사 *</Label>
        <Select value={watch('manufacturer_id') ?? ''} onValueChange={(v) => setValue('manufacturer_id', v ?? '')}>
          {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
          <SelectTrigger><Txt text={manufacturers.find(m => m.manufacturer_id === watch('manufacturer_id'))?.name_kr ?? ''} /></SelectTrigger>
          <SelectContent>
            {manufacturers.map((m) => (
              <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.manufacturer_id && <p className="text-xs text-destructive">{errors.manufacturer_id.message}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>규격(Wp) *</Label>
          <Input type="number" {...register('spec_wp')} />
          {errors.spec_wp && <p className="text-xs text-destructive">{errors.spec_wp.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>용량(kW) *</Label>
          <Input type="number" step="0.001" {...register('wattage_kw')} />
          {errors.wattage_kw && <p className="text-xs text-destructive">{errors.wattage_kw.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>가로(mm) *</Label>
          <Input type="number" {...register('module_width_mm')} />
          {errors.module_width_mm && <p className="text-xs text-destructive">{errors.module_width_mm.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>세로(mm) *</Label>
          <Input type="number" {...register('module_height_mm')} />
          {errors.module_height_mm && <p className="text-xs text-destructive">{errors.module_height_mm.message}</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>두께(mm)</Label>
          <Input type="number" {...register('module_depth_mm')} />
        </div>
        <div className="space-y-1.5">
          <Label>무게(kg)</Label>
          <Input type="number" step="0.1" {...register('weight_kg')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>웨이퍼 플랫폼</Label>
          <Input {...register('wafer_platform')} />
        </div>
        <div className="space-y-1.5">
          <Label>셀 구성</Label>
          <Input {...register('cell_config')} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>모듈 효율(%)</Label>
          <Input type="number" step="0.01" placeholder="예: 22.50" {...register('module_efficiency')} />
          {errors.module_efficiency && <p className="text-xs text-destructive">{errors.module_efficiency.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>모듈 종류</Label>
          <Select value={watch('module_type') ?? ''} onValueChange={(v) => setValue('module_type', (v as 'PERC' | 'TOPCON' | 'BC') ?? '')}>
            {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
            <SelectTrigger><Txt text={watch('module_type') ?? ''} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PERC">PERC</SelectItem>
              <SelectItem value="TOPCON">TOPCON</SelectItem>
              <SelectItem value="BC">BC</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>모듈 등급</Label>
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
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>시리즈명</Label>
        <Input {...register('series_name')} />
      </div>
      <div className="space-y-1.5">
        <Label>메모</Label>
        <Textarea {...register('memo')} rows={2} />
      </div>
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
