// 발주(PO) 신규 등록 다이얼로그.
// 비유: 발주서 한 장 — 헤더(법인·제조사·계약) + 라인(품번·수량·단가)을 한 화면에서 받는다.
// 라인 추가/삭제로 N건을 한 PO에 묶는다. 등록 시 헤더 POST → 라인 POST × N 직렬 처리.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
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
import { CONTRACT_TYPES_ACTIVE } from '@/types/procurement';
import type { ContractType, PurchaseOrder, POLineItem } from '@/types/procurement';
import type { Manufacturer } from '@/types/masters';

interface ProductLite {
  product_id: string;
  product_code: string;
  product_name: string;
  spec_wp?: number;
  is_active?: boolean;
}

interface DraftLine {
  key: string;
  product_id: string;
  quantity: string;
  unit_price_usd_wp: string;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  memo: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (po: PurchaseOrder) => void;
}

function newLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    product_id: '',
    quantity: '',
    unit_price_usd_wp: '',
    item_type: 'main',
    payment_type: 'paid',
    memo: '',
  };
}

export default function POCreateDialog({ open, onClose, onCreated }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 헤더
  const [poNumber, setPoNumber] = useState('');
  const [manufacturerId, setManufacturerId] = useState('');
  const [contractType, setContractType] = useState<ContractType>('spot');
  const [contractDate, setContractDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [incoterms, setIncoterms] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [memo, setMemo] = useState('');

  const [lines, setLines] = useState<DraftLine[]>(() => [newLine()]);

  // 다이얼로그를 새로 열 때마다 초기 상태로.
  useEffect(() => {
    if (!open) return;
    setPoNumber('');
    setManufacturerId('');
    setContractType('spot');
    setContractDate(new Date().toISOString().slice(0, 10));
    setIncoterms('');
    setPaymentTerms('');
    setPeriodStart('');
    setPeriodEnd('');
    setMemo('');
    setLines([newLine()]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active)))
      .catch(() => setManufacturers([]));
    fetchWithAuth<ProductLite[]>('/api/v1/products')
      .then((list) => setProducts(list.filter((p) => p.is_active !== false)))
      .catch(() => setProducts([]));
  }, [open]);

  const productById = useMemo(() => {
    const map = new Map<string, ProductLite>();
    for (const p of products) map.set(p.product_id, p);
    return map;
  }, [products]);

  const totals = useMemo(() => {
    let qty = 0;
    let mw = 0;
    for (const l of lines) {
      const q = Number(l.quantity);
      if (!Number.isFinite(q) || q <= 0) continue;
      qty += q;
      const product = productById.get(l.product_id);
      if (product?.spec_wp) mw += (product.spec_wp * q) / 1_000_000;
    }
    return { qty, mw };
  }, [lines, productById]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)));
  }

  // 등록 전 검증 — 메시지로만 막고, 인라인 표시는 1차 범위 외.
  function validate(): string | null {
    if (!selectedCompanyId) return '좌측 상단에서 법인을 먼저 선택해주세요';
    if (!poNumber.trim()) return '발주번호를 입력해주세요';
    if (!manufacturerId) return '제조사를 선택해주세요';
    if (!contractDate) return '계약일을 입력해주세요';
    if (contractType === 'frame' && (!periodStart || !periodEnd)) {
      return '프레임 계약은 계약 시작/종료일이 필요합니다';
    }
    if (lines.length === 0) return '라인을 1개 이상 추가해주세요';
    for (const [i, l] of lines.entries()) {
      const n = i + 1;
      if (!l.product_id) return `${n}번 라인의 품번을 선택해주세요`;
      const q = Number(l.quantity);
      if (!Number.isFinite(q) || q <= 0) return `${n}번 라인의 수량은 0보다 커야 합니다`;
      const u = Number(l.unit_price_usd_wp);
      if (!Number.isFinite(u) || u <= 0) return `${n}번 라인의 USD/Wp 단가는 0보다 커야 합니다`;
    }
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { notify.error(err); return; }
    setSubmitting(true);
    try {
      const headerPayload = {
        po_number: poNumber.trim(),
        company_id: selectedCompanyId,
        manufacturer_id: manufacturerId,
        contract_type: contractType,
        contract_date: contractDate,
        incoterms: incoterms.trim() || undefined,
        payment_terms: paymentTerms.trim() || undefined,
        contract_period_start: contractType === 'frame' ? periodStart : undefined,
        contract_period_end: contractType === 'frame' ? periodEnd : undefined,
        memo: memo.trim() || undefined,
        status: 'draft' as const,
      };
      const created = await fetchWithAuth<PurchaseOrder>('/api/v1/pos', {
        method: 'POST',
        body: JSON.stringify(headerPayload),
      });

      const lineErrors: string[] = [];
      for (const l of lines) {
        try {
          // CreatePOLineRequest는 unit_price_usd(USD/panel)만 받음 — USD/Wp × spec_wp로 변환.
          const product = productById.get(l.product_id);
          const specWp = product?.spec_wp ?? 0;
          const wp = Number(l.unit_price_usd_wp);
          const qty = Number(l.quantity);
          const unitPriceUsd = specWp > 0 ? wp * specWp : 0;
          const totalAmountUsd = unitPriceUsd * qty;
          await fetchWithAuth<POLineItem>(`/api/v1/pos/${created.po_id}/lines`, {
            method: 'POST',
            body: JSON.stringify({
              product_id: l.product_id,
              quantity: qty,
              unit_price_usd: unitPriceUsd,
              total_amount_usd: totalAmountUsd,
              item_type: l.item_type,
              payment_type: l.payment_type,
              memo: l.memo.trim() || undefined,
            }),
          });
        } catch (e) {
          lineErrors.push(e instanceof Error ? e.message : '라인 등록 실패');
        }
      }

      if (lineErrors.length > 0) {
        notify.error(`PO는 등록됐지만 라인 ${lineErrors.length}개 실패: ${lineErrors[0]}`);
      } else {
        notify.success(`PO ${created.po_number ?? created.po_id.slice(0, 8)} 등록 완료`);
      }
      onCreated(created);
      onClose();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'PO 등록 실패');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>발주(PO) 신규 등록</DialogTitle>
          <p className="text-xs text-muted-foreground">
            헤더 정보를 한 번 입력하고 라인을 N개 추가하세요. 같은 PO 안에서 본품/스페어, 유상/무상을 라인별로 구분합니다.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <Field label="발주번호" required>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2026-001" />
            </Field>
            <Field label="제조사" required>
              <Select value={manufacturerId} onValueChange={(v) => setManufacturerId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="제조사 선택" /></SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="계약유형" required>
              <Select value={contractType} onValueChange={(v) => setContractType(v as ContractType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES_ACTIVE.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="계약일" required>
              <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
            </Field>
            <Field label="인코텀즈"><Input value={incoterms} onChange={(e) => setIncoterms(e.target.value)} placeholder="FOB / CIF" /></Field>
            <Field label="결제조건"><Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="L/C at sight 등" /></Field>
            {contractType === 'frame' && (
              <>
                <Field label="계약 시작일" required>
                  <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </Field>
                <Field label="계약 종료일" required>
                  <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </Field>
              </>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold">라인 ({lines.length}건 · 총 {totals.qty.toLocaleString()}매 · {totals.mw.toFixed(3)} MW)</div>
              <Button type="button" size="xs" variant="outline" onClick={() => setLines((prev) => [...prev, newLine()])}>
                <Plus className="mr-1 h-3 w-3" />라인 추가
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((line, idx) => (
                <div key={line.key} className="rounded-md border border-[var(--line)] p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">라인 {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      disabled={lines.length === 1}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-6 gap-2">
                    <div className="col-span-2">
                      <Field label="품번" required compact>
                        <Select value={line.product_id} onValueChange={(v) => updateLine(line.key, { product_id: v ?? '' })}>
                          <SelectTrigger><SelectValue placeholder="품번 선택" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.product_id} value={p.product_id}>
                                {p.product_code} · {p.spec_wp ? `${p.spec_wp}Wp` : '—'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                    <Field label="수량" required compact>
                      <Input
                        type="number"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        placeholder="0"
                      />
                    </Field>
                    <Field label="USD/Wp" required compact>
                      <Input
                        type="number"
                        step="0.001"
                        value={line.unit_price_usd_wp}
                        onChange={(e) => updateLine(line.key, { unit_price_usd_wp: e.target.value })}
                        placeholder="0.090"
                      />
                    </Field>
                    <Field label="구분" compact>
                      <Select value={line.item_type} onValueChange={(v) => updateLine(line.key, { item_type: v as 'main' | 'spare' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="main">본품</SelectItem>
                          <SelectItem value="spare">스페어</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="유무상" compact>
                      <Select value={line.payment_type} onValueChange={(v) => updateLine(line.key, { payment_type: v as 'paid' | 'free' })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paid">유상</SelectItem>
                          <SelectItem value="free">무상</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-2">
                    <Input
                      value={line.memo}
                      onChange={(e) => updateLine(line.key, { memo: e.target.value })}
                      placeholder="라인 메모 (선택)"
                      className="h-8 text-[12px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Field label="메모">
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="발주 메모" rows={2} />
          </Field>
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
  label, required, compact, children,
}: {
  label: string;
  required?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className={compact ? 'text-[11px]' : 'text-[12px]'}>
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}
