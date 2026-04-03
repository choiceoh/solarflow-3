import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Manufacturer } from '@/types/masters';

const schema = z.object({
  name_kr: z.string().min(1, '제조사명(한)은 필수입니다'),
  name_en: z.string().optional(),
  country: z.string().min(1, '국가는 필수입니다'),
  domestic_foreign: z.string().min(1, '국내/해외 구분은 필수입니다'),
});
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<void>;
  editData?: Manufacturer | null;
}

export default function ManufacturerForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) {
      reset(editData ? {
        name_kr: editData.name_kr,
        name_en: editData.name_en ?? '',
        country: editData.country,
        domestic_foreign: editData.domestic_foreign,
      } : { name_kr: '', name_en: '', country: '', domestic_foreign: '' });
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
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
          <div className="space-y-1.5">
            <Label>제조사명(한) *</Label>
            <Input {...register('name_kr')} />
            {errors.name_kr && <p className="text-xs text-destructive">{errors.name_kr.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>제조사명(영)</Label>
            <Input {...register('name_en')} />
          </div>
          <div className="space-y-1.5">
            <Label>국가 *</Label>
            <Input {...register('country')} />
            {errors.country && <p className="text-xs text-destructive">{errors.country.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>국내/해외 *</Label>
            <Select value={watch('domestic_foreign') ?? ''} onValueChange={(v) => setValue('domestic_foreign', v ?? '')}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="domestic">국내</SelectItem>
                <SelectItem value="foreign">해외</SelectItem>
              </SelectContent>
            </Select>
            {errors.domestic_foreign && <p className="text-xs text-destructive">{errors.domestic_foreign.message}</p>}
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
