import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { EXPENSE_TYPE_LABEL, type ExpenseType, type Expense } from '@/types/customs';
import type { BLShipment } from '@/types/inbound';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: Expense | null;
}

export default function ExpenseForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [bls, setBls] = useState<BLShipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [blId, setBlId] = useState('');
  const [month, setMonth] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType | ''>('');
  const [amount, setAmount] = useState('');
  const [vat, setVat] = useState('');
  const [vendor, setVendor] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (selectedCompanyId) {
      fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selectedCompanyId}`)
        .then(setBls).catch(() => {});
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 편집 모드 폼 prefill (open/editData 동기화)
    if (open) setSubmitError('');
    if (editData) {
      setBlId(editData.bl_id || '');
      setMonth(editData.month || '');
      setExpenseType((editData.expense_type as ExpenseType) || '');
      setAmount(String(editData.amount));
      setVat(editData.vat != null ? String(editData.vat) : '');
      setVendor(editData.vendor || '');
      setMemo(editData.memo || '');
    } else {
      setBlId(''); setMonth(''); setExpenseType('');
      setAmount(''); setVat(''); setVendor(''); setMemo('');
    }
  }, [editData, open]);

  // total 자동계산
  const amtNum = parseFloat(amount) || 0;
  const vatNum = parseFloat(vat) || 0;
  const total = amtNum + vatNum;

  const hasRef = blId || month;

  // 월 목록 (최근 12개월)
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const handleSubmit = async () => {
    setLoading(true);
    setSubmitError('');
    try {
      const payload: Record<string, unknown> = {
        company_id: selectedCompanyId,
        expense_type: expenseType,
        amount: amtNum,
        total,
      };
      if (blId) payload.bl_id = blId;
      if (month) payload.month = month;
      if (vat) payload.vat = vatNum;
      if (vendor) payload.vendor = vendor;
      if (memo) payload.memo = memo;
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? '부대비용 수정' : '부대비용 등록'}</DialogTitle>
        </DialogHeader>
        {submitError && <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">{submitError}</div>}
        <div className="grid gap-3 py-2">
          <Alert>
            <AlertDescription className="text-xs">B/L 또는 월 중 하나는 필수입니다</AlertDescription>
          </Alert>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>B/L</Label>
              <Select value={blId || 'none'} onValueChange={(v) => setBlId(v === 'none' ? '' : (v ?? ''))}>
                <SelectTrigger><Txt text={bls.find(b => b.bl_id === blId)?.bl_number ?? ''} placeholder="B/L 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {bls.map((bl) => (
                    <SelectItem key={bl.bl_id} value={bl.bl_id}>{bl.bl_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>월 (YYYY-MM)</Label>
              <Select value={month || 'none'} onValueChange={(v) => setMonth(v === 'none' ? '' : (v ?? ''))}>
                <SelectTrigger><Txt text={month} placeholder="월 선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {months.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>비용유형 *</Label>
            <Select value={expenseType || 'none'} onValueChange={(v) => setExpenseType(v === 'none' ? '' : v as ExpenseType)}>
              <SelectTrigger><Txt text={expenseType ? (EXPENSE_TYPE_LABEL[expenseType as ExpenseType] ?? '') : ''} placeholder="비용유형 선택" /></SelectTrigger>
              <SelectContent>
                {(Object.entries(EXPENSE_TYPE_LABEL) as [ExpenseType, string][]).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>금액 *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
            </div>
            <div>
              <Label>VAT</Label>
              <Input type="number" value={vat} onChange={(e) => setVat(e.target.value)} min={0} />
            </div>
            <div>
              <Label>합계 (자동)</Label>
              <Input value={total ? `${total.toLocaleString('ko-KR')}원` : ''} readOnly className="bg-muted" />
            </div>
          </div>
          <div>
            <Label>거래처</Label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="거래처명" />
          </div>
          <div>
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>취소</Button>
          <Button onClick={handleSubmit} disabled={loading || !expenseType || !amount || !hasRef}>
            {loading ? '처리 중...' : editData ? '수정' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
