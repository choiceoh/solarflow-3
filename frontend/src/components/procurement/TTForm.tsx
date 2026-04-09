import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { TTRemittance, PurchaseOrder, POLineItem } from '@/types/procurement';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

const schema = z.object({
  po_id: z.string().min(1, 'PO는 필수입니다'),
  remit_date: z.string().optional(),
  amount_usd: z.coerce.number().positive('양수만 가능합니다'),
  amount_krw: z.coerce.number().optional().or(z.literal('')),
  exchange_rate: z.coerce.number().optional().or(z.literal('')),
  purpose: z.string().optional(),
  status: z.string().min(1, '상태는 필수입니다'),
  bank_name: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (d: Record<string, unknown>) => Promise<void>; editData?: TTRemittance | null; defaultPoId?: string; }

export default function TTForm({ open, onOpenChange, onSubmit, editData, defaultPoId }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [submitError, setSubmitError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) as any });

  useEffect(() => {
    if (selectedCompanyId) fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?company_id=${selectedCompanyId}`).then(setPos).catch(() => {});
  }, [selectedCompanyId]);

  // F5: PO 선택 시 계약금 % 파싱 → amount_usd/purpose 자동 프리필 (신규 등록만)
  const watchedPoId = watch('po_id');
  useEffect(() => {
    if (editData || !watchedPoId || !open) return;
    (async () => {
      try {
        const [po, lines] = await Promise.all([
          fetchWithAuth<PurchaseOrder & { payment_terms?: string }>(`/api/v1/pos/${watchedPoId}`),
          fetchWithAuth<POLineItem[]>(`/api/v1/pos/${watchedPoId}/lines`).catch(() => [] as POLineItem[]),
        ]);
        const totalUsd = lines.reduce((s, l) => s + (l.total_amount_usd ?? 0), 0);
        // "T/T 5%" 또는 "계약금 10%" 패턴 파싱
        const pt = po.payment_terms ?? '';
        const m = pt.match(/(?:T\/T|계약금)\s*(\d+(?:\.\d+)?)\s*%/);
        if (m && totalUsd > 0) {
          const pct = parseFloat(m[1]);
          const amount = Number((totalUsd * pct / 100).toFixed(2));
          setValue('amount_usd', amount, { shouldDirty: true });
          setValue('purpose', `계약금 ${pct}%`, { shouldDirty: true });
        }
      } catch { /* skip */ }
    })();
  }, [watchedPoId, editData, open, setValue]);

  useEffect(() => {
    if (open) {
      setSubmitError('');
      if (editData) {
        reset({ po_id: editData.po_id, remit_date: editData.remit_date?.slice(0, 10) ?? '', amount_usd: editData.amount_usd, amount_krw: editData.amount_krw ?? '', exchange_rate: editData.exchange_rate ?? '', purpose: editData.purpose ?? '', status: editData.status, bank_name: editData.bank_name ?? '', memo: editData.memo ?? '' });
      } else {
        reset({ po_id: defaultPoId ?? '', remit_date: '', amount_usd: '' as unknown as number, amount_krw: '', exchange_rate: '', purpose: '', status: 'planned', bank_name: '', memo: '' });
      }
    }
  }, [open, editData, reset, defaultPoId]);

  const handle = async (data: FormData) => {
    setSubmitError('');
    const payload: Record<string, unknown> = { ...data };
    if (data.amount_krw === '' || data.amount_krw === undefined) delete payload.amount_krw;
    if (data.exchange_rate === '' || data.exchange_rate === undefined) delete payload.exchange_rate;
    if (!data.remit_date) delete payload.remit_date;
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editData ? 'TT 수정' : 'TT 등록'}</DialogTitle></DialogHeader>
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <form onSubmit={handleSubmit(handle)} className="space-y-3">
          <div className="space-y-1.5">
            <Label>PO *</Label>
            <Select value={watch('po_id') ?? ''} onValueChange={(v) => setValue('po_id', v ?? '')}><SelectTrigger className="w-full"><Txt text={(() => { const p = pos.find((x) => x.po_id === watch('po_id')); if (!p) return ''; const mw = (p.total_mw ?? 0).toFixed(1); const m = p.contract_date ? p.contract_date.slice(0, 7) : ''; return `${p.po_number || p.po_id.slice(0, 8)} | ${p.manufacturer_name ?? '—'} | ${mw}MW${m ? ` | ${m}` : ''}`; })()} /></SelectTrigger>
              <SelectContent>{pos.map((p) => { const mw = (p.total_mw ?? 0).toFixed(1); const m = p.contract_date ? p.contract_date.slice(0, 7) : ''; return <SelectItem key={p.po_id} value={p.po_id}>{`${p.po_number || p.po_id.slice(0, 8)} | ${p.manufacturer_name ?? '—'} | ${mw}MW${m ? ` | ${m}` : ''}`}</SelectItem>; })}</SelectContent>
            </Select>{errors.po_id && <p className="text-xs text-destructive">{errors.po_id.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>송금일</Label><DateInput value={watch('remit_date') ?? ''} onChange={(v) => setValue('remit_date', v, { shouldDirty: true })} /></div>
            <div className="space-y-1.5"><Label>금액(USD) *</Label><Input type="number" step="0.01" {...register('amount_usd')} />{errors.amount_usd && <p className="text-xs text-destructive">{errors.amount_usd.message}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>원화(KRW)</Label><Input type="number" {...register('amount_krw')} /></div>
            <div className="space-y-1.5"><Label>환율</Label><Input inputMode="decimal" placeholder="예: 1450.30" value={(watch('exchange_rate') as unknown as string) ?? ''} onChange={(e) => setValue('exchange_rate', e.target.value.replace(/[^0-9.]/g, '') as unknown as number, { shouldDirty: true })} /></div>
          </div>
          <div className="space-y-1.5"><Label>목적</Label><Input {...register('purpose')} placeholder="계약금1차" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>상태 *</Label>
              <Select value={watch('status') ?? ''} onValueChange={(v) => setValue('status', v ?? '')}><SelectTrigger className="w-full"><Txt text={{ planned: '예정', completed: '완료' }[watch('status') ?? ''] || ''} /></SelectTrigger>
                <SelectContent><SelectItem value="planned">예정</SelectItem><SelectItem value="completed">완료</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>은행</Label><Input {...register('bank_name')} /></div>
          </div>
          <div className="space-y-1.5"><Label>메모</Label><Textarea {...register('memo')} rows={2} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button><Button type="submit" disabled={isSubmitting}>{isSubmitting ? '저장 중...' : '저장'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
