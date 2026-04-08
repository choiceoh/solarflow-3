import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import type { BLShipment } from '@/types/inbound';
import type { Company, Manufacturer, Product, Warehouse } from '@/types/masters';

/* ── 상수 ── */
const INBOUND_TYPES = [
  { value: 'import', label: '해외직수입' },
  { value: 'domestic', label: '국내구매' },
  { value: 'group', label: '그룹내구매' },
] as const;
type InboundTypeValue = typeof INBOUND_TYPES[number]['value'];
const typeLabel = (v: string) => INBOUND_TYPES.find(t => t.value === v)?.label ?? '';
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'FCA', 'DAP', 'DDP', 'CIP'];

/* ── 스키마 (공통, 조건 필수는 핸들러에서 검증) ── */
const schema = z.object({
  inbound_type: z.string().min(1, '입고유형은 필수입니다'),
  bl_number: z.string().optional(),
  manufacturer_id: z.string().optional(),
  exchange_rate: z.string().optional(),
  etd: z.string().optional(),
  eta: z.string().optional(),
  actual_arrival: z.string().optional(),
  port: z.string().optional(),
  forwarder: z.string().optional(),
  warehouse_id: z.string().optional(),
  invoice_number: z.string().optional(),
  incoterms: z.string().optional(),
  memo: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

/* ── 라인아이템 ── */
interface LineItem {
  product_id: string;
  po_line_id?: string; // D-087: PO 발주품목 연결 (자동채움 시)
  quantity: string;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  unit_price: string;
  manualInvoice: boolean;
  invoiceOverride: string;
}
const emptyLine = (): LineItem => ({
  product_id: '', quantity: '', item_type: 'main', payment_type: 'paid',
  unit_price: '', manualInvoice: false, invoiceOverride: '',
});

/* ── 해외직수입 결제조건 — 계약금 % + 잔금 기간 (30/45/60/90/120/180) ── */
const IMPORT_BALANCE_DAYS = ['30', '45', '60', '90', '120', '180'] as const;
type ImportBalanceDay = typeof IMPORT_BALANCE_DAYS[number];
interface ImportPT {
  hasDeposit: boolean;
  depositMethod: 'tt' | 'lc';
  depositPercent: string;      // 총구매금액 × %
  depositSplits: string[];     // 분할 시 각 행 금액
  balanceDays: ImportBalanceDay;
}
const defaultImportPT = (): ImportPT => ({
  hasDeposit: false, depositMethod: 'tt', depositPercent: '', depositSplits: [], balanceDays: '90',
});
function composeImportPT(pt: ImportPT, totalAmount: number): string {
  const bal = `잔금 L/C ${pt.balanceDays}days`;
  if (pt.hasDeposit && pt.depositPercent) {
    const m = pt.depositMethod === 'tt' ? 'T/T' : 'L/C';
    const pct = pt.depositPercent;
    const amt = totalAmount ? Math.round(totalAmount * (parseFloat(pct) / 100)) : 0;
    const splitStr = pt.depositSplits.length
      ? ` (분할 ${pt.depositSplits.filter(Boolean).length}회)` : '';
    return `계약금 ${pct}% ${m} ${amt.toLocaleString('en-US')}${splitStr}, ${bal}`;
  }
  return bal;
}
function parseImportPT(text: string): ImportPT {
  const dep = text.match(/계약금\s*([\d.]+)%?\s*(T\/T|L\/C)/i);
  const bal = text.match(/L\/C\s*(\d+)\s*days?/i);
  const days = (bal?.[1] ?? '90') as string;
  return {
    hasDeposit: !!dep,
    depositMethod: dep?.[2]?.toUpperCase() === 'L/C' ? 'lc' : 'tt',
    depositPercent: dep?.[1] ?? '',
    depositSplits: [],
    balanceDays: (IMPORT_BALANCE_DAYS.includes(days as ImportBalanceDay) ? days : '90') as ImportBalanceDay,
  };
}

/* ── 국내구매 결제조건 — 선입금(%/금액) + 잔금 3가지 옵션 ──
 * 선입금: percent 또는 amount 모드. 0이면 전액 신용거래.
 * 잔금: days5(5단위 30~120), manual(수기 일수), month(익월말/익익월말/익익익월말)
 */
const DOMESTIC_DAYS5 = Array.from({ length: 19 }, (_, i) => String(30 + i * 5)); // 30,35,...,120
type DomesticBalanceMode = 'days5' | 'manual' | 'month';
type MonthOffset = '1' | '2' | '3';
interface DomesticPT {
  prepayMode: 'percent' | 'amount';
  prepayValue: string;          // % 또는 원
  balanceMode: DomesticBalanceMode;
  balanceDays: string;          // days5 또는 manual 일수
  monthOffset: MonthOffset;     // 1/2/3 = 익월말/익익월말/익익익월말
}
const defaultDomesticPT = (): DomesticPT => ({
  prepayMode: 'amount', prepayValue: '', balanceMode: 'days5', balanceDays: '60', monthOffset: '1',
});
function monthLabel(o: MonthOffset): string {
  return o === '1' ? '익월말' : o === '2' ? '익익월말' : '익익익월말';
}
function composeDomesticPT(pt: DomesticPT, totalAmount: number): string {
  const prepayAmt = pt.prepayMode === 'percent'
    ? Math.round(totalAmount * (parseFloat(pt.prepayValue || '0') / 100))
    : parseInt(pt.prepayValue || '0');
  const prepayStr = prepayAmt > 0
    ? `선입금 ${prepayAmt.toLocaleString('ko-KR')}원${pt.prepayMode === 'percent' ? ` (${pt.prepayValue}%)` : ''}`
    : '전액';
  const balStr = pt.balanceMode === 'days5' || pt.balanceMode === 'manual'
    ? `잔금 신용거래 ${pt.balanceDays}일`
    : `잔금 ${monthLabel(pt.monthOffset)}`;
  return `${prepayStr} + ${balStr}`;
}
function parseDomesticPT(text: string): DomesticPT {
  const amtM = text.match(/선입금\s*([\d,]+)\s*원/);
  const pctM = text.match(/\((\d+(?:\.\d+)?)%\)/);
  const daysM = text.match(/신용거래\s*(\d+)\s*일/);
  const monthM = text.match(/(익익익월말|익익월말|익월말)/);
  const base: DomesticPT = defaultDomesticPT();
  if (amtM) {
    base.prepayValue = pctM ? pctM[1] : amtM[1].replace(/,/g, '');
    base.prepayMode = pctM ? 'percent' : 'amount';
  }
  if (daysM) {
    const d = daysM[1];
    base.balanceMode = DOMESTIC_DAYS5.includes(d) ? 'days5' : 'manual';
    base.balanceDays = d;
  } else if (monthM) {
    base.balanceMode = 'month';
    base.monthOffset = monthM[1] === '익월말' ? '1' : monthM[1] === '익익월말' ? '2' : '3';
  }
  return base;
}
function calcMonthEndDue(deliveryDate: string, offset: MonthOffset): string {
  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}/.test(deliveryDate)) return '';
  const d = new Date(deliveryDate);
  if (isNaN(d.getTime())) return '';
  // 납품월 + offset → 해당 월의 말일
  const target = new Date(d.getFullYear(), d.getMonth() + parseInt(offset) + 1, 0);
  return target.toISOString().slice(0, 10);
}

