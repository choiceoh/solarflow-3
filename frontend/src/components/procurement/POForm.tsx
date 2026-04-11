import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
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
// 모든 상태를 수동 선택 가능 (BL 자동 전환도 동작하지만 사용자가 오버라이드 가능)
const PO_STATUSES: Record<string, string> = {
  draft: '예정',
  contracted: '계약완료',
  shipping: '선적중',
  completed: '완료',
};
const PO_STATUSES_READONLY: Record<string, string> = {};
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
  po_line_id?: string;       // R1-5: 기존 라인 식별자 (수정 시 UPDATE, 없으면 INSERT)
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
  // 원계약 연결 (계약변경 시)
  const [parentPoId, setParentPoId] = useState('');
  const [parentPoOptions, setParentPoOptions] = useState<Pick<PurchaseOrder, 'po_id' | 'po_number' | 'total_mw' | 'status'>[]>([]);
  // 신규 등록 시 계약 구분 선택
  const [isAmendment, setIsAmendment] = useState(false);
  // 변경계약 원계약 선택을 위한 전체 활성 PO 목록 (completed 제외)
  const [allActivePOs, setAllActivePOs] = useState<PurchaseOrder[]>([]);

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

  /* 제조사 → 원계약 후보 PO 목록 (신규 등록 시) */
  useEffect(() => {
    if (!mfgId || !companyId) { setParentPoOptions([]); return; }
    fetchWithAuth<Pick<PurchaseOrder, 'po_id' | 'po_number' | 'total_mw' | 'status'>[]>(
      `/api/v1/pos?manufacturer_id=${mfgId}&company_id=${companyId}`
    ).then((list) => {
      // 현재 편집 중인 PO 자신은 제외
      setParentPoOptions(list.filter((p) => p.po_id !== editData?.po_id));
    }).catch(() => setParentPoOptions([]));
  }, [mfgId, companyId, editData?.po_id]);

  /* 폼 초기화 — 수정 모드는 서버에서 최신 데이터 fetch (목록 캐시가 stale일 수 있음) */
  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    if (editData) {
      // 우선 list 캐시 데이터로 즉시 채우고, 서버 fetch 결과로 덮어쓰기
      const fillFromPO = (d: PurchaseOrder) => {
        setPoNumber(d.po_number ?? '');
        setCompanyId(d.company_id ?? '');
        setMfgId(d.manufacturer_id ?? '');
        setContractType(d.contract_type ?? '');
        setIsExclusive(d.contract_type === 'exclusive' || /^\[독점\]/.test(d.memo ?? ''));
        setContractDate(d.contract_date?.slice(0, 10) ?? '');
        setPeriodStart(d.contract_period_start?.slice(0, 10) ?? '');
        setPeriodEnd(d.contract_period_end?.slice(0, 10) ?? '');
        setIncoterms((d.incoterms ?? '').replace(/\s*\(BAF\/CAF 포함\)\s*/i, ''));
        setBafCaf(/BAF\s*\/\s*CAF/i.test(d.incoterms ?? '') || /\[BAF\/CAF\]/.test(d.memo ?? ''));
        setExchangeRate('');
        setStatus(d.status ?? 'draft');
        setMemo((d.memo ?? '').replace(/^\[독점\]\s*/, '').replace(/^\[BAF\/CAF\]\s*/, ''));
        setPaymentTerms(parsePT(d.payment_terms ?? ''));
        setParentPoId(d.parent_po_id ?? '');
      };
      fillFromPO(editData);
      setLines([emptyLine()]);

      // R1-6: PO 상세 + 발주품목 함께 로드
      // GET /api/v1/pos/{id}는 PODetail(line_items 포함)을 반환. 단일 호출로 처리.
      type POLineFetched = {
        po_line_id?: string; product_id: string; quantity: number;
        unit_price_usd?: number;
        products?: { spec_wp?: number; product_code?: string };
      };
      type PODetailResp = PurchaseOrder & { line_items?: POLineFetched[] };

      const mapLine = (l: POLineFetched) => {
        const specWp = l.products?.spec_wp ?? 0;
        const centsPerWp = (l.unit_price_usd != null && specWp)
          ? (l.unit_price_usd / specWp) * 100
          : 0;
        return {
          po_line_id: l.po_line_id,
          product_id: l.product_id,
          inputMode: 'qty' as const,
          quantity: String(l.quantity),
          capacityMw: '',
          unit_price_usd_wp: centsPerWp ? parseFloat(centsPerWp.toPrecision(8)).toString() : '',
          priceMode: 'cents' as const,
        };
      };

      // 1차: 통합 상세 (line_items 포함)
      fetchWithAuth<PODetailResp>(`/api/v1/pos/${editData.po_id}`)
        .then((fresh) => {
          if (!fresh) return;
          fillFromPO(fresh);
          if (Array.isArray(fresh.line_items) && fresh.line_items.length > 0) {
            // eslint-disable-next-line no-console
            console.log('[POForm] detail.line_items', fresh.line_items.length);
            setLines(fresh.line_items.map(mapLine));
            return;
          }
          // 폴백: 상세에 line_items가 없으면 별도 엔드포인트로 재시도
          fetchWithAuth<POLineFetched[]>(`/api/v1/pos/${editData.po_id}/lines`)
            .then((lineList) => {
              // eslint-disable-next-line no-console
              console.log('[POForm] fallback /lines', lineList?.length ?? 0);
              if (Array.isArray(lineList) && lineList.length > 0) {
                setLines(lineList.map(mapLine));
              }
            })
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.error('[POForm] /lines fetch error', err);
            });
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[POForm] detail fetch error', err);
          // 상세 실패 시에도 /lines는 시도
          fetchWithAuth<POLineFetched[]>(`/api/v1/pos/${editData.po_id}/lines`)
            .then((lineList) => {
              if (Array.isArray(lineList) && lineList.length > 0) {
                setLines(lineList.map(mapLine));
              }
            })
            .catch(() => {});
        });
    } else {
      // 신규: 상단 셀렉터가 단일 법인이면 자동, 'all'이면 비움(직접 선택)
      const cid = globalCompanyId && globalCompanyId !== 'all' ? globalCompanyId : '';
      setPoNumber(''); setCompanyId(cid); setMfgId(''); setContractType(''); setIsExclusive(false);
      setContractDate(''); setPeriodStart(''); setPeriodEnd('');
      setIncoterms(''); setBafCaf(false); setExchangeRate('');
      setStatus('draft'); setMemo(''); setPaymentTerms(defaultPT());
      setParentPoId('');
      setIsAmendment(false);
      setLines([emptyLine()]);
      // 변경계약 선택용 활성 PO 목록 로드 (completed 제외)
      fetchWithAuth<PurchaseOrder[]>('/api/v1/pos')
        .then((list) => setAllActivePOs((list ?? []).filter((p) => p.status !== 'completed' && p.status !== 'draft')))
        .catch(() => setAllActivePOs([]));
    }
  }, [open, editData, globalCompanyId]);

  /* 변경계약 — 원계약 선택 시 제조사·법인 자동채움 */
  const handleParentPoSelect = (v: string | null) => {
    const pid = !v || v === '_none' ? '' : v;
    setParentPoId(pid);
    if (pid) {
      const parent = allActivePOs.find((p) => p.po_id === pid);
      if (parent) {
        setMfgId(parent.manufacturer_id ?? '');
        setCompanyId(parent.company_id ?? '');
      }
    }
  };

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

    // R1-6: lineCalc가 products 로딩 지연으로 0을 반환해도 raw quantity fallback
    const validLines = lines.filter((l) => {
      if (!l.product_id) return false;
      const c = lineCalc(l);
      if (c.qty > 0) return true;
      // fallback: products 미로드 상태에서도 qty 입력값 그대로 사용
      return parseInt(l.quantity || '0') > 0;
    });
    const linesPayload = validLines.map((l) => {
      const c = lineCalc(l);
      const p = products.find((x) => x.product_id === l.product_id);
      const qty = c.qty || parseInt(l.quantity || '0');
      // unit_price_usd = $/EA (모듈 1장 가격), total_amount_usd = 라인 총액
      let total = c.total;
      if (!total && p && qty) {
        const rawPrice = parseFloat(l.unit_price_usd_wp || '0');
        const pricePerWp = l.priceMode === 'cents' ? rawPrice / 100 : rawPrice;
        total = qty * p.spec_wp * pricePerWp;
      }
      const unitPerEA = qty && total ? total / qty : undefined;
      // 단가이력 자동생성용 — USD/Wp 단가 (Go API는 무시, 프론트에서만 사용)
      const rawPrice = parseFloat(l.unit_price_usd_wp || '0');
      const pricePerWp = l.priceMode === 'cents' ? rawPrice / 100 : rawPrice; // USD/Wp
      return {
        po_line_id: l.po_line_id, // R1-5: 수정 시 UPDATE 식별자
        product_id: l.product_id,
        quantity: qty,
        unit_price_usd: unitPerEA && !isNaN(unitPerEA) ? Number(unitPerEA.toFixed(4)) : undefined,
        total_amount_usd: total || undefined,
        // 이하 두 필드는 단가이력 자동생성용 (DB저장 X, Go가 무시)
        _price_per_wp_usd: pricePerWp > 0 ? pricePerWp : undefined,
        _spec_wp: p?.spec_wp,
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
      parent_po_id: parentPoId || undefined,
      lines: linesPayload, // R1-5: 수정 모드에서도 라인 전송 (호출자가 diff CRUD 처리)
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

          {/* ── 신규 등록 시 계약 구분 선택 ── */}
          {!editData && (
            <div className="rounded-md border bg-muted/20 px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">계약 구분 *</p>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="amendmentType"
                    checked={!isAmendment}
                    onChange={() => { setIsAmendment(false); setParentPoId(''); }}
                  />
                  <span className="text-sm font-medium">신규 계약</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="amendmentType"
                    checked={isAmendment}
                    onChange={() => setIsAmendment(true)}
                  />
                  <span className="text-sm font-medium text-amber-700">변경계약 (원계약 연결)</span>
                </label>
              </div>
            </div>
          )}

          {/* ── 변경계약 선택 시: 원계약 PO 먼저 선택 ── */}
          {!editData && isAmendment && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-800">원계약 PO 선택 *</p>
              <Select value={parentPoId} onValueChange={handleParentPoSelect}>
                <SelectTrigger className="w-full bg-white">
                  <Txt
                    text={(() => {
                      const p = allActivePOs.find((x) => x.po_id === parentPoId);
                      return p
                        ? `${p.po_number ?? p.po_id.slice(0, 8)} | ${p.manufacturer_name ?? '—'} | ${(p.total_mw ?? 0).toFixed(1)}MW | ${p.status}`
                        : '';
                    })()}
                    placeholder="원계약 PO를 선택하세요"
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— 선택 안함 —</SelectItem>
                  {allActivePOs.map((p) => (
                    <SelectItem key={p.po_id} value={p.po_id}>
                      {`${p.po_number ?? p.po_id.slice(0, 8)} | ${p.manufacturer_name ?? '—'} | ${(p.total_mw ?? 0).toFixed(1)}MW | ${p.status}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {parentPoId && (() => {
                const p = allActivePOs.find((x) => x.po_id === parentPoId);
                if (!p) return null;
                return (
                  <div className="rounded bg-amber-100 px-3 py-2 text-xs text-amber-800 grid grid-cols-4 gap-2">
                    <div><div className="text-amber-600 mb-0.5">제조사</div><div className="font-medium">{p.manufacturer_name ?? '—'}</div></div>
                    <div><div className="text-amber-600 mb-0.5">계약용량</div><div className="font-mono font-medium">{(p.total_mw ?? 0).toFixed(1)}MW</div></div>
                    <div><div className="text-amber-600 mb-0.5">계약일</div><div className="font-medium">{p.contract_date?.slice(0, 10) ?? '—'}</div></div>
                    <div><div className="text-amber-600 mb-0.5">상태</div><div className="font-medium">{p.status}</div></div>
                  </div>
                );
              })()}
              <p className="text-[10px] text-amber-700">
                ※ 원계약 선택 시 제조사·법인이 자동 채워집니다. contracted 확정 시 단가이력이 "계약변경" 사유로 자동 등록되며, 원계약은 완료(completed) 처리됩니다.
              </p>
            </div>
          )}

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
              <DateInput value={contractDate} onChange={setContractDate} />
            </div>
            {contractType === 'frame' && (
              <>
                <div className="space-y-1.5">
                  <Req>계약 시작일</Req>
                  <DateInput value={periodStart} onChange={setPeriodStart} />
                </div>
                <div className="space-y-1.5">
                  <Req>계약 종료일</Req>
                  <DateInput value={periodEnd} onChange={setPeriodEnd} />
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
                <SelectTrigger className="w-full">
                  <Txt text={PO_STATUSES[status] ?? PO_STATUSES_READONLY[status] ?? ''} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PO_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 원계약 연결 — 수정 모드에서 기존 연결 표시/변경 */}
          {editData && parentPoOptions.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1.5">
              <Label className="text-amber-800 font-medium text-xs">원계약 연결</Label>
              <Select value={parentPoId} onValueChange={(v) => setParentPoId(v === '_none' ? '' : (v ?? ''))}>
                <SelectTrigger className="w-full bg-white">
                  <Txt text={
                    parentPoId
                      ? (() => {
                          const p = parentPoOptions.find((x) => x.po_id === parentPoId);
                          return p ? `${p.po_number ?? p.po_id.slice(0, 8)} (${p.total_mw?.toFixed(0) ?? '?'}MW · ${p.status})` : parentPoId.slice(0, 8);
                        })()
                      : ''
                  } placeholder="연결 안함" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">연결 안함</SelectItem>
                  {parentPoOptions.map((p) => (
                    <SelectItem key={p.po_id} value={p.po_id}>
                      {p.po_number ?? p.po_id.slice(0, 8)} — {p.total_mw?.toFixed(0) ?? '?'}MW · {p.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
