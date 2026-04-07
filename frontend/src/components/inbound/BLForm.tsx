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

/* ── 해외직수입 결제조건 구조체 (T/T % + L/C days) ── */
interface ImportPT {
  hasDeposit: boolean;
  depositMethod: 'tt' | 'lc';
  depositRate: string;
  balanceDays: string;
}
const defaultImportPT = (): ImportPT => ({
  hasDeposit: false, depositMethod: 'tt', depositRate: '', balanceDays: '90',
});
function composeImportPT(pt: ImportPT): string {
  const bal = `L/C ${pt.balanceDays || '90'}days`;
  if (pt.hasDeposit && pt.depositRate) {
    const m = pt.depositMethod === 'tt' ? 'T/T' : 'L/C';
    return `계약금 ${pt.depositRate}% ${m}, ${bal}`;
  }
  return bal;
}
function parseImportPT(text: string): ImportPT {
  const dep = text.match(/계약금\s*(\d+)%?\s*(T\/T|L\/C)/i);
  const bal = text.match(/L\/C\s*(\d+)\s*days?/i);
  return {
    hasDeposit: !!dep,
    depositMethod: dep?.[2]?.toUpperCase() === 'L/C' ? 'lc' : 'tt',
    depositRate: dep?.[1] ?? '',
    balanceDays: bal?.[1] ?? '90',
  };
}

/* ── 국내구매 결제조건 (선입금 + 신용거래 통합) ──
 * 선입금(현금) X원 + 잔금 신용거래 N일. 선입금 0이면 전액 신용거래.
 */
interface DomesticPT {
  prepayAmount: string;       // 원 단위 정수 문자열
  creditDays: '15' | '20' | '30' | '60' | '90';
}
const defaultDomesticPT = (): DomesticPT => ({ prepayAmount: '', creditDays: '60' });
function composeDomesticPT(pt: DomesticPT): string {
  const amt = parseInt(pt.prepayAmount || '0');
  if (!amt) return `전액 신용거래 ${pt.creditDays}일`;
  return `선입금 ${amt.toLocaleString('ko-KR')}원 + 잔금 신용거래 ${pt.creditDays}일`;
}
function parseDomesticPT(text: string): DomesticPT {
  const amtM = text.match(/선입금\s*([\d,]+)/);
  const daysM = text.match(/신용거래\s*(15|20|30|60|90)/);
  return {
    prepayAmount: amtM?.[1]?.replace(/,/g, '') ?? '',
    creditDays: (daysM?.[1] as DomesticPT['creditDays']) ?? '60',
  };
}

