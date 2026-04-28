import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { Bank } from '@/types/masters';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export default function LimitChangeForm({ open, onOpenChange, onSubmit }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [bankId, setBankId] = useState('');
  const [changeDate, setChangeDate] = useState('');
  const [previousLimit, setPreviousLimit] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`)
        .then((list) => setBanks(list.filter((b) => b.is_active))).catch(() => {});
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 다이얼로그 open 시 폼 초기화 (open prop 동기화)
      setBankId(''); setChangeDate(''); setPreviousLimit('');
      setNewLimit(''); setReason(''); setSubmitError('');
    }
  }, [open]);

  const handleSubmit = async () => {
    setLoading(true);
    setSubmitError('');
    try {
      const payload: Record<string, unknown> = {
        bank_id: bankId,
        change_date: changeDate,
        previous_limit: parseFloat(previousLimit),
        new_limit: parseFloat(newLimit),
      };
      if (reason) payload.reason = reason;
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
    setLoading(false);
  };

  const canSubmit = bankId && changeDate && previousLimit && newLimit && previousLimit !== newLimit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>한도 변경 등록</DialogTitle>
        </DialogHeader>
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <div className="grid gap-3 py-2">
          <div>
            <Label>은행 *</Label>
            <Select value={bankId} onValueChange={(v) => setBankId(v ?? '')}>
              <SelectTrigger><Txt text={banks.find(b => b.bank_id === bankId)?.bank_name ?? ''} placeholder="은행 선택" /></SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.bank_id} value={b.bank_id}>{b.bank_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>변경일 *</Label>
            <DateInput value={changeDate} onChange={setChangeDate} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>이전한도 (USD) *</Label>
              <Input type="number" value={previousLimit} onChange={(e) => setPreviousLimit(e.target.value)} min={0} step="0.01" />
            </div>
            <div>
              <Label>변경한도 (USD) *</Label>
              <Input type="number" value={newLimit} onChange={(e) => setNewLimit(e.target.value)} min={0} step="0.01" />
            </div>
          </div>
          <div>
            <Label>사유</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>취소</Button>
          <Button onClick={handleSubmit} disabled={loading || !canSubmit}>
            {loading ? '처리 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
