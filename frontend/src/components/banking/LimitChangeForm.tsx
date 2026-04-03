import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { Bank } from '@/types/masters';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export default function LimitChangeForm({ open, onOpenChange, onSubmit }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(false);

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
      setBankId(''); setChangeDate(''); setPreviousLimit('');
      setNewLimit(''); setReason('');
    }
  }, [open]);

  const handleSubmit = async () => {
    setLoading(true);
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
    } catch { /* 상위에서 처리 */ }
    setLoading(false);
  };

  const canSubmit = bankId && changeDate && previousLimit && newLimit && previousLimit !== newLimit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>한도 변경 등록</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>은행 *</Label>
            <Select value={bankId} onValueChange={(v) => setBankId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="은행 선택" /></SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.bank_id} value={b.bank_id}>{b.bank_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>변경일 *</Label>
            <Input type="date" value={changeDate} onChange={(e) => setChangeDate(e.target.value)} />
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
