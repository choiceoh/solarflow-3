import { useEffect, useRef, useState, useCallback, type DragEvent } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ScanText, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useAppStore } from '@/stores/appStore';
import { fetchWithAuth } from '@/lib/api';
import { formatUSD, moduleLabel, shortMfgName } from '@/lib/utils';
import {
  displayPriceToUsdWp,
  formatCapacityFromKw,
  formatDecimalPlain,
  formatIntegerInput,
  parseDecimalInput,
  parseIntegerInput,
  parseNumericInput,
  unitUsdEaToDisplayPrice,
  usdWpToDisplayPrice,
} from '@/lib/numberRules';
import type { BLShipment, BLLineItem } from '@/types/inbound';
import type { Company, Manufacturer, Product, Warehouse } from '@/types/masters';

const LC_STATUS_KR: Record<string, string> = {
  pending: '대기', opened: '개설완료', docs_received: '서류접수', settled: '결제완료',
};

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
  declaration_number: z.string().optional(),
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

function normalizeLinesForSnapshot(lines: LineItem[]) {
  return lines.map(l => ({
    product_id: l.product_id,
    po_line_id: l.po_line_id ?? '',
    quantity: parseIntegerInput(l.quantity),
    item_type: l.item_type,
    payment_type: l.payment_type,
    unit_price: l.unit_price,
    manualInvoice: l.manualInvoice,
    invoiceOverride: l.invoiceOverride,
  }));
}

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
  first_spec_wp?: number;       // purchase_orders_ext 뷰: 드롭다운 spec 표시용
  currency?: 'USD' | 'KRW';
  total_capacity_mw?: number;
  total_mw?: number;
  contract_date?: string | null;
  status?: string;
  incoterms?: string | null;
  payment_terms?: string | null;
}

