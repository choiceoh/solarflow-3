import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { Manufacturer } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  name_kr: z.string().min(1, '제조사명(한)은 필수입니다'),
  name_en: z.string().optional(),
  short_name: z.string().max(20, '약칭은 20자 이내').optional(),
  tier: z.number().int().min(1, 'Tier는 1 이상').max(9, 'Tier는 9 이하'),
  priority_rank: z.number().int().min(1, '표시순위는 1 이상'),
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
        short_name: editData.short_name ?? '',
        tier: editData.tier ?? 3,
        priority_rank: editData.priority_rank ?? 999,
        country: editData.country,
        domestic_foreign: editData.domestic_foreign,
      } : { name_kr: '', name_en: '', short_name: '', tier: 3, priority_rank: 999, country: '', domestic_foreign: '' });
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
            <Label>약칭 <span className="text-muted-foreground font-normal text-xs">(화면 표시용 · 예: 진코, 론지, 트리나)</span></Label>
            <Input {...register('short_name')} placeholder="예: 진코" maxLength={20} />
            {errors.short_name && <p className="text-xs text-destructive">{errors.short_name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tier *</Label>
              <Input type="number" min={1} max={9} {...register('tier', { valueAsNumber: true })} />
              {errors.tier && <p className="text-xs text-destructive">{errors.tier.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>표시순위 *</Label>
              <Input type="number" min={1} {...register('priority_rank', { valueAsNumber: true })} placeholder="예: 10" />
              {errors.priority_rank && <p className="text-xs text-destructive">{errors.priority_rank.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>국가 *</Label>
            <Input {...register('country')} />
            {errors.country && <p className="text-xs text-destructive">{errors.country.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>국내/해외 *</Label>
            {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
            <Select value={watch('domestic_foreign') ?? ''} onValueChange={(v) => setValue('domestic_foreign', v ?? '')}>
              <SelectTrigger><Txt text={watch('domestic_foreign') ?? ''} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="국내">국내</SelectItem>
                <SelectItem value="해외">해외</SelectItem>
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
