import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import type { Product, Manufacturer } from '@/types/masters';

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
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Product | null;
}

export default function ProductForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      if (editData) {
        reset({
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
          memo: editData.memo ?? '',
        });
      } else {
        reset({
          product_code: '', product_name: '', manufacturer_id: '',
          spec_wp: '' as unknown as number, wattage_kw: '' as unknown as number,
          module_width_mm: '' as unknown as number, module_height_mm: '' as unknown as number,
          module_depth_mm: '', weight_kg: '',
          wafer_platform: '', cell_config: '', series_name: '', memo: '',
        });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = { ...data };
    if (data.module_depth_mm === '' || data.module_depth_mm === undefined) delete payload.module_depth_mm;
    if (data.weight_kg === '' || data.weight_kg === undefined) delete payload.weight_kg;
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '품번 수정' : '품번 등록'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
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
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
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
          <div className="space-y-1.5">
            <Label>시리즈명</Label>
            <Input {...register('series_name')} />
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
