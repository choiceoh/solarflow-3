import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { PurchaseOrder } from '@/types/procurement';
import type { Manufacturer, Product } from '@/types/masters';

/* ── 상수 ── */
const CONTRACT_TYPES: Record<string, string> = {
  spot: '스팟',
  annual_frame: '연간프레임',
  half_year_frame: '6개월프레임',
};
const PO_STATUSES: Record<string, string> = {
  draft: '초안',
  contracted: '계약완료',
  shipping: '선적중',
  completed: '완료',
};
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'DAP', 'DDP', 'CIP'];
const BALANCE_DAYS = ['30', '45', '60', '90', '120', '180'] as const;
type BalanceDay = typeof BALANCE_DAYS[number];

/* ── 결제조건 (해외직수입과 동일 패턴) ── */
interface PaymentTerms {
  hasDeposit: boolean;
  depositMethod: 'tt' | 'lc';
  depositPercent: string;
  depositSplits: string[];
  balanceDays: BalanceDay;
}
const defaultPT = (): PaymentTerms => ({
  hasDeposit: false, depositMethod: 'tt', depositPercent: '', depositSplits: [], balanceDays: '90',
});
function composePT(pt: PaymentTerms, totalUSD: number): string {
  const bal = `잔금 L/C ${pt.balanceDays}days`;
  if (pt.hasDeposit && pt.depositPercent) {
    const m = pt.depositMethod === 'tt' ? 'T/T' : 'L/C';
    const amt = totalUSD ? Math.round(totalUSD * (parseFloat(pt.depositPercent) / 100)) : 0;
    const splitStr = pt.depositSplits.filter(Boolean).length
      ? ` (분할 ${pt.depositSplits.filter(Boolean).length}회)` : '';
    return `계약금 ${pt.depositPercent}% ${m} ${amt.toLocaleString('en-US')}${splitStr}, ${bal}`;
  }
  return bal;
}
function parsePT(text: string): PaymentTerms {
  if (!text) return defaultPT();
  const dep = text.match(/계약금\s*([\d.]+)%?\s*(T\/T|L\/C)/i);
  const bal = text.match(/L\/C\s*(\d+)\s*days?/i);
  const days = bal?.[1] ?? '90';
  return {
    hasDeposit: !!dep,
    depositMethod: dep?.[2]?.toUpperCase() === 'L/C' ? 'lc' : 'tt',
    depositPercent: dep?.[1] ?? '',
    depositSplits: [],
    balanceDays: (BALANCE_DAYS.includes(days as BalanceDay) ? days : '90') as BalanceDay,
  };
}

/* ── 발주품목 라인 ── */
interface POLine {
  product_id: string;
  quantity: string;
  unit_price_usd_wp: string; // $/Wp 입력 → 저장 시 quantity*spec_wp*price = unit_price_usd
}
const emptyLine = (): POLine => ({ product_id: '', quantity: '', unit_price_usd_wp: '' });

/* ── 헬퍼 ── */
function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">{text || placeholder}</span>;
}
function Req({ children }: { children: React.ReactNode }) {
  return <Label className="text-blue-600 font-medium">{children} *</Label>;
}
function Opt({ children }: { children: React.ReactNode }) {
  return <Label>{children}</Label>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: PurchaseOrder | null;
}

