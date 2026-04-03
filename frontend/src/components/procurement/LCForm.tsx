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
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { LCRecord, PurchaseOrder } from '@/types/procurement';
import type { Bank } from '@/types/masters';

const schema = z.object({
  lc_number: z.string().optional(),
  po_id: z.string().min(1, 'PO는 필수입니다'),
  bank_id: z.string().min(1, '은행은 필수입니다'),
  open_date: z.string().optional(),
  amount_usd: z.coerce.number().positive('양수만 가능합니다'),
  target_qty: z.coerce.number().optional().or(z.literal('')),
  target_mw: z.coerce.number().optional().or(z.literal('')),
  usance_days: z.coerce.number().optional().or(z.literal('')),
  usance_type: z.string().optional(),
  maturity_date: z.string().optional(),
  settlement_date: z.string().optional(),
  status: z.string().min(1, '상태는 필수입니다'),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: Record<string, unknown>) => Promise<void>; editData?: LCRecord | null; }

export default function LCForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?company_id=${selectedCompanyId}`).then(setPos).catch(() => {});
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`).then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => {});
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (open) {
      if (editData) {
        reset({ lc_number: editData.lc_number ?? '', po_id: editData.po_id, bank_id: editData.bank_id, open_date: editData.open_date?.slice(0, 10) ?? '', amount_usd: editData.amount_usd, target_qty: editData.target_qty ?? '', target_mw: editData.target_mw ?? '', usance_days: editData.usance_days ?? '', usance_type: editData.usance_type ?? '', maturity_date: editData.maturity_date?.slice(0, 10) ?? '', settlement_date: editData.settlement_date?.slice(0, 10) ?? '', status: editData.status, memo: editData.memo ?? '' });
      } else {
        reset({ lc_number: '', po_id: '', bank_id: '', open_date: '', amount_usd: '' as unknown as number, target_qty: '', target_mw: '', usance_days: 90, usance_type: 'buyers', maturity_date: '', settlement_date: '', status: 'pending', memo: '' });
      }
    }
  }, [open, editData, reset]);

  const handle = async (data: FormData) => {
    const payload: Record<string, unknown> = { ...data, company_id: selectedCompanyId };
    if (data.target_qty === '' || data.target_qty === undefined) delete payload.target_qty;
    if (data.target_mw === '' || data.target_mw === undefined) delete payload.target_mw;
    if (data.usance_days === '' || data.usance_days === undefined) delete payload.usance_days;
    if (!data.open_date) delete payload.open_date;
    if (!data.maturity_date) delete payload.maturity_date;
    if (!data.settlement_date) delete payload.settlement_date;
    await onSubmit(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editData ? 'LC 수정' : 'LC 등록'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>LC번호</Label><Input {...register('lc_number')} /></div>
            <div className="space-y-1.5">
              <Label>PO *</Label>
              <Select value={watch('po_id') ?? ''} onValueChange={(v) => setValue('po_id', v ?? '')}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{pos.map((p) => <SelectItem key={p.po_id} value={p.po_id}>{p.po_number || p.po_id.slice(0, 8)}</SelectItem>)}</SelectContent>
              </Select>{errors.po_id && <p className="text-xs text-destructive">{errors.po_id.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>은행 *</Label>
            <Select value={watch('bank_id') ?? ''} onValueChange={(v) => setValue('bank_id', v ?? '')}><SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>{banks.map((b) => <SelectItem key={b.bank_id} value={b.bank_id}>{b.bank_name}</SelectItem>)}</SelectContent>
            </Select>{errors.bank_id && <p className="text-xs text-destructive">{errors.bank_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>개설일</Label><Input type="date" {...register('open_date')} /></div>
            <div className="space-y-1.5"><Label>금액(USD) *</Label><Input type="number" step="0.01" {...register('amount_usd')} />{errors.amount_usd && <p className="text-xs text-destructive">{errors.amount_usd.message}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>대상수량</Label><Input type="number" {...register('target_qty')} /></div>
            <div className="space-y-1.5"><Label>대상MW</Label><Input type="number" step="0.01" {...register('target_mw')} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Usance(일)</Label><Input type="number" {...register('usance_days')} /></div>
            <div className="space-y-1.5">
              <Label>Usance유형</Label>
              <Select value={watch('usance_type') ?? ''} onValueChange={(v) => setValue('usance_type', v ?? '')}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="buyers">Buyer's</SelectItem><SelectItem value="shippers">Shipper's</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>만기일</Label><Input type="date" {...register('maturity_date')} /></div>
            <div className="space-y-1.5"><Label>결제일</Label><Input type="date" {...register('settlement_date')} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>상태 *</Label>
            <Select value={watch('status') ?? ''} onValueChange={(v) => setValue('status', v ?? '')}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="pending">대기</SelectItem><SelectItem value="opened">개설</SelectItem><SelectItem value="docs_received">서류접수</SelectItem><SelectItem value="settled">결제완료</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