/* ── 날짜 입력 정규화: 20260407 → 2026-04-07 ── */
function normDate8(v: string): string {
  if (!v) return v;
  const digits = v.replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return v;
}

/* ── Enter 키로 다음 입력 필드 포커스 이동 ── */
function focusNextInput(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const form = (e.currentTarget as HTMLInputElement).form;
  if (!form) return;
  const focusables = Array.from(
    form.querySelectorAll<HTMLElement>('input, select, textarea, button'),
  ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1);
  const idx = focusables.indexOf(e.currentTarget);
  const next = focusables[idx + 1];
  if (next) next.focus();
}

/* ── 만기일 계산 (납품일 + N일) ── */
function calcDueDate(deliveryDate: string, days: number): string {
  if (!deliveryDate || !/^\d{4}-\d{2}-\d{2}/.test(deliveryDate)) return '';
  const d = new Date(deliveryDate);
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ── 헬퍼 컴포넌트 ── */
function Txt({ text, placeholder = '선택' }: { text: string; placeholder?: string }) {
  return (
    <span className={`flex flex-1 text-left truncate ${text ? '' : 'text-muted-foreground'}`} data-slot="select-value">
      {text || placeholder}
    </span>
  );
}
function Req({ children }: { children: React.ReactNode }) {
  return <Label className="text-blue-600 font-medium">{children} *</Label>;
}
function Opt({ children }: { children: React.ReactNode }) {
  return <Label>{children}</Label>;
}

/* ── Props ── */
/** PO 요약 (드롭다운 + 자동채움용) */
interface POSummary {
  po_id: string;
  po_number: string;
  company_id: string;
  manufacturer_id: string;
  manufacturer_name?: string;
  currency?: 'USD' | 'KRW';
  total_capacity_mw?: number;
  status?: string;
  incoterms?: string | null;
  payment_terms?: string | null;
}
interface POLineSummary {
  po_line_id?: string;
  product_id: string;
  quantity?: number;
  unit_price_usd?: number;     // $/EA (DB 컬럼)
  unit_price_usd_wp?: number;  // $/Wp (있을 수도 있음)
  unit_price_krw_wp?: number;
  item_type?: 'main' | 'spare';
  payment_type?: 'paid' | 'free';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BLShipment | null;
  /** PO 상세에서 입고 등록 시 사전 연결 (D-085) */
  presetPOId?: string | null;
}

export default function BLForm({ open, onOpenChange, onSubmit, editData, presetPOId }: Props) {
  const globalCompanyId = useAppStore((s) => s.selectedCompanyId);
  const storeCompanies = useAppStore((s) => s.companies);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  /* Select 상태 (watch 타이밍 이슈 방지) */
  const [selType, setSelType] = useState<InboundTypeValue | ''>('');
  const [selCompanyId, setSelCompanyId] = useState('');
  const [selMfgId, setSelMfgId] = useState('');
  const [selWhId, setSelWhId] = useState('');
  const [counterpartId, setCounterpartId] = useState('');
  const [autoNumber, setAutoNumber] = useState('');

  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [priceMode, setPriceMode] = useState<'cents' | 'dollar'>('cents');
  const [importPT, setImportPT] = useState<ImportPT>(defaultImportPT());
  const [domesticPT, setDomesticPT] = useState<DomesticPT>(defaultDomesticPT());
  const [bafCaf, setBafCaf] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(''); // 만기일 계산용 (actual_arrival 미러)
  const [exchangeRateLive, setExchangeRateLive] = useState(''); // 환율 실시간 미러 (KRW 재계산용)
  // D-085/D-087: PO 연결 — 드롭다운 + 자동 채움 + 잔여량
  const [poList, setPoList] = useState<POSummary[]>([]);
  const [selPOId, setSelPOId] = useState<string>('');
  const [poRemaining, setPoRemaining] = useState<{ contractedMw: number; shippedMw: number; remainMw: number } | null>(null);
  const [autofilled, setAutofilled] = useState<boolean>(false); // 자동채움 여부 표시 (bg-muted 적용용)
  const [submitError, setSubmitError] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, reset, setValue, getValues, watch, formState: { isSubmitting, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });
  // 수정 모드 — 변경사항 감지 (RHF isDirty + 보조 state 변경 감지)
  watch(); // watch all → 이 컴포넌트가 폼 변화에 리렌더
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const currentSnapshot = JSON.stringify({
    selType, selCompanyId, selMfgId, selWhId, counterpartId,
    importPT, domesticPT, bafCaf,
  });
  const isDirtyAll = editData
    ? (isDirty || currentSnapshot !== initialSnapshot)
    : true;

  const isImport = selType === 'import';
  const isDomestic = selType === 'domestic';
  const isGroup = selType === 'group';
  const currencyLabel = isImport ? 'USD' : 'KRW';

  /* ── 마스터 데이터 로드 ── */
  useEffect(() => {
    if (storeCompanies.length) setCompanies(storeCompanies);
    else fetchWithAuth<Company[]>('/api/v1/companies')
      .then(list => setCompanies(list.filter(c => c.is_active))).catch(() => {});
    fetchWithAuth<Manufacturer[]>('/api/v1/manufacturers')
      .then(list => setManufacturers(list.filter(m => m.is_active))).catch(() => {});
    fetchWithAuth<Warehouse[]>('/api/v1/warehouses')
      .then(list => setWarehouses(list.filter(w => w.is_active))).catch(() => {});
  }, [storeCompanies]);

  /* 제조사 → 품번 */
  useEffect(() => {
    if (!selMfgId) { setProducts([]); return; }
    fetchWithAuth<Product[]>(`/api/v1/products?manufacturer_id=${selMfgId}`)
      .then(list => setProducts(list.filter(p => p.is_active)))
      .catch(() => setProducts([]));
  }, [selMfgId]);

  /* D-085: PO 목록 로드 (연결 드롭다운용) */
  useEffect(() => {
    if (!open || editData) return;
    fetchWithAuth<POSummary[]>('/api/v1/pos')
      .then(list => setPoList(list ?? []))
      .catch(() => setPoList([]));
  }, [open, editData]);

  /* PO 선택 → 입고 폼 자동 채움 (D-087)
   * 자동 채움: manufacturer_id, company_id, currency, incoterms, payment_terms.
   * BL 라인은 PO 발주품목에서 product_id/단가/구분 복사 + po_line_id 연결.
   */
  const applyPOAutofill = useCallback(async (poId: string) => {
    if (!poId) return;
    // GET /api/v1/pos/{id} — 전체 상세 (currency, payment_terms 포함)
    let po: POSummary | undefined;
    try {
      po = await fetchWithAuth<POSummary>(`/api/v1/pos/${poId}`);
    } catch {
      po = poList.find(p => p.po_id === poId);
    }
    if (!po) return;
    // 입고 유형: USD면 해외직수입, KRW면 국내구매로 기본 추정
    const inferType: InboundTypeValue = po.currency === 'KRW' ? 'domestic' : 'import';
    setSelType(inferType);
    setValue('inbound_type', inferType);
    setSelCompanyId(po.company_id);
    setSelMfgId(po.manufacturer_id);
    setValue('manufacturer_id', po.manufacturer_id);
    if (po.incoterms) setValue('incoterms', po.incoterms);
    if (po.payment_terms && inferType === 'import') {
      setImportPT(parseImportPT(po.payment_terms));
    } else if (po.payment_terms && inferType === 'domestic') {
      setDomesticPT(parseDomesticPT(po.payment_terms));
    }
    setAutofilled(true);
    // PO 잔여량 계산 (D-061: 프론트 계산) — 동일 PO의 모든 BL 라인 수량 합산
    try {
      const bls = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?po_id=${poId}`);
      let shippedKw = 0;
      for (const bl of bls ?? []) {
        try {
          const blLines = await fetchWithAuth<{ capacity_kw?: number }[]>(`/api/v1/bls/${bl.bl_id}/lines`);
          for (const ln of blLines ?? []) shippedKw += ln.capacity_kw ?? 0;
        } catch { /* skip */ }
      }
      const contractedMw = po.total_capacity_mw ?? 0;
      const shippedMw = shippedKw / 1000;
      setPoRemaining({ contractedMw, shippedMw, remainMw: Math.max(0, contractedMw - shippedMw) });
    } catch {
      setPoRemaining(null);
    }
    // PO 라인 조회 → 입고품목 프리셋 (수량 비움, 단가/po_line_id 복사)
    try {
      const lines = await fetchWithAuth<POLineSummary[]>(`/api/v1/pos/${poId}/lines`);
      if (Array.isArray(lines) && lines.length > 0) {
        // 단가 우선순위: unit_price_usd_wp ($/Wp) → unit_price_usd ($/EA, 변환 필요는 spec_wp 알아야 하므로 일단 그대로)
        setLines(lines.map(l => ({
          product_id: l.product_id,
          po_line_id: l.po_line_id,
          quantity: '',
          item_type: l.item_type ?? 'main',
          payment_type: l.payment_type ?? 'paid',
          unit_price: inferType === 'import'
            ? (l.unit_price_usd_wp != null
                ? String(l.unit_price_usd_wp * 100) // ¢/Wp 모드
                : '')
            : (l.unit_price_krw_wp != null ? String(Math.round(l.unit_price_krw_wp)) : ''),
          manualInvoice: false,
          invoiceOverride: '',
        })));
      }
    } catch { /* PO 라인 조회 실패 시 빈 입고품목 유지 */ }
  }, [poList, setValue]);

  /* presetPOId (PO 상세에서 진입) → 자동 적용 */
  useEffect(() => {
    if (!open || editData || !presetPOId || poList.length === 0) return;
    setSelPOId(presetPOId);
    applyPOAutofill(presetPOId);
  }, [open, editData, presetPOId, poList, applyPOAutofill]);

  /* ── 자동채번 ── */
  const genAutoNumber = useCallback(async (prefix: string) => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const pat = `${prefix}${today}-`;
    try {
      const bls = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?company_id=${selCompanyId}`);
      const maxSeq = bls.reduce((mx, bl) => {
        if (!bl.bl_number?.startsWith(pat)) return mx;
        const s = parseInt(bl.bl_number.split('-').pop() || '0');
        return isNaN(s) ? mx : Math.max(mx, s);
      }, 0);
      setAutoNumber(`${pat}${String(maxSeq + 1).padStart(3, '0')}`);
    } catch { setAutoNumber(`${pat}001`); }
  }, [selCompanyId]);

  // 국내구매: 제조사 변경 시 — 고정 접두사 "DM"
  useEffect(() => {
    if (selType !== 'domestic' || !selMfgId || !selCompanyId || editData) return;
    genAutoNumber('DM');
  }, [selType, selMfgId, selCompanyId, genAutoNumber, editData]);

  // 그룹내구매: 법인 변경 시 — 고정 접두사 "TS"
  useEffect(() => {
    if (selType !== 'group' || !selCompanyId || editData) return;
    genAutoNumber('TS');
  }, [selType, selCompanyId, genAutoNumber, editData]);

  /* ── 핸들러 ── */
  const handleTypeChange = useCallback((v: string | null) => {
    const val = (v ?? '') as InboundTypeValue | '';
    setSelType(val);
    setValue('inbound_type', val);
    setAutoNumber('');
  }, [setValue]);

  const handleCompanyChange = useCallback((v: string | null) => {
    setSelCompanyId(v ?? '');
  }, []);

  const handleMfgChange = useCallback((v: string | null) => {
    const id = v ?? '';
    setSelMfgId(id);
    setValue('manufacturer_id', id);
    setLines(prev => prev.map(l => ({ ...l, product_id: '' })));
  }, [setValue]);

  const handleWhChange = useCallback((v: string | null) => {
    const id = v ?? '';
    setSelWhId(id);
    setValue('warehouse_id', id);
  }, [setValue]);

  /* ── 폼 초기화 ── */
  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    setPriceMode('cents');
    if (editData) {
      const d = editData;
      setSelType(d.inbound_type as InboundTypeValue);
      setSelCompanyId(d.company_id);
      setSelMfgId(d.manufacturer_id);
      setSelWhId(d.warehouse_id ?? '');
      setAutoNumber(d.bl_number);
      setBafCaf(/BAF\s*\/\s*CAF/i.test(d.incoterms ?? ''));
      setDeliveryDate(d.actual_arrival?.slice(0, 10) ?? '');
      setExchangeRateLive(d.exchange_rate != null ? String(d.exchange_rate) : '');
      // 초기 스냅샷 — 변경사항 비교 기준
      const initImportPT = d.inbound_type === 'import' ? parseImportPT(d.payment_terms ?? '') : defaultImportPT();
      const initDomesticPT = d.inbound_type === 'domestic' ? parseDomesticPT(d.payment_terms ?? '') : defaultDomesticPT();
      setInitialSnapshot(JSON.stringify({
        selType: d.inbound_type,
        selCompanyId: d.company_id,
        selMfgId: d.manufacturer_id,
        selWhId: d.warehouse_id ?? '',
        counterpartId: '',
        importPT: initImportPT,
        domesticPT: initDomesticPT,
        bafCaf: /BAF\s*\/\s*CAF/i.test(d.incoterms ?? ''),
      }));
      if (d.inbound_type === 'import') setImportPT(parseImportPT(d.payment_terms ?? ''));
      else if (d.inbound_type === 'domestic') setDomesticPT(parseDomesticPT(d.payment_terms ?? ''));
      reset({
        inbound_type: d.inbound_type,
        bl_number: d.bl_number,
        manufacturer_id: d.manufacturer_id,
        exchange_rate: d.exchange_rate != null ? String(d.exchange_rate) : '',
        etd: d.etd?.slice(0, 10) ?? '', eta: d.eta?.slice(0, 10) ?? '',
        actual_arrival: d.actual_arrival?.slice(0, 10) ?? '',
        port: d.port ?? '', forwarder: d.forwarder ?? '',
        warehouse_id: d.warehouse_id ?? '', invoice_number: d.invoice_number ?? '',
        incoterms: d.incoterms ?? '', memo: d.memo ?? '',
      });
    } else {
      const cid = globalCompanyId && globalCompanyId !== 'all' ? globalCompanyId : '';
      setSelType(''); setSelCompanyId(cid); setSelMfgId(''); setSelWhId('');
      setCounterpartId(''); setAutoNumber(''); setImportPT(defaultImportPT()); setDomesticPT(defaultDomesticPT());
      setBafCaf(false); setDeliveryDate(''); setExchangeRateLive(''); setSelPOId('');
      setAutofilled(false); setPoRemaining(null);
      reset({
        inbound_type: '', bl_number: '', manufacturer_id: '',
        exchange_rate: '', etd: '', eta: '', actual_arrival: '',
        port: '', forwarder: '', warehouse_id: '', invoice_number: '',
        incoterms: '', memo: '',
      });
      setLines([emptyLine()]);
    }
  }, [open, editData, reset, globalCompanyId]);

  /* ── 라인아이템 ── */
  const updateLine = (i: number, f: keyof LineItem, v: string | boolean) =>
    setLines(prev => prev.map((l, j) => j === i ? { ...l, [f]: v } : l));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.length <= 1 ? prev : prev.filter((_, j) => j !== i));

  const productLabel = (pid: string) => {
    const p = products.find(x => x.product_id === pid);
    return p ? `${p.product_code} | ${p.product_name} | ${p.spec_wp}Wp` : '';
  };
  const calcKw = (l: LineItem) => {
    const q = Number(l.quantity);
    const p = products.find(x => x.product_id === l.product_id);
    return (!q || !p) ? '-' : ((q * p.spec_wp) / 1000).toFixed(2);
  };
  // 인보이스 자동 계산: 수량 × 규격Wp × 단가($/Wp or ₩/Wp)
  const calcInvoice = (l: LineItem): number | null => {
    const q = Number(l.quantity);
    const p = products.find(x => x.product_id === l.product_id);
    const rawPrice = l.unit_price ? parseFloat(l.unit_price) : 0;
    if (!q || !p || !rawPrice) return null;
    const pricePerWp = (isImport && priceMode === 'cents') ? rawPrice / 100 : rawPrice;
    return q * p.spec_wp * pricePerWp;
  };
  const fmtInvoice = (l: LineItem): string => {
    const v = calcInvoice(l);
    if (v == null) return '-';
    return isImport ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` :
      `${v.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}원`;
  };

  /* ¢↔$ 토글 */
  const togglePriceMode = () => {
    setPriceMode(prev => {
      const next = prev === 'cents' ? 'dollar' : 'cents';
      setLines(ls => ls.map(l => {
        if (!l.unit_price) return l;
        const v = parseFloat(l.unit_price);
        if (isNaN(v)) return l;
        const conv = next === 'cents' ? v * 100 : v / 100;
        return { ...l, unit_price: parseFloat(conv.toPrecision(8)).toString() };
      }));
      return next;
    });
  };

  /* ── 제출 — getValues()로 직접 읽기 (handleSubmit/zod 우회하여 데이터 누락 방지) ── */
  const handle = async () => {
    setSubmitError('');
    const data = getValues();

    // 조건부 필수 검증
    if (!selCompanyId) { setSubmitError('구매법인을 선택해주세요'); return; }
    if (isImport && !data.bl_number) { setSubmitError('B/L 번호는 필수입니다'); return; }
    if ((isDomestic || isGroup) && !autoNumber) { setSubmitError('입고번호가 생성되지 않았습니다'); return; }
    if (!selMfgId) { setSubmitError('공급사를 선택해주세요'); return; }
    // 실제입항일/납품일: 신규 등록 시에만 강제. 기존 데이터 수정 시에는 빈 값 허용.
    if (!editData && isImport && !data.actual_arrival) { setSubmitError('실제입항일은 필수입니다'); return; }
    if (!editData && isDomestic && !data.actual_arrival) { setSubmitError('납품일은 필수입니다'); return; }
    if (isGroup && !counterpartId) { setSubmitError('상대법인을 선택해주세요'); return; }
    // 신규 등록일 때만 라인 검증 + capacity_kw 안전체크
    if (!editData) {
      const validLinesCheck = lines.filter(l => l.product_id && Number(l.quantity) > 0);
      if (validLinesCheck.length === 0) { setSubmitError('입고 품목을 최소 1개 이상 입력해주세요'); return; }
      // 모든 line의 product가 products 리스트에 로드돼 있는지 확인 (capacity_kw=0 방지)
      const missingProd = validLinesCheck.find(l => !products.find(p => p.product_id === l.product_id));
      if (missingProd) { setSubmitError('품번 정보가 로드되지 않았습니다. 잠시 후 다시 시도해주세요'); return; }
    }

    // 수정 모드: 라인은 별도 화면에서 관리하므로 헤더만 업데이트
    const validLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);

    const blNumber = isImport ? (data.bl_number ?? '') : autoNumber;
    const exRate = data.exchange_rate ? parseFloat(data.exchange_rate) : undefined;

    // 결제조건 계산용 총 구매금액
    const totalAmountForPT = validLines.reduce((s, l) => s + (calcInvoice(l) || 0), 0);

    const payload: Record<string, unknown> = {
      bl_id: editData?.bl_id,
      bl_number: blNumber,
      po_id: selPOId || undefined,
      inbound_type: selType,
      company_id: selCompanyId,
      manufacturer_id: selMfgId || undefined,
      counterpart_company_id: isGroup ? counterpartId : undefined,
      currency: isImport ? 'USD' : 'KRW',
      exchange_rate: isImport && exRate && !isNaN(exRate) ? exRate : undefined,
      status: editData?.status ?? 'scheduled',
      payment_terms: isImport ? composeImportPT(importPT, totalAmountForPT) : isDomestic ? composeDomesticPT(domesticPT, totalAmountForPT) : undefined,
      etd: isImport && data.etd ? data.etd : undefined,
      eta: isImport && data.eta ? data.eta : undefined,
      actual_arrival: data.actual_arrival || undefined,
      port: isImport && data.port ? data.port : undefined,
      forwarder: isImport && data.forwarder ? data.forwarder : undefined,
      invoice_number: isImport && data.invoice_number ? data.invoice_number : undefined,
      incoterms: isImport && data.incoterms
        ? (bafCaf && !/BAF\s*\/\s*CAF/i.test(data.incoterms) ? `${data.incoterms} (BAF/CAF 포함)` : data.incoterms)
        : undefined,
      warehouse_id: selWhId || undefined,
      memo: data.memo || undefined,
      // 수정 모드에서는 lines 미포함 (별도 화면에서 관리)
      lines: editData ? undefined : validLines
        .map(l => {
          const prod = products.find(p => p.product_id === l.product_id);
          const qty = Number(l.quantity);
          let price = l.unit_price ? parseFloat(l.unit_price) : undefined;
          if (isImport && priceMode === 'cents' && price) price = price / 100;
          const inv = l.manualInvoice && l.invoiceOverride
            ? parseFloat(l.invoiceOverride) : calcInvoice(l);
          return {
            product_id: l.product_id,
            po_line_id: l.po_line_id || undefined, // D-087: PO 발주품목 연결
            quantity: qty,
            capacity_kw: prod ? (qty * prod.spec_wp) / 1000 : 0,
            item_type: l.item_type, payment_type: l.payment_type,
            usage_category: 'sale',
            invoice_amount_usd: isImport && inv ? inv : undefined,
            invoice_amount_krw: !isImport && inv ? inv : undefined,
            unit_price_usd_wp: isImport ? (price && !isNaN(price) ? price : undefined) : undefined,
            unit_price_krw_wp: !isImport ? (price && !isNaN(price) ? price : undefined) : undefined,
          };
        }),
    };
    // undefined 필드 정리
    Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });

    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '저장에 실패했습니다');
    }
  };

  /* ── 총 구매금액 (결제조건 계산용) ── */
  const totalInvoiceBase = lines.reduce((s, l) => s + (calcInvoice(l) || 0), 0);
  const exRateNum = exchangeRateLive ? parseFloat(exchangeRateLive) : 0;
  const totalUSD = isImport ? totalInvoiceBase : 0;
  const totalKRW = isImport
    ? (exRateNum ? Math.round(totalInvoiceBase * exRateNum) : 0)
    : totalInvoiceBase;
  // 결제조건 % 계산의 기준: import=USD, domestic=KRW
  const totalForPT = isImport ? totalUSD : totalKRW;

  /* ── 렌더 ── */
  const mfgName = manufacturers.find(m => m.manufacturer_id === selMfgId)?.name_kr ?? '';
  const coName = companies.find(c => c.company_id === selCompanyId)?.company_name ?? '';
  const whName = warehouses.find(w => w.warehouse_id === selWhId)?.warehouse_name ?? '';
  const cpName = companies.find(c => c.company_id === counterpartId)?.company_name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[82vw] sm:max-w-[82vw] max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader className="pb-1">
          <DialogTitle>{editData ? '입고수정' : '입고등록'}</DialogTitle>
        </DialogHeader>

        {submitError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
            {submitError}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); handle(); }}
          onKeyDown={(e) => {
            // Enter 키로 폼 제출 방지 (Textarea 제외) — 저장 버튼 클릭 시에만 제출
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          className="space-y-3"
        >

          {/* ── D-085: PO 연결 (선택사항) ── */}
          {!editData && (
            <div className="max-w-md space-y-1.5">
              <Label className="text-muted-foreground">P/O 연결 (선택사항)</Label>
              <Select value={selPOId || 'none'} onValueChange={(v) => {
                const val = v === 'none' ? '' : (v ?? '');
                setSelPOId(val);
                if (val) {
                  applyPOAutofill(val);
                } else {
                  setAutofilled(false);
                  setPoRemaining(null);
                }
              }}>
                <SelectTrigger className="w-full">
                  <Txt text={(() => {
                    if (!selPOId) return '';
                    const po = poList.find(p => p.po_id === selPOId);
                    return po ? `${po.po_number} | ${po.manufacturer_name ?? ''} | ${po.total_capacity_mw?.toFixed(1) ?? '-'}MW | ${po.status ?? ''}` : '';
                  })()} placeholder="과거/긴급 입고는 미선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">미선택 (수기 입력)</SelectItem>
                  {poList.map(p => (
                    <SelectItem key={p.po_id} value={p.po_id}>
                      {p.po_number} | {p.manufacturer_name ?? '—'} | {p.total_capacity_mw?.toFixed(1) ?? '-'}MW | {p.status ?? ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selPOId && (
                <p className="text-[10px] text-muted-foreground">
                  PO 정보가 자동 채움됨. Incoterms/결제조건은 수정 가능.
                  {poRemaining && (
                    <> · 계약 {poRemaining.contractedMw.toFixed(1)}MW · 선적 {poRemaining.shippedMw.toFixed(1)}MW ·{' '}
                      <span className="text-foreground font-medium">잔여 {poRemaining.remainMw.toFixed(1)}MW</span>
                    </>
                  )}
                </p>
              )}
            </div>
          )}

          {/* ── 입고유형 (항상 첫번째) ── */}
          <div className="max-w-xs">
            <Req>입고 구분</Req>
            <Select value={selType} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-full mt-1.5">
                <Txt text={typeLabel(selType)} placeholder="입고유형을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {INBOUND_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ── 유형 선택 후 나머지 폼 ── */}
          {selType && (
            <>
              {/* 기본 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* B/L번호 (해외직수입만) / 자동채번 표시 (국내/그룹) */}
                {isImport && (
                  <div className="space-y-1.5">
                    <Req>B/L 번호</Req>
                    <Input {...register('bl_number')} placeholder="SOLARBL-2026-001" />
                  </div>
                )}
                {(isDomestic || isGroup) && (
                  <div className="space-y-1.5">
                    <Opt>입고번호 (자동)</Opt>
                    <Input value={autoNumber} readOnly className="bg-muted" placeholder="제조사/법인 선택 시 자동생성" />
                  </div>
                )}

                {/* 구매법인 — D-087: PO 자동채움 시 잠금 */}
                <div className="space-y-1.5">
                  <Req>구매법인</Req>
                  <Select value={selCompanyId} onValueChange={handleCompanyChange} disabled={autofilled}>
                    <SelectTrigger className={`w-full ${autofilled ? 'bg-muted' : ''}`}><Txt text={coName} /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 공급사 — D-087: PO 자동채움 시 잠금 */}
                <div className="space-y-1.5">
                    <Req>공급사</Req>
                    <Select value={selMfgId} onValueChange={handleMfgChange} disabled={autofilled}>
                      <SelectTrigger className={`w-full ${autofilled ? 'bg-muted' : ''}`}><Txt text={mfgName} /></SelectTrigger>
                      <SelectContent>
                        {manufacturers.map(m => (
                          <SelectItem key={m.manufacturer_id} value={m.manufacturer_id}>{m.name_kr}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                {/* 상대법인 (그룹만) */}
                {isGroup && (
                  <div className="space-y-1.5">
                    <Req>상대법인</Req>
                    <Select value={counterpartId} onValueChange={(v) => setCounterpartId(v ?? '')}>
                      <SelectTrigger className="w-full"><Txt text={cpName} /></SelectTrigger>
                      <SelectContent>
                        {companies.filter(c => c.company_id !== selCompanyId).map(c => (
                          <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* 날짜/물류 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {isImport && (
                  <>
                    <div className="space-y-1.5">
                      <Opt>ETD</Opt>
                      <Input type="text" placeholder="YYYY-MM-DD 또는 20260407" onKeyDown={focusNextInput}
                        {...register('etd', { onBlur: (e) => setValue('etd', normDate8(e.target.value)) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Opt>ETA</Opt>
                      <Input type="text" placeholder="YYYY-MM-DD 또는 20260407" onKeyDown={focusNextInput}
                        {...register('eta', { onBlur: (e) => setValue('eta', normDate8(e.target.value)) })} />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  {isImport || isDomestic
                    ? <Req>{isImport ? '실제입항일' : '납품일'}</Req>
                    : <Opt>입고일</Opt>}
                  <Input type="text" placeholder="YYYY-MM-DD 또는 20260407" onKeyDown={focusNextInput}
                    {...register('actual_arrival', {
                      onBlur: (e) => {
                        const v = normDate8(e.target.value);
                        setValue('actual_arrival', v);
                        setDeliveryDate(v);
                      },
                    })} />
                </div>
                {isImport && (
                  <>
                    <div className="space-y-1.5">
                      <Opt>환율 (USD→KRW)</Opt>
                      <Input {...register('exchange_rate')} inputMode="decimal" placeholder="예: 1450.30"
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9.]/g, '');
                          setValue('exchange_rate', v);
                          setExchangeRateLive(v); // 입고품목 KRW 실시간 재계산
                        }} />
                    </div>
                    <div className="space-y-1.5">
                      <Opt>선적조건 (인코텀즈)</Opt>
                      <Input {...register('incoterms')} list="bl-incoterms" placeholder="FOB, CIF 등" />
                      <datalist id="bl-incoterms">{INCOTERMS.map(t => <option key={t} value={t} />)}</datalist>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                        <input type="checkbox" checked={bafCaf} onChange={(e) => setBafCaf(e.target.checked)} />
                        BAF/CAF 포함
                      </label>
                    </div>
                    <div className="space-y-1.5"><Opt>항구</Opt><Input {...register('port')} placeholder="광양항" /></div>
                    <div className="space-y-1.5"><Opt>포워더</Opt><Input {...register('forwarder')} /></div>
                    <div className="space-y-1.5"><Opt>Invoice No.</Opt><Input {...register('invoice_number')} /></div>
                  </>
                )}
                <div className="space-y-1.5">
                  <Opt>입고 창고</Opt>
                  <Select value={selWhId} onValueChange={handleWhChange}>
                    <SelectTrigger className="w-full"><Txt text={whName} /></SelectTrigger>
                    <SelectContent>
                      {warehouses.map(w => (
                        <SelectItem key={w.warehouse_id} value={w.warehouse_id}>{w.warehouse_name} ({w.location_name})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 결제조건은 입고품목+총구매금액 아래로 이동 */}

              {/* 메모 */}
              <div className="max-w-lg space-y-1.5">
                <Opt>메모</Opt>
                <Textarea {...register('memo')} rows={2} />
              </div>

              {/* ── 입고 품목 ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Label className="text-sm font-semibold">입고 품목</Label>
                  <div className="flex-1" />
                  <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={!selMfgId}>
                    <Plus className="mr-1 h-3.5 w-3.5" />추가
                  </Button>
                </div>

                {!selMfgId && (
                  <p className="text-xs text-muted-foreground">공급사를 먼저 선택하세요</p>
                )}

                {selMfgId && (
                  <div className="space-y-3">
                    {lines.map((line, idx) => (
                      <div key={idx} className="rounded-md border p-2 space-y-2">
                        {/* 1행: 품번 + 수량 + 구분 + 삭제 */}
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="flex-1 min-w-[200px] space-y-1">
                            <span className="text-[10px] text-blue-600 font-medium">품번 *</span>
                            <Select value={line.product_id} onValueChange={v => updateLine(idx, 'product_id', v ?? '')}>
                              <SelectTrigger className="w-full h-9 text-xs">
                                <Txt text={productLabel(line.product_id)} placeholder="품번 선택" />
                              </SelectTrigger>
                              <SelectContent className="min-w-[min(500px,calc(100vw-3rem))]">
                                {products.map(p => (
                                  <SelectItem key={p.product_id} value={p.product_id}>
                                    {p.product_code} | {p.product_name} | {p.spec_wp}Wp
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-24 space-y-1">
                            <span className="text-[10px] text-blue-600 font-medium">수량EA *</span>
                            <Input className="h-9 text-xs" inputMode="numeric" value={line.quantity} placeholder="0"
                              onChange={e => updateLine(idx, 'quantity', e.target.value.replace(/[^0-9]/g, ''))} />
                          </div>
                          <div className="w-24 space-y-1">
                            <span className="text-[10px] text-blue-600 font-medium">구분 *</span>
                            <Select value={line.item_type} onValueChange={v => updateLine(idx, 'item_type', v ?? 'main')}>
                              <SelectTrigger className="w-full h-9 text-xs">
                                <Txt text={line.item_type === 'main' ? '본품' : '스페어'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="main">본품</SelectItem>
                                <SelectItem value="spare">스페어</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                            onClick={() => removeLine(idx)} disabled={lines.length <= 1}>
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                        {/* 2행: 유무상 + 단가 + 인보이스(자동) + [인보이스KRW(import만)] + 용량 */}
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="w-24 space-y-1">
                            <span className="text-[10px] text-blue-600 font-medium">유무상 *</span>
                            <Select value={line.payment_type} onValueChange={v => updateLine(idx, 'payment_type', v ?? 'paid')}>
                              <SelectTrigger className="w-full h-9 text-xs">
                                <Txt text={line.payment_type === 'paid' ? '유상' : '무상'} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="paid">유상</SelectItem>
                                <SelectItem value="free">무상</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="w-40 space-y-1">
                            <span className="text-[10px] text-blue-600 font-medium">
                              {isImport ? (priceMode === 'cents' ? '단가(¢/Wp) *' : '단가($/Wp) *') : '단가(원/Wp) *'}
                            </span>
                            <div className="flex gap-1 items-center">
                              <Input className="h-9 text-xs flex-1 min-w-0" inputMode={isImport ? 'decimal' : 'numeric'} value={line.unit_price}
                                placeholder={isImport ? (priceMode === 'cents' ? '예: ¢12.30 (=$0.123/Wp)' : '예: $0.1230/Wp') : '예: 200 (원/Wp)'}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (isImport) {
                                    if (v === '' || /^\d*\.?\d{0,6}$/.test(v)) updateLine(idx, 'unit_price', v);
                                  } else {
                                    if (v === '' || /^\d+$/.test(v)) updateLine(idx, 'unit_price', v);
                                  }
                                }} />
                              {isImport && (
                                <Button type="button" variant="outline" size="sm"
                                  className="h-9 px-1.5 text-[10px] shrink-0 w-9" onClick={togglePriceMode}>
                                  {priceMode === 'cents' ? '¢' : '$'}
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="w-40 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-medium">인보이스{currencyLabel}(자동)</span>
                            {isImport ? (
                              <div className="flex gap-1 items-center">
                                {line.manualInvoice ? (
                                  <Input className="h-9 text-xs flex-1 min-w-0" inputMode="decimal"
                                    value={line.invoiceOverride} placeholder="직접 입력"
                                    onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) updateLine(idx, 'invoiceOverride', v); }} />
                                ) : (
                                  <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate flex-1 min-w-0">
                                    {fmtInvoice(line)}
                                  </div>
                                )}
                                <Button type="button" variant="ghost" size="sm"
                                  className="h-9 px-1 text-[9px] shrink-0" title={line.manualInvoice ? '자동으로' : '수동 보정'}
                                  onClick={() => updateLine(idx, 'manualInvoice', !line.manualInvoice)}>
                                  {line.manualInvoice ? '자동' : '수동'}
                                </Button>
                              </div>
                            ) : (
                              <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                                {fmtInvoice(line)}
                              </div>
                            )}
                          </div>
                          {isImport && (
                            <div className="w-36 space-y-1">
                              <span className="text-[10px] text-muted-foreground font-medium">인보이스KRW(자동)</span>
                              <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                                {(() => {
                                  const usd = calcInvoice(line);
                                  const ex = exchangeRateLive ? parseFloat(exchangeRateLive) : 0;
                                  if (!usd) return '-';
                                  if (!ex || isNaN(ex)) return <span className="text-orange-600">환율을 입력하세요</span>;
                                  return `${Math.round(usd * ex).toLocaleString('ko-KR')}원`;
                                })()}
                              </div>
                            </div>
                          )}
                          <div className="w-24 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-medium">용량kW</span>
                            <div className="h-9 flex items-center text-xs text-muted-foreground bg-muted rounded-md px-2">
                              {calcKw(line)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 총 구매금액 */}
                {selMfgId && lines.some(l => l.product_id && Number(l.quantity) > 0) && (
                  <div className="rounded-md border-2 border-primary/20 bg-primary/5 px-3 py-2 flex flex-wrap items-center gap-4">
                    <span className="text-sm font-semibold">총 구매금액</span>
                    {isImport ? (
                      <>
                        <span className="text-sm">
                          USD <span className="font-mono font-semibold">${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </span>
                        <span className="text-sm">
                          KRW <span className={`font-mono font-semibold ${totalKRW ? '' : 'text-orange-600'}`}>
                            {totalKRW ? `₩${totalKRW.toLocaleString('ko-KR')}` : '환율을 입력하세요'}
                          </span>
                        </span>
                      </>
                    ) : (
                      <span className="text-sm">
                        KRW <span className="font-mono font-semibold">₩{totalKRW.toLocaleString('ko-KR')}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 결제조건 — 해외직수입 (총구매금액 기준) */}
              {isImport && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">결제조건</Label>
                  <div className="rounded-md border p-3 text-sm space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-muted-foreground">계약금</span>
                      <label className="flex items-center gap-1">
                        <input type="radio" checked={importPT.hasDeposit} onChange={() => setImportPT(p => ({ ...p, hasDeposit: true }))} />있음
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="radio" checked={!importPT.hasDeposit} onChange={() => setImportPT(p => ({ ...p, hasDeposit: false }))} />없음
                      </label>
                      {importPT.hasDeposit && (
                        <>
                          <select className="h-8 rounded border px-2 text-sm" value={importPT.depositMethod}
                            onChange={e => setImportPT(p => ({ ...p, depositMethod: e.target.value as 'tt' | 'lc' }))}>
                            <option value="tt">T/T</option><option value="lc">L/C</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <Input className="w-16 h-8 text-sm" inputMode="decimal" value={importPT.depositPercent}
                              placeholder="%"
                              onChange={e => setImportPT(p => ({ ...p, depositPercent: e.target.value.replace(/[^0-9.]/g, '') }))} />
                            <span>%</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            = ${(totalForPT * (parseFloat(importPT.depositPercent || '0') / 100)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                          </span>
                          <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]"
                            disabled={importPT.depositSplits.length >= 5}
                            onClick={() => setImportPT(p => p.depositSplits.length >= 5 ? p : ({ ...p, depositSplits: [...p.depositSplits, ''] }))}>
                            분할 추가 ({importPT.depositSplits.length}/5)
                          </Button>
                        </>
                      )}
                    </div>
                    {importPT.hasDeposit && importPT.depositSplits.length > 0 && (
                      <div className="pl-4 space-y-1">
                        {importPT.depositSplits.map((amt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16">분할 {i + 1}</span>
                            <span className="text-xs text-muted-foreground">$</span>
                            <Input className="w-40 h-8 text-sm" inputMode="decimal" value={amt} placeholder="금액"
                              onChange={e => {
                                const v = e.target.value.replace(/[^0-9.]/g, '');
                                setImportPT(p => ({ ...p, depositSplits: p.depositSplits.map((x, j) => j === i ? v : x) }));
                              }} />
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setImportPT(p => ({ ...p, depositSplits: p.depositSplits.filter((_, j) => j !== i) }))}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t">
                      <span className="text-muted-foreground">잔금 L/C</span>
                      <select className="h-8 rounded border px-2 text-sm" value={importPT.balanceDays}
                        onChange={e => setImportPT(p => ({ ...p, balanceDays: e.target.value as ImportBalanceDay }))}>
                        {IMPORT_BALANCE_DAYS.map(d => <option key={d} value={d}>{d}일</option>)}
                      </select>
                      <span className="text-xs text-muted-foreground">
                        잔금 = ${Math.max(0, totalForPT - (importPT.hasDeposit ? totalForPT * (parseFloat(importPT.depositPercent || '0') / 100) : 0)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">{composeImportPT(importPT, totalForPT)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 결제조건 — 국내구매 */}
              {isDomestic && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">결제조건</Label>
                  <div className="rounded-md border p-3 text-sm space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-muted-foreground">선입금(현금)</span>
                      <select className="h-8 rounded border px-2 text-sm" value={domesticPT.prepayMode}
                        onChange={e => setDomesticPT(p => ({ ...p, prepayMode: e.target.value as 'percent' | 'amount', prepayValue: '' }))}>
                        <option value="amount">금액</option>
                        <option value="percent">%</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <Input className="w-32 h-8 text-sm" inputMode={domesticPT.prepayMode === 'percent' ? 'decimal' : 'numeric'}
                          value={domesticPT.prepayMode === 'amount' && domesticPT.prepayValue
                            ? parseInt(domesticPT.prepayValue).toLocaleString('ko-KR')
                            : domesticPT.prepayValue}
                          placeholder={domesticPT.prepayMode === 'percent' ? '%' : '0 (전액신용시 비움)'}
                          onChange={e => {
                            const v = e.target.value.replace(domesticPT.prepayMode === 'percent' ? /[^0-9.]/g : /[^0-9]/g, '');
                            setDomesticPT(p => ({ ...p, prepayValue: v }));
                          }} />
                        <span>{domesticPT.prepayMode === 'percent' ? '%' : '원'}</span>
                      </div>
                      {domesticPT.prepayMode === 'percent' && domesticPT.prepayValue && (
                        <span className="text-xs text-muted-foreground">
                          = ₩{Math.round(totalForPT * (parseFloat(domesticPT.prepayValue) / 100)).toLocaleString('ko-KR')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t">
                      <span className="text-muted-foreground">잔금</span>
                      <span className="text-xs">
                        ₩{Math.max(0, totalForPT - (domesticPT.prepayMode === 'percent'
                          ? totalForPT * (parseFloat(domesticPT.prepayValue || '0') / 100)
                          : parseInt(domesticPT.prepayValue || '0'))).toLocaleString('ko-KR')}
                      </span>
                      <div className="flex flex-wrap gap-3 basis-full">
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" checked={domesticPT.balanceMode === 'days5'}
                            onChange={() => setDomesticPT(p => ({ ...p, balanceMode: 'days5' }))} />
                          신용거래 (5일 단위)
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" checked={domesticPT.balanceMode === 'manual'}
                            onChange={() => setDomesticPT(p => ({ ...p, balanceMode: 'manual' }))} />
                          신용거래 (수기 입력)
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="radio" checked={domesticPT.balanceMode === 'month'}
                            onChange={() => setDomesticPT(p => ({ ...p, balanceMode: 'month' }))} />
                          출고일 기준 월말
                        </label>
                      </div>
                      {domesticPT.balanceMode === 'days5' && (
                        <select className="h-8 rounded border px-2 text-sm" value={domesticPT.balanceDays}
                          onChange={e => setDomesticPT(p => ({ ...p, balanceDays: e.target.value }))}>
                          {DOMESTIC_DAYS5.map(d => <option key={d} value={d}>{d}일</option>)}
                        </select>
                      )}
                      {domesticPT.balanceMode === 'manual' && (
                        <div className="flex items-center gap-1">
                          <Input className="w-20 h-8 text-sm" inputMode="numeric" value={domesticPT.balanceDays} placeholder="일수"
                            onChange={e => setDomesticPT(p => ({ ...p, balanceDays: e.target.value.replace(/[^0-9]/g, '') }))} />
                          <span>일</span>
                        </div>
                      )}
                      {domesticPT.balanceMode === 'month' && (
                        <select className="h-8 rounded border px-2 text-sm" value={domesticPT.monthOffset}
                          onChange={e => setDomesticPT(p => ({ ...p, monthOffset: e.target.value as MonthOffset }))}>
                          <option value="1">익월말</option>
                          <option value="2">익익월말</option>
                          <option value="3">익익익월말</option>
                        </select>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{composeDomesticPT(domesticPT, totalForPT)}</p>
                    {deliveryDate && (
                      <p className="text-xs text-muted-foreground">
                        만기일: <span className="font-medium text-foreground">
                          {domesticPT.balanceMode === 'month'
                            ? calcMonthEndDue(deliveryDate, domesticPT.monthOffset)
                            : calcDueDate(deliveryDate, parseInt(domesticPT.balanceDays || '0'))}
                        </span>
                        <span className="ml-1">(납품일 {deliveryDate} 기준)</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
              {/* 그룹내구매 — 결제조건 숨김 */}
            </>
          )}

          <DialogFooter className="items-center">
            {editData && !isDirtyAll && (
              <span className="text-xs text-muted-foreground mr-auto">수정사항 없음</span>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting || !selType || (!!editData && !isDirtyAll)}>
              {isSubmitting ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