export default function POForm({ open, onOpenChange, onSubmit, editData }: Props) {
  const selectedCompanyId = useAppStore((s) => s.selectedCompanyId);

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 헤더 필드
  const [poNumber, setPoNumber] = useState('');
  const [mfgId, setMfgId] = useState('');
  const [contractType, setContractType] = useState('');
  const [isExclusive, setIsExclusive] = useState(false);
  const [contractDate, setContractDate] = useState('');
  const [incoterms, setIncoterms] = useState('');
  const [bafCaf, setBafCaf] = useState(false);
  const [status, setStatus] = useState('draft');
  const [memo, setMemo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(defaultPT());

  // 발주품목
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);

  /* 마스터 로드 */
  useEffect(() => {
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
  }, []);

  /* 제조사 → 품번 */
  useEffect(() => {
    if (!mfgId) { setProducts([]); return; }
    fetchWithAuth<Product[]>(`/api/v1/products?manufacturer_id=${mfgId}`)
      .then((list) => setProducts(list.filter((p) => p.is_active))).catch(() => setProducts([]));
  }, [mfgId]);

  /* 폼 초기화 */
  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    if (editData) {
      setPoNumber(editData.po_number ?? '');
      setMfgId(editData.manufacturer_id);
      setContractType(editData.contract_type);
      setIsExclusive(editData.contract_type === 'exclusive' || /^\[독점\]/.test(editData.memo ?? ''));
      setContractDate(editData.contract_date?.slice(0, 10) ?? '');
      setIncoterms((editData.incoterms ?? '').replace(/\s*\(BAF\/CAF 포함\)\s*/i, ''));
      setBafCaf(/BAF\s*\/\s*CAF/i.test(editData.incoterms ?? ''));
      setStatus(editData.status);
      setMemo((editData.memo ?? '').replace(/^\[독점\]\s*/, ''));
      setPaymentTerms(parsePT(editData.payment_terms ?? ''));
      setLines([emptyLine()]); // 수정 모드는 라인 별도 관리
    } else {
      setPoNumber(''); setMfgId(''); setContractType(''); setIsExclusive(false);
      setContractDate(''); setIncoterms(''); setBafCaf(false);
      setStatus('draft'); setMemo(''); setPaymentTerms(defaultPT());
      setLines([emptyLine()]);
    }
  }, [open, editData]);

  /* 라인 조작 */
  const updateLine = (i: number, f: keyof POLine, v: string) =>
    setLines((prev) => prev.map((l, j) => j === i ? { ...l, [f]: v } : l));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, j) => j !== i));

  /* 라인별 계산 */
  const lineCalc = useCallback((l: POLine) => {
    const p = products.find((x) => x.product_id === l.product_id);
    const qty = parseInt(l.quantity || '0');
    const ppw = parseFloat(l.unit_price_usd_wp || '0');
    if (!p || !qty || !ppw) return { mw: 0, total: 0 };
    return {
      mw: (qty * p.spec_wp) / 1_000_000,
      total: qty * p.spec_wp * ppw,
    };
  }, [products]);

  /* 합계 */
  const totals = lines.reduce(
    (acc, l) => {
      const c = lineCalc(l);
      return {
        qty: acc.qty + (parseInt(l.quantity || '0') || 0),
        mw: acc.mw + c.mw,
        total: acc.total + c.total,
      };
    },
    { qty: 0, mw: 0, total: 0 },
  );

  /* 제출 */
  const handleSubmit = async () => {
    setSubmitError('');
    if (!selectedCompanyId || selectedCompanyId === 'all') {
      setSubmitError('단일 법인을 선택해주세요 (좌측 상단)'); return;
    }
    if (!poNumber.trim()) { setSubmitError('PO번호는 필수입니다'); return; }
    if (!mfgId) { setSubmitError('제조사는 필수입니다'); return; }
    if (!contractType) { setSubmitError('계약유형은 필수입니다'); return; }
    if (!contractDate) { setSubmitError('계약일은 필수입니다'); return; }
    if (!incoterms) { setSubmitError('선적조건은 필수입니다'); return; }
    if (!editData) {
      const validLines = lines.filter((l) => l.product_id && parseInt(l.quantity || '0') > 0);
      if (validLines.length === 0) { setSubmitError('발주품목을 최소 1행 입력해주세요'); return; }
    }

    const incotermsFinal = bafCaf && !/BAF\s*\/\s*CAF/i.test(incoterms)
      ? `${incoterms} (BAF/CAF 포함)` : incoterms;

    const validLines = lines.filter((l) => l.product_id && parseInt(l.quantity || '0') > 0);
    const linesPayload = validLines.map((l) => {
      const p = products.find((x) => x.product_id === l.product_id);
      const qty = parseInt(l.quantity);
      const ppw = parseFloat(l.unit_price_usd_wp || '0');
      const totalUSD = p && ppw ? qty * p.spec_wp * ppw : undefined;
      return {
        product_id: l.product_id,
        quantity: qty,
        unit_price_usd: totalUSD,
      };
    });

    const payload: Record<string, unknown> = {
      po_id: editData?.po_id,
      po_number: poNumber.trim(),
      company_id: selectedCompanyId,
      manufacturer_id: mfgId,
      contract_type: contractType,
      contract_date: contractDate,
      incoterms: incotermsFinal,
      payment_terms: composePT(paymentTerms, totals.total),
      total_qty: totals.qty || undefined,
      total_mw: totals.mw || undefined,
      status,
      // 독점 플래그는 별도 DB 컬럼이 없어 메모 접두사로 보존
      memo: ((isExclusive ? '[독점] ' : '') + (memo || '')).trim() || undefined,
      lines: editData ? undefined : linesPayload,
    };
    Object.keys(payload).forEach((k) => { if (payload[k] === undefined) delete payload[k]; });

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    } finally {
      setIsSubmitting(false);
    }
  };

  const mfgName = manufacturers.find((m) => m.manufacturer_id === mfgId)?.name_kr ?? '';
  const productLabel = (pid: string) => {
    const p = products.find((x) => x.product_id === pid);
    return p ? `${p.product_code} | ${p.product_name} | ${p.spec_wp}Wp` : '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[82vw] sm:max-w-[82vw] max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="pb-1">
          <DialogTitle>{editData ? 'PO 수정' : 'PO 등록'}</DialogTitle>
        </DialogHeader>

        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') e.preventDefault(); }}
          className="space-y-3">

          {/* 헤더 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Req>PO번호</Req>
              <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="PO-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Req>제조사</Req>
              <Select value={mfgId} onValueChange={(v) => setMfgId(v ?? '')}>
                <SelectTrigger className="w-full"><Txt text={mfgName} placeholder="제조사 선택" /></SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Req>계약유형</Req>
              <Select value={contractType} onValueChange={(v) => setContractType(v ?? '')}>
                <SelectTrigger className="w-full"><Txt text={CONTRACT_TYPES[contractType] ?? ''} placeholder="계약유형" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <input type="checkbox" checked={isExclusive} onChange={(e) => setIsExclusive(e.target.checked)} />
                독점 계약
              </label>
            </div>
            <div className="space-y-1.5">
              <Req>계약일</Req>
              <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Req>선적조건</Req>
              <Input value={incoterms} onChange={(e) => setIncoterms(e.target.value)}
                list="po-incoterms" placeholder="FOB, CIF 등" />
              <datalist id="po-incoterms">{INCOTERMS.map((t) => <option key={t} value={t} />)}</datalist>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <input type="checkbox" checked={bafCaf} onChange={(e) => setBafCaf(e.target.checked)} />
                BAF/CAF 포함
              </label>
            </div>
            <div className="space-y-1.5">
              <Opt>상태</Opt>
              <Select value={status} onValueChange={(v) => setStatus(v ?? 'draft')}>
                <SelectTrigger className="w-full"><Txt text={PO_STATUSES[status] ?? ''} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PO_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 발주품목 */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-semibold">발주품목 *</Label>
              <div className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={!mfgId}>
                <Plus className="mr-1 h-3.5 w-3.5" />품목 추가
              </Button>
            </div>
            {!mfgId && <p className="text-xs text-muted-foreground">제조사를 먼저 선택하세요</p>}
            {mfgId && (
              <div className="space-y-2">
                {lines.map((line, idx) => {
                  const c = lineCalc(line);
                  return (
                    <div key={idx} className="rounded-md border p-2 flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <span className="text-[10px] text-blue-600 font-medium">품번 *</span>
                        <Select value={line.product_id} onValueChange={(v) => updateLine(idx, 'product_id', v ?? '')}>
                          <SelectTrigger className="w-full h-9 text-xs">
                            <Txt text={productLabel(line.product_id)} placeholder="품번 선택" />
                          </SelectTrigger>
                          <SelectContent className="min-w-[min(500px,calc(100vw-3rem))]">
                            {products.map((p) => (
                              <SelectItem key={p.product_id} value={p.product_id}>
                                {p.product_code} | {p.product_name} | {p.spec_wp}Wp
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-28 space-y-1">
                        <span className="text-[10px] text-blue-600 font-medium">수량(EA) *</span>
                        <Input className="h-9 text-xs" inputMode="numeric" value={line.quantity} placeholder="0"
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))} />
                      </div>
                      <div className="w-32 space-y-1">
                        <span className="text-[10px] text-blue-600 font-medium">단가($/Wp) *</span>
                        <Input className="h-9 text-xs" inputMode="decimal" value={line.unit_price_usd_wp} placeholder="0.1230"
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) updateLine(idx, 'unit_price_usd_wp', v);
                          }} />
                      </div>
                      <div className="w-32 space-y-1">
                        <span className="text-[10px] text-muted-foreground font-medium">총액(USD)</span>
                        <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                          {c.total ? `$${c.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '-'}
                        </div>
                      </div>
                      <div className="w-24 space-y-1">
                        <span className="text-[10px] text-muted-foreground font-medium">용량(MW)</span>
                        <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2">
                          {c.mw ? c.mw.toFixed(2) : '-'}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                        onClick={() => removeLine(idx)} disabled={lines.length <= 1}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}
                {/* 합계 */}
                <div className="rounded-md border-2 border-primary/20 bg-primary/5 px-3 py-2 flex flex-wrap items-center gap-4">
                  <span className="text-sm font-semibold">합계</span>
                  <span className="text-sm">총 수량 <span className="font-mono font-semibold">{totals.qty.toLocaleString('ko-KR')}EA</span></span>
                  <span className="text-sm">총 용량 <span className="font-mono font-semibold">{totals.mw.toFixed(2)}MW</span></span>
                  <span className="text-sm">총 금액 <span className="font-mono font-semibold">${totals.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></span>
                </div>
              </div>
            )}
          </div>

          {/* 결제조건 (총금액 기준) */}
          <div className="space-y-2">
            <Req>결제조건</Req>
            <div className="rounded-md border p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-muted-foreground">계약금</span>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={paymentTerms.hasDeposit} onChange={() => setPaymentTerms(p => ({ ...p, hasDeposit: true }))} />있음
                </label>
                <label className="flex items-center gap-1">
                  <input type="radio" checked={!paymentTerms.hasDeposit} onChange={() => setPaymentTerms(p => ({ ...p, hasDeposit: false }))} />없음
                </label>
                {paymentTerms.hasDeposit && (
                  <>
                    <select className="h-8 rounded border px-2 text-sm" value={paymentTerms.depositMethod}
                      onChange={(e) => setPaymentTerms(p => ({ ...p, depositMethod: e.target.value as 'tt' | 'lc' }))}>
                      <option value="tt">T/T</option><option value="lc">L/C</option>
                    </select>
                    <div className="flex items-center gap-1">
                      <Input className="w-16 h-8 text-sm" inputMode="decimal" value={paymentTerms.depositPercent}
                        placeholder="%"
                        onChange={(e) => setPaymentTerms(p => ({ ...p, depositPercent: e.target.value.replace(/[^0-9.]/g, '') }))} />
                      <span>%</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      = ${(totals.total * (parseFloat(paymentTerms.depositPercent || '0') / 100)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </span>
                    <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]"
                      disabled={paymentTerms.depositSplits.length >= 5}
                      onClick={() => setPaymentTerms(p => p.depositSplits.length >= 5 ? p : ({ ...p, depositSplits: [...p.depositSplits, ''] }))}>
                      분할 추가 ({paymentTerms.depositSplits.length}/5)
                    </Button>
                  </>
                )}
              </div>
              {paymentTerms.hasDeposit && paymentTerms.depositSplits.length > 0 && (
                <div className="pl-4 space-y-1">
                  {paymentTerms.depositSplits.map((amt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16">분할 {i + 1}</span>
                      <span className="text-xs text-muted-foreground">$</span>
                      <Input className="w-40 h-8 text-sm" inputMode="decimal" value={amt} placeholder="금액"
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          setPaymentTerms(p => ({ ...p, depositSplits: p.depositSplits.map((x, j) => j === i ? v : x) }));
                        }} />
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => setPaymentTerms(p => ({ ...p, depositSplits: p.depositSplits.filter((_, j) => j !== i) }))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1 border-t">
                <span className="text-muted-foreground">잔금 L/C</span>
                <select className="h-8 rounded border px-2 text-sm" value={paymentTerms.balanceDays}
                  onChange={(e) => setPaymentTerms(p => ({ ...p, balanceDays: e.target.value as BalanceDay }))}>
                  {BALANCE_DAYS.map((d) => <option key={d} value={d}>{d}일</option>)}
                </select>
                <span className="text-xs text-muted-foreground">
                  잔금 = ${Math.max(0, totals.total - (paymentTerms.hasDeposit ? totals.total * (parseFloat(paymentTerms.depositPercent || '0') / 100) : 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{composePT(paymentTerms, totals.total)}</span>
              </div>
            </div>
          </div>

          {/* 메모 */}
          <div className="max-w-lg space-y-1.5">
            <Opt>메모</Opt>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
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
