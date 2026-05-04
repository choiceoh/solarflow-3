// 신용장(LC) 신규 등록 다이얼로그.
// 비유: 은행 개설 신청서 — PO를 골라 그 PO에 묶이는 LC 헤더(은행·금액·유산스)를 받는다.
// 1차 범위: LC 라인 분할 인수는 별도. 헤더만 등록하고 PO에서 자동 USD 한도/잔액 계산.

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fetchWithAuth } from '@/lib/api';
import { notify } from '@/lib/notify';
import { useAppStore } from '@/stores/appStore';
import type { LCRecord, PurchaseOrder } from '@/types/procurement';
import type { Bank } from '@/types/masters';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (lc: LCRecord) => void;
}

export default function LCCreateDialog({ open, onClose, onCreated }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [lcNumber, setLcNumber] = useState('');
  const [poId, setPoId] = useState('');
  const [bankId, setBankId] = useState('');
  const [openDate, setOpenDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amountUsd, setAmountUsd] = useState('');
  const [targetQty, setTargetQty] = useState('');
  const [usanceDays, setUsanceDays] = useState('');
  const [usanceType, setUsanceType] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [memo, setMemo] = useState('');

  useEffect(() => {
    if (!open) return;
    setLcNumber('');
    setPoId('');
    setBankId('');
    setOpenDate(new Date().toISOString().slice(0, 10));
    setAmountUsd('');
    setTargetQty('');
    setUsanceDays('');
    setUsanceType('');
    setMaturityDate('');
    setMemo('');
  }, [open]);

  // 같은 법인의 활성 PO만 노출 — LC가 다른 법인 PO에 묶이는 건 차단.
  // status가 cancelled/completed인 PO는 LC 신규 개설 대상 아님.
  useEffect(() => {
    if (!open || !selectedCompanyId) return;
    fetchWithAuth<PurchaseOrder[]>(`/api/v1/pos?company_id=${selectedCompanyId}`)
      .then((list) => setPos(list.filter((p) => p.status !== 'cancelled' && p.status !== 'completed')))
      .catch(() => setPos([]));
    fetchWithAuth<Bank[]>(`/api/v1/banks?company_id=${selectedCompanyId}`)
      .then((list) => setBanks(list.filter((b) => b.is_active)))
      .catch(() => setBanks([]));
  }, [open, selectedCompanyId]);

  // 유산스 일수가 바뀌면 만기일 자동 계산 — 사용자가 만기를 직접 입력하면 그쪽이 우선.
  // 1차는 단순화: 자동 채움만 제공하고 수동 수정 가능.
  const computedMaturity = useMemo(() => {
    if (!openDate) return '';
    const d = Number(usanceDays);
    if (!Number.isFinite(d) || d <= 0) return '';
    const base = new Date(openDate);
    if (Number.isNaN(base.getTime())) return '';
    base.setDate(base.getDate() + d);
    return base.toISOString().slice(0, 10);
  }, [openDate, usanceDays]);

  function applyComputedMaturity() {
    if (computedMaturity) setMaturityDate(computedMaturity);
  }

  function validate(): string | null {
    if (!selectedCompanyId) return '좌측 상단에서 법인을 먼저 선택해주세요';
    if (!poId) return '발주(PO)를 선택해주세요';
    if (!bankId) return '은행을 선택해주세요';
    const amt = Number(amountUsd);
    if (!Number.isFinite(amt) || amt <= 0) return 'L/C 금액(USD)은 0보다 커야 합니다';
    if (targetQty.trim() !== '') {
      const q = Number(targetQty);
      if (!Number.isFinite(q) || q <= 0) return '대상 수량은 0보다 커야 합니다';
    }
    if (usanceDays.trim() !== '') {
      const d = Number(usanceDays);
      if (!Number.isFinite(d) || d < 0) return '유산스(일)는 0 이상이어야 합니다';
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { notify.error(err); return; }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        po_id: poId,
        bank_id: bankId,
        company_id: selectedCompanyId,
        amount_usd: Number(amountUsd),
        status: 'pending' as const,
      };
      if (lcNumber.trim()) payload.lc_number = lcNumber.trim();
      if (openDate) payload.open_date = openDate;
      if (targetQty.trim()) payload.target_qty = Number(targetQty);
      if (usanceDays.trim()) payload.usance_days = Number(usanceDays);
      if (usanceType.trim()) payload.usance_type = usanceType.trim();
      if (maturityDate) payload.maturity_date = maturityDate;
      if (memo.trim()) payload.memo = memo.trim();

      const created = await fetchWithAuth<LCRecord>('/api/v1/lcs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      notify.success(`L/C ${created.lc_number ?? created.lc_id.slice(0, 8)} 등록 완료`);
      onCreated(created);
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'LC 등록 실패');
    } finally {
      setSubmitting(false);
    }
  }

  const poLabel = (p: PurchaseOrder) =>
    `${p.po_number ?? p.po_id.slice(0, 8)} · ${p.manufacturer_name ?? '—'}${p.contract_date ? ` · ${p.contract_date}` : ''}`;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>신용장(L/C) 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            발주(PO)를 선택하면 해당 PO 한도와 통화로 L/C가 묶입니다. 라인 분할 인수는 등록 후 PO 상세에서 처리합니다.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="L/C No.">
            <Input value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} placeholder="비워두면 임시 번호" />
          </Field>
          <Field label="발주(PO)" required>
            <Select value={poId} onValueChange={(v) => setPoId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="PO 선택" /></SelectTrigger>
              <SelectContent>
                {pos.length === 0 && (
                  <div className="px-2 py-1.5 text-[12px] text-muted-foreground">선택 가능한 PO가 없습니다</div>
                )}
                {pos.map((p) => (
                  <SelectItem key={p.po_id} value={p.po_id}>{poLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="은행" required>
            <Select value={bankId} onValueChange={(v) => setBankId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="은행 선택" /></SelectTrigger>
              <SelectContent>
                {banks.length === 0 && (
                  <div className="px-2 py-1.5 text-[12px] text-muted-foreground">등록된 은행이 없습니다</div>
                )}
                {banks.map((b) => (
                  <SelectItem key={b.bank_id} value={b.bank_id}>{b.bank_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="개설일">
            <Input type="date" value={openDate} onChange={(e) => setOpenDate(e.target.value)} />
          </Field>
          <Field label="L/C 금액 (USD)" required>
            <Input type="number" step="0.01" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} placeholder="0" />
          </Field>
          <Field label="대상 수량 (매)">
            <Input type="number" value={targetQty} onChange={(e) => setTargetQty(e.target.value)} placeholder="0" />
          </Field>
          <Field label="유산스 (일)">
            <Input type="number" value={usanceDays} onChange={(e) => setUsanceDays(e.target.value)} placeholder="0 = AT SIGHT" />
          </Field>
          <Field label="유산스 유형">
            <Select value={usanceType} onValueChange={(v) => setUsanceType(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="유산스 유형 선택" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buyers">BANKER&apos;S USANCE (buyers)</SelectItem>
                <SelectItem value="shippers">SHIPPER&apos;S USANCE (shippers)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="col-span-2">
            <Field label="만기일">
              <div className="flex items-center gap-2">
                <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
                {computedMaturity && computedMaturity !== maturityDate && (
                  <Button type="button" size="xs" variant="outline" onClick={applyComputedMaturity}>
                    유산스로 자동 계산: {computedMaturity}
                  </Button>
                )}
              </div>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="메모">
              <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="LC 메모" />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>취소</Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {submitting ? '등록 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, required, children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[12px]">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