/** R1-9: PO 드롭다운 라벨 포맷 — "진코 640W | PO번호 | X.XMW | YYYY-MM" */
function formatPOLabel(po: POSummary | undefined, mfgs: Manufacturer[]): string {
  if (!po) return '';
  const mfgName = po.manufacturer_name ?? mfgs.find(m => m.manufacturer_id === po.manufacturer_id)?.name_kr ?? '—';
  const specLabel = po.first_spec_wp ? ` ${po.first_spec_wp}W` : '';
  const mw = po.total_capacity_mw ?? po.total_mw ?? 0;
  const month = po.contract_date ? po.contract_date.slice(0, 7) : '';
  return `${shortMfgName(mfgName)}${specLabel} | ${po.po_number} | ${mw.toFixed(1)}MW${month ? ` | ${month}` : ''}`;
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

/** PO 발주품목 행 — 기입고/잔여/이번입고 입력 포함 (D-087) */
interface POLineRow {
  po_line_id?: string;
  product_id: string;
  contracted_qty: number;        // PO 계약 수량 (EA)
  shipped_qty: number;           // 동일 PO의 모든 BL에서 합산한 기입고 수량
  unit_price_usd?: number;       // $/EA (unit_price_usd_wp null 시 역산 fallback용)
  unit_price_usd_wp?: number;
  unit_price_krw_wp?: number;
  item_type: 'main' | 'spare';
  payment_type: 'paid' | 'free';
  thisShipmentQty: string;       // 사용자 입력 — 이번 BL에 입고할 수량
}

interface OCRFieldCandidate {
  value: string;
  label?: string;
  source_text?: string;
  confidence?: number;
}

interface CustomsDeclarationOCRFields {
  declaration_number?: OCRFieldCandidate;
  declaration_date?: OCRFieldCandidate;
  arrival_date?: OCRFieldCandidate;
  release_date?: OCRFieldCandidate;
  importer?: OCRFieldCandidate;
  forwarder?: OCRFieldCandidate;
  trade_partner?: OCRFieldCandidate;
  exchange_rate?: OCRFieldCandidate;
  cif_amount_krw?: OCRFieldCandidate;
  hs_code?: OCRFieldCandidate;
  customs_office?: OCRFieldCandidate;
  port?: OCRFieldCandidate;
  bl_number?: OCRFieldCandidate;
  invoice_number?: OCRFieldCandidate;
  line_items?: CustomsDeclarationOCRLine[];
}

interface CustomsDeclarationOCRLine {
  model_spec?: OCRFieldCandidate;
  quantity?: OCRFieldCandidate;
  unit_price_usd?: OCRFieldCandidate;
  amount_usd?: OCRFieldCandidate;
  payment_type?: OCRFieldCandidate;
}

interface OCRExtractResponse {
  results: Array<{
    filename: string;
    error?: string;
    fields?: {
      customs_declaration?: CustomsDeclarationOCRFields;
    };
  }>;
}

function normalizeOCRMatchText(value: string | undefined) {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
}

function parseOCRNumber(value: string | undefined) {
  if (!value) return NaN;
  return Number(value.replace(/,/g, ''));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BLShipment | null;
  /** PO 상세에서 입고 등록 시 사전 연결 (D-085) */
  presetPOId?: string | null;
  /** LC 탭에서 입고 등록 시 LC 자동 선택 */
  presetLCId?: string | null;
  embedded?: boolean;
}

export default function BLForm({ open, onOpenChange, onSubmit, editData, presetPOId, presetLCId, embedded = false }: Props) {
  const globalCompanyId = useAppStore((s) => s.selectedCompanyId);
  const storeCompanies = useAppStore((s) => s.companies);
  const customsOCRInputRef = useRef<HTMLInputElement | null>(null);

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
  // F16 결제조건 섹션 삭제 이후 deliveryDate 값은 미사용, setter는 actual_arrival 미러용 유지
  const [, setDeliveryDate] = useState('');
  const [exchangeRateLive, setExchangeRateLive] = useState(''); // 환율 실시간 미러 (KRW 재계산용)
  const [exchangeRateDisplay, setExchangeRateDisplay] = useState(''); // 환율 표시용 (천단위 콤마 포함)
  // D-085/D-087: PO 연결 — 드롭다운 + 자동 채움 + 잔여량
  const [poList, setPoList] = useState<POSummary[]>([]);
  const [selPOId, setSelPOId] = useState<string>('');
  const [poRemaining, setPoRemaining] = useState<{ contractedMw: number; shippedMw: number; remainMw: number } | null>(null);
  const [autofilled, setAutofilled] = useState<boolean>(false); // 자동채움 여부 표시 (bg-muted 적용용)
  const [poLineRows, setPoLineRows] = useState<POLineRow[]>([]); // D-087: PO 발주품목 + 기입고/잔여 테이블
  const [submitError, setSubmitError] = useState('');
  const [customsOCRLoading, setCustomsOCRLoading] = useState(false);
  const [customsOCRError, setCustomsOCRError] = useState('');
  const [customsOCRSummary, setCustomsOCRSummary] = useState('');
  const [pendingCustomsOCRFile, setPendingCustomsOCRFile] = useState<File | null>(null);
  const [pendingCustomsOCRFields, setPendingCustomsOCRFields] = useState<CustomsDeclarationOCRFields | null>(null);
  const [customsOCRReviewOpen, setCustomsOCRReviewOpen] = useState(false);
  const [customsOCRDragActive, setCustomsOCRDragActive] = useState(false);
  // R3: LC 선택 (해외직수입만 필수) — D-095 BL>LC=차단
  const [lcList, setLcList] = useState<{ lc_id: string; lc_number?: string; po_id: string; amount_usd: number; target_qty?: number; target_mw?: number; status: string; bank_name?: string }[]>([]);
  const [lcShippedQty, setLcShippedQty] = useState<number>(0); // 선택 LC의 기존 BL 합산 입고수량
  // F18: 신규 등록 시 항상 완료(completed)로 등록 — 항구 도착 후 등록이 원칙
  const initialStatus: 'scheduled' | 'completed' = 'completed';
  const [selLCId, setSelLCId] = useState<string>('');
  // 면장 CIF 원화금액 (부가세·무상분 과세 제외) — 입력값 표시용 (콤마 포함 문자열)
  const [cifAmountKrwDisplay, setCifAmountKrwDisplay] = useState<string>('');
  const [cifAmountKrwManual, setCifAmountKrwManual] = useState<boolean>(false);

  const { register, reset, setValue, getValues, watch, formState: { isSubmitting, isDirty } } = useForm<FormData>({
    resolver: zodResolver(schema) as unknown as Resolver<FormData>,
  });
  // 수정 모드 — 변경사항 감지 (RHF isDirty + 보조 state 변경 감지)
  // eslint-disable-next-line react-hooks/incompatible-library -- react-hook-form watch() — 컴파일러 메모이제이션 불가
  const watchedValues = watch(); // watch all → 이 컴포넌트가 폼 변화에 리렌더
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const currentSnapshot = JSON.stringify({
    form: watchedValues,
    selType, selCompanyId, selMfgId, selWhId, counterpartId,
    selPOId, selLCId, importPT, domesticPT, bafCaf,
    exchangeRateLive, cifAmountKrwDisplay,
    lines: normalizeLinesForSnapshot(lines),
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
    if (!open) return;
    fetchWithAuth<POSummary[]>('/api/v1/pos')
      .then(list => {
        // completed PO는 신규 입고 등록에서 제외하되, 기존 B/L 수정 시 연결 PO는 보여준다.
        setPoList(editData ? (list ?? []) : (list ?? []).filter(p => p.status !== 'completed'));
      })
      .catch(() => setPoList([]));
  }, [open, editData]);


  /* R3: PO 선택 시 해당 PO의 LC 목록 로드 */
  useEffect(() => {
    if (!selPOId) { setLcList([]); setSelLCId(''); return; }
    fetchWithAuth<typeof lcList>(`/api/v1/lcs?po_id=${selPOId}`)
      .then((list) => setLcList(list ?? []))
      .catch(() => setLcList([]));
  }, [selPOId]);

  /* LC 선택 시 해당 LC의 기존 BL 입고수량 합산 */
  useEffect(() => {
    if (!selLCId) { setLcShippedQty(0); return; }
    let cancelled = false;
    (async () => {
      try {
        const bls = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?lc_id=${selLCId}`).catch(() => [] as BLShipment[]);
        let total = 0;
        for (const bl of bls ?? []) {
          const blLines = await fetchWithAuth<{ quantity?: number }[]>(`/api/v1/bls/${bl.bl_id}/lines`).catch(() => []);
          for (const ln of blLines ?? []) total += ln.quantity ?? 0;
        }
        if (!cancelled) setLcShippedQty(total);
      } catch { if (!cancelled) setLcShippedQty(0); }
    })();
    return () => { cancelled = true; };
  }, [selLCId]);

  /* PO 선택 → 입고 폼 자동 채움 (D-087)
   * 자동 채움: manufacturer_id, company_id, currency, incoterms, payment_terms.
   * BL 라인은 PO 발주품목에서 product_id/단가/구분 복사 + po_line_id 연결.
   */
  const applyPOAutofill = useCallback(async (poId: string, currentBlId?: string) => {
    if (!poId) return;
    // GET /api/v1/pos/{id} — 전체 상세 (currency, payment_terms 포함)
    let po: POSummary | undefined;
    try {
      po = await fetchWithAuth<POSummary>(`/api/v1/pos/${poId}`);
    } catch {
      po = poList.find(p => p.po_id === poId);
    }
    if (!po) return;
    if (!currentBlId) {
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
    }
    setAutofilled(true);
    // PO 발주품목 + 동일 PO 기입고 합산 (product_id별)
    let poLines: POLineSummary[] = [];
    try {
      poLines = await fetchWithAuth<POLineSummary[]>(`/api/v1/pos/${poId}/lines`) ?? [];
    } catch { /* 빈 PO */ }
    // 기입고 합산: po_line_id 기준으로 집계 (동일 품목 복수 PO 라인 구분)
    const shippedByLine: Record<string, number> = {};   // po_line_id → qty
    const shippedByProduct: Record<string, number> = {}; // product_id → qty (po_line_id 없는 구 데이터 폴백)
    let shippedKwTotal = 0;
    try {
      const bls = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?po_id=${poId}`);
      for (const bl of bls ?? []) {
        if (currentBlId && bl.bl_id === currentBlId) continue;
        try {
          const blLines = await fetchWithAuth<{ po_line_id?: string; product_id?: string; quantity?: number; capacity_kw?: number }[]>(`/api/v1/bls/${bl.bl_id}/lines`);
          for (const ln of blLines ?? []) {
            if (ln.po_line_id) {
              shippedByLine[ln.po_line_id] = (shippedByLine[ln.po_line_id] || 0) + (ln.quantity ?? 0);
            } else if (ln.product_id) {
              shippedByProduct[ln.product_id] = (shippedByProduct[ln.product_id] || 0) + (ln.quantity ?? 0);
            }
            shippedKwTotal += ln.capacity_kw ?? 0;
          }
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    // PO 발주품목 행 구성
    setPoLineRows(poLines.map(l => ({
      po_line_id: l.po_line_id,
      product_id: l.product_id,
      contracted_qty: l.quantity ?? 0,
      shipped_qty: (l.po_line_id ? shippedByLine[l.po_line_id] : undefined) ?? shippedByProduct[l.product_id] ?? 0,
      unit_price_usd: l.unit_price_usd,
      unit_price_usd_wp: l.unit_price_usd_wp,
      unit_price_krw_wp: l.unit_price_krw_wp,
      item_type: l.item_type ?? 'main',
      payment_type: l.payment_type ?? 'paid',
      thisShipmentQty: '',
    })));
    // 잔여량 (MW 단위 — 헤더 표시용)
    const contractedMw = po.total_capacity_mw ?? po.total_mw ?? 0;
    const shippedMw = shippedKwTotal / 1000;
    setPoRemaining({ contractedMw, shippedMw, remainMw: Math.max(0, contractedMw - shippedMw) });
  }, [poList, setValue]);

  /* presetPOId (PO 상세 / LC 탭에서 진입) → 자동 적용 */
  useEffect(() => {
    if (!open || editData || !presetPOId || poList.length === 0) return;
    setSelPOId(presetPOId);
    applyPOAutofill(presetPOId);
  }, [open, editData, presetPOId, poList, applyPOAutofill]);

  /* 수정 모드도 신규 등록과 같은 PO/LC 발주 현황을 보여준다. */
  useEffect(() => {
    if (!open || !editData?.po_id || poList.length === 0) return;
    applyPOAutofill(editData.po_id, editData.bl_id);
    if (editData.lc_id) setSelLCId(editData.lc_id);
  }, [open, editData?.po_id, editData?.bl_id, editData?.lc_id, poList.length, applyPOAutofill]);

  /* presetLCId (LC 탭에서 진입) → LC list 로드 후 자동 선택 */
  useEffect(() => {
    if (!open || !presetLCId || !lcList.length) return;
    setSelLCId(presetLCId);
  }, [open, presetLCId, lcList.length]);

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

  const applyOCRTextField = (field: keyof FormData, candidate: OCRFieldCandidate | undefined, label: string, onlyIfBlank = false) => {
    const value = candidate?.value?.trim();
    if (!value) return '';
    if (onlyIfBlank && String(getValues(field) ?? '').trim()) return '';
    setValue(field, value, { shouldDirty: true });
    return label;
  };

  const findProductForOCRLine = (item: CustomsDeclarationOCRLine): Product | null => {
    const raw = normalizeOCRMatchText(item.model_spec?.value);
    if (!raw) return null;
    return products.find((product) => {
      const code = normalizeOCRMatchText(product.product_code);
      const name = normalizeOCRMatchText(product.product_name);
      return (code && raw.includes(code)) || (name && raw.includes(name)) || (name && name.includes(raw));
    }) ?? null;
  };

  const applyOCRLineItems = (items: CustomsDeclarationOCRLine[] | undefined) => {
    if (!items?.length) return { appliedCount: 0, unmatched: 0 };
    const nextLines: LineItem[] = [];
    let unmatched = 0;

    for (const item of items) {
      const product = findProductForOCRLine(item);
      const quantity = parseOCRNumber(item.quantity?.value);
      if (!product || !Number.isFinite(quantity) || quantity <= 0) {
        unmatched += 1;
        continue;
      }
      const unitUsdWp = parseOCRNumber(item.unit_price_usd?.value);
      const amountUsd = parseOCRNumber(item.amount_usd?.value);
      const isFree = item.payment_type?.value === 'free' || /FREE|SPARE|N\.C\.V/i.test(item.model_spec?.value ?? '');
      nextLines.push({
        product_id: product.product_id,
        quantity: String(Math.round(quantity)),
        item_type: isFree ? 'spare' : 'main',
        payment_type: isFree ? 'free' : 'paid',
        unit_price: Number.isFinite(unitUsdWp) && unitUsdWp > 0 ? usdWpToDisplayPrice(unitUsdWp, priceMode) : '',
        manualInvoice: Number.isFinite(amountUsd) && amountUsd > 0,
        invoiceOverride: Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd.toFixed(2) : '',
      });
    }

    if (nextLines.length > 0) {
      setLines(nextLines);
    }
    return { appliedCount: nextLines.length, unmatched };
  };

  const applyCustomsOCRFields = (fields: CustomsDeclarationOCRFields) => {
    const applied = [
      applyOCRTextField('declaration_number', fields.declaration_number, '면장번호'),
      applyOCRTextField('actual_arrival', fields.arrival_date, '입항일'),
      applyOCRTextField('port', fields.port, '항구'),
      applyOCRTextField('forwarder', fields.forwarder, '운송주선인'),
      applyOCRTextField('invoice_number', fields.invoice_number, 'Invoice No.'),
      applyOCRTextField('bl_number', fields.bl_number, 'B/L번호', true),
    ].filter((label): label is string => Boolean(label));

    const rate = fields.exchange_rate?.value?.replace(/,/g, '').trim();
    if (rate) {
      const parsed = parseFloat(rate);
      if (Number.isFinite(parsed) && parsed > 0) {
        setValue('exchange_rate', String(parsed), { shouldDirty: true });
        setExchangeRateLive(String(parsed));
        setExchangeRateDisplay(parsed.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        applied.push('면장환율');
      }
    }

    const cif = fields.cif_amount_krw?.value?.replace(/[^0-9]/g, '').trim();
    if (cif) {
      const parsed = parseInt(cif, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        setCifAmountKrwManual(true);
        setCifAmountKrwDisplay(parsed.toLocaleString('ko-KR'));
        applied.push('면장 CIF 원화금액');
      }
    }

    const lineResult = applyOCRLineItems(fields.line_items);
    if (lineResult.appliedCount > 0) {
      applied.push(`품목 ${lineResult.appliedCount}건`);
    }

    const references = [
      fields.importer?.value ? `수입자 ${fields.importer.value}` : '',
      fields.trade_partner?.value ? `무역거래처 ${fields.trade_partner.value}` : '',
      fields.declaration_date?.value ? `신고일 ${fields.declaration_date.value}` : '',
      fields.release_date?.value ? `수리/반출일 ${fields.release_date.value}` : '',
      fields.hs_code?.value ? `HS ${fields.hs_code.value}` : '',
      fields.customs_office?.value ? fields.customs_office.value : '',
      lineResult.unmatched > 0 ? `품목 미매칭 ${lineResult.unmatched}건` : '',
    ].filter((label): label is string => Boolean(label));

    setCustomsOCRSummary([
      applied.length > 0 ? `${applied.join(', ')} 채움` : '',
      references.length > 0 ? `참고: ${references.join(' · ')}` : '',
    ].filter(Boolean).join(' / ') || '자동으로 채울 값을 찾지 못했습니다');
  };

  const isCustomsOCRAcceptedFile = (file: File) => {
    const name = file.name.toLowerCase();
    return file.type === 'application/pdf'
      || file.type.startsWith('image/')
      || /\.(pdf|png|jpe?g|webp|heic|heif|bmp|tiff?)$/i.test(name);
  };

  const prepareCustomsOCRFile = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setCustomsOCRDragActive(false);
    if (!isCustomsOCRAcceptedFile(file)) {
      setCustomsOCRSummary('');
      setCustomsOCRError('PDF 또는 사진 파일만 등록할 수 있습니다');
      setPendingCustomsOCRFile(null);
      setPendingCustomsOCRFields(null);
      if (customsOCRInputRef.current) customsOCRInputRef.current.value = '';
      return;
    }
    setPendingCustomsOCRFile(file);
    if (customsOCRInputRef.current) customsOCRInputRef.current.value = '';
    void handleCustomsOCRFile(file);
  };

  const handleCustomsOCRFile = async (file: File) => {
    setCustomsOCRLoading(true);
    setCustomsOCRError('');
    setCustomsOCRSummary('');
    try {
      const form = new FormData();
      form.append('document_type', 'customs_declaration');
      form.append('images', file);
      const response = await fetchWithAuth<OCRExtractResponse>('/api/v1/ocr/extract', { method: 'POST', body: form });
      const result = response.results[0];
      if (!result) throw new Error('OCR 결과가 없습니다');
      if (result.error) throw new Error(result.error);
      const fields = result.fields?.customs_declaration;
      if (!fields) throw new Error('면장 입력 후보를 찾지 못했습니다');
      setPendingCustomsOCRFields(fields);
      setCustomsOCRReviewOpen(true);
    } catch (err) {
      setCustomsOCRError(err instanceof Error ? err.message : '면장 PDF를 읽지 못했습니다');
      setPendingCustomsOCRFile(null);
      setPendingCustomsOCRFields(null);
    } finally {
      setCustomsOCRLoading(false);
    }
  };

  const confirmCustomsOCRFields = () => {
    if (!pendingCustomsOCRFields) {
      setCustomsOCRReviewOpen(false);
      return;
    }
    applyCustomsOCRFields(pendingCustomsOCRFields);
    setPendingCustomsOCRFields(null);
    setPendingCustomsOCRFile(null);
    setCustomsOCRReviewOpen(false);
  };

  const setCustomsOCRReview = (nextOpen: boolean) => {
    setCustomsOCRReviewOpen(nextOpen);
    if (!nextOpen && !customsOCRLoading) {
      setPendingCustomsOCRFile(null);
      setPendingCustomsOCRFields(null);
    }
  };

  const handleCustomsOCRDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = customsOCRLoading ? 'none' : 'copy';
    if (!customsOCRLoading) setCustomsOCRDragActive(true);
  };

  const handleCustomsOCRDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextTarget = event.relatedTarget as Node | null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setCustomsOCRDragActive(false);
  };

  const handleCustomsOCRDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setCustomsOCRDragActive(false);
    if (customsOCRLoading) return;
    prepareCustomsOCRFile(event.dataTransfer.files);
  };

  /* ── 폼 초기화 ── */
  useEffect(() => {
    if (!open) return;
    setSubmitError('');
    setCustomsOCRError('');
    setCustomsOCRSummary('');
    setPendingCustomsOCRFile(null);
    setPendingCustomsOCRFields(null);
    setCustomsOCRReviewOpen(false);
    setCustomsOCRDragActive(false);
    setPriceMode('cents');
    if (editData) {
      const d = editData;
      setSelType(d.inbound_type as InboundTypeValue);
      setSelCompanyId(d.company_id);
      setSelMfgId(d.manufacturer_id);
      setSelWhId(d.warehouse_id ?? '');
      setCounterpartId(d.counterpart_company_id ?? '');
      setSelPOId(d.po_id ?? '');
      setSelLCId(d.lc_id ?? '');
      setAutoNumber(d.bl_number);
      setBafCaf(/BAF\s*\/\s*CAF/i.test(d.incoterms ?? ''));
      setDeliveryDate(d.actual_arrival?.slice(0, 10) ?? '');
      const initExchangeRate = d.exchange_rate != null ? String(d.exchange_rate) : '';
      const initCifAmount = d.cif_amount_krw != null ? d.cif_amount_krw.toLocaleString('ko-KR') : '';
      const initFormValues: FormData = {
        inbound_type: d.inbound_type,
        bl_number: d.bl_number,
        manufacturer_id: d.manufacturer_id,
        exchange_rate: initExchangeRate,
        etd: d.etd?.slice(0, 10) ?? '',
        eta: d.eta?.slice(0, 10) ?? '',
        actual_arrival: d.actual_arrival?.slice(0, 10) ?? '',
        port: d.port ?? '',
        forwarder: d.forwarder ?? '',
        warehouse_id: d.warehouse_id ?? '',
        invoice_number: d.invoice_number ?? '',
        declaration_number: d.declaration_number ?? '',
        incoterms: d.incoterms ?? '',
        memo: d.memo ?? '',
      };
      setExchangeRateLive(initExchangeRate);
      setExchangeRateDisplay(d.exchange_rate != null ? d.exchange_rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
      setCifAmountKrwDisplay(initCifAmount);
      setCifAmountKrwManual(d.cif_amount_krw != null);
      const initImportPT = d.inbound_type === 'import' ? parseImportPT(d.payment_terms ?? '') : defaultImportPT();
      const initDomesticPT = d.inbound_type === 'domestic' ? parseDomesticPT(d.payment_terms ?? '') : defaultDomesticPT();
      if (d.inbound_type === 'import') setImportPT(parseImportPT(d.payment_terms ?? ''));
      else if (d.inbound_type === 'domestic') setDomesticPT(parseDomesticPT(d.payment_terms ?? ''));
      reset(initFormValues);
      setLines([emptyLine()]);
      fetchWithAuth<BLLineItem[]>(`/api/v1/bls/${d.bl_id}/lines`)
        .then((apiLines) => {
          const nextLines = apiLines && apiLines.length > 0 ? apiLines.map(l => ({
            product_id: l.product_id,
            po_line_id: l.po_line_id,
            quantity: String(l.quantity),
            item_type: (l.item_type ?? 'main') as 'main' | 'spare',
            payment_type: (l.payment_type ?? 'paid') as 'paid' | 'free',
            unit_price: l.unit_price_usd_wp != null
              ? (d.inbound_type === 'import'
                ? usdWpToDisplayPrice(l.unit_price_usd_wp, 'cents')
                : formatDecimalPlain(l.unit_price_usd_wp, 0, 4))
              : l.unit_price_krw_wp != null
              ? String(l.unit_price_krw_wp)
              : '',
            manualInvoice: false,
            invoiceOverride: '',
          })) : [emptyLine()];
          setLines(nextLines);
          setInitialSnapshot(JSON.stringify({
            form: initFormValues,
            selType: d.inbound_type,
            selCompanyId: d.company_id,
            selMfgId: d.manufacturer_id,
            selWhId: d.warehouse_id ?? '',
            counterpartId: d.counterpart_company_id ?? '',
            selPOId: d.po_id ?? '',
            selLCId: d.lc_id ?? '',
            importPT: initImportPT,
            domesticPT: initDomesticPT,
            bafCaf: /BAF\s*\/\s*CAF/i.test(d.incoterms ?? ''),
            exchangeRateLive: initExchangeRate,
            cifAmountKrwDisplay: initCifAmount,
            lines: normalizeLinesForSnapshot(nextLines),
          }));
        })
        .catch((err) => {
          setInitialSnapshot('');
          setSubmitError(err instanceof Error ? `기존 입고 품목을 불러오지 못했습니다: ${err.message}` : '기존 입고 품목을 불러오지 못했습니다');
        });
    } else {
      const cid = globalCompanyId && globalCompanyId !== 'all' ? globalCompanyId : '';
      setSelType(''); setSelCompanyId(cid); setSelMfgId(''); setSelWhId('');
      setCounterpartId(''); setAutoNumber(''); setImportPT(defaultImportPT()); setDomesticPT(defaultDomesticPT());
      setBafCaf(false); setDeliveryDate(''); setExchangeRateLive(''); setExchangeRateDisplay(''); setSelPOId(''); setSelLCId('');
      setAutofilled(false); setPoRemaining(null); setPoLineRows([]); setCifAmountKrwDisplay(''); setCifAmountKrwManual(false);
      setInitialSnapshot('');
      reset({
        inbound_type: '', bl_number: '', manufacturer_id: '',
        exchange_rate: '', etd: '', eta: '', actual_arrival: '',
        port: '', forwarder: '', warehouse_id: '', invoice_number: '', declaration_number: '',
        incoterms: '', memo: '',
      });
      setLines([emptyLine()]);
    }
  }, [open, editData, reset, globalCompanyId]);

  /* ── 라인아이템 ── */
  const updateLine = (i: number, f: keyof LineItem, v: string | boolean) =>
    setLines(prev => prev.map((l, j) => j === i ? { ...l, [f]: v } : l));
  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  /** D-087: PO 발주품목 행에서 BL 라인 추가 (이번 입고 수량 + 단가/구분 복사) */
  const addLineFromPORow = (idx: number) => {
    const r = poLineRows[idx];
    if (!r) return;
    const qty = parseInt(r.thisShipmentQty || '0');
    if (!qty || qty <= 0) return;
    setLines(prev => {
      // 기본 빈 라인 제거 (product_id 없는 첫 행만)
      const filtered = prev.filter((l, i) => !(i === 0 && !l.product_id && !l.quantity && prev.length === 1));
      return [...filtered, {
        product_id: r.product_id,
        po_line_id: r.po_line_id,
        quantity: String(qty),
        item_type: r.item_type,
        payment_type: r.payment_type,
        unit_price: r.payment_type === 'free'
          ? ''  // 무상 라인은 단가 없음 — PO의 플레이스홀더 단가를 그대로 쓰지 않음
          : isImport
            ? (() => {
                if (r.unit_price_usd_wp != null) return usdWpToDisplayPrice(r.unit_price_usd_wp, 'cents'); // $/Wp → ¢/Wp
                // $/EA → ¢/Wp 역산 (unit_price_usd_wp 미설정 구레코드 대응)
                if (r.unit_price_usd != null) {
                  const prod = products.find(p => p.product_id === r.product_id);
                  return unitUsdEaToDisplayPrice(r.unit_price_usd, prod?.spec_wp, 'cents');
                }
                return '';
              })()
            : (r.unit_price_krw_wp != null ? String(Math.round(r.unit_price_krw_wp)) : ''),
        manualInvoice: false,
        invoiceOverride: '',
      }];
    });
    // 입력칸 비우기 (반복 추가 방지)
    setPoLineRows(prev => prev.map((row, i) => i === idx ? { ...row, thisShipmentQty: '' } : row));
  };

  const updatePORowQty = (idx: number, v: string) => {
    setPoLineRows(prev => prev.map((row, i) => i === idx ? { ...row, thisShipmentQty: parseIntegerInput(v) } : row));
  };
  const removeLine = (i: number) => setLines(prev => prev.length <= 1 ? prev : prev.filter((_, j) => j !== i));

  const productLabel = (pid: string) => {
    const p = products.find(x => x.product_id === pid);
    return p ? `${p.product_code} | ${p.product_name} | ${p.spec_wp}Wp` : '';
  };
  const calcCapacity = (l: LineItem): number | null => {
    const q = Number(l.quantity);
    const p = products.find(x => x.product_id === l.product_id);
    return (!q || !p) ? null : (q * p.spec_wp) / 1000;
  };
  // 인보이스 자동 계산: 수량 × 규격Wp × 단가($/Wp or ₩/Wp)
  const calcInvoice = (l: LineItem): number | null => {
    if (l.payment_type === 'free') return null; // 무상 라인은 인보이스 금액 없음
    const q = Number(l.quantity);
    const p = products.find(x => x.product_id === l.product_id);
    const pricePerWp = isImport
      ? displayPriceToUsdWp(l.unit_price, priceMode)
      : parseNumericInput(l.unit_price);
    if (!q || !p || !pricePerWp) return null;
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
        const valueUsdWp = displayPriceToUsdWp(l.unit_price, prev);
        if (valueUsdWp == null) return l;
        return { ...l, unit_price: usdWpToDisplayPrice(valueUsdWp, next) };
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
    if (!selPOId) { setSubmitError('PO 연결은 필수입니다'); return; }
    // 실제입항일/납품일: 신규 등록 시에만 강제. 기존 데이터 수정 시에는 빈 값 허용.
    if (!editData && isImport && !data.actual_arrival) { setSubmitError('실제입항일은 필수입니다'); return; }
    if (!editData && isDomestic && !data.actual_arrival) { setSubmitError('납품일은 필수입니다'); return; }
    if (isGroup && !counterpartId) { setSubmitError('상대법인을 선택해주세요'); return; }

    // R3: 해외직수입 + PO 연결 시 LC 필수 + 잔여 검증 (D-095)
    if (isImport && selPOId && !selLCId && !editData) {
      setSubmitError('해외직수입은 LC 선택이 필수입니다');
      return;
    }
    if (selLCId && !editData) {
      const thisMw = lines.reduce((s, l) => {
        const prod = products.find((p) => p.product_id === l.product_id);
        const qty = Number(l.quantity);
        if (!prod || !qty) return s;
        return s + (qty * prod.spec_wp) / 1_000_000;
      }, 0);
      const lc = lcList.find((x) => x.lc_id === selLCId);
      const lcMw = lc?.target_mw ?? 0;
      // 동일 LC의 기존 BL 합산
      try {
        const existingBls = await fetchWithAuth<BLShipment[]>(`/api/v1/bls?lc_id=${selLCId}`).catch(() => []);
        let usedMw = 0;
        for (const bl of existingBls ?? []) {
          try {
            const bls = await fetchWithAuth<{ capacity_kw?: number }[]>(`/api/v1/bls/${bl.bl_id}/lines`);
            for (const bln of bls ?? []) usedMw += (bln.capacity_kw ?? 0) / 1000;
          } catch { /* skip */ }
        }
        if (lcMw > 0 && (usedMw + thisMw) > lcMw + 1e-6) {
          setSubmitError('LC 잔여물량을 초과합니다. LC amend가 필요합니다.');
          return;
        }
      } catch { /* skip */ }
      // F17: PO 잔여 초과는 hard block
      if (poRemaining && thisMw > poRemaining.remainMw + 1e-6) {
        setSubmitError(`PO 잔여물량(${poRemaining.remainMw.toFixed(2)}MW)을 초과합니다. 이번 입고 ${thisMw.toFixed(2)}MW — PO amend 후 재등록해주세요.`);
        return;
      }
    }
    // F17: LC 미연결(국내/그룹)도 PO 잔여 초과 시 차단
    if (!selLCId && !editData && poRemaining) {
      const thisMw = lines.reduce((s, l) => {
        const prod = products.find((p) => p.product_id === l.product_id);
        const qty = Number(l.quantity);
        if (!prod || !qty) return s;
        return s + (qty * prod.spec_wp) / 1_000_000;
      }, 0);
      if (thisMw > poRemaining.remainMw + 1e-6) {
        setSubmitError(`PO 잔여물량(${poRemaining.remainMw.toFixed(2)}MW)을 초과합니다. 이번 입고 ${thisMw.toFixed(2)}MW.`);
        return;
      }
    }
    const validLines = lines.filter(l => l.product_id && Number(l.quantity) > 0);
    if (validLines.length === 0) { setSubmitError('입고 품목을 최소 1개 이상 입력해주세요'); return; }
    // 모든 line의 product가 products 리스트에 로드돼 있는지 확인 (capacity_kw=0 방지)
    const missingProd = validLines.find(l => !products.find(p => p.product_id === l.product_id));
    if (missingProd) { setSubmitError('품번 정보가 로드되지 않았습니다. 잠시 후 다시 시도해주세요'); return; }
    const overPoLine = poLineRows.find(row => {
      const thisBlQty = validLines.reduce((sum, line) => {
        const matchesLine = row.po_line_id && line.po_line_id
          ? row.po_line_id === line.po_line_id
          : row.product_id === line.product_id;
        return matchesLine ? sum + Number(line.quantity) : sum;
      }, 0);
      return row.contracted_qty > 0 && row.shipped_qty + thisBlQty > row.contracted_qty;
    });
    if (overPoLine) {
      const prod = products.find(p => p.product_id === overPoLine.product_id);
      setSubmitError(`${prod ? productLabel(prod.product_id) : '입고 품목'} 수량이 PO 잔여 수량을 초과합니다.`);
      return;
    }

    const blNumber = isImport ? (data.bl_number ?? '') : autoNumber;
    const exRate = data.exchange_rate ? parseFloat(data.exchange_rate) : undefined;

    // 결제조건 계산용 총 구매금액
    const totalAmountForPT = validLines.reduce((s, l) => s + (calcInvoice(l) || 0), 0);

    // 면장 CIF 원화금액 → 유상 Wp 원화단가 계산
    const cifAmountRaw = cifAmountKrwDisplay ? parseInt(cifAmountKrwDisplay.replace(/,/g, ''), 10) : NaN;
    const cifAmountKrwNum = !isNaN(cifAmountRaw) && cifAmountRaw > 0 ? cifAmountRaw : undefined;
    // 유상(paid) 라인의 총 Wp
    const totalPaidWp = validLines
      .filter(l => l.payment_type === 'paid')
      .reduce((s, l) => {
        const prod = products.find(p => p.product_id === l.product_id);
        return s + (prod ? Number(l.quantity) * prod.spec_wp : 0);
      }, 0);
    // Wp 원화단가 = CIF원화금액 / 총유상Wp (소수점 4자리)
    const krwPerWpFromCif = (cifAmountKrwNum && totalPaidWp > 0)
      ? Math.round(cifAmountKrwNum / totalPaidWp * 10000) / 10000
      : undefined;

    const payload: Record<string, unknown> = {
      bl_id: editData?.bl_id,
      bl_number: blNumber,
      po_id: selPOId || undefined,
      lc_id: selLCId || undefined,
      inbound_type: selType,
      company_id: selCompanyId,
      manufacturer_id: selMfgId || undefined,
      counterpart_company_id: isGroup ? counterpartId : undefined,
      currency: isImport ? 'USD' : 'KRW',
      exchange_rate: isImport && exRate && !isNaN(exRate) ? exRate : undefined,
      cif_amount_krw: isImport && cifAmountKrwNum ? cifAmountKrwNum : undefined,
      status: editData?.status ?? initialStatus,
      payment_terms: isImport ? composeImportPT(importPT, totalAmountForPT) : isDomestic ? composeDomesticPT(domesticPT, totalAmountForPT) : undefined,
      etd: isImport && data.etd ? data.etd : undefined,
      eta: isImport && data.eta ? data.eta : undefined,
      actual_arrival: data.actual_arrival || undefined,
      port: isImport && data.port ? data.port : undefined,
      forwarder: isImport && data.forwarder ? data.forwarder : undefined,
      invoice_number: isImport && data.invoice_number ? data.invoice_number : undefined,
      declaration_number: data.declaration_number || undefined,
      incoterms: isImport && data.incoterms
        ? (bafCaf && !/BAF\s*\/\s*CAF/i.test(data.incoterms) ? `${data.incoterms} (BAF/CAF 포함)` : data.incoterms)
        : undefined,
      warehouse_id: selWhId || undefined,
      memo: data.memo || undefined,
      lines: validLines
        .map(l => {
          const prod = products.find(p => p.product_id === l.product_id);
          const qty = Number(l.quantity);
          const price = isImport
            ? displayPriceToUsdWp(l.unit_price, priceMode)
            : parseNumericInput(l.unit_price);
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
            // 해외직수입: CIF원화금액이 있으면 유상라인에만 KRW/Wp 설정 (무상은 0)
            unit_price_krw_wp: isImport
              ? (l.payment_type === 'paid' && krwPerWpFromCif ? krwPerWpFromCif : undefined)
              : (price && !isNaN(price) ? price : undefined),
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
  // 결제조건 섹션은 F16에서 삭제됨 — totalForPT는 더 이상 필요 없음
  const autoCifAmountKrw = isImport && exRateNum > 0 && totalUSD > 0
    ? Math.round(totalUSD * exRateNum)
    : 0;

  useEffect(() => {
    if (!isImport || cifAmountKrwManual) return;
    setCifAmountKrwDisplay(autoCifAmountKrw > 0 ? autoCifAmountKrw.toLocaleString('ko-KR') : '');
  }, [isImport, cifAmountKrwManual, autoCifAmountKrw]);

  /* ── 렌더 ── */
  const mfgName = manufacturers.find(m => m.manufacturer_id === selMfgId)?.name_kr ?? '';
  const coName = companies.find(c => c.company_id === selCompanyId)?.company_name ?? '';
  const whName = warehouses.find(w => w.warehouse_id === selWhId)?.warehouse_name ?? '';
  const cpName = companies.find(c => c.company_id === counterpartId)?.company_name ?? '';
  // PO 발주품목 첫 번째 제품 규격 (드롭다운 "진코솔라 640W" 표시용)
  const firstSpecWp = products.find(x => x.product_id === poLineRows[0]?.product_id)?.spec_wp ?? 0;
  const selPO = poList.find(p => p.po_id === selPOId);
  // PO SelectTrigger 표시 텍스트: 선택 후에는 "진코솔라 640W | PO번호 | MW | 월"
  const poTriggerText = selPO
    ? (firstSpecWp > 0
      ? `${moduleLabel(mfgName, firstSpecWp)} | ${selPO.po_number} | ${(selPO.total_capacity_mw ?? selPO.total_mw ?? 0).toFixed(1)}MW${selPO.contract_date ? ` | ${selPO.contract_date.slice(0, 7)}` : ''}`
      : formatPOLabel(selPO, manufacturers))
    : '';
  // LC SelectTrigger 표시 텍스트: 선택 후에는 "진코솔라 640W | LC번호 | 상태"
  const lcItemLabel = (lc: typeof lcList[number]) => {
    const modPart = firstSpecWp > 0 ? `${moduleLabel(mfgName, firstSpecWp)} | ` : '';
    const bankPart = lc.bank_name ? ` | ${lc.bank_name}` : '';
    return `${modPart}${lc.lc_number ?? lc.lc_id.slice(0, 8)}${bankPart} | ${formatUSD(lc.amount_usd)} | ${LC_STATUS_KR[lc.status] ?? lc.status}`;
  };
  const title = editData ? '입고수정' : '입고등록';
  const reviewRows = pendingCustomsOCRFields ? [
    { label: 'B/L(AWB) 번호', value: pendingCustomsOCRFields.bl_number?.value, target: 'B/L 번호' },
    { label: '입항일', value: pendingCustomsOCRFields.arrival_date?.value, target: '실제입항일' },
    { label: '운송주선인', value: pendingCustomsOCRFields.forwarder?.value, target: '포워더' },
    { label: '국내도착항', value: pendingCustomsOCRFields.port?.value, target: '항구' },
    { label: 'CIF 원화금액', value: pendingCustomsOCRFields.cif_amount_krw?.value, target: '면장 CIF 원화금액' },
    { label: '환율', value: pendingCustomsOCRFields.exchange_rate?.value, target: '환율' },
    { label: '수입자', value: pendingCustomsOCRFields.importer?.value, target: '참고' },
    { label: '무역거래처', value: pendingCustomsOCRFields.trade_partner?.value, target: '참고' },
    { label: '신고일', value: pendingCustomsOCRFields.declaration_date?.value, target: '참고' },
    { label: 'HS코드', value: pendingCustomsOCRFields.hs_code?.value, target: '참고' },
    { label: '세관', value: pendingCustomsOCRFields.customs_office?.value, target: '참고' },
  ].filter((row) => row.value) : [];
  const reviewLineItems = pendingCustomsOCRFields?.line_items ?? [];
  const customsOCRReviewDialog = (
    <Dialog open={customsOCRReviewOpen} onOpenChange={setCustomsOCRReview}>
      <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>OCR 입력값 확인</DialogTitle>
          <DialogDescription>
            {pendingCustomsOCRFile ? `${pendingCustomsOCRFile.name}에서 읽은 값입니다. 맞는 값만 확인한 뒤 입력칸에 반영하세요.` : 'OCR로 읽은 값을 확인한 뒤 입력칸에 반영하세요.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border">
            <div className="grid grid-cols-[120px_minmax(0,1fr)_96px] border-b bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">
              <span>항목</span>
              <span>읽은 값</span>
              <span className="text-right">반영 위치</span>
            </div>
            {reviewRows.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">확인할 기본값이 없습니다</div>
            ) : (
              reviewRows.map((row) => (
                <div key={`${row.label}-${row.value}`} className="grid grid-cols-[120px_minmax(0,1fr)_96px] border-b px-3 py-2 last:border-b-0">
                  <span className="text-xs text-muted-foreground">{row.label}</span>
                  <span className="break-all text-xs font-medium">{row.value}</span>
                  <span className="text-right text-[11px] text-muted-foreground">{row.target}</span>
                </div>
              ))
            )}
          </div>

          <div className="rounded-md border">
            <div className="border-b bg-muted/50 px-3 py-2 text-[11px] font-medium text-muted-foreground">품목 후보</div>
            {reviewLineItems.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">품목 후보가 없습니다</div>
            ) : (
              <div className="divide-y">
                {reviewLineItems.map((item, index) => (
                  <div key={`${item.model_spec?.value ?? 'line'}-${index}`} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_80px_80px_96px]">
                    <span className="break-all font-medium">{item.model_spec?.value ?? '모델 미확인'}</span>
                    <span className="text-right tabular-nums">{item.quantity?.value ? `${Number(item.quantity.value).toLocaleString('ko-KR')} EA` : '-'}</span>
                    <span className="text-right tabular-nums">{item.unit_price_usd?.value ?? '-'}</span>
                    <span className="text-right tabular-nums">{item.amount_usd?.value ? `$${Number(item.amount_usd.value).toLocaleString('en-US')}` : '-'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setCustomsOCRReview(false)}>취소</Button>
          <Button type="button" onClick={confirmCustomsOCRFields}>확인 후 입력칸에 반영</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const formBody = (
    <>
        {embedded ? (
          <div className="flex items-center justify-between gap-3 border-b pb-3">
            <div>
              <p className="text-xs text-muted-foreground">구매 / B/L</p>
              <h2 className="text-lg font-semibold">{title}</h2>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>목록으로</Button>
          </div>
        ) : (
          <DialogHeader className="pb-1">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
        )}

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

          {/* ── D-085: PO 연결 (필수) ── */}
          {!editData && (
            <div className="max-w-md space-y-1.5">
              <Req>P/O 연결</Req>
              <Select value={selPOId || 'none'} onValueChange={(v) => {
                const val = v === 'none' ? '' : (v ?? '');
                setSelPOId(val);
                if (val) {
                  applyPOAutofill(val);
                } else {
                  setAutofilled(false);
                  setPoRemaining(null);
                  setPoLineRows([]);
                }
              }}>
                <SelectTrigger className="w-full">
                  <Txt text={poTriggerText} placeholder="PO를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {/* F15: PO 연결은 필수 — 미선택 옵션 없음 */}
                  {poList.map(p => (
                    <SelectItem key={p.po_id} value={p.po_id}>
                      {formatPOLabel(p, manufacturers)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selPOId && poRemaining && (
                <p className="text-[10px] text-muted-foreground">
                  계약 {poRemaining.contractedMw.toFixed(1)}MW · 선적 {poRemaining.shippedMw.toFixed(1)}MW ·{' '}
                  <span className="text-foreground font-medium">잔여 {poRemaining.remainMw.toFixed(1)}MW</span>
                </p>
              )}
              {/* R3: LC 선택 — 해외직수입에서 PO 선택 시 노출 */}
              {selPOId && selType === 'import' && (
                <div className="mt-2 space-y-1.5">
                  <Label className="text-muted-foreground">LC 연결 (해외직수입 필수)</Label>
                  <Select value={selLCId || 'none'} onValueChange={(v) => setSelLCId(v === 'none' ? '' : (v ?? ''))}>
                    <SelectTrigger className="w-full">
                      <Txt text={(() => { const lc = lcList.find((l) => l.lc_id === selLCId); return lc ? lcItemLabel(lc) : ''; })()} placeholder="LC 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미선택</SelectItem>
                      {lcList.map((lc) => (
                        <SelectItem key={lc.lc_id} value={lc.lc_id}>{lcItemLabel(lc)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
	                    <div
	                      className={`rounded-md border border-dashed p-3 transition-colors sm:col-span-2 lg:col-span-3 xl:col-span-4 ${
	                        customsOCRDragActive ? 'border-primary bg-primary/10' : 'border-muted-foreground/30 bg-muted/40'
	                      } ${customsOCRLoading ? 'opacity-75' : ''}`}
	                      onDragEnter={handleCustomsOCRDragOver}
	                      onDragOver={handleCustomsOCRDragOver}
	                      onDragLeave={handleCustomsOCRDragLeave}
	                      onDrop={handleCustomsOCRDrop}
	                    >
	                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
	                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
	                          customsOCRDragActive ? 'border-primary bg-background text-primary' : 'bg-background text-muted-foreground'
	                        }`}>
	                          <ScanText className={`h-5 w-5 ${customsOCRLoading ? 'animate-pulse' : ''}`} />
	                        </div>
	                        <div className="min-w-0 flex-1">
	                          <div className="text-sm font-medium">면장 PDF/사진 자동채움</div>
	                          <div className={`text-xs ${customsOCRDragActive ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
	                            {customsOCRDragActive ? '여기에 놓으면 바로 읽습니다' : '파일을 이 박스에 끌어다 놓거나 선택하세요'}
	                          </div>
	                        </div>
	                        <Button
	                          type="button"
	                          variant="outline"
	                          size="sm"
	                          className="w-full sm:w-auto"
	                          disabled={customsOCRLoading}
	                          onClick={() => customsOCRInputRef.current?.click()}
	                        >
	                          {customsOCRLoading ? '읽는 중' : '파일 선택'}
	                        </Button>
	                        <input
	                          ref={customsOCRInputRef}
	                          type="file"
	                          accept="application/pdf,image/*,.pdf"
	                          className="hidden"
	                          onChange={(event) => prepareCustomsOCRFile(event.target.files)}
	                        />
	                      </div>
	                      {(customsOCRSummary || customsOCRError) && (
	                        <div className="mt-2 text-xs">
	                          {customsOCRSummary && <span className="text-primary">{customsOCRSummary}</span>}
	                          {customsOCRError && <span className="text-destructive">{customsOCRError}</span>}
	                        </div>
	                      )}
	                    </div>
	                    <div className="space-y-1.5">
	                      <Opt>ETD</Opt>
	                      <DateInput value={watch('etd') ?? ''}
                        onChange={(v) => setValue('etd', v, { shouldDirty: true })} />
                    </div>
                    <div className="space-y-1.5">
                      <Opt>ETA</Opt>
                      <DateInput value={watch('eta') ?? ''}
                        onChange={(v) => setValue('eta', v, { shouldDirty: true })} />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  {isImport || isDomestic
                    ? <Req>{isImport ? '실제입항일' : '납품일'}</Req>
                    : <Opt>입고일</Opt>}
                  <DateInput value={watch('actual_arrival') ?? ''}
                    onChange={(v) => {
                      setValue('actual_arrival', v, { shouldDirty: true });
                      setDeliveryDate(v);
                    }} />
                </div>
                {isImport && (
                  <>
                    <div className="space-y-1.5">
                      <Req>환율 (USD→KRW)</Req>
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
                          setValue('exchange_rate', clamped);
                          setExchangeRateLive(clamped); // 입고품목 KRW 실시간 재계산
                        }}
                        onFocus={() => setExchangeRateDisplay(exchangeRateDisplay.replace(/,/g, ''))}
                        onBlur={() => {
                          const num = parseFloat(exchangeRateDisplay.replace(/,/g, ''));
                          if (!isNaN(num) && num > 0) {
                            setExchangeRateDisplay(num.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            setValue('exchange_rate', String(num));
                            setExchangeRateLive(String(num));
                          }
                        }} />
                      <p className="text-[10px] text-muted-foreground">
                        원가 계산을 위해 면장 환율을 반드시 입력하세요
                      </p>
                    </div>
                    {/* 면장 CIF 원화금액 (부가세·무상분 과세 제외) */}
                    <div className="space-y-1.5">
                      <Req>면장 CIF 원화금액</Req>
                      <Input
                        inputMode="numeric"
                        value={cifAmountKrwDisplay}
                        placeholder="0"
                        className="text-right font-mono"
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const num = raw ? parseInt(raw, 10) : NaN;
                          setCifAmountKrwManual(true);
                          setCifAmountKrwDisplay(!isNaN(num) ? num.toLocaleString('ko-KR') : '');
                        }}
                        onFocus={() => setCifAmountKrwDisplay(prev => prev.replace(/,/g, ''))}
                        onBlur={() => {
                          const raw = cifAmountKrwDisplay.replace(/,/g, '');
                          const num = parseInt(raw, 10);
                          if (!isNaN(num) && num > 0) setCifAmountKrwDisplay(num.toLocaleString('ko-KR'));
                        }}
                      />
                      {(() => {
                        const cifRaw = cifAmountKrwDisplay ? parseInt(cifAmountKrwDisplay.replace(/,/g, ''), 10) : NaN;
                        const paidWp = lines.filter(l => l.payment_type === 'paid').reduce((s, l) => {
                          const prod = products.find(p => p.product_id === l.product_id);
                          return s + (prod && Number(l.quantity) > 0 ? Number(l.quantity) * prod.spec_wp : 0);
                        }, 0);
                        if (!isNaN(cifRaw) && cifRaw > 0 && paidWp > 0) {
                          const krwWp = Math.round(cifRaw / paidWp * 100) / 100;
                          return (
                            <p className="text-[10px] text-primary font-medium">
                              Wp 원화단가 = {krwWp.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 원/Wp
                              {!cifAmountKrwManual ? ' · 자동계산' : ' · 수동수정'}
                            </p>
                          );
                        }
                        return (
                          <p className="text-[10px] text-muted-foreground">
                            부가세 제외 · 무상분 과세 제외 · 환율 입력 시 자동계산 후 수정 가능
                          </p>
                        );
                      })()}
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
                    <div className="space-y-1.5"><Opt>면장번호</Opt><Input {...register('declaration_number')} placeholder="선택사항" /></div>
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

              {/* ── D-087: PO 발주품목 — 기입고/잔여 + 이번입고 입력 ── */}
              {selPOId && poLineRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    <Label className="text-sm font-semibold">PO · LC 발주 현황</Label>
                    <span className="text-[10px] text-muted-foreground">이번 입고(EA) 입력 후 <span className="font-semibold text-foreground">[+]</span> 클릭 → 아래 입고품목으로 추가됩니다</span>
                  </div>
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-2 py-1.5 text-left">품목</th>
                          <th className="px-2 py-1.5 text-center">구분</th>
                          <th className="px-2 py-1.5 text-right">계약(EA)</th>
                          <th className="px-2 py-1.5 text-right">계약(MW)</th>
                          <th className="px-2 py-1.5 text-right">기입고(EA)</th>
                          <th className="px-2 py-1.5 text-right">기입고(MW)</th>
                          <th className="px-2 py-1.5 text-right">잔여(EA)</th>
                          <th className="px-2 py-1.5 text-right">잔여(MW)</th>
                          <th className="px-2 py-1.5 text-center w-40">이번 입고(EA) · 추가</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* LC 현황 요약 행 */}
                        {selLCId && (() => {
                          const lc = lcList.find((l) => l.lc_id === selLCId);
                          if (!lc) return null;
                          const lcTarget = lc.target_qty ?? 0;
                          const lcRemain = Math.max(0, lcTarget - lcShippedQty);
                          const lcTargetMw = lc.target_mw ?? 0;
                          return (
                            <tr className="bg-blue-50 border-b border-blue-200">
                              <td colSpan={9} className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                                  <span className="font-semibold text-blue-700 shrink-0">
                                    LC: {lc.lc_number ?? '—'}
                                  </span>
                                  <span className="text-muted-foreground shrink-0">
                                    {LC_STATUS_KR[lc.status] ?? lc.status} · {formatUSD(lc.amount_usd)}
                                    {lcTargetMw > 0 && ` · ${lcTargetMw.toFixed(2)}MW`}
                                  </span>
                                  {lcTarget > 0 ? (
                                    <>
                                      <span className="text-muted-foreground shrink-0">LC물량 <span className="tabular-nums font-medium text-foreground">{lcTarget.toLocaleString('ko-KR')} EA</span></span>
                                      <span className="text-muted-foreground shrink-0">기입고 <span className="tabular-nums font-medium">{lcShippedQty.toLocaleString('ko-KR')} EA</span></span>
                                      <span className={`shrink-0 font-semibold ${lcRemain <= 0 ? 'text-red-600' : 'text-blue-700'}`}>
                                        잔여 {lcRemain.toLocaleString('ko-KR')} EA
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground text-[10px]">LC에 목표수량 미설정 — LC 편집에서 입력 가능</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                        {poLineRows.map((row, i) => {
                          const p = products.find(x => x.product_id === row.product_id);
                          const specWp = p?.spec_wp ?? 0;
                          const remainQty = row.contracted_qty - row.shipped_qty;
                          const contractedMw = (row.contracted_qty * specWp) / 1_000_000;
                          const shippedMw = (row.shipped_qty * specWp) / 1_000_000;
                          const remainMw = (remainQty * specWp) / 1_000_000;
                          const inputQty = parseInt(row.thisShipmentQty || '0');
                          return (
                            <tr key={i} className="border-t">
                              <td className="px-2 py-1.5">
                                <div className="font-medium text-[11px]">{moduleLabel(mfgName, specWp)}</div>
                                <div className="font-mono text-[10px] text-muted-foreground">{p?.product_code ?? '—'}</div>
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <div className={`inline-flex flex-col items-center gap-0.5`}>
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${row.payment_type === 'free' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {row.payment_type === 'free' ? '무상' : '유상'}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {row.item_type === 'spare' ? '스페어' : '본품'}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-right">{row.contracted_qty.toLocaleString('ko-KR')}</td>
                              <td className="px-2 py-1.5 text-right">{contractedMw.toFixed(3)}</td>
                              <td className="px-2 py-1.5 text-right">{row.shipped_qty.toLocaleString('ko-KR')}</td>
                              <td className="px-2 py-1.5 text-right">{shippedMw.toFixed(3)}</td>
                              <td className="px-2 py-1.5 text-right font-medium">{remainQty.toLocaleString('ko-KR')}</td>
                              <td className="px-2 py-1.5 text-right font-medium">{remainMw.toFixed(3)}</td>
                              <td className="px-2 py-1.5">
                                <div className="flex gap-1 items-center">
                                  <Input className="h-7 text-xs flex-1 min-w-0 bg-amber-50 border-amber-300 focus-visible:ring-amber-400 text-right font-mono tabular-nums" inputMode="numeric" value={formatIntegerInput(row.thisShipmentQty)}
                                    placeholder="0"
                                    onChange={e => updatePORowQty(i, e.target.value)} />
                                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[10px] shrink-0 border-amber-400 hover:bg-amber-100"
                                    disabled={!inputQty}
                                    onClick={() => addLineFromPORow(i)}>
                                    +
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    ① 이번 입고(EA) 란에 수량 입력 → ② <span className="font-semibold">[+]</span> 클릭 → ③ 아래 "입고 품목"에 자동 추가됨. 단가·구분·유무상은 PO에서 자동 복사.
                  </p>
                </div>
              )}

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
                            <Input className="h-9 text-xs text-right font-mono tabular-nums" inputMode="numeric" value={formatIntegerInput(line.quantity)} placeholder="0"
                              onChange={e => updateLine(idx, 'quantity', parseIntegerInput(e.target.value))} />
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
                            <Select value={line.payment_type} onValueChange={v => {
                              const val = v ?? 'paid';
                              setLines(prev => prev.map((l, j) => j === idx
                                ? { ...l, payment_type: val, unit_price: val === 'free' ? '' : l.unit_price }
                                : l));
                            }}>
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
                            <span className={`text-[10px] font-medium ${line.payment_type === 'free' ? 'text-muted-foreground' : 'text-blue-600'}`}>
                              {line.payment_type === 'free' ? '단가 (무상 해당없음)' : isImport ? (priceMode === 'cents' ? '단가(¢/Wp) *' : '단가($/Wp) *') : '단가(원/Wp) *'}
                            </span>
                            <div className="flex gap-1 items-center">
                              <Input
                                className="h-9 text-xs flex-1 min-w-0 text-right font-mono tabular-nums"
                                inputMode={isImport ? 'decimal' : 'numeric'}
                                value={line.unit_price}
                                disabled={line.payment_type === 'free'}
                                placeholder={line.payment_type === 'free' ? '—' : isImport ? (priceMode === 'cents' ? '12.40' : '0.1240') : '200'}
                                onChange={e => {
                                  if (isImport) {
                                    updateLine(idx, 'unit_price', parseDecimalInput(e.target.value, 4));
                                  } else {
                                    const v = e.target.value;
                                    if (v === '' || /^\d+$/.test(v)) updateLine(idx, 'unit_price', v);
                                  }
                                }}
                                onBlur={() => {
                                  if (!isImport || !line.unit_price) return;
                                  const num = parseFloat(line.unit_price);
                                  if (!isNaN(num)) updateLine(idx, 'unit_price', formatDecimalPlain(num, 2, 4));
                                }} />
                              {isImport && line.payment_type !== 'free' && (
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
                                  <Input className="h-9 text-xs flex-1 min-w-0 text-right font-mono tabular-nums" inputMode="decimal"
                                    value={line.invoiceOverride} placeholder="직접 입력"
                                    onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) updateLine(idx, 'invoiceOverride', v); }} />
                                ) : (
                                  <div className="h-9 flex items-center justify-end text-right font-mono tabular-nums text-xs text-muted-foreground bg-muted rounded-md px-2 truncate flex-1 min-w-0">
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
                              <div className="h-9 flex items-center justify-end text-right font-mono tabular-nums text-xs text-muted-foreground bg-muted rounded-md px-2 truncate">
                                {fmtInvoice(line)}
                              </div>
                            )}
                          </div>
                          {/* 라인별 인보이스 KRW(자동) 표시 제거 — 해외직수입의 원가 기준은 면장 CIF 원화금액(SSoT) */}
                          <div className="w-24 space-y-1">
                            <span className="text-[10px] text-muted-foreground font-medium">용량</span>
                            <div className="h-9 flex items-center justify-end text-right font-mono tabular-nums text-xs text-muted-foreground bg-muted rounded-md px-2">
                              {formatCapacityFromKw(calcCapacity(line))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 총 구매금액 — 해외직수입은 USD만 표시 (원화는 면장 CIF 원화금액이 SSoT) */}
                {selMfgId && lines.some(l => l.product_id && Number(l.quantity) > 0) && (
                  <div className="rounded-md border-2 border-primary/20 bg-primary/5 px-3 py-2 flex flex-wrap items-center justify-between gap-4">
                    <span className="text-sm font-semibold">총 구매금액</span>
                    {isImport ? (
                      <span className="text-sm text-right">
                        USD <span className="font-mono font-semibold">${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-right">
                        KRW <span className="font-mono font-semibold">₩{totalKRW.toLocaleString('ko-KR')}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 결제조건 섹션 삭제됨 (F16) — import/domestic/group 모두 숨김 */}
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
    </>
  );

  if (embedded) {
    if (!open) return null;
    return (
      <>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          {formBody}
        </div>
        {customsOCRReviewDialog}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[82vw] sm:max-w-[82vw] max-h-[85vh] overflow-y-auto overflow-x-hidden">
          {formBody}
        </DialogContent>
      </Dialog>
      {customsOCRReviewDialog}
    </>
  );
}
