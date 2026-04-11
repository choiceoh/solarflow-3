import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatUSD } from '@/lib/utils';
import type { PurchaseOrder } from '@/types/procurement';

interface DepositInfo {
  hasDeposit: boolean;
  depositPercent: number;
  depositAmountUsd: number;
  plannedSplits: number;
}

interface Props {
  open: boolean;
  po: PurchaseOrder;
  depositInfo: DepositInfo;
  paidUsd: number;          // 이미 지급된 금액
  nextInstallment: number;  // 다음 차수 (1, 2, 3…)
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

function FT({ text }: { text: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || '선택'}</span>;
}

export default function DepositPaymentForm({ open, po, depositInfo, paidUsd, nextInstallment, onOpenChange, onSubmit }: Props) {
  const remainingUsd = Math.max(0, depositInfo.depositAmountUsd - paidUsd);

  const [remitDate, setRemitDate] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [amountKrw, setAmountKrw] = useState('');
  const [bankName, setBankName] = useState('');
  const [status, setStatus] = useState<'completed' | 'planned'>('completed');
  const [memo, setMemo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // 폼 초기화
  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().slice(0, 10);
      setRemitDate(today);
      setAmountUsd(remainingUsd > 0 ? remainingUsd.toFixed(2) : '');
      setExchangeRate('');
      setAmountKrw('');
      setBankName('');
      setStatus('completed');
      setMemo('');
      setSubmitError('');
    }
  }, [open, remainingUsd]);

  // 환율 변경 시 원화 자동 계산
  useEffect(() => {
    const usd = parseFloat(amountUsd);
    const rate = parseFloat(exchangeRate);
    if (usd > 0 && rate > 0) {
      setAmountKrw(Math.round(usd * rate).toString());
    }
  }, [amountUsd, exchangeRate]);

  const purposeText = `계약금 ${nextInstallment}차`;

  const handleSubmit = async () => {
    const usd = parseFloat(amountUsd);
    if (!usd || usd <= 0) { setSubmitError('지급액(USD)을 입력해주세요'); return; }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const payload: Record<string, unknown> = {
        po_id: po.po_id,
        remit_date: remitDate || undefined,
        amount_usd: usd,
        purpose: purposeText,
        status,
        bank_name: bankName || undefined,
        memo: memo || undefined,
      };
      if (exchangeRate && parseFloat(exchangeRate) > 0) payload.exchange_rate = parseFloat(exchangeRate);
      if (amountKrw && parseFloat(amountKrw) > 0) payload.amount_krw = parseFloat(amountKrw);
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>계약금 {nextInstallment}차 지급 등록</DialogTitle>
        </DialogHeader>

        {/* PO 요약 정보 */}
        <div className="rounded-md bg-muted/40 px-4 py-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">PO번호</span>
            <span className="font-medium">{po.po_number ?? po.po_id.slice(0, 8)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">제조사</span>
            <span>{po.manufacturer_name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">계약금 ({depositInfo.depositPercent}%)</span>
            <span className="font-mono">{formatUSD(depositInfo.depositAmountUsd)}</span>
          </div>
          <div className="flex justify-between border-t pt-1">
            <span className="text-muted-foreground">기지급 ({nextInstallment - 1}차까지)</span>
            <span className="font-mono text-orange-600">{formatUSD(paidUsd)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>잔여 계약금</span>
            <span className={`font-mono ${remainingUsd > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatUSD(remainingUsd)}
            </span>
          </div>
        </div>

        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <div className="space-y-3">
          {/* 지급 목적 (자동) */}
          <div className="space-y-1.5">
            <Label>지급 목적</Label>
            <Input value={purposeText} disabled className="bg-muted/40 text-muted-foreground" />
          </div>

          {/* 지급일 + 상태 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>지급일</Label>
              <DateInput value={remitDate} onChange={setRemitDate} />
            </div>
            <div className="space-y-1.5">
              <Label>상태 *</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as 'completed' | 'planned')}>
                <SelectTrigger className="w-full"><FT text={status === 'completed' ? '완료' : '예정'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="planned">예정</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 지급액 USD + 환율 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>지급액 (USD) *</Label>
              <Input
                type="number"
                step="0.01"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder={remainingUsd.toFixed(2)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>환율 (USD→KRW)</Label>
              <Input
                inputMode="decimal"
                placeholder="예: 1450.30"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </div>
          </div>

          {/* 원화 + 은행 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>원화 (KRW)</Label>
              <Input
                type="number"
                value={amountKrw}
                onChange={(e) => setAmountKrw(e.target.value)}
                placeholder="환율 입력 시 자동계산"
              />
            </div>
            <div className="space-y-1.5">
              <Label>송금 은행</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="예: 하나은행" />
            </div>
          </div>

          {/* 메모 */}
          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>취소</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? '저장 중...' : `${nextInstallment}차 지급 등록`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
