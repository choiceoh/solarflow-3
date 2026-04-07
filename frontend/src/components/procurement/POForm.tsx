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
import type { Company, Manufacturer, Product } from '@/types/masters';

/* ── 상수 ── */
const CONTRACT_TYPES: Record<string, string> = {
  spot: '스팟',
  frame: '프레임',
};
// 레거시 표시 (읽기 전용)
const LEGACY_CT: Record<string, string> = {
  annual_frame: '연간프레임 (레거시)',
  half_year_frame: '6개월프레임 (레거시)',
  general: '일반 (레거시)',
  exclusive: '독점 (레거시)',
  annual: '연간 (레거시)',
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
  inputMode: 'qty' | 'mw';   // 수량/용량 입력 모드 토글
  quantity: string;          // EA
  capacityMw: string;        // MW (수량의 미러 또는 직접 입력)
  unit_price_usd_wp: string; // $/Wp (cents 모드일 땐 ¢/Wp 값)
  priceMode: 'dollar' | 'cents'; // 단가 단위 토글
}
const emptyLine = (): POLine => ({
  product_id: '', inputMode: 'qty', quantity: '', capacityMw: '',
  unit_price_usd_wp: '', priceMode: 'cents',
});

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
  const globalCompanyId = useAppStore((s) => s.selectedCompanyId);
  const storeCompanies = useAppStore((s) => s.companies);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 헤더 필드
  const [poNumber, setPoNumber] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [mfgId, setMfgId] = useState('');
  const [contractType, setContractType] = useState('');
  const [isExclusive, setIsExclusive] = useState(false);
  const [contractDate, setContractDate] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [incoterms, setIncoterms] = useState('');
  const [bafCaf, setBafCaf] = useState(false);
  const [exchangeRate, setExchangeRate] = useState('');
  const [status, setStatus] = useState('draft');
  const [memo, setMemo] = useState('');
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerms>(defaultPT());

  // 발주품목
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);

  /* 마스터 로드 */
  useEffect(() => {
    if (storeCompanies.length) setCompanies(storeCompanies);
    else fetchWithAuth<Company[]>('/api/v1/companies')
      .then((list) => setCompanies(list.filter((c) => c.is_active))).catch(() => {});
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then((list) => setManufacturers(list.filter((m) => m.is_active))).catch(() => {});
  }, [storeCompanies]);

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
      setCompanyId(editData.company_id);
      setMfgId(editData.manufacturer_id);
      setContractType(editData.contract_type);
      setIsExclusive(editData.contract_type === 'exclusive' || /^\[독점\]/.test(editData.memo ?? ''));
      setContractDate(editData.contract_date?.slice(0, 10) ?? '');
      setPeriodStart(editData.contract_period_start?.slice(0, 10) ?? '');
      setPeriodEnd(editData.contract_period_end?.slice(0, 10) ?? '');
      setIncoterms((editData.incoterms ?? '').replace(/\s*\(BAF\/CAF 포함\)\s*/i, ''));
      setBafCaf(/BAF\s*\/\s*CAF/i.test(editData.incoterms ?? '') || /\[BAF\/CAF\]/.test(editData.memo ?? ''));
      setExchangeRate('');
      setStatus(editData.status);
      setMemo((editData.memo ?? '').replace(/^\[독점\]\s*/, '').replace(/^\[BAF\/CAF\]\s*/, ''));
      setPaymentTerms(parsePT(editData.payment_terms ?? ''));
      setLines([emptyLine()]);
    } else {
      // 신규: 상단 셀렉터가 단일 법인이면 자동, 'all'이면 비움(직접 선택)
      const cid = globalCompanyId && globalCompanyId !== 'all' ? globalCompanyId : '';
      setPoNumber(''); setCompanyId(cid); setMfgId(''); setContractType(''); setIsExclusive(false);
      setContractDate(''); setPeriodStart(''); setPeriodEnd('');
      setIncoterms(''); setBafCaf(false); setExchangeRate('');
      setStatus('draft'); setMemo(''); setPaymentTerms(defaultPT());
      setLines([emptyLine()]);
    }
  }, [open, editData, globalCompanyId]);

  /* 라인 조작 */
  const updateLine = (i: number, f: keyof POLine, v: string) =>
    setLines((prev) => prev.map((l, j) => j === i ? { ...l, [f]: v } : l));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => prev.length <= 1 ? prev : prev.filter((_, j) => j !== i));

  /* 라인별 계산 — 입력 모드(qty/mw)에 따라 EA/MW 도출 */
  const lineCalc = useCallback((l: POLine) => {
    const p = products.find((x) => x.product_id === l.product_id);
    if (!p) return { qty: 0, mw: 0, total: 0 };
    let qty = 0, mw = 0;
    if (l.inputMode === 'qty') {
      qty = parseInt(l.quantity || '0');
      mw = (qty * p.spec_wp) / 1_000_000;
    } else {
      mw = parseFloat(l.capacityMw || '0');
      qty = p.spec_wp ? Math.round((mw * 1_000_000) / p.spec_wp) : 0;
    }
    const rawPrice = parseFloat(l.unit_price_usd_wp || '0');
    const pricePerWp = l.priceMode === 'cents' ? rawPrice / 100 : rawPrice;
    const total = qty && pricePerWp ? qty * p.spec_wp * pricePerWp : 0;
    return { qty, mw, total };
  }, [products]);

  /* 단가 단위 토글 — 값을 자동 변환하여 의미 보존 */
  const togglePriceMode = (idx: number) =>
    setLines((prev) => prev.map((l, j) => {
      if (j !== idx) return l;
      const next = l.priceMode === 'cents' ? 'dollar' : 'cents';
      const v = parseFloat(l.unit_price_usd_wp || '0');
      if (!v) return { ...l, priceMode: next };
      const conv = next === 'cents' ? v * 100 : v / 100;
      return { ...l, priceMode: next, unit_price_usd_wp: parseFloat(conv.toPrecision(8)).toString() };
    }));

  /* 입력 모드 토글 — 반대 필드를 자동 채움 */
  const toggleInputMode = (idx: number) =>
    setLines((prev) => prev.map((l, j) => {
      if (j !== idx) return l;
      const c = lineCalc(l);
      const next = l.inputMode === 'qty' ? 'mw' : 'qty';
      return {
        ...l, inputMode: next,
        quantity: c.qty ? String(c.qty) : l.quantity,
        capacityMw: c.mw ? c.mw.toFixed(3) : l.capacityMw,
      };
    }));

  /* 합계 */
  const totals = lines.reduce(
    (acc, l) => {
      const c = lineCalc(l);
      return { qty: acc.qty + c.qty, mw: acc.mw + c.mw, total: acc.total + c.total };
    },
    { qty: 0, mw: 0, total: 0 },
  );
  const exRateNum = parseFloat(exchangeRate || '0');
  const totalKRW = exRateNum > 0 ? Math.round(totals.total * exRateNum) : 0;

  /* 제출 */
  const handleSubmit = async () => {
    setSubmitError('');
    if (!companyId) { setSubmitError('구매법인을 선택해주세요'); return; }
    if (!poNumber.trim()) { setSubmitError('PO번호는 필수입니다'); return; }
    if (poNumber.trim().length > 20) { setSubmitError('PO번호는 20자 이내'); return; }
    if (incoterms.length > 10) { setSubmitError('선적조건은 10자 이내 (DB 제약)'); return; }
    if (!mfgId) { setSubmitError('제조사는 필수입니다'); return; }
    if (!contractType) { setSubmitError('계약유형은 필수입니다'); return; }
    if (!contractDate) { setSubmitError('계약일은 필수입니다'); return; }
    if (contractType === 'frame' && (!periodStart || !periodEnd)) {
      setSubmitError('프레임 계약은 시작일과 종료일이 필수입니다'); return;
    }
    if (!incoterms) { setSubmitError('선적조건은 필수입니다'); return; }
    if (!editData) {
      const validLines = lines.filter((l) => {
        const c = lineCalc(l);
        return l.product_id && c.qty > 0;
      });
      if (validLines.length === 0) { setSubmitError('발주품목을 최소 1행 입력해주세요'); return; }
    }

    // 22001 회피: incoterms는 varchar(10) — BAF/CAF 플래그는 메모로 분리
    const incotermsFinal = incoterms;

    const validLines = lines.filter((l) => l.product_id && lineCalc(l).qty > 0);
    const linesPayload = validLines.map((l) => {
      const c = lineCalc(l);
      const p = products.find((x) => x.product_id === l.product_id);
      // unit_price_usd = $/EA (모듈 1장 가격), total_amount_usd = 라인 총액
      const unitPerEA = p && c.qty ? c.total / c.qty : undefined;
      return {
        product_id: l.product_id,
        quantity: c.qty,
        unit_price_usd: unitPerEA && !isNaN(unitPerEA) ? Number(unitPerEA.toFixed(4)) : undefined,
        total_amount_usd: c.total || undefined,
      };
    });

    const payload: Record<string, unknown> = {
      po_id: editData?.po_id,
      po_number: poNumber.trim(),
      company_id: companyId,
      manufacturer_id: mfgId,
      contract_type: contractType,
      contract_date: contractDate,
      contract_period_start: contractType === 'frame' ? periodStart : undefined,
      contract_period_end: contractType === 'frame' ? periodEnd : undefined,
      incoterms: incotermsFinal,
      payment_terms: composePT(paymentTerms, totals.total),
      total_qty: totals.qty || undefined,
      total_mw: totals.mw || undefined,
      status,
      // 독점/BAF·CAF 플래그는 별도 DB 컬럼이 없어 메모 접두사로 보존
      memo: ((isExclusive ? '[독점] ' : '') + (bafCaf ? '[BAF/CAF] ' : '') + (memo || '')).trim() || undefined,
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
              <Req>구매법인</Req>
              <Select value={companyId} onValueChange={(v) => setCompanyId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <Txt text={companies.find((c) => c.company_id === companyId)?.company_name ?? ''} placeholder="구매법인 선택" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Req>PO번호 (최대 20자)</Req>
              <Input value={poNumber} maxLength={20} onChange={(e) => setPoNumber(e.target.value.slice(0, 20))} placeholder="PO-2026-001" />
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
                <SelectTrigger className="w-full">
                  <Txt text={CONTRACT_TYPES[contractType] ?? LEGACY_CT[contractType] ?? ''} placeholder="계약유형" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  {LEGACY_CT[contractType] && <SelectItem value={contractType}>{LEGACY_CT[contractType]}</SelectItem>}
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
            {contractType === 'frame' && (
              <>
                <div className="space-y-1.5">
                  <Req>계약 시작일</Req>
                  <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Req>계약 종료일</Req>
                  <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Req>선적조건</Req>
              <Select value={incoterms} onValueChange={(v) => setIncoterms(v ?? '')}>
                <SelectTrigger className="w-full"><Txt text={incoterms} placeholder="선적조건 선택" /></SelectTrigger>
                <SelectContent>
                  {INCOTERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <input type="checkbox" checked={bafCaf} onChange={(e) => setBafCaf(e.target.checked)} />
                BAF/CAF 포함
              </label>
            </div>
            <div className="space-y-1.5">
              <Opt>환율 (USD→KRW)</Opt>
              <Input inputMode="decimal" value={exchangeRate} placeholder="예: 1450.30"
                onChange={(e) => setExchangeRate(e.target.value.replace(/[^0-9.]/g, ''))} />
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
                      {/* 수량/용량 입력 모드 토글 */}
                      <div className="w-32 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-blue-600 font-medium">
                            {line.inputMode === 'qty' ? '수량(EA) *' : '용량(MW) *'}
                          </span>
                          <button type="button" className="text-[9px] text-primary underline"
                            onClick={() => toggleInputMode(idx)} title="입력 모드 전환">
                            {line.inputMode === 'qty' ? '→ MW' : '→ EA'}
                          </button>
                        </div>
                        {line.inputMode === 'qty' ? (
                          <Input className="h-9 text-xs" inputMode="numeric" value={line.quantity} placeholder="0"
                            onChange={(e) => updateLine(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))} />
                        ) : (
                          <Input className="h-9 text-xs" inputMode="decimal" value={line.capacityMw} placeholder="0.000"
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) updateLine(idx, 'capacityMw', v);
                            }} />
                        )}
                      </div>
                      {/* 단가 + ¢/$ 토글 */}
                      <div className="w-40 space-y-1">
                        <span className="text-[10px] text-blue-600 font-medium">
                          {line.priceMode === 'cents' ? '단가(¢/Wp) *' : '단가($/Wp) *'}
                        </span>
                        <div className="flex gap-1 items-center">
                          <Input className="h-9 text-xs flex-1 min-w-0" inputMode="decimal" value={line.unit_price_usd_wp}
                            placeholder={line.priceMode === 'cents' ? '¢11.9/Wp' : '$0.119/Wp'}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) updateLine(idx, 'unit_price_usd_wp', v);
                            }} />
                          <Button type="button" variant="outline" size="sm"
                            className="h-9 px-1.5 text-[10px] shrink-0 w-9" onClick={() => togglePriceMode(idx)}>
                            {line.priceMode === 'cents' ? '¢' : '$'}
                          </Button>
                        </div>
                      </div>
                      <div className="w-32 space-y-1">
                        <span className="text-[10px] text-muted-foreground font-medium">총액(USD)</span>
                        <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                          {c.total ? `$${c.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '-'}
                        </div>
                      </div>
                      <div className="w-24 space-y-1">
                        <span className="text-[10px] text-muted-foreground font-medium">
                          {line.inputMode === 'qty' ? '용량(MW)' : '수량(EA)'}
                        </span>
                        <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                          {line.inputMode === 'qty'
                            ? (c.mw ? `${c.mw.toFixed(3)}MW` : '-')
                            : (c.qty ? c.qty.toLocaleString('ko-KR') : '-')}
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
                  <span className="text-sm">
                    KRW <span className={`font-mono font-semibold ${totalKRW ? '' : 'text-orange-600'}`}>
                      {totalKRW ? `₩${totalKRW.toLocaleString('ko-KR')}` : '환율을 입력하세요'}
                    </span>
                  </span>
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
                      {totalKRW > 0 && ` / ₩${Math.round(totalKRW * (parseFloat(paymentTerms.depositPercent || '0') / 100)).toLocaleString('ko-KR')}`}
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
                  {(() => {
                    const balUSD = Math.max(0, totals.total - (paymentTerms.hasDeposit ? totals.total * (parseFloat(paymentTerms.depositPercent || '0') / 100) : 0));
                    const balKRW = totalKRW > 0 ? Math.round(balUSD * exRateNum) : 0;
                    return `잔금 = $${balUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}${balKRW ? ` / ₩${balKRW.toLocaleString('ko-KR')}` : ''}`;
                  })()}
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
