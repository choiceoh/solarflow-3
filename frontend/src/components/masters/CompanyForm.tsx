import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { Company } from '@/types/masters';

const schema = z.object({
  company_name: z.string().min(1, '법인명은 필수입니다'),
  company_code: z.string().min(1, '법인코드는 필수입니다'),
  business_number: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface CompanyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<void>;
  editData?: Company | null;
}

export default function CompanyForm({ open, onOpenChange, onSubmit, editData }: CompanyFormProps) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) {
      reset(editData ? {
        company_name: editData.company_name,
        company_code: editData.company_code,
        business_number: editData.business_number ?? '',
      } : { company_name: '', company_code: '', business_number: '' });
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
          <DialogTitle>{editData ? '법인 수정' : '법인 등록'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company_name">법인명 *</Label>
            <Input id="company_name" {...register('company_name')} />
            {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company_code">법인코드 *</Label>
            <Input id="company_code" {...register('company_code')} />
            {errors.company_code && <p className="text-xs text-destructive">{errors.company_code.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="business_number">사업자번호</Label>
            <Input id="business_number" {...register('business_number')} />
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
