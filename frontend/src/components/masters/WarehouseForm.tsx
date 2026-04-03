import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Warehouse } from '@/types/masters';

const schema = z.object({
  warehouse_code: z.string().length(4, '4자리 필수'),
  warehouse_name: z.string().min(1, '창고명은 필수입니다'),
  warehouse_type: z.string().min(1, '유형은 필수입니다'),
  location_code: z.string().length(4, '4자리 필수'),
  location_name: z.string().min(1, '장소명은 필수입니다'),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<void>;
  editData?: Warehouse | null;
}

export default function WarehouseForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) {
      reset(editData ? {
        warehouse_code: editData.warehouse_code,
        warehouse_name: editData.warehouse_name,
        warehouse_type: editData.warehouse_type,
        location_code: editData.location_code,
        location_name: editData.location_name,
      } : { warehouse_code: '', warehouse_name: '', warehouse_type: '', location_code: '', location_name: '' });
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => { await onSubmit(data); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '창고 수정' : '창고 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>창고코드 * (4자)</Label>
              <Input maxLength={4} {...register('warehouse_code')} />
              {errors.warehouse_code && <p className="text-xs text-destructive">{errors.warehouse_code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>창고명 *</Label>
              <Input {...register('warehouse_name')} />
              {errors.warehouse_name && <p className="text-xs text-destructive">{errors.warehouse_name.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>유형 *</Label>
            <Select value={watch('warehouse_type') ?? ''} onValueChange={(v) => setValue('warehouse_type', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="port">항구</SelectItem>
                <SelectItem value="factory">공장</SelectItem>
                <SelectItem value="vendor">업체</SelectItem>
              </SelectContent>
            </Select>
            {errors.warehouse_type && <p className="text-xs text-destructive">{errors.warehouse_type.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>장소코드 * (4자)</Label>
              <Input maxLength={4} {...register('location_code')} />
              {errors.location_code && <p className="text-xs text-destructive">{errors.location_code.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>장소명 *</Label>
              <Input {...register('location_name')} />
              {errors.location_name && <p className="text-xs text-destructive">{errors.location_name.message}</p>}
            </div>
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
