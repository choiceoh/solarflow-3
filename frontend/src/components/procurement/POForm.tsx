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
import { shortMfgName } from '@/lib/utils';
import {
  calcWpLineAmountUsd,
  displayPriceToUsdWp,
  formatIntegerInput,
  parseDecimalInput,
  parseIntegerInput,
  unitUsdEaToDisplayPrice,
} from '@/lib/numberRules';
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
// 수동 선택 가능 상태 (in_progress는 LC 등록 시 자동 전환)
const PO_STATUSES: Record<string, string> = {
  draft:       '예정',
  contracted:  '계약완료',
  in_progress: '진행중',
  completed:   '완료',
};
// 레거시 읽기 호환 (UI에는 표시하지 않되 데이터에 있으면 표시)
const PO_STATUSES_READONLY: Record<string, string> = {
  cancelled: '취소',
  shipping: '선적중 (레거시)',
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
  po_line_id?: string;       // R1-5: 기존 라인 식별자 (수정 시 UPDATE, 없으면 INSERT)
  product_id: string;
  inputMode: 'ea' | 'kw' | 'mw'; // 3단 입력 모드 (기본: mw — 용량 먼저)
  quantity: string;          // EA
  capacityKw: string;        // kW 직접 입력용
  capacityMw: string;        // MW (수량의 미러 또는 직접 입력)
  unit_price_usd_wp: string; // $/Wp (cents 모드일 땐 ¢/Wp 값)
  priceMode: 'dollar' | 'cents'; // 단가 단위 (¢/Wp 고정 사용)
  isFreeSpare: boolean;      // 무상스페어 — 단가 없음
  _specWp: number;           // products 비동기 로딩 전 spec_wp 캐시 (DB 로드 또는 품번 선택 시 저장)
  _unitPriceUsd?: number;   // 수정 모드 원본 $/EA (spec_wp=0 시 단가 보존용 최후 fallback)
}
const emptyLine = (): POLine => ({
  product_id: '', inputMode: 'mw', quantity: '', capacityKw: '', capacityMw: '',
  unit_price_usd_wp: '', priceMode: 'cents', isFreeSpare: false, _specWp: 0,
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

  // 빠른 품번 등록 다이얼로그
  const [qpOpen, setQpOpen] = useState(false);
  const [qpLineIdx, setQpLineIdx] = useState<number | null>(null);
  const [qpCode, setQpCode] = useState('');
  const [qpName, setQpName] = useState('');
  const [qpWp, setQpWp] = useState('');
  const [qpWidth, setQpWidth] = useState('');
  const [qpHeight, setQpHeight] = useState('');
  const [qpError, setQpError] = useState('');
  const [qpSubmitting, setQpSubmitting] = useState(false);

  const [incotermOpen, setIncotermOpen] = useState(false);
  const [incotermHighlight, setIncotermHighlight] = useState(-1);

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
  const [exchangeRateDisplay, setExchangeRateDisplay] = useState('');
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
        setExchangeRate(''); setExchangeRateDisplay('');
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
        unit_price_usd?: number; payment_type?: string; item_type?: string;
        products?: { spec_wp?: number; product_code?: string };
      };
      type PODetailResp = PurchaseOrder & { line_items?: POLineFetched[] };

      const mapLine = (l: POLineFetched): POLine => {
        const specWp = l.products?.spec_wp ?? 0;
        const isFree = l.payment_type === 'free';
        const mwVal = specWp && l.quantity ? (l.quantity * specWp) / 1_000_000 : 0;
        return {
          po_line_id: l.po_line_id,
          product_id: l.product_id,
          inputMode: 'mw' as const,
          quantity: String(l.quantity),
          capacityKw: mwVal ? (mwVal * 1000).toFixed(1) : '',
          capacityMw: mwVal ? mwVal.toFixed(3) : '',
          unit_price_usd_wp: isFree ? '' : unitUsdEaToDisplayPrice(l.unit_price_usd, specWp, 'cents'),
          priceMode: 'cents' as const,
          isFreeSpare: isFree,
          _specWp: specWp, // products 비동기 로딩 전 단가 계산용 캐시
          _unitPriceUsd: (!isFree && l.unit_price_usd != null) ? l.unit_price_usd : undefined, // spec_wp=0 fallback
        };
      };

      // 1차: 통합 상세 (line_items 포함)
      fetchWithAuth<PODetailResp>(`/api/v1/pos/${editData.po_id}`)
        .then((fresh) => {
          if (!fresh) return;
          fillFromPO(fresh);
          if (Array.isArray(fresh.line_items) && fresh.line_items.length > 0) {
            setLines(fresh.line_items.map(mapLine));
            return;
          }
          // 폴백: 상세에 line_items가 없으면 별도 엔드포인트로 재시도
          fetchWithAuth<POLineFetched[]>(`/api/v1/pos/${editData.po_id}/lines`)
            .then((lineList) => {
              if (Array.isArray(lineList) && lineList.length > 0) {
                setLines(lineList.map(mapLine));
              }
            })
            .catch((err) => {
              console.error('[POForm] /lines fetch error', err);
            });
        })
        .catch((err) => {
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
      setIncoterms(''); setBafCaf(false); setExchangeRate(''); setExchangeRateDisplay('');
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

  /* 라인별 계산 — 입력 모드(ea/kw/mw)에 따라 EA/MW 도출
   * _specWp 캐시 덕분에 products 비동기 로딩 전에도 계산 가능 */
  const lineCalc = useCallback((l: POLine) => {
    const p = products.find((x) => x.product_id === l.product_id);
    const specWp = p?.spec_wp ?? l._specWp ?? 0;
    if (!specWp) return { qty: 0, mw: 0, kw: 0, total: 0 };
    let qty = 0, mw = 0;
    if (l.inputMode === 'ea') {
      qty = Number(parseIntegerInput(l.quantity) || '0');
      mw = (qty * specWp) / 1_000_000;
    } else if (l.inputMode === 'kw') {
      const kw = parseFloat(l.capacityKw || '0');
      mw = kw / 1000;
      qty = Math.round((kw * 1_000) / specWp);
    } else {
      mw = parseFloat(l.capacityMw || '0');
      qty = Math.round((mw * 1_000_000) / specWp);
    }
    const kw = mw * 1000;
    if (l.isFreeSpare) return { qty, mw, kw, total: 0 };
    const total = calcWpLineAmountUsd(qty, specWp, l.unit_price_usd_wp, l.priceMode);
    return { qty, mw, kw, total };
  }, [products]);


  /* 입력 모드 3단 순환: mw → kw → ea → mw */
  const cycleInputMode = (idx: number) =>
    setLines((prev) => prev.map((l, j) => {
      if (j !== idx) return l;
      const c = lineCalc(l);
      const next = ({ mw: 'kw', kw: 'ea', ea: 'mw' } as const)[l.inputMode];
      return {
        ...l, inputMode: next,
        quantity:    c.qty ? String(c.qty) : l.quantity,
        capacityKw:  c.kw  ? c.kw.toFixed(1)  : l.capacityKw,
        capacityMw:  c.mw  ? c.mw.toFixed(3)  : l.capacityMw,
      };
    }));

  /* 합계 — 무상스페어는 MW/수량에만 합산, 금액 제외 */
  const totals = lines.reduce(
    (acc, l) => {
      const c = lineCalc(l);
      return {
        qty: acc.qty + c.qty,
        mw: acc.mw + c.mw,
        total: acc.total + c.total,
        freeQty: acc.freeQty + (l.isFreeSpare ? c.qty : 0),
        freeMw: acc.freeMw + (l.isFreeSpare ? c.mw : 0),
      };
    },
    { qty: 0, mw: 0, total: 0, freeQty: 0, freeMw: 0 },
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
        return l.product_id && (c.qty > 0 || Number(parseIntegerInput(l.quantity) || '0') > 0);
      });
      if (validLines.length === 0) { setSubmitError('발주품목을 최소 1행 입력해주세요'); return; }
      // 유상 라인에 단가 미입력 경고
      const paidWithoutPrice = validLines.filter((l) => !l.isFreeSpare && !l.unit_price_usd_wp);
      if (paidWithoutPrice.length > 0) { setSubmitError('단가를 입력하지 않은 유상 품목이 있습니다'); return; }
    }

    // 22001 회피: incoterms는 varchar(10) — BAF/CAF 플래그는 메모로 분리
    const incotermsFinal = incoterms;

    // R1-6: lineCalc가 products 로딩 지연으로 0을 반환해도 raw quantity fallback
    const validLines = lines.filter((l) => {
      if (!l.product_id) return false;
      const c = lineCalc(l);
      if (c.qty > 0) return true;
      // fallback: products 미로드 상태에서도 qty 입력값 그대로 사용
      return Number(parseIntegerInput(l.quantity) || '0') > 0;
    });
    const linesPayload = validLines.map((l) => {
      const c = lineCalc(l);
      const p = products.find((x) => x.product_id === l.product_id);
      const qty = c.qty || Number(parseIntegerInput(l.quantity) || '0');

      if (l.isFreeSpare) {
        // 무상스페어: 단가 0, payment_type='free'
        return {
          po_line_id: l.po_line_id,
          product_id: l.product_id,
          quantity: qty,
          unit_price_usd: 0,
          total_amount_usd: 0,
          item_type: 'spare',
          payment_type: 'free',
        };
      }

      // unit_price_usd = $/EA (모듈 1장 가격), total_amount_usd = 라인 총액
      const pricePerWp = displayPriceToUsdWp(l.unit_price_usd_wp, l.priceMode) ?? 0; // USD/Wp
      const specWpFinal = p?.spec_wp ?? l._specWp ?? 0;

      // $/EA = spec_wp * $/Wp — qty가 없어도 계산 가능 (MW 모드에서 qty=0이어도 안전)
      const directUnitPerEA = specWpFinal > 0 && pricePerWp > 0
        ? Number((specWpFinal * pricePerWp).toFixed(4))
        : undefined;
      // 최후 fallback: 수정 모드에서 저장된 원본 $/EA (spec_wp=0이거나 단가 입력 불가 시)
      const unitPerEA = directUnitPerEA ?? l._unitPriceUsd;

      let total = c.total;
      if (!total && unitPerEA && qty) total = qty * unitPerEA;

      return {
        po_line_id: l.po_line_id, // R1-5: 수정 시 UPDATE 식별자
        product_id: l.product_id,
        quantity: qty,
        unit_price_usd: unitPerEA,
        total_amount_usd: total || undefined,
        item_type: 'main',
        payment_type: 'paid',
        // 이하 두 필드는 단가이력 자동생성용 (DB저장 X, Go가 무시)
        _price_per_wp_usd: pricePerWp > 0 ? pricePerWp : undefined,
        _spec_wp: specWpFinal > 0 ? specWpFinal : undefined,
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

  const handleQuickProduct = async () => {
    const wp = parseInt(qpWp, 10);
    const w  = parseInt(qpWidth, 10);
    const h  = parseInt(qpHeight, 10);
    if (!qpCode.trim())   { setQpError('품번코드를 입력하세요'); return; }
    if (!qpName.trim())   { setQpError('품명을 입력하세요'); return; }
    if (!wp || wp <= 0)   { setQpError('Wp를 올바르게 입력하세요'); return; }
    if (!w  || w  <= 0)   { setQpError('폭(mm)을 입력하세요'); return; }
    if (!h  || h  <= 0)   { setQpError('높이(mm)을 입력하세요'); return; }
    if (!mfgId)           { setQpError('제조사를 먼저 선택하세요'); return; }
    setQpSubmitting(true); setQpError('');
    try {
      const created = await fetchWithAuth<Product>('/api/v1/products', {
        method: 'POST',
        body: JSON.stringify({
          product_code:    qpCode.trim(),
          product_name:    qpName.trim(),
          manufacturer_id: mfgId,
          spec_wp:         wp,
          wattage_kw:      wp / 1000,
          module_width_mm: w,
          module_height_mm: h,
        }),
      });
      setProducts((prev) => [...prev, created]);
      if (qpLineIdx !== null) {
        setLines((prev) => prev.map((l, j) => j === qpLineIdx
          ? { ...l, product_id: created.product_id, _specWp: created.spec_wp }
          : l));
      }
      setQpOpen(false);
    } catch (e: unknown) {
      setQpError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setQpSubmitting(false);
    }
  };

  return (
    <>
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
                      if (!p) return '';
                      const specLabel = p.first_spec_wp ? ` ${p.first_spec_wp}W` : '';
                      return `${shortMfgName(p.manufacturer_name)}${specLabel} | ${p.po_number ?? p.po_id.slice(0, 8)} | ${(p.total_mw ?? 0).toFixed(1)}MW | ${p.status}`;
                    })()}
                    placeholder="원계약 PO를 선택하세요"
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— 선택 안함 —</SelectItem>
                  {allActivePOs.map((p) => {
                    const specLabel = p.first_spec_wp ? ` ${p.first_spec_wp}W` : '';
                    return (
                      <SelectItem key={p.po_id} value={p.po_id}>
                        {`${shortMfgName(p.manufacturer_name)}${specLabel} | ${p.po_number ?? p.po_id.slice(0, 8)} | ${(p.total_mw ?? 0).toFixed(1)}MW | ${p.status}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {parentPoId && (() => {
                const p = allActivePOs.find((x) => x.po_id === parentPoId);
                if (!p) return null;
                return (
                  <div className="rounded bg-amber-100 px-3 py-2 text-xs text-amber-800 grid grid-cols-4 gap-2">
                    <div><div className="text-amber-600 mb-0.5">제조사</div><div className="font-medium">{shortMfgName(p.manufacturer_name)}</div></div>
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
              <div className="relative">
                <Input
                  className="w-full text-sm"
                  value={incoterms}
                  placeholder="CIF, FOB… 입력 또는 선택"
                  maxLength={10}
                  onChange={(e) => {
                    setIncoterms(e.target.value.toUpperCase().slice(0, 10));
                    setIncotermOpen(true);
                    setIncotermHighlight(-1);
                  }}
                  onFocus={() => setIncotermOpen(true)}
                  onBlur={() => setTimeout(() => { setIncotermOpen(false); setIncotermHighlight(-1); }, 150)}
                  onKeyDown={(e) => {
                    const filtered = INCOTERMS.filter(t => !incoterms || t.startsWith(incoterms));
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setIncotermOpen(true);
                      setIncotermHighlight(prev => Math.min(prev + 1, filtered.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setIncotermHighlight(prev => Math.max(prev - 1, 0));
                    } else if (e.key === 'Enter' && incotermHighlight >= 0 && filtered[incotermHighlight]) {
                      e.preventDefault();
                      setIncoterms(filtered[incotermHighlight]);
                      setIncotermOpen(false);
                      setIncotermHighlight(-1);
                    } else if (e.key === 'Escape') {
                      setIncotermOpen(false);
                      setIncotermHighlight(-1);
                    }
                  }}
                />
                {incotermOpen && INCOTERMS.filter(t => !incoterms || t.startsWith(incoterms)).length > 0 && (
                  <div className="absolute z-50 top-full left-0 w-full mt-1 rounded-md border bg-popover shadow-md py-1">
                    {INCOTERMS.filter(t => !incoterms || t.startsWith(incoterms)).map((t, i) => (
                      <button key={t} type="button"
                        className={`w-full text-left px-3 py-1.5 text-sm ${i === incotermHighlight ? 'bg-muted font-medium' : 'hover:bg-muted/60'}`}
                        onMouseDown={(e) => { e.preventDefault(); setIncoterms(t); setIncotermOpen(false); setIncotermHighlight(-1); }}
                      >{t}</button>
                    ))}
                  </div>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <input type="checkbox" checked={bafCaf} onChange={(e) => setBafCaf(e.target.checked)} />
                BAF/CAF 포함
              </label>
            </div>
            <div className="space-y-1.5">
              <Opt>환율 (USD→KRW)</Opt>
              <Input inputMode="decimal" value={exchangeRateDisplay} placeholder="0.00"
                className="text-right font-mono"
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, '').replace(/[^0-9.]/g, '');
                  const parts = raw.split('.');
                  const clamped = parts.length > 1 ? parts[0] + '.' + parts[1].slice(0, 2) : raw;
                  const [intStr, decStr] = clamped.split('.');
                  const intFormatted = intStr ? Number(intStr).toLocaleString('ko-KR') : '';
                  const display = decStr !== undefined ? intFormatted + '.' + decStr : intFormatted;
                  setExchangeRateDisplay(display);
                  const num = parseFloat(clamped) || 0;
                  setExchangeRate(num > 0 ? String(num) : '');
                }}
                onFocus={() => setExchangeRateDisplay(exchangeRateDisplay.replace(/,/g, ''))}
                onBlur={() => {
                  const num = parseFloat(exchangeRateDisplay.replace(/,/g, ''));
                  if (!isNaN(num) && num > 0) {
                    setExchangeRateDisplay(num.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                    setExchangeRate(String(num));
                  }
                }} />
              <p className="text-[10px] text-muted-foreground">
                계약 당일 환율 입력 — 확정 환율은 BL 입고 시 면장 환율로 갱신됩니다
              </p>
            </div>
            <div className="space-y-1.5">
              <Opt>상태</Opt>
              <Select value={status} onValueChange={(v) => setStatus(v ?? 'draft')}>
                <SelectTrigger className="w-full">
                  <Txt text={PO_STATUSES[status] ?? PO_STATUSES_READONLY[status] ?? status} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PO_STATUSES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                      {k === 'in_progress' && <span className="ml-1 text-[10px] text-muted-foreground">(LC 등록 시 자동)</span>}
                    </SelectItem>
                  ))}
                  {PO_STATUSES_READONLY[status] && (
                    <SelectItem value={status}>{PO_STATUSES_READONLY[status]}</SelectItem>
                  )}
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
                    <div key={idx} className={`rounded-md border p-2 flex flex-wrap items-end gap-2 ${line.isFreeSpare ? 'border-green-300 bg-green-50/50' : ''}`}>
                      {/* 무상스페어 배지 */}
                      {line.isFreeSpare && (
                        <div className="w-full flex items-center gap-1.5 mb-0.5">
                          <span className="rounded-full bg-green-100 border border-green-300 px-2 py-0.5 text-[10px] font-semibold text-green-700">무상스페어</span>
                          <span className="text-[10px] text-green-600">단가 없이 수량만 등록됩니다</span>
                        </div>
                      )}
                      {/* 품번 */}
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <span className="text-[10px] text-blue-600 font-medium">품번 *</span>
                        <Select value={line.product_id} onValueChange={(v) => {
                          if (v === '__new__') {
                            setQpLineIdx(idx);
                            setQpCode(''); setQpName(''); setQpWp(''); setQpWidth(''); setQpHeight(''); setQpError('');
                            setQpOpen(true);
                            return;
                          }
                          const prod = products.find((p) => p.product_id === v);
                          setLines((prev) => prev.map((l, j) => j === idx
                            ? { ...l, product_id: v ?? '', _specWp: prod?.spec_wp ?? 0 }
                            : l));
                        }}>
                          <SelectTrigger className="w-full h-9 text-xs">
                            <Txt text={productLabel(line.product_id)} placeholder="품번 선택" />
                          </SelectTrigger>
                          <SelectContent className="min-w-[min(500px,calc(100vw-3rem))]">
                            {products.map((p) => (
                              <SelectItem key={p.product_id} value={p.product_id}>
                                {p.product_code} | {p.product_name} | {p.spec_wp}Wp
                              </SelectItem>
                            ))}
                            <SelectItem value="__new__" className="text-blue-600 font-medium border-t mt-1 pt-1">
                              + 새 품번 빠른 등록…
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* ── 용량/수량 3단 토글 — 중간 컬러 버튼 ── */}
                      <div className="flex items-end gap-1">
                        {/* 입력 필드 */}
                        <div className="w-28 space-y-1">
                          <span className="text-[10px] text-blue-600 font-medium">
                            {{ ea: '수량(EA)', kw: '용량(kW)', mw: '용량(MW)' }[line.inputMode]} *
                          </span>
                          {line.inputMode === 'ea' ? (
                            <Input className="h-9 text-xs text-right font-mono tabular-nums" inputMode="numeric" value={formatIntegerInput(line.quantity)} placeholder="0"
                              onChange={(e) => updateLine(idx, 'quantity', parseIntegerInput(e.target.value))} />
                          ) : line.inputMode === 'kw' ? (
                            <Input className="h-9 text-xs text-right font-mono tabular-nums" inputMode="decimal" value={line.capacityKw} placeholder="0.0"
                              onChange={(e) => {
                                const v = parseDecimalInput(e.target.value, 1);
                                if (v === '' || /^\d*\.?\d{0,1}$/.test(v)) updateLine(idx, 'capacityKw', v);
                              }} />
                          ) : (
                            <Input className="h-9 text-xs text-right font-mono tabular-nums" inputMode="decimal" value={line.capacityMw} placeholder="0.000"
                              onChange={(e) => {
                                const v = parseDecimalInput(e.target.value, 3);
                                if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) updateLine(idx, 'capacityMw', v);
                              }} />
                          )}
                        </div>
                        {/* 중간 토글 버튼 — 컬러 강조 */}
                        <button type="button"
                          className="h-9 px-2 rounded-md border-2 border-blue-400 bg-blue-50 text-blue-700 text-[10px] font-semibold hover:bg-blue-100 hover:border-blue-500 transition-colors shrink-0 leading-tight"
                          onClick={() => cycleInputMode(idx)}
                          title="단위 변환 (MW → kW → EA → MW)">
                          {{ mw: 'MW↓kW', kw: 'kW↓EA', ea: 'EA↓MW' }[line.inputMode]}
                        </button>
                        {/* 변환 결과 표시 */}
                        <div className="w-24 space-y-1">
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {{ ea: '용량(MW)', kw: '수량(EA)', mw: '수량(EA)' }[line.inputMode]}
                          </span>
                          <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                            {line.inputMode === 'ea'
                              ? (c.mw ? `${c.mw.toFixed(3)}` : '-')
                              : (c.qty ? c.qty.toLocaleString('ko-KR') : '-')}
                          </div>
                        </div>
                      </div>

                      {/* 단가 (무상스페어 시 숨김) */}
                      {!line.isFreeSpare && (
                        <div className="w-36 space-y-1">
                          <span className="text-[10px] text-blue-600 font-medium">단가 입력 (¢/Wp) *</span>
                          <Input className="h-9 text-xs text-right font-mono tabular-nums" inputMode="decimal" value={line.unit_price_usd_wp}
                            placeholder="단가입력"
                            onChange={(e) => {
                              updateLine(idx, 'unit_price_usd_wp', parseDecimalInput(e.target.value, 4));
                            }} />
                        </div>
                      )}

                      {/* 총액 */}
                      <div className="w-32 space-y-1">
                        <span className="text-[10px] text-muted-foreground font-medium">총액(USD)</span>
                        <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                          {line.isFreeSpare
                            ? <span className="text-green-600 font-medium">무상</span>
                            : (c.total ? `$${c.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '-')}
                        </div>
                      </div>

                      {/* 무상스페어 토글 + 삭제 */}
                      <div className="flex items-end gap-1.5 pb-0.5">
                        <label className="flex items-center gap-1 cursor-pointer select-none" title="무상스페어로 등록 (단가 없음)">
                          <input
                            type="checkbox"
                            checked={line.isFreeSpare}
                            onChange={(e) => setLines((prev) => prev.map((l, j) => j === idx
                              ? { ...l, isFreeSpare: e.target.checked, unit_price_usd_wp: '',
                                  // 무상 체크 시 → 수량(EA) 모드로 전환 (보통 장수로 지급)
                                  inputMode: e.target.checked ? 'ea' : l.inputMode }
                              : l))}
                            className="accent-green-600"
                          />
                          <span className="text-[10px] text-muted-foreground">무상</span>
                        </label>
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                          onClick={() => removeLine(idx)} disabled={lines.length <= 1}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {/* 합계 */}
                <div className="rounded-md border-2 border-primary/20 bg-primary/5 px-3 py-2 flex flex-wrap items-center gap-4">
                  <span className="text-sm font-semibold">합계</span>
                  <span className="text-sm">총 수량 <span className="font-mono font-semibold">{totals.qty.toLocaleString('ko-KR')}EA</span></span>
                  <span className="text-sm">총 용량 <span className="font-mono font-semibold">{totals.mw.toFixed(2)}MW</span></span>
                  <span className="text-sm">계약금액 <span className="font-mono font-semibold">${totals.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span></span>
                  <span className="text-sm">
                    KRW <span className={`font-mono font-semibold ${totalKRW ? '' : 'text-muted-foreground'}`}>
                      {totalKRW
                        ? `₩${totalKRW.toLocaleString('ko-KR')}`
                        : exchangeRate
                          ? '품목·단가를 모두 입력하면 자동계산'
                          : '환율 미입력'}
                    </span>
                  </span>
                  {totals.freeQty > 0 && (
                    <span className="text-sm text-green-700 border border-green-300 bg-green-50 rounded px-2 py-0.5">
                      무상스페어 <span className="font-mono font-semibold">{totals.freeQty.toLocaleString()}EA ({totals.freeMw.toFixed(3)}MW)</span>
                    </span>
                  )}
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

    {/* 빠른 품번 등록 미니 다이얼로그 */}
    <Dialog open={qpOpen} onOpenChange={(o) => { if (!qpSubmitting) setQpOpen(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>새 품번 빠른 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-800 leading-relaxed">
            품번을 빠르게 등록합니다.
            <span className="font-semibold"> 도구 → 품번</span>과 동일 DB에 바로 반영됩니다.
            치수·중량 등 추가 정보는 등록 후 도구 → 품번에서 보완해 주세요.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">품번코드 *</Label>
              <Input className="h-8 text-xs" placeholder={products[0]?.product_code ?? '예) 품번코드'} value={qpCode}
                onChange={(e) => setQpCode(e.target.value)} maxLength={30} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">품명 *</Label>
              <Input className="h-8 text-xs" placeholder={products[0]?.product_name ?? '예) 품명'} value={qpName}
                onChange={(e) => setQpName(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Wp *</Label>
              <Input className="h-8 text-xs" inputMode="numeric" placeholder={products[0]?.spec_wp ? String(products[0].spec_wp) : '635'} value={qpWp}
                onChange={(e) => setQpWp(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">폭 mm *</Label>
              <Input className="h-8 text-xs" inputMode="numeric" placeholder="1134" value={qpWidth}
                onChange={(e) => setQpWidth(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">높이 mm *</Label>
              <Input className="h-8 text-xs" inputMode="numeric" placeholder="2465" value={qpHeight}
                onChange={(e) => setQpHeight(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">제조사</Label>
              <Input className="h-8 text-xs bg-muted" value={mfgName || '(선택 안 됨)'} readOnly />
            </div>
          </div>
          {qpError && <p className="text-xs text-red-500">{qpError}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => setQpOpen(false)} disabled={qpSubmitting}>취소</Button>
          <Button type="button" size="sm" onClick={handleQuickProduct} disabled={qpSubmitting}>
            {qpSubmitting ? '등록 중…' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