/* ── 날짜 입력 정규화: 20260407 → 2026-04-07 ── */
function normDate8(v: string): string {
  if (!v) return v;
  const digits = v.replace(/\D/g, '');
  if (/^\d{8}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return v;
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
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  editData?: BLShipment | null;
}

export default function BLForm({ open, onOpenChange, onSubmit, editData }: Props) {
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
  const [submitError, setSubmitError] = useState('');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, reset, setValue, getValues, formState: { isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema) as any,
  });

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

  // 국내구매: 제조사 변경 시
  useEffect(() => {
    if (selType !== 'domestic' || !selMfgId || !selCompanyId || editData) return;
    const mfg = manufacturers.find(m => m.manufacturer_id === selMfgId);
    if (mfg) genAutoNumber(mfg.name_kr.slice(0, 2));
  }, [selType, selMfgId, selCompanyId, manufacturers, genAutoNumber, editData]);

  // 그룹내구매: 법인 변경 시
  useEffect(() => {
    if (selType !== 'group' || !selCompanyId || editData) return;
    const co = companies.find(c => c.company_id === selCompanyId);
    if (co) genAutoNumber(co.company_code);
  }, [selType, selCompanyId, companies, genAutoNumber, editData]);

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
      setBafCaf(false); setDeliveryDate('');
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

    const payload: Record<string, unknown> = {
      bl_id: editData?.bl_id,
      bl_number: blNumber,
      inbound_type: selType,
      company_id: selCompanyId,
      manufacturer_id: selMfgId || undefined,
      counterpart_company_id: isGroup ? counterpartId : undefined,
      currency: isImport ? 'USD' : 'KRW',
      exchange_rate: isImport && exRate && !isNaN(exRate) ? exRate : undefined,
      status: editData?.status ?? 'scheduled',
      payment_terms: isImport ? composeImportPT(importPT) : isDomestic ? composeDomesticPT(domesticPT) : undefined,
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
            product_id: l.product_id, quantity: qty,
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

                {/* 구매법인 */}
                <div className="space-y-1.5">
                  <Req>구매법인</Req>
                  <Select value={selCompanyId} onValueChange={handleCompanyChange}>
                    <SelectTrigger className="w-full"><Txt text={coName} /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.company_id} value={c.company_id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 공급사 (전체 입고유형 공통, 그룹은 해외+국내 전체 제조사) */}
                <div className="space-y-1.5">
                    <Req>공급사</Req>
                    <Select value={selMfgId} onValueChange={handleMfgChange}>
                      <SelectTrigger className="w-full"><Txt text={mfgName} /></SelectTrigger>
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
                      <Input type="text" placeholder="YYYY-MM-DD 또는 20260407"
                        {...register('etd', { onBlur: (e) => setValue('etd', normDate8(e.target.value)) })} />
                    </div>
                    <div className="space-y-1.5">
                      <Opt>ETA</Opt>
                      <Input type="text" placeholder="YYYY-MM-DD 또는 20260407"
                        {...register('eta', { onBlur: (e) => setValue('eta', normDate8(e.target.value)) })} />
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  {isImport || isDomestic
                    ? <Req>{isImport ? '실제입항일' : '납품일'}</Req>
                    : <Opt>입고일</Opt>}
                  <Input type="text" placeholder="YYYY-MM-DD 또는 20260407"
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

              {/* 결제조건 — 해외직수입 */}
              {isImport && (
                <div className="space-y-2">
                  <Opt>결제조건</Opt>
                  <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
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
                          <Input className="w-16 h-8 text-sm" inputMode="decimal" value={importPT.depositRate}
                            onChange={e => setImportPT(p => ({ ...p, depositRate: e.target.value.replace(/[^0-9.]/g, '') }))} />
                          <span>%</span>
                        </div>
                      </>
                    )}
                    <span className="text-muted-foreground ml-2">잔금 L/C</span>
                    <div className="flex items-center gap-1">
                      <Input className="w-16 h-8 text-sm" inputMode="numeric" value={importPT.balanceDays}
                        onChange={e => setImportPT(p => ({ ...p, balanceDays: e.target.value.replace(/[^0-9]/g, '') }))} />
                      <span>days</span>
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">{composeImportPT(importPT)}</span>
                  </div>
                </div>
              )}

              {/* 결제조건 — 국내구매 (선입금 통합 + 만기일) */}
              {isDomestic && (
                <div className="space-y-2">
                  <Opt>결제조건</Opt>
                  <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
                    <span className="text-muted-foreground">선입금(현금)</span>
                    <div className="flex items-center gap-1">
                      <Input className="w-32 h-8 text-sm" inputMode="numeric"
                        value={domesticPT.prepayAmount ? parseInt(domesticPT.prepayAmount).toLocaleString('ko-KR') : ''}
                        placeholder="0 (전액 신용시 비움)"
                        onChange={e => setDomesticPT(p => ({ ...p, prepayAmount: e.target.value.replace(/[^0-9]/g, '') }))} />
                      <span>원</span>
                    </div>
                    <span className="text-muted-foreground ml-2">잔금 신용거래</span>
                    <select className="h-8 rounded border px-2 text-sm" value={domesticPT.creditDays}
                      onChange={e => setDomesticPT(p => ({ ...p, creditDays: e.target.value as DomesticPT['creditDays'] }))}>
                      <option value="15">15일</option>
                      <option value="20">20일</option>
                      <option value="30">30일</option>
                      <option value="60">60일</option>
                      <option value="90">90일</option>
                    </select>
                    <span className="ml-auto text-xs text-muted-foreground">{composeDomesticPT(domesticPT)}</span>
                  </div>
                  {deliveryDate && (
                    <p className="text-xs text-muted-foreground pl-1">
                      만기일: <span className="font-medium text-foreground">{calcDueDate(deliveryDate, parseInt(domesticPT.creditDays))}</span>
                      <span className="ml-1">(납품일 {deliveryDate} + {domesticPT.creditDays}일)</span>
                    </p>
                  )}
                </div>
              )}
              {/* 그룹내구매 — 결제조건 숨김 */}

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
                                placeholder={isImport ? (priceMode === 'cents' ? '12.30' : '0.1230') : '200'}
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
                                  const exRaw = getValues('exchange_rate');
                                  const ex = exRaw ? parseFloat(exRaw) : 0;
                                  if (!usd || !ex) return '-';
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
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" disabled={isSubmitting || !selType}>{isSubmitting ? '저장 중...' : '저장'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
