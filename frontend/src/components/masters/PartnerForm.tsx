import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
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
type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: FormData) => Promise<void>;
  editData?: Partner | null;
}

export default function PartnerForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (open) {
      reset(editData ? {
        partner_name: editData.partner_name,
        partner_type: editData.partner_type,
        erp_code: editData.erp_code ?? '',
        payment_terms: editData.payment_terms ?? '',
        contact_name: editData.contact_name ?? '',
        contact_phone: editData.contact_phone ?? '',
        contact_email: editData.contact_email ?? '',
      } : { partner_name: '', partner_type: '', erp_code: '', payment_terms: '', contact_name: '', contact_phone: '', contact_email: '' });
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => { await onSubmit(data); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? '거래처 수정' : '거래처 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>거래처명 *</Label>
            <Input {...register('partner_name')} />
            {errors.partner_name && <p className="text-xs text-destructive">{errors.partner_name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>유형 *</Label>
            {/* eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가 */}
            <Select value={watch('partner_type') ?? ''} onValueChange={(v) => setValue('partner_type', v ?? '')}>
              <SelectTrigger><Txt text={PARTNER_TYPE_LABEL[watch('partner_type') ?? ''] ?? ''} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supplier">공급사</SelectItem>
                <SelectItem value="customer">고객사</SelectItem>
                <SelectItem value="both">공급+고객</SelectItem>
              </SelectContent>
            </Select>
            {errors.partner_type && <p className="text-xs text-destructive">{errors.partner_type.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>ERP코드</Label><Input {...register('erp_code')} /></div>
            <div className="space-y-1.5"><Label>결제조건</Label><Input {...register('payment_terms')} /></div>
          </div>
          <div className="space-y-1.5"><Label>담당자</Label><Input {...register('contact_name')} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>연락처</Label><Input {...register('contact_phone')} /></div>
            <div className="space-y-1.5"><Label>이메일</Label><Input {...register('contact_email')} /></div>
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
